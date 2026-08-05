# ADR: MemPalace ↔ Agent Wikis Integration

**Status:** Proposed
**Date:** 2026-04-11
**Authors:** architect (via MP-WIKI-RESEARCH-01)
**Related initiatives:**
- `mp_init_20260410` — MemPalace (pgvector, 1625 drawers, 4 wings, 14 rooms)
- `cmcbed6d666e2d322af26ca653` — Agent Wikis rollout (Karpathy pattern, 9 agents, DONE)
**Related ADRs:** `mempalace.md`, `mempalace-pgvector.md`, `mempalace-forward-looking-review-20260411.md`

---

## Context

Two distinct memory layers exist today:

1. **Agent wikis (L1.7)** — curated markdown under `agents/<name>/wiki/`, written by agents themselves. 9 agents × ~4 content pages each (`entities/entity_*.md`, `concepts/concept_*.md`). Total ~1500 lines, English, git-tracked. Structure from `docs/agent-wiki-convention.md` + `docs/agent-wiki-template/`.
2. **MemPalace (L2)** — pgvector store (1625 drawers) ingesting verbatim history: claude_sessions, pd_chat, shuleansky, telegram, vs_db, memory-md feedback. Hybrid retrieval (RRF + CrossEncoder rerank + diversify).

The wikis are small, stable, and already readable by their owning agent via filesystem. The open question is: **should the wikis also be searchable via MemPalace so that e.g. `tester` can retrieve `developer`'s `concept_bug_classes.md` without knowing the file path?**

### Why this matters

- **Cross-agent discovery.** Today an agent must read `agents-roster.md` then grep a peer's wiki. That is zero-shot-unfriendly — fine for humans, poor for LLM-driven parallel execution.
- **Query ergonomics.** `mempalace_search("dangerouslySetInnerHTML")` today returns session chatter; it should also surface the canonical rule from `architect/wiki/concepts/concept_patterns.md`.
- **Compound memory.** Wiki pages cite metrics, git hashes, MemPalace doc IDs. Making them retrievable closes the loop: retrieval → wiki → retrieval of cited evidence.

### Why NOT to do it

The wikis are 1500 lines total. Every agent already reads its own wiki via filesystem. Ingesting adds a nightly job, a new wing, and a source of drift (git sha vs drawer). This ADR argues value > cost, but the bar is low — we must not over-engineer.

---

## Decision

### Q1. Wiki file layout

Fixed by `agent-wiki-convention.md`:

```
agents/<name>/wiki/
├── README.md            (self-instruction, static, per-agent-identical)
├── index.md             (catalog, short)
├── log.md               (append-only journal)
├── _page-template.md    (empty template)
├── entities/entity_*.md (content — real objects)
├── concepts/concept_*.md (content — patterns)
└── campaigns/ | decisions/ | incidents/ | ... (time-bound, mostly empty today)
```

Today: 9 agents × (1 entity + 1 concept) = 18 content files, ~30-50 lines each.

### Q2. What to ingest

**Ingest:** `entities/*.md` + `concepts/*.md` + future `decisions/*.md` + `campaigns/*.md` etc. — any file directly under a wiki subdir whose name matches `(entity|concept|decision|campaign|incident|backtest|wave)_*.md`.

**Skip:**
- `README.md` — meta-instruction, identical across agents, no signal.
- `index.md` — catalog pointing at other pages; regenerated, not primary content.
- `_page-template.md` — empty template.
- `log.md` — append-only journal with high write rate and low retrieval value; defer to a follow-up if demand arises. Session drawers already cover "what happened" via `ingest_claude_sessions.py`.
- `.gitkeep`, `archive/**` — noise.

### Q3. Drawer metadata

Extend `metadata` JSONB (Drawer.meta_) with a fixed wiki envelope:

```json
{
  "type": "wiki",
  "agent": "architect",
  "wiki_section": "concept",
  "wiki_path": "concepts/concept_patterns.md",
  "git_sha": "abc1234",
  "title": "Architectural Patterns (VS)",
  "last_updated": "2026-04-11"
}
```

`agent`, `wiki_section`, and `wiki_path` must be validated by a Pydantic model in the ingester (ties to MP-ARCH-FUTURE-05 — typed drawer metadata).

### Q4. Update cadence

**Nightly only**, added to `ingest/nightly.sh` as the 6th ingester. Rationale:

- Wiki files change at most a few times per day during active wiki building, then stabilize.
- Latency does not matter: a wiki fact being 24h stale vs live is undetectable by agents.
- A git post-commit hook is more engineering (host/container coupling, hook distribution to Mac worktrees) than benefit. **Defer.** If real use reveals staleness pain, add it as MP-WIKI-IMPL-03.
- Nightly cost is negligible: ~18 files × 1 embed each ≈ 6 seconds.

### Q5. Wing / room mapping

**New wing: `wing_agents`, one room per agent: `room_<agent>`.**

