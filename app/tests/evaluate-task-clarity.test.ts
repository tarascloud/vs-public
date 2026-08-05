/**
 * Unit tests for evaluateTaskClarity.
 * REV22-046: heuristic extracted from ola-review cron → lib.
 */
import { describe, it, expect } from "vitest";
import { evaluateTaskClarity } from "@/lib/evaluate-task-clarity";

describe("evaluateTaskClarity", () => {
  it("returns clear for a well-formed task with description", () => {
    const result = evaluateTaskClarity({
      title: "Fix auth redirect loop on client portal",
      description: "After login the client is redirected in a loop — root cause is missing session check in middleware.",
    });
    expect(result.clear).toBe(true);
  });

  it("returns clear for a short-description task when initiative provides context", () => {
    const result = evaluateTaskClarity({
      title: "Implement rate limiting for upload endpoint",
      description: null,
      initiativeTitle: "Security Hardening Sprint",
    });
    expect(result.clear).toBe(true);
  });

  it("returns not-clear when title is too short (< 3 words)", () => {
    const result = evaluateTaskClarity({
      title: "Fix bug",
      description: "This is a long enough description with details.",
      initiativeTitle: "Some initiative",
    });
    expect(result.clear).toBe(false);
    if (!result.clear) {
      expect(result.issues.some((i) => i.includes("too short"))).toBe(true);
    }
  });

  it("returns not-clear when title is a single vague verb", () => {
    const result = evaluateTaskClarity({
      title: "update",
      description: "Detailed description here.",
      initiativeRawIdea: "Improve performance",
    });
    expect(result.clear).toBe(false);
    if (!result.clear) {
      expect(result.issues.some((i) => i.includes("too vague"))).toBe(true);
    }
  });

  it("returns not-clear when no description and no initiative context", () => {
    const result = evaluateTaskClarity({
      title: "Implement new dashboard widget",
      description: null,
    });
    expect(result.clear).toBe(false);
    if (!result.clear) {
      expect(result.issues.some((i) => i.includes("No description"))).toBe(true);
    }
  });

  it("returns multiple issues for a completely unclear task", () => {
    const result = evaluateTaskClarity({
      title: "fix",
      description: null,
    });
    expect(result.clear).toBe(false);
    if (!result.clear) {
      // vague + no description (title also fails ≥3 word check, but vague check hits first)
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns clear when rawIdea provides initiative context (no description)", () => {
    const result = evaluateTaskClarity({
      title: "Write end-to-end test for checkout flow",
      description: undefined,
      initiativeRawIdea: "We need full E2E coverage for the checkout pipeline",
    });
    expect(result.clear).toBe(true);
  });

  it("ignores a description that is too short (≤10 chars)", () => {
    const result = evaluateTaskClarity({
      title: "Refactor database query layer",
      description: "short",
      initiativeTitle: undefined,
    });
    expect(result.clear).toBe(false);
    if (!result.clear) {
      expect(result.issues.some((i) => i.includes("No description"))).toBe(true);
    }
  });

  it("all vague verbs trigger vague-pattern match", () => {
    const vague = ["fix", "update", "change", "do", "make", "add", "remove", "test"];
    for (const verb of vague) {
      const result = evaluateTaskClarity({ title: verb, description: null });
      expect(result.clear).toBe(false);
    }
  });
});
