# Agent Wiki Convention

Karpathy's LLM Wiki pattern adapted for VS agents.
Reference gist: `karpathy/442a6bf555914893e9891c11519de94f`.

## Purpose

Each agent maintains a persistent markdown wiki as **hot curated working memory** — distinct from MemPalace (cold verbatim recall via RAG). The wiki compounds knowledge over time: new pages cross-reference old ones, patterns accumulate, and the LLM handles the bookkeeping — not the human.

## Memory layer hierarchy

| Layer | Location | Content | Writer |
|-------|----------|---------|--------|
| L0 | `CLAUDE.md` | Identity, commands, workflow | Owner |
| L1 | `.claude/rules/*.md` | Deploy / security / infra rules | Owner + agents |
| L1.5 | `memory/MEMORY.md` + `memory/*.md` | Feedback one-liners | Claude Code auto |
| **L1.7** | **`agents/<name>/wiki/`** | **Per-agent curated knowledge** | **Agent itself** |
| L2 | MemPalace pgvector (PostgreSQL) | Verbatim history, sessions, transcripts | Nightly ingest |
| L3 | Git history, NAS | Full archive | — |

The wiki does NOT replace MemPalace — it complements it: a hot editable layer between rules and the cold store.

## Wiki structure

```
agents/<name>/wiki/
├── README.md            # how the agent reads/writes its wiki (self-instruction)
├── index.md             # catalog of all pages with one-liner summaries
├── log.md               # append-only journal: ingest | publish | metric | decide | lint
├── entities/            # real-world objects (services, modules, audiences)
│   └── entity_*.md
├── concepts/            # patterns, abstractions, learnings that compound
│   └── concept_*.md
├── campaigns/           # time-bound work blocks (sprints, campaigns, releases)
│   └── campaign_*.md
└── archive/             # deprecated pages (never delete — historical record)
```

**Alternative folder names instead of `campaigns/`:** `decisions/` (architect, coo), `backtests/` (trader), `incidents/` (devsecops, cat), `waves/` (tester). Each agent picks what fits its domain.

## Page format

Every entity/concept page has fixed sections:

```markdown
# <Page Title>

## Summary
1-2 sentences — what this is, why the page exists.

## Known-good
What works. Every item must cite evidence (git hash / URL / metric / MemPalace doc ID).

## Known-bad
What does not work. With root cause if known.

## Open questions
TODO section — what still needs to be figured out from real data.

## Cross-refs
- [Other page](../entities/entity_foo.md) — why related
- [Another](../concepts/concept_bar.md)

---
**Last updated:** YYYY-MM-DD by <agent-name>
```

## log.md format

**Append-only.** Never delete lines. To correct a past entry, add a new `correct` entry with explanation.

```markdown
## [YYYY-MM-DD HH:MM] <type> | <short title>

<2-3 lines of detail>

**Refs:** [page1](entities/...), [page2](concepts/...)
```

**Types:**
- `ingest` — read a new source (article, repo, transcript, decision)
- `publish` / `deploy` / `commit` — took action in the outside world
- `metric` — received a metric (performance, engagement, error rate)
- `decide` — made a decision (with reasoning)
- `lint` — periodic health-check pass
- `new-peer` — a new agent joined the team (see `new-agent-checklist.md`)
- `archive` — a page was moved to archive/ (with reason)
- `correct` — correction to a previous entry (with reason)

## Agent behavior rules

### Before any work
1. `Read agents/<name>/wiki/index.md` — get the map of your memory
2. `Read log.md` (last ~20 lines) — what happened recently
3. Based on the index, pick 3–5 relevant pages → read them
4. If the task touches another domain, read the peer agent's relevant pages (via `agents-roster.md`)

### During work
- Capture insights in scratch (not in the wiki) — update the wiki after completing the task
- Check consistency with known-good / known-bad in relevant concept pages
- Do not rewrite history: the wiki is an artifact, not a draft

### After work

**MANDATORY task-completion checklist** (DEV-20260507-0061 — 174 DONE tasks → 0
log entries for 7/11 agents revealed this rule was widely ignored):

