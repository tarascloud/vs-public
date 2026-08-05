import { prisma } from "@/lib/prisma";
import { verifyInternalSecret } from "@/lib/auth-helpers";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * ARC-20260507-0002: Runtime ID lookup with 5-min cache.
 * Hardcoded IDs broke whenever the DB was reseeded or reset (silent failure).
 * Now: env vars are required (OWNER_EMAIL); IDs are fetched on first call and
 * cached. If lookup fails, the request returns 500 — better than silently
 * failing with stale IDs.
 */
const ID_CACHE_TTL_MS = 5 * 60 * 1000;
type IdCache = {
  ownerUserId: string;
  developerAgentId: string;
  shProjectId: string;
  fetchedAt: number;
};
let idCache: IdCache | null = null;

async function resolveIds(): Promise<IdCache> {
  if (idCache && Date.now() - idCache.fetchedAt < ID_CACHE_TTL_MS) {
    return idCache;
  }
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    throw new Error("OWNER_EMAIL env var required for sh-workflow runtime ID lookup");
  }
  const [user, agent, project] = await Promise.all([
    prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
    prisma.agent.findFirst({ where: { name: "developer" }, select: { id: true } }),
    prisma.project.findFirst({ where: { name: { in: ["Shuleansky", "shuleansky", "SH"] } }, select: { id: true } }),
  ]);
  if (!user) throw new Error(`User not found for OWNER_EMAIL=${ownerEmail}`);
  if (!agent) throw new Error("Developer agent not found in DB");
  if (!project) throw new Error("Shuleansky project not found in DB");
  idCache = {
    ownerUserId: user.id,
    developerAgentId: agent.id,
    shProjectId: project.id,
    fetchedAt: Date.now(),
  };
  return idCache;
}

const stepSchema = z.object({
  stepKey: z.string().min(1),
  title: z.string().min(1),
  acceptanceCriteria: z.string().optional(),
  verificationCommand: z.string().optional(),
  assigneeType: z.enum(["AGENT", "OWNER"]).default("AGENT"),
  dependsOn: z.array(z.string()).default([]),
  priority: z.number().int().default(0),
});

const requestSchema = z.object({
  sessionId: z.number().int(),
  sessionNumber: z.number().int(),
  title: z.string().min(1),
  steps: z.array(stepSchema).min(1),
});

/**
 * POST /api/internal/sh-workflow
 *
 * Creates an Initiative + Tasks in VS for tracking an SH session processing pipeline.
 * Auth: x-internal-secret header (timing-safe comparison with INTERNAL_API_SECRET).
 */
export async function POST(request: Request) {
  if (!verifyInternalSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await resolveIds();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { sessionNumber, title, steps } = parsed.data;
  const initiativeId = `init-sh-session-${sessionNumber}`;

  try {
    // Check if initiative already exists (idempotency)
    const existing = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      include: { tasks: { select: { id: true, ticketId: true, title: true } } },
    });

    if (existing) {
      // Return existing mapping
      const taskMap: Record<string, string> = {};
      for (const step of steps) {
        const match = existing.tasks.find((t) =>
          t.ticketId.includes(`SH-S${sessionNumber}`) && t.title === step.title,
        );
        if (match) {
          taskMap[step.stepKey] = match.id;
        }
      }
      return Response.json({
        initiativeId: existing.id,
        tasks: taskMap,
        existing: true,
      });
    }

    // Generate ticketId prefix for SH session tasks
    const ticketPrefix = `SH-S${sessionNumber}`;

    // REV-20260512-079: batched task creation.
    // Pass 1 — initiative + N tasks via createManyAndReturn (no deps yet).
    // Pass 2 — wire dependencies via a single $transaction of `update` calls.
    // ticketId is the stable per-row identity we use to map stepKey -> id.
    await prisma.initiative.create({
      data: {
        id: initiativeId,
        title: `SH Session ${sessionNumber}: ${title}`,
        rawIdea: `Pipeline обробки сесії ${sessionNumber} "${title}" курсу Shuleansky. Кроки: ${steps.map((s) => s.title).join(", ")}.`,
        projectId: ids.shProjectId,
        userId: ids.ownerUserId,
        status: "IN_PROGRESS",
      },
    });

    const stepIndexByTicketId = new Map<string, number>();
    const createdTasks = await prisma.task.createManyAndReturn({
      data: steps.map((step, i) => {
        const ticketId = `${ticketPrefix}-${String(i + 1).padStart(2, "0")}`;
        stepIndexByTicketId.set(ticketId, i);
        return {
          ticketId,
          title: step.title,
          description: `Крок pipeline SH Session ${sessionNumber}: ${step.title}`,
          priority: step.priority,
          type: "CHORE" as const,
          projectId: ids.shProjectId,
          initiativeId,
          assigneeType: step.assigneeType,
          ...(step.assigneeType === "AGENT"
            ? { agentId: ids.developerAgentId }
            : { assigneeUserId: ids.ownerUserId }),
          acceptanceCriteria: step.acceptanceCriteria ?? null,
          verificationCommand: step.verificationCommand ?? null,
        };
      }),
      select: { id: true, ticketId: true },
    });

    // Map stepKey -> generated task id via ticketId (which we control).
    const stepKeyToTaskId: Record<string, string> = {};
    for (const row of createdTasks) {
      const idx = stepIndexByTicketId.get(row.ticketId);
      if (idx !== undefined) {
        stepKeyToTaskId[steps[idx].stepKey] = row.id;
      }
    }

    // Pass 2: wire blockedBy edges. Skipped entirely when no steps declare deps.
    const dependencyUpdates = steps
      .map((step) => {
        const blockedByIds = step.dependsOn
          .map((dep) => stepKeyToTaskId[dep])
          .filter((id): id is string => Boolean(id));
        const selfId = stepKeyToTaskId[step.stepKey];
        if (blockedByIds.length === 0 || !selfId) return null;
        return prisma.task.update({
          where: { id: selfId },
          data: { blockedBy: { connect: blockedByIds.map((id) => ({ id })) } },
        });
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    if (dependencyUpdates.length > 0) {
      await prisma.$transaction(dependencyUpdates);
    }

    return Response.json(
      {
        initiativeId,
        tasks: stepKeyToTaskId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create SH workflow:", error);
    return Response.json(
      { error: "Failed to create SH workflow" },
      { status: 500 },
    );
  }
}
