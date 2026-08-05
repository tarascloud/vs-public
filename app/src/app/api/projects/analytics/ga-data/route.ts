import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const dynamic = "force-dynamic";

// Lazy singletons — instantiated once per module load, reused across requests.
// Replaces per-request dynamic import() + new client() pattern (REV-R2-20260419-0008).
let _adminClient: AnalyticsAdminServiceClient | null = null;
let _dataClient: BetaAnalyticsDataClient | null = null;
function getAdminClient(credentials: unknown): AnalyticsAdminServiceClient {
  if (!_adminClient) {
    _adminClient = new AnalyticsAdminServiceClient({ credentials: credentials as object });
  }
  return _adminClient;
}
function getDataClient(credentials: unknown): BetaAnalyticsDataClient {
  if (!_dataClient) {
    _dataClient = new BetaAnalyticsDataClient({ credentials: credentials as object });
  }
  return _dataClient;
}

interface GaMetrics {
  period: string;
  users: number;
  usersPrev: number;
  sessions: number;
  sessionsPrev: number;
  pageviews: number;
  pageviewsPrev: number;
  avgDuration: number;
  bounceRate: number;
  daily: { date: string; users: number; sessions: number; pageviews: number }[];
}

// In-memory cache with TTL. Follows the rate-limit.ts pattern until a
// distributed Redis client is wired in. Keys auto-expire on read.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function cacheGetStale<T>(key: string): T | null {
  // Bypass TTL — used as a last-resort fallback on upstream 500/quota errors
  const entry = cache.get(key);
  return entry ? (entry.value as T) : null;
}

// 30-day bucket — cache invalidates on calendar-day boundary (UTC)
function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

const GA_DATA_TTL_MS = 15 * 60 * 1000; // 15 min
const GA_MAP_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAP_CACHE_KEY = "ga:measurement-to-property";

interface MeasurementMap {
  measurementToProperty: Record<string, string>;
  propertyToName: Record<string, string>;
}

/**
 * GET /api/projects/analytics/ga-data
 *
 * Returns GA4 analytics data for all projects.
 * Uses Google Analytics Admin API to map measurement IDs → property IDs,
 * then Data API to fetch metrics.
 */
