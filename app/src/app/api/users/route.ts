import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const users = await prisma.user.findMany({
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return Response.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
