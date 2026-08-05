# MemPalace Wings Layout

Palace root: `/opt/docker/mempalace/palace/` (host) = `/data/palace` (container)

Визначено в ADR: `docs/adr/mempalace.md §6.2`
Ініціалізовано: `services/mempalace/init_palace.py`

> **Shrink 2026-04-11 (MP-FIX-20260411-05):** declared wings/rooms приведено
> у відповідність до реально працюючих ingesters. Попередня декларація
> (7 wings, 39 rooms) створювала sentinel drawers для порожніх rooms, які
> ніколи не наповнювались і ламали audit/introspection.
>
> **Live state 2026-07-22 (REV22-053):** 5 wings / 27 rooms / 1625+ drawers у pg.
> ChromaDB + SQLite KG **decommissioned 2026-04-11** (legacy archive).
> Зберігання: PostgreSQL + pgvector (база `mempalace` у shared pg контейнері).
>
> Додавай нові wings/rooms лише разом з ingester-ом.

---

## Структура

```
PostgreSQL (pg:5432/mempalace):
├── wings          # оголошені wings
├── rooms          # оголошені rooms
└── drawers        # векторизований контент (VECTOR(768) + tsvector)

/data/palace/ (host /opt/docker/mempalace/palace/):
├── ingest-state/              # JSON state files per ingester
└── legacy-sqlite-archive-20260411/   # ChromaDB + KG archive (read-only)
```

> **ChromaDB ВИДАЛЕНО 2026-04-11.** Не посилатись на `chroma.sqlite3` або
> `knowledge_graph.sqlite3` як активні. Всі операції — через PostgreSQL pgvector.

Halls — metadata поля на drawer-документах (не директорії):
`hall_facts`, `hall_events`, `hall_discoveries`, `hall_preferences`, `hall_advice`, `hall_decisions`

---

## Active Wings та Rooms

### wing_pd
**PD — Personal Dashboard (AI chat only поки що)**

| Room | Ingester | Що зберігати |
|------|----------|-------------|
| `room_ai_chat` | `ingest_pd_chat.py` | PD AI chat діалоги (Gemini/Groq) з `pd_prod.chat_history` |

---

### wing_vs
**Vibe Studio — задачі, ініціативи, ADR рішення**

| Room | Ingester | Що зберігати |
|------|----------|-------------|
| `room_decisions` | `ingest_vs_db.py` | Архітектурні рішення: чому X, trade-offs, ADRs |
| `room_tasks` | `ingest_vs_db.py` | Task/Initiative описи, post-mortems, статус-зміни |

---

### wing_shuleansky
**Подкаст/курс Shuleansky — транскрипти, сценарії, гості, теми**

| Room | Ingester | Що зберігати |
|------|----------|-------------|
| `room_transcripts` | `ingest_shuleansky.py` | Повні транскрипти епізодів (faster-whisper large-v3) |
| `room_scripts` | `ingest_shuleansky.py` | Сценарії, нотатки до епізодів, ідеї |
| `room_guests` | `ingest_shuleansky.py` | Інформація про гостей, контекст розмов |
| `room_topics` | `ingest_shuleansky.py` | Теми, що обговорювались: бізнес, технології, особисте |

---

### wing_workflow
**Workflow VS — Claude Code сесії, голосові команди**

| Room | Ingester | Що зберігати |
|------|----------|-------------|
| `room_commands` | `ingest_telegram.py` / `ingest_claude_sessions.py` | Голосові команди (байбай, роби, шоти, шотам) — результати, проблеми |
| `room_sessions` | `ingest_claude_sessions.py` | Claude Code session logs (Mac + VPS) — повний діалог |

---

### wing_agents
**Agent wikis — куратовані знання агентів VS**

| Room | Ingester | Що зберігати |
|------|----------|-------------|
| `room_<agent-slug>` | `ingest_agent_wikis.py` | Wiki сторінки кожного агента (concepts/, decisions/, log.md) |

Rooms генеруються автоматично per-agent slug (`room_developer`, `room_tester`, тощо).

---

## TODO — wings що чекають на ingesters

Ці wings/rooms були в попередній декларації але не мають наповнення.
**Не додавати в `init_palace.py` без одночасного написання ingester-а.**

- `wing_jobfinder` — vacancies, applications, profile, searches, qa_bank, scoring, analytics
- `wing_trade` — strategies, backtests, live, research
- `wing_owner` — preferences, goals, people, locations, reflections
- `wing_pd` missing rooms: finance, investments, trading, health, gym, reports, ml
- `wing_vs` missing rooms: agents, infra, security, mempalace
- `wing_workflow` missing rooms: feedback, rules, deployments

---

## Як додати новий wing (правильний порядок)

1. **Спочатку** напиши ingester (`services/mempalace/ingest/ingest_<name>.py`)
   який читає джерело і POST-ить на `http://127.0.0.1:8031/ingest/convo`
   з `wing=<wing_name>` і `room=<room_name>`.
2. Протестуй локально: `python3 ingest/ingest_<name>.py --dry-run`.
3. Додай wing у `WINGS` dict у `init_palace.py`:

```python
"wing_newproject": {
    "description": "Опис нового wing",
    "rooms": [
        {"name": "room_one", "description": "Що зберігати"},
    ],
},
```

4. Запусти init (ідемпотентно — існуючі не чіпає):

```bash
bash /opt/repos/vibe-studio/services/mempalace/init_palace.sh
```

5. Додай до `nightly.sh` для щоденного incremental ingest.
6. Онови CLAUDE.md §MemPalace таблицю і цей файл.

## Як додати нову room до існуючого wing

Аналогічно — спочатку переконайся, що наявний ingester пише в цю room,
потім додай room у `init_palace.py` і перезапусти init.

## Security

- Ніколи не писати raw secrets у drawers — лише scrubbed content.
- Secret scrubbing виконується автоматично через `ingest_server.py` при HTTP ingestion.
- При прямому записі (MCP `mempalace_add`) — агент відповідає за scrubbing.
- Детальніше: ADR §9, `services/mempalace/scrubber/`.

## Пов'язані файли

- `services/mempalace/init_palace.py` — скрипт ініціалізації
- `services/mempalace/init_palace.sh` — bash wrapper
- `services/mempalace/ingest_server.py` — HTTP ingestion sidecar
- `services/mempalace/ingest/*.py` — ingesters (джерело правди про активні rooms)
- `docs/adr/mempalace.md` — повний ADR
- `/opt/docker/mempalace/palace/knowledge_graph.sqlite3` — knowledge graph (на VPS, див. `knowledge-graph.md`)
- `services/mempalace/docs/knowledge-graph.md` — KG storage canonical reference (kg.json видалено в MP-IMPROVE-20260411-12)
