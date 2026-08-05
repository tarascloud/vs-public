import { NextRequest } from "next/server";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const MEMPALACE_URL = process.env.MEMPALACE_URL || "http://mempalace:8030";
const TOKEN =
  process.env.MEMPALACE_BEARER_TOKEN || process.env.MEMPALACE_INGEST_TOKEN || "";

export async function POST(req: NextRequest) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  if (!TOKEN) {
    return Response.json(
      { error: "MEMPALACE_BEARER_TOKEN not configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const r = await fetch(`${MEMPALACE_URL}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
