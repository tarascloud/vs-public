import { z } from "zod";

// ---- Task schemas ----

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  priority: z.number().int().optional().default(0),
  type: z.enum(["FEATURE", "BUG", "CHORE", "REVIEW"]).optional().default("FEATURE"),
  agentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  initiativeId: z.string().min(1, "initiativeId is required"),
  assigneeType: z.enum(["AGENT", "OWNER", "CLIENT"]).optional().default("AGENT"),
  assigneeUserId: z.string().nullable().optional(),
  blockedByIds: z.array(z.string()).optional(),
  acceptanceCriteria: z.string().nullable().optional(),
  verificationCommand: z.string().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "TESTING", "DONE"]).optional(),
  priority: z.number().int().optional(),
  type: z.enum(["FEATURE", "BUG", "CHORE", "REVIEW"]).optional(),
  agentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  assigneeType: z.enum(["AGENT", "OWNER", "CLIENT"]).optional(),
  assigneeUserId: z.string().nullable().optional(),
  blockedByIds: z.array(z.string()).optional(),
  completionNote: z.string().nullable().optional(),
  commitHash: z.string().nullable().optional(),
  commitUrl: z.string().nullable().optional(),
  tokensUsed: z.number().int().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
  verificationCommand: z.string().nullable().optional(),
  verificationOutput: z.string().nullable().optional(),
  verificationStatus: z
    .enum(["PASS", "FAIL", "SKIPPED", "NO_RUNTIME", "NO_GIT"])
    .nullable()
    .optional(),
});

// ---- Initiative schemas ----

export const createInitiativeSchema = z.object({
  rawIdea: z.string().min(1, "Idea text is required"),
  projectId: z.string().min(1, "Project is required"),
  smmAccountId: z.string().nullable().optional(),
});

export const updateInitiativeSchema = z.object({
  title: z.string().optional(),
  status: z
    .enum(["IDEA", "PLANNING", "PLANNED", "IN_PROGRESS", "BLOCKED", "DONE"])
    .optional(),
  summary: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  priority: z.number().int().optional(),
});
