# Post-Mortem: init_palace.py silent bugs (MP-ADR-20260411-01)

- **Status:** Documented
- **Date:** 2026-04-11
- **Ticket:** MP-ADR-20260411-01
- **Related:** MP-FIX-20260411-08, MP-IMPROVE-20260411-09, MP-20260410-0005

## Summary

`init_palace.py` (ChromaDB era) had **three silent bugs** that together made wing/room sentinels completely invisible in the production collection for ~24 hours. Task `MP-20260410-0005` ("Init palace wings + rooms") was marked DONE while the seed mechanism was effectively broken.

Architect v2 review (2026-04-11) + parallel agent investigation uncovered them sequentially during MP-FIX-20260411-08 execution.

## The three bugs

### Bug 1 — Wrong ChromaDB path (orphan subdirectory)

```python
# Before (broken)
chroma_path = str(palace_root / "chroma")   # /data/palace/chroma/chroma.sqlite3

# Everywhere else in the codebase
PALACE_PATH = "/data/palace"                 # /data/palace/chroma.sqlite3
```

`init_palace.py` wrote sentinels into an **orphan ChromaDB at `palace/chroma/chroma.sqlite3`** that no other module (ingest_server, search, mcp_server) ever opened. 454 kB of data sitting in a file no one reads.

### Bug 2 — Missing embedding function on `col.add()`

```python
# init_palace.py created/fetched the collection without specifying ef=
col = client.create_collection("mempalace_drawers")  # no embedding_function
col.add(ids=[...], documents=[...])                   # silent default EF
```

The real collection was created by `ingest_server.py` with a custom `_OllamaEmbeddingFn` (768-dim Ollama `nomic-embed-text`). When `init_palace.py` re-opened it (would-be, if path had been right) without specifying the same EF, ChromaDB 0.6 **silently fell back** to the default ONNX model (384-dim), and `col.add()` either raised `InvalidDimensionException` or — worse — accepted the call into a phantom collection.

### Bug 3 — `get_collection` + `create_collection` race

```python
try:
    col = client.get_collection(name)
except Exception:
    col = client.create_collection(name)
```

If the collection already existed but was opened by a process that had not initialized the target EF first, the `get_collection` call returned a Collection object bound to a **different internal `_embedding_function`** than later callers expected. Subsequent `col.add()` calls were dispatched into a ghost that nobody ever queried.

## Impact

- **Production**: sentinels were never readable. Architect review v1 could not find any drawer with `type="wing_sentinel"` in the real collection — which contributed to the "wings/rooms declared but empty" finding that drove MP-FIX-20260411-05 shrink to 4/9.
- **Trust**: `MP-20260410-0005` was DONE-marked without ever being runtime-verified. This was the primary argument for MP-PROCESS-20260411-01 (machine-verifiable acceptance criteria + API enforcement).
- **Lost time**: FIX-08 agent hit Bug 1 first, deployed a fix, then discovered Bugs 2+3 when sentinels still didn't appear in the queries.

## Fixes

All three were resolved in commit `3456b145` (bundled with MP-IMPROVE-20260411-09 due to worktree race):

1. **Path fix**: `chroma_path = str(palace_root)` — match `ingest_server.py`.
2. **Embedding function**: added `_get_ollama_ef()` helper that reads `OLLAMA_EMBED_URL` / `OLLAMA_EMBED_MODEL` env and returns the same EF as ingest_server. Passed explicitly to `get_or_create_collection(embedding_function=ef)`.
3. **Idempotent open**: replaced get/create split with `get_or_create_collection()`, which Chroma guarantees will hand back a Collection with the ef you passed, not a ghost.

After pgvector migration (MP-ARCH-C-03..C-07) `init_palace.py` no longer talks to ChromaDB at all — schema and seed data are applied via `services/mempalace/pg/schema.sql`. Bugs 1-3 are effectively dead paths and were removed when MP-MONO-06 and MP-FIX-09 cleaned up the init flow.

## Why it stayed silent for 24h

No canary test. The entire verification of MP-20260410-0005 was "the script ran without raising an exception". None of:

- "Query the collection for `type='wing_sentinel'` — expect ≥ 4 rows"
- "Compare the collection path `init_palace` writes to vs the path `ingest_server` reads from"
- "Call the embedding function explicitly and assert dimension matches the collection"

…were executed. ChromaDB's permissive error handling absorbed the symptoms; `col.add()` does not error on EF mismatch in the default configuration, and a write into the wrong collection file is indistinguishable from a successful write until someone queries it.

## Prevention (process changes that have already landed)

1. **MP-PROCESS-20260411-01** — `acceptanceCriteria` + `verificationCommand` + `verificationStatus` columns added to `Task`. API rejects DONE without a PASS/NO_RUNTIME/NO_GIT status. A task like MP-20260410-0005 would now need `verificationCommand = "psql mempalace -c 'SELECT COUNT(*) FROM drawers WHERE metadata->>\"type\"=\"wing_sentinel\"' | grep -v '^0$'"` or equivalent.
2. **MP-INFRA-20260411-01** — Git worktree per parallel agent. FIX-08 + IMPROVE-09 worked on the same `init_palace.py` in the same tree; the worktree pattern guarantees each agent sees a clean base.
3. **MP-ARCH-C-01..08 (pgvector migration)** — the entire class of "wrong ChromaDB path" and "wrong EF" bugs is gone. pg is a single writer with explicit schema, and the generated `content_tsv` column + `Vector(768)` type make dimension/type mismatches compile-time errors in SQLAlchemy.
4. **MP-IMPROVE-20260411-15** — daily smoke test from Mac via launchd. A wake-up query against the palace runs every morning and alerts Telegram on failure. This would have caught Bugs 1-3 within hours instead of days.

## Lessons

- **"Done without runtime verification" ≈ "not done".** MP-20260410-0005 was a check-the-box task — the agent ran the script, it returned 0, task → DONE. Without a readback from the same collection that ingest_server uses, nothing proves the sentinels ever reached production.
- **Libraries with permissive error handling hide bugs.** ChromaDB's willingness to silently drop writes into phantom collections without surfacing the dimension/EF mismatch was the root enabler. The pg migration (C-03..C-07) removes this class of problem because pg raises on type mismatch immediately.
- **Post-merge review wins over pre-merge review for detecting silent bugs.** The v2 architect review — run 18 hours after MP-20260410-0005 merged — was the mechanism that surfaced this. Suggests a standing cron "architect revisit" per critical initiative is worth it.
- **Parallel agents need isolation.** Bundling the FIX-08 + IMPROVE-09 commits into one commit (`3456b145`) on the wrong branch was the recovery from a race that worktree-per-agent (MP-INFRA-01) now prevents.

## References

- Commits: `3456b145` (combined fix), `05462f91` (main merge), `e39afa5e` (MONO-01 path rename)
- Tasks: MP-FIX-20260411-08, MP-IMPROVE-20260411-09, MP-20260410-0005, MP-ARCH-C-01..C-08
- ADRs: `mempalace.md`, `mempalace-pgvector.md`, `mempalace-into-vs-monorepo.md`
- Eval results: `services/mempalace/eval/results-20260411-pgvector.md`
