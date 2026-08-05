import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { createInitiativeSchema } from "@/lib/validations";
import { rateLimitOrNull } from "@/lib/rate-limit";
import { verifyInternalSecret } from "@/lib/auth-helpers";
import type { InitiativeWhereInput } from "@/generated/prisma/models";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const userRole = session?.user?.role;
    const hasInternalSecret = verifyInternalSecret(request);

    if (!userId && !hasInternalSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    let baseWhere: InitiativeWhereInput = {};
    if (hasInternalSecret || userRole === "OWNER") {
      baseWhere = {};
    } else if (userId) {
      // CLIENT users see initiatives from their assigned projects
      const accessibleProjects = await prisma.projectAccess.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const projectIds = accessibleProjects.map((p) => p.projectId).filter(Boolean) as string[];
      baseWhere = projectIds.length > 0 ? { projectId: { in: projectIds } } : { userId };
    }
    const where: InitiativeWhereInput = projectId ? { ...baseWhere, projectId } : baseWhere;

    // Canary dead-man's-switch initiatives (canary-planning.sh, daily 08:30 UTC)
    // live for ~2 min each. They must never show up in /studio/ideas —
    // seeing them briefly appear and vanish every morning is noise.
    const filteredWhere: InitiativeWhereInput = {
      ...where,
      NOT: [
        ...(Array.isArray(where.NOT) ? where.NOT : where.NOT ? [where.NOT] : []),
        { title: { startsWith: "canary-" } },
      ],
    };

    const initiatives = await prisma.initiative.findMany({
      where: filteredWhere,
      include: {
        user: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            ticketId: true,
            title: true,
            status: true,
            priority: true,
            assigneeType: true,
            assigneeUser: { select: { id: true, name: true, image: true } },
            agent: { select: { id: true, displayName: true, role: true } },
            tokensUsed: true,
            blockedBy: { select: { id: true, title: true, status: true } },
            blocking: { select: { id: true, title: true, status: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return Response.json(initiatives);
  } catch (error) {
    console.error("Failed to fetch initiatives:", error);
    return Response.json({ error: "Failed to fetch initiatives" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = await rateLimitOrNull("initiatives-create", { limit: 5, windowMs: 60_000 });
  if (blocked) return blocked;

  try {
    const isInternal = verifyInternalSecret(request);
    const body = await request.json();

    let userId: string | undefined;
    if (isInternal) {
      // Internal secret auth: userId must be provided in body
      userId = body.userId as string | undefined;
      if (!userId) {
        return Response.json({ error: "userId is required for internal calls" }, { status: 400 });
      }
    } else {
      const session = await auth();
      userId = session?.user?.id;
      if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const parsed = createInitiativeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { rawIdea, projectId, smmAccountId } = parsed.data;
    const callbackUrl = (body.callbackUrl as string | undefined) || null;
    const trimmed = rawIdea.trim();

    // /question mode — answer immediately, don't create initiative
    if (trimmed.startsWith("/question ") || trimmed.startsWith("/q ")) {
      const question = trimmed.replace(/^\/(question|q)\s+/, "");
      const userProjects = await prisma.projectAccess.findMany({
        where: { userId },
        select: { projectId: true, project: { select: { name: true } } },
      });
      const projectIds = userProjects.map((p) => p.projectId);
      const activeInitiatives = await prisma.initiative.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["IN_PROGRESS", "PLANNING", "PLANNED", "IDEA"] },
          NOT: { title: { startsWith: "canary-" } },
        },
        include: { project: { select: { name: true } }, tasks: { select: { title: true, status: true } } },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });

      const lines = activeInitiatives.map((i) => {
        const done = i.tasks.filter((t: { status: string }) => t.status === "DONE").length;
        const total = i.tasks.length;
        return `• ${i.title || i.rawIdea.slice(0, 50)} — ${i.status}${total > 0 ? ` (${done}/${total} задач)` : ""} [${i.project?.name || ""}]`;
      });
      const answer = lines.length > 0
        ? `Ось ваші активні ініціативи:\n\n${lines.join("\n")}`
        : "Наразі немає активних ініціатив.";

      return Response.json({
        type: "answer",
        question,
        answer,
        initiatives: activeInitiatives.map((i) => ({ id: i.id, title: i.title, status: i.status, project: i.project?.name })),
      });
    }

    // Auto-generate title from rawIdea: first sentence, max 60 chars
    const firstSentence = trimmed.split(/[.!?\n]/)[0].trim();
    const autoTitle = firstSentence.length > 60
      ? firstSentence.slice(0, 57) + "..."
      : firstSentence;

    const initiative = await prisma.initiative.create({
      data: {
        rawIdea: trimmed,
        title: autoTitle,
        ...(smmAccountId && { smmAccountId }),
        ...(callbackUrl && { callbackUrl }),
        userId,
        projectId,
        status: "PLANNING",
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        project: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            ticketId: true,
            title: true,
            status: true,
            priority: true,
            assigneeType: true,
            assigneeUser: { select: { id: true, name: true, image: true } },
            agent: { select: { id: true, displayName: true, role: true } },
            blockedBy: { select: { id: true, title: true, status: true } },
            blocking: { select: { id: true, title: true, status: true } },
          },
        },
        messages: true,
      },
    });

    // Fire-and-forget: auto-plan async
    const baseUrl = process.env.NEXTAUTH_URL || "https://vibe-studio.example.com";
    // Use internal URL for server-to-server call (avoid external redirect)
    const internalBase = process.env.INTERNAL_URL || baseUrl;
    const planHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (isInternal) {
      planHeaders["x-internal-secret"] = process.env.INTERNAL_API_SECRET!;
    } else {
      const cookie = request.headers.get("cookie");
      if (cookie) planHeaders["Cookie"] = cookie;
    }
    fetch(`${internalBase}/api/initiatives/${initiative.id}/plan`, {
      method: "POST",
      headers: planHeaders,
    }).catch((err) => {
      console.error("Auto-plan fire-and-forget failed:", err);
    });

    return Response.json(initiative, { status: 201 });
  } catch (error) {
    console.error("Failed to create initiative:", error);
    return Response.json({ error: "Failed to create initiative" }, { status: 500 });
  }
}
