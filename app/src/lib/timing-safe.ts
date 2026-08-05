/**
 * Timing-safe string comparison — canonical re-export.
 *
 * Until @vibe-studio/security package is extracted
 * (see docs/adr/shared-security-utils.md), this module is the
 * canonical name imported by other projects. It re-exports the
 * implementation from `crypto-helpers.ts` for consistency with new code.
 *
 * Copies live at:
 *   - pd-private/next/src/lib/timing-safe.ts
 *   - jf-private/src/lib/timing-safe.ts
 *   - sh-private/src/lib/timing-safe.ts
 *
 * All copies share the same implementation; changing behavior here must
 * be mirrored to all of them.
 */
export { timingSafeCompareStr } from "./crypto-helpers";
