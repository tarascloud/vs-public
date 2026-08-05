import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  try {
    const agents = await prisma.agent.findMany({
      include: {
        tasks: {
          where: { status: { in: ["IN_PROGRESS", "BLOCKED", "TESTING"] } },
          include: { project: { select: { id: true, name: true } } },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          take: 3,
        },
      },
      orderBy: { name: "asc" },
    });
    return Response.json(agents);
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return Response.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  try {
    const body = await request.json();
    const { name, displayName, description, role, instructions, tools, model } =
      body;

    if (!name || !displayName || !description || !role || !instructions) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        displayName,
        description,
        role,
        instructions,
        tools: tools || [],
        model: model || "sonnet",
      },
    });

    return Response.json(agent, { status: 201 });
  } catch (error) {
    console.error("Failed to create agent:", error);
    return Response.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
