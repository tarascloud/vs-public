import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if current user is OWNER
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser || currentUser.role !== "OWNER") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role || !["OWNER", "CLIENT", "VIEWER"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
    });

    return Response.json(user);
  } catch (error) {
    console.error("Failed to update user:", error);
    return Response.json({ error: "Failed to update user" }, { status: 500 });
  }
}
