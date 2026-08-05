import { prisma } from "@/lib/prisma";
import { requireAuthApi, requireOwnerApi } from "@/lib/auth-helpers";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const _gate = await requireAuthApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  try {
    const activities = await prisma.agentActivity.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { id: true, displayName: true, name: true } },
        task: { select: { id: true, title: true, ticketId: true } },
      },
    });

    return Response.json(activities);
  } catch (error) {
    console.error("Activity feed GET error:", error);
    return Response.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

const CreateActivitySchema = z.object({
  agentId: z.string().min(1),
  action: z.string().min(1),
  details: z.string().optional(),
  taskId: z.string().optional(),
});

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const { agentId, action, details, taskId } = parsed.data;

  try {
    const activity = await prisma.agentActivity.create({
      data: {
        agentId,
        action,
        details,
        taskId: taskId ?? null,
      },
      include: {
        agent: { select: { id: true, displayName: true, name: true } },
        task: { select: { id: true, title: true, ticketId: true } },
      },
    });

    return Response.json(activity, { status: 201 });
  } catch (error) {
    console.error("Activity feed POST error:", error);
    return Response.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
