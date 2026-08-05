import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET /api/admin/clients — список клієнтів з проектами та методами входу
export async function GET() {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const clients = await prisma.user.findMany({
      where: {
        role: { in: ["CLIENT", "VIEWER"] },
      },
      include: {
        accounts: {
          select: { provider: true },
        },
        projects: {
          include: {
            project: {
              select: { id: true, name: true, status: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = clients.map((client) => ({
      id: client.id,
      name: client.name,
      email: client.email,
      image: client.image,
      role: client.role,
      telegramUsername: client.telegramUsername,
      telegramId: client.telegramId,
      invitedBy: client.invitedBy,
      invitedAt: client.invitedAt,
      createdAt: client.createdAt,
      authMethods: client.accounts.map((a) => a.provider),
      projects: client.projects.map((pa) => ({
        accessId: pa.id,
        projectId: pa.projectId,
        projectName: pa.project.name,
        projectStatus: pa.project.status,
        accessRole: pa.role,
        accessCreatedAt: pa.createdAt,
      })),
    }));

    return Response.json(result);
  } catch (error) {
    console.error("GET /api/admin/clients error:", error);
    return Response.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

// POST /api/admin/clients/invite — запросити клієнта
export async function POST(request: Request) {
  try {
    const _gate = await requireOwnerApi();
    if (!_gate.authorized) return _gate.response;
    const owner = _gate.user;
    const body = await request.json();
    const { email, role, projectId, projectRole } = body as {
      email: string;
      role?: "CLIENT" | "VIEWER";
      projectId?: string;
      projectRole?: "CLIENT" | "VIEWER";
    };

    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    const userRole = role ?? "CLIENT";
    if (!["CLIENT", "VIEWER"].includes(userRole)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    // Знайти або створити користувача
    let client = await prisma.user.findUnique({ where: { email } });

    if (client) {
      client = await prisma.user.update({
        where: { email },
        data: {
          role: userRole,
          invitedBy: owner.email ?? owner.id,
          invitedAt: new Date(),
        },
      });
    } else {
      client = await prisma.user.create({
        data: {
          email,
          role: userRole,
          invitedBy: owner.email ?? owner.id,
          invitedAt: new Date(),
        },
      });
    }

    // Призначити доступ до проекту якщо вказано
    if (projectId && typeof projectId === "string") {
      const accessRole = projectRole ?? userRole;
      if (!["CLIENT", "VIEWER"].includes(accessRole)) {
        return Response.json({ error: "Invalid projectRole" }, { status: 400 });
      }

      await prisma.projectAccess.upsert({
        where: { userId_projectId: { userId: client.id, projectId } },
        create: {
          userId: client.id,
          projectId,
          role: accessRole as "CLIENT" | "VIEWER",
        },
        update: {
          role: accessRole as "CLIENT" | "VIEWER",
        },
      });
    }

    return Response.json(
      { message: `Client ${email} invited as ${userRole}`, userId: client.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/admin/clients error:", error);
    return Response.json({ error: "Failed to invite client" }, { status: 500 });
  }
}
