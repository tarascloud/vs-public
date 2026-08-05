import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { fireInitiativeCallback } from "@/lib/initiative-callback";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        tasks: {
          include: {
            blockedBy: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!initiative) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    if (initiative.status !== "PLANNED") {
      return Response.json(
        { error: `Initiative must be in PLANNED status (current: ${initiative.status})` },
        { status: 400 }
      );
    }

    // Change initiative status to IN_PROGRESS
    await prisma.initiative.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });

    // Find tasks without active blockers (ready to start)
    const readyTasks = initiative.tasks.filter((task) => {
      const activeBlockers = task.blockedBy.filter((b) => b.status !== "DONE");
      return activeBlockers.length === 0 && task.status === "TODO";
    });

    // Mark ready tasks as IN_PROGRESS
    let tasksStarted = 0;
    for (const task of readyTasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS" },
      });
      tasksStarted++;
    }

    // Add execution message
    await prisma.initiativeMessage.create({
      data: {
        initiativeId: id,
        type: "info",
        content: `Execution started: ${tasksStarted} task(s) assigned to agents.`,
        fromAgent: "system",
      },
    });

    // Notify via Telegram
    try {
      const baseUrl = process.env.NEXTAUTH_URL || "https://vibe-studio.example.com";
      await fetch(`${baseUrl}/api/telegram/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_API_SECRET && {
            "x-internal-secret": process.env.INTERNAL_API_SECRET,
          }),
        },
        body: JSON.stringify({
          initiativeId: id,
          type: "status_change",
          content: "IN_PROGRESS",
        }),
      });
    } catch {
      // non-critical
    }

    // Fire callback to external systems (e.g. SH)
    const allTasks = await prisma.task.findMany({
      where: { initiativeId: id },
      select: { id: true, title: true, status: true, completionNote: true },
    });
    fireInitiativeCallback(id, "initiative_status_changed", {
      status: "IN_PROGRESS",
      tasks: allTasks,
    }).catch(() => {});

    return Response.json({
      success: true,
      tasksStarted,
      initiativeStatus: "IN_PROGRESS",
    });
  } catch (error) {
    console.error("Failed to execute initiative:", error);
    return Response.json({ error: "Failed to execute initiative" }, { status: 500 });
  }
}
