import crypto from "crypto";

/**
 * Timing-safe string comparison that does not leak length via early return.
 *
 * Pads both inputs to max(len(a), len(b)) before comparing, then verifies
 * lengths match. This prevents attackers from learning the expected secret
 * length by observing response times.
 *
 * CANON. Copies live at:
 *   - pd-private/next/src/lib/timing-safe.ts
 *   - jf-private/src/lib/timing-safe.ts
 *   - sh-private/src/lib/timing-safe.ts
 *   - app/src/lib/crypto-helpers.ts (re-exported via app/src/lib/timing-safe.ts)
 *
 * Drift between canon and copies is detected by
 * scripts/security-utils-check.sh (comment-insensitive diff).
 * If you change behavior here, update ALL copies and re-run the script.
 */
export function timingSafeCompareStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  const maxLen = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(maxLen);
  ba.copy(pa);
  const pb = Buffer.alloc(maxLen);
  bb.copy(pb);
  return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
}
