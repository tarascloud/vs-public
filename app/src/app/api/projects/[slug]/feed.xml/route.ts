import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Require authenticated user with project access
    const session = await auth();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    });

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { slug } = await params;

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    // Verify user has access to this project (OWNER role bypasses check)
    if (user.role !== "OWNER") {
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: project.id, userId: user.id },
      });
      if (!access) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const updates = await prisma.projectUpdate.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const baseUrl = "https://vibe-studio.example.com";
    const feedUrl = `${baseUrl}/api/projects/${slug}/feed.xml`;
    const timelineUrl = `${baseUrl}/portfolio/${slug}/timeline`;

    const lastUpdated =
      updates.length > 0
        ? updates[0].createdAt.toUTCString()
        : new Date().toUTCString();

    const items = updates
      .map(
        (u) => `
    <item>
      <title>${escapeXml(u.title)}</title>
      <description>${escapeXml(u.description)}</description>
      <link>${timelineUrl}#${u.id}</link>
      <guid isPermaLink="false">${u.id}</guid>
      <pubDate>${u.createdAt.toUTCString()}</pubDate>
      <category>${escapeXml(u.type)}</category>
    </item>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(project.name)} — Timeline</title>
    <description>${escapeXml(project.description ?? `Updates for ${project.name}`)}</description>
    <link>${timelineUrl}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${lastUpdated}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to generate feed:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