- [ ] **Append to `log.md`** before marking task DONE — short entry: `## [YYYY-MM-DD HH:MM] <type> | <title>` + 2-3 detail lines + Refs (commit hash, ticketId, page path).
- [ ] Update relevant entity/concept pages with new learnings (if any).
- [ ] If a new page was created, update `index.md`.
- [ ] Commit to vs-private alongside other changes (release-YYYY-MM-DD branch).

**Verification:** every release branch that closes ≥1 task MUST contain at
least one diff hunk in `agents/<your-name>/wiki/log.md`.
Self-check via:

```bash
git diff origin/main..HEAD -- agents/<your-name>/wiki/log.md | grep -q '^+' \
  && echo "log.md updated" \
  || echo "MISSING: append a log.md entry before marking DONE"
```

If you completed a task without touching code (e.g. analysis-only review), the
log.md entry is still mandatory — that *is* the deliverable.

### Security rules
- **NEVER write plaintext secrets** into the wiki. Reference Infisical paths only.
- **Redact sensitive data:** portfolio $ amounts → %, user emails → domain, IPs → subnet
- **Secret scan before commit:** `grep -rE "sk_live|api_key|AKIA|password.*=|-----BEGIN" agents/*/wiki/`

## New page vs update an existing one

**Create a new page** when:
- A new real-world entity appears (new service, new client, new asset)
- A new pattern emerges that will have ≥3 cross-refs in the future
- A campaign/sprint with clear time bounds

**Update existing page** when:
- A new known-good / known-bad observation
- A metric for an existing concept
- A contradiction with the previous version (add to Open questions + log.md `decide` entry)

## When to archive

- A service is deprecated → `archive/entity_<name>_deprecated_YYYY-MM-DD.md`
- A concept is no longer used (3+ months without updates)
- A campaign has ended and refs are sparse

**Never delete** — archive preserves the historical record. An `archive` log entry is mandatory.

## When a new peer agent joins

The formal protocol for adding a new agent is in [`new-agent-checklist.md`](./new-agent-checklist.md).

Short version for existing agents:
1. Within 48h of the announcement, read `agents/<new-agent>/wiki/README.md`
2. Append to your `log.md`: `## [YYYY-MM-DD] new-peer | <name> joined`
3. If there's functional overlap, create or update `concepts/concept_collaboration.md` with an explicit boundary of responsibility
4. If no overlap, a log.md acknowledgment is sufficient

## When an agent is deprecated

1. Status `DEPRECATED` in `agents-roster.md` (do NOT delete the row)
2. Move the whole wiki to `agents/archive/<name>/`
3. Append `## [date] new-peer | <name> deprecated` to every peer's log.md
4. ADR in `docs/adr/` with the reason

## Coordination with MemPalace

- The wiki is read by the agent at the start of work (Read tool, cheap)
- MemPalace search is used when the wiki doesn't have the answer and verbatim recall is needed (expensive, cold)
- Nightly ingest indexes wiki commits into MemPalace via git ingest (L2 backup)
- Contradictions: wiki is the source of truth (curated), MemPalace is historical evidence

## Lint pass

Once a week (or more frequently) — a health-check. Performed by the `memory-lint` subagent (created after the pilot eval, see `SMM-WIKI-20260411-06`). What it checks:

1. Stale refs — files/functions mentioned in the wiki that no longer exist
2. Contradictions — two pages say opposite things about the same concept
3. Orphans — pages without cross-refs from the index or other pages
4. Missing links — a term is mentioned but not linked to its entity page
5. Data gaps — TODO sections older than 14 days
6. Log integrity — append-only check via `git blame`

Findings are filed as REVIEW tasks in VS against the responsible agent (human-in-loop, no auto-fix).

## Reference

- Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- VS initiative: Agent Wikis rollout (`cmcbed6d666e2d322af26ca653`)
- Template: `docs/agent-wiki-template/`
- Roster: `docs/agents-roster.md`
- Onboarding: `docs/new-agent-checklist.md`
