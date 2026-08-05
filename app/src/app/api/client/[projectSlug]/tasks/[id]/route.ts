import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function hasProjectAccess(projectSlug: string, userId: string, userRole: string): Promise<boolean> {
  if (userRole === "OWNER") return true;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
  });

  if (!project) return false;

  const access = await prisma.projectAccess.findUnique({
    where: { userId_projectId: { userId, projectId: project.id } },
  });

  return !!access;
}

// POST /api/client/[projectSlug]/tasks/[id]/feedback
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectSlug: string; id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug, id: taskId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const canAccess = await hasProjectAccess(projectSlug, session.user.id, user?.role ?? "CLIENT");
    if (!canAccess) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();
    const { comment, approved } = body as { comment: string; approved: boolean };

    if (!comment?.trim()) {
      return Response.json({ error: "Comment is required" }, { status: 400 });
    }

    const feedback = await prisma.taskFeedback.create({
      data: {
        taskId,
        userId: session.user.id,
        comment: comment.trim(),
        approved: approved ?? false,
      },
    });

    return Response.json(feedback, { status: 201 });
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return Response.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}
