import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

async function getProjectWithAccess(projectSlug: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
  });

  if (!project) return null;

  // Check access
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

    // OWNER can access all projects
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
      return Response.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        agent: { select: { id: true, displayName: true, name: true } },
        questions: true,
        taskQuestions: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return Response.json({ project, tasks });
  } catch (error) {
    console.error("Failed to fetch client tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
