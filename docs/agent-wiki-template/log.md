# Log — <agent-name>

Append-only chronological journal of events. NEVER delete lines.
Corrections = a new entry with type `correct` and explanation.

**Types:** `ingest` | `publish` | `deploy` | `commit` | `metric` | `decide` | `lint` | `new-peer` | `archive` | `correct`

**Format:**
```
## [YYYY-MM-DD HH:MM] <type> | <short title>

<2-3 lines of detail>

**Refs:** [page1](entities/...), [page2](concepts/...)
```

---

## [2026-04-11] ingest | Wiki seeded

Initial structure created from the template as part of Karpathy's wiki rollout. See VS initiative Agent Wikis rollout (`cmcbed6d666e2d322af26ca653`) and the convention in `docs/agent-wiki-convention.md`.

**Refs:** [README.md](README.md), [index.md](index.md)
