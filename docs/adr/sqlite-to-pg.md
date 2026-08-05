# ADR: SQLite / Embedded DB → PostgreSQL/Redis Migration Assessment

## Status: Proposed
## Date: 2026-04-13
## Author: Architect Agent (AI-04)

## Context

VS infrastructure runs a shared PostgreSQL (`pg` container) with PgBouncer and a shared Redis (`redis` container). Several services still use embedded databases (SQLite, ChromaDB/SQLite) for local storage. This audit evaluates whether migrating those embedded stores to the shared pg/redis would improve backup unification, monitoring, and operational simplicity — or whether the current embedded approach is the better fit.

## Audit Scope

Scanned all services under `services/` and adjacent repos for SQLite, embedded DB, and file-based storage usage.

## Audit Results

| # | Service | Current DB | Data Stored | Size | R/W Pattern | Concurrent? | Recommendation | Effort |
|---|---------|-----------|-------------|------|-------------|-------------|---------------|--------|
| 1 | **Status** | SQLite (modernc.org/sqlite) `/data/history.db` | Uptime checks, page metrics, heal events | **108 MB** (90d retention) | Write every 60s per service (~20 services), reads on dashboard load | Single writer (MaxOpenConns=1), WAL mode | **Migrate checks/metrics to pg** | Medium (8-12h) |
| 2 | **Status** (error logs) | PostgreSQL (pgx) `error_logs` table in `status` DB | Error/warn log entries from docker containers | **8 MB** | Batch write every 60s, read on errors dashboard | Already pg | **Already migrated** — no action | N/A |
| 3 | **MemPalace** (drawers) | PostgreSQL (pgvector) `mempalace` DB | Embeddings, wing/room/drawer metadata | **27 MB** (1940 drawers) | Batch ingest nightly, hybrid search on query | Already pg | **Already migrated** (MP-ARCH-C-01..C-09) | N/A |
| 4 | **MemPalace** (legacy Chroma) | ChromaDB → SQLite `/data/palace/chroma.sqlite3` | Legacy sentinel data post-migration | **164 KB** (active) + **40 MB** (archived) | Read-only by upstream `mempalace` package KG | Single process | **Keep as-is** (legacy archive, read-only) | N/A |
| 5 | **MemPalace** (knowledge_graph) | SQLite `knowledge_graph.sqlite3` | Upstream mempalace KG entities/triples | **36 KB** | Read-only by MCP server | Single process | **Keep as-is** (upstream package dependency) | N/A |
| 6 | **Freqtrade** | SQLite `tradesv3.dryrun.sqlite` | Trades, orders, pairs, performance | **80 KB** (dry-run) | Freqtrade internal — writes on every trade cycle | Single process (Freqtrade owns it) | **Keep SQLite** | N/A |
| 7 | **Claude Channels** (Telegram) | SQLite `messages.db` | Telegram bot message history | **176 KB** | Append on each message, read by `ingest_telegram.py` | Single writer (Claude process) | **Keep SQLite** | N/A |

## Decision per Service

### 1. Status Service — Uptime Checks, Page Metrics, Heal Events (MIGRATE)

**Current state:** 108 MB SQLite file at `/data/history.db` with 3 tables (`checks`, `page_metrics`, `heal_events`). Grows ~1.2 MB/day. Cleanup at 2:00 AM retains 90 days for checks/heals, 7 days for page_metrics. The service already has a `PGStore` (pgstore.go) connected to the `status` PostgreSQL database for error logs.

**Problem with SQLite here:**
- **No backup pipeline.** The SQLite file lives on a Docker volume (`/opt/docker/status/data/`). It is NOT included in the nightly `pg_dump` backup that covers all other databases. If the volume is lost, 90 days of uptime history is gone.
- **No cross-service querying.** Cannot JOIN uptime data with error_logs (already in pg) or with VS tasks/initiatives without ETL.
- **Binary size.** `modernc.org/sqlite` adds ~15 MB to the Go binary (pure-Go SQLite reimplementation). Removing it would shrink the Docker image.
- **Single-writer bottleneck.** `MaxOpenConns=1` is set explicitly because SQLite cannot handle concurrent writes. This serializes all inserts.

**Why migrate to pg:**
- **Unified backup.** All status data enters the same `pg_dump` + age encryption + NAS offsite pipeline.
- **Already half-migrated.** `pgstore.go` already exists with pgx pool, schema init, and batch insert patterns. The `checks`/`page_metrics`/`heal_events` tables are structurally identical to what pg can handle.
- **Monitoring.** pg_stat_user_tables, slow query log, connection metrics — all standard tooling applies.
- **Concurrent reads.** Dashboard can query without blocking collector writes.

