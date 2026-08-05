import { prisma } from "@/lib/prisma";
import { requireOwnerApi, verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_PROJECTS = [
  { name: "PD", slug: "pd", description: "Personal Dashboard — finance, health, trading, AI chat", url: "https://pd.example.com" },
  { name: "JobFinder", slug: "jobfinder", description: "Job search SaaS — scrapers, AI scoring, auto-apply", url: "https://jobfinder.example.com" },
  { name: "Vibe Studio", slug: "vibe-studio", description: "AI-powered virtual office with 13 agents", url: "https://vibe-studio.example.com" },
  { name: "Status", slug: "status", description: "Service monitoring dashboard", url: "https://status.example.com" },
  { name: "Website", slug: "website", description: "Personal website + calendar", url: "https://example.com" },
  { name: "Trade", slug: "trade", description: "Freqtrade bot on Kraken exchange", url: null },
];

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  if (!verifyInternalSecret(request, "SEED_SECRET", "x-seed-secret")) {
    return Response.json({ error: "Invalid seed secret" }, { status: 403 });
  }

  try {
    let created = 0;
    let skipped = 0;

    for (const proj of DEFAULT_PROJECTS) {
      const existing = await prisma.project.findUnique({
        where: { name: proj.name },
      });

      if (existing) {
        // Backfill slug if missing
        if (!existing.slug) {
          await prisma.project.update({
            where: { id: existing.id },
            data: { slug: proj.slug || nameToSlug(existing.name) },
          });
        }
        skipped++;
        continue;
      }

      await prisma.project.create({
        data: {
          name: proj.name,
          slug: proj.slug || nameToSlug(proj.name),
          description: proj.description,
          url: proj.url,
          techStack: [],
        },
      });
      created++;
    }

    return Response.json({
      message: `Seeded ${created} projects (${skipped} already existed)`,
      created,
      skipped,
    });
  } catch (error) {
    console.error("Failed to seed projects:", error);
    return Response.json({ error: "Failed to seed projects" }, { status: 500 });
  }
}
