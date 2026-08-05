import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; qid: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id, qid } = await params;

  try {
    const body = await request.json();
    const { answer } = body;

    if (!answer) {
      return Response.json({ error: "Answer is required" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({ where: { id: qid } });
    if (!question || question.taskId !== id) {
      return Response.json({ error: "Question not found" }, { status: 404 });
    }

    const updated = await prisma.question.update({
      where: { id: qid },
      data: {
        answer,
        status: "ANSWERED",
      },
    });

    // Check if all questions for this task are answered — if so, unblock
    const pendingCount = await prisma.question.count({
      where: { taskId: id, status: "PENDING" },
    });

    if (pendingCount === 0) {
      const task = await prisma.task.findUnique({ where: { id } });
      if (task && task.status === "BLOCKED") {
        await prisma.task.update({
          where: { id },
          data: { status: "TODO" },
        });
      }
    }

    return Response.json(updated);
  } catch (error) {
    console.error("Failed to answer question:", error);
    return Response.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
