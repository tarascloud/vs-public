import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { rateLimitOrNull } from "@/lib/rate-limit";
import { verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/initiatives/[id]/plan
 *
 * Sets initiative status to PLANNING and adds a "processing" message.
 * Actual planning is done by poll-planning.sh cron on VPS which polls
 * /api/cron/pending-plans and sends prompt to Claude Code tmux session.
 *
 * No Telegram trigger or in-memory setTimeout — cron is the single
 * reliable mechanism (survives restarts, doesn't depend on TG plugin).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const blocked = await rateLimitOrNull("initiative-plan", { limit: 10, windowMs: 60_000 });
    if (blocked) return blocked;

    const isInternal = verifyInternalSecret(_request);
    if (!isInternal) {
      const session = await auth();
      if (!session?.user?.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const initiative = await prisma.initiative.findUnique({
      where: { id },
    });

    if (!initiative) {
      return Response.json({ error: "Initiative not found" }, { status: 404 });
    }

    // Update status to PLANNING
    await prisma.initiative.update({
      where: { id },
      data: { status: "PLANNING" },
    });

    // Add planning message to initiative chat
    await prisma.initiativeMessage.create({
      data: {
        initiativeId: id,
        type: "info",
        content: "Дякую за ідею! Я аналізую її і розбиваю на конкретні задачі. Це займе кілька хвилин...",
        fromAgent: "coo",
      },
    });

    return Response.json({
      initiative: { id, status: "PLANNING" },
      message: "Initiative queued for planning. Cron will pick it up within 2 minutes.",
    });
  } catch (error) {
    console.error("Failed to trigger planning:", error);
    return Response.json({ error: "Failed to trigger planning" }, { status: 500 });
  }
}
