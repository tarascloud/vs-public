import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Tests for the in-memory rate limiter.
 * Each test uses a unique key to avoid cross-test state pollution.
 *
 * REV22-045: replaced real sleep (50ms+100ms) with vi.useFakeTimers to avoid
 * flaky tests on loaded CI/VPS.
 */

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request within window", () => {
    const result = checkRateLimit("test:first-request", { limit: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("counts down remaining on subsequent requests", () => {
    const key = "test:countdown";
    checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    const result = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks request when limit is exceeded", () => {
    const key = "test:exceeded";
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit(key, opts);
    checkRateLimit(key, opts);
    const result = checkRateLimit(key, opts);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("uses default limit of 60 when no config provided", () => {
    const result = checkRateLimit("test:default-limit");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("returns retryAfterSecs >= 1 when blocked", () => {
    const key = "test:retry-after";
    const opts = { limit: 1, windowMs: 30_000 };
    checkRateLimit(key, opts);
    const result = checkRateLimit(key, opts);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSecs).toBeGreaterThanOrEqual(1);
  });

  it("resets counter after window expires (fake timers)", () => {
    const key = "test:window-reset-fake";
    const opts = { limit: 1, windowMs: 50 }; // 50ms window
    checkRateLimit(key, opts);
    const blockedResult = checkRateLimit(key, opts);
    expect(blockedResult.allowed).toBe(false);

    // Advance fake clock past the window
    vi.advanceTimersByTime(100);

    const afterReset = checkRateLimit(key, opts);
    expect(afterReset.allowed).toBe(true);
  });

  it("isolates different keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    checkRateLimit("test:key-a-fake", opts);
    checkRateLimit("test:key-a-fake", opts); // key-a is blocked

    const keyBResult = checkRateLimit("test:key-b-fake", opts);
    expect(keyBResult.allowed).toBe(true); // key-b is unaffected
  });
});
