import assert from "assert";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_STANDARD_MODEL,
  generateGeminiText,
  getServerGeminiKey,
  isAutoGeminiRouting,
  isServerGeminiConfigured,
  normalizeContents,
  resolveGeminiModel,
} from "../server/geminiGenerate.js";

assert.strictEqual(DEFAULT_GEMINI_MODEL, "auto");
assert.strictEqual(resolveGeminiModel("chat"), GEMINI_LITE_MODEL);
assert.strictEqual(resolveGeminiModel("brief"), GEMINI_STANDARD_MODEL);
assert.strictEqual(isAutoGeminiRouting("auto"), true);
assert.deepStrictEqual(normalizeContents("hello"), [
  { role: "user", parts: [{ text: "hello" }] },
]);

const originalPublic = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const originalGeminiKey = process.env.GEMINI_KEY;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;
process.env.EXPO_PUBLIC_GEMINI_API_KEY = "public-should-never-be-used";
delete process.env.GEMINI_KEY;
delete process.env.GEMINI_API_KEY;
assert.strictEqual(getServerGeminiKey(), "");
assert.strictEqual(isServerGeminiConfigured(), false);

process.env.GEMINI_KEY = "server-secret";
assert.strictEqual(getServerGeminiKey(), "server-secret");
assert.ok(!getServerGeminiKey().includes("public"));

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const urlText = String(url);
  calls.push({ url: urlText, method: options.method || "GET" });
  assert.ok(!urlText.includes("public-should-never-be-used"));
  assert.ok(!urlText.includes("EXPO_PUBLIC"));
  assert.ok(urlText.includes("key=server-secret"));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "pong" }] } }],
    }),
  };
};

const text = await generateGeminiText({
  contents: "Reply with exactly: pong",
  task: "chat",
});
assert.strictEqual(text, "pong");
assert.ok(calls[0].url.includes("gemini-3.5-flash-lite"));
assert.ok(!JSON.stringify(text).includes("server-secret"));

globalThis.fetch = async () => {
  throw new Error("upstream down");
};
await assert.rejects(
  () => generateGeminiText({ contents: "hello" }),
  /upstream down/
);

await assert.rejects(
  () => generateGeminiText({ contents: [] }),
  (error) => error.code === "INVALID_CONTENTS" && error.status === 400
);

globalThis.fetch = originalFetch;
if (originalPublic === undefined) delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
else process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalPublic;
if (originalGeminiKey === undefined) delete process.env.GEMINI_KEY;
else process.env.GEMINI_KEY = originalGeminiKey;
if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = originalGeminiApiKey;

console.log("geminiGenerate unit tests passed");

if (process.env.SKIP_LIVE_GEMINI === "1") {
  console.log("skipping live Gemini generate call");
  process.exit(0);
}

const liveKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
if (!liveKey) {
  console.log("skipping live Gemini generate: missing server key");
  process.exit(0);
}

const live = await generateGeminiText({
  contents: "Reply with exactly: pong",
  task: "chat",
});
assert.ok(live.toLowerCase().includes("pong"), `unexpected live reply: ${live}`);
console.log(`live Gemini generate ok via ${resolveGeminiModel("chat")}`);
