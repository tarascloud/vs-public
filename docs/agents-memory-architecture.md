# Agents Memory Architecture — How VS AI Agents Remember

## Overview

Vibe Studio uses a **three-system memory architecture** that gives AI agents persistent context across sessions, projects, and decisions. Unlike typical AI workflows where agents start from scratch each time, VS agents accumulate knowledge through three complementary systems:

1. **MemPalace** — shared semantic long-term memory (L2)
2. **Agent Wiki** — per-agent domain knowledge (Karpathy LLM Wiki pattern)
3. **AI Agent (Ай)** — meta-agent that optimizes how other agents work

## System 1: MemPalace (Shared Memory)

**Initiative:** `mp_init_20260410` — 99 tasks, all DONE

MemPalace is a centralized semantic memory layer built on PostgreSQL + pgvector. It stores verbatim records from all sources and makes them searchable by meaning.

### Architecture
- **Storage:** PostgreSQL with pgvector extension (768-dim embeddings via nomic-embed-text)
- **Structure:** Wings (domains) → Rooms (topics) → Drawers (individual memories)
- **Current scale:** 4 wings / 9 rooms / 1600+ drawers
- **Retrieval:** Hybrid search — dense vector (cosine similarity) + lexical (tsvector BM25) fused with Reciprocal Rank Fusion (k=60)

### Memory Layers
```
L0: CLAUDE.md        — Identity, commands, workflow (always loaded)
L1: .claude/rules/   — Deploy, security, infra rules (always loaded)
L1.5: MEMORY.md      — One-liner feedback items (always loaded)
L2: MemPalace        — Semantic search across 1600+ memories (on-demand)
L3: Cold archive     — Git history, NAS backups (manual access)
```

### Auto-Ingest Pipeline (nightly, 04:45 UTC)
5 ingesters run serially:
1. `ingest_claude_sessions.py` — Claude Code JSONL sessions
2. `ingest_pd_chat.py` — PD AI Chat history
3. `ingest_shuleansky.py` — Coaching transcripts + materials
4. `ingest_telegram.py` — Telegram bot conversations
5. `ingest_vs_db.py` — VS initiatives, tasks, feedback

### Security
- Secret scrubber (fail-closed, 4 pattern classes)
- MCP access via SSH forced-command (Mac) or docker exec (VPS)
- age-encrypted backups with weekly restore drills

### Key Milestones
- ChromaDB → PostgreSQL migration (pgvector)
- KG entities/triples in pg (replaced SQLite)
- Monorepo integration (services/mempalace/)
- 66.7% recall@5 baseline (post-pgvector)

## System 2: Agent Wiki (Per-Agent Knowledge)

**Initiative:** SMM Wiki (`cm1eed2466de368045b3b079be`) — 4/6 tasks DONE

Based on **Karpathy's LLM Wiki pattern**, each agent maintains a persistent wiki — structured markdown files that compile domain knowledge over time.

### Karpathy Three-Layer Architecture
```
Raw Sources (immutable)    → YouTube Analytics, metrics, past posts
The Wiki (LLM-maintained)  → Markdown files with index + activity log
The Schema (rules)         → CLAUDE.md + agent instructions
```

### SMM Wiki Structure (`agents/smm/wiki/`)
```
index.md              — Content-oriented catalog of all pages
log.md                — Append-only activity log
strategy/
  brand-voice.md      — Tone, personality, messaging rules
  platforms.md        — Per-platform goals, formats, frequency
  audience.md         — Target audience profiles
  decisions.md        — Strategic decisions log
content/
  calendar.md         — Weekly content calendar
  templates/          — YouTube, Twitter, LinkedIn, Instagram, TikTok
analytics/
  kpis.md             — KPIs per platform with baselines
  april-2026-review.md— Full YouTube analytics review
pilot/
  plan.md             — 2-week pilot plan with success criteria
  week-1.md, week-2.md— Daily content calendars
  checklist.md        — 8-step daily workflow
```

### Key Difference from RAG
- **RAG:** Re-derives answers from raw documents each query (no accumulation)
- **Wiki:** Compiles knowledge once, continuously refines. Each session makes the agent smarter.

### Integration with MemPalace
- Wiki contents are ingested into MemPalace via `ingest_agent_wikis.py` (nightly)
- Stored in `wing_agents` with `[wiki:smm]` labels
- Other agents can search SMM wiki context through MemPalace
- Wiki = L1.5 domain layer; MemPalace = L2 cross-domain search

### Pilot Results
- 2-week wiki-driven SMM pilot (Apr 12-26, 2026)
- 20+ wiki pages created, content calendar, analytics reviews
- Daily checklist workflow validated

## System 3: AI Agent (Meta-Optimization)

**Initiative:** `init-ai-agent-01` (Ай) — 5/5 tasks DONE

The AI/ML agent optimizes how other agents work — prompt injection defense, smart routing, memory management.

### Completed Capabilities
1. **Prompt injection scanner** (AI-01) — Scans context files for injection attempts
2. **Smart model routing** (AI-02) — Routes trivial tasks to gemma4 on VPS instead of Claude
3. **MEMORY.md capacity indicator** (AI-03) — Monitors L1.5 memory usage, auto-consolidates
4. **Database research** (AI-04) — Validated pg/redis over SQLite for VS services
5. **Agent definition** (AI-05) — Formal agent file + CLAUDE.md integration

## How The Three Systems Work Together

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Session                         │
│                                                          │
│  1. Load L0 (CLAUDE.md) + L1 (rules) + L1.5 (MEMORY.md)│
│  2. Load Agent Wiki (if exists) — domain knowledge       │
│  3. Query MemPalace for specific context (on-demand)     │
│  4. Work on tasks with full context                      │
│  5. Update Wiki with new knowledge                       │
│  6. Nightly: Wiki + sessions ingested into MemPalace     │
│                                                          │
│  AI Agent monitors: injection safety, model routing,     │
│  memory capacity, consolidation                          │
└─────────────────────────────────────────────────────────┘
```

### Data Flow
```
Claude Sessions ──┐
PD AI Chat ───────┤
Telegram ─────────┤──→ Nightly Ingest ──→ MemPalace (pgvector)
Shuleansky ───────┤                           ↑
VS Tasks ─────────┤                           │
Agent Wikis ──────┘                     Wiki Updates
                                              ↑
                                        Agent Work
                                              ↑
                                    L0 + L1 + L1.5 + Wiki
                                              ↑
                                    MemPalace Search (L2)
```

### Real Example: SMM Agent Workflow
1. SMM agent starts session → loads `agents/smm.md` instructions
2. Reads `agents/smm/wiki/` — brand voice, content calendar, analytics
3. Queries MemPalace: "what content performed best last month?"
4. Creates new YouTube video description using wiki templates
5. Updates `wiki/log.md` with activity, `wiki/analytics/` with results
6. Nightly: new wiki pages ingested into MemPalace for cross-agent search
7. AI Agent ensures MEMORY.md doesn't overflow, routes simple tasks to gemma4

### Why This Matters
- **No cold starts** — Agents remember decisions from weeks ago
- **Cross-pollination** — SMM agent can find architecture decisions, Developer can find content strategy context
- **Compounding knowledge** — Each session adds to the wiki and MemPalace, making future sessions more effective
- **Security** — All data passes through secret scrubber, encrypted backups, audit logs
- **Self-optimizing** — AI Agent monitors and improves the system itself
