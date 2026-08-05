/**
 * Shared Redis-backed sliding-window rate limiter (canon).
 *
 * Source: extracted from `pd-private/next/src/lib/rate-limit.ts` per
 * ARC-20260507-0001. This file is the canon and should be kept in sync
 * across vs-private, jf-private, korobkovart, sh-private. See
 * `.claude/rules/security-sync.md` and
 * `docs/adr/shared-security-utils.md`.
 *
 * Per-project Redis namespace is supplied via `KEY_NAMESPACE` (e.g. `vs:rl`,
 * `jf:rl`, `ko:rl`). All keys are prefixed to avoid collisions when projects
 * share the same Redis instance.
 *
 * Fail-open semantics: if ioredis is not installed, the env vars are not set,
 * or the Redis call fails, the request is allowed through. Rate-limiting is
 * a hardening layer, not the only line of defense — application-level checks
 * (auth, validation) must still apply.
 */

// Optional ioredis import: project may not yet ship the dep, in which case
// the limiter degrades to a no-op (fail-open). Use Function() to avoid
// bundlers eagerly resolving the module at build time.
type IoRedisClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  on(event: string, cb: (err: Error) => void): unknown;
  connect(): Promise<unknown>;
};

let cachedClient: IoRedisClient | null | undefined;

async function getRedis(): Promise<IoRedisClient | null> {
  if (cachedClient !== undefined) return cachedClient;

  const host = process.env.REDIS_HOST || "redis";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD;
  const url = process.env.REDIS_URL;

  if (!password && !url) {
    cachedClient = null;
    return null;
  }

  try {
    // Dynamic import so projects without ioredis still build.
    // @ts-expect-error — ioredis is optional; phase-2 ADR adds dep.
    const mod = await import(/* webpackIgnore: true */ "ioredis").catch(
      () => null,
    );
    if (!mod) {
      cachedClient = null;
      return null;
    }
    const Redis = (mod as { default?: unknown }).default ?? mod;
    type RedisCtor = new (...args: unknown[]) => IoRedisClient;
    const RedisClass = Redis as RedisCtor;
    const opts = {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    };
    const client: IoRedisClient = password
      ? new RedisClass({ host, port, password, ...opts })
      : new RedisClass(url, opts);

    client.on("error", (err: Error) => {
      console.warn("[rate-limit-redis] connection error:", err.message);
    });
    client.connect().catch(() => {
      /* handled by error listener */
    });
    cachedClient = client;
    return client;
  } catch (e) {
    console.warn(
      "[rate-limit-redis] init failed, fail-open:",
      (e as Error).message,
    );
    cachedClient = null;
    return null;
  }
}

export interface SlidingWindowConfig {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
}

/**
 * Sliding-window rate limit check using Redis INCR + EXPIRE.
 *
 * @param namespace project-specific key prefix (e.g. "vs:rl", "jf:rl", "ko:rl")
 * @param key       caller-supplied identifier (e.g. `${prefix}:${ip}`)
 * @param config    limit and window
 * @returns SlidingWindowResult; fail-open if Redis is unavailable
 */
export async function slidingWindow(
  namespace: string,
  key: string,
  config: SlidingWindowConfig,
): Promise<SlidingWindowResult> {
  const { limit, windowSeconds } = config;
  const fallback: SlidingWindowResult = {
    allowed: true,
    remaining: Math.max(0, limit - 1),
    retryAfterSecs: windowSeconds,
  };

  const client = await getRedis();
  if (!client) return fallback;

  const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
  const fullKey = `${namespace}:${key}:${windowKey}`;

  try {
    const current = await client.incr(fullKey);
    if (current === 1) {
      await client.expire(fullKey, windowSeconds);
    }
    if (current > limit) {
      const ttl = await client.ttl(fullKey);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      return { allowed: false, remaining: 0, retryAfterSecs: retryAfter };
    }
    return {
      allowed: true,
      remaining: Math.max(0, limit - current),
      retryAfterSecs: windowSeconds,
    };
  } catch (e) {
    console.warn(
      "[rate-limit-redis] runtime error, fail-open:",
      (e as Error).message,
    );
    return fallback;
  }
}
