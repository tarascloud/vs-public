import { prisma } from "@/lib/prisma";
import { requireAuth, requireAuthApi, requireOwnerApi, verifyInternalSecret } from "@/lib/auth-helpers";
import { fireInitiativeCallback } from "@/lib/initiative-callback";
import {
  validateTaskCompletion,
  truncateVerificationOutput,
} from "@/lib/task-validation";
import { updateTaskSchema } from "@/lib/validations";
import { rateLimitOrNull } from "@/lib/rate-limit";
import { AssigneeType, VerificationStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireAuthApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        agent: true,
        questions: true,
        project: true,
        assigneeUser: { select: { id: true, name: true } },
        initiative: { select: { id: true, title: true } },
        blockedBy: { select: { id: true, ticketId: true, title: true, status: true } },
        blocking: { select: { id: true, ticketId: true, title: true, status: true } },
      },
    });

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // CLIENT can only see tasks assigned to them
    if (user.role === "CLIENT" && task.assigneeUserId !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(task);
  } catch (error) {
    console.error("Failed to fetch task:", error);
    return Response.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// MP-MONO-04: Fire-and-forget webhook to mempalace when a Task transitions to DONE.
// Errors are logged but do NOT fail the PUT request.
async function fireMempalaceWebhook(task: {
  id: string;
  ticketId: string | null;
  title: string;
  description: string | null;
  completionNote: string | null;
  commitHash: string | null;
  status: string;
  initiativeId: string | null;
  verificationStatus: string | null;
  verificationOutput: string | null;
}): Promise<void> {
  const url = process.env.MEMPALACE_WEBHOOK_URL;
  const token = process.env.MEMPALACE_BEARER_TOKEN;
  if (!url || !token) {
    console.warn(
      "[mempalace-webhook] MEMPALACE_WEBHOOK_URL or MEMPALACE_BEARER_TOKEN not set — skipping"
    );
    return;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        taskId: task.id,
        ticketId: task.ticketId,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        commitHash: task.commitHash,
        status: task.status,
        initiativeId: task.initiativeId,
        verificationStatus: task.verificationStatus,
        verificationOutput: task.verificationOutput,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(
        `[mempalace-webhook] non-OK response for task ${task.id}: ${res.status}`
      );
    } else {
      console.log(
        `[mempalace-webhook] sent for task ${task.ticketId || task.id}`
      );
    }
  } catch (err) {
    console.error(`[mempalace-webhook] error for task ${task.id}:`, err);
  }
}

