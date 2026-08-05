"use client";

import { useState, useEffect, useCallback, type ReactElement } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

// ---------- Types ----------

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  techStack: string[];
  url: string | null;
  updatedAt: string;
}

interface Stats {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  pendingQuestions: number;
  awaitingFeedback: number;
  progressPercent: number;
  lastUpdated: string | null;
}

interface PendingQuestion {
  id: string;
  question: string;
  task: { id: string; ticketId: string; title: string };
  createdAt: string;
}

interface AwaitingFeedbackTask {
  id: string;
  ticketId: string;
  title: string;
  agentName: string | null;
  updatedAt: string;
}

interface ActivityEvent {
  id: string;
  type: "task_done" | "task_started" | "question" | "feedback" | "update";
  title: string;
  description: string;
  date: string;
  agentName: string | null;
}

interface ProjectUpdate {
  id: string;
  title: string;
  description: string;
  type: "FEATURE" | "FIX" | "RELEASE" | "MILESTONE";
  createdAt: string;
}

interface DashboardData {
  project: Project;
  stats: Stats;
  pendingQuestions: PendingQuestion[];
  awaitingFeedbackTasks: AwaitingFeedbackTask[];
  recentActivity: ActivityEvent[];
  updates: ProjectUpdate[];
}

// ---------- Helpers ----------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

// ---------- Sub-components ----------

function ProgressRing({ percent }: { percent: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={radius}
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          className="text-card-border"
        />
        <circle
          cx="48"
          cy="48"
          r={radius}
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-accent transition-all duration-700"
        />
      </svg>
      <span className="absolute text-lg font-bold">{percent}%</span>
    </div>
  );
}

const UPDATE_TYPE_COLORS: Record<string, string> = {
  FEATURE: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  FIX: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  RELEASE: "text-green-400 bg-green-500/10 border-green-500/20",
  MILESTONE: "text-purple-400 bg-purple-500/10 border-purple-500/20",
};

