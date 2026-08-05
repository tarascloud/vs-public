# Wiki: <agent-name>

Personal working memory for agent `<agent-name>`.
Based on Karpathy's LLM Wiki pattern — see [`../../../docs/agent-wiki-convention.md`](../../../docs/agent-wiki-convention.md).

## How I read my wiki

Before any task:
1. `Read index.md` — the map of all my pages
2. `Read log.md` (tail ~20) — what happened recently
3. Based on the index, pick 3-5 relevant pages → read them
4. If the task touches another domain, read the peer agent via `../../../docs/agents-roster.md`

## How I write my wiki

After finishing a task:
1. Append a short report to `log.md`
2. Update relevant entity/concept pages (if there are new learnings)
3. If I created a new page, update `index.md`
4. Commit alongside other changes (release-YYYY-MM-DD branch)

## Rules

- **log.md is append-only.** Never delete lines.
- **Secret scan before commit.** Never write plaintext secrets — use Infisical paths.
- **Cross-refs are mandatory** between pages in the same domain.
- **New page vs update** — see the convention.
- **Don't speculate.** Every insight must cite a source (git hash / URL / metric / MemPalace doc).

## Structure

- `index.md` — catalog of all pages (one-liner each)
- `log.md` — append-only journal of events
- `entities/` — real-world objects (services, modules, audiences, clients)
- `concepts/` — patterns, abstractions, learnings that compound
- `campaigns/` (or `decisions/`, `backtests/`, `incidents/`, `waves/`) — time-bound blocks
- `archive/` — deprecated pages (never delete)
