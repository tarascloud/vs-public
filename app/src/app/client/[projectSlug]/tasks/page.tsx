"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/task-status";
import type { TaskStatus } from "@/lib/task-status";

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

// ---------- Types ----------

interface Agent {
  id: string;
  name: string;
  displayName: string;
}

interface TaskQuestionItem {
  id: string;
  question: string;
  answer: string | null;
  status: "PENDING" | "ANSWERED";
  createdAt: string;
}

interface Task {
  id: string;
  ticketId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  agent: Agent | null;
  taskQuestions: TaskQuestionItem[];
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  techStack: string[];
  url: string | null;
  status: string;
}

// ---------- Constants ----------
// REV22-043: replaced local COLUMNS/STATUS_BADGE with shared TASK_STATUS_CONFIG

const PRIORITY_BADGE: Record<number, string> = {
  2: "bg-red-500/10 text-red-400 border-red-500/20",
  1: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  0: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

// ---------- TaskCard ----------

interface TaskCardProps {
  task: Task;
  t: ReturnType<typeof useTranslations<"client">>;
  onFeedbackSubmit: (taskId: string, comment: string, approved: boolean) => Promise<void>;
  projectSlug: string;
}

function TaskCard({ task, t, onFeedbackSubmit, projectSlug }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackApproved, setFeedbackApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pendingQuestions = task.taskQuestions.filter((q) => q.status === "PENDING");

  const priorityLabel =
    task.priority >= 2
      ? t("priority_high")
      : task.priority === 1
      ? t("priority_medium")
      : t("priority_low");

  const handleFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    try {
      await onFeedbackSubmit(task.id, feedbackText, feedbackApproved);
      setFeedbackText("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted font-mono">{task.ticketId}</span>
            {pendingQuestions.length > 0 && (
              <Link
                href={`/client/${projectSlug}/questions`}
                className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                {pendingQuestions.length} {t("needs_answer")}
              </Link>
            )}
          </div>
          <h3 className="text-sm font-medium text-foreground line-clamp-2">{task.title}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${PRIORITY_BADGE[Math.min(task.priority, 2)] ?? PRIORITY_BADGE[0]}`}>
          {priorityLabel}
        </span>
      </div>

      {task.agent && (
        <div className="text-xs text-muted mb-2">
          {t("assigned_to")}: <span className="text-accent">{task.agent.displayName}</span>
        </div>
      )}

      <div className="text-xs text-muted">
        {new Date(task.updatedAt).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </div>

      {task.description && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-accent/70 hover:text-accent transition-colors"
        >
          {expanded ? t("hide_details") : t("show_details")}
        </button>
      )}

      {expanded && task.description && (
        <p className="mt-2 text-xs text-muted leading-relaxed whitespace-pre-line">
          {task.description}
        </p>
      )}

      {/* Feedback section */}
      {expanded && task.status === "DONE" && (
        <div className="mt-3 border-t border-card-border pt-3">
          <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
            {t("feedback_label")}
          </h4>
          {submitted ? (
            <p className="text-xs text-green-400">{t("feedback_submitted")}</p>
          ) : (
            <div className="space-y-2">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={t("feedback_placeholder")}
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs resize-none focus:outline-none focus:border-accent/50"
                rows={2}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={feedbackApproved}
                    onChange={(e) => setFeedbackApproved(e.target.checked)}
                    className="rounded border-card-border accent-green-500"
                  />
                  {t("approve_task")}
                </label>
                <button
                  onClick={handleFeedback}
                  disabled={submitting || !feedbackText.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {submitting ? t("submitting") : t("submit_feedback")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------

export default function ClientProjectPage() {
  const t = useTranslations("client");
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/${projectSlug}/tasks`);
      if (res.status === 401) {
        router.push("/auth/signin");
        return;
      }
      if (res.status === 404) {
        setError(t("no_access"));
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProject(data.project);
      setTasks(data.tasks ?? []);
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

  const handleFeedbackSubmit = async (taskId: string, comment: string, approved: boolean) => {
    const res = await fetch(`/api/client/${projectSlug}/tasks/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, approved }),
    });

    if (!res.ok) {
      const data = await res.json();
      showMessage(data.error ?? t("submit_error"), "error");
      throw new Error(data.error);
    }

    showMessage(t("feedback_submitted"), "success");
  };

  const pendingQuestionsCount = tasks.reduce(
    (acc, task) => acc + task.taskQuestions.filter((q) => q.status === "PENDING").length,
    0
  );

  if (sessionStatus === "loading" || loading) {
    return (
      <main className="flex flex-col min-h-screen pt-20">
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-8 rounded-lg" />
                  <Skeleton className="h-24 rounded-lg" />
                  <Skeleton className="h-24 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </section>
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

  return (
    <main className="flex flex-col min-h-screen pt-20">
      {/* Toast */}
      {message && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg border text-sm transition-all ${
            message.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="py-12 px-4 sm:px-6 lg:px-8 flex-1">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
                  VS
                </div>
                <span className="text-muted text-sm">{t("client_portal")}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                {project?.name}
              </h1>
              {project?.description && (
                <p className="text-muted text-sm mt-1">{project.description}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {pendingQuestionsCount > 0 && (
                <Link
                  href={`/client/${projectSlug}/questions`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {pendingQuestionsCount} {t("pending_questions")}
                </Link>
              )}
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
          <ClientNav projectSlug={projectSlug} activeTab="tasks" t={t} />

          {/* Stats — REV22-043: uses shared TASK_STATUS_ORDER + TASK_STATUS_CONFIG */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            {TASK_STATUS_ORDER.map((status) => {
              const cfg = TASK_STATUS_CONFIG[status];
              const count = tasks.filter((task) => task.status === status).length;
              return (
                <div
                  key={status}
                  className="bg-card-bg border border-card-border rounded-lg p-3 text-center"
                >
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted mt-0.5">{t(cfg.labelKey as Parameters<typeof t>[0])}</div>
                </div>
              );
            })}
          </div>

          {/* Tech stack */}
          {project?.techStack && project.techStack.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {project.techStack.map((tech) => (
                <span
                  key={tech}
                  className="text-xs px-2 py-1 rounded bg-accent/5 border border-accent/15 text-muted"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* Kanban columns — REV22-043: shared config, REV22-044: --status-* border tokens */}
          {tasks.length === 0 ? (
            <EmptyState title={t("no_tasks")} description={t("no_tasks_column")} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {TASK_STATUS_ORDER.map((status) => {
                const cfg = TASK_STATUS_CONFIG[status];
                const colTasks = tasks.filter((task) => task.status === status);
                return (
                  <div key={status} className="flex flex-col gap-3">
                    <div
                      className={`bg-card-bg border border-card-border border-t-2 ${cfg.columnBorder} rounded-lg px-3 py-2 flex items-center justify-between`}
                    >
                      <span className="text-xs font-medium uppercase tracking-wider text-muted">
                        {t(cfg.labelKey as Parameters<typeof t>[0])}
                      </span>
                      <span className="text-xs text-muted bg-card-border px-1.5 py-0.5 rounded">
                        {colTasks.length}
                      </span>
                    </div>

                    {colTasks.length === 0 ? (
                      <EmptyState title={t("no_tasks_column")} compact className="border border-dashed border-card-border rounded-lg text-xs" />
                    ) : (
                      colTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          t={t}
                          onFeedbackSubmit={handleFeedbackSubmit}
                          projectSlug={projectSlug}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
