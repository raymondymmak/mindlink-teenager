import assert from "assert";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";
import {
  DEFAULT_RATE_LIMIT_IP_MAX,
  DEFAULT_RATE_LIMIT_TOKEN_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  evaluateApiGuard,
  extractApiToken,
  getClientIp,
  getExpectedApiToken,
  getRateLimitConfig,
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
assert.strictEqual(getClientIp(ipRequest), "203.0.113.9");

process.env.MINDLINK_RATE_LIMIT_IP_MAX = "3";
process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX = "10";
process.env.MINDLINK_RATE_LIMIT_WINDOW_MS = "600000";
assert.deepStrictEqual(getRateLimitConfig(), {
  windowMs: 600000,
  ipMax: 3,
  tokenMax: 10,
});

resetApiGuardState();
const unauth = evaluateApiGuard(
  new Request("http://localhost/api/gemini", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.2" },
  })
);
assert.strictEqual(unauth.ok, false);
assert.strictEqual(unauth.status, 401);
assert.strictEqual(unauth.body.code, "UNAUTHORIZED");

const authedInit = {
  method: "POST",
  headers: {
    Authorization: "Bearer custom-gate",
    "x-forwarded-for": "198.51.100.3",
  },
};
assert.strictEqual(evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit)).ok, true);
assert.strictEqual(evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit)).ok, true);
assert.strictEqual(evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit)).ok, true);
const fourth = evaluateApiGuard(new Request("http://localhost/api/gemini", authedInit));
assert.strictEqual(fourth.ok, false);
assert.strictEqual(fourth.status, 429);
assert.strictEqual(fourth.body.code, "RATE_LIMITED");
assert.ok(fourth.body.retryAfter >= 1);
assert.strictEqual(fourth.headers["Retry-After"], String(fourth.body.retryAfter));

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
assert.strictEqual(evaluateApiGuard(new Request("http://localhost/api/context", tokenInit)).ok, true);
assert.strictEqual(evaluateApiGuard(new Request("http://localhost/api/context", tokenInit)).ok, true);
const tokenLimited = evaluateApiGuard(
  new Request("http://localhost/api/context", tokenInit)
);
assert.strictEqual(tokenLimited.status, 429);
assert.strictEqual(tokenLimited.body.limit, 2);

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
