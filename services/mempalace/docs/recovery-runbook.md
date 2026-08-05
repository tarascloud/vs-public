# MemPalace Ingest Recovery Runbook (MP-ARCH-FUTURE-06)

Scenarios for re-running ingesters after failure, corruption, or schema
change. All six ingesters accept:

- `--dry-run` — print what would be ingested without POSTing
- `--limit N` — cap the number of records
- `--since YYYY-MM-DD` — only consider records with timestamp >= date
  (semantics are source-specific; see per-ingester notes below)
- `--rebuild` — **ignore the state file** and re-consider every record
  in the source. Dedup still happens at insert time via
  `ON CONFLICT (source_id) DO NOTHING`, so `--rebuild` is safe: it will
  not create duplicates, only embed + INSERT-ignore everything again.
- `--only-agent NAME` — *agent wikis ingester only*

Ingesters:

| Ingester                     | State file                                          | Dedup key (source_id)                     |
|------------------------------|-----------------------------------------------------|-------------------------------------------|
| `ingest_claude_sessions.py`  | `/opt/docker/mempalace/ingest-state/claude_sessions.json` | per-message hash                    |
| `ingest_pd_chat.py`          | `/opt/docker/mempalace/ingest-state/pd_chat.json`   | `pd_chat:<exchange_id>`                   |
| `ingest_shuleansky.py`       | `/opt/docker/mempalace/ingest-state/shuleansky.json`| `session_<id>[_chunk_N]`                  |
| `ingest_telegram.py`         | `/opt/docker/mempalace/ingest-state/telegram.json`  | `tg:<chat>:<msg_id>`                      |
| `ingest_vs_db.py`            | `/opt/docker/mempalace/ingest-state/vs_db.json`     | `vs:<type>:<id>`                          |
| `ingest_agent_wikis.py`      | `/opt/docker/mempalace/ingest-state/agent_wikis.json` | `agent-wiki:<agent>:<relpath>:<git_sha7>` |

## Scenarios

### 1. State file corrupted or deleted

**Symptom:** an ingester either crashes on a JSON decode error (handled
— it silently falls back to empty state) or re-ingests everything on the
next run, appearing to stall.

**Recovery:**

```bash
ssh vps
cd /opt/repos/vibe-studio/services/mempalace
# Run with --rebuild so we don't wait for the automatic fallback and we
# explicitly acknowledge that we're re-ingesting everything.
python3 ingest/ingest_<name>.py --rebuild
```

This walks the full source tree / DB. Every record is embedded again
(cost: ~0.05s each). Every insert is a no-op because `source_id` already
exists in `drawers`. A fresh state file is written on successful exit.

**Cost estimate:** wiki ingester ≈ 16 files × 0.05s ≈ 1s; claude sessions
≈ 30 min for a full replay; vs_db ≈ 2 min. Run during off-peak if in doubt.

### 2. Schema change / need to re-embed a recent window

E.g. we tweaked the chunker or changed embedding model and only care about
the last 7 days of data.

```bash
# Only reconsider records modified / created in the last 7 days
python3 ingest/ingest_claude_sessions.py --rebuild --since 2026-04-04
python3 ingest/ingest_pd_chat.py         --rebuild --since 2026-04-04
python3 ingest/ingest_agent_wikis.py     --rebuild --since 2026-04-04
```

`--since` applies against:

- **claude_sessions** — session start timestamp
- **pd_chat** — message creation time
- **shuleansky** — session date
- **telegram** — message date
- **vs_db** — task / feedback `createdAt`
- **agent_wikis** — date of the *last commit that modified the file*

If you also want the *drawers* purged before re-embed (e.g. after an
embedding model change), take that step separately — the ingesters are
deliberately append-only:

```sql
-- Example: drop all wiki drawers, let nightly re-seed
DELETE FROM drawers WHERE wing = 'wing_agents';
```

Then run `ingest_agent_wikis.py --rebuild`.

### 3. Ingester failed halfway during a nightly run

**Symptom:** `[FAIL]` in `/opt/docker/backups/mempalace-ingest.log` and a
Telegram alert from `nightly.sh`.

**Recovery:** nothing special — just re-run `nightly.sh` (or the single
failing ingester). State files are written only on successful records,
so the next run picks up where the previous one stopped:

```bash
ssh vps 'bash /opt/repos/vibe-studio/services/mempalace/ingest/nightly.sh'
```

If the failure was inside a single record and that record is now
"poisoning" the run (e.g. scrubber crash on one file), run with
`--limit` + a matching `--since` to skip past it, fix the root cause,
then rerun normally.

### 4. Agent wiki was renamed or deleted

Because wiki `source_id` is versioned (`...:<git_sha7>`) and drawers are
immutable, a renamed file becomes a *new* source_id under the new path
at the new sha. The old drawer survives under the old path.

If you want to hard-delete the orphan drawer:

```sql
DELETE FROM drawers
WHERE wing = 'wing_agents'
  AND source_id LIKE 'agent-wiki:%:<old_relpath>:%';
```

This is rarely worth doing; see ADR §GC of superseded versions.

### 5. `--rebuild` but one ingester is untrusted

Pass `--dry-run --rebuild` first to see the plan:

```bash
python3 ingest/ingest_agent_wikis.py --dry-run --rebuild
```

No POSTs, no DB writes, no state changes. Use to validate file
discovery and chunking before committing.

## Operational notes

- `--rebuild` must never be combined with destructive DB operations in a
  single command — if you want to reset a wing, do it in two explicit
  steps (DELETE, then `--rebuild`).
- All ingesters are single-process; running two copies concurrently is
  *not* tested. The nightly wrapper runs them sequentially on purpose.
- `nightly.sh` exits non-zero if any ingester fails. The Telegram alert
  in step 7 of `nightly.sh` lists which ones.
- `agent_wikis.json` state is keyed by `<agent>/<relpath>` → `{sha, ingested_at, chunks}`;
  unchanged files are a no-op even without `--rebuild`.
