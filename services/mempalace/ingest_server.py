"""MemPalace ingestion sidecar — FastAPI HTTP wrapper (MP-ARCH-C-03 rewrite).

Listens on 127.0.0.1:${INGEST_PORT} (default 8030) inside the container,
exposed as 127.0.0.1:8031 on the host.

Endpoints:
  POST /ingest/convo       — ingest conversation chunk
  POST /ingest/decision    — ingest decision record
  POST /ingest/transcript  — ingest transcript chunk
  POST /search             — hybrid (dense + lexical, RRF) search over palace
  GET  /health             — liveness check (also used by HEALTHCHECK)

Auth: Bearer token via MEMPALACE_INGEST_TOKEN env var (from .mempalace.env).
Security: timing-safe comparison (no early exit on partial match).

Security hardening (mp_t14a):
  F-04: Fail-closed — scrubber init failure → sys.exit(1); scrub() failure → 500
  F-05: Append-only audit log via AuditLogger to /data/palace/audit.log

Storage (MP-ARCH-C-03):
  PostgreSQL + pgvector via services.mempalace.db. Replaces direct ChromaDB
  usage. Embedding: Ollama nomic-embed-text (768d, multilingual UA/EN).
  Dedup via ON CONFLICT (source_id) DO NOTHING.
  Retrieval: dense (pgvector <=>) + lexical (ts_rank) fused by RRF k=60.

Note: upstream mempalace==3.1.0 package still uses Chroma for its own
mcp_server read path; a shim or adapter will be introduced in a later
ticket (~MP-ARCH-C-06). This sidecar no longer imports chromadb directly.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import sys
import time
from pathlib import Path

# FastAPI / uvicorn
try:
    from fastapi import FastAPI, HTTPException, Request, status
    import uvicorn
except ImportError as e:
    print(f"[mempalace-ingest] FATAL: missing dependency — {e}", file=sys.stderr)
    sys.exit(1)

# Audit logger (F-05: ADR §9.1 step 5)
sys.path.insert(0, "/app")

# ARCH-07: confine log paths to whitelisted roots so a malicious
# AUDIT_LOG_PATH/INGEST_LOG_PATH env override cannot make the sidecar write
# arbitrary files (e.g. /etc/cron.d/, ~/.ssh/authorized_keys) — a process
# that runs as root inside the container would otherwise be able to do this.
_LOG_PATH_WHITELIST = (
    "/data/palace",
    "/opt/docker/backups",
    "/opt/docker/mempalace",
)


def _ensure_log_path_confined(name: str, raw_path: str) -> str:
    p = Path(raw_path).resolve()
    for root in _LOG_PATH_WHITELIST:
        try:
            p.relative_to(Path(root).resolve())
            return str(p)
        except ValueError:
            continue
    print(
        f"[mempalace-ingest] FATAL: {name}={raw_path!r} is outside whitelist "
        f"{_LOG_PATH_WHITELIST}; refusing to start.",
        file=sys.stderr,
    )
    sys.exit(2)


try:
    from audit import AuditLogger
    AUDIT_LOG_PATH = _ensure_log_path_confined(
        "AUDIT_LOG_PATH",
        os.environ.get("AUDIT_LOG_PATH", "/data/palace/audit.log"),
    )
    _audit = AuditLogger(log_path=AUDIT_LOG_PATH)
except Exception as e:
    print(f"[mempalace-ingest] FATAL: audit logger unavailable ({e})", file=sys.stderr)
    sys.exit(1)

# Scrubber integration — extracted to ingest_scrub.py (god-file split).
# F-04: Fail-closed — if scrubber init fails, refuse all ingest (sys.exit)
from ingest_scrub import init_scrubber, scrub as _scrub

_scrubber_secrets_count = init_scrubber(_audit)

# MP-ARCH-C-03 storage layer — SQLAlchemy 2.0 + pgvector.
# Embedding/chunking/insert extracted to ingest_store.py (god-file split).
try:
    from db import session_scope
    from db.search import hybrid_search, dense_search, lexical_search
    from db.reranker import get_reranker
    from ingest_store import (
        get_embedder as _get_embedder,
        next_chunk_index as _next_chunk_index,
        add_chunked as _add_chunked,
    )
except ImportError as e:
    print(f"[mempalace-ingest] FATAL: db layer unavailable — {e}", file=sys.stderr)
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
PALACE_PATH = os.environ.get("PALACE_PATH", "/data/palace")  # kept for legacy audit msgs
AGENT_NAME = os.environ.get("MEMPALACE_AGENT", "ingest-sidecar")


# ── Auth ──────────────────────────────────────────────────────────────────────
# Support both MEMPALACE_INGEST_TOKEN (canonical) and MEMPALACE_BEARER_TOKEN (legacy)
INGEST_TOKEN = os.environ.get("MEMPALACE_INGEST_TOKEN") or os.environ.get("MEMPALACE_BEARER_TOKEN", "")
INGEST_PORT = int(os.environ.get("INGEST_PORT", "8030"))

if not INGEST_TOKEN:
    print(
        "[mempalace-ingest] WARNING: MEMPALACE_INGEST_TOKEN not set — all ingest requests will be rejected",
        file=sys.stderr,
    )

app = FastAPI(title="MemPalace Ingestion Sidecar", version="2.0.0", docs_url=None, redoc_url=None)


def _check_bearer(request: Request) -> None:
    """Timing-safe Bearer token check. Raises 401 on failure."""
    if not INGEST_TOKEN:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ingest token not configured")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    provided = auth[len("Bearer "):]
    if not hmac.compare_digest(
        hashlib.sha256(provided.encode()).digest(),
        hashlib.sha256(INGEST_TOKEN.encode()).digest(),
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")


def _client_info(request: Request) -> dict:
    """Extract client IP, X-Forwarded-For, User-Agent for audit logging."""
    client_ip = request.client.host if request.client else "unknown"
    forwarded_for = request.headers.get("x-forwarded-for", "")
    user_agent = request.headers.get("user-agent", "")
    return {
        "client_ip": client_ip,
        "forwarded_for": forwarded_for,
        "user_agent": user_agent,
    }


# ── Schemas — extracted to ingest_schemas.py (god-file split) ─────────────────

from ingest_schemas import (
    IngestConvoRequest,
    IngestDecisionRequest,
    IngestTranscriptRequest,
    IngestVsWebhookRequest,
    SearchRequest,
    SearchResult,
    SearchResponse,
)




# ── VS webhook (MP-MONO-04) ───────────────────────────────────────────────────
#
# Real-time ingest of VS Task completions. Mirrors nightly ingest_vs_db.py but
# triggered by VS API on status transition to DONE. Idempotent via source_id.
#
_VS_ROOM_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("room_mempalace", (
        "mempalace", "palace", "chroma", "embedding", "embeddings",
        "pgvector", "retrieval", "rag", "reranker", "drawer", "ingester",
    )),
    ("room_security", (
        "security", "secret", "secrets", "auth", "authn", "authz",
        "xss", "csrf", "scrub", "scrubber", "infisical", "bearer",
        "token", "credential", "vulnerab",
    )),
    ("room_infra", (
        "infra", "docker", "compose", "nginx", "cloudflare", "backup",
        "restore", "dns", "tunnel", "systemd", "pg_dump", "watchtower",
        "registry", "vps", "nas", "deploy", "deployment",
    )),
    ("room_agents", (
        "agent", "agents", "subagent", "claude", "architect", "developer",
        "designer", "devsecops", "tester", "coo", "smm", "cat ",
    )),
]


def _route_task_to_room(title, description):
    text = f"{title or ''} {description or ''}".lower()
    if not text.strip():
        return "room_tasks"
    for room, keywords in _VS_ROOM_KEYWORDS:
        for kw in keywords:
            if kw in text:
                return room
    return "room_tasks"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    palace_ok = Path(PALACE_PATH).exists()
    audit_ok = Path(AUDIT_LOG_PATH).exists() if AUDIT_LOG_PATH else False
    return {
        "status": "ok",
        "palace_path": PALACE_PATH,
        "palace_exists": palace_ok,
        "scrubber": True,  # fail-closed: if we're responding, scrubber is up
        "audit_log": audit_ok,
        "storage": "postgres+pgvector",
        "ts": int(time.time()),
    }


@app.post("/ingest/convo", status_code=status.HTTP_202_ACCEPTED)
async def ingest_convo(req: IngestConvoRequest, request: Request) -> dict:
    _check_bearer(request)
    client_meta = _client_info(request)
    bytes_in = len(req.content.encode())
    try:
        content, bytes_redacted, findings_count = _scrub(req.content)
    except RuntimeError as e:
        _audit.log_ingest(
            endpoint="/ingest/convo",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=0,
            findings_count=0,
            status="error",
            error=str(e),
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"scrubber error: {e}")

    header = (
        f"<!-- source={req.source} source_id={req.source_id or ''} "
        f"timestamp={req.timestamp} hall={req.hall} "
        f"participants={','.join(req.participants)} -->\n"
    )
    drawer_body = header + content
    try:
        n_chunks = _add_chunked(
            wing=req.wing,
            room=req.room,
            content=drawer_body,
            source=req.source,
            source_id=req.source_id,
            base_chunk_index=_next_chunk_index(),
            agent=AGENT_NAME,
            extra_metadata={
                "hall": req.hall,
                "participants": req.participants,
                **(req.metadata or {}),
            },
        )
    except Exception as e:
        _audit.log_ingest(
            endpoint="/ingest/convo",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=bytes_redacted,
            findings_count=findings_count,
            status="error",
            error=f"insert_drawer: {e}",
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"drawer insert failed: {e}")

    _audit.log_ingest(
        endpoint="/ingest/convo",
        source=req.source,
        bytes_in=bytes_in,
        bytes_redacted=bytes_redacted,
        findings_count=findings_count,
        status="ok",
        **client_meta,
    )
    return {"accepted": True, "wing": req.wing, "room": req.room, "chunks": n_chunks}


@app.post("/ingest/decision", status_code=status.HTTP_202_ACCEPTED)
async def ingest_decision(req: IngestDecisionRequest, request: Request) -> dict:
    _check_bearer(request)
    client_meta = _client_info(request)
    combined_in = req.content + (req.rationale or "")
    bytes_in = len(combined_in.encode())
    try:
        content_scrubbed, br1, fc1 = _scrub(req.content)
        body = f"# {req.title}\n\n{content_scrubbed}"
        bytes_redacted = br1
        findings_count = fc1
        if req.rationale:
            rationale_scrubbed, br2, fc2 = _scrub(req.rationale)
            body += f"\n\n**Rationale**: {rationale_scrubbed}"
            bytes_redacted += br2
            findings_count += fc2
    except RuntimeError as e:
        _audit.log_ingest(
            endpoint="/ingest/decision",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=0,
            findings_count=0,
            status="error",
            error=str(e),
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"scrubber error: {e}")

    header = (
        f"<!-- source={req.source} timestamp={req.timestamp} "
        f"type=decision hall=hall_decisions -->\n"
    )
    drawer_body = header + body
    try:
        n_chunks = _add_chunked(
            wing=req.wing,
            room=req.room,
            content=drawer_body,
            source=req.source,
            source_id=None,  # decisions have no inherent dedup key
            base_chunk_index=_next_chunk_index(),
            agent=AGENT_NAME,
            extra_metadata={
                "type": "decision",
                "title": req.title,
                **(req.metadata or {}),
            },
        )
    except Exception as e:
        _audit.log_ingest(
            endpoint="/ingest/decision",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=bytes_redacted,
            findings_count=findings_count,
            status="error",
            error=f"insert_drawer: {e}",
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"drawer insert failed: {e}")

    _audit.log_ingest(
        endpoint="/ingest/decision",
        source=req.source,
        bytes_in=bytes_in,
        bytes_redacted=bytes_redacted,
        findings_count=findings_count,
        status="ok",
        **client_meta,
    )
    return {"accepted": True, "wing": req.wing, "room": req.room, "chunks": n_chunks}


@app.post("/ingest/transcript", status_code=status.HTTP_202_ACCEPTED)
async def ingest_transcript(req: IngestTranscriptRequest, request: Request) -> dict:
    _check_bearer(request)
    client_meta = _client_info(request)
    bytes_in = len(req.content.encode())
    try:
        content, bytes_redacted, findings_count = _scrub(req.content)
    except RuntimeError as e:
        _audit.log_ingest(
            endpoint="/ingest/transcript",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=0,
            findings_count=0,
            status="error",
            error=str(e),
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"scrubber error: {e}")

    header = (
        f"<!-- source={req.source} source_id={req.source_id or ''} "
        f"timestamp={req.timestamp} hall=hall_events "
        f"speakers={','.join(req.speakers)} -->\n"
    )
    drawer_body = header + content
    try:
        n_chunks = _add_chunked(
            wing=req.wing,
            room=req.room,
            content=drawer_body,
            source=req.source,
            source_id=req.source_id,
            base_chunk_index=_next_chunk_index(),
            agent=AGENT_NAME,
            extra_metadata={
                "type": "transcript",
                "speakers": req.speakers,
                **(req.metadata or {}),
            },
        )
    except Exception as e:
        _audit.log_ingest(
            endpoint="/ingest/transcript",
            source=req.source,
            bytes_in=bytes_in,
            bytes_redacted=bytes_redacted,
            findings_count=findings_count,
            status="error",
            error=f"insert_drawer: {e}",
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"drawer insert failed: {e}")

    _audit.log_ingest(
        endpoint="/ingest/transcript",
        source=req.source,
        bytes_in=bytes_in,
        bytes_redacted=bytes_redacted,
        findings_count=findings_count,
        status="ok",
        **client_meta,
    )
    return {"accepted": True, "wing": req.wing, "room": req.room, "chunks": n_chunks}




@app.post("/ingest/vs-webhook", status_code=status.HTTP_202_ACCEPTED)
async def ingest_vs_webhook(req: IngestVsWebhookRequest, request: Request) -> dict:
    """Real-time ingest of a VS Task lifecycle event (MP-MONO-04).

    Idempotency: source_id is the VS Task internal id (matches nightly
    ingest_vs_db.py) so duplicate webhook posts OR late nightly runs will
    hit ON CONFLICT DO NOTHING.
    """
    _check_bearer(request)
    client_meta = _client_info(request)

    parts: list[str] = []
    header_line = f"# {req.title}"
    if req.ticketId:
        header_line = f"# [{req.ticketId}] {req.title}"
    parts.append(header_line)
    if req.description:
        parts.append(f"## Description\n{req.description}")
    if req.completionNote:
        parts.append(f"## Completion Note\n{req.completionNote}")
    if req.commitHash:
        parts.append(f"## Commit Hash\n{req.commitHash}")
    if req.verificationStatus:
        vblock = f"## Verification\n**Status**: {req.verificationStatus}"
        if req.verificationOutput:
            vout = req.verificationOutput
            if len(vout) > 2000:
                vout = vout[:2000] + "\n… [truncated]"
            vblock += f"\n\n```\n{vout}\n```"
        parts.append(vblock)
    body = "\n\n".join(parts)

    bytes_in = len(body.encode())
    try:
        content, bytes_redacted, findings_count = _scrub(body)
    except RuntimeError as e:
        _audit.log_ingest(
            endpoint="/ingest/vs-webhook",
            source="vs-tasks",
            bytes_in=bytes_in,
            bytes_redacted=0,
            findings_count=0,
            status="error",
            error=str(e),
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"scrubber error: {e}")

    room = _route_task_to_room(req.title, req.description)
    header_comment = (
        f"<!-- source=vs-tasks source_id={req.taskId} "
        f"ticketId={req.ticketId or ''} status={req.status} "
        f"initiativeId={req.initiativeId or ''} via=webhook -->\n"
    )
    drawer_body = header_comment + content

    try:
        n_chunks = _add_chunked(
            wing="wing_vs",
            room=room,
            content=drawer_body,
            source="vs-tasks",
            source_id=req.taskId,
            # MP-MONO-04: deterministic base index so re-posting the same
            # taskId always produces the same source_id:chunk-<i> keys,
            # which is essential for ON CONFLICT DO NOTHING idempotency.
            base_chunk_index=0,
            agent=AGENT_NAME,
            extra_metadata={
                "ticketId": req.ticketId or "",
                "status": req.status,
                "initiativeId": req.initiativeId or "",
                "commitHash": req.commitHash or "",
                "verificationStatus": req.verificationStatus or "",
                "routed_room": room,
                "via": "webhook",
            },
        )
    except Exception as e:
        _audit.log_ingest(
            endpoint="/ingest/vs-webhook",
            source="vs-tasks",
            bytes_in=bytes_in,
            bytes_redacted=bytes_redacted,
            findings_count=findings_count,
            status="error",
            error=f"insert_drawer: {e}",
            **client_meta,
        )
        raise HTTPException(status_code=500, detail=f"drawer insert failed: {e}")

    _audit.log_ingest(
        endpoint="/ingest/vs-webhook",
        source="vs-tasks",
        bytes_in=bytes_in,
        bytes_redacted=bytes_redacted,
        findings_count=findings_count,
        status="ok",
        **client_meta,
    )
    return {
        "accepted": True,
        "inserted": n_chunks > 0,
        "chunks": n_chunks,
        "wing": "wing_vs",
        "room": room,
        "source_id": req.taskId,
    }


# ── Search endpoint ──────────────────────────────────────────────────────────

@app.post("/search", response_model=SearchResponse)
async def search_endpoint(req: SearchRequest, request: Request) -> SearchResponse:
    """Hybrid (RRF) / dense / lexical search over the palace.

    mode:
      vector   — pgvector cosine distance only
      lexical  — ts_rank on content_tsv only
      hybrid   — RRF fusion of both (default)
    """
    _check_bearer(request)
    mode = req.mode if req.mode in ("vector", "lexical", "hybrid") else "hybrid"

    try:
        results: list[SearchResult] = []
        with session_scope() as s:
            if mode == "vector":
                embedder = _get_embedder()
                qvec = embedder.embed_one(req.query)
                rows = dense_search(s, qvec, limit=req.k, wing=req.wing, room=req.room, filed_at_from=req.filed_at_from, filed_at_to=req.filed_at_to)
                # distance → similarity (1 - cosine_distance)
                pairs = [(d, round(1.0 - dist, 4)) for d, dist in rows]
            elif mode == "lexical":
                rows = lexical_search(s, req.query, limit=req.k, wing=req.wing, room=req.room, filed_at_from=req.filed_at_from, filed_at_to=req.filed_at_to)
                pairs = [(d, round(rank, 4)) for d, rank in rows]
            else:  # hybrid
                embedder = _get_embedder()
                _rr = get_reranker()
                _rerank_pool = int(os.environ.get("MEMPALACE_RERANK_POOL", "50"))
                rows = hybrid_search(
                    s,
                    req.query,
                    limit=req.k,
                    wing=req.wing,
                    room=req.room,
                    embedder=embedder,
                    reranker=_rr,
                    rerank_pool=_rerank_pool,
                    filed_at_from=req.filed_at_from,
                    filed_at_to=req.filed_at_to,
                )
                reranker_applied = _rr is not None and getattr(_rr, "available", False)
                pairs = [(d, round(score, 6)) for d, score in rows]

            for drawer, score in pairs:
                results.append(
                    SearchResult(
                        content=drawer.content or "",
                        wing=drawer.wing or "",
                        room=drawer.room or "",
                        source=Path(drawer.source_file or drawer.source or "?").name,
                        chunk_index=int(drawer.chunk_index or 0),
                        score=float(score),
                    )
                )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"search failed: {e}")

    return SearchResponse(
        results=results,
        total=len(results),
        query=req.query,
        mode=mode,
        reranker_applied=locals().get("reranker_applied", False),
    )


# ── Stats endpoints (MP-UI-DASHBOARD-01) — extracted to ingest_stats.py ──────
# Dashboard stats routes — all bearer-auth. Read-only aggregations on drawers
# table plus log-file parsing for ingest runs and scrubber findings.

from ingest_stats import create_stats_router

INGEST_LOG_PATH = _ensure_log_path_confined(
    "INGEST_LOG_PATH",
    os.environ.get("INGEST_LOG_PATH", "/opt/docker/backups/mempalace-ingest.log"),
)

app.include_router(
    create_stats_router(
        check_bearer=_check_bearer,
        audit_log_path=AUDIT_LOG_PATH,
        ingest_log_path=INGEST_LOG_PATH,
    )
)


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",  # within container; Docker exposes only 127.0.0.1:8031 on host
        port=INGEST_PORT,
        log_level="info",
        access_log=True,
    )
