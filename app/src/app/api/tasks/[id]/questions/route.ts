import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const questions = await prisma.question.findMany({
      where: { taskId: id },
      include: { askedBy: true },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(questions);
  } catch (error) {
    console.error("Failed to fetch questions:", error);
    return Response.json({ error: "Failed to fetch questions" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return Response.json({ error: "Question text is required" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const question = await prisma.question.create({
      data: {
        taskId: id,
        text,
      },
    });

    // Auto-block task when question is added
    if (task.status !== "BLOCKED") {
      await prisma.task.update({
        where: { id },
        data: { status: "BLOCKED" },
      });
    }

    return Response.json(question, { status: 201 });
  } catch (error) {
    console.error("Failed to create question:", error);
    return Response.json({ error: "Failed to create question" }, { status: 500 });
  }
}
