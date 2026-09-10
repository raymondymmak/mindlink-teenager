import assert from "assert";
import { GET, POST } from "../app/api/gemini+api.js";

const originalGeminiKey = process.env.GEMINI_KEY;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;
const originalPublic = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
delete process.env.GEMINI_KEY;
delete process.env.GEMINI_API_KEY;
process.env.EXPO_PUBLIC_GEMINI_API_KEY = "public-should-never-be-used";

const unconfigured = await GET();
assert.strictEqual(unconfigured.status, 200);
const unconfiguredBody = await unconfigured.json();
assert.strictEqual(unconfiguredBody.configured, false);
assert.ok(!JSON.stringify(unconfiguredBody).includes("public-should-never-be-used"));

const unconfiguredHealth = await POST(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ health: true }),
  })
);
assert.strictEqual((await unconfiguredHealth.json()).configured, false);

const missing = await POST(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: "hello", task: "chat" }),
  })
);
assert.strictEqual(missing.status, 503);
const missingBody = await missing.json();
assert.strictEqual(missingBody.code, "MISSING_API_KEY");
assert.strictEqual(missingBody.configured, false);
assert.ok(!JSON.stringify(missingBody).includes("public-should-never-be-used"));

const rejectedKey = await POST(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: "hello", apiKey: "nope" }),
  })
);
assert.strictEqual(rejectedKey.status, 400);
assert.strictEqual((await rejectedKey.json()).code, "KEY_NOT_ALLOWED");

process.env.GEMINI_KEY = "server-secret";
const originalFetch = globalThis.fetch;
let geminiCalls = 0;
globalThis.fetch = async (url) => {
  geminiCalls += 1;
  assert.ok(String(url).includes("key=server-secret"));
  assert.ok(!String(url).includes("public-should-never-be-used"));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "hello from gemini" }] } }],
    }),
  };
};

const healthPost = await POST(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ health: true }),
  })
);
assert.strictEqual(healthPost.status, 200);
assert.strictEqual((await healthPost.json()).configured, true);
assert.strictEqual(geminiCalls, 0);

const ok = await POST(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: "hello",
      systemInstruction: "Be brief.",
      task: "chat",
    }),
  })
);
assert.strictEqual(ok.status, 200);
const okBody = await ok.json();
assert.strictEqual(okBody.text, "hello from gemini");
assert.ok(!JSON.stringify(okBody).includes("server-secret"));

globalThis.fetch = originalFetch;
if (originalGeminiKey === undefined) delete process.env.GEMINI_KEY;
else process.env.GEMINI_KEY = originalGeminiKey;
if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = originalGeminiApiKey;
if (originalPublic === undefined) delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
else process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalPublic;

console.log("gemini api route unit tests passed");
