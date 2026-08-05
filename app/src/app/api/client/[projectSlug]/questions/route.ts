import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function getProjectWithAccess(projectSlug: string, userId: string, userRole: string) {
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
  });

  if (!project) return null;

  if (userRole === "OWNER") return project;

  const access = await prisma.projectAccess.findUnique({
    where: { userId_projectId: { userId, projectId: project.id } },
  });

  return access ? project : null;
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

    const project = await getProjectWithAccess(projectSlug, session.user.id, user?.role ?? "CLIENT");
    if (!project) {
      return Response.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Fetch pending TaskQuestions for tasks in this project
    const questions = await prisma.taskQuestion.findMany({
      where: {
        status: "PENDING",
        task: { projectId: project.id },
      },
      include: {
        task: {
          select: { id: true, ticketId: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ project, questions });
  } catch (error) {
    console.error("Failed to fetch client questions:", error);
    return Response.json({ error: "Failed to fetch questions" }, { status: 500 });
  }
}
