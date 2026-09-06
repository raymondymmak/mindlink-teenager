import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.0-flash";
const GEMINI_REST_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export function getGeminiApiKey() {
  const key = (
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ""
  ).trim();
  return key;
}

export function getGeminiModel() {
  return (
    process.env.EXPO_PUBLIC_GEMINI_MODEL ||
    DEFAULT_MODEL
  ).trim();
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
  const response = await ai.models.generateContent({
    model,
    contents,
    config: systemInstruction
      ? { systemInstruction }
      : undefined,
  });
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

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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
 */
export async function generateGeminiText({
  contents,
  systemInstruction,
} = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw missingApiKeyError();
  }

  const model = getGeminiModel();
  const normalized = normalizeContents(contents);
  if (normalized.length === 0) {
    throw new Error("No conversation content was provided to Gemini.");
  }

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
    return generateWithRest({
      apiKey,
      model,
      contents: normalized,
      systemInstruction,
    });
  }
}

export function getGeminiStatusLabel() {
  return isGeminiConfigured()
    ? `Gemini (${getGeminiModel()})`
    : "Local demo (no API key)";
}
