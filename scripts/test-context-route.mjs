import assert from "assert";
import { POST } from "../app/api/context+api.js";
import { resetApiGuardState } from "../server/apiGuard.js";
import { resetPineconeHostCache } from "../server/retrieveContext.js";

const originalGeminiKey = process.env.GEMINI_KEY;
const originalPineconeKey = process.env.PINECONE_KEY;
const originalPineconeHost = process.env.PINECONE_HOST;
const originalToken = process.env.MINDLINK_API_TOKEN;
const originalIpMax = process.env.MINDLINK_RATE_LIMIT_IP_MAX;
const originalTokenMax = process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX;
const originalWindow = process.env.MINDLINK_RATE_LIMIT_WINDOW_MS;

process.env.MINDLINK_API_TOKEN = "test-mindlink-token";
process.env.MINDLINK_RATE_LIMIT_IP_MAX = "50";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "100";
process.env.MINDLINK_RATE_LIMIT_WINDOW_MS = "600000";
process.env.GEMINI_KEY = "server-gemini";
process.env.PINECONE_KEY = "server-pinecone";
process.env.PINECONE_HOST = "index.example.pinecone.io";
resetApiGuardState();
resetPineconeHostCache();

function authed(init = {}) {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-mindlink-token",
      ...(init.headers || {}),
    },
  };
}

const unauthenticated = await POST(
  new Request("http://localhost/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "HEADSS anxiety" }),
  })
);
assert.strictEqual(unauthenticated.status, 401);
const unauthenticatedBody = await unauthenticated.json();
assert.strictEqual(unauthenticatedBody.code, "UNAUTHORIZED");
assert.strictEqual(unauthenticatedBody.context, "");
assert.deepStrictEqual(unauthenticatedBody.matches, []);

const missingQuery = await POST(
  new Request(
    "http://localhost/api/context",
    authed({
      method: "POST",
      body: JSON.stringify({ query: "   " }),
    })
  )
);
assert.strictEqual(missingQuery.status, 400);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const urlText = String(url);
  assert.ok(!urlText.includes("test-mindlink-token"));
  if (urlText.includes("generativelanguage.googleapis.com")) {
    assert.ok(urlText.includes("key=server-gemini"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        embedding: { values: Array.from({ length: 768 }, () => 0.1) },
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      matches: [
        {
          id: "chunk-1",
          score: 0.91,
          metadata: { text: "Use HEADSS gently." },
        },
      ],
    }),
  };
};

const ok = await POST(
  new Request(
    "http://localhost/api/context",
    authed({
      method: "POST",
      body: JSON.stringify({ query: "HEADSS anxiety" }),
    })
  )
);
assert.strictEqual(ok.status, 200);
const okBody = await ok.json();
assert.ok(okBody.context.includes("HEADSS"));
assert.strictEqual(okBody.matches.length, 1);

resetApiGuardState();
process.env.MINDLINK_RATE_LIMIT_IP_MAX = "2";
let limitedStatus = 0;
let limitedBody = {};
for (let i = 0; i < 3; i += 1) {
  const response = await POST(
    new Request(
      "http://localhost/api/context",
      authed({
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.77" },
        body: JSON.stringify({ query: "HEADSS anxiety" }),
      })
    )
  );
  limitedStatus = response.status;
  limitedBody = await response.json();
}
assert.strictEqual(limitedStatus, 429);
assert.strictEqual(limitedBody.code, "RATE_LIMITED");
assert.strictEqual(limitedBody.context, "");

globalThis.fetch = originalFetch;
if (originalGeminiKey === undefined) delete process.env.GEMINI_KEY;
else process.env.GEMINI_KEY = originalGeminiKey;
if (originalPineconeKey === undefined) delete process.env.PINECONE_KEY;
else process.env.PINECONE_KEY = originalPineconeKey;
if (originalPineconeHost === undefined) delete process.env.PINECONE_HOST;
else process.env.PINECONE_HOST = originalPineconeHost;
if (originalToken === undefined) delete process.env.MINDLINK_API_TOKEN;
else process.env.MINDLINK_API_TOKEN = originalToken;
if (originalIpMax === undefined) delete process.env.MINDLINK_RATE_LIMIT_IP_MAX;
else process.env.MINDLINK_RATE_LIMIT_IP_MAX = originalIpMax;
if (originalTokenMax === undefined) delete process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX;
else process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = originalTokenMax;
if (originalWindow === undefined) delete process.env.MINDLINK_RATE_LIMIT_WINDOW_MS;
else process.env.MINDLINK_RATE_LIMIT_WINDOW_MS = originalWindow;
resetApiGuardState();
resetPineconeHostCache();

console.log("context api route unit tests passed");
