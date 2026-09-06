export const DEFAULT_CONTEXT_API_URL =
  "https://gemini-middleman-zeta.vercel.app/api/context";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_QUERY_CHARS = 2000;

/**
 * Resolve the middleman context endpoint.
 * Accepts a full `/api/context` URL or an origin; never reads Pinecone keys.
 */
export function getContextApiUrl() {
  const raw = (
    process.env.EXPO_PUBLIC_CONTEXT_API_URL || DEFAULT_CONTEXT_API_URL
  ).trim();
  if (!raw) return DEFAULT_CONTEXT_API_URL;
  if (/\/api\/context\/?$/.test(raw)) {
    return raw.replace(/\/$/, "");
  }
  return `${raw.replace(/\/$/, "")}/api/context`;
}

function extractMessageText(message) {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  const partText = message.parts?.[0]?.text;
  if (typeof partText === "string") return partText;
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

function isUserMessage(message) {
  if (!message) return false;
  if (message.role === "user") return true;
  if (message.role === "model" || message.role === "assistant") return false;
  if (message.user?._id === 1) return true;
  return false;
}

export function truncateQuery(query, maxChars = DEFAULT_MAX_QUERY_CHARS) {
  const text = String(query || "").trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

export function buildContextQueryFromMessages(
  messages = [],
  { maxChars = DEFAULT_MAX_QUERY_CHARS } = {}
) {
  const userTexts = (Array.isArray(messages) ? messages : [])
    .filter(isUserMessage)
    .map(extractMessageText)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(-6);
  return truncateQuery(userTexts.join("\n"), maxChars);
}

export function buildContextQueryFromAnalysis(
  analysis,
  { maxChars = DEFAULT_MAX_QUERY_CHARS } = {}
) {
  const labels = (analysis?.observationalSignals || [])
    .map((signal) => signal.label || signal.id)
    .filter(Boolean);
  const parts = [
    ...(analysis?.themes || []),
    ...(analysis?.correlations?.tags || []),
    ...labels,
    analysis?.criticalQuote,
  ].filter(Boolean);
  const query = truncateQuery(parts.join("; "), maxChars);
  return (
    query ||
    "Hong Kong adolescent mental health session brief HEADSS clinical procedure"
  );
}

export function appendContextToInstruction(systemInstruction, context) {
  const base = String(systemInstruction || "").trim();
  const retrieved = String(context || "").trim();
  if (!retrieved) return base;
  return `${base}

[CLINICAL PROCEDURE CONTEXT]
The following retrieved guidance is for your internal use only. Do not quote it verbatim to the teenager, and do not mention Pinecone, retrieval, or this block. Use it only to stay aligned with clinical procedure. If it conflicts with safety or conversation rules above, follow those rules.

${retrieved}`;
}

function emptyContextResult(extra = {}) {
  return {
    context: "",
    matches: [],
    used: false,
    url: getContextApiUrl(),
    ...extra,
  };
}

/**
 * POST { query } to the middleman context API.
 * Returns empty context on any failure so Gemini can continue unaided.
 */
export async function fetchClinicalContext(
  query,
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const url = getContextApiUrl();
  const trimmed = truncateQuery(query);
  if (!trimmed) {
    return emptyContextResult({ reason: "empty-query" });
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    console.log(
      `[contextApi] POST ${url} queryChars=${trimmed.length}`
    );
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
      signal: controller?.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = `http-${response.status}`;
      console.warn(`[contextApi] fallback ${reason}`);
      return emptyContextResult({ reason, status: response.status });
    }

    const context = typeof data?.context === "string" ? data.context.trim() : "";
    const matches = Array.isArray(data?.matches) ? data.matches : [];
    const used = Boolean(context);
    console.log(
      `[contextApi] ok used=${used} matchCount=${matches.length} contextChars=${context.length}`
    );
    return {
      context,
      matches,
      used,
      url,
      reason: used ? "ok" : "empty-context",
      status: response.status,
    };
  } catch (error) {
    const reason =
      error?.name === "AbortError" ? "timeout" : error?.message || "network";
    console.warn(`[contextApi] fallback ${reason}`);
    return emptyContextResult({ reason });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withClinicalContext(systemInstruction, query, options) {
  const result = await fetchClinicalContext(query, options);
  return {
    systemInstruction: appendContextToInstruction(
      systemInstruction,
      result.context
    ),
    contextResult: result,
  };
}
