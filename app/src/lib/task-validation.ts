// MP-PROCESS-20260411-01: enforce machine-verifiable acceptance criteria
// on Task completion. Architect review (2026-04-11) found 8+ hidden gaps
// in MP-* tasks marked DONE without verification — this guard prevents
// silent-success regressions in the task pipeline.

import type { Task, VerificationStatus } from "@/generated/prisma/client";

export type TaskCompletionUpdate = Partial<
  Pick<
    Task,
    | "status"
    | "completionNote"
    | "commitHash"
    | "verificationStatus"
    | "verificationOutput"
    | "verifiedAt"
    | "acceptanceCriteria"
  >
>;

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const ACCEPTABLE_DONE_STATUSES: VerificationStatus[] = [
  "PASS",
  "NO_RUNTIME",
  "NO_GIT",
];

/**
 * Validate a task update that may transition the task to DONE.
 *
 * Rules:
 *  1. When moving to DONE, `completionNote` must be present (in update or existing row).
 *  2. If the task has `acceptanceCriteria`, the update must set `verificationStatus`
 *     to one of PASS / NO_RUNTIME / NO_GIT. FAIL and SKIPPED are rejected.
 *  3. Legacy tasks without `acceptanceCriteria` are allowed through (SKIPPED fallback).
 *
 * This runs only when the update transitions status → DONE. Other updates pass
 * through untouched.
 */
export function validateTaskCompletion(
  existing: Pick<
    Task,
    "status" | "completionNote" | "acceptanceCriteria" | "verificationStatus"
  >,
  update: TaskCompletionUpdate
): ValidationResult {
  // Only guard the DONE transition. Other status changes are unaffected.
  if (update.status !== "DONE") return { valid: true };
  if (existing.status === "DONE") return { valid: true }; // idempotent re-save

  // Rule 1: completionNote required.
  const completionNote =
    update.completionNote !== undefined
      ? update.completionNote
      : existing.completionNote;
  if (!completionNote || !completionNote.trim()) {
    return {
      valid: false,
      reason: "completionNote required when marking task DONE",
    };
  }

  // Rule 2: acceptance criteria enforcement.
  const hasCriteria = Boolean(
    (update.acceptanceCriteria ?? existing.acceptanceCriteria)?.trim()
  );
  if (hasCriteria) {
    const status = update.verificationStatus ?? existing.verificationStatus;
    if (!status) {
      return {
        valid: false,
        reason:
          "verificationStatus required when task has acceptanceCriteria (expected PASS, NO_RUNTIME, or NO_GIT)",
      };
    }
    if (status === "FAIL") {
      return {
        valid: false,
        reason: "Cannot mark task DONE with verificationStatus=FAIL",
      };
    }
    if (!ACCEPTABLE_DONE_STATUSES.includes(status)) {
      return {
        valid: false,
        reason: `verificationStatus=${status} is not acceptable for DONE (expected one of ${ACCEPTABLE_DONE_STATUSES.join(", ")})`,
      };
    }
  }

  return { valid: true };
}

/** Truncate verification output to 4KB before storing. */
export function truncateVerificationOutput(
  output: string | null | undefined
): string | null {
  if (!output) return null;
  const MAX = 4 * 1024;
  if (output.length <= MAX) return output;
  return output.slice(0, MAX - 32) + "\n…[truncated by task-validation]";
}
