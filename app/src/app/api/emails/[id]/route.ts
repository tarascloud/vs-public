import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// PUT /api/emails/[id] — update email (mark read / soft-delete)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const { id } = await params;

    const body = await request.json();
    const { read, deleted } = body as { read?: boolean; deleted?: boolean };

    const updateData: { read?: boolean; deleted?: boolean } = {};
    if (typeof read === "boolean") updateData.read = read;
    if (typeof deleted === "boolean") updateData.deleted = deleted;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const email = await prisma.email.update({
      where: { id },
      data: updateData,
    });

    return Response.json(email);
  } catch (error) {
    console.error("PUT /api/emails/[id] error:", error);
    return Response.json({ error: "Failed to update email" }, { status: 500 });
  }
}

// DELETE /api/emails/[id] — hard delete
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const { id } = await params;

    await prisma.email.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/emails/[id] error:", error);
    return Response.json({ error: "Failed to delete email" }, { status: 500 });
  }
}
