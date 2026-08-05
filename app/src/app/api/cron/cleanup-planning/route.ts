import { prisma } from "@/lib/prisma";
import { fireInitiativeCallback } from "@/lib/initiative-callback";
import { verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 10;

/**
 * GET /api/cron/cleanup-planning
 *
 * Reverts initiatives stuck in PLANNING for longer than STALE_MINUTES
 * back to IDEA status. Adds a system message explaining the revert.
 *
 * Also promotes PLANNING initiatives with 100% completed tasks to DONE.
 */
export async function GET(request: Request) {
  if (!verifyInternalSecret(request, "CRON_SECRET", "x-cron-secret")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  // 1. Stale PLANNING initiatives (timeout expired)
  const stalePlanning = await prisma.initiative.findMany({
    where: {
      status: "PLANNING",
      updatedAt: { lt: cutoff },
    },
    include: {
      tasks: { select: { status: true } },
    },
  });

  // 2. IDEA initiatives that already have tasks (status never got updated)
  const staleIdeas = await prisma.initiative.findMany({
    where: {
      status: "IDEA",
      tasks: { some: {} },
    },
    include: {
      tasks: { select: { status: true } },
    },
  });

  const staleInitiatives = [...stalePlanning, ...staleIdeas];
  const results: { id: string; title: string | null; action: string }[] = [];

  for (const init of staleInitiatives) {
    const totalTasks = init.tasks.length;
    const doneTasks = init.tasks.filter((t) => t.status === "DONE").length;
    const allDone = totalTasks > 0 && doneTasks === totalTasks;

    if (allDone) {
      // All tasks done — promote to DONE
      await prisma.initiative.update({
        where: { id: init.id },
        data: { status: "DONE" as never },
      });
      await prisma.initiativeMessage.create({
        data: {
          initiativeId: init.id,
          type: "info",
          content: `Auto-promoted to DONE — all ${totalTasks} tasks completed.`,
          fromAgent: "system",
        },
      });
      fireInitiativeCallback(init.id, "initiative_status_changed", {
        status: "DONE",
        tasks: init.tasks,
      }).catch(() => {});
      results.push({ id: init.id, title: init.title, action: "promoted_to_done" });
    } else if (totalTasks > 0) {
      // Has tasks but not all done — promote to PLANNED
      await prisma.initiative.update({
        where: { id: init.id },
        data: { status: "PLANNED" as never },
      });
      await prisma.initiativeMessage.create({
        data: {
          initiativeId: init.id,
          type: "info",
          content: `Auto-promoted to PLANNED — ${doneTasks}/${totalTasks} tasks. Status was stuck in ${init.status}.`,
          fromAgent: "system",
        },
      });
      fireInitiativeCallback(init.id, "initiative_status_changed", {
        status: "PLANNED",
        tasks: init.tasks,
      }).catch(() => {});
      results.push({ id: init.id, title: init.title, action: "promoted_to_planned" });
    } else {
      // PLANNING with no tasks — revert to IDEA, fire callback so SH knows.
      // Include diagnostics so the owner can see where the pipeline stalled
      // instead of a generic "timed out" message. After the 2026-04-19
      // INTERNAL_API_SECRET regression, a bare "timed out" offered zero
      // hint that Infisical had dropped a required key.
      const ageMinutes = Math.round(
        (Date.now() - init.updatedAt.getTime()) / 60000,
      );
      const diagnostics = [
        `Auto-planning timed out after ~${ageMinutes} min with 0 tasks. Reverted PLANNING to IDEA.`,
        "",
        "Diagnostic hints (run on VPS):",
        `  1. Stuck for ${ageMinutes} min — check what happened around that window`,
        `  2. journalctl --since "${ageMinutes} minutes ago" | grep -i plan`,
        "  3. tmux list-sessions   # verify Claude agent session is alive",
        "  4. grep x-internal-secret /opt/docker/secrets/.vs.env   # secret present?",
        "  5. bash /opt/docker/scripts/poll-planning.sh   # manual run, check exit code",
        "",
        "Secrets audit runs daily 07:00 UTC — also check its last run.",
      ].join("\n");
      await prisma.initiative.update({
        where: { id: init.id },
        data: { status: "IDEA" as never },
      });
      await prisma.initiativeMessage.create({
        data: {
          initiativeId: init.id,
          type: "blocker",
          content: diagnostics,
          fromAgent: "system",
        },
      });
      fireInitiativeCallback(init.id, "initiative_status_changed", {
        status: "IDEA",
        tasks: [],
      }).catch(() => {});
      results.push({ id: init.id, title: init.title, action: "reverted_to_idea" });
    }
  }

  return Response.json({
    checked: staleInitiatives.length,
    actions: results,
  });
}
