/**
 * Shared auth + rate limit for Expo Router API routes.
 * Never import this from Expo client screens.
 *
 * EAS Hosting runs each request in a Cloudflare Worker isolate and may
 * re-evaluate route modules, so a module-level Map never reaches 429.
 * Counters are stored on globalThis, in /tmp (same isolate), and in a named
 * Workers cache (caches.open). caches.default is forbidden on EAS.
 * The highest count wins.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getServerApiToken } from "./secrets.js";
import { DEFAULT_MINDLINK_API_TOKEN } from "../utils/apiAuth.js";

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_IP_MAX = 30;
export const DEFAULT_RATE_LIMIT_TOKEN_MAX = 120;

const MEMORY_KEY = "__mindlinkApiGuardV1";
const FILE_PATH = "/tmp/mindlink-api-guard.json";
const CACHE_NAME = "mindlink-rate-limit";

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

function memoryMap() {
  if (!globalThis[MEMORY_KEY]) {
    globalThis[MEMORY_KEY] = new Map();
  }
  return globalThis[MEMORY_KEY];
}

export function resetApiGuardState() {
  delete globalThis[MEMORY_KEY];
  try {
    unlinkSync(FILE_PATH);
  } catch {
    // File store is optional.
  }
}

export function clearMemoryBucketsForTests() {
  delete globalThis[MEMORY_KEY];
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

export function readClientIp(request) {
  const cloudflare = String(
    request?.headers?.get("cf-connecting-ip") || ""
  ).trim();
  const hops = String(request?.headers?.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const realIp = String(request?.headers?.get("x-real-ip") || "").trim();
  if (cloudflare) return { ip: cloudflare, via: "cf", hops: hops.length };
  if (hops.length) {
    return { ip: hops[hops.length - 1], via: "xff", hops: hops.length };
  }
  if (realIp) return { ip: realIp, via: "real", hops: 0 };
  return { ip: "unknown", via: "unknown", hops: 0 };
}

export function getClientIp(request) {
  return readClientIp(request).ip;
}

function safeError(error) {
  return String(error?.message || error || "failed")
    .replace(/(?:AIza|AQ\.)[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
}

function sourceRank(source) {
  if (source === "cache") return 3;
  if (source === "file") return 2;
  if (source === "memory") return 1;
  return 0;
}

function liveEntry(entry, now) {
  if (!entry || !Number.isFinite(entry.count) || !(entry.resetAt > now)) {
    return null;
  }
  return { count: entry.count, resetAt: entry.resetAt };
}

function readFileStore(now) {
  try {
    const parsed = JSON.parse(readFileSync(FILE_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const live = {};
    for (const [key, entry] of Object.entries(parsed)) {
      const kept = liveEntry(entry, now);
      if (kept) live[key] = kept;
    }
    return live;
  } catch {
    return {};
  }
}

function writeFileStore(data) {
  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(FILE_PATH, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

async function openCache() {
  if (globalThis.__mindlinkCacheOff) {
    return { cache: null, status: "disabled" };
  }
  const cachesApi = globalThis.caches;
  if (!cachesApi || typeof cachesApi.open !== "function") {
    return { cache: null, status: "missing" };
  }
  try {
    const cache = await cachesApi.open(CACHE_NAME);
    if (!cache) return { cache: null, status: "missing" };
    return { cache, status: "ok" };
  } catch (error) {
    const status = `failed:${safeError(error)}`;
    if (status.toLowerCase().includes("not permitted")) {
      globalThis.__mindlinkCacheOff = true;
    }
    return { cache: null, status };
  }
}

function cacheRequestFor(key) {
  return new Request(
    `https://mindlink-rate-limit.internal/v1/${encodeURIComponent(key)}`,
    { method: "GET" }
  );
}

async function readCache(key, now) {
  const opened = await openCache();
  if (!opened.cache) return { entry: null, status: opened.status };
  try {
    const hit = await opened.cache.match(cacheRequestFor(key));
    if (!hit) return { entry: null, status: "ok" };
    const data = await hit.json();
    return { entry: liveEntry(data, now), status: "ok" };
  } catch (error) {
    return { entry: null, status: `failed:${safeError(error)}` };
  }
}

async function writeCache(key, entry, windowMs) {
  const opened = await openCache();
  if (!opened.cache) return false;
  try {
    const maxAge = Math.max(1, Math.ceil(windowMs / 1000));
    await opened.cache.put(
      cacheRequestFor(key),
      new Response(JSON.stringify(entry), {
        headers: {
          "Cache-Control": `public, max-age=${maxAge}`,
          "Content-Type": "application/json",
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function consumeRateLimit(key, max, windowMs) {
  const now = Date.now();
  const fileData = readFileStore(now);
  const memoryHit = liveEntry(memoryMap().get(key), now);
  const cacheHit = await readCache(key, now);

  const candidates = [];
  if (memoryHit) candidates.push({ source: "memory", ...memoryHit });
  if (fileData[key]) candidates.push({ source: "file", ...fileData[key] });
  if (cacheHit.entry) candidates.push({ source: "cache", ...cacheHit.entry });

  let chosen = null;
  for (const candidate of candidates) {
    if (
      !chosen ||
      candidate.count > chosen.count ||
      (candidate.count === chosen.count &&
        sourceRank(candidate.source) > sourceRank(chosen.source))
    ) {
      chosen = candidate;
    }
  }

  const resetAt =
    chosen?.resetAt && chosen.resetAt > now ? chosen.resetAt : now + windowMs;
  const count = (chosen?.count || 0) + 1;
  const entry = { count, resetAt };

  memoryMap().set(key, entry);
  fileData[key] = entry;
  const fileOk = writeFileStore(fileData);
  const cacheOk = await writeCache(key, entry, windowMs);
  const persist = ["memory"];
  if (fileOk) persist.push("file");
  if (cacheOk) persist.push("cache");

  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const limited = count > max;
  return {
    limited,
    retryAfter,
    remaining: limited ? 0 : Math.max(0, max - count),
    limit: max,
    source: chosen?.source || "none",
    persist: persist.join(","),
    cache: cacheOk ? "ok" : cacheHit.status,
  };
}

function rateHeaders(limitInfo, via) {
  return {
    "Cache-Control": "no-store",
    "X-RateLimit-Limit": String(limitInfo.limit),
    "X-RateLimit-Remaining": String(limitInfo.remaining),
    "X-RateLimit-Source": limitInfo.source || "none",
    "X-RateLimit-Persist": limitInfo.persist || "memory",
    "X-RateLimit-Cache": String(limitInfo.cache || "missing").slice(0, 120),
    "X-RateLimit-Via": via || "unknown",
  };
}

function rateLimitResult(limitInfo, via) {
  return {
    ok: false,
    status: 429,
    headers: {
      ...rateHeaders(limitInfo, via),
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

function unauthorizedResult(limitInfo, via) {
  return {
    ok: false,
    status: 401,
    headers: rateHeaders(limitInfo, via),
    body: {
      error: "Missing or invalid API token",
      code: "UNAUTHORIZED",
    },
  };
}

/**
 * Auth + rate limit. Failed auth still consumes a bucket.
 * EAS Hosting does not set CF-Connecting-IP, and X-Forwarded-For is one
 * rotating hop, so unauthenticated calls share one bucket. A real per-IP
 * bucket is used when CF-Connecting-IP or a multi-hop X-Forwarded-For exists.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, headers?: object, body: object }>}
 */
