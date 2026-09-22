import assert from "assert";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";
import {
  DEFAULT_RATE_LIMIT_IP_MAX,
  DEFAULT_RATE_LIMIT_TOKEN_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  claimRateSlot,
  clearMemoryBucketsForTests,
  evaluateApiGuard,
  extractApiToken,
  getClientIp,
  getExpectedApiToken,
  getRateLimitConfig,
  isEdgeCacheHit,
  resetApiGuardState,
  tokensMatch,
} from "../server/apiGuard.js";

const originalToken = process.env.MINDLINK_API_TOKEN;
const originalIpMax = process.env.MINDLINK_RATE_LIMIT_IP_MAX;
const originalTokenMax = process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX;
const originalWindow = process.env.MINDLINK_RATE_LIMIT_WINDOW_MS;

delete process.env.MINDLINK_API_TOKEN;
assert.strictEqual(getExpectedApiToken(), DEFAULT_MINDLINK_API_TOKEN);
assert.strictEqual(DEFAULT_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
assert.strictEqual(DEFAULT_RATE_LIMIT_IP_MAX, 30);
assert.strictEqual(DEFAULT_RATE_LIMIT_TOKEN_MAX, 120);

process.env.MINDLINK_API_TOKEN = "custom-gate";
assert.strictEqual(getExpectedApiToken(), "custom-gate");
assert.ok(tokensMatch("custom-gate", "custom-gate"));
assert.ok(!tokensMatch("custom-gate", "other"));
assert.ok(!tokensMatch("", "custom-gate"));

const bearerRequest = new Request("http://localhost/api/gemini", {
  headers: { Authorization: "Bearer custom-gate" },
});
assert.strictEqual(extractApiToken(bearerRequest), "custom-gate");

const headerRequest = new Request("http://localhost/api/gemini", {
  headers: { "X-MindLink-Token": "header-gate" },
});
assert.strictEqual(extractApiToken(headerRequest), "header-gate");

const ipRequest = new Request("http://localhost/api/gemini", {
  headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
});
assert.strictEqual(getClientIp(ipRequest), "10.0.0.1");

const cloudflareIp = new Request("http://localhost/api/gemini", {
  headers: {
    "cf-connecting-ip": "203.0.113.8",
    "x-forwarded-for": "198.51.100.1",
  },
});
assert.strictEqual(getClientIp(cloudflareIp), "203.0.113.8");

process.env.MINDLINK_RATE_LIMIT_IP_MAX = "3";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "10";
process.env.MINDLINK_RATE_LIMIT_WINDOW_MS = "600000";
assert.deepStrictEqual(getRateLimitConfig(), {
  windowMs: 600000,
  ipMax: 3,
  tokenMax: 10,
});

resetApiGuardState();
const unauth = await evaluateApiGuard(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.2" },
  })
);
assert.strictEqual(unauth.ok, false);
assert.strictEqual(unauth.status, 401);
assert.strictEqual(unauth.body.code, "UNAUTHORIZED");
assert.strictEqual(unauth.headers["Cache-Control"], "no-store");

const authedInit = {
  method: "POST",
  headers: {
    Authorization: "Bearer custom-gate",
    "x-forwarded-for": "198.51.100.3",
  },
};
assert.strictEqual((await evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit))).ok, true);
assert.strictEqual((await evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit))).ok, true);
assert.strictEqual((await evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit))).ok, true);
const fourth = await evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit));
assert.strictEqual(fourth.ok, false);
assert.strictEqual(fourth.status, 429);
assert.strictEqual(fourth.body.code, "RATE_LIMITED");
assert.ok(fourth.body.retryAfter >= 1);
assert.strictEqual(fourth.headers["Retry-After"], String(fourth.body.retryAfter));
assert.strictEqual(fourth.headers["Cache-Control"], "no-store");

resetApiGuardState();
process.env.MINDLINK_RATE_LIMIT_IP_MAX = "50";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "2";
const tokenInit = {
  method: "POST",
  headers: {
    Authorization: "Bearer custom-gate",
    "x-forwarded-for": "203.0.113.10",
  },
};
assert.strictEqual((await evaluateApiGuard(new Request("http://localhost/api/context", tokenInit))).ok, true);
assert.strictEqual((await evaluateApiGuard(new Request("http://localhost/api/context", tokenInit))).ok, true);
const tokenLimited = await evaluateApiGuard(
  new Request("http://localhost/api/context", tokenInit)
);
assert.strictEqual(tokenLimited.status, 429);
assert.strictEqual(tokenLimited.body.limit, 2);

