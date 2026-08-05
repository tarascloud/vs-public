import { prisma } from "@/lib/prisma";
import { verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// PLANNING initiatives: pick up after 1 minute (avoids race with just-created)
const PLANNING_MIN_AGE_SECONDS = 60;
// IDEA initiatives: pick up after 2 hours (gives owner time to refine before auto-planning)
const IDEA_MIN_AGE_SECONDS = 2 * 60 * 60;

/**
 * GET /api/cron/pending-plans
 *
 * Returns PLANNING and stale IDEA initiatives that need COO agent to process them.
 * Called by poll-planning.sh on VPS every 2 minutes.
 *
 * - PLANNING: picked up after 1 minute (explicit planning request)
 * - IDEA: picked up after 2 hours (auto-escalation for forgotten ideas)
 *   These are auto-promoted to PLANNING status to avoid re-processing.
 */
export async function GET(request: Request) {
  if (!verifyInternalSecret(request, "CRON_SECRET", "x-cron-secret")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const planningCutoff = new Date(Date.now() - PLANNING_MIN_AGE_SECONDS * 1000);
  const ideaCutoff = new Date(Date.now() - IDEA_MIN_AGE_SECONDS * 1000);

  // Fetch PLANNING initiatives (explicit planning request)
  const planning = await prisma.initiative.findMany({
    where: {
      status: "PLANNING",
      updatedAt: { lt: planningCutoff },
      tasks: { none: {} },
    },
    include: {
      project: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Fetch stale IDEA initiatives (forgotten, no tasks, older than 2h)
  const staleIdeas = await prisma.initiative.findMany({
    where: {
      status: "IDEA",
      updatedAt: { lt: ideaCutoff },
      tasks: { none: {} },
    },
    include: {
      project: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Auto-promote stale IDEAs to PLANNING so they don't get re-fetched
  if (staleIdeas.length > 0) {
    await prisma.initiative.updateMany({
      where: { id: { in: staleIdeas.map((i) => i.id) } },
      data: { status: "PLANNING" },
    });
  }

  const pending = [...planning, ...staleIdeas];

  // Get agents for context
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { name: true, role: true },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://vibe-studio.example.com";
  // DEV-20260512-0006: never echo secrets in response body — agent reads from its own env.
  const hasSecret = Boolean(process.env.INTERNAL_API_SECRET);

  const plans = pending.map((init) => ({
    id: init.id,
    title: init.title,
    rawIdea: init.rawIdea,
    project: init.project?.name || "Unknown",
    author: init.user?.name || "Unknown",
    agents: agents.map((a) => `${a.name}: ${a.role}`),
    callbackInstructions: {
      messageUrl: `${baseUrl}/api/initiatives/${init.id}/messages`,
      statusUrl: `${baseUrl}/api/initiatives/${init.id}`,
      // Secret omitted from response — agent reads INTERNAL_API_SECRET from its own env.
      secretConfigured: hasSecret,
    },
  }));

  return Response.json({ count: plans.length, plans });
}
