-- MemPalace pgvector schema (MP-ARCH-C-01)
-- Target: pg database "mempalace" on VPS PostgreSQL
-- pgvector: 0.8.2 (installed via MP-MONO-03)
-- Embedding model: Ollama nomic-embed-text (768 dimensions, cosine similarity)
--
-- This file is the canonical DDL. ingest/storage code in C-03 must not
-- diverge from it; any change requires a new migration in pg/migrations/.

BEGIN;

-- ── Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- optional, for fuzzy room/wing matching
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── Wings (top-level namespace) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wings (
    name        TEXT PRIMARY KEY,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Rooms (sub-namespace within a wing) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
    wing        TEXT NOT NULL REFERENCES wings(name) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (wing, name)
);

-- ── Drawers (vector store, replaces ChromaDB collection) ─────────────────
CREATE TABLE IF NOT EXISTS drawers (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    wing          TEXT NOT NULL,
    room          TEXT NOT NULL,
    content       TEXT NOT NULL,
    content_tsv   TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content) || to_tsvector('simple', content)) STORED,
    embedding     VECTOR(768) NOT NULL,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    source        TEXT,           -- claude_sessions | pd_chat | shuleansky | telegram | vs_db | manual
    source_id     TEXT,           -- dedup key (e.g. "vs-initiatives:123:chunk-4")
    source_file   TEXT,           -- legacy field from Chroma metadata
    chunk_index   INT,
    filed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by      TEXT,
    scrubbed_at   TIMESTAMPTZ,
    FOREIGN KEY (wing, room) REFERENCES rooms(wing, name) ON DELETE RESTRICT
);

-- vector ANN index: ivfflat cosine
-- For ~1.6k rows lists=10 is fine; we will retune in C-08 once we measure.
-- Note: ivfflat must be built AFTER initial bulk insert for best centroids.
CREATE INDEX IF NOT EXISTS drawers_embedding_ivfflat
    ON drawers USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

-- BM25-ish full-text via tsvector
CREATE INDEX IF NOT EXISTS drawers_content_tsv_gin
    ON drawers USING gin (content_tsv);

-- Filter / namespace lookups
CREATE INDEX IF NOT EXISTS drawers_wing_room_idx ON drawers (wing, room);
CREATE INDEX IF NOT EXISTS drawers_source_idx    ON drawers (source);
CREATE INDEX IF NOT EXISTS drawers_filed_at_idx  ON drawers (filed_at DESC);

-- Dedup: ON CONFLICT (source_id) DO NOTHING in ingesters.
-- Partial index because legacy Chroma rows may have NULL source_id.
CREATE UNIQUE INDEX IF NOT EXISTS drawers_source_id_unique
    ON drawers (source_id) WHERE source_id IS NOT NULL;

-- JSONB metadata search (occasional)
CREATE INDEX IF NOT EXISTS drawers_metadata_gin
    ON drawers USING gin (metadata jsonb_path_ops);

-- Knowledge Graph tables removed in MP-ARCH-FUTURE-03 (2026-04-11).
-- See docs/adr/mempalace-kg-decision-20260411.md for revival path.

-- ── Seed wings/rooms used today ──────────────────────────────────────────
INSERT INTO wings (name, description) VALUES
    ('wing_pd',         'Personal Dashboard'),
    ('wing_vs',         'Vibe Studio'),
    ('wing_jf',         'JobFinder'),
    ('wing_sh',         'Shuleansky'),
    ('wing_personal',   'Personal / family / health'),
    ('wing_infra',      'Infrastructure (VPS, NAS, CF)')
ON CONFLICT (name) DO NOTHING;

INSERT INTO rooms (wing, name, description) VALUES
    ('wing_vs', 'room_decisions',  'ADRs, initiatives, design choices'),
    ('wing_vs', 'room_security',   'Security reviews, secrets policy'),
    ('wing_vs', 'room_agents',     'Agent prompts, behaviour rules'),
    ('wing_pd', 'room_decisions',  'PD architectural decisions'),
    ('wing_personal', 'room_family', 'Family facts and history')
ON CONFLICT (wing, name) DO NOTHING;

COMMIT;
