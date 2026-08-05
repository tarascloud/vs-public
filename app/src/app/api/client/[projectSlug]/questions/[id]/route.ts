import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function hasProjectAccess(projectSlug: string, userId: string, userRole: string): Promise<boolean> {
  if (userRole === "OWNER") return true;

  const nameFromSlug = projectSlug.replace(/-/g, " ");
  const project = await prisma.project.findFirst({
    where: { name: { equals: nameFromSlug, mode: "insensitive" } },
  });

  if (!project) return false;

  const access = await prisma.projectAccess.findUnique({
    where: { userId_projectId: { userId, projectId: project.id } },
  });

  return !!access;
}

// POST /api/client/[projectSlug]/questions/[id]/answer
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectSlug: string; id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug, id: questionId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const canAccess = await hasProjectAccess(projectSlug, session.user.id, user?.role ?? "CLIENT");
    if (!canAccess) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }

    const question = await prisma.taskQuestion.findUnique({
      where: { id: questionId },
      include: { task: { select: { projectId: true } } },
    });

    if (!question) {
      return Response.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.status === "ANSWERED") {
      return Response.json({ error: "Question already answered" }, { status: 400 });
    }

    const body = await request.json();
    const { answer } = body as { answer: string };

    if (!answer?.trim()) {
      return Response.json({ error: "Answer is required" }, { status: 400 });
    }

    const updated = await prisma.taskQuestion.update({
      where: { id: questionId },
      data: {
        answer: answer.trim(),
        status: "ANSWERED",
        answeredAt: new Date(),
      },
      include: {
        task: { select: { id: true, ticketId: true, title: true } },
      },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Failed to answer question:", error);
    return Response.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