function clientIpIsStable(ipInfo) {
  if (ipInfo.via === "cf") return true;
  return ipInfo.via === "xff" && ipInfo.hops >= 2;
}

export async function evaluateApiGuard(request) {
  const { windowMs, ipMax, tokenMax } = getRateLimitConfig();
  const ipInfo = readClientIp(request);
  const via = `${ipInfo.via};hops=${ipInfo.hops}`;
  const stableIp = clientIpIsStable(ipInfo);
  const ipLimit = await consumeRateLimit(
    `ip:${digestToken(ipInfo.ip)}`,
    ipMax,
    windowMs
  );
  if (ipLimit.limited) {
    return rateLimitResult(ipLimit, via);
  }

  const provided = extractApiToken(request);
  const expected = getExpectedApiToken();
  if (!provided || !tokensMatch(provided, expected)) {
    if (stableIp) {
      return unauthorizedResult(ipLimit, via);
    }
    const shared = await consumeRateLimit("unauth:shared", ipMax, windowMs);
    if (shared.limited) {
      return rateLimitResult(shared, via);
    }
    return unauthorizedResult(shared, via);
  }

  const tokenLimit = await consumeRateLimit(
    `token:${digestToken(provided)}`,
    tokenMax,
    windowMs
  );
  if (tokenLimit.limited) {
    return rateLimitResult(tokenLimit, via);
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
