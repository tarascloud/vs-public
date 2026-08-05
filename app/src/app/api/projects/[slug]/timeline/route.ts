import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateUpdateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  type: z.enum(["FEATURE", "FIX", "RELEASE", "MILESTONE"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Access check: OWNER sees all; others need explicit ProjectAccess.
    if (user.role !== "OWNER") {
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: project.id, userId: user.id },
      });
      if (!access) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const url = new URL(_request.url);
    const typeFilter = url.searchParams.get("type");

    const updates = await prisma.projectUpdate.findMany({
      where: {
        projectId: project.id,
        ...(typeFilter ? { type: typeFilter as "FEATURE" | "FIX" | "RELEASE" | "MILESTONE" } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ project, updates });
  } catch (error) {
    console.error("Failed to fetch timeline:", error);
    return Response.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });

    if (!user || user.role !== "OWNER") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = CreateUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const update = await prisma.projectUpdate.create({
      data: {
        projectId: project.id,
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
      },
    });

    return Response.json(update, { status: 201 });
  } catch (error) {
    console.error("Failed to create update:", error);
    return Response.json({ error: "Failed to create update" }, { status: 500 });
  }
}
