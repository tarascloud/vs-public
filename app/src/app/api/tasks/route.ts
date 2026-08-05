import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner, verifyInternalSecret } from "@/lib/auth-helpers";
import { createTaskSchema } from "@/lib/validations";
import { rateLimitOrNull } from "@/lib/rate-limit";
import { AssigneeType } from "@/generated/prisma/client";
import type { TaskWhereInput } from "@/generated/prisma/models";
import type { InitiativeWhereInput } from "@/generated/prisma/models";

type TaskType = "FEATURE" | "BUG" | "CHORE" | "REVIEW";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Allow internal service-to-service auth via x-internal-secret (agent calls)
  const isInternal = verifyInternalSecret(request);
  const user = isInternal ? null : await requireAuth();
  if (!isInternal && !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const assigneeType = searchParams.get("assigneeType") as AssigneeType | null;
    const assigneeUserId = searchParams.get("assigneeUserId");
    const agentName = searchParams.get("agentName");
    const taskType = searchParams.get("type") as TaskType | null;
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const take = Math.min(Math.max(parseInt(searchParams.get("take") ?? "50", 10) || 50, 1), 2000);
    const skip = Math.max(parseInt(searchParams.get("skip") ?? "0", 10) || 0, 0);

    const where: TaskWhereInput = {};
    let initiativeFilter: InitiativeWhereInput = {};

    // Non-OWNER users (CLIENT, VIEWER, future roles) can only see tasks
    // from projects they have explicit ProjectAccess to.
    // REV-2026-06-01 (VS-tenant-isolation): previously only CLIENT was
    // scoped, leaking all tasks to VIEWER / any other non-OWNER role.
    if (user && user.role !== "OWNER") {
      const accessibleProjects = await prisma.projectAccess.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      });
      const projectIds = accessibleProjects.map((p) => p.projectId);
      initiativeFilter.projectId = { in: projectIds };
    }

    if (assigneeType) {
      where.assigneeType = assigneeType;
    }
    if (assigneeUserId) {
      where.assigneeUserId = assigneeUserId;
    }
    if (agentName) {
      where.agent = { name: agentName };
    }
    if (taskType) {
      where.type = taskType;
    }
    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length > 1
        ? { in: statuses as ("TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED")[] }
        : (statuses[0] as "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED");
    }
    if (projectId) {
      // Verify non-OWNER users have access to this specific project.
      // REV-2026-06-01: tightened from CLIENT-only to "any non-OWNER".
      if (user && user.role !== "OWNER") {
        const hasAccess = await prisma.projectAccess.findFirst({
          where: { userId: user.id, projectId },
        });
        if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      initiativeFilter.projectId = projectId;
    }
    if (Object.keys(initiativeFilter).length > 0) {
      where.initiative = initiativeFilter;
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          agent: true,
          questions: true,
          project: true,
          assigneeUser: { select: { id: true, name: true, image: true } },
          initiative: { select: { id: true, title: true } },
          blockedBy: { select: { id: true, ticketId: true, title: true, status: true } },
          blocking: { select: { id: true, ticketId: true, title: true, status: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take,
        skip,
      }),
      prisma.task.count({ where }),
    ]);
    return Response.json({ tasks, total, take, skip });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = await rateLimitOrNull("tasks-create", { limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;

  // Allow internal service-to-service auth via x-internal-secret (agent calls)
  const isInternal = verifyInternalSecret(request);
  const user = isInternal ? null : await requireOwner();
  if (!isInternal && !user) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      priority,
      agentId,
      projectId,
      initiativeId,
      assigneeType,
      assigneeUserId,
      blockedByIds,
      type,
      acceptanceCriteria,
      verificationCommand,
    } = parsed.data;

    const resolvedAssigneeType: AssigneeType = assigneeType ?? "AGENT";

    // Validate assignee requirements
    if (resolvedAssigneeType === "AGENT" && !agentId) {
      return Response.json(
        { error: "agentId is required when assigneeType is AGENT" },
        { status: 400 }
      );
    }
    if (
      (resolvedAssigneeType === "OWNER" || resolvedAssigneeType === "CLIENT") &&
      !assigneeUserId
    ) {
      return Response.json(
        { error: "assigneeUserId is required when assigneeType is OWNER or CLIENT" },
        { status: 400 }
      );
    }

    // Auto-generate ticketId
    let prefix = "TASK";
    if (resolvedAssigneeType === "OWNER") {
      prefix = "OWN";
    } else if (resolvedAssigneeType === "CLIENT") {
      prefix = "CLT";
    } else if (agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        prefix = agent.name.toUpperCase().slice(0, 3);
      }
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const count = await prisma.task.count({
      where: {
        ticketId: { startsWith: `${prefix}-${dateStr}` },
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });

    const ticketId = `${prefix}-${dateStr}-${String(count + 1).padStart(4, "0")}`;

    const task = await prisma.task.create({
      data: {
        ticketId,
        title,
        description: description || null,
        priority: priority ?? 0,
        type: (type as TaskType) ?? "FEATURE",
        agentId: agentId || null,
        projectId: projectId || null,
        initiativeId: initiativeId,
        assigneeType: resolvedAssigneeType,
        assigneeUserId: assigneeUserId || null,
        acceptanceCriteria: acceptanceCriteria || null,
        verificationCommand: verificationCommand || null,
        ...(blockedByIds && blockedByIds.length > 0 && {
          blockedBy: { connect: (blockedByIds as string[]).map((id) => ({ id })) },
        }),
      },
      include: {
        agent: true,
        questions: true,
        project: true,
        assigneeUser: { select: { id: true, name: true, image: true } },
        initiative: { select: { id: true, title: true } },
        blockedBy: { select: { id: true, ticketId: true, title: true, status: true } },
        blocking: { select: { id: true, ticketId: true, title: true, status: true } },
      },
    });

    return Response.json(task, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return Response.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
