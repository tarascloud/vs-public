"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

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

interface TaskRef {
  id: string;
  ticketId: string;
  title: string;
  status: string;
}

interface QuestionItem {
  id: string;
  question: string;
  answer: string | null;
  status: "PENDING" | "ANSWERED";
  createdAt: string;
  answeredAt: string | null;
  task: TaskRef;
}

interface Project {
  id: string;
  name: string;
}

// ---------- QuestionCard ----------

interface QuestionCardProps {
  question: QuestionItem;
  t: ReturnType<typeof useTranslations<"client">>;
  onAnswer: (id: string, answer: string) => Promise<void>;
}

function QuestionCard({ question, t, onAnswer }: QuestionCardProps) {
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answerText.trim()) return;
    setSubmitting(true);
    try {
      await onAnswer(question.id, answerText);
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = question.status === "PENDING";

  return (
    <div
      className={`bg-card-bg border rounded-xl p-5 transition-colors ${
        isPending ? "border-amber-500/30" : "border-card-border opacity-70"
      }`}
    >
      {/* Task reference */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-muted">{question.task.ticketId}</span>
        <span className="text-xs text-muted/70">—</span>
        <span className="text-xs text-muted truncate">{question.task.title}</span>
      </div>

      {/* Question text */}
      <p className="text-sm text-foreground leading-relaxed mb-4">{question.question}</p>

      {isPending ? (
        <div className="space-y-2">
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={t("answer_placeholder")}
            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm resize-none focus:outline-none focus:border-accent/50"
            rows={3}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">
              {new Date(question.createdAt).toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting || !answerText.trim()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("answering") : t("send_answer")}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-green-400 font-medium">{t("answered")}</span>
            {question.answeredAt && (
              <span className="text-xs text-muted">
                {new Date(question.answeredAt).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">{question.answer}</p>
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------

export default function ClientQuestionsPage() {
  const t = useTranslations("client");
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const router = useRouter();
  const projectSlug = params.projectSlug as string;

  const [project, setProject] = useState<Project | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showAnswered, setShowAnswered] = useState(false);

  const showToast = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/${projectSlug}/questions`);
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
      setQuestions(data.questions ?? []);
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

  const handleAnswer = async (questionId: string, answer: string) => {
    const res = await fetch(`/api/client/${projectSlug}/questions/${questionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? t("submit_error"), "error");
      throw new Error(data.error);
    }

    showToast(t("answer_submitted"), "success");
    // Update local state: mark question as answered
    const updated = await res.json();
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, ...updated } : q))
    );
  };

  const pendingQuestions = questions.filter((q) => q.status === "PENDING");
  const answeredQuestions = questions.filter((q) => q.status === "ANSWERED");
  const displayedAnswered = showAnswered ? answeredQuestions : [];

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
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
                  VS
                </div>
                <span className="text-muted text-sm">{t("client_portal")}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">{project?.name ?? projectSlug}</h1>
            </div>
          </div>

          {/* Navigation tabs */}
          <ClientNav projectSlug={projectSlug} activeTab="questions" t={t} />

          {/* Section header */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">{t("questions_title")}</h2>
            <p className="text-muted text-sm">{t("questions_subtitle")}</p>
          </div>

          {/* Pending questions */}
          {pendingQuestions.length === 0 && answeredQuestions.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm">
              <div className="w-12 h-12 rounded-full bg-card-bg border border-card-border flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {t("no_questions")}
            </div>
          ) : (
            <div className="space-y-4">
              {pendingQuestions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    {t("awaiting_answers")} ({pendingQuestions.length})
                  </div>
                  {pendingQuestions.map((q) => (
                    <QuestionCard key={q.id} question={q} t={t} onAnswer={handleAnswer} />
                  ))}
                </div>
              )}

              {answeredQuestions.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={() => setShowAnswered(!showAnswered)}
                    className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors mb-3"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${showAnswered ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {t("show_answered")} ({answeredQuestions.length})
                  </button>

                  {displayedAnswered.map((q) => (
                    <QuestionCard key={q.id} question={q} t={t} onAnswer={handleAnswer} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