export async function GET() {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, slug: true, url: true, ga4MeasurementId: true },
    orderBy: { name: "asc" },
  });

  const credentialsJson = process.env.GOOGLE_ANALYTICS_CREDENTIALS;
  if (!credentialsJson) {
    return Response.json({
      projects: projects.map((p) => ({
        ...p,
        analytics: null,
        dashboardUrl: p.ga4MeasurementId
          ? `https://analytics.google.com/analytics/web/#/p${p.ga4MeasurementId.replace("G-", "")}/reports/reportinghub`
          : null,
        configured: !!p.ga4MeasurementId,
      })),
      apiConfigured: false,
    });
  }

  try {
    const credentials = JSON.parse(credentialsJson);

    // Step 1: measurement→property map (1h cache — mapping rarely changes)
    let mapped = cacheGet<MeasurementMap>(MAP_CACHE_KEY);
    if (!mapped) {
      const adminClient = getAdminClient(credentials);

      const measurementToProperty: Record<string, string> = {};
      const propertyToName: Record<string, string> = {};

      // Collect only the measurement IDs our projects actually use
      const neededIds = new Set(
        projects
          .map((p) => p.ga4MeasurementId)
          .filter((id): id is string => !!id),
      );

      const [summaries] = await adminClient.listAccountSummaries({});
      for (const account of summaries || []) {
        if (neededIds.size === 0) break; // all found — stop scanning
        for (const prop of account.propertySummaries || []) {
          if (neededIds.size === 0) break;
          if (!prop.property) continue;
          const propertyId = prop.property.replace("properties/", "");
          propertyToName[propertyId] = prop.displayName || "";

          try {
            const [streams] = await adminClient.listDataStreams({ parent: prop.property });
            for (const stream of streams || []) {
              const mid = stream.webStreamData?.measurementId;
              if (mid && neededIds.has(mid)) {
                measurementToProperty[mid] = propertyId;
                neededIds.delete(mid);
              }
            }
          } catch {
            // Skip if no access to streams
          }
        }
      }

      mapped = { measurementToProperty, propertyToName };
      cacheSet(MAP_CACHE_KEY, mapped, GA_MAP_TTL_MS);
    }

    // Step 2: Filter out projects whose measurement ID has no matching property
    // BEFORE instantiating the data client / issuing any Data API calls.
    // REV-R2-20260419-0008: avoids paying for listDataStreams + client init when
    // the project is unmappable.
    type ProjectRow = (typeof projects)[number];
    const unmapped: ProjectRow[] = [];
    const mappable: ProjectRow[] = [];
    for (const p of projects) {
      if (!p.ga4MeasurementId) {
        unmapped.push(p);
        continue;
      }
      if (!mapped!.measurementToProperty[p.ga4MeasurementId]) {
        unmapped.push(p);
        continue;
      }
      mappable.push(p);
    }

    const dataClient = getDataClient(credentials);
    const bucket = dayBucket();

    const unmappedResults = unmapped.map((p: ProjectRow) => {
      if (!p.ga4MeasurementId) {
        return { ...p, analytics: null, dashboardUrl: null, configured: false };
      }
      return {
        ...p,
        dashboardUrl: null,
        configured: true,
        analytics: null,
        error: `Property not found for ${p.ga4MeasurementId}`,
      };
    });

    const mappedResults = await Promise.all(
      mappable.map(async (p: ProjectRow) => {
        const propertyId = mapped!.measurementToProperty[p.ga4MeasurementId!];
        const dashboardUrl = `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/reportinghub`;

        const dataCacheKey = `ga-data:${p.id}:${bucket}`;
        const cached = cacheGet<GaMetrics>(dataCacheKey);
        if (cached) {
          return { ...p, dashboardUrl, configured: true, analytics: cached };
        }

        try {
          // Metrics: current 30 days vs previous 30 days
          const [metricsResponse] = await dataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [
              { startDate: "30daysAgo", endDate: "today" },
              { startDate: "60daysAgo", endDate: "31daysAgo" },
            ],
            metrics: [
              { name: "activeUsers" },
              { name: "sessions" },
              { name: "screenPageViews" },
              { name: "averageSessionDuration" },
              { name: "bounceRate" },
            ],
          });

          const current = metricsResponse.rows?.[0]?.metricValues ?? [];
          const previous = metricsResponse.rows?.[1]?.metricValues ?? [];

          // Daily breakdown for sparkline chart
          const [dailyResponse] = await dataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
            dimensions: [{ name: "date" }],
            metrics: [
              { name: "activeUsers" },
              { name: "sessions" },
              { name: "screenPageViews" },
            ],
            orderBys: [{ dimension: { dimensionName: "date" } }],
          });

          const daily = (dailyResponse.rows ?? []).map((row) => ({
            date: row.dimensionValues?.[0]?.value ?? "",
            users: parseInt(row.metricValues?.[0]?.value ?? "0"),
            sessions: parseInt(row.metricValues?.[1]?.value ?? "0"),
            pageviews: parseInt(row.metricValues?.[2]?.value ?? "0"),
          }));

          const analytics: GaMetrics = {
            period: "30d",
            users: parseInt(current[0]?.value ?? "0"),
            usersPrev: parseInt(previous[0]?.value ?? "0"),
            sessions: parseInt(current[1]?.value ?? "0"),
            sessionsPrev: parseInt(previous[1]?.value ?? "0"),
            pageviews: parseInt(current[2]?.value ?? "0"),
            pageviewsPrev: parseInt(previous[2]?.value ?? "0"),
            avgDuration: parseFloat(current[3]?.value ?? "0"),
            bounceRate: parseFloat(current[4]?.value ?? "0"),
            daily,
          };

          cacheSet(dataCacheKey, analytics, GA_DATA_TTL_MS);
          return { ...p, dashboardUrl, configured: true, analytics };
        } catch (err) {
          console.error(`GA4 data error for ${p.name} (${propertyId}):`, err);
          // On GA 500 / quota error — serve stale cached value if any
          const stale = cacheGetStale<GaMetrics>(dataCacheKey);
          return {
            ...p,
            dashboardUrl,
            configured: true,
            analytics: stale ?? null,
            stale: stale ? true : undefined,
          };
        }
      })
    );

    // Merge while preserving original DB ordering (by name asc)
    const resultsById = new Map<string, unknown>();
    for (const r of unmappedResults) resultsById.set(r.id, r);
    for (const r of mappedResults) resultsById.set(r.id, r);
    const results = projects.map((p) => resultsById.get(p.id));

    return Response.json({ projects: results, apiConfigured: true });
  } catch (err) {
    console.error("GA4 API error:", err);
    // Fallback: return projects with dashboard links but no live data
    return Response.json({
      projects: projects.map((p) => ({
        ...p,
        analytics: null,
        dashboardUrl: p.ga4MeasurementId
          ? `https://analytics.google.com/analytics/web/#/reports/reportinghub`
          : null,
        configured: !!p.ga4MeasurementId,
      })),
      apiConfigured: false,
      error: String(err instanceof Error ? err.message : err),
    });
  }
}
