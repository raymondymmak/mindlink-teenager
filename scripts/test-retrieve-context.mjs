import assert from "assert";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  PINECONE_INDEX,
  formatContextPayload,
  matchText,
  resetPineconeHostCache,
  retrieveClinicalContext,
} from "../server/retrieveContext.js";

assert.strictEqual(PINECONE_INDEX, "mindlink-knowledge-base");
assert.strictEqual(EMBEDDING_MODEL, "gemini-embedding-001");
assert.strictEqual(EMBEDDING_DIMENSIONS, 768);

const formatted = formatContextPayload([
  {
    id: "chunk-1",
    score: 0.9,
    metadata: { text: "Use HEADSS gently." },
  },
  { id: "chunk-2", score: 0.1, metadata: { content: "" } },
]);
assert.strictEqual(formatted.matches.length, 1);
assert.ok(formatted.context.includes("HEADSS"));
assert.strictEqual(matchText({ metadata: { chunk: "abc" } }), "abc");

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const urlText = String(url);
  calls.push({ url: urlText, method: options.method || "GET" });
  assert.ok(!urlText.includes("PINECONE_KEY"));
  assert.ok(!JSON.stringify(options.headers || {}).includes("EXPO_PUBLIC"));

  if (urlText.includes("generativelanguage.googleapis.com")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        embedding: { values: Array(EMBEDDING_DIMENSIONS).fill(0.01) },
      }),
    };
  }
  if (urlText.includes("api.pinecone.io/indexes/")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ host: "example.pinecone.io" }),
    };
  }
  if (urlText.includes("/query")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        matches: [
          { id: "chunk-0", score: 0.7, metadata: { text: "Internal HEADSS guidance." } },
        ],
      }),
    };
  }
  throw new Error(`unexpected fetch ${urlText}`);
};

const originalGeminiKey = process.env.GEMINI_KEY;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;
const originalPineconeKey = process.env.PINECONE_KEY;
const originalPineconeApiKey = process.env.PINECONE_API_KEY;
process.env.GEMINI_KEY = "test-gemini";
process.env.PINECONE_KEY = "test-pinecone";
delete process.env.GEMINI_API_KEY;
delete process.env.PINECONE_API_KEY;
const result = await retrieveClinicalContext("exam anxiety");
assert.ok(result.context.includes("HEADSS"));
assert.strictEqual(result.matches[0].id, "chunk-0");
assert.ok(calls.some((call) => call.url.includes("embedContent")));
assert.ok(calls.some((call) => call.url.includes("/query")));
assert.ok(!JSON.stringify(result).includes("test-pinecone"));
assert.ok(!JSON.stringify(result).includes("test-gemini"));

globalThis.fetch = async () => {
  throw new Error("upstream down");
};
await assert.rejects(() => retrieveClinicalContext("exam anxiety"), /upstream down/);

globalThis.fetch = originalFetch;
resetPineconeHostCache();
if (originalGeminiKey === undefined) delete process.env.GEMINI_KEY;
else process.env.GEMINI_KEY = originalGeminiKey;
if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = originalGeminiApiKey;
if (originalPineconeKey === undefined) delete process.env.PINECONE_KEY;
else process.env.PINECONE_KEY = originalPineconeKey;
if (originalPineconeApiKey === undefined) delete process.env.PINECONE_API_KEY;
else process.env.PINECONE_API_KEY = originalPineconeApiKey;
console.log("retrieveContext unit tests passed");

if (process.env.SKIP_LIVE_CONTEXT === "1") {
  console.log("skipping live retrieveContext call");
  process.exit(0);
}

const liveKey = process.env.PINECONE_KEY || process.env.PINECONE_API_KEY;
const liveGemini = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
if (!liveKey || !liveGemini) {
  console.log("skipping live retrieveContext: missing server keys");
  process.exit(0);
}

const live = await retrieveClinicalContext(
  "HEADSS assessment teenage anxiety Hong Kong"
);
assert.ok(live.context.length > 0, "live context should not be empty");
assert.ok(live.matches.length > 0);
assert.ok(!JSON.stringify(live).toLowerCase().includes("pinecone_key"));
console.log(
  `live retrieveContext ok matches=${live.matches.length} contextChars=${live.context.length} firstId=${live.matches[0].id}`
);
