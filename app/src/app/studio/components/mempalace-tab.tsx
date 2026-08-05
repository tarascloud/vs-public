"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Overview = {
  total_drawers: number;
  wings: Record<string, number>;
  rooms: Record<string, number>;
  last_ingest_ts: string | null;
  health: string;
  version: string;
  db_size_bytes: number;
};

type TimeseriesRow = { date: string } & Record<string, number | string>;

type IngestRun = {
  ts: string;
  ingester: string;
  status: string;
  ingested: number;
  skipped: number;
  errors: number;
  duration_sec: number;
};

type RecentDrawer = {
  id: string;
  wing: string;
  room: string;
  source: string | null;
  source_file: string | null;
  content_preview: string;
  filed_at: string | null;
};

type TopRoom = {
  wing: string;
  room: string;
  count: number;
  last_added: string | null;
  growth_7d: number;
};

type SearchHit = {
  content: string;
  wing: string;
  room: string;
  source: string;
  chunk_index: number;
  score: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const WING_COLORS: Record<string, string> = {
  vs: "#8b5cf6",
  pd: "#3b82f6",
  shuleansky: "#f59e0b",
  workflow: "#10b981",
  unknown: "#6b7280",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  const diff = Date.now() - dt.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

function formatDate(iso: unknown): string {
  try {
    return new Date(String(iso)).toLocaleDateString("en-CA");
  } catch {
    return String(iso);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MempalaceTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesRow[]>([]);
  const [ingestRuns, setIngestRuns] = useState<IngestRun[]>([]);
  const [recentDrawers, setRecentDrawers] = useState<RecentDrawer[]>([]);
  const [topRooms, setTopRooms] = useState<TopRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [ov, ts, runs, recent, top] = await Promise.all([
        fetch("/api/mempalace/stats/overview").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/mempalace/stats/timeseries").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/mempalace/stats/ingest-runs?limit=30").then((r) =>
          r.ok ? r.json() : []
        ),
        fetch("/api/mempalace/stats/recent-drawers?limit=20").then((r) =>
          r.ok ? r.json() : []
        ),
        fetch("/api/mempalace/stats/top-rooms?limit=10").then((r) =>
          r.ok ? r.json() : []
        ),
      ]);
      setOverview(ov);
      setTimeseries(Array.isArray(ts) ? ts : []);
      setIngestRuns(Array.isArray(runs) ? runs : []);
      setRecentDrawers(Array.isArray(recent) ? recent : []);
      setTopRooms(Array.isArray(top) ? top : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh recent drawers every 30s.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/mempalace/stats/recent-drawers?limit=20");
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) setRecentDrawers(data);
        }
      } catch {
        // ignore transient errors
      }
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const wingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of timeseries) {
      for (const k of Object.keys(row)) {
        if (k.startsWith("wing_")) keys.add(k);
      }
    }
    return Array.from(keys).sort();
  }, [timeseries]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const r = await fetch("/api/mempalace/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, k: 10, mode: "hybrid" }),
      });
      if (!r.ok) throw new Error(`Search failed: ${r.status}`);
      const data = await r.json();
      setSearchHits(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <p className="text-muted">Loading MemPalace dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={fetchAll}
          className="mt-3 px-3 py-1.5 text-sm rounded border border-card-border hover:bg-card-border/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold">MemPalace</h2>
            <p className="text-sm text-muted mt-1">
              What the AI remembers — live visualization of the palace.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 text-sm rounded border border-card-border hover:bg-card-border/30"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total drawers"
          value={overview?.total_drawers.toLocaleString() ?? "—"}
          sub={`${Object.keys(overview?.wings ?? {}).length} wings`}
        />
        <StatCard
          label="Last ingest"
          value={formatRelative(overview?.last_ingest_ts ?? null)}
          sub={overview?.last_ingest_ts?.slice(0, 16).replace("T", " ") ?? ""}
        />
        <StatCard
          label="DB size"
          value={formatBytes(overview?.db_size_bytes ?? 0)}
          sub={`v${overview?.version ?? "—"}`}
        />
        <StatCard
          label="Health"
          value={overview?.health ?? "—"}
          sub={overview?.health === "ok" ? "All systems go" : "Check logs"}
          highlight={overview?.health === "ok" ? "green" : "red"}
        />
      </div>

      {/* Live search */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-3">Live search</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search the palace…"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError && <p className="text-red-400 text-sm mt-2">{searchError}</p>}
        {searchHits.length > 0 && (
          <ul className="mt-4 space-y-2">
            {searchHits.map((hit, i) => (
              <li
                key={i}
                className="p-3 rounded-lg border border-card-border bg-background/50"
              >
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <span className="px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {hit.wing}/{hit.room}
                  </span>
                  <span>{hit.source}</span>
                  <span className="ml-auto">score: {hit.score.toFixed(4)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap line-clamp-3">{hit.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeseries chart */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-3">Drawers over time (30d)</h3>
        {timeseries.length === 0 ? (
          <p className="text-sm text-muted">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={formatDate}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1f2937", border: "1px solid #374151" }}
                labelFormatter={formatDate}
              />
              <Legend />
              {wingKeys.map((k) => {
                const wing = k.replace("wing_", "");
                return (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stackId="1"
                    stroke={WING_COLORS[wing] ?? "#9ca3af"}
                    fill={WING_COLORS[wing] ?? "#9ca3af"}
                    fillOpacity={0.6}
                    name={wing}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top rooms + ingest runs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card-bg border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-3">Top rooms</h3>
          {topRooms.length === 0 ? (
            <p className="text-sm text-muted">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={topRooms.map((r) => ({
                  name: `${r.wing}/${r.room}`,
                  count: r.count,
                  growth: r.growth_7d,
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                <Tooltip
                  contentStyle={{ background: "#1f2937", border: "1px solid #374151" }}
                />
                <Bar dataKey="count" fill="#8b5cf6" name="Total" />
                <Bar dataKey="growth" fill="#10b981" name="Growth 7d" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card-bg border border-card-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-3">Ingest runs</h3>
          {ingestRuns.length === 0 ? (
            <p className="text-sm text-muted">
              No ingest log available (check /opt/docker/backups/mempalace-ingest.log).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={ingestRuns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="ts"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5, 16)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1f2937", border: "1px solid #374151" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ingested"
                  stroke="#10b981"
                  name="Ingested"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef4444"
                  name="Errors"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent drawers feed */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Recent drawers</h3>
          <span className="text-xs text-muted">auto-refresh 30s</span>
        </div>
        {recentDrawers.length === 0 ? (
          <p className="text-sm text-muted">No drawers yet.</p>
        ) : (
          <ul className="space-y-2 max-h-[480px] overflow-y-auto">
            {recentDrawers.map((d) => (
              <li
                key={d.id}
                className="p-3 rounded-lg border border-card-border bg-background/50"
              >
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <span className="px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {d.wing}/{d.room}
                  </span>
                  {d.source && <span>{d.source}</span>}
                  <span className="ml-auto">{formatRelative(d.filed_at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap line-clamp-3">
                  {d.content_preview}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: "green" | "red";
}) {
  const highlightColor =
    highlight === "green"
      ? "text-green-400"
      : highlight === "red"
        ? "text-red-400"
        : "text-foreground";
  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlightColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1 truncate">{sub}</div>}
    </div>
  );
}
