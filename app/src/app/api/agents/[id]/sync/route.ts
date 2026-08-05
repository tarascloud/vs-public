import { prisma } from "@/lib/prisma";
import { syncAgentToFile } from "@/lib/sync-agent-file";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const agent = await prisma.agent.findUnique({
      where: { id },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    await syncAgentToFile({
      name: agent.name,
      displayName: agent.displayName,
      description: agent.description,
      role: agent.role,
      instructions: agent.instructions,
      tools: agent.tools,
      model: agent.model,
    });

    return Response.json({ success: true, agentName: agent.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to sync agent ${id} to file:`, message);
    return Response.json(
      { error: "Failed to sync agent to file", details: message },
      { status: 500 }
    );
  }
}
