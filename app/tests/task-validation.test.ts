import { describe, it, expect } from "vitest";
import {
  validateTaskCompletion,
  truncateVerificationOutput,
  type TaskCompletionUpdate,
} from "@/lib/task-validation";

// Minimal existing task shape for tests
function makeExisting(overrides = {}) {
  return {
    status: "IN_PROGRESS" as const,
    completionNote: null,
    acceptanceCriteria: null,
    verificationStatus: null,
    ...overrides,
  };
}

describe("validateTaskCompletion", () => {
  it("passes through non-DONE status updates", () => {
    const result = validateTaskCompletion(makeExisting(), { status: "IN_PROGRESS" });
    expect(result.valid).toBe(true);
  });

  it("allows idempotent re-save of already-DONE task", () => {
    const result = validateTaskCompletion(
      makeExisting({ status: "DONE", completionNote: "done" }),
      { status: "DONE" }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects DONE without completionNote", () => {
    const result = validateTaskCompletion(makeExisting(), { status: "DONE" });
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/completionNote/);
  });

  it("accepts DONE with completionNote in update", () => {
    const result = validateTaskCompletion(makeExisting(), {
      status: "DONE",
      completionNote: "All done",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts DONE with completionNote from existing row", () => {
    const result = validateTaskCompletion(
      makeExisting({ completionNote: "Previously set" }),
      { status: "DONE" }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects DONE with acceptance criteria but missing verificationStatus", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: "must pass tests" }),
      { status: "DONE", completionNote: "done" }
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/verificationStatus/);
  });

  it("rejects DONE with verificationStatus=FAIL", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: "must pass tests" }),
      {
        status: "DONE",
        completionNote: "done",
        verificationStatus: "FAIL",
      }
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/FAIL/);
  });

  it("accepts DONE with verificationStatus=PASS", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: "must pass tests" }),
      {
        status: "DONE",
        completionNote: "done",
        verificationStatus: "PASS",
      }
    );
    expect(result.valid).toBe(true);
  });

  it("accepts DONE with verificationStatus=NO_RUNTIME (no runtime available)", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: "npx vitest run" }),
      {
        status: "DONE",
        completionNote: "done",
        verificationStatus: "NO_RUNTIME",
      }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects DONE with verificationStatus=SKIPPED when criteria present", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: "must pass" }),
      {
        status: "DONE",
        completionNote: "done",
        verificationStatus: "SKIPPED",
      }
    );
    expect(result.valid).toBe(false);
  });

  it("allows legacy task (no acceptanceCriteria) through without verificationStatus", () => {
    const result = validateTaskCompletion(
      makeExisting({ acceptanceCriteria: null }),
      { status: "DONE", completionNote: "Legacy task, done" }
    );
    expect(result.valid).toBe(true);
  });
});

describe("truncateVerificationOutput", () => {
  it("returns null for null input", () => {
    expect(truncateVerificationOutput(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(truncateVerificationOutput(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(truncateVerificationOutput("")).toBeNull();
  });

  it("returns output unchanged if under 4KB", () => {
    const short = "test output";
    expect(truncateVerificationOutput(short)).toBe(short);
  });

  it("truncates output exceeding 4KB and appends marker", () => {
    const long = "x".repeat(5000);
    const result = truncateVerificationOutput(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(4 * 1024);
    expect(result).toContain("[truncated by task-validation]");
  });
});
