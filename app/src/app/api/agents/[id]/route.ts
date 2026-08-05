import { prisma } from "@/lib/prisma";
import { syncAgentToFile } from "@/lib/sync-agent-file";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(
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

    return Response.json(agent);
  } catch (error) {
    console.error("Failed to fetch agent:", error);
    return Response.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, displayName, description, role, instructions, tools, model, isActive, avatarUrl, avatarEmoji, color, bio } = body;

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Track changes in history
    const changes: { field: string; oldValue: string | null; newValue: string }[] = [];
    if (name !== undefined && name !== existing.name) {
      changes.push({ field: "name", oldValue: existing.name, newValue: name });
    }
    if (displayName !== undefined && displayName !== existing.displayName) {
      changes.push({ field: "displayName", oldValue: existing.displayName, newValue: displayName });
    }
    if (description !== undefined && description !== existing.description) {
      changes.push({ field: "description", oldValue: existing.description, newValue: description });
    }
    if (role !== undefined && role !== existing.role) {
      changes.push({ field: "role", oldValue: existing.role, newValue: role });
    }
    if (instructions !== undefined && instructions !== existing.instructions) {
      changes.push({ field: "instructions", oldValue: existing.instructions, newValue: instructions });
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(displayName !== undefined && { displayName }),
        ...(description !== undefined && { description }),
        ...(role !== undefined && { role }),
        ...(instructions !== undefined && { instructions }),
        ...(tools !== undefined && { tools }),
        ...(model !== undefined && { model }),
        ...(isActive !== undefined && { isActive }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(avatarEmoji !== undefined && { avatarEmoji }),
        ...(color !== undefined && { color }),
        ...(bio !== undefined && { bio }),
      },
    });

    // Save history entries
    if (changes.length > 0) {
      await prisma.agentHistory.createMany({
        data: changes.map((c) => ({
          agentId: id,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedBy: "ui",
        })),
      });
    }

    // Fire-and-forget sync to .md file
    syncAgentToFile({
      name: agent.name,
      displayName: agent.displayName,
      description: agent.description,
      role: agent.role,
      instructions: agent.instructions,
      tools: agent.tools,
      model: agent.model,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to sync agent ${agent.name} to file:`, message);
    });

    return Response.json(agent);
  } catch (error) {
    console.error("Failed to update agent:", error);
    return Response.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
