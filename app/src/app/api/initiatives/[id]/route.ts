import { prisma } from "@/lib/prisma";
import { requireOwnerApi, verifyInternalSecret } from "@/lib/auth-helpers";
import { updateInitiativeSchema } from "@/lib/validations";
import { fireInitiativeCallback } from "@/lib/initiative-callback";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(_request)) {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const user = _gate.user;
  }

  const { id } = await params;

  try {
    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
        tasks: {
          include: {
            agent: { select: { id: true, displayName: true } },
            project: { select: { id: true, name: true } },
            assigneeUser: { select: { id: true, name: true } },
            blockedBy: { select: { id: true, ticketId: true, title: true, status: true } },
            blocking: { select: { id: true, ticketId: true, title: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          include: {
            fromUser: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!initiative) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    return Response.json(initiative);
  } catch (error) {
    console.error("Failed to fetch initiative:", error);
    return Response.json({ error: "Failed to fetch initiative" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Accept either an authenticated owner session or a valid internal agent secret
  const agentCall = verifyInternalSecret(request);
  if (!agentCall) {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const user = _gate.user;
  }

  const { id } = await params;

  try {

    const body = await request.json();
    const parsed = updateInitiativeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, status, summary, projectId, priority } = parsed.data;

    const existing = await prisma.initiative.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    const data: Prisma.InitiativeUncheckedUpdateInput = {
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(summary !== undefined && { summary }),
      ...(projectId !== undefined && { projectId: projectId || undefined }),
      ...(priority !== undefined && { priority }),
    };

    const initiative = await prisma.initiative.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            assigneeType: true,
            ticketId: true,
            priority: true,
            _count: { select: { blockedBy: true } },
          },
        },
        messages: true,
      },
    });

    // Notify client via Telegram on status change
    if (status !== undefined && status !== existing.status) {
      try {
        const baseUrl =
          process.env.NEXTAUTH_URL || "https://vibe-studio.example.com";
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
            content: status,
          }),
        });
      } catch (notifyError) {
        console.error("Failed to send Telegram notification:", notifyError);
      }

      // Fire callback to external systems
      const tasksForCallback = await prisma.task.findMany({
        where: { initiativeId: id },
        select: { id: true, title: true, status: true, completionNote: true },
      });
      fireInitiativeCallback(id, "initiative_status_changed", {
        status,
        tasks: tasksForCallback,
      }).catch(() => {});
    }

    return Response.json(initiative);
  } catch (error) {
    console.error("Failed to update initiative:", error);
    return Response.json({ error: "Failed to update initiative" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const existing = await prisma.initiative.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    // Cascade chain (all FK-level, see migration 20260601_task_initiative_cascade_delete):
    //   Initiative
    //     -> Task (onDelete: Cascade)              [via Task.initiativeId FK]
    //          -> Question (onDelete: Cascade)
    //          -> TaskQuestion (onDelete: Cascade)
    //          -> TaskFeedback (onDelete: Cascade)
    //          -> AgentActivity (onDelete: Cascade)
    //          -> _TaskDependencies rows (CASCADE on both A and B FKs)
    //     -> InitiativeMessage (onDelete: Cascade) [via InitiativeMessage.initiativeId FK]
    await prisma.initiative.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete initiative:", error);
    return Response.json({ error: "Failed to delete initiative" }, { status: 500 });
  }
}