```
wing_agents/room_architect
wing_agents/room_developer
wing_agents/room_devsecops
wing_agents/room_designer
wing_agents/room_tester
wing_agents/room_coo
wing_agents/room_trader
wing_agents/room_cat
wing_agents/room_smm     (once wiki exists)
wing_agents/room_voice   (once wiki exists)
```

Rejected alternatives:

- **`wing_workflow/room_agent_wikis`** — `wing_workflow` already holds sessions + commands + feedback; adding a room makes filtering hard and conflates verbatim logs with curated knowledge.
- **`wing_vs/room_agents`** — that room already exists (68 drawers) and is populated from `ingest_vs_db.py` keyword-routing of tasks that mention agents. Different semantic (task-about-agent vs agent-authored-knowledge). Keeping them separate avoids pollution.
- **One wing per agent** — combinatorial explosion for marginal benefit; 10 wings with 1-2 rooms each is worse UX than 1 wing / 10 rooms.

A per-agent room enables the query shape `mempalace_search(q, wing="wing_agents", room="room_developer")` — exactly the "cross-reference peer's knowledge" use case.

### Q6. source_id strategy

**Immutable, versioned:**

```
source_id = f"agent-wiki:{agent}:{relpath}:{git_sha7}"
```

Example: `agent-wiki:architect:concepts/concept_patterns.md:a1b2c3d`.

- `git_sha7` = short sha of the **last commit that modified this file** (`git log -n1 --format=%h -- <path>`), not HEAD. A no-op rebuild of nightly.sh does not create new drawers.
- When a file changes, the new sha → new `source_id` → new drawer inserted via `ON CONFLICT DO NOTHING` (existing ingester pattern, never UPDATE).
- Old drawers are left in place as historical snapshots. This is consistent with how `ingest_claude_sessions.py` works today.
- The scrubber already writes `scrubbed_at`; nothing to add.

Rejected: **mutable `agent-wiki:{agent}:{relpath}` + UPDATE content**. No other ingester does this; adding mutate semantics would fork the model and break dedup invariants.

**GC of superseded versions** is explicitly out of scope. Defer to MP-ARCH-FUTURE-02 / general drawer compaction if it ever matters. At 18 files × ~5 revisions/year = 90 extra drawers/year — noise.

### Q7. Search UX

**Reuse existing `mempalace_search` (and `/search` endpoint) — no new tool.**

- The search already accepts `wing` and `room` filters. `wing="wing_agents"` isolates wikis.
- Default (no filter) search will return wikis mixed with session drawers. That is desirable: when asking "how do I handle dangerouslySetInnerHTML", the canonical rule should surface alongside incident reports.
- The rerank + diversify pipeline already handles source mixing (post-reranker merge was fixed in a recent MP-* ticket).
- **One small UX change:** in `local_mcp_server.py` result formatting, when a result has `metadata.type == "wiki"`, prefix its label with `[wiki:{agent}]` so the caller agent sees provenance without parsing metadata. Scope: 5 lines of Python.

Rejected: **`mempalace_search_wikis` separate tool**. Doubles the tool surface that LLM must know about, and the filter already covers the "wikis only" case via `wing=wing_agents`.

### Q8. Knowledge Graph angle

**Leave the KG dead for this initiative.**

- `kg_entities` and `kg_triples` tables exist but have **0 rows** in prod as of 2026-04-11. No tool reads from them.
- Wiki pages would seed nice triples (`developer uses typescript`, `architect forbids dangerouslySetInnerHTML-without-sanitize`), but extracting those triples reliably needs an LLM pass → new dependency on Ollama prompts → new failure mode.
- The decision to activate KG belongs in **MP-ARCH-FUTURE-03** (KG decision). This ADR must not pre-empt it.
- **Hook point reserved:** the wiki ingester writes `metadata.type="wiki"` consistently, so a future KG extractor can filter `WHERE metadata->>'type' = 'wiki'` and process curated pages first (higher signal than raw chat).

### Q9. Overlap with existing ingesters

**No overlap. Standalone ingester: `ingest_agent_wikis.py`.**

- `ingest_claude_sessions.py` ingests `~/.claude/projects/*/*.jsonl` — Claude Code raw sessions. Wikis are git-tracked markdown, completely disjoint.
- `ingest_vs_db.py` + its keyword router populate `wing_vs/room_agents` from VS DB Tasks that mention agent keywords. That is task-derived, not authored-by-agent.
- Sharing a pipeline would require branching the source-detection logic. The cost of a new 200-line script is lower than the cost of branching and testing an existing one. MP-PROCESS-20260411-01 also prefers small focused ingesters.

### Q10. New Agent Onboarding Protocol (AGT-WIKI-10)

When a new agent is onboarded:

1. The onboarding checklist (`docs/new-agent-checklist.md`) already instructs creating `agents/<name>/wiki/` from `docs/agent-wiki-template/`.
2. **Add one line to that checklist:** "No manual mempalace ingest needed — the nightly `ingest_agent_wikis.py` discovers new agent dirs automatically." The ingester must `glob('agents/*/wiki/')`, not a hardcoded list.
3. First nightly run after the commit will create `wing_agents` room `room_<new_agent>` idempotently (`ON CONFLICT DO NOTHING` on wings/rooms too).
4. No VS DB task needed. The wiki is live in MemPalace within 24h of the first commit.

