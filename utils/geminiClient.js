import { useEffect, useState } from "react";

export const SAME_ORIGIN_GEMINI_PATH = "/api/gemini";
export const PRODUCTION_GEMINI_API_URL =
  "https://raymondmak-app1.expo.app/api/gemini";
export const DEFAULT_GEMINI_API_URL = PRODUCTION_GEMINI_API_URL;

export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_STANDARD_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_MODEL = "auto";

const DEFAULT_TIMEOUT_MS = 20000;

let configuredCache = null;
let configuredPromise = null;

function normalizeGeminiUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value === SAME_ORIGIN_GEMINI_PATH || /\/api\/gemini\/?$/.test(value)) {
    return value.replace(/\/$/, "") || SAME_ORIGIN_GEMINI_PATH;
  }
  return `${value.replace(/\/$/, "")}${SAME_ORIGIN_GEMINI_PATH}`;
}

/**
 * Resolve this project's Gemini proxy.
 * Web prefers same-origin `/api/gemini`. Never reads Gemini API keys.
 */
export function getGeminiApiUrl() {
  const configured = normalizeGeminiUrl(
    process.env.EXPO_PUBLIC_GEMINI_API_URL || ""
  );
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${SAME_ORIGIN_GEMINI_PATH}`;
  }
  return DEFAULT_GEMINI_API_URL;
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

export function resetGeminiConfiguredCache() {
  configuredCache = null;
  configuredPromise = null;
}

export function isGeminiConfigured() {
  return configuredCache === true;
}

export function missingApiKeyError() {
  const error = new Error(
    "Gemini is not configured on the server. Set GEMINI_KEY (server-only) and restart."
  );
  error.code = "MISSING_API_KEY";
  error.status = 503;
  return error;
}

async function probeGeminiHealth() {
  const url = getGeminiApiUrl();
  const response = await fetch(url, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gemini health check failed (${response.status})`);
  }
  return Boolean(data?.configured);
}

export async function checkGeminiConfigured() {
  if (configuredCache !== null) {
    return configuredCache;
  }
  if (!configuredPromise) {
    configuredPromise = probeGeminiHealth()
      .then((configured) => {
        configuredCache = configured;
        return configured;
      })
      .catch(() => {
        configuredPromise = null;
        return false;
      });
  }
  return configuredPromise;
}

export function useGeminiConfigured() {
  const [state, setState] = useState({
    configured: isGeminiConfigured(),
    ready: configuredCache !== null,
  });

  useEffect(() => {
    let cancelled = false;
    checkGeminiConfigured().then((configured) => {
      if (!cancelled) {
        setState({ configured, ready: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * POST { contents, systemInstruction, task } to this project's /api/gemini.
 * The server holds GEMINI_KEY. The client never embeds or sends an API key.
 */
export async function generateGeminiText({
  contents,
  systemInstruction,
  task = "chat",
} = {}) {
  const url = getGeminiApiUrl();
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction,
        task,
      }),
      signal: controller?.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (typeof data?.configured === "boolean") {
      configuredCache = data.configured;
    }

    if (!response.ok) {
      if (data?.code === "MISSING_API_KEY") {
        configuredCache = false;
        const error = missingApiKeyError();
        if (data?.error) error.message = data.error;
        throw error;
      }
      const error = new Error(
        data?.error || `Gemini API request failed (${response.status})`
      );
      error.code = data?.code || "GEMINI_HTTP_ERROR";
      error.status = response.status;
      throw error;
    }

    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }
    configuredCache = true;
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Gemini request timed out.");
      timeout.code = "TIMEOUT";
      timeout.status = 503;
      throw timeout;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