**Migration plan:**
1. Create tables `status_checks`, `status_page_metrics`, `status_heal_events` in the existing `status` database (already exists for `error_logs`).
2. Add equivalent methods to `PGStore` (modeled on existing `InsertErrors`/`GetErrorsByHour`).
3. Dual-write phase: write to both SQLite and pg for 7 days, compare counts.
4. Switch reads to pg, remove SQLite write path.
5. Remove `modernc.org/sqlite` dependency from `go.mod`.
6. Remove `/data/history.db` volume mount.

**Risk:** LOW. The existing `PGStore` proves pg connectivity works. Schema is simple (no FKs, no complex types). 90 days of data fits in <5 MB in pg (with proper TIMESTAMPTZ instead of Unix integers). Rollback: re-add SQLite path.

**Effort:** 8-12 hours (developer agent, single ticket).

**Estimated impact:**
- Backup coverage: 108 MB of critical uptime data enters automated backup pipeline
- Binary size: -15 MB (remove modernc.org/sqlite)
- Query capability: cross-join uptime + error data for incident correlation

### 2. MemPalace — Legacy ChromaDB SQLite (KEEP)

**Current state:** Migration to pgvector completed in MP-ARCH-C-01..C-09. ChromaDB's `chroma.sqlite3` (164 KB active, 40 MB archived) remains because:
- The upstream `mempalace` Python package (v3.1.0) hardcodes `chromadb.PersistentClient`. The `knowledge_graph.sqlite3` (36 KB) is used by the upstream package's KG module.
- The local fork (`local_mcp_server.py`) reads from pg, but the upstream package's internal KG operations still touch the SQLite file.

**Decision:** Keep as-is. These are read-only remnants of the upstream package. Removing them would require forking the upstream package entirely — disproportionate effort for 200 KB of data.

### 3. Freqtrade — tradesv3.dryrun.sqlite (KEEP)

**Current state:** 80 KB dry-run trade database. Freqtrade is a third-party framework that owns its SQLite schema and migration system. It supports PostgreSQL as a backend, but:
- Current usage is dry-run only (no real money at risk).
- Data volume is negligible.
- Freqtrade's internal ORM manages the schema — switching DB backend requires config change + potential compatibility issues.

**Decision:** Keep SQLite. Re-evaluate when switching to live trading — at that point, pg backend is recommended for backup coverage and the `--db-url postgresql://` flag is straightforward.

### 4. Claude Channels — messages.db (KEEP)

**Current state:** 176 KB SQLite file at `/home/owner/.claude/channels/telegram/messages.db`. Created and managed by the Claude Code Telegram plugin. Read by `ingest_telegram.py` for MemPalace ingestion.

**Decision:** Keep SQLite. This is an external tool's (Claude Code plugin) internal database. We have no control over its schema. The ingester reads it correctly as a source. Data is already duplicated into MemPalace pg via nightly ingest.

## Consequences

### If Status migrates to pg:
- **Positive:** Unified backup pipeline covers ALL persistent data. Cross-service incident correlation queries become possible (uptime dips correlated with error spikes). Docker image shrinks by ~15 MB.
- **Negative:** Additional 3-5 connections from status to pg (through PgBouncer). ~1 MB/day additional pg WAL traffic. Requires 8-12h development effort.
- **Neutral:** No downtime required — dual-write allows zero-downtime cutover.

### If everything stays as-is:
- Status uptime history (108 MB, 90 days) remains outside the backup pipeline. A Docker volume failure loses all historical uptime data. This is the **primary risk** this ADR identifies.

## Summary

Only **one migration is recommended**: Status service's uptime/metrics/heal data from SQLite to the existing `status` PostgreSQL database. This is a natural extension of the already-completed error_logs migration to pg. All other SQLite usage is either already migrated (MemPalace), owned by third-party tools (Freqtrade, Claude Code), or negligible legacy artifacts.

| Priority | Action | Service | Effort | Risk | Benefit |
|----------|--------|---------|--------|------|---------|
| **HIGH** | Migrate to pg | Status (checks, page_metrics, heal_events) | 8-12h | LOW | Backup coverage, -15MB binary, cross-query |
| NONE | Already done | MemPalace drawers → pgvector | — | — | Completed MP-ARCH-C-01..C-09 |
| LOW | Keep monitoring | Freqtrade | — | — | Re-evaluate at live trading switch |
| NONE | Keep as-is | Claude Channels messages.db | — | — | External tool, data replicated via ingest |
| NONE | Keep as-is | MemPalace legacy ChromaDB/KG SQLite | — | — | Upstream package dependency |
