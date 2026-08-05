# MemPalace — long-term memory MCP server + ingestion sidecar
# Builds on VPS (amd64); do not build on Mac (arm64)
FROM python:3.12-slim@sha256:46cb7cc2877e60fbd5e21a9ae6115c30ace7a077b9f8772da879e4590c18c2e3

# ── System deps ──────────────────────────────────────────────────────────────
# REV-R2-20260419-0032: curl re-added for debugging + backup scripts
# (mempalace-backup.sh, smoke tests, manual ingestion verification).
# Healthcheck still uses python urllib (F-17 decision preserved for healthcheck).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── Unprivileged user ─────────────────────────────────────────────────────────
# UID/GID 1000 matches bind-mount dirs created with chown 1000:1000
RUN groupadd -g 1000 mempalace && useradd -u 1000 -g mempalace -m -s /sbin/nologin mempalace

# ── Python deps ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .

# MP-C-08-RERANKER: install CPU-only torch FIRST from the PyTorch CPU wheel
# index. Without this, sentence-transformers pulls full CUDA torch (~8GB).
# CPU wheel is ~200MB and matches our VPS workload (no GPU).
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
        torch==2.4.1

RUN pip install --no-cache-dir -r requirements.txt

# MP-C-08-RERANKER: pre-download CrossEncoder model into HF cache so first
# query doesn't pay a ~5s download. chown afterwards so unprivileged user
# can read it at runtime (cache dir lives under /home/mempalace/.cache).
RUN mkdir -p /home/mempalace/.cache && \
    HF_HOME=/home/mempalace/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/home/mempalace/.cache/sentence_transformers \
    python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')" && \
    chown -R 1000:1000 /home/mempalace/.cache

# ── Scrubber (from mempalace/scrubber/) ───────────────────────────
# Copied as a package so mempalace server can import it at ingest time
COPY scrubber/ /app/scrubber/

# ── Audit logger (F-05: mp_t14a) ─────────────────────────────────────────────
COPY audit.py /app/audit.py

# ── Ingestion sidecar ─────────────────────────────────────────────────────────
COPY ingest_server.py /app/ingest_server.py
COPY ingest_schemas.py /app/ingest_schemas.py
COPY ingest_scrub.py /app/ingest_scrub.py
COPY ingest_store.py /app/ingest_store.py
COPY ingest_stats.py /app/ingest_stats.py
COPY local_mcp_server.py /app/local_mcp_server.py
COPY db/ /app/db/
COPY pg/ /app/pg/

# ── Volumes ───────────────────────────────────────────────────────────────────
# /data/palace  — bind-mounted from /opt/docker/mempalace/palace on host
# /data/outbox  — Mac-side outbox buffer (flush when VPS comes back online)
# /secrets      — read-only bind for scrubber secrets index
# /home/mempalace/.cache — persistent HuggingFace/sentence-transformers model cache
VOLUME ["/data/palace", "/data/outbox"]

# ── Runtime environment ───────────────────────────────────────────────────────
ENV PALACE_PATH=/data/palace \
    OUTBOX_PATH=/data/outbox \
    SECRETS_DIR=/secrets \
    INGEST_PORT=8030 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    HF_HOME=/home/mempalace/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/home/mempalace/.cache/sentence_transformers \
    TRANSFORMERS_CACHE=/home/mempalace/.cache/huggingface/hub

USER mempalace

EXPOSE 8030

# ── Healthcheck — python-based, no curl needed (F-17: drop curl dep) ─────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8030/health',timeout=3).status==200 else 1)"

# ── Entrypoint: start ingestion sidecar (MCP is spawned via direct stdio) ─────
ENTRYPOINT ["python", "/app/ingest_server.py"]
