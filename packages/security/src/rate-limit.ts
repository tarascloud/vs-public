/**
 * Rate limiter — in-memory sliding window with optional Redis backend.
 *
 * SCAFFOLD NOTE (2026-04-19): This is the in-memory variant copied from
 * vs-private. Production-ready extraction MUST add a Redis backend
 * (INCR + EXPIRE) so rate limit state is shared across pod replicas and
 * survives deploys. See ADR `shared-security-utils.md` §Migration.
 *
 * Current behavior: one Map per process. Resets on container restart.
 * Adequate for auth brute-force, insufficient for API quotas that span
 * multiple deploys or multi-pod horizontal scaling.
 */
import { headers } from "next/headers";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

function pruneExpired(): void {
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
  /** Remaining requests in current window */
  remaining: number;
  /** Seconds until the window resets */
  retryAfterSecs: number;
}

/**
 * Extract client IP from request headers (Cloudflare-aware).
 * Falls back to "unknown" if no proxy header is present.
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
 * Check and consume one token from the rate limit bucket for the given key.
 */
export function checkRateLimit(
  key: string,
  config?: RateLimitConfig,
): RateLimitResult {
  const limit = config?.limit ?? 60;
  const windowMs = config?.windowMs ?? 60_000;

  pruneExpired();

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
 * Convenience: check rate limit and return a 429 Response if exceeded,
 * or null if the request is allowed.
 *
 * ```ts
 * const blocked = await rateLimitOrNull("plan", { limit: 10 });
 * if (blocked) return blocked;
 * ```
 */
export async function rateLimitOrNull(
  prefix: string,
  config?: RateLimitConfig,
): Promise<Response | null> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${prefix}:${ip}`, config);
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
