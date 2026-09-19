/**
 * Shared auth + in-memory rate limit for Expo Router API routes.
 * Never import from Expo client screens.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { getServerApiToken } from "./secrets.js";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_IP_MAX = 30;
export const DEFAULT_RATE_LIMIT_TOKEN_MAX = 120;

const buckets = new Map();

function readPositiveInt(raw, fallback) {
  const value = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getExpectedApiToken() {
  return getServerApiToken() || DEFAULT_MINDLINK_API_TOKEN;
}

export function getRateLimitConfig() {
  return {
    windowMs: readPositiveInt(
      process.env.MINDLINK_RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_LIMIT_WINDOW_MS
    ),
    ipMax: readPositiveInt(
      process.env.MINDLINK_RATE_LIMIT_IP_MAX,
      DEFAULT_RATE_LIMIT_IP_MAX
    ),
    tokenMax: readPositiveInt(
      process.env.MINDLINK_RATE_LIMIT_TOKEN_MAX,
      DEFAULT_RATE_LIMIT_TOKEN_MAX
    ),
  };
}

export function resetApiGuardState() {
  buckets.clear();
}

export function digestToken(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function tokensMatch(provided, expected) {
  const left = digestToken(provided);
  const right = digestToken(expected);
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function extractApiToken(request) {
  const headerToken = String(
    request?.headers?.get("x-mindlink-token") || ""
  ).trim();
  if (headerToken) return headerToken;

  const authorization = String(
    request?.headers?.get("authorization") || ""
  ).trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || "";
}

export function getClientIp(request) {
  const forwarded = String(request?.headers?.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  if (forwarded) return forwarded;
  const cloudflare = String(
    request?.headers?.get("cf-connecting-ip") || ""
  ).trim();
  if (cloudflare) return cloudflare;
  const realIp = String(request?.headers?.get("x-real-ip") || "").trim();
  if (realIp) return realIp;
  return "unknown";
}

function consumeRateLimit(key, max, windowMs) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  entry.count += 1;
  buckets.set(key, entry);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  if (entry.count > max) {
    return {
      limited: true,
      retryAfter,
      remaining: 0,
      limit: max,
    };
  }
  return {
    limited: false,
    retryAfter,
    remaining: Math.max(0, max - entry.count),
    limit: max,
  };
}

function rateLimitResult(limitInfo) {
  return {
    ok: false,
    status: 429,
    headers: {
      "Retry-After": String(limitInfo.retryAfter),
    },
    body: {
      error: `Too many requests. Try again in ${limitInfo.retryAfter} seconds.`,
      code: "RATE_LIMITED",
      retryAfter: limitInfo.retryAfter,
      limit: limitInfo.limit,
    },
  };
}

/**
 * Auth + rate limit. Failed auth still consumes the IP bucket.
 * @returns {{ ok: true } | { ok: false, status: number, headers?: object, body: object }}
 */
export function evaluateApiGuard(request) {
  const { windowMs, ipMax, tokenMax } = getRateLimitConfig();
  const ip = getClientIp(request);
  const ipLimit = consumeRateLimit(`ip:${ip}`, ipMax, windowMs);
  if (ipLimit.limited) {
    return rateLimitResult(ipLimit);
  }

  const provided = extractApiToken(request);
  const expected = getExpectedApiToken();
  if (!provided || !tokensMatch(provided, expected)) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "Missing or invalid API token",
        code: "UNAUTHORIZED",
      },
    };
  }

  const tokenLimit = consumeRateLimit(
    `token:${digestToken(provided)}`,
    tokenMax,
    windowMs
  );
  if (tokenLimit.limited) {
    return rateLimitResult(tokenLimit);
  }

  return { ok: true };
}

export function guardJsonResponse(result, extraBody = {}) {
  return Response.json(
    { ...result.body, ...extraBody },
    {
      status: result.status,
      headers: result.headers,
    }
  );
}
