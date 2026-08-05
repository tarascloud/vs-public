import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Lightbulb,
  ClipboardList,
  Code2,
  FlaskConical,
  Rocket,
  Landmark,
  Monitor,
  Palette,
  FileText,
  ShieldCheck,
  BarChart3,
  Megaphone,
  Cat,
  Mic,
  Brain,
  Library,
  Clock,
  BookOpen,
  Search,
  Lock,
  Target,
  Eye,
  Settings,
  TrendingUp,
} from "lucide-react";
import { LanguageSelector } from "./components/language-selector";

import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
    title: `${t("title")} — ${t("subtitle")}`,
    description: t("description"),
    alternates: {
      canonical: "https://vibe-studio.example.com",
    },
    openGraph: {
      title: `${t("title")} — ${t("subtitle")}`,
      description: t("description"),
      url: "https://vibe-studio.example.com",
      siteName: "Vibe Studio",
      type: "website",
      images: [{ url: "https://vibe-studio.example.com/og-image.png", width: 1200, height: 630, alt: "Vibe Studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t("title")} — ${t("subtitle")}`,
      description: t("description"),
      images: ["https://vibe-studio.example.com/og-image.png"],
    },
  };
}

const WORKFLOW_STEPS = [
  { step: "1", titleKey: "workflow_step1_title", descKey: "workflow_step1_desc", Icon: Lightbulb },
  { step: "2", titleKey: "workflow_step2_title", descKey: "workflow_step2_desc", Icon: ClipboardList },
  { step: "3", titleKey: "workflow_step3_title", descKey: "workflow_step3_desc", Icon: Code2 },
  { step: "4", titleKey: "workflow_step4_title", descKey: "workflow_step4_desc", Icon: FlaskConical },
  { step: "5", titleKey: "workflow_step5_title", descKey: "workflow_step5_desc", Icon: Rocket },
] as const;

const COMPARE_ROWS = ["memory", "parallel", "infra", "transparency", "cost"] as const;
const COMPARE_VS: Record<string, string> = { memory: "\u2713", parallel: "\u2713", infra: "\u2713", transparency: "\u2713", cost: "\u2713" };
const COMPARE_HUMAN: Record<string, string> = { memory: "\u2717", parallel: "~", infra: "\u2713", transparency: "\u2717", cost: "\u2717" };
const COMPARE_GENERIC: Record<string, string> = { memory: "\u2717", parallel: "\u2717", infra: "\u2717", transparency: "\u2717", cost: "\u2713" };

const PROJECTS = [
  {
    slug: "pd",
    iconSrc: "/project-icons/pd.png",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Python"],
    url: "https://pd.example.com",
  },
  {
    slug: "jf",
    iconSrc: "/project-icons/jf.svg",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Ollama"],
    url: "https://jobfinder.example.com",
  },
  {
    slug: "vs",
    iconSrc: "/project-icons/vs.png",
    techStack: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "WebSocket"],
    url: "https://vibe-studio.example.com",
  },
  {
    slug: "status",
    iconSrc: "/project-icons/status.png",
    techStack: ["Go", "SQLite", "Docker API"],
    url: "https://status.example.com",
  },
  {
    slug: "website",
    iconSrc: "/project-icons/website.png",
    techStack: ["HTML/CSS", "nginx", "Google Calendar API"],
    url: "https://example.com",
  },
  {
    slug: "trade",
    iconSrc: null as string | null,
    techStack: ["Freqtrade", "Python", "Docker", "Kraken API"],
    url: null as string | null,
  },
] as const;

// Map DB project names to UI slugs
const NAME_TO_SLUG: Record<string, string> = {
  "pd": "pd", "jobfinder": "jf", "vibe studio": "vs",
  "status": "status", "website": "website", "trade": "trade",
};

const AGENTS = [
  { Icon: Landmark, nameKey: "agent_architect_name", roleKey: "agent_architect_role" },
  { Icon: Code2, nameKey: "agent_developer_name", roleKey: "agent_developer_role" },
  { Icon: Palette, nameKey: "agent_designer_name", roleKey: "agent_designer_role" },
  { Icon: FileText, nameKey: "agent_coo_name", roleKey: "agent_coo_role" },
  { Icon: ShieldCheck, nameKey: "agent_devsecops_name", roleKey: "agent_devsecops_role" },
  { Icon: FlaskConical, nameKey: "agent_tester_name", roleKey: "agent_tester_role" },
  { Icon: BarChart3, nameKey: "agent_trader_name", roleKey: "agent_trader_role" },
  { Icon: Megaphone, nameKey: "agent_smm_name", roleKey: "agent_smm_role" },
  { Icon: Cat, nameKey: "agent_cat_name", roleKey: "agent_cat_role" },
  { Icon: Mic, nameKey: "agent_voice_name", roleKey: "agent_voice_role" },
  { Icon: Brain, nameKey: "agent_ai_name", roleKey: "agent_ai_role" },
] as const;

