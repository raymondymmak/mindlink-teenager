import assert from "assert";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";
import {
  DEFAULT_CONTEXT_API_URL,
  appendContextToInstruction,
  buildContextQueryFromAnalysis,
  buildContextQueryFromMessages,
  fetchClinicalContext,
  getContextApiUrl,
  withClinicalContext,
} from "../utils/contextApi.js";

assert.ok(DEFAULT_CONTEXT_API_URL.includes("/api/context"));
assert.ok(!DEFAULT_CONTEXT_API_URL.includes("PINECONE"));

const originalUrl = process.env.EXPO_PUBLIC_CONTEXT_API_URL;
delete process.env.EXPO_PUBLIC_CONTEXT_API_URL;
assert.strictEqual(getContextApiUrl(), DEFAULT_CONTEXT_API_URL);

process.env.EXPO_PUBLIC_CONTEXT_API_URL = "https://example.test";
assert.strictEqual(
  getContextApiUrl(),
  "https://example.test/api/context"
);

process.env.EXPO_PUBLIC_CONTEXT_API_URL =
  "https://example.test/api/context/";
assert.strictEqual(
  getContextApiUrl(),
  "https://example.test/api/context"
);

if (originalUrl === undefined) {
  delete process.env.EXPO_PUBLIC_CONTEXT_API_URL;
} else {
  process.env.EXPO_PUBLIC_CONTEXT_API_URL = originalUrl;
}

const query = buildContextQueryFromMessages([
  { role: "model", parts: [{ text: "How are you?" }] },
  { role: "user", parts: [{ text: "School has been exhausting." }] },
  { role: "model", parts: [{ text: "Tell me more." }] },
  { user: { _id: 1 }, text: "I cannot sleep before exams." },
]);
assert.ok(query.includes("School has been exhausting."));
assert.ok(query.includes("I cannot sleep before exams."));
assert.ok(!query.includes("How are you?"));

const analysisQuery = buildContextQueryFromAnalysis({
  themes: ["School / academic pressure"],
  correlations: { tags: ["anxiety"] },
  observationalSignals: [{ id: "sleep", label: "Sleep disruption" }],
  criticalQuote: "I cannot sleep before exams.",
});
assert.ok(analysisQuery.includes("School / academic pressure"));
assert.ok(analysisQuery.includes("Sleep disruption"));

const enriched = appendContextToInstruction(
  "Base instruction",
  "Use HEADSS gently."
);
assert.ok(enriched.startsWith("Base instruction"));
assert.ok(enriched.includes("CLINICAL PROCEDURE CONTEXT"));
assert.ok(enriched.includes("Use HEADSS gently."));
assert.strictEqual(
  appendContextToInstruction("Base instruction", ""),
  "Base instruction"
);

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      context: "Retrieved HEADSS guidance.",
      matches: [{ id: "chunk-1", score: 0.9, text: "Retrieved HEADSS guidance." }],
    }),
  };
};

process.env.EXPO_PUBLIC_CONTEXT_API_URL = "https://mock.example/api/context";
const success = await fetchClinicalContext("exam anxiety sleep");
assert.strictEqual(success.used, true);
assert.strictEqual(success.context, "Retrieved HEADSS guidance.");
assert.strictEqual(success.matches.length, 1);
assert.strictEqual(calls.length, 1);
assert.strictEqual(calls[0].options.method, "POST");
const body = JSON.parse(calls[0].options.body);
assert.deepStrictEqual(Object.keys(body), ["query"]);
assert.strictEqual(body.query, "exam anxiety sleep");
assert.strictEqual(
  calls[0].options.headers.Authorization,
  `Bearer ${process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN || DEFAULT_MINDLINK_API_TOKEN}`
);
assert.ok(calls[0].options.headers["X-MindLink-Token"]);
assert.ok(!JSON.stringify(calls[0]).includes("PINECONE"));

globalThis.fetch = async () => {
  throw new Error("context API down");
};
const down = await fetchClinicalContext("exam anxiety sleep");
assert.strictEqual(down.used, false);
assert.strictEqual(down.context, "");
assert.strictEqual(down.reason, "context API down");

const wrapped = await withClinicalContext(
  "Base instruction",
  "exam anxiety sleep"
);
assert.strictEqual(wrapped.systemInstruction, "Base instruction");
assert.strictEqual(wrapped.contextResult.used, false);

globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({ error: "unavailable" }),
});
const httpFail = await fetchClinicalContext("exam anxiety");
assert.strictEqual(httpFail.used, false);
assert.strictEqual(httpFail.reason, "http-503");

globalThis.fetch = originalFetch;
if (originalUrl === undefined) {
  delete process.env.EXPO_PUBLIC_CONTEXT_API_URL;
} else {
  process.env.EXPO_PUBLIC_CONTEXT_API_URL = originalUrl;
}

console.log("context api unit tests passed");

if (process.env.SKIP_LIVE_CONTEXT === "1") {
  console.log("skipping live context API call");
  process.exit(0);
}

const live = await fetchClinicalContext(
  "HEADSS assessment teenage anxiety Hong Kong"
);
console.log(
  `live context probe used=${live.used} reason=${live.reason} url=${live.url} matches=${live.matches.length}`
);
if (live.used) {
  assert.ok(live.context.length > 0);
}
