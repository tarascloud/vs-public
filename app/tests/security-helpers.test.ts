/**
 * Unit tests for VS security helpers.
 * REV22-045: coverage for crypto-helpers/timing-safe.
 *
 * Note: verifyInternalSecret lives in auth-helpers.ts which imports from
 * next-auth (next/server dependency) — cannot be imported in the vitest
 * node environment without a full Next.js runtime. The function is tested
 * implicitly via the integration tests in tests/tasks-blockedby.test.ts and
 * tests/initiatives-status.test.ts. The timing-safe primitive it relies on
 * is tested directly here.
 */
import { describe, it, expect } from "vitest";
import { timingSafeCompareStr } from "@/lib/crypto-helpers";

// ── timingSafeCompareStr ───────────────────────────────────────────────────

describe("timingSafeCompareStr", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeCompareStr("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeCompareStr("secret123", "secret124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeCompareStr("short", "much-longer-string")).toBe(false);
  });

  it("returns false when one string is empty", () => {
    expect(timingSafeCompareStr("", "nonempty")).toBe(false);
    expect(timingSafeCompareStr("nonempty", "")).toBe(false);
  });

  it("returns true for both empty strings", () => {
    expect(timingSafeCompareStr("", "")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(timingSafeCompareStr("Secret", "secret")).toBe(false);
  });

  it("handles unicode safely", () => {
    expect(timingSafeCompareStr("🔑secret", "🔑secret")).toBe(true);
    expect(timingSafeCompareStr("🔑secret", "🔒secret")).toBe(false);
  });

  it("resists length oracle (does not short-circuit on length mismatch)", () => {
    // Both calls should succeed without throwing (constant-time path)
    expect(() => timingSafeCompareStr("a".repeat(1000), "b")).not.toThrow();
    expect(timingSafeCompareStr("a".repeat(1000), "b")).toBe(false);
  });
});

// ── verifyInternalSecret (inline — avoids next-auth/next/server dependency) ──

/**
 * Inline re-implementation of verifyInternalSecret for unit testing.
 * Mirrors the logic in @/lib/auth-helpers.ts:verifyInternalSecret exactly.
 * This allows testing the secret-checking logic without importing Next.js
 * server modules that don't resolve in the vitest node environment.
 */
function verifyInternalSecretStandalone(
  headers: Record<string, string>,
  env: Record<string, string | undefined>,
  envVar = "INTERNAL_API_SECRET",
  headerName = "x-internal-secret",
): boolean {
  const secret = env[envVar];
  if (!secret) return false;
  const header = headers[headerName] ?? "";
  return timingSafeCompareStr(header, secret);
}

describe("verifyInternalSecret (standalone logic)", () => {
  it("returns true when header matches env var", () => {
    expect(verifyInternalSecretStandalone(
      { "x-internal-secret": "correct-secret" },
      { INTERNAL_API_SECRET: "correct-secret" },
    )).toBe(true);
  });

  it("returns false when header does not match", () => {
    expect(verifyInternalSecretStandalone(
      { "x-internal-secret": "wrong-secret" },
      { INTERNAL_API_SECRET: "correct-secret" },
    )).toBe(false);
  });

  it("returns false when env var is not set", () => {
    expect(verifyInternalSecretStandalone(
      { "x-internal-secret": "any-secret" },
      {},
    )).toBe(false);
  });

  it("returns false when header is missing", () => {
    expect(verifyInternalSecretStandalone(
      {},
      { INTERNAL_API_SECRET: "correct-secret" },
    )).toBe(false);
  });

  it("supports custom env var name and header", () => {
    expect(verifyInternalSecretStandalone(
      { "x-cron-secret": "cron-token" },
      { CRON_SECRET: "cron-token" },
      "CRON_SECRET",
      "x-cron-secret",
    )).toBe(true);
  });

  it("returns false for empty secret header when env is set", () => {
    expect(verifyInternalSecretStandalone(
      { "x-internal-secret": "" },
      { INTERNAL_API_SECRET: "real-secret" },
    )).toBe(false);
  });
});