const MEMORY_FEATURES = [
  { Icon: Library, titleKey: "memory_feature_layers_title", descKey: "memory_feature_layers_desc" },
  { Icon: Clock, titleKey: "memory_feature_ingest_title", descKey: "memory_feature_ingest_desc" },
  { Icon: BookOpen, titleKey: "memory_feature_wiki_title", descKey: "memory_feature_wiki_desc" },
  { Icon: Search, titleKey: "memory_feature_search_title", descKey: "memory_feature_search_desc" },
  { Icon: Brain, titleKey: "memory_feature_meta_title", descKey: "memory_feature_meta_desc" },
  { Icon: Lock, titleKey: "memory_feature_secure_title", descKey: "memory_feature_secure_desc" },
] as const;

const WHY_FEATURES = [
  { Icon: Target, titleKey: "why_specialized_title", descKey: "why_specialized_desc" },
  { Icon: Rocket, titleKey: "why_production_title", descKey: "why_production_desc" },
  { Icon: Brain, titleKey: "why_memory_title", descKey: "why_memory_desc" },
  { Icon: Settings, titleKey: "why_autonomous_title", descKey: "why_autonomous_desc" },
  { Icon: Eye, titleKey: "why_transparent_title", descKey: "why_transparent_desc" },
  { Icon: Lock, titleKey: "why_infra_title", descKey: "why_infra_desc" },
] as const;

const KARPATHY_PRINCIPLES = [
  { Icon: Lightbulb, titleKey: "karpathy_p1_title", descKey: "karpathy_p1_desc" },
  { Icon: Code2, titleKey: "karpathy_p2_title", descKey: "karpathy_p2_desc" },
  { Icon: Eye, titleKey: "karpathy_p3_title", descKey: "karpathy_p3_desc" },
  { Icon: Target, titleKey: "karpathy_p4_title", descKey: "karpathy_p4_desc" },
] as const;

type Stats = { done: number; active: number; planned: number };

/**
 * Cold-TTFB фікс: лендінг динамічний per-request (locale з cookie у
 * i18n/request.ts → page-level ISR/revalidate не застосовується), тому ці
 * 5 запитів до pg раніше сиділи у blocking path кожного запиту — і на
 * холодному старті контейнера давали TTFB ~15s. unstable_cache кладе
 * результат у incremental cache (file-based, переживає docker restart)
 * і фоново оновлює його раз на 5 хв.
 */
const getLandingStats = unstable_cache(
  async () => {
    // Initiative stats per project
    const dbProjects = await prisma.project.findMany();
    const dbProjectIds = dbProjects.map((p: { id: string }) => p.id);
    const [initiativeCounts, tasksDone, initiativesDone, recentTasks] =
      await Promise.all([
        prisma.initiative.groupBy({
          by: ["projectId", "status"],
          where: { projectId: { in: dbProjectIds } },
          _count: { id: true },
        }),
        // Memory stats for landing
        prisma.task.count({ where: { status: "DONE" } }),
        prisma.initiative.count({ where: { status: "DONE" } }),
        // Recent completed tasks for live activity feed
        prisma.task.findMany({
          where: { status: "DONE" },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { title: true, updatedAt: true, assigneeType: true },
        }),
      ]);
    const statsBySlug: Record<string, Stats> = {};
    for (const row of initiativeCounts) {
      if (!row.projectId) continue;
      const proj = dbProjects.find((p: { id: string; name: string }) => p.id === row.projectId);
      if (!proj) continue;
      const slug = NAME_TO_SLUG[proj.name.toLowerCase()] ?? proj.name.toLowerCase();
      if (!statsBySlug[slug]) statsBySlug[slug] = { done: 0, active: 0, planned: 0 };
      if (row.status === "DONE") statsBySlug[slug].done += row._count.id;
      else if (row.status === "IN_PROGRESS") statsBySlug[slug].active += row._count.id;
      else if (["IDEA", "PLANNING", "PLANNED"].includes(row.status)) statsBySlug[slug].planned += row._count.id;
    }
    return { statsBySlug, tasksDone, initiativesDone, recentTasks };
  },
  ["landing-stats"],
  { revalidate: 300 }
);

