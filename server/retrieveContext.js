/**
 * Server-only Pinecone RAG. Never import this from Expo client screens.
 * Keys stay in process.env (PINECONE_KEY / GEMINI_KEY aliases) — not EXPO_PUBLIC_*.
 */

export const PINECONE_INDEX = "mindlink-knowledge-base";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_TOP_K = 3;

const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

let cachedIndexHost = "";

export function resetPineconeHostCache() {
  cachedIndexHost = "";
}

export function getServerGeminiKey() {
  return (
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
}

export function getServerPineconeKey() {
  return (
    process.env.PINECONE_KEY ||
    process.env.PINECONE_API_KEY ||
    ""
  ).trim();
}

export function getPineconeIndexName() {
  return (process.env.PINECONE_INDEX || PINECONE_INDEX).trim();
}

function configuredIndexHost() {
  return (
    process.env.PINECONE_HOST ||
    process.env.PINECONE_INDEX_HOST ||
    cachedIndexHost ||
    ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export function matchText(match) {
  const metadata = match?.metadata || {};
  return String(
    metadata.text || metadata.content || metadata.chunk || match?.text || ""
  ).trim();
}

export function formatContextPayload(matches = []) {
  const normalized = (Array.isArray(matches) ? matches : [])
    .map((match) => ({
      id: match?.id || "",
      score: typeof match?.score === "number" ? match.score : 0,
      text: matchText(match),
    }))
    .filter((match) => match.text);
  return {
    context: normalized.map((match) => match.text).join("\n\n"),
    matches: normalized,
  };
}

async function embedQuery(query, apiKey) {
  const url = `${GEMINI_EMBED_URL}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: query }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini embed failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = "EMBED_FAILED";
    throw error;
  }
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini embed returned no values.");
  }
  return values;
}

async function resolvePineconeHost(apiKey) {
  const existing = configuredIndexHost();
  if (existing) return existing;

  const indexName = getPineconeIndexName();
  const response = await fetch(
    `https://api.pinecone.io/indexes/${encodeURIComponent(indexName)}`,
    {
      headers: {
        "Api-Key": apiKey,
        Accept: "application/json",
      },
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data?.message || `Pinecone describe failed (${response.status})`
    );
    error.status = response.status;
    error.code = "PINECONE_DESCRIBE_FAILED";
    throw error;
  }
  const host = String(data?.host || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!host) {
    throw new Error("Pinecone index host was empty.");
  }
  cachedIndexHost = host;
  return host;
}

async function queryPinecone(vector, apiKey, topK) {
  const host = await resolvePineconeHost(apiKey);
  const response = await fetch(`https://${host}/query`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Pinecone-API-Version": "2025-04",
    },
    body: JSON.stringify({
      vector,
      topK,
      includeMetadata: true,
      includeValues: false,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data?.message || `Pinecone query failed (${response.status})`
    );
    error.status = response.status;
    error.code = "PINECONE_QUERY_FAILED";
    throw error;
  }
  return Array.isArray(data?.matches) ? data.matches : [];
}

/**
 * Embed query with Gemini and retrieve chunks from Pinecone.
 * Returns { context, matches } — never includes secrets.
 */
export async function retrieveClinicalContext(query, { topK = DEFAULT_TOP_K } = {}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    const error = new Error("query is required");
    error.status = 400;
    error.code = "INVALID_QUERY";
    throw error;
  }

  const geminiKey = getServerGeminiKey();
  const pineconeKey = getServerPineconeKey();
  if (!geminiKey) {
    const error = new Error("GEMINI_KEY or GEMINI_API_KEY is not set on the server.");
    error.status = 500;
    error.code = "MISSING_GEMINI_KEY";
    throw error;
  }
  if (!pineconeKey) {
    const error = new Error(
      "PINECONE_KEY or PINECONE_API_KEY is not set on the server."
    );
    error.status = 500;
    error.code = "MISSING_PINECONE_KEY";
    throw error;
  }

  const vector = await embedQuery(trimmed, geminiKey);
  const matches = await queryPinecone(vector, pineconeKey, topK);
  return formatContextPayload(matches);
}
