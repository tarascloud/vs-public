"use client";

import { useState } from "react";

type UpdateType = "FEATURE" | "FIX" | "RELEASE" | "MILESTONE";

type Update = {
  id: string;
  title: string;
  description: string;
  type: UpdateType;
  createdAt: string;
};

type Initiative = {
  id: string;
  title: string;
  summary: string | null;
  taskCount: number;
  status: string;
  date: string;
};

type Translations = {
  filter_all: string;
  filter_feature: string;
  filter_fix: string;
  filter_release: string;
  filter_milestone: string;
  filter_idea: string;
  no_updates: string;
  type_feature: string;
  type_fix: string;
  type_release: string;
  type_milestone: string;
  type_idea: string;
};

type InitiativeKind = "DONE" | "IN_PROGRESS" | "PLANNED";
type AllEntryType = UpdateType | InitiativeKind;

const TYPE_STYLES: Record<AllEntryType, { color: string; bg: string; border: string; dot: string }> = {
  FEATURE: {
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    dot: "bg-indigo-500",
  },
  FIX: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    dot: "bg-yellow-500",
  },
  RELEASE: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    dot: "bg-green-500",
  },
  MILESTONE: {
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    dot: "bg-purple-500",
  },
  DONE: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    dot: "bg-green-500",
  },
  IN_PROGRESS: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  PLANNED: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    dot: "bg-blue-400",
  },
};

function TypeIcon({ type }: { type: AllEntryType }) {
  if (type === "FEATURE") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    );
  }
  if (type === "FIX") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }
  if (type === "RELEASE") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
      </svg>
    );
  }
  if (type === "IN_PROGRESS") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (type === "PLANNED") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    );
  }
  if (type === "DONE") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  // MILESTONE
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const FILTER_TYPES = ["ALL", "FEATURE", "FIX", "RELEASE", "MILESTONE", "IN_PROGRESS", "PLANNED", "DONE"] as const;
type FilterType = (typeof FILTER_TYPES)[number];

// Unified entry for rendering
type TimelineEntry =
  | { kind: "update"; id: string; type: UpdateType; title: string; description: string; date: string }
  | { kind: "initiative"; id: string; type: InitiativeKind; title: string; summary: string | null; taskCount: number; date: string };

function initiativeStatusToKind(status: string): InitiativeKind {
  if (status === "DONE") return "DONE";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  return "PLANNED";
}

export default function TimelineClient({
  updates,
  initiatives = [],
  translations: t,
}: {
  updates: Update[];
  initiatives?: Initiative[];
  translations: Translations;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");

  // Build unified sorted entries
  const allEntries: TimelineEntry[] = [
    ...updates.map((u): TimelineEntry => ({
      kind: "update",
      id: u.id,
      type: u.type,
      title: u.title,
      description: u.description,
      date: u.createdAt,
    })),
    ...initiatives.map((i): TimelineEntry => ({
      kind: "initiative",
      id: i.id,
      type: initiativeStatusToKind(i.status),
      title: i.title,
      summary: i.summary,
      taskCount: i.taskCount,
      date: i.date,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = activeFilter === "ALL"
    ? allEntries
    : allEntries.filter((e) => e.type === activeFilter);

  const filterLabels: Record<FilterType, string> = {
    ALL: t.filter_all,
    FEATURE: t.filter_feature,
    FIX: t.filter_fix,
    RELEASE: t.filter_release,
    MILESTONE: t.filter_milestone,
    IN_PROGRESS: "In Progress",
    PLANNED: "Planned",
    DONE: "Done",
  };

  const typeLabels: Record<AllEntryType, string> = {
    FEATURE: t.type_feature,
    FIX: t.type_fix,
    RELEASE: t.type_release,
    MILESTONE: t.type_milestone,
    DONE: "Done",
    IN_PROGRESS: "In Progress",
    PLANNED: "Planned",
  };

  const countFor = (f: FilterType): number => {
    if (f === "ALL") return 0;
    return allEntries.filter((e) => e.type === f).length;
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-10">
        {FILTER_TYPES.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              activeFilter === f
                ? "bg-accent text-white border-accent"
                : "bg-card-bg border-card-border text-muted hover:border-accent/40 hover:text-foreground"
            }`}
          >
            {filterLabels[f]}
            {f !== "ALL" && countFor(f) > 0 && (
              <span className="ml-1.5 text-xs opacity-70">
                {countFor(f)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-4">📭</div>
          <p>{t.no_updates}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-card-border" />

          <div className="space-y-8">
            {filtered.map((entry) => {
              const styles = TYPE_STYLES[entry.type];
              return (
                <div key={entry.id} id={entry.id} className="relative flex gap-6">
                  {/* Dot */}
                  <div className="relative z-10 mt-1 shrink-0">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 border-background ${styles.dot} ${entry.type === "IN_PROGRESS" ? "animate-pulse" : ""}`} />
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-card-bg border border-card-border rounded-xl p-5 hover:border-accent/30 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${styles.color} ${styles.bg} ${styles.border}`}
                        >
                          <TypeIcon type={entry.type} />
                          {typeLabels[entry.type]}
                        </span>
                        {entry.kind === "initiative" && entry.taskCount > 0 && (
                          <span className="text-xs text-muted/60 border border-card-border px-1.5 py-0.5 rounded">
                            {entry.taskCount} tasks
                          </span>
                        )}
                      </div>
                      <time dateTime={entry.date} className="text-xs text-muted/60 shrink-0">
                        {formatDate(entry.date)}
                      </time>
                    </div>

                    <h3 className="text-base font-semibold mb-2 leading-snug">{entry.title}</h3>
                    {entry.kind === "update" && (
                      <p className="text-sm text-muted leading-relaxed">{entry.description}</p>
                    )}
                    {entry.kind === "initiative" && entry.summary && (
                      <p className="text-sm text-muted leading-relaxed">{entry.summary}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