const ACTIVITY_ICONS: Record<ActivityEvent["type"], ReactElement> = {
  task_done: (
    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  task_started: (
    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  question: (
    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  feedback: (
    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  ),
  update: (
    <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
};

// ---------- Nav Tabs ----------

function ClientNav({
  projectSlug,
  activeTab,
  t,
}: {
  projectSlug: string;
  activeTab: "dashboard" | "tasks" | "questions";
  t: ReturnType<typeof useTranslations<"client">>;
}) {
  const tabs = [
    { key: "dashboard" as const, href: `/client/${projectSlug}/dashboard`, label: t("tab_dashboard") },
    { key: "tasks" as const, href: `/client/${projectSlug}/tasks`, label: t("tab_tasks") },
    { key: "questions" as const, href: `/client/${projectSlug}/questions`, label: t("tab_questions") },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-card-border mb-8">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === tab.key
              ? "border-accent text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function ClientDashboardPage() {
  const t = useTranslations("client");
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const projectSlug = params.projectSlug as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/${projectSlug}/dashboard`);
      if (res.status === 401) {
        router.push("/auth/signin");
        return;
      }
      if (res.status === 404) {
        setError(t("no_access"));
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [projectSlug, router, t]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }
    if (sessionStatus === "authenticated") {
      fetchData();
    }
  }, [sessionStatus, fetchData, router]);

  if (sessionStatus === "loading" || loading) {
    return (
      <main className="flex flex-col min-h-screen pt-20">
        <div className="flex items-center justify-center flex-1">
          <div className="text-muted text-sm">{t("loading")}</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col min-h-screen pt-20">
        <div className="flex items-center justify-center flex-1">
          <div className="text-red-400 text-sm">{error}</div>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { project, stats, pendingQuestions, awaitingFeedbackTasks, recentActivity, updates } = data;

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
    COMPLETED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ARCHIVED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    PAUSED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  const statusLabel: Record<string, string> = {
    ACTIVE: t("project_status_active"),
    COMPLETED: t("project_status_completed"),
    ARCHIVED: t("project_status_archived"),
    PAUSED: t("project_status_paused"),
  };

  return (
    <main className="flex flex-col min-h-screen pt-20">
      <section className="py-12 px-4 sm:px-6 lg:px-8 flex-1">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
                  VS
                </div>
                <span className="text-muted text-sm">{t("client_portal")}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">{project.name}</h1>
              {project.description && (
                <p className="text-muted text-sm mt-1 max-w-2xl">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  statusColors[project.status] ?? statusColors.ACTIVE
                }`}
              >
                {statusLabel[project.status] ?? project.status}
              </span>
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full border border-card-border"
                />
              )}
            </div>
          </div>

          {/* Navigation tabs */}
          <ClientNav projectSlug={projectSlug} activeTab="dashboard" t={t} />

          {/* Section 1: Project Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Progress ring + info */}
            <div className="lg:col-span-1 bg-card-bg border border-card-border rounded-xl p-6 flex flex-col items-center justify-center gap-4">
              <ProgressRing percent={stats.progressPercent} />
              <div className="text-center">
                <p className="text-sm font-medium">{t("overview_progress")}</p>
                <p className="text-xs text-muted mt-0.5">
                  {stats.done} / {stats.total} {t("tasks_completed_label")}
                </p>
              </div>
              {stats.lastUpdated && (
                <p className="text-xs text-muted">
                  {t("last_updated")}: {formatDate(stats.lastUpdated)}
                </p>
              )}
            </div>

            {/* Quick stats grid */}
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  label: t("stat_total"),
                  value: stats.total,
                  color: "text-foreground",
                  bg: "bg-card-bg",
                },
                {
                  label: t("stat_in_progress"),
                  value: stats.inProgress,
                  color: "text-blue-400",
                  bg: "bg-blue-500/5",
                },
                {
                  label: t("stat_done"),
                  value: stats.done,
                  color: "text-green-400",
                  bg: "bg-green-500/5",
                },
                {
                  label: t("stat_blocked"),
                  value: stats.blocked,
                  color: "text-red-400",
                  bg: "bg-red-500/5",
                },
                {
                  label: t("stat_pending_questions"),
                  value: stats.pendingQuestions,
                  color: "text-amber-400",
                  bg: "bg-amber-500/5",
                },
                {
                  label: t("stat_awaiting_feedback"),
                  value: stats.awaitingFeedback,
                  color: "text-purple-400",
                  bg: "bg-purple-500/5",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`${s.bg} border border-card-border rounded-xl p-4 flex flex-col items-center justify-center text-center`}
                >
                  <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
                  <span className="text-xs text-muted mt-1">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Recent Activity */}
          <div className="mb-8">
            <h2 className="text-base font-semibold mb-4">{t("section_activity")}</h2>
            {recentActivity.length === 0 ? (
              <div className="bg-card-bg border border-card-border rounded-xl p-8 text-center text-muted text-sm">
                {t("no_activity")}
              </div>
            ) : (
              <div className="bg-card-bg border border-card-border rounded-xl divide-y divide-card-border">
                {recentActivity.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 shrink-0">{ACTIVITY_ICONS[event.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{event.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-muted/70">{event.description}</span>
                        {event.agentName && (
                          <span className="text-xs text-accent/70">{event.agentName}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted shrink-0">{formatDateShort(event.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Action Items */}
          {(pendingQuestions.length > 0 || awaitingFeedbackTasks.length > 0) && (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-4">{t("section_actions")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Pending questions */}
                {pendingQuestions.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-sm font-medium text-amber-400">
                          {t("action_questions_title")} ({stats.pendingQuestions})
                        </span>
                      </div>
                      <Link
                        href={`/client/${projectSlug}/questions`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >
                        {t("action_answer_all")}
                      </Link>
                    </div>
                    <div className="space-y-2">
                      {pendingQuestions.map((q) => (
                        <div key={q.id} className="text-xs text-muted">
                          <span className="font-mono text-muted/50 mr-1.5">{q.task.ticketId}</span>
                          <span className="line-clamp-1">{q.question}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Awaiting feedback */}
                {awaitingFeedbackTasks.length > 0 && (
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-sm font-medium text-purple-400">
                          {t("action_feedback_title")} ({stats.awaitingFeedback})
                        </span>
                      </div>
                      <Link
                        href={`/client/${projectSlug}/tasks`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 transition-colors"
                      >
                        {t("action_review_all")}
                      </Link>
                    </div>
                    <div className="space-y-2">
                      {awaitingFeedbackTasks.map((task) => (
                        <div key={task.id} className="text-xs text-muted">
                          <span className="font-mono text-muted/50 mr-1.5">{task.ticketId}</span>
                          <span className="line-clamp-1">{task.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 5: Timeline Preview */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">{t("section_timeline")}</h2>
              <Link
                href={`/portfolio/${projectSlug}/timeline`}
                className="text-xs px-3 py-1.5 rounded-lg border border-card-border text-muted hover:text-foreground hover:border-accent/30 transition-colors"
              >
                {t("view_full_timeline")}
              </Link>
            </div>

            {updates.length === 0 ? (
              <div className="bg-card-bg border border-card-border rounded-xl p-8 text-center text-muted text-sm">
                {t("no_updates")}
              </div>
            ) : (
              <div className="bg-card-bg border border-card-border rounded-xl divide-y divide-card-border">
                {updates.map((u) => (
                  <div key={u.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border shrink-0 mt-0.5 ${
                        UPDATE_TYPE_COLORS[u.type] ?? UPDATE_TYPE_COLORS.FEATURE
                      }`}
                    >
                      {u.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.title}</p>
                      <p className="text-xs text-muted mt-0.5 line-clamp-1">{u.description}</p>
                    </div>
                    <span className="text-xs text-muted shrink-0">{formatDateShort(u.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}
