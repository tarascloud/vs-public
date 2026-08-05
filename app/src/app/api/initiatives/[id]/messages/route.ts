import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireAuth, requireProjectAccess, verifyInternalSecret } from "@/lib/auth-helpers";
import { fireInitiativeCallback } from "@/lib/initiative-callback";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const isInternal = verifyInternalSecret(request);
  const user = isInternal ? null : await requireAuth();
  if (!user && !isInternal) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    // REV-2026-06-01 (VS-tenant-isolation): enforce per-project access
    // before returning initiative messages. Previously any authenticated
    // user could read messages of any initiative across all projects.
    if (user) {
      const initiative = await prisma.initiative.findUnique({
        where: { id },
        select: { projectId: true },
      });
      if (!initiative) {
        return Response.json({ error: "Initiative not found" }, { status: 404 });
      }
      const denied = await requireProjectAccess(user, initiative.projectId);
      if (denied) return denied;
    }

    const messages = await prisma.initiativeMessage.findMany({
      where: { initiativeId: id },
      include: {
        fromUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return Response.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  const isInternal = verifyInternalSecret(request);
  if (!user && !isInternal) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const { type, content, fromAgent } = body;

    if (!content || !content.trim()) {
      return Response.json({ error: "Content is required" }, { status: 400 });
    }

    // Verify initiative exists
    const initiative = await prisma.initiative.findUnique({ where: { id } });
    if (!initiative) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    // REV-2026-06-01 (VS-tenant-isolation): enforce per-project access on
    // POST. Internal callers (x-internal-secret) bypass — agents call
    // across projects. Authenticated users must have ProjectAccess.
    if (user) {
      const denied = await requireProjectAccess(user, initiative.projectId);
      if (denied) return denied;
    }

    const message = await prisma.initiativeMessage.create({
      data: {
        initiativeId: id,
        type: type || "info",
        content: content.trim(),
        fromAgent: fromAgent || null,
        fromUserId: userId || null,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
      },
    });

    // Send Telegram notification for questions and blockers
    const messageType = type || "info";
    if (messageType === "question" || messageType === "blocker") {
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
            type: messageType,
            content: content.trim(),
          }),
        });
      } catch (notifyError) {
        console.error("Failed to send Telegram notification:", notifyError);
        // Don't fail the request if notification fails
      }
    }

    // Fire callback to external systems for questions and blockers
    if (messageType === "question" || messageType === "blocker") {
      fireInitiativeCallback(id, "initiative_message", {
        messageType,
        content: content.trim(),
        fromAgent: fromAgent || null,
      }).catch(() => {});
    }

    return Response.json(message, { status: 201 });
  } catch (error) {
    console.error("Failed to create message:", error);
    return Response.json({ error: "Failed to create message" }, { status: 500 });
  }
}
