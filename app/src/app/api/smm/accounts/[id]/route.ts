import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UpdateSmmAccountSchema = z.object({
  platform: z.enum(["youtube", "twitter", "instagram", "tiktok", "linkedin"]).optional(),
  accountName: z.string().min(1).optional(),
  accountUrl: z.string().url().optional(),
  projectId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  secretKeys: z.array(z.string()).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateSmmAccountSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { secretKeys, ...rest } = parsed.data;

    const updateData: Record<string, unknown> = { ...rest };

    // Only update secrets if secretKeys is explicitly provided
    if (secretKeys !== undefined) {
      updateData.secrets = secretKeys.length > 0
        ? { keys: secretKeys.filter((k) => k.trim().length > 0) }
        : null;
    }

    const account = await prisma.smmAccount.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        initiatives: {
          select: { id: true, title: true, rawIdea: true, status: true },
        },
      },
    });

    return Response.json(account);
  } catch (error) {
    console.error("Failed to update SMM account:", error);
    return Response.json({ error: "Failed to update SMM account" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const owner = _gate.user;
  try {
    const { id } = await params;
    await prisma.smmAccount.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete SMM account:", error);
    return Response.json({ error: "Failed to delete SMM account" }, { status: 500 });
  }
}
