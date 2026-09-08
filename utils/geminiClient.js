import { GoogleGenAI } from "@google/genai";

// Gemini Developer API has no "auto" model id. `auto` is in-app routing:
// chat / check-ins / key points → Flash-Lite; Session Brief → Flash.
// gemini-3.6-flash is still valid but currently quota-exhausted on this key.
export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_STANDARD_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_MODEL = "auto";
const GEMINI_REST_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export function getGeminiApiKey() {
  const key = (
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_KEY ||
    ""
  ).trim();
  return key;
}

function envModelOverride() {
  return (process.env.EXPO_PUBLIC_GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
}

export function isAutoGeminiRouting(value = envModelOverride()) {
  return !value || value.toLowerCase() === "auto";
}

export function resolveGeminiModel(task = "chat") {
  const override = envModelOverride();
  if (!isAutoGeminiRouting(override)) {
    return override;
  }
  return task === "brief" ? GEMINI_STANDARD_MODEL : GEMINI_LITE_MODEL;
}

export function getGeminiModel() {
  return resolveGeminiModel("chat");
}

export function isGeminiConfigured() {
  return Boolean(getGeminiApiKey());
}

export function missingApiKeyError() {
  const error = new Error(
    "Gemini API key is not set. Add EXPO_PUBLIC_GEMINI_API_KEY to a local .env file and restart Expo."
  );
  error.code = "MISSING_API_KEY";
  return error;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = "TIMEOUT";
      error.status = 503;
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isRetryableGeminiError(error) {
  const status = error?.status;
  const message = String(error?.message || "").toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    error?.code === "TIMEOUT" ||
    message.includes("exceeded your current quota") ||
    message.includes("resource_exhausted") ||
    message.includes("high demand") ||
    message.includes("unavailable") ||
    message.includes("timed out")
  );
}

function normalizeContents(contents) {
  if (typeof contents === "string") {
    return [{ role: "user", parts: [{ text: contents }] }];
  }
  if (!Array.isArray(contents)) {
    return [];
  }
  return contents
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { role: "user", parts: [{ text: item }] };
      }
      const text =
        item.parts?.[0]?.text ??
        item.text ??
        (typeof item.parts === "string" ? item.parts : "");
      if (!text) return null;
      return {
        role: item.role === "model" ? "model" : "user",
        parts: [{ text }],
      };
    })
    .filter(Boolean);
}

function extractRestText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

async function generateWithSdk({
  apiKey,
  model,
  contents,
  systemInstruction,
}) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config: systemInstruction
        ? { systemInstruction }
        : undefined,
    }),
    12000,
    `Gemini SDK (${model})`
  );
  return (response?.text || "").trim();
}

async function generateWithRest({
  apiKey,
  model,
  contents,
  systemInstruction,
}) {
  const url = `${GEMINI_REST_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    12000,
    `Gemini REST (${model})`
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API request failed (${response.status})`;
    const error = new Error(message);
    error.code = "GEMINI_HTTP_ERROR";
    error.status = response.status;
    throw error;
  }

  const text = extractRestText(data);
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text;
}

/**
 * Call the Gemini Developer API directly from the Expo app.
 * Prefers `@google/genai`; falls back to the official REST endpoint if the
 * SDK cannot run in this environment (common on React Native).
 *
 * task: "chat" (Flash-Lite) or "brief" (Flash). Ignored when
 * EXPO_PUBLIC_GEMINI_MODEL is a specific model id.
 */
export async function generateGeminiText({
  contents,
  systemInstruction,
  task = "chat",
} = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw missingApiKeyError();
  }

  const preferred = resolveGeminiModel(task);
  const models = [preferred];
  if (isAutoGeminiRouting() && task === "brief" && preferred !== GEMINI_LITE_MODEL) {
    models.push(GEMINI_LITE_MODEL);
  }

  const normalized = normalizeContents(contents);
  if (normalized.length === 0) {
    throw new Error("No conversation content was provided to Gemini.");
  }

  let lastError;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const text = await generateWithSdk({
        apiKey,
        model,
        contents: normalized,
        systemInstruction,
      });
      if (text) return text;
      throw new Error("Gemini SDK returned an empty response.");
    } catch (sdkError) {
      if (sdkError?.code === "MISSING_API_KEY") {
        throw sdkError;
      }
      try {
        return await generateWithRest({
          apiKey,
          model,
          contents: normalized,
          systemInstruction,
        });
      } catch (restError) {
        lastError = restError;
        const hasFallback = index < models.length - 1;
        if (!hasFallback || !isRetryableGeminiError(restError)) {
          throw restError;
        }
      }
    }
  }
  throw lastError || new Error("Gemini request failed.");
}

export function getGeminiStatusLabel() {
  if (!isGeminiConfigured()) {
    return "Local demo (no API key)";
  }
  if (isAutoGeminiRouting()) {
    return `Gemini auto (chat: ${GEMINI_LITE_MODEL} · brief: ${GEMINI_STANDARD_MODEL})`;
  }
  return `Gemini (${resolveGeminiModel("chat")})`;
}
