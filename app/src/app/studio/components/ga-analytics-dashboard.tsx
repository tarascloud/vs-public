"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface DailyData {
  date: string;
  users: number;
  sessions: number;
  pageviews: number;
}

interface ProjectAnalytics {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  ga4MeasurementId: string | null;
  dashboardUrl: string | null;
  configured: boolean;
  analytics: {
    period: string;
    users: number;
    usersPrev: number;
    sessions: number;
    sessionsPrev: number;
    pageviews: number;
    pageviewsPrev: number;
    avgDuration: number;
    bounceRate: number;
    daily: DailyData[];
  } | null;
}

interface ApiResponse {
  projects: ProjectAnalytics[];
  apiConfigured: boolean;
  setupInstructions?: Record<string, string>;
}

function delta(current: number, previous: number): { value: string; positive: boolean } {
  if (previous === 0) return { value: current > 0 ? "+100%" : "0%", positive: current > 0 };
  const pct = ((current - previous) / previous) * 100;
  return { value: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MiniChart({ data, dataKey }: { data: DailyData[]; dataKey: keyof DailyData }) {
  if (!data.length) return null;
  const values = data.map((d) => Number(d[dataKey]));
  const max = Math.max(...values, 1);
  const width = 120;
  const height = 32;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * height}`).join(" ");

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-accent"
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  prev,
  format,
}: {
  label: string;
  value: number;
  prev?: number;
  format?: "number" | "duration" | "percent";
}) {
  const formatted =
    format === "duration"
      ? formatDuration(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : value.toLocaleString();

  const d = prev !== undefined ? delta(value, prev) : null;

  return (
    <div className="text-center">
      <div className="text-lg sm:text-xl font-bold">{formatted}</div>
      {d && (
        <span className={`text-xs ${d.positive ? "text-green-400" : "text-red-400"}`}>
          {d.value}
        </span>
      )}
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

export default function GaAnalyticsDashboard() {
  const t = useTranslations("smm");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects/analytics/ga-data")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-muted py-8 text-center">{t("ga_loading")}</div>;
  }

  if (!data) return null;

  const connectedProjects = data.projects.filter((p) => p.configured);
  const notConnected = data.projects.filter((p) => !p.configured);

  // Totals across all sites
  const totals = connectedProjects.reduce(
    (acc, p) => {
      if (p.analytics) {
        acc.users += p.analytics.users;
        acc.usersPrev += p.analytics.usersPrev;
        acc.sessions += p.analytics.sessions;
        acc.pageviews += p.analytics.pageviews;
      }
      return acc;
    },
    { users: 0, usersPrev: 0, sessions: 0, pageviews: 0 }
  );

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("ga_analytics_title")}
          </h3>
          <p className="text-xs text-muted">
            {connectedProjects.length} {t("ga_sites_tracked")}
          </p>
        </div>
      </div>

      {/* API not configured notice */}
      {!data.apiConfigured && (
        <div className="mb-6 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-amber-400 font-medium mb-2">{t("ga_api_not_configured")}</p>
              <p className="text-xs text-muted mb-3">{t("ga_api_setup_hint")}</p>
              <details className="group">
                <summary className="text-xs text-muted cursor-pointer hover:text-foreground transition-colors">
                  {t("ga_setup_steps")}
                </summary>
                <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-muted">
                  <li>Google Cloud Console → enable Analytics Data API</li>
                  <li>Create service account → download JSON key</li>
                  <li>Add service account email as Viewer in each GA4 property</li>
                  <li>Set <code className="font-mono bg-card-border/50 px-1 rounded">GOOGLE_ANALYTICS_CREDENTIALS</code> in Infisical</li>
                </ol>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Per-site cards */}
      <div className="space-y-3">
        {connectedProjects.map((project) => (
          <div
            key={project.id}
            className="p-4 rounded-lg border border-card-border bg-background hover:border-accent/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">{project.name}</span>
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted hover:text-accent transition-colors hidden sm:inline"
                  >
                    {project.url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-muted hidden sm:inline">
                  {project.ga4MeasurementId}
                </code>
                {project.dashboardUrl && (
                  <a
                    href={project.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    GA4
                  </a>
                )}
              </div>
            </div>

            {project.analytics ? (
              <div className="flex items-center justify-between">
                <div className="flex gap-6">
                  <StatCard label={t("ga_users")} value={project.analytics.users} prev={project.analytics.usersPrev} />
                  <StatCard label={t("ga_sessions")} value={project.analytics.sessions} prev={project.analytics.sessionsPrev} />
                  <StatCard label={t("ga_pageviews")} value={project.analytics.pageviews} prev={project.analytics.pageviewsPrev} />
                  <div className="hidden sm:block">
                    <StatCard label={t("ga_avg_duration")} value={project.analytics.avgDuration} format="duration" />
                  </div>
                  <div className="hidden sm:block">
                    <StatCard label={t("ga_bounce_rate")} value={project.analytics.bounceRate} format="percent" />
                  </div>
                </div>
                <div className="hidden md:block">
                  <MiniChart data={project.analytics.daily} dataKey="pageviews" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted italic">{t("ga_no_data")}</p>
            )}
          </div>
        ))}

        {/* Totals row (only if API data available) */}
        {data.apiConfigured && totals.users > 0 && (
          <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold">{t("ga_total")}</span>
            </div>
            <div className="flex gap-6">
              <StatCard label={t("ga_users")} value={totals.users} prev={totals.usersPrev} />
              <StatCard label={t("ga_sessions")} value={totals.sessions} />
              <StatCard label={t("ga_pageviews")} value={totals.pageviews} />
            </div>
          </div>
        )}

        {/* Not connected */}
        {notConnected.length > 0 && (
          <div className="text-xs text-muted mt-2">
            {t("ga_not_tracked")}: {notConnected.map((p) => p.name).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
