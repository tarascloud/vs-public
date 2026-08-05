import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portfolio");
  return {
    title: `${t("title")} — Vibe Studio`,
    description: t("subtitle"),
    alternates: {
      canonical: "https://vibe-studio.example.com/portfolio",
    },
    openGraph: {
      title: `${t("title")} — Vibe Studio`,
      description: t("subtitle"),
      url: "https://vibe-studio.example.com/portfolio",
      siteName: "Vibe Studio",
      type: "website",
    },
  };
}

const PROJECTS = [
  {
    slug: "pd",
    icon: null,
    iconSrc: "/project-icons/pd.png",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Python", "Tailwind", "Recharts", "Garmin API", "Bunq API"],
    url: "https://pd.example.com",
    status: "active",
  },
  {
    slug: "jf",
    icon: null,
    iconSrc: "/project-icons/jf.svg",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Playwright", "Ollama", "Gemini", "Groq"],
    url: "https://jobfinder.example.com",
    status: "active",
  },
  {
    slug: "vs",
    icon: null,
    iconSrc: "/project-icons/vs.png",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "WebSocket", "Redis", "NextAuth"],
    url: "https://vibe-studio.example.com",
    status: "active",
  },
  {
    slug: "status",
    icon: null,
    iconSrc: "/project-icons/status.png",
    techStack: ["Go", "SQLite", "Docker API", "Telegram Bot API"],
    url: "https://status.example.com",
    status: "active",
  },
  {
    slug: "website",
    icon: null,
    iconSrc: "/project-icons/website.png",
    techStack: ["HTML/CSS", "nginx", "Google Calendar API", "Cloudflare"],
    url: "https://example.com",
    status: "active",
  },
  {
    slug: "trade",
    icon: "📈",
    iconSrc: null as string | null,
    techStack: ["Freqtrade", "Python", "Docker", "Kraken API", "Pandas", "TA-Lib"],
    url: null,
    status: "active",
  },
] as const;

export default async function PortfolioPage() {
  const t = await getTranslations("portfolio");
  const tp = await getTranslations("projects");
  const tl = await getTranslations("landing");
  const tt = await getTranslations("timeline");

  // Fetch update counts for each project slug
  const dbProjects = await prisma.project.findMany({
    include: { _count: { select: { updates: true } } },
  });
  // Map DB project names to UI slugs
  const nameToSlug: Record<string, string> = {
    "pd": "pd", "jobfinder": "jf", "vibe studio": "vs",
    "status": "status", "website": "website", "trade": "trade",
  };
  const slugForProject = (p: { name: string }) => nameToSlug[p.name.toLowerCase()] ?? p.name.toLowerCase();

  const updateCountBySlug: Record<string, number> = {};
  for (const p of dbProjects) {
    updateCountBySlug[slugForProject(p)] = p._count.updates;
  }

  // Fetch initiative counts per project grouped by status
  const initiativeCounts = await prisma.initiative.groupBy({
    by: ["projectId", "status"],
    _count: { id: true },
  });
  type InitiativeStats = { done: number; active: number; planned: number };
  const statsBySlug: Record<string, InitiativeStats> = {};
  for (const row of initiativeCounts) {
    if (!row.projectId) continue;
    const proj = dbProjects.find((p) => p.id === row.projectId);
    if (!proj) continue;
    const slug = slugForProject(proj);
    if (!statsBySlug[slug]) statsBySlug[slug] = { done: 0, active: 0, planned: 0 };
    if (row.status === "DONE") statsBySlug[slug].done += row._count.id;
    else if (row.status === "IN_PROGRESS") statsBySlug[slug].active += row._count.id;
    else if (["IDEA", "PLANNING", "PLANNED"].includes(row.status)) statsBySlug[slug].planned += row._count.id;
  }
  // Keep backward compat alias
  const activeIdeasBySlug: Record<string, number> = {};
  for (const [slug, s] of Object.entries(statsBySlug)) {
    if (s.active > 0) activeIdeasBySlug[slug] = s.active;
  }

  return (
    <main className="min-h-screen pt-24 pb-20">
      {/* Header */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-card-border text-sm text-muted mb-6">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Vibe Studio
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {t("title")}
          </h1>
          <p className="text-lg text-muted max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {/* Project Grid */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PROJECTS.map((project) => (
              <article
                key={project.slug}
                className="group bg-card-bg border border-card-border rounded-xl p-6 hover:border-accent/50 transition-all hover:shadow-xl hover:shadow-accent/5 flex flex-col"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {project.iconSrc ? (
                        <Image src={project.iconSrc} alt="" aria-hidden="true" width={32} height={32} className="object-contain" />
                      ) : (
                        <span className="text-2xl">{project.icon}</span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold leading-tight">
                        {tp(`${project.slug}.name`)}
                      </h2>
                      <span className="inline-flex items-center gap-1 text-xs text-green-400 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        {tl("status_active")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-muted text-sm leading-relaxed mb-5 flex-1">
                  {tp(`${project.slug}.description`)}
                </p>

                {/* Tech Stack */}
                <div className="mb-5">
                  <p className="text-xs text-muted/60 uppercase tracking-wider mb-2">{t("tech_stack")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Initiative stats */}
                {statsBySlug[project.slug] && (statsBySlug[project.slug].done > 0 || statsBySlug[project.slug].active > 0 || statsBySlug[project.slug].planned > 0) && (
                  <div className="mb-5 flex flex-wrap gap-1.5">
                    {statsBySlug[project.slug].active > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        {statsBySlug[project.slug].active} in progress
                      </span>
                    )}
                    {statsBySlug[project.slug].planned > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {statsBySlug[project.slug].planned} planned
                      </span>
                    )}
                    {statsBySlug[project.slug].done > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        {statsBySlug[project.slug].done} done
                      </span>
                    )}
                  </div>
                )}

                {/* CTA */}
                <div className="mt-auto flex flex-col gap-2">
                  {project.url ? (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-accent/30 text-accent hover:bg-accent hover:text-white hover:border-accent transition-all text-sm font-medium"
                    >
                      {tl("visit_site")}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <div className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-card-border text-muted/50 text-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {tl("private")}
                    </div>
                  )}
                  {/* Timeline link */}
                  <Link
                    href={`/portfolio/${project.slug}/timeline`}
                    className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-card-border text-muted hover:border-accent/30 hover:text-accent transition-all text-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {tt("view_timeline")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Back to home */}
      <section className="px-4 sm:px-6 lg:px-8 mt-16 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted hover:text-foreground transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t("back_home")}
        </Link>
      </section>
    </main>
  );
}
