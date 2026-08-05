import { prisma } from "@/lib/prisma";
import { requireOwnerApi, requireAuthApi } from "@/lib/auth-helpers";

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // All requests require authentication — no public project listing
    const _gate = await requireAuthApi();
    if (!_gate.authorized) return _gate.response;
    const user = _gate.user;
    // OWNER sees all projects with access info
    if (user.role === "OWNER") {
      const projects = await prisma.project.findMany({
        include: {
          access: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      return Response.json(projects);
    }

    // CLIENT/VIEWER sees only projects they have explicit access to via ProjectAccess
    const accessEntries = await prisma.projectAccess.findMany({
      where: { userId: user.id },
      include: { project: true },
    });
    const projects = accessEntries.map((pa) => pa.project);
    return Response.json(projects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return Response.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  try {
    const body = await request.json();
    const { name, description, techStack, url } = body;

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate unique slug from name, append random suffix if collision
    let slug = nameToSlug(name);
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        description: description || null,
        techStack: techStack || [],
        url: url || null,
      },
    });

    return Response.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }
}