export default async function Home() {
  const t = await getTranslations("landing");
  const tp = await getTranslations("projects");
  const tt = await getTranslations("timeline");

  const agentCount = AGENTS.length;
  const { statsBySlug, tasksDone, initiativesDone, recentTasks } =
    await getLandingStats();

  return (
    <main className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-card-border max-w-[100vw]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Vibe Studio"
              width={160}
              height={38}
              priority
              className="h-8 w-auto"
            />
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-muted">
            <a href="#agents" className="hover:text-foreground transition-colors">
              Agents
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              {t("portfolio")}
            </a>
            <LanguageSelector />
            <Link
              href="/auth/signin?callbackUrl=/studio"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
            >
              {t("sign_in")}
            </Link>
          </div>
          {/* Mobile sign-in button */}
          <div className="flex sm:hidden items-center">
            <Link
              href="/auth/signin?callbackUrl=/studio"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium min-h-[44px] flex items-center"
            >
              {t("sign_in")}
            </Link>
          </div>
        </div>
      </nav>

      {/* 1. Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-card-border text-sm text-muted mb-6">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          {t("badge")}
        </div>
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl">
          <span className="gradient-text">
            {t("title")}
          </span>
        </h1>
        <p className="mt-4 text-xl sm:text-2xl text-muted max-w-2xl">
          {t("subtitle")}
        </p>
        <p className="mt-4 text-base text-foreground-secondary max-w-xl">
          {t("description")}
        </p>
        <div className="mt-8">
          <Link
            href="/auth/signin?callbackUrl=/studio"
            className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors"
          >
            {t("sign_in")}
          </Link>
        </div>
      </section>

      {/* 2. How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            <span className="gradient-text">{t("section_workflow_title")}</span>
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("section_workflow_subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-0 max-w-5xl mx-auto">
            {WORKFLOW_STEPS.map((s, i) => (
              <div key={s.step} className="flex-1 flex flex-col sm:flex-row items-center">
                <div className="flex flex-col items-center text-center px-2">
                  <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
                    <s.Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{t(s.titleKey)}</h3>
                  <p className="text-foreground-secondary text-xs leading-relaxed">{t(s.descKey)}</p>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="hidden sm:flex items-center text-muted/30 text-xl shrink-0 px-1">{"\u2192"}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. AI Agents */}
      <section id="agents" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            <span className="gradient-text">{t("section_agents_title")}</span>
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("section_agents_subtitle")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {AGENTS.map((agent) => (
              <div key={agent.nameKey} className="agent-card group">
                <div className="mb-3">
                  <agent.Icon className="w-7 h-7 text-accent" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{t(agent.nameKey)}</h3>
                <p className="text-foreground-secondary text-xs leading-relaxed">{t(agent.roleKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How Agents Remember (Memory) */}
      <section id="memory" className="py-20 px-4 sm:px-6 lg:px-8 memory-section overflow-x-hidden">
        <div className="max-w-7xl mx-auto w-full">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            <span className="gradient-text">{t("section_memory_title")}</span>
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("section_memory_subtitle")}
          </p>
          {/* Live stats */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-12 max-w-full">
            {[
              { value: "1,600+", label: "memories" },
              { value: String(agentCount), label: "AI agents" },
              { value: String(tasksDone), label: "tasks done" },
              { value: String(initiativesDone), label: "ideas shipped" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{stat.value}</div>
                <div className="text-xs text-foreground-secondary mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {MEMORY_FEATURES.map((feat) => (
              <div key={feat.titleKey} className="memory-card">
                <div className="mb-3">
                  <feat.Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold mb-2">{t(feat.titleKey)}</h3>
                <p className="text-foreground-secondary text-sm leading-relaxed">{t(feat.descKey)}</p>
              </div>
            ))}
          </div>
          {/* Live activity feed */}
          {recentTasks.length > 0 && (
            <div className="mt-8 max-w-2xl mx-auto">
              <h4 className="text-sm font-medium text-muted text-center mb-3">{t("recent_activity_title")}</h4>
              <div className="space-y-2">
                {recentTasks.map((task: { title: string; updatedAt: Date }, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-foreground-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                    <span className="truncate flex-1">{task.title}</span>
                    <span className="shrink-0 text-muted">{new Date(task.updatedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4b. Karpathy Coding Principles */}
      <section id="principles" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            <span className="gradient-text">{t("section_karpathy_title")}</span>
          </h2>
          <p className="text-muted text-center mb-4 max-w-2xl mx-auto">
            {t("section_karpathy_subtitle")}
          </p>
          <p className="text-foreground-secondary text-center text-sm mb-12 max-w-xl mx-auto">
            {t("section_karpathy_meta")}{" "}
            <a
              href="https://github.com/forrestchang/andrej-karpathy-skills"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              github.com/forrestchang/andrej-karpathy-skills
            </a>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {KARPATHY_PRINCIPLES.map((p) => (
              <div key={p.titleKey} className="memory-card">
                <div className="mb-3">
                  <p.Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold mb-2">{t(p.titleKey)}</h3>
                <p className="text-foreground-secondary text-sm leading-relaxed">{t(p.descKey)}</p>
              </div>
            ))}
          </div>
          <p className="text-foreground-secondary text-center text-sm mt-10 max-w-2xl mx-auto">
            {t("section_karpathy_wiki_note")}
          </p>
        </div>
      </section>

      {/* 5. Why Vibe Studio + Comparison */}
      <section id="why" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            <span className="gradient-text">{t("section_why_title")}</span>
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("section_why_subtitle")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_FEATURES.map((feat) => (
              <div key={feat.titleKey} className="why-card">
                <div className="mb-3">
                  <feat.Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold mb-2">{t(feat.titleKey)}</h3>
                <p className="text-foreground-secondary text-sm leading-relaxed">{t(feat.descKey)}</p>
              </div>
            ))}
          </div>

          {/* Comparison table -- merged into Why section */}
          <div className="mt-16 max-w-4xl mx-auto">
            <h4 className="text-2xl font-bold text-center mb-4">
              <span className="gradient-text">{t("section_compare_title")}</span>
            </h4>
            <p className="text-muted text-center mb-8">{t("section_compare_subtitle")}</p>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-card-border">
                    <th scope="col" className="text-left py-3 px-4 text-muted font-normal"></th>
                    <th scope="col" className="py-3 px-4 text-accent font-semibold">{t("compare_col_vs")}</th>
                    <th scope="col" className="py-3 px-4 text-muted font-normal">{t("compare_col_human")}</th>
                    <th scope="col" className="py-3 px-4 text-muted font-normal hidden sm:table-cell">{t("compare_col_generic")}</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row} className="border-b border-card-border/50">
                      <td className="py-3 px-4 text-foreground-secondary">{t(`compare_row_${row}`)}</td>
                      <td className="py-3 px-4 text-center text-success">{COMPARE_VS[row]}</td>
                      <td className="py-3 px-4 text-center text-muted">{COMPARE_HUMAN[row]}</td>
                      <td className="py-3 px-4 text-center text-muted hidden sm:table-cell">{COMPARE_GENERIC[row]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Founder */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-lg font-bold text-accent mx-auto mb-4">
            TP
          </div>
          <blockquote className="text-lg sm:text-xl text-foreground-secondary italic mb-4">
            {"\u201C"}{t("founder_quote")}{"\u201D"}
          </blockquote>
          <div className="text-sm">
            <span className="font-semibold">{t("founder_name")}</span>
            <span className="text-muted"> &mdash; {t("founder_role")} &middot; {t("founder_location")}</span>
          </div>
        </div>
      </section>

      {/* 7. Portfolio */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            {t("portfolio_title")}
          </h2>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("portfolio_subtitle")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PROJECTS.map((project) => {
              const s = statsBySlug[project.slug];
              return (
              <div
                key={project.slug}
                className="group bg-card-bg border border-card-border rounded-xl p-6 hover:border-accent/50 transition-all hover:shadow-lg hover:shadow-accent/5 flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center overflow-hidden">
                      {project.iconSrc ? (
                        <Image src={project.iconSrc} alt={`${tp(`${project.slug}.name`)} project icon`} width={28} height={28} className="object-contain" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-accent" />
                      )}
                    </div>
                    <h3 className="text-lg font-semibold leading-tight">
                      {tp(`${project.slug}.name`)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-success-subtle text-success border border-success/20 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    {t("status_active")}
                  </span>
                </div>
                <p className="text-foreground-secondary text-sm mb-4 flex-1">
                  {tp(`${project.slug}.description`)}
                </p>

                {/* Initiative stats */}
                {s && (s.done > 0 || s.active > 0 || s.planned > 0) && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {s.active > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        {s.active} in progress
                      </span>
                    )}
                    {s.planned > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {s.planned} planned
                      </span>
                    )}
                    {s.done > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-success-subtle text-success border border-success/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        {s.done} done
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {project.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="mt-auto flex flex-col gap-2">
                  {project.url ? (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-accent/30 text-accent hover:bg-accent hover:text-white hover:border-accent transition-all text-sm font-medium"
                    >
                      {t("visit_site")}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <div className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-card-border text-muted text-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {t("private")}
                    </div>
                  )}
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
              </div>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground border border-card-border hover:border-accent/50 px-5 py-2.5 rounded-lg transition-all"
            >
              {t("view_all_projects")}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-card-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Vibe Studio"
              width={120}
              height={29}
              className="h-6 w-auto opacity-70 hover:opacity-100 transition-opacity"
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-muted">
            <a href="#features" className="hover:text-foreground transition-colors">
              {t("portfolio")}
            </a>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-card-border text-xs">
              {t("footer_built_with")}
            </span>
            <span>&copy; {t("copyright")}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
