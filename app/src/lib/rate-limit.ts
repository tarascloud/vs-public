import { headers } from "next/headers";
import { slidingWindow, type SlidingWindowResult } from "./rate-limit-redis";

/**
 * Rate limiter for VS API routes.
 *
 * Internals: Redis-backed sliding window when REDIS_URL/REDIS_PASSWORD is
 * set (canon shared with PD/JF/KO via `rate-limit-redis.ts`). Falls back to
 * an in-process Map for dev/CI/single-instance deployments without Redis.
 *
 * Public API (`checkRateLimit`, `rateLimitOrNull`) is unchanged from the
 * pre-Redis version so existing callers in /api routes continue to work.
 */

const NAMESPACE = "vs:rl";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

// DEV-20260507-0012: hard cap on Map size. A burst of 100k unique IPs in a
// minute (e.g. botnet, scraper) would otherwise grow the Map until process OOM
// before the next pruneExpired() tick. With this cap we drop oldest 5000 keys
// (Map preserves insertion order → first iterated == oldest) the moment we
// cross 10000 — bounded memory ~= 10k entries (~1MB).
const MAX_STORE_SIZE = 10_000;
const EVICT_BATCH_SIZE = 5_000;

function evictOldestIfOverCap() {
  if (store.size <= MAX_STORE_SIZE) return;
  let toDrop = EVICT_BATCH_SIZE;
  for (const key of store.keys()) {
    if (toDrop-- <= 0) break;
    store.delete(key);
  }
}

function pruneExpired() {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Max requests allowed within the window. Default: 60 */
  limit?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
}

/**
 * Extract client IP from request headers (Cloudflare-aware).
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * In-memory fallback used when Redis is unavailable.
 */
function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  pruneExpired();
  // Inline cap check: prune missed bursts inside same minute.
  evictOldestIfOverCap();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSecs: Math.ceil(windowMs / 1000),
    };
  }

  if (entry.count >= limit) {
    const retryAfterSecs = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSecs };
  }

  entry.count++;
  const remaining = limit - entry.count;
  const retryAfterSecs = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return { allowed: true, remaining, retryAfterSecs };
}

/**
 * Sync in-memory check (legacy). Prefer `checkRateLimitAsync` for distributed
 * deployments — Redis path is async.
 */
export function checkRateLimit(
  key: string,
  config?: RateLimitConfig,
): RateLimitResult {
  const limit = config?.limit ?? 60;
  const windowMs = config?.windowMs ?? 60_000;
  return checkRateLimitMemory(key, limit, windowMs);
}

/**
 * Async check that prefers Redis (distributed) and falls back to in-memory.
 */
export async function checkRateLimitAsync(
  key: string,
  config?: RateLimitConfig,
): Promise<RateLimitResult> {
  const limit = config?.limit ?? 60;
  const windowMs = config?.windowMs ?? 60_000;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const r: SlidingWindowResult = await slidingWindow(NAMESPACE, key, {
    limit,
    windowSeconds,
  });
  if (!r.allowed) {
    return { allowed: false, remaining: 0, retryAfterSecs: r.retryAfterSecs };
  }
  // Sliding window canonical path returned allowed; if Redis was active the
  // result is authoritative. If Redis was missing we still need an in-memory
  // counter so we charge the request locally.
  if (r.retryAfterSecs === windowSeconds && r.remaining === Math.max(0, limit - 1)) {
    // Heuristic: a fresh fail-open response (no Redis hit) — fall through
    // to in-memory accounting so single-instance deployments stay capped.
    return checkRateLimitMemory(key, limit, windowMs);
  }
  return r;
}

/**
 * Convenience: check rate limit and return a 429 Response if exceeded, or null
 * if allowed. Now async + Redis-aware (transparently falls back to memory).
 */
export async function rateLimitOrNull(
  prefix: string,
  config?: RateLimitConfig,
): Promise<Response | null> {
  const ip = await getClientIp();
  const rl = await checkRateLimitAsync(`${prefix}:${ip}`, config);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSecs) },
      },
    );
  }
  return null;
}
