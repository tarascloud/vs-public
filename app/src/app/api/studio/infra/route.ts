import { z } from "zod";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface InfraStatus {
  system: {
    cpuPercent: number;
    memUsedMb: number;
    memTotalMb: number;
    diskUsedGb: number;
    diskTotalGb: number;
    uptimeSecs: number;
  };
  services: Array<{
    name: string;
    ok: boolean;
    responseMs: number;
  }>;
  containers: Array<{
    name: string;
    state: string;
    health: string;
  }>;
  nasOnline: boolean;
  database: {
    postgres: boolean;
    pgbouncer: boolean;
    redis: boolean;
  };
}

const FALLBACK: InfraStatus = {
  system: {
    cpuPercent: 0,
    memUsedMb: 0,
    memTotalMb: 0,
    diskUsedGb: 0,
    diskTotalGb: 0,
    uptimeSecs: 0,
  },
  services: [],
  containers: [],
  nasOnline: false,
  database: {
    postgres: false,
    pgbouncer: false,
    redis: false,
  },
};

// Simple in-memory cache: 30-second TTL
let cache: { data: InfraStatus; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

// Upstream shape from status service /api/status/public — fields are
// optional/permissive because upstream uses snake_case and may evolve.
const SystemRawSchema = z
  .object({
    cpu_percent: z.number().optional(),
    cpuPercent: z.number().optional(),
    mem_used_mb: z.number().optional(),
    memUsedMb: z.number().optional(),
    mem_total_mb: z.number().optional(),
    memTotalMb: z.number().optional(),
    disk_used_gb: z.number().optional(),
    diskUsedGb: z.number().optional(),
    disk_total_gb: z.number().optional(),
    diskTotalGb: z.number().optional(),
    uptime_secs: z.number().optional(),
    uptimeSecs: z.number().optional(),
  })
  .passthrough();

const ServiceRawSchema = z
  .object({
    name: z.string().optional(),
    ok: z.boolean().optional(),
    status: z.string().optional(),
    response_ms: z.number().optional(),
    responseMs: z.number().optional(),
  })
  .passthrough();

const ContainerRawSchema = z
  .object({
    name: z.string().optional(),
    state: z.string().optional(),
    health: z.string().optional(),
  })
  .passthrough();

const DatabaseRawSchema = z
  .object({
    postgres: z.boolean().optional(),
    pgbouncer: z.boolean().optional(),
    redis: z.boolean().optional(),
  })
  .passthrough();

const InfraStatusRawSchema = z
  .object({
    system: SystemRawSchema.optional(),
    services: z.array(ServiceRawSchema).optional(),
    containers: z.array(ContainerRawSchema).optional(),
    nas_online: z.boolean().optional(),
    nasOnline: z.boolean().optional(),
    database: DatabaseRawSchema.optional(),
    db: DatabaseRawSchema.optional(),
  })
  .passthrough();

type InfraStatusRaw = z.infer<typeof InfraStatusRawSchema>;

function mapStatus(raw: InfraStatusRaw): InfraStatus {
  const system = raw.system ?? {};
  const services: InfraStatus["services"] = (raw.services ?? []).map((s) => ({
    name: String(s.name ?? ""),
    ok: s.ok != null ? Boolean(s.ok) : s.status === "ok",
    responseMs: Number(s.response_ms ?? s.responseMs ?? 0),
  }));

  const containers: InfraStatus["containers"] = (raw.containers ?? []).map(
    (c) => ({
      name: String(c.name ?? ""),
      state: String(c.state ?? ""),
      health: String(c.health ?? ""),
    })
  );

  const db = raw.database ?? raw.db ?? {};

  return {
    system: {
      cpuPercent: Number(system.cpu_percent ?? system.cpuPercent ?? 0),
      memUsedMb: Number(system.mem_used_mb ?? system.memUsedMb ?? 0),
      memTotalMb: Number(system.mem_total_mb ?? system.memTotalMb ?? 0),
      diskUsedGb: Number(system.disk_used_gb ?? system.diskUsedGb ?? 0),
      diskTotalGb: Number(system.disk_total_gb ?? system.diskTotalGb ?? 0),
      uptimeSecs: Number(system.uptime_secs ?? system.uptimeSecs ?? 0),
    },
    services,
    containers,
    nasOnline: Boolean(raw.nas_online ?? raw.nasOnline ?? false),
    database: {
      postgres: Boolean(db.postgres ?? false),
      pgbouncer: Boolean(db.pgbouncer ?? false),
      redis: Boolean(db.redis ?? false),
    },
  };
}

async function fetchInfraStatus(): Promise<InfraStatus> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const statusUrl = process.env.STATUS_URL || "http://172.19.0.1:8090";
    const res = await fetch(`${statusUrl}/api/status/public`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return FALLBACK;

    const raw: unknown = await res.json();
    const parsed = InfraStatusRawSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Infra upstream shape drift", parsed.error);
      return FALLBACK;
    }
    const data = mapStatus(parsed.data);
    cache = { data, fetchedAt: now };
    return data;
  } catch {
    return FALLBACK;
  }
}

export async function GET() {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const data = await fetchInfraStatus();
  return Response.json(data);
}