// CW-05: Fire-and-forget Telegram notification to project clients when task status changes.
// Uses the internal /api/telegram/notify endpoint with x-internal-secret auth.
async function fireTelegramTaskNotify(
  taskId: string,
  newStatus: string
): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.warn(
      "[telegram-task-notify] INTERNAL_API_SECRET not set — skipping"
    );
    return;
  }
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/telegram/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        taskId,
        type: "task_status",
        content: newStatus,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(
        `[telegram-task-notify] non-OK response for task ${taskId}: ${res.status}`
      );
    } else {
      console.log(`[telegram-task-notify] sent for task ${taskId}`);
    }
  } catch (err) {
    console.error(`[telegram-task-notify] error for task ${taskId}:`, err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await rateLimitOrNull("tasks-update", { limit: 20, windowMs: 60_000 });
  if (blocked) return blocked;

  // Allow internal service-to-service auth via x-internal-secret (for SH worker callbacks etc.)
  const isInternal = verifyInternalSecret(request);
  const user = isInternal ? null : await requireAuth();
  if (!isInternal && !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      status,
      priority,
      type,
      agentId,
      projectId,
      assigneeType,
      assigneeUserId,
      blockedByIds,
      completionNote,
      commitHash,
      commitUrl,
      tokensUsed,
      acceptanceCriteria,
      verificationCommand,
      verificationOutput,
      verificationStatus,
    } = parsed.data;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // CLIENT can only modify their own tasks, and only change status to TODO or DONE
    if (user && user.role === "CLIENT") {
      if (existing.assigneeUserId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      // CLIENT can only change status field
      const clientForbiddenFields = [
        title, description, priority, type, agentId, projectId,
        assigneeType, assigneeUserId, blockedByIds, completionNote,
        commitHash, commitUrl, tokensUsed, acceptanceCriteria,
        verificationCommand, verificationOutput, verificationStatus,
      ];
      if (clientForbiddenFields.some((f) => f !== undefined)) {
        return Response.json(
          { error: "Clients can only change task status" },
          { status: 403 }
        );
      }
      if (status !== undefined && !["TODO", "IN_PROGRESS", "BLOCKED", "TESTING", "DONE"].includes(status)) {
        return Response.json(
          { error: "Clients can only change task status" },
          { status: 403 }
        );
      }
    }

    // MP-PROCESS-20260411-01: enforce acceptance-criteria guard on DONE.
    const validation = validateTaskCompletion(existing, {
      status,
      completionNote,
      acceptanceCriteria,
      verificationStatus: verificationStatus as VerificationStatus | undefined,
    });
    if (!validation.valid) {
      return Response.json({ error: validation.reason }, { status: 400 });
    }

    // Auto-set completedAt when transitioning to DONE
    const isMovingToDone = status === "DONE" && existing.status !== "DONE";
    const isMovingFromDone = status !== undefined && status !== "DONE" && existing.status === "DONE";
    const truncatedOutput = truncateVerificationOutput(verificationOutput);
    const shouldStampVerifiedAt =
      verificationStatus !== undefined && verificationStatus !== null;

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(type !== undefined && { type }),
        ...(agentId !== undefined && { agentId: agentId || null }),
        ...(projectId !== undefined && { projectId: projectId || null }),
        ...(assigneeType !== undefined && { assigneeType: assigneeType as AssigneeType }),
        ...(assigneeUserId !== undefined && { assigneeUserId: assigneeUserId || null }),
        ...(blockedByIds !== undefined && {
          blockedBy: {
            set: (blockedByIds as string[]).map((bid) => ({ id: bid })),
          },
        }),
        ...(completionNote !== undefined && { completionNote: completionNote || null }),
        ...(commitHash !== undefined && { commitHash: commitHash || null }),
        ...(commitUrl !== undefined && { commitUrl: commitUrl || null }),
        ...(tokensUsed !== undefined && { tokensUsed: tokensUsed || null }),
        ...(acceptanceCriteria !== undefined && {
          acceptanceCriteria: acceptanceCriteria || null,
        }),
        ...(verificationCommand !== undefined && {
          verificationCommand: verificationCommand || null,
        }),
        ...(verificationOutput !== undefined && {
          verificationOutput: truncatedOutput,
        }),
        ...(verificationStatus !== undefined && {
          verificationStatus: (verificationStatus || null) as VerificationStatus | null,
        }),
        ...(shouldStampVerifiedAt && { verifiedAt: new Date() }),
        ...(isMovingToDone && { completedAt: new Date() }),
        ...(isMovingFromDone && { completedAt: null }),
      },
      include: {
        agent: true,
        questions: true,
        project: true,
        assigneeUser: { select: { id: true, name: true } },
        initiative: { select: { id: true, title: true } },
        blockedBy: { select: { id: true, ticketId: true, title: true, status: true } },
        blocking: { select: { id: true, ticketId: true, title: true, status: true } },
      },
    });

    // MP-MONO-04: emit webhook when task transitions to DONE with a completionNote.
    if (isMovingToDone && task.completionNote) {
      // Fire-and-forget: do not await; do not block response.
      void fireMempalaceWebhook({
        id: task.id,
        ticketId: task.ticketId,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        commitHash: task.commitHash,
        status: task.status,
        initiativeId: task.initiativeId,
        verificationStatus: task.verificationStatus,
        verificationOutput: task.verificationOutput,
      });
    }

    // CW-05: Notify project clients via Telegram when task moves to DONE
    if (isMovingToDone && task.project) {
      void fireTelegramTaskNotify(task.id, task.status);
    }

    // Fire callback to external systems when task moves to DONE
    if (isMovingToDone && task.initiativeId) {
      const allTasks = await prisma.task.findMany({
        where: { initiativeId: task.initiativeId },
        select: { id: true, title: true, status: true, completionNote: true },
      });
      const allDone = allTasks.every((t) => t.status === "DONE");

      fireInitiativeCallback(task.initiativeId, "task_completed", {
        taskId: task.id,
        taskTitle: task.title,
        completionNote: task.completionNote,
        allTasksDone: allDone,
        tasks: allTasks,
      }).catch(() => {});

      if (allDone) {
        fireInitiativeCallback(task.initiativeId, "initiative_completed", {
          tasks: allTasks,
        }).catch(() => {});
      }
    }

    return Response.json(task);
  } catch (error) {
    console.error("Failed to update task:", error);
    return Response.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return Response.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
