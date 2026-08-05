import { NextRequest } from "next/server";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const MEMPALACE_URL = process.env.MEMPALACE_URL || "http://mempalace:8030";
const TOKEN =
  process.env.MEMPALACE_BEARER_TOKEN || process.env.MEMPALACE_INGEST_TOKEN || "";

// Allowed stats routes — strict allow-list, no passthrough of arbitrary paths.
const ALLOWED = new Set([
  "overview",
  "timeseries",
  "ingest-runs",
  "scrubber",
  "recent-drawers",
  "top-rooms",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  if (!TOKEN) {
    return Response.json(
      { error: "MEMPALACE_BEARER_TOKEN not configured" },
      { status: 503 }
    );
  }

  const { path } = await params;
  const segment = path?.[0] ?? "";
  if (!ALLOWED.has(segment)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Forward query string to upstream.
  const url = new URL(req.url);
  const upstream = `${MEMPALACE_URL}/stats/${segment}${url.search}`;

  try {
    const r = await fetch(upstream, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    return Response.json(
      { error: `upstream unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
