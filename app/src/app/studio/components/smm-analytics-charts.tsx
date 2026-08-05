"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ---------- Types ----------

interface MonthlyData {
  month: string;
  views: number;
  watchMinutes: number;
  avgDuration: number;
  subsGained: number;
  subsLost: number;
}

interface ChannelData {
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

interface AnalyticsData {
  channel?: ChannelData;
  monthly?: MonthlyData[];
  lastUpdated?: string;
}

interface ChartDataPoint {
  label: string;
  views: number;
  watchMinutes: number;
  subscribers: number;
}

// ---------- Normalize ----------
// youtube-sync.py writes keys like channelStats/monthlyAnalytics with different field names.
// This normalizer maps them to the shape the charts expect.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAnalytics(raw: any): AnalyticsData {
  if (!raw) return {};

  const channel: ChannelData | undefined = raw.channel ?? (raw.channelStats ? {
    subscriberCount: raw.channelStats.subscribers ?? raw.channelStats.subscriberCount ?? 0,
    viewCount: raw.channelStats.totalViews ?? raw.channelStats.viewCount ?? 0,
    videoCount: raw.channelStats.videoCount ?? 0,
  } : undefined);

  const rawMonthly: unknown[] = raw.monthly ?? raw.monthlyAnalytics ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthly: MonthlyData[] = rawMonthly.map((m: any) => ({
    month: m.month,
    views: m.views ?? 0,
    watchMinutes: m.watchMinutes ?? m.watchTimeMinutes ?? 0,
    avgDuration: m.avgDuration ?? m.avgViewDurationSec ?? 0,
    subsGained: m.subsGained ?? 0,
    subsLost: m.subsLost ?? 0,
  }));

  return {
    channel,
    monthly,
    lastUpdated: raw.lastUpdated ?? raw.syncedAt,
  };
}

// ---------- Helpers ----------

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function buildChartData(analytics: AnalyticsData): ChartDataPoint[] {
  const monthly = analytics.monthly ?? [];
  const channel = analytics.channel;

  if (monthly.length === 0) return [];

  // Compute startCount: channel.subscriberCount - sum(all subsGained) + sum(all subsLost)
  const totalGained = monthly.reduce((s, m) => s + (m.subsGained ?? 0), 0);
  const totalLost = monthly.reduce((s, m) => s + (m.subsLost ?? 0), 0);
  const currentSubs = channel?.subscriberCount ?? 0;
  let runningCount = currentSubs - totalGained + totalLost;

  return monthly.map((m) => {
    runningCount += (m.subsGained ?? 0) - (m.subsLost ?? 0);
    return {
      label: formatMonth(m.month),
      views: m.views ?? 0,
      watchMinutes: m.watchMinutes ?? 0,
      subscribers: runningCount,
    };
  });
}

// ---------- Custom Tooltip ----------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  unit?: string;
}

function CustomTooltip({ active, payload, label, unit = "" }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {formatNumber(entry.value)}{unit}
        </p>
      ))}
    </div>
  );
}

// ---------- Summary Cards ----------

interface SummaryCardsProps {
  analytics: AnalyticsData;
  t: ReturnType<typeof useTranslations>;
}

function SummaryCards({ analytics, t }: SummaryCardsProps) {
  const channel = analytics.channel;
  const monthly = analytics.monthly ?? [];

  const lastMonth = monthly[monthly.length - 1];
  const subsDelta = lastMonth ? (lastMonth.subsGained ?? 0) - (lastMonth.subsLost ?? 0) : null;

  const totalWatchMinutes = monthly.reduce((s, m) => s + (m.watchMinutes ?? 0), 0);
  const totalWatchHours = Math.round(totalWatchMinutes / 60);

  const avgDuration = monthly.length > 0
    ? Math.round(monthly.reduce((s, m) => s + (m.avgDuration ?? 0), 0) / monthly.length)
    : null;

  const cards = [
    {
      label: t("analytics_subscribers"),
      value: channel?.subscriberCount != null ? formatNumber(channel.subscriberCount) : "—",
      delta: subsDelta,
      deltaLabel: t("analytics_last_month"),
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
    },
    {
      label: t("analytics_total_views"),
      value: channel?.viewCount != null ? formatNumber(channel.viewCount) : "—",
      delta: null,
      deltaLabel: null,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      label: t("analytics_watch_time"),
      value: totalWatchMinutes > 0 ? `${formatNumber(totalWatchHours)}h` : "—",
      delta: null,
      deltaLabel: t("analytics_12_months"),
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
    },
    {
      label: t("analytics_avg_duration"),
      value: avgDuration != null ? `${avgDuration}s` : "—",
      delta: null,
      deltaLabel: null,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border ${card.borderColor} ${card.bgColor} p-3`}
        >
          <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-xs text-gray-400 mt-0.5">{card.label}</div>
          {card.delta != null && (
            <div className={`text-xs mt-1 font-medium ${card.delta >= 0 ? "text-green-400" : "text-red-400"}`}>
              {card.delta >= 0 ? "+" : ""}{card.delta} {card.deltaLabel}
            </div>
          )}
          {card.delta == null && card.deltaLabel && (
            <div className="text-xs text-gray-600 mt-1">{card.deltaLabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Main Component ----------

interface SmmAnalyticsChartsProps {
  accountId: string;
  analytics: AnalyticsData | null;
}

export default function SmmAnalyticsCharts({ accountId, analytics: initialAnalytics }: SmmAnalyticsChartsProps) {
  const t = useTranslations("smm");
  const normalized = initialAnalytics ? normalizeAnalytics(initialAnalytics) : null;
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(normalized);
  const [loading, setLoading] = useState(!normalized?.monthly?.length);

  useEffect(() => {
    if (!normalized?.monthly?.length) {
      setLoading(true);
      fetch(`/api/smm/accounts/${accountId}/analytics`)
        .then((r) => r.json())
        .then((data) => {
          const raw = data.analytics ?? data;
          setAnalytics(normalizeAnalytics(raw));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [accountId, normalized?.monthly?.length]);

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-gray-500 animate-pulse">
        {t("analytics_loading")}
      </div>
    );
  }

  if (!analytics?.monthly || analytics.monthly.length === 0) {
    return (
      <p className="text-xs text-gray-500 text-center py-4">{t("analytics_coming_soon")}</p>
    );
  }

  const chartData = buildChartData(analytics);

  return (
    <div>
      {/* Summary Cards */}
      <SummaryCards analytics={analytics} t={t} />

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Views Area Chart */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            {t("analytics_views_monthly")}
          </h4>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`viewsGrad-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="views"
                stroke="#3b82f6"
                strokeWidth={2}
                fill={`url(#viewsGrad-${accountId})`}
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Subscribers Line Chart */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            {t("analytics_subscribers_growth")}
          </h4>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="subscribers"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#10b981" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Watch Time Bar Chart */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 lg:col-span-2">
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            {t("analytics_watch_time_monthly")}
          </h4>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip content={<CustomTooltip unit=" min" />} />
              <Bar
                dataKey="watchMinutes"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {analytics.lastUpdated && (
        <p className="text-xs text-gray-600 mt-3 text-right">
          {t("analytics_updated")}: {new Date(analytics.lastUpdated).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
