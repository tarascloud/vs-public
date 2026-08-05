import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const body = await request.json();
    const { email, role, projectIds, telegramUsername, telegramId } = body;

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    if (role && !["CLIENT", "VIEWER"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Update role if user exists
      user = await prisma.user.update({
        where: { email },
        data: {
          role: role || "CLIENT",
          ...(telegramUsername && { telegramUsername }),
          ...(telegramId && { telegramId }),
        },
      });
    } else {
      // Create new user with role
      user = await prisma.user.create({
        data: {
          email,
          role: role || "CLIENT",
          ...(telegramUsername && { telegramUsername }),
          ...(telegramId && { telegramId }),
        },
      });
    }

    // Assign projects if provided
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      // Remove existing project access
      await prisma.projectAccess.deleteMany({
        where: { userId: user.id },
      });

      // Create new project access entries
      await prisma.projectAccess.createMany({
        data: projectIds.map((projectId: string) => ({
          userId: user!.id,
          projectId,
          role: "VIEWER",
        })),
        skipDuplicates: true,
      });
    }

    return Response.json({ message: `User ${email} invited as ${role || "CLIENT"}` }, { status: 201 });
  } catch (error) {
    console.error("Failed to invite user:", error);
    return Response.json({ error: "Failed to invite user" }, { status: 500 });
  }
}
