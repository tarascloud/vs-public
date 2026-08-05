import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch agents with their tasks
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      include: {
        tasks: {
          include: {
            project: { select: { id: true, name: true } },
          },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    // Fetch recent tasks (last 10 updated)
    const recentTasks = await prisma.task.findMany({
      include: {
        agent: { select: { id: true, displayName: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    // Task stats via groupBy (single aggregation query; avoids loading every row)
    const stats = await prisma.task.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const countFor = (status: string) =>
      stats.find((s) => s.status === status)?._count._all ?? 0;

    const taskStats = {
      TODO: countFor("TODO"),
      IN_PROGRESS: countFor("IN_PROGRESS"),
      BLOCKED: countFor("BLOCKED"),
      TESTING: countFor("TESTING"),
      DONE: countFor("DONE"),
    };

    return Response.json({
      agents,
      recentTasks,
      taskStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Studio status error:", error);
    return Response.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
