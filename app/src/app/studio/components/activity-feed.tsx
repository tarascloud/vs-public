"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

// ---------- Types ----------

export interface ActivityItem {
  id: string;
  agentId: string;
  action: string;
  details: string | null;
  taskId: string | null;
  createdAt: string;
  agent: { id: string; displayName: string; name: string };
  task: { id: string; title: string; ticketId: string } | null;
}

interface ActivityFeedProps {
  /**
   * Activities passed from parent (e.g. via SSE hook).
   * When provided, internal polling is disabled.
   */
  activities?: ActivityItem[];
  /**
   * Legacy: initial activities + polling interval (used as standalone fallback).
   * Ignored when `activities` prop is provided.
   */
  initialActivities?: ActivityItem[];
  pollInterval?: number;
}

// ---------- Helpers ----------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ActionConfig = {
  label: string;
  color: string;
  icon: React.ReactNode;
};

function getActionConfig(action: string): ActionConfig {
  switch (action) {
    case "TASK_STARTED":
      return {
        label: "started task",
        color: "text-blue-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "TASK_COMPLETED":
      return {
        label: "completed task",
        color: "text-green-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "TASK_BLOCKED":
      return {
        label: "blocked on task",
        color: "text-yellow-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
      };
    case "ERROR":
      return {
        label: "encountered error",
        color: "text-red-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "DEPLOYED":
      return {
        label: "deployed",
        color: "text-purple-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        ),
      };
    case "MESSAGE":
      return {
        label: "sent message",
        color: "text-slate-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
      };
    default:
      return {
        label: action.toLowerCase().replace(/_/g, " "),
        color: "text-slate-400",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
  }
}

// ---------- Component ----------

export default function ActivityFeed({
  activities: activitiesProp,
  initialActivities,
  pollInterval = 10_000,
}: ActivityFeedProps) {
  const t = useTranslations("studio");

  // If activitiesProp is provided (from SSE), use it directly — no internal polling
  const controlled = activitiesProp !== undefined;

  const [internalActivities, setInternalActivities] = useState<ActivityItem[]>(initialActivities ?? []);
  const [loading, setLoading] = useState(!controlled && !initialActivities);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/activity");
      if (!res.ok) {
        setError("Failed to load activity");
        return;
      }
      const data: ActivityItem[] = await res.json();
      if (Array.isArray(data)) {
        setInternalActivities(data);
        setError(null);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Only run internal polling when not in controlled (SSE) mode
  useEffect(() => {
    if (controlled) return;
    if (!initialActivities) {
      fetchActivities();
    }
    const interval = setInterval(fetchActivities, pollInterval);
    return () => clearInterval(interval);
  }, [controlled, fetchActivities, initialActivities, pollInterval]);

  const displayActivities = controlled ? (activitiesProp ?? []) : internalActivities;
  const isLoading = controlled ? false : loading;

  return (
    <div className="rounded-xl border border-card-border bg-card-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <h3 className="text-sm font-semibold text-foreground">
          {t("activityFeed")}
        </h3>
        {/* Manual refresh — only shown in non-controlled (standalone) mode */}
        {!controlled && (
          <button
            onClick={fetchActivities}
            className="text-xs text-muted hover:text-foreground transition-colors"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Feed */}
      <div className="max-h-72 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            <span className="text-xs">{t("loading")}</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center justify-center py-6 text-red-400 text-xs">
            {error}
          </div>
        )}

        {!isLoading && !error && displayActivities.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted text-xs">
            {t("noActivity")}
          </div>
        )}

        {!isLoading && !error && displayActivities.length > 0 && (
          <ul className="divide-y divide-card-border">
            {displayActivities.map((item) => {
              const config = getActionConfig(item.action);
              return (
                <li key={item.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-card-bg-hover transition-colors">
                  {/* Icon */}
                  <span className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                    {config.icon}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {item.agent.displayName}
                      </span>
                      <span className={`text-xs ${config.color}`}>
                        {config.label}
                      </span>
                      {item.task && (
                        <span className="text-xs text-muted truncate">
                          &quot;{item.task.title}&quot;
                        </span>
                      )}
                    </div>
                    {item.details && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                        {item.details}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="flex-shrink-0 text-xs text-muted mt-0.5">
                    {relativeTime(item.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
