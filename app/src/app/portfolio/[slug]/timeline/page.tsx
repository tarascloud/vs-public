import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TimelineClient from "./timeline-client";

type Props = {
  params: Promise<{ slug: string }>;
};

// Canonical list of known project slugs — matches portfolio/page.tsx PROJECTS
const KNOWN_SLUGS = ["pd", "jf", "vs", "status", "website", "trade"] as const;
type KnownSlug = (typeof KNOWN_SLUGS)[number];

// Map URL slugs to DB project names
const SLUG_TO_DB_NAME: Record<string, string> = {
  pd: "PD", jf: "JobFinder", vs: "Vibe Studio",
  status: "Status", website: "Website", trade: "Trade",
};

function isKnownSlug(slug: string): slug is KnownSlug {
  return (KNOWN_SLUGS as readonly string[]).includes(slug.toLowerCase());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("timeline");
  const tp = await getTranslations("projects");

  const slugKey = slug.toLowerCase();

  if (!isKnownSlug(slugKey)) {
    return { title: "Not Found" };
  }

  const knownSlug: KnownSlug = slugKey;
  let projectName: string = knownSlug;
  try {
    projectName = tp(`${knownSlug}.name`);
  } catch {
    // fallback to slugKey if no translation
  }

  const dbName = SLUG_TO_DB_NAME[slug.toLowerCase()] ?? slug;
  const project = await prisma.project.findFirst({
    where: { name: { equals: dbName, mode: "insensitive" } },
  });

  const displayName = project?.name ?? projectName;

  return {
    title: `${displayName} — ${t("title")} — Vibe Studio`,
    description: t("meta_description", { project: displayName }),
    alternates: {
      canonical: `https://vibe-studio.example.com/portfolio/${slug}/timeline`,
      types: {
        "application/rss+xml": `/api/projects/${slug}/feed.xml`,
      },
    },
    openGraph: {
      title: `${displayName} — ${t("title")} — Vibe Studio`,
      description: t("meta_description", { project: displayName }),
      url: `https://vibe-studio.example.com/portfolio/${slug}/timeline`,
      siteName: "Vibe Studio",
      type: "website",
    },
  };
}

export default async function TimelinePage({ params }: Props) {
  const { slug } = await params;
  const t = await getTranslations("timeline");
  const tp = await getTranslations("projects");

  const slugKey = slug.toLowerCase();

  // 404 only for completely unknown slugs
  if (!isKnownSlug(slugKey)) {
    notFound();
  }

  const knownSlug: KnownSlug = slugKey;

  const dbName2 = SLUG_TO_DB_NAME[slugKey] ?? slug;
  const project = await prisma.project.findFirst({
    where: { name: { equals: dbName2, mode: "insensitive" } },
    include: {
      updates: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Resolve display name from translations (fallback to DB name or slug)
  let projectDisplayName: string = slug;
  try {
    projectDisplayName = tp(`${knownSlug}.name`);
  } catch {
    if (project) {
      projectDisplayName = project.name;
    }
  }

  // Updates list — empty if project not yet seeded in DB
  const updates = project?.updates ?? [];

  // Fetch all relevant initiatives for this project
  const allInitiatives = project
    ? await prisma.initiative.findMany({
        where: {
          projectId: project.id,
          status: { in: ["DONE", "IN_PROGRESS", "PLANNED", "PLANNING", "IDEA"] },
        },
        include: { _count: { select: { tasks: true } } },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  // Combine updates + initiatives into a unified timeline
  const updateEntries = updates.map((u) => ({
    kind: "update" as const,
    id: u.id,
    title: u.title,
    description: u.description,
    type: u.type as "FEATURE" | "FIX" | "RELEASE" | "MILESTONE",
    createdAt: u.createdAt.toISOString(),
  }));

  const initiativeEntries = allInitiatives.map((i) => ({
    kind: "initiative" as const,
    id: i.id,
    title: i.title ?? i.rawIdea.slice(0, 80),
    summary: i.summary,
    taskCount: i._count.tasks,
    status: i.status as string,
    date: i.updatedAt.toISOString(),
  }));

  return (
    <main className="min-h-screen pt-24 pb-20">
      {/* Header */}
      <section className="px-4 sm:px-6 lg:px-8 mb-12 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t("back_portfolio")}
            </Link>
            <span className="text-card-border">/</span>
            <span className="text-sm text-muted">{projectDisplayName}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {projectDisplayName}
          </h1>
          <p className="text-lg text-muted mb-6">
            {t("subtitle")}
          </p>

          {/* RSS link */}
          <a
            href={`/api/projects/${slug}/feed.xml`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted/60 hover:text-accent transition-colors border border-card-border hover:border-accent/30 rounded-full px-3 py-1"
          >
            <svg className="w-3 h-3 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
            </svg>
            RSS Feed
          </a>
        </div>
      </section>

      {/* Timeline */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <TimelineClient
            updates={updateEntries.map((u) => ({
              id: u.id,
              title: u.title,
              description: u.description,
              type: u.type,
              createdAt: u.createdAt,
            }))}
            initiatives={initiativeEntries.map((i) => ({
              id: i.id,
              title: i.title,
              summary: i.summary,
              taskCount: i.taskCount,
              status: i.status,
              date: i.date,
            }))}
            translations={{
              filter_all: t("filter_all"),
              filter_feature: t("filter_feature"),
              filter_fix: t("filter_fix"),
              filter_release: t("filter_release"),
              filter_milestone: t("filter_milestone"),
              filter_idea: t("filter_idea"),
              no_updates: t("no_updates"),
              type_feature: t("type_feature"),
              type_fix: t("type_fix"),
              type_release: t("type_release"),
              type_milestone: t("type_milestone"),
              type_idea: t("type_idea"),
            }}
          />
        </div>
      </section>
    </main>
  );
}
