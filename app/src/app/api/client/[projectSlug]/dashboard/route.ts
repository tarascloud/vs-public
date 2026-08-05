import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function getProjectWithAccess(projectSlug: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
  });

  if (!project) return null;

  const access = await prisma.projectAccess.findUnique({
    where: { userId_projectId: { userId, projectId: project.id } },
  });

  if (!access) return null;
  return project;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    let project;
    if (user?.role === "OWNER") {
      project = await prisma.project.findUnique({ where: { slug: projectSlug } });
    } else {
      project = await getProjectWithAccess(projectSlug, session.user.id);
    }

    if (!project) {
      return Response.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Fetch all tasks with relations
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        agent: { select: { id: true, displayName: true, name: true } },
        taskQuestions: { orderBy: { createdAt: "desc" } },
        feedbacks: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    // Fetch last 5 project updates
    const updates = await prisma.projectUpdate.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Compute stats
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "DONE").length;
    const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;
    const progressPercent =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const pendingQuestions = tasks.flatMap((t) =>
      t.taskQuestions
        .filter((q) => q.status === "PENDING")
        .map((q) => ({ ...q, task: { id: t.id, ticketId: t.ticketId, title: t.title } }))
    );

    // Tasks awaiting feedback = DONE tasks with no approved feedback
    const awaitingFeedbackTasks = tasks.filter((t) => {
      if (t.status !== "DONE") return false;
      const hasApproved = t.feedbacks.some((f) => f.approved);
      return !hasApproved;
    });

    // Build unified recent activity (last 10 events)
    type ActivityEvent = {
      id: string;
      type: "task_done" | "task_started" | "question" | "feedback" | "update";
      title: string;
      description: string;
      date: string;
      agentName: string | null;
    };

    const events: ActivityEvent[] = [];

    // Task events — done/in_progress
    for (const task of tasks) {
      if (task.status === "DONE" || task.status === "IN_PROGRESS") {
        events.push({
          id: `task-${task.id}`,
          type: task.status === "DONE" ? "task_done" : "task_started",
          title: task.title,
          description: task.ticketId,
          date: task.updatedAt.toISOString(),
          agentName: task.agent?.displayName ?? null,
        });
      }
      // Question events
      for (const q of task.taskQuestions) {
        events.push({
          id: `q-${q.id}`,
          type: "question",
          title: q.question.slice(0, 80) + (q.question.length > 80 ? "…" : ""),
          description: task.ticketId,
          date: q.createdAt.toISOString(),
          agentName: task.agent?.displayName ?? null,
        });
      }
      // Feedback events
      for (const f of task.feedbacks) {
        events.push({
          id: `fb-${f.id}`,
          type: "feedback",
          title: f.comment.slice(0, 80) + (f.comment.length > 80 ? "…" : ""),
          description: task.ticketId,
          date: f.createdAt.toISOString(),
          agentName: task.agent?.displayName ?? null,
        });
      }
    }

    // Project update events
    for (const u of updates) {
      events.push({
        id: `update-${u.id}`,
        type: "update",
        title: u.title,
        description: u.type,
        date: u.createdAt.toISOString(),
        agentName: null,
      });
    }

    // Sort by date desc, take 10
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentActivity = events.slice(0, 10);

    // Last updated
    const lastUpdated =
      tasks.length > 0
        ? tasks
            .map((t) => t.updatedAt)
            .sort((a, b) => b.getTime() - a.getTime())[0]
            .toISOString()
        : null;

    return Response.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        techStack: project.techStack,
        url: project.url,
        updatedAt: project.updatedAt.toISOString(),
      },
      stats: {
        total: totalTasks,
        done: doneTasks,
        inProgress: inProgressTasks,
        blocked: blockedTasks,
        pendingQuestions: pendingQuestions.length,
        awaitingFeedback: awaitingFeedbackTasks.length,
        progressPercent,
        lastUpdated,
      },
      pendingQuestions: pendingQuestions.slice(0, 5).map((q) => ({
        id: q.id,
        question: q.question,
        task: q.task,
        createdAt: q.createdAt.toISOString(),
      })),
      awaitingFeedbackTasks: awaitingFeedbackTasks.slice(0, 5).map((t) => ({
        id: t.id,
        ticketId: t.ticketId,
        title: t.title,
        agentName: t.agent?.displayName ?? null,
        updatedAt: t.updatedAt.toISOString(),
      })),
      recentActivity,
      updates: updates.map((u) => ({
        id: u.id,
        title: u.title,
        description: u.description,
        type: u.type,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch client dashboard:", error);
    return Response.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
