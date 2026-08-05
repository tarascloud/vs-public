import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  updateTaskSchema,
  createInitiativeSchema,
  updateInitiativeSchema,
} from "@/lib/validations";

describe("createTaskSchema", () => {
  it("validates a minimal valid task", () => {
    const result = createTaskSchema.safeParse({
      title: "My task",
      initiativeId: "init-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = createTaskSchema.safeParse({
      title: "",
      initiativeId: "init-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing initiativeId", () => {
    const result = createTaskSchema.safeParse({ title: "My task" });
    expect(result.success).toBe(false);
  });

  it("applies default type=FEATURE", () => {
    const result = createTaskSchema.safeParse({
      title: "My task",
      initiativeId: "init-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("FEATURE");
    }
  });

  it("applies default assigneeType=AGENT", () => {
    const result = createTaskSchema.safeParse({
      title: "My task",
      initiativeId: "init-123",
    });
    if (result.success) {
      expect(result.data.assigneeType).toBe("AGENT");
    }
  });

  it("rejects invalid type enum", () => {
    const result = createTaskSchema.safeParse({
      title: "My task",
      initiativeId: "init-123",
      type: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid task types", () => {
    for (const type of ["FEATURE", "BUG", "CHORE", "REVIEW"]) {
      const result = createTaskSchema.safeParse({
        title: "My task",
        initiativeId: "init-123",
        type,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("updateTaskSchema", () => {
  it("accepts partial update with just status", () => {
    const result = updateTaskSchema.safeParse({ status: "DONE" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateTaskSchema.safeParse({ status: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("accepts verificationStatus=PASS", () => {
    const result = updateTaskSchema.safeParse({
      status: "DONE",
      completionNote: "done",
      verificationStatus: "PASS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no fields required)", () => {
    const result = updateTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts tokensUsed as integer", () => {
    const result = updateTaskSchema.safeParse({ tokensUsed: 5000 });
    expect(result.success).toBe(true);
  });
});

describe("createInitiativeSchema", () => {
  it("validates a valid initiative", () => {
    const result = createInitiativeSchema.safeParse({
      rawIdea: "Build a new feature",
      projectId: "proj-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty rawIdea", () => {
    const result = createInitiativeSchema.safeParse({
      rawIdea: "",
      projectId: "proj-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectId", () => {
    const result = createInitiativeSchema.safeParse({ rawIdea: "Idea" });
    expect(result.success).toBe(false);
  });
});

describe("updateInitiativeSchema", () => {
  it("accepts partial update with just status", () => {
    const result = updateInitiativeSchema.safeParse({ status: "IN_PROGRESS" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid initiative status", () => {
    const result = updateInitiativeSchema.safeParse({ status: "UNKNOWN" });
    expect(result.success).toBe(false);
  });

  it("accepts empty object", () => {
    const result = updateInitiativeSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
