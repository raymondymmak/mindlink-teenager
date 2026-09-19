import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";
import {
  DEFAULT_GEMINI_API_URL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_STANDARD_MODEL,
  checkGeminiConfigured,
  generateGeminiText,
  getGeminiApiUrl,
  getGeminiModel,
  isAutoGeminiRouting,
  isGeminiConfigured,
  missingApiKeyError,
  resetGeminiConfiguredCache,
  resolveGeminiModel,
} from "../utils/geminiClient.js";

const clientSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../utils/geminiClient.js"),
  "utf8"
);
assert.ok(!clientSource.includes("EXPO_PUBLIC_GEMINI_API_KEY"));
assert.ok(!clientSource.includes("process.env.GEMINI_KEY"));
assert.ok(!clientSource.includes("process.env.GEMINI_API_KEY"));
assert.ok(!clientSource.includes("GoogleGenAI"));
assert.ok(!clientSource.includes("generativelanguage.googleapis.com"));
assert.ok(clientSource.includes("mindLinkApiHeaders"));

assert.strictEqual(DEFAULT_GEMINI_MODEL, "auto");
assert.strictEqual(GEMINI_LITE_MODEL, "gemini-3.5-flash-lite");
assert.strictEqual(GEMINI_STANDARD_MODEL, "gemini-3.5-flash");
assert.ok(!GEMINI_LITE_MODEL.includes("2.0-flash"));
assert.ok(!GEMINI_STANDARD_MODEL.includes("2.0-flash"));
assert.ok(DEFAULT_GEMINI_API_URL.includes("/api/gemini"));
assert.ok(!DEFAULT_GEMINI_API_URL.includes("EXPO_PUBLIC_GEMINI_API_KEY"));

const originalModel = process.env.EXPO_PUBLIC_GEMINI_MODEL;
delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
assert.strictEqual(isAutoGeminiRouting(), true);
assert.strictEqual(resolveGeminiModel("chat"), GEMINI_LITE_MODEL);
assert.strictEqual(resolveGeminiModel("brief"), GEMINI_STANDARD_MODEL);
assert.strictEqual(getGeminiModel(), GEMINI_LITE_MODEL);

process.env.EXPO_PUBLIC_GEMINI_MODEL = "auto";
assert.strictEqual(resolveGeminiModel("chat"), GEMINI_LITE_MODEL);
assert.strictEqual(resolveGeminiModel("brief"), GEMINI_STANDARD_MODEL);

process.env.EXPO_PUBLIC_GEMINI_MODEL = "gemini-3.5-flash-lite";
assert.strictEqual(isAutoGeminiRouting(), false);
assert.strictEqual(resolveGeminiModel("brief"), "gemini-3.5-flash-lite");
assert.strictEqual(getGeminiModel(), "gemini-3.5-flash-lite");

if (originalModel === undefined) {
  delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
} else {
  process.env.EXPO_PUBLIC_GEMINI_MODEL = originalModel;
}

const originalUrl = process.env.EXPO_PUBLIC_GEMINI_API_URL;
delete process.env.EXPO_PUBLIC_GEMINI_API_URL;
assert.strictEqual(getGeminiApiUrl(), DEFAULT_GEMINI_API_URL);
process.env.EXPO_PUBLIC_GEMINI_API_URL = "https://example.test";
assert.strictEqual(getGeminiApiUrl(), "https://example.test/api/gemini");
if (originalUrl === undefined) {
  delete process.env.EXPO_PUBLIC_GEMINI_API_URL;
} else {
  process.env.EXPO_PUBLIC_GEMINI_API_URL = originalUrl;
}

resetGeminiConfiguredCache();
assert.strictEqual(isGeminiConfigured(), false);
assert.strictEqual(missingApiKeyError().code, "MISSING_API_KEY");

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || "GET", options });
  const payload = JSON.stringify(options);
  assert.ok(!payload.includes("AIza"));
  assert.ok(!payload.includes("AQ."));
  assert.ok(!payload.includes("EXPO_PUBLIC_GEMINI_API_KEY"));
  if ((options.method || "GET") === "GET") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ configured: true, model: GEMINI_LITE_MODEL }),
    };
  }
  const body = JSON.parse(options.body);
  assert.ok(!("apiKey" in body));
  assert.ok(!("key" in body));
  if (body.health === true) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ configured: true, model: GEMINI_LITE_MODEL }),
    };
  }
  assert.strictEqual(body.task, "chat");
  return {
    ok: true,
    status: 200,
    json: async () => ({ text: "pong", configured: true }),
  };
};

process.env.EXPO_PUBLIC_GEMINI_API_URL = "https://mock.example/api/gemini";
resetGeminiConfiguredCache();
const configured = await checkGeminiConfigured();
assert.strictEqual(configured, true);
assert.strictEqual(isGeminiConfigured(), true);
assert.strictEqual(calls[0].method, "POST");
const healthBody = JSON.parse(calls[0].options.body);
assert.strictEqual(healthBody.health, true);
assert.strictEqual(
  calls[0].options.headers.Authorization,
  `Bearer ${process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN || DEFAULT_MINDLINK_API_TOKEN}`
);
assert.ok(calls[0].options.headers["X-MindLink-Token"]);

const text = await generateGeminiText({
  contents: "Reply with exactly: pong",
  task: "chat",
});
assert.ok(text.toLowerCase().includes("pong"), `unexpected reply: ${text}`);
assert.strictEqual(calls[1].method, "POST");
const postBody = JSON.parse(calls[1].options.body);
assert.strictEqual(postBody.task, "chat");
assert.ok("contents" in postBody);
assert.ok(!("apiKey" in postBody));
assert.ok(!("key" in postBody));

globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({
    error: "Gemini API key is not set on the server.",
    code: "MISSING_API_KEY",
    configured: false,
  }),
});
resetGeminiConfiguredCache();
await assert.rejects(
  () => generateGeminiText({ contents: "hello" }),
  (error) => error.code === "MISSING_API_KEY"
);
assert.strictEqual(isGeminiConfigured(), false);

globalThis.fetch = originalFetch;
if (originalUrl === undefined) {
  delete process.env.EXPO_PUBLIC_GEMINI_API_URL;
} else {
  process.env.EXPO_PUBLIC_GEMINI_API_URL = originalUrl;
}
resetGeminiConfiguredCache();

console.log("gemini client unit tests passed");