resetApiGuardState();
process.env.MINDLINK_RATE_LIMIT_IP_MAX = "2";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "20";
const durableInit = {
  method: "POST",
  headers: {
    Authorization: "Bearer custom-gate",
    "x-forwarded-for": "192.0.2.40",
  },
};
assert.strictEqual(
  (await evaluateApiGuard(new Request("http://localhost/api/gemini", durableInit))).ok,
  true
);
clearMemoryBucketsForTests();
assert.strictEqual(
  (await evaluateApiGuard(new Request("http://localhost/api/gemini", durableInit))).ok,
  true
);
clearMemoryBucketsForTests();
const durableLimited = await evaluateApiGuard(
  new Request("http://localhost/api/gemini", durableInit)
);
assert.strictEqual(durableLimited.status, 429);
assert.strictEqual(durableLimited.headers["X-RateLimit-Source"], "file");
assert.ok(durableLimited.headers["X-RateLimit-Persist"].includes("file"));

resetApiGuardState();
const cacheStore = new Map();
globalThis.caches = {
  async open() {
    return {
      async match(request) {
        const hit = cacheStore.get(request.url);
        return hit ? new Response(hit) : undefined;
      },
      async put(request, response) {
        cacheStore.set(request.url, await response.text());
      },
    };
  },
};
process.env.MINDLINK_RATE_LIMIT_IP_MAX = "1";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "20";
const cacheInit = {
  method: "POST",
  headers: {
    Authorization: "Bearer custom-gate",
    "x-forwarded-for": "192.0.2.41",
  },
};
assert.strictEqual(
  (await evaluateApiGuard(new Request("http://localhost/api/gemini", cacheInit))).ok,
  true
);
resetApiGuardState();
const fromCache = await evaluateApiGuard(
  new Request("http://localhost/api/gemini", cacheInit)
);
assert.strictEqual(fromCache.status, 429);
assert.strictEqual(fromCache.headers["X-RateLimit-Source"], "cache");
assert.ok(fromCache.headers["X-RateLimit-Persist"].includes("cache"));
delete globalThis.caches;

assert.strictEqual(isEdgeCacheHit("EAS; fwd=miss"), false);
assert.strictEqual(isEdgeCacheHit("EAS; fwd=hit"), true);
assert.strictEqual(isEdgeCacheHit(""), false);

const slotCalls = [];
const slotResult = await claimRateSlot({
  origin: "https://example.test",
  scope: "ip:abc",
  max: 3,
  windowMs: 600000,
  now: 1_700_000_000_000,
  fetchImpl: async (url, init) => {
    slotCalls.push(init.body);
    const slot = JSON.parse(init.body).slot;
    const hit = slot === 0;
    return {
      headers: {
        get(name) {
          if (String(name).toLowerCase() === "cache-status") {
            return hit ? "EAS; fwd=hit" : "EAS; fwd=miss";
          }
          return null;
        },
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    };
  },
});
assert.strictEqual(slotCalls.length, 2);
assert.strictEqual(slotResult.limited, false);
assert.strictEqual(slotResult.slot, 1);
assert.strictEqual(slotResult.remaining, 1);
assert.strictEqual(slotResult.source, "edge");

const exhausted = await claimRateSlot({
  origin: "https://example.test",
  scope: "ip:abc",
  max: 2,
  windowMs: 600000,
  now: 1_700_000_000_000,
  fetchImpl: async () => ({
    headers: { get: () => "EAS; fwd=hit" },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    },
  }),
});
assert.strictEqual(exhausted.limited, true);
assert.strictEqual(exhausted.remaining, 0);
assert.ok(exhausted.retryAfter >= 1);

if (originalToken === undefined) delete process.env.MINDLINK_API_TOKEN;
else process.env.MINDLINK_API_TOKEN = originalToken;
if (originalIpMax === undefined) delete process.env.MINDLINK_RATE_LIMIT_IP_MAX;
else process.env.MINDLINK_RATE_LIMIT_IP_MAX = originalIpMax;
if (originalTokenMax === undefined) delete process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX;
else process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = originalTokenMax;
if (originalWindow === undefined) delete process.env.MINDLINK_RATE_LIMIT_WINDOW_MS;
else process.env.MINDLINK_RATE_LIMIT_WINDOW_MS = originalWindow;
resetApiGuardState();

console.log("api guard unit tests passed");