---

## Consequences

### Positive

- **Zero-friction peer knowledge retrieval.** Any agent can search `wing_agents` for any topic without knowing which peer authored the canonical rule.
- **Reuses the entire existing pipeline** (scrubber, embedder, rerank, diversify, MCP search). No new endpoint, no new index.
- **Automatic onboarding** — new agents get picked up without process changes.
- **Provenance preserved** via `git_sha` + `wiki_path` metadata → agents can quote exact source in their output.
- **KG-ready** — metadata envelope is forward-compatible with MP-ARCH-FUTURE-03.

### Negative / risks

- **Drawer bloat over time.** ~18 files × N revisions. Bounded in practice; addressed by eventual compaction (deferred).
- **Stale content risk** — if an agent rewrites a wiki page, old drawers remain and may outrank new ones. Mitigation: nightly only adds new versions, and the rerank scores recent drawers via `filed_at DESC` secondary sort. Monitor after first month.
- **Nightly failure adds one more way for `nightly.sh` to go red.** MP-FIX-07 already Telegram-alerts. One more line in the script.
- **Scrubber false positives** — wiki pages cite "Infisical paths" and "git hashes" as evidence (per convention), which look like credentials to naive regexes. **Must dry-run the scrubber over the full wiki corpus** during impl (acceptance criterion for MP-WIKI-IMPL-01).

### Non-risks (explicitly verified)

- **Cost.** 18 files × 768-dim embed ≈ 6s wall-clock; drawer size ~50 lines × 100 bytes = negligible.
- **Search relevance.** Rerank + diversify already handle mixed-source results per MP-SEARCH-* tickets.

---

## Migration plan

### First-time ingest

1. Merge `ingest_agent_wikis.py` (MP-WIKI-IMPL-01).
2. Run once manually with `--dry-run` on VPS → verify scrubber does not corrupt wiki content (especially cross-ref links and code blocks).
3. Run without `--dry-run` → expect ~18 drawers in `wing_agents`.
4. Verify: `SELECT COUNT(*), room FROM drawers WHERE wing='wing_agents' GROUP BY room;`
5. Sanity query: `mempalace_search("dangerouslySetInnerHTML", wing="wing_agents")` → should return `architect/concepts/concept_patterns.md`.

### Ongoing

- Added to `nightly.sh` (MP-WIKI-IMPL-02).
- State file: `/opt/docker/mempalace/ingest-state/agent_wikis.json` — stores `{relpath: {sha: ..., ingested_at: ...}}` for idempotency (skip re-embed when sha unchanged).
- First-run full embed, subsequent runs only embed changed files.

### Rollback

- Delete state file + `DELETE FROM drawers WHERE wing='wing_agents';`. Wing/room rows left in place (cheap).

---

## Relationship to MP-ARCH-FUTURE-*

- **MP-ARCH-FUTURE-03 (KG decision):** this ADR leaves KG dead but writes `metadata.type="wiki"` so a future KG extractor can filter curated sources. No blocking dependency.
- **MP-ARCH-FUTURE-05 (typed drawer metadata):** the wiki ingester is a good first consumer of a Pydantic metadata envelope. MP-WIKI-IMPL-04 is scoped as a Pydantic model for just the wiki envelope; if MP-ARCH-FUTURE-05 lands later, wikis migrate for free.
- **MP-ARCH-FUTURE-02 (drawer compaction / GC):** no blocker now; wiki drawers follow the same lifecycle as others. Will absorb wiki revisions whenever it lands.

---

## Open questions deferred

- [ ] Should `log.md` be ingested per-entry (append → one drawer per entry)? Signal unclear today; revisit in 1 month.
- [ ] Should cross-references between wiki pages be materialized as `kg_triples` (page-references-page) when the KG is activated? — belongs in MP-ARCH-FUTURE-03.
- [ ] Should the MCP `mempalace_search` result include a `wiki_path` link that an agent can `Read` directly? — minor UX, follow-up.
- [ ] Is it worth surfacing wiki content in the PD dashboard (monitoring UI at `/mempalace`)? — aesthetics, not required.

---

## Effort estimate

| Sub-task | Effort | Risk |
|----------|--------|------|
| MP-WIKI-IMPL-01 — `ingest_agent_wikis.py` | 3h | low (pattern copies `ingest_shuleansky.py`) |
| MP-WIKI-IMPL-02 — nightly.sh + verification | 0.5h | low |
| MP-WIKI-IMPL-03 — git post-commit hook (optional, DEFERRED) | 2h | medium |
| MP-WIKI-IMPL-04 — Pydantic wiki metadata envelope | 1h | low |
| MP-WIKI-IMPL-05 — MCP search result `[wiki:{agent}]` prefix | 0.5h | low |
| **Total core (01, 02, 04, 05)** | **5h** | **low** |

---

## Decision log

- **2026-04-11** — Proposed (architect). Awaits review by devsecops (scrubber impact) and developer (ingester impl).
