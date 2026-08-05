import { prisma } from "@/lib/prisma";
import { verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/pending-tasks
 *
 * Returns IN_PROGRESS tasks that haven't been picked up by an agent yet.
 * A task is "pending execution" if it's IN_PROGRESS and has no completionNote,
 * no commitHash, and no agentActivity (never started).
 * Called by poll-execution.sh on VPS every 3 minutes.
 */
export async function GET(request: Request) {
  if (!verifyInternalSecret(request, "CRON_SECRET", "x-cron-secret")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const pending = await prisma.task.findMany({
    where: {
      status: "IN_PROGRESS",
      completionNote: null,
      commitHash: null,
    },
    include: {
      agent: { select: { id: true, name: true, displayName: true, role: true } },
      initiative: {
        select: {
          id: true,
          title: true,
          rawIdea: true,
          callbackUrl: true,
          project: { select: { name: true, slug: true } },
        },
      },
      blockedBy: { select: { id: true, status: true, title: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  // Filter out tasks with active blockers
  const ready = pending.filter((t) => {
    const activeBlockers = t.blockedBy.filter((b) => b.status !== "DONE");
    return activeBlockers.length === 0;
  });

  // Group by initiative for efficient processing
  const byInitiative = new Map<string, typeof ready>();
  for (const task of ready) {
    const initId = task.initiative.id;
    if (!byInitiative.has(initId)) byInitiative.set(initId, []);
    byInitiative.get(initId)!.push(task);
  }

  const baseUrl = process.env.NEXTAUTH_URL || "https://vibe-studio.example.com";
  // DEV-20260512-0006: never echo secrets in response body — agent reads from its own env.
  const hasSecret = Boolean(process.env.INTERNAL_API_SECRET);

  const groups = Array.from(byInitiative.entries()).map(([initId, tasks]) => ({
    initiativeId: initId,
    initiativeTitle: tasks[0].initiative.title,
    project: tasks[0].initiative.project?.name || "Unknown",
    projectSlug: tasks[0].initiative.project?.slug || "",
    tasks: tasks.map((t) => ({
      id: t.id,
      ticketId: t.ticketId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      acceptanceCriteria: t.acceptanceCriteria,
      agent: t.agent ? { name: t.agent.name, role: t.agent.role } : null,
    })),
    api: {
      taskUpdateUrl: `${baseUrl}/api/tasks`,
      messagesUrl: `${baseUrl}/api/initiatives/${initId}/messages`,
      // Secret omitted from response — agent reads INTERNAL_API_SECRET from its own env.
      secretConfigured: hasSecret,
    },
  }));

  return Response.json({
    count: ready.length,
    groups,
  });
}
