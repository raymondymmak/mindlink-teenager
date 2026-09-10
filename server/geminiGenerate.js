/**
 * Server-only Gemini generateContent. Never import this from Expo client screens.
 * Uses GEMINI_KEY / GEMINI_API_KEY only — never EXPO_PUBLIC_GEMINI_API_KEY.
 */

import { getServerGeminiKey, isServerGeminiConfigured } from "./secrets.js";

export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_STANDARD_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_MODEL = "auto";
export const MAX_GEMINI_BODY_CHARS = 200000;

const GEMINI_REST_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const ALLOWED_MODEL = /^gemini-[\w.-]+$/;

function envModelOverride() {
  return (
    process.env.GEMINI_MODEL ||
    process.env.EXPO_PUBLIC_GEMINI_MODEL ||
    DEFAULT_GEMINI_MODEL
  ).trim();
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

export { getServerGeminiKey, isServerGeminiConfigured };

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

export function normalizeContents(contents) {
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

function sanitizeErrorMessage(message) {
  return String(message || "Gemini request failed.").replace(
    /(?:AIza|AQ\.)[A-Za-z0-9_-]+/g,
    "[redacted]"
  );
}

function missingApiKeyError() {
  const error = new Error(
    "Gemini API key is not set on the server. Set GEMINI_KEY (or GEMINI_API_KEY) as a server secret."
  );
  error.code = "MISSING_API_KEY";
  error.status = 503;
  return error;
}

function resolveRequestedModel(task, model) {
  const requested = String(model || "").trim();
  if (requested && ALLOWED_MODEL.test(requested)) {
    return requested;
  }
  return resolveGeminiModel(task === "brief" ? "brief" : "chat");
}

async function generateWithRest({ apiKey, model, contents, systemInstruction }) {
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
    const message = sanitizeErrorMessage(
      data?.error?.message || `Gemini API request failed (${response.status})`
    );
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
 * Generate text with the server Gemini key.
 * task: "chat" (Flash-Lite) or "brief" (Flash). Ignored when GEMINI_MODEL
 * (or EXPO_PUBLIC_GEMINI_MODEL on the server) is a specific model id.
 * Never returns the API key.
 */
export async function generateGeminiText({
  contents,
  systemInstruction,
  task = "chat",
  model,
} = {}) {
  const apiKey = getServerGeminiKey();
  if (!apiKey) {
    throw missingApiKeyError();
  }

  const preferred = resolveRequestedModel(task, model);
  const models = [preferred];
  if (
    !model &&
    isAutoGeminiRouting() &&
    task === "brief" &&
    preferred !== GEMINI_LITE_MODEL
  ) {
    models.push(GEMINI_LITE_MODEL);
  }

  const normalized = normalizeContents(contents);
  if (normalized.length === 0) {
    const error = new Error("No conversation content was provided to Gemini.");
    error.code = "INVALID_CONTENTS";
    error.status = 400;
    throw error;
  }

  const instruction =
    typeof systemInstruction === "string"
      ? systemInstruction
      : systemInstruction?.parts?.[0]?.text || "";

  let lastError;
  for (let index = 0; index < models.length; index += 1) {
    const candidate = models[index];
    try {
      return await generateWithRest({
        apiKey,
        model: candidate,
        contents: normalized,
        systemInstruction: instruction || undefined,
      });
    } catch (restError) {
      lastError = restError;
      const hasFallback = index < models.length - 1;
      if (!hasFallback || !isRetryableGeminiError(restError)) {
        throw restError;
      }
    }
  }
  throw lastError || new Error("Gemini request failed.");
}
