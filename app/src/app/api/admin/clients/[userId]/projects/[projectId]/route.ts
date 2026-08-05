import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ userId: string; projectId: string }>;

// DELETE /api/admin/clients/[userId]/projects/[projectId] — відкликати доступ
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const { userId, projectId } = await params;

    const access = await prisma.projectAccess.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!access) {
      return Response.json({ error: "Access not found" }, { status: 404 });
    }

    await prisma.projectAccess.delete({
      where: { userId_projectId: { userId, projectId } },
    });

    return Response.json({ message: "Access revoked" });
  } catch (error) {
    console.error("DELETE /api/admin/clients/[userId]/projects/[projectId] error:", error);
    return Response.json({ error: "Failed to revoke access" }, { status: 500 });
  }
}

// PATCH /api/admin/clients/[userId]/projects/[projectId] — змінити роль
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const { userId, projectId } = await params;
    const body = await request.json();
    const { role } = body as { role: string };

    if (!role || !["CLIENT", "VIEWER"].includes(role)) {
      return Response.json({ error: "Invalid role. Must be CLIENT or VIEWER" }, { status: 400 });
    }

    const access = await prisma.projectAccess.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!access) {
      return Response.json({ error: "Access not found" }, { status: 404 });
    }

    const updated = await prisma.projectAccess.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role: role as "CLIENT" | "VIEWER" },
      include: {
        project: { select: { name: true } },
        user: { select: { email: true } },
      },
    });

    return Response.json({
      message: `Role updated to ${role}`,
      access: {
        userId,
        projectId,
        projectName: updated.project.name,
        userEmail: updated.user.email,
        role: updated.role,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/clients/[userId]/projects/[projectId] error:", error);
    return Response.json({ error: "Failed to update role" }, { status: 500 });
  }
}
