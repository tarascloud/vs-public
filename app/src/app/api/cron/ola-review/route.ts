import { prisma } from "@/lib/prisma";
import { verifyInternalSecret } from "@/lib/auth-helpers";
import { evaluateTaskClarity } from "@/lib/evaluate-task-clarity";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ola-review
 *
 * Hourly cron: Ola (COO) reviews new tasks assigned to her for review.
 * - Finds BLOCKED tasks assigned to "coo" agent with pending review questions
 * - For each task, checks if the formulation is clear enough
 * - If task looks good: removes the review question, unblocks task, reassigns to appropriate agent
 * - If task needs clarification: adds specific questions and assigns to the task creator
 */
export async function GET(request: Request) {
  if (!verifyInternalSecret(request, "CRON_SECRET", "x-cron-secret")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cooAgent = await prisma.agent.findUnique({ where: { name: "coo" } });
    if (!cooAgent) {
      return Response.json({ error: "COO agent not found" }, { status: 404 });
    }

    // Find tasks assigned to Ola that are BLOCKED (pending review)
    const tasksToReview = await prisma.task.findMany({
      where: {
        agentId: cooAgent.id,
        status: "BLOCKED",
        questions: {
          some: {
            status: "PENDING",
            text: { contains: "review this task" },
          },
        },
      },
      include: {
        questions: true,
        initiative: { select: { id: true, title: true, rawIdea: true } },
        project: { select: { id: true, name: true } },
        assigneeUser: { select: { id: true, name: true } },
      },
    });

    if (tasksToReview.length === 0) {
      return Response.json({ message: "No tasks to review", reviewed: 0 });
    }

    const results: { taskId: string; ticketId: string; action: string }[] = [];

    for (const task of tasksToReview) {
      const clarity = evaluateTaskClarity({
        title: task.title,
        description: task.description,
        initiativeTitle: task.initiative?.title,
        initiativeRawIdea: task.initiative?.rawIdea,
      });

      if (clarity.clear) {
        // Task looks good — approve it
        // Mark review question as answered
        const reviewQ = task.questions.find(
          (q) => q.status === "PENDING" && q.text.includes("review this task")
        );
        if (reviewQ) {
          await prisma.question.update({
            where: { id: reviewQ.id },
            data: {
              status: "ANSWERED",
              answer: "Ola: Task formulation approved. Ready for execution.",
              updatedAt: new Date(),
            },
          });
        }

        // Unblock task — set to TODO
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "TODO" },
        });

        results.push({ taskId: task.id, ticketId: task.ticketId, action: "approved" });
      } else {
        const issues = clarity.issues;
        // Mark original review question as answered with findings
        const reviewQ = task.questions.find(
          (q) => q.status === "PENDING" && q.text.includes("review this task")
        );
        if (reviewQ) {
          await prisma.question.update({
            where: { id: reviewQ.id },
            data: {
              status: "ANSWERED",
              answer: `Ola: Task needs clarification. Issues: ${issues.join("; ")}`,
              updatedAt: new Date(),
            },
          });
        }

        // Add new question for the task creator
        await prisma.question.create({
          data: {
            taskId: task.id,
            text: `Ola review: ${issues.join(". ")}. Please update the task and reassign to COO for re-review.`,
            status: "PENDING",
          },
        });

        // Keep task BLOCKED, assign back to creator if known
        // Task stays assigned to Ola but blocked with questions for creator
        results.push({ taskId: task.id, ticketId: task.ticketId, action: "needs_clarification" });
      }
    }

    return Response.json({
      message: `Reviewed ${results.length} tasks`,
      results,
    });
  } catch (error) {
    console.error("Ola review cron failed:", error);
    return Response.json({ error: "Review failed" }, { status: 500 });
  }
}
