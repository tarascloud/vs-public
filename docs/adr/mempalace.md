# ADR: MemPalace — Unified Long-Term Memory for VS (Mac + VPS)

- **ID:** adr/mempalace
- **Status:** Implemented
- **Date:** 2026-04-10
- **Initiative:** `mp_init_20260410` — MemPalace: Unified Long-Term Memory (Mac + VPS)
- **Owner task:** `mp_t01` (architect)
- **Blocks:** Wave 2 tasks (`mp_t02`..`mp_t14`)
- **Author:** architect (VS)
- **Reference:** https://github.com/milla-jovovich/mempalace (v3.x, raw mode 96.6% R@5 LongMemEval)

---

## 1. Context

### 1.1 Why now

VS is now a multi-surface AI workspace:

- **Mac** — основна станція розробки Owner, Claude Code з CWD `~/vibe-studio/`.
- **VPS** — production + другий інстанс Claude Code (tmux `claude`) з CWD `/opt/repos/vibe-studio/`, керується Telegram-ботом `@yourbot`.
- **PD** — AI Chat (Gemini 2.5 Flash / Groq / OpenAI) з довгими розмовами про фінанси, здоров'я, трейдинг, UA/ES звітність.
- **JobFinder** — AI scoring вакансій, Q&A bank, screening history.
- **Shuleansky** — транскрипти подкасту (faster-whisper large-v3), довгі розмови зі сценаріями.
- **Telegram боти** — голосові команди "байбай / роби / шоти / шотам", decision history.
- **Vibe Studio** — ідеї, задачі, dependencies, статуси, feedback.

Кожна з цих поверхонь щодня народжує **тисячі токенів корисного контексту** — рішення, trade-offs, feedback, болі, preferences. Більшість з них зникає разом з сесією. Те, що лишається, живе в шматках:

- `CLAUDE.md` і `.claude/rules/*.md` — "коротка" декларативна пам'ять, читається при старті кожної сесії.
- `~/.claude/projects/<cwd>/memory/*.md` — Claude Code auto-memory, генерується моделлю з feedback.
- `docs/*.md` — human-written архітектура і огляди.
- `pd-private/ml-training/` — експортовані з PG діалоги для fine-tuning.
- Task descriptions в PG `vs.Task`, `vs.Initiative`, `vs.Feedback`.
- PD AI chat history в `pd_prod.chat_messages` (Prisma).

Це створює три проблеми:

1. **Фрагментація** — факт "бюджет Shuleansky = 2k€/місяць" може жити в PD чаті, в транскрипті подкасту, в задачі VS, і в жодному з цих місць не буде видимим, коли агент працює в іншому контексті.
2. **Дублювання Mac↔VPS** — `CLAUDE.md`, `.claude/rules/*.md`, `memory/*.md` синхронізуються через scp у двох напрямках у "байбай" процедурі. MEMORY.md треба мерджити вручну, і агенти регулярно помиляються.
3. **Обмеження розміру** — `CLAUDE.md` і rules вже близько ~500 рядків контексту, які **завантажуються в кожну сесію**. Довгострокова пам'ять сюди не масштабується: 19.5M токенів на рік (оцінка MemPalace) у жодному context window не поміщається.

### 1.2 Мета

Збудувати **єдину, пошукову, довгострокову пам'ять** для всіх поверхонь VS, яка:

- Зберігає verbatim (raw) дані — рішення, діалоги, транскрипти, feedback — без втрат.
- Дає агентам (Mac, VPS, PD, Telegram, JF) **семантичний пошук через MCP**, замість завантаження всього в контекст.
- Живе в **одному місці** — без дублювання та проблем ручного merge.
- Не ламає поточний CLAUDE.md / rules / feedback flow — розширює, а не замінює.
- Відповідає VS security model: single-tenant (тільки Owner), Infisical для secrets, trust boundary на рівні SSH + Tailscale.

### 1.3 Reference: MemPalace (milla-jovovich)

Коротко про референс, щоб рішення було обґрунтованим:

- **Архітектура**: Wings (проекти/люди) → Rooms (теми) → Halls (типи: facts/events/discoveries/preferences/advice) → Closets (summary) → Drawers (verbatim files). Halls з'єднують rooms у межах wing, tunnels з'єднують rooms між wings.
- **Сховище**: ChromaDB з локальними embeddings, raw verbatim mode (не summarization). Бенчмарк LongMemEval R@5 = 96.6% на 500 питань, відтворено на M2 Ultra за <5 хвилин.
- **Mining modes**: `projects` (код/docs), `convos` (експорти чатів), `general` (auto-classify: decisions, preferences, milestones, problems, emotional).
- **MCP server**: `python -m mempalace.mcp_server` — 19 інструментів, основні: `mempalace_search`, `mempalace_wake_up`, `mempalace_add`, knowledge graph ops.
- **Wake-up** (measured 2026-06-01, AI-20260601-0007): `mempalace_wake_up` як окремий tool не існує — wake-up entry point = `mempalace_status`. Реальний payload ≈ **718 токенів cl100k_base / 719 o200k_base** (bytes_total=2334), а не ~170 як стверджувалося раніше. Breakdown: AAAK_SPEC=334, PALACE_PROTOCOL=179, counts (wings+rooms+totals)=169. Попередня цифра відображала лише counts portion. Slim-down kandidates: винести AAAK_SPEC + PALACE_PROTOCOL з status response — це зекономить ~500 tok per session. Measurement script: `services/mempalace/scripts/measure_wake_up_tokens.py`. L0+L1 identity (CLAUDE.md + rules) self-hosted in the file system layer, не в MemPalace.
- **AAAK**: експериментальний lossy dialect для compression; у raw mode виграє бенчмарки, AAAK поки регресує (84.2% vs 96.6%). **Ми використовуємо raw mode** і не залежимо від AAAK.
- **License**: open-source, локальний інстанс, жодних зовнішніх API.
- **Відомі issues**: ChromaDB pinning (#100), shell injection в hooks (#110), macOS ARM64 segfault (#74). Враховуємо в security review (`mp_t14`).

MemPalace обраний як базис через:
- Повністю локальний, без cloud.
- Raw verbatim — не віддаємо AI рішення "що важливо".
- MCP-native — інтеграція з Claude Code через одну команду.
- Структура wings/rooms природньо мапиться на наші поверхні (PD, JF, VS, Shuleansky, People).

---

## 2. Current State

### 2.1 Як пам'ять працює зараз

| Шар | Де живе | Хто пише | Хто читає | Проблема |
|-----|---------|----------|-----------|----------|
| Project rules | `CLAUDE.md`, `.claude/rules/*.md` | Owner + агенти | Claude Code on session start | Розмір; дублюється Mac/VPS через scp |
| Auto memory | `~/.claude/projects/<cwd>/memory/*.md` | Claude Code per-session | Claude Code on session start | Різні шляхи Mac/VPS, ручний merge MEMORY.md |
| Feedback | `memory/feedback_*.md` | Claude Code після коригувань | Claude Code | Губиться контекст — де/коли/чому |
| Initiatives/Tasks | `pg:vs` (Prisma) | Claude Code + Owner через UI | VS API, агенти через API | Структуровано, але не searchable semantically |
| PD AI chat | `pg:pd_prod.chat_messages` | Користувач + моделі | PD UI | Замкнуто в PD, недоступно з Claude Code |
| Shuleansky | `sh-private/data/transcripts/*.md` | faster-whisper | manual grep | Немає індексу, немає cross-reference з VS |
| Docs | `docs/*.md` | Таras + architect | grep / read | Human-curated, не автоматизовано |
| Git history | git log усіх repos | коміти | git log | Зберігає "що", не "чому" |

### 2.2 Ключові обмеження

- **Mac↔VPS sync** ведеться через `scp` по одному файлу (інакше `scp -r` створює вкладену папку — задокументовано в feedback).
- **MEMORY.md** мусить мерджитись рядково, інакше губиться частина Index.
- Шляхи `~/.claude/projects/-Users-owner-Documents-vibe-studio/memory/` vs `-opt-repos-vibe-studio/memory/` **різні** — це вже спричиняло помилки.
- `CLAUDE.md` вантажиться в кожну сесію — кожен рядок коштує токени.
- **PD chat** і Claude Code не бачать один одного.

Поточна система **добре працює для "короткої" декларативної пам'яті** (правила, preferences, workflows). Вона **не масштабується** для "довгої" семантичної пам'яті (історія рішень, транскрипти, діалоги).

---

## 3. Decision

### 3.1 Основне рішення

**Розгорнути один інстанс MemPalace на VPS** як єдиний long-term memory backend для всіх поверхонь VS. Mac-агенти звертаються до нього **через SSH-tunnel-forwarded MCP**. CLAUDE.md / rules / feedback залишаються як є — для short-term декларативної пам'яті.

**Single-instance, не розподілено, не на Mac, не в cloud.**

### 3.2 Обґрунтування "чому VPS"

| Критерій | Mac | VPS | Cloud |
|----------|-----|------|-------|
| Uptime | сон/офф | 24/7 | 24/7 |
| Доступ з усіх сервісів (PD/JF/Shuleansky/Telegram) | Тільки через Tailscale | Локальна мережа + tunnel | Yes (але трафік) |
| Backup pipeline | Ні | `pg_dump` + `/opt/docker/backups/` + NAS | Vendor lock |
| Ресурси | M-chip, SSD | Ryzen 5500U, 32GB RAM, 73GB вільно | Billable |
| Integrity control | Laptop loss ризик | Physical, UPS | Provider trust |
| Data sovereignty | Local | Local | Зовнішній |
| Shared filesystem з PD/JF/VS | Ні | Так (`/opt/repos/vibe-studio/`) | Ні |

VPS — єдиний хост, де **одночасно** живуть PG, Redis, PD, JF, Shuleansky, Telegram боти, Claude Code. Поставити MemPalace там = нульовий network hop для більшості ingestion джерел.

**Ризик "VPS offline"** адресується через fallback (див. §8) і backup strategy (див. §7).

### 3.3 Не-рішення (що ми **не** робимо)

- **Не** піднімаємо MemPalace на Mac. Mac — client, не server.
- **Не** ставимо двосторонню реплікацію Mac↔VPS. Один source of truth.
- **Не** міняємо Chroma на pgvector у v1 (хоча це опція для v2 — див. §10).
- **Не** вмикаємо AAAK mode у v1 (raw mode дає 96.6%, AAAK регресує до 84.2%).
- **Не** викидаємо CLAUDE.md / rules / MEMORY.md. Вони залишаються як L0/L1 — див. §4.
- **Не** експонуємо MemPalace назовні (CF tunnel, public URL). Тільки Tailscale + SSH.

---

## 4. Coexistence with CLAUDE.md / rules / MEMORY.md

Ключова теза: **CLAUDE.md і MemPalace — різні шари пам'яті, а не конкуренти.**

Мапінг на layered model з MemPalace README:

| Layer | Що | Де живе | Sync Mac↔VPS | Token cost |
|-------|-----|---------|---------------|------------|
| **L0** — Identity | Хто агент, роль, мова спілкування, голосові команди | `CLAUDE.md` (root), `.claude/agents/*.md` | git + scp (current flow) | ~500 tok, always loaded |
| **L1** — Rules & preferences | `.claude/rules/*.md`, infrastructure, pd, jobfinder, other-projects | `/opt/repos/vibe-studio/.claude/rules/` | scp per-file | ~1500 tok, always loaded |
| **L1.5** — Short-term auto-memory | `memory/MEMORY.md` + `memory/feedback_*.md`, `memory/project_*.md` | `~/.claude/projects/<cwd>/memory/` | Ручний bidirectional merge | ~1000 tok, always loaded |
| **L2** — Long-term semantic | Verbatim conversations, decisions, transcripts, PD chats, JF reasoning, task histories | **MemPalace on VPS** (Chroma) | Single source of truth | **0 tok default** — on-demand search |
| **L3** — Cold archive | Git history, old backups, `pd-private/ml-training/` | Git + NAS | Git native | 0 tok — manual access |

### 4.1 Що залишається в L0/L1 (НЕ мігрує в MemPalace)

- Голосові команди ("байбай", "роби", "шоти", "шотам").
- Security rules (auth helpers, DOMPurify).
- Deploy playbook.
- Інфраструктурні факти (IP, порти, container names).
- AssigneeType, workflow задач.
- Це — **декларативне, завжди потрібне, маленьке**. Повинно бути в контексті з першого токена.

### 4.2 Що мігрує в L2 (MemPalace)

- Історія рішень ("чому ми перейшли на pgbouncer", "чому IBKR, а не eToro").
- Transcripts Shuleansky (розлогий episode context).
- PD AI chat (фінансові, здоров'я, трейдинг розмови).
- Claude Code sessions (повний dialog, не summary).
- VS task descriptions + commit messages + post-mortems.
- Feedback з поясненнями (не тільки "one-liner" в MEMORY.md).
- JF AI scoring reasoning.

### 4.3 Що дублюється (живе в обох)

- **MEMORY.md feedback index** — залишається як 1-line-per-item cheatsheet для L1.5 (always loaded), але повний контекст feedback-у також пишеться в MemPalace (wing `wing_workflow`, room `room_feedback`, hall `hall_discoveries`).
- Коли агент бачить у MEMORY.md one-liner "XSS + missing auth recur", він може запитати MemPalace "Чому security_recurring feedback з'явився?" і отримати повний контекст.

### 4.4 Правило "куди писати"

| Що | Куди |
|----|------|
| Нове правило на майбутнє | `.claude/rules/*.md` + commit |
| Один рядок feedback "не роби Х" | `memory/feedback_*.md` + MEMORY.md index + MemPalace (deep context) |
| Повний контекст рішення / дебаг-сесії | MemPalace (automatic ingest, §6) |
| Task status change | VS API (`pg:vs.Task`) + MemPalace task log |
| Інфра-зміна | Git commit + `.claude/rules/infrastructure.md` + MemPalace (event) |

---

## 5. MCP Exposure (trust boundary)

### 5.1 Архітектура доступу

```
┌────────────────┐           ┌────────────────────────┐
│  Mac           │           │  VPS                  │
│  Claude Code   │           │                        │
│  (CWD: ~/Documents/vibe-studio)                      │
│                │  ssh tunnel (forced-command)       │
│  claude mcp    ├──────────►│ authorized_keys ───┐   │
│  add mempalace │           │                    ▼   │
│                │           │  mempalace.mcp_server  │
│                │           │    venv, stdio         │
└────────────────┘           │  ~/.mempalace/palace/  │
                             │    chroma/ drawers/    │
┌────────────────┐           │                        │
│  VPS local    │           │                        │
│  Claude Code   ├──────────►│  (direct stdio)        │
│  (tmux claude) │           │                        │
└────────────────┘           └────────────────────────┘

┌────────────────┐           ┌────────────────────────┐
│  PD / JF       │           │  MemPalace HTTP        │
│  pd-scheduler  ├──────────►│  ingestion endpoint    │
│  pd-bot        │  HTTP     │  (localhost only,      │
│                │  shared   │  bearer token from     │
│                │  secret   │  Infisical)            │
└────────────────┘           └────────────────────────┘
```

### 5.2 Mac → VPS: SSH forced-command

Mac-agent не може мати прямий TCP до VPS MCP, бо:
1. Claude Code MCP — stdio, не TCP за замовчуванням.
2. Ми не хочемо відкривати новий порт навіть в Tailscale.
3. Треба whitelist рівно однієї команди, не shell.

**Рішення**: окремий SSH ключ + forced-command в `~/.ssh/authorized_keys` на VPS, за зразком вже існуючого `vs-landing-key` (див. `/opt/docker/secrets/vs-landing-key`).

```
# ~/.ssh/authorized_keys (on VPS, for mempalace-mac user or owner)
command="/opt/mempalace/bin/mcp-stdio-wrapper",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... mempalace-mac
```

Де `/opt/mempalace/bin/mcp-stdio-wrapper` — мінімальний shell script:

```bash
#!/bin/bash
set -euo pipefail
# Ignore SSH_ORIGINAL_COMMAND — we don't let client choose anything
exec /opt/mempalace/venv/bin/python -m mempalace.mcp_server --palace /home/owner/.mempalace/palace
```

На Mac-стороні `.mcp.json`:

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "ssh",
      "args": ["-i", "~/.ssh/mempalace-mac-key", "-o", "ServerAliveInterval=30", "owner@vps.tailnet.ts.net"]
    }
  }
}
```

Переваги:
- Whitelisted — SSH_ORIGINAL_COMMAND ігнорується, клієнт не може запустити довільне.
- Tailscale-only — VPS вже не має публічного SSH порта, лише 100.64.0.10.
- Stdio-native — MCP працює через SSH stdio, нульові зміни в mempalace коді.
- Окремий ключ — `/opt/docker/secrets/mempalace-mac-key`, ротується окремо від `vps` ключа.

### 5.3 VPS local → MemPalace

Direct stdio: `claude mcp add mempalace -- /opt/mempalace/venv/bin/python -m mempalace.mcp_server`. Жодних мережевих hop-ів.

### 5.4 PD / JF / pd-scheduler / pd-bot → MemPalace (ingestion)

PD AI chat, JF scoring, pd-scheduler — це довготривалі сервіси, яким зручніше HTTP, ніж stdio. Для них:

- **MemPalace ingestion sidecar** — невеликий FastAPI wrapper навколо `mempalace.searcher.add_memory()` / `mempalace.miner`.
- Слухає **тільки `127.0.0.1:<port>`** всередині Docker network.
- Bearer token з Infisical (`MEMPALACE_INGEST_TOKEN` у `/opt/docker/secrets/.mempalace.env`).
- Timing-safe comparison (per security rule).
- Whitelist endpoints: `POST /ingest/convo`, `POST /ingest/decision`, `POST /ingest/transcript`, `GET /health`.
- **НЕ** експонує search назовні — пошук тільки через MCP від Claude Code.

### 5.5 Trust boundary

| Surface | Trust | Auth |
|---------|-------|------|
| Owner + VPS local Claude Code | Full | root/owner user |
| Owner + Mac Claude Code | Full | SSH key `mempalace-mac-key` |
| PD/JF backend | Partial (single-tenant) | Bearer token з Infisical |
| Telegram bot (@yourbot) | Full (user_id 100000000) | Через VPS local Claude Code, не прямо |
| External / internet | **None** | Не експонується |

**Ніхто крім Owner** (в усіх його формах) не має доступу до MemPalace. Zero tenants.

### 5.6 Compromise scenarios

| Сценарій | Impact | Mitigation |
|----------|--------|------------|
| Mac скомпрометовано | Атакер має `mempalace-mac-key` → може виконати `mempalace.mcp_server` → **повний read + write** до пам'яті | Ключ в Keychain з passphrase; revoke через видалення з `authorized_keys` на VPS; audit log усіх SSH sessions (`/var/log/auth.log`); MemPalace логує всі MCP виклики. Ротація ключа кожні 90 днів. |
| VPS скомпрометовано | Game over для всіх VS систем | Існуючий VPS threat model — UFW, fail2ban, unattended upgrades; full-disk backup до NAS; encrypted backups з age ключем. MemPalace не погіршує картину — вона вже максимум критична. |
| Ingestion bearer token leak | Атакер може писати garbage в палац | Короткий TTL rotate через Infisical; секрет тільки в `/opt/docker/secrets/.mempalace.env`, не в env-vars без chmod 600; MemPalace ingest сайдкар валідує JSON schema; write-only, read залишається через MCP. |
| Claude Code сесія галюцинує і пише junk | Знижує якість пошуку | `mempalace_quarantine` tool для позначення записів; regular review через `mp_t09` (weekly digest); raw mode зберігає джерело (wing+room) для tracing. |
| ChromaDB corruption | Втрата embeddings (drawers цілі) | Drawers = plain files, reindex за <5 хв (benchmark); daily backup `chroma/` окремо. |

---

## 6. Storage

### 6.1 Фізичне місце

- **Host path**: `/home/owner/.mempalace/palace/`
- **Why not `/opt/`**: `/opt/docker/` для Docker stacks, а MemPalace — Python сервіс власного Owner; `/home/owner/.mempalace/` природніше і уникає прав root.
- **Bind-mount у контейнер**: якщо оформимо як docker service (опційно у v2), то `/home/owner/.mempalace/palace:/palace:rw`.
- **Permissions**: 700 для каталогу, 600 для ChromaDB файлів.

### 6.2 Layout (MemPalace native)

```
~/.mempalace/palace/
├── wings/
│   ├── wing_pd/              # PD project
│   │   ├── hall_facts/
│   │   ├── hall_events/
│   │   ├── hall_discoveries/
│   │   ├── hall_preferences/
│   │   └── hall_advice/
│   ├── wing_jobfinder/
│   ├── wing_vs/              # Vibe Studio itself
│   ├── wing_shuleansky/
│   ├── wing_trade/
│   ├── wing_workflow/        # голосові команди, "байбай", rules meta
│   └── wing_owner/           # особисте
├── drawers/                  # verbatim raw text files (markdown/json)
│   └── <wing>/<room>/<yyyy-mm-dd>-<uuid>.md
├── chroma/                   # ChromaDB on-disk
│   ├── chroma.sqlite3
│   └── <collection>/
├── kg.json                   # knowledge graph edges (halls, tunnels)
└── config.yaml               # wings, rooms registry
```

### 6.3 Формати

- **Drawers**: markdown з YAML frontmatter (source, timestamp, wing, room, hall, hashes з secret scrub audit).
- **Chroma**: на-диск режим, не embedded-only (щоб перезавантаження mcp сервера не губили state).
- **KG**: JSON file, не окрема БД — MemPalace rule.
- **Embeddings model**: MemPalace за замовчуванням — local SentenceTransformers. CPU-mode на Ryzen 5500U буде вистачати для single-user ingestion (~0.5-2 sec per memory).

### 6.4 Size estimates

| Source | Entries/день | Avg size | Rік (drawers) | Rік (chroma) |
|--------|--------------|----------|---------------|--------------|
| Claude Code sessions Mac+VPS | ~200 turns | 2 KB | ~150 MB | ~60 MB |
| PD AI chat | ~50 msgs | 1 KB | ~20 MB | ~8 MB |
| JF scoring reasoning | ~100 | 0.5 KB | ~20 MB | ~8 MB |
| Shuleansky transcripts | 2-3 episodes/week | 80 KB | ~25 MB | ~10 MB |
| Telegram bot | ~30 msgs | 0.3 KB | ~4 MB | ~2 MB |
| VS tasks/initiatives/feedback | ~20/day | 1 KB | ~8 MB | ~3 MB |
| **Total estimate** | | | **~230 MB/рік** | **~90 MB/рік** |

На VPS вільно 73 GB. **Місткість не проблема на 5+ років** — single digit GB з перспективою.

### 6.5 Backup

- **Daily**: `tar czf /opt/docker/backups/mempalace_$(date +%Y%m%d).tar.gz ~/.mempalace/palace/` о 3:10 (після PG backup о 3:00).
- **Retention**: 30 днів on-host, 90 днів на NAS.
- **Offsite**: rsync до NAS `/volume1/Backups/mempalace/` (cat|ssh pattern, бо scp на NAS не працює — див. rules).
- **Encrypt**: age з `age-recipients.txt` (вже використовується для infisical dumps).
- **Restore drill**: `mp_t11` — перевіряти раз на місяць на тестовому шляху.

---

## 7. Ingestion Sources (high-level)

Деталі — в окремих Wave 2 tasks. Тут фіксуємо shape і priority.

| Source | Mode | Task | Wave |
|--------|------|------|------|
| Claude Code sessions (Mac+VPS) | Hook → convos | `mp_t06` | 2 |
| PD AI chat (`pd_prod.chat_messages`) | Cron SQL → convos | `mp_t07` | 2 |
| Shuleansky transcripts | File watcher → general extract | `mp_t08` | 2 |
| Telegram bot history | Webhook → general | `mp_t09` | 2 |
| VS initiatives/tasks/feedback | API hook on status change | `mp_t10` | 2 |
| JF scoring reasoning | App-level hook | `mp_t12` | 3 |
| Legacy: git commit messages | One-shot backfill | `mp_t13` | 3 |

**Всі ingestion точки проходять через secret scrubbing** (§9) **перед записом**.

### 7.1 Ingestion API контракт (v1)

```python
POST /ingest/convo
Authorization: Bearer <token>
{
  "wing": "wing_pd",
  "room": "chat-ai",
  "hall": "hall_events",
  "timestamp": "2026-04-10T14:30:00Z",
  "source": "pd_prod.chat_messages",
  "source_id": "msg_12345",
  "content": "...raw text (post secret-scrub)...",
  "participants": ["user:owner", "model:gemini-2.5-flash"]
}
```

Всі інші endpoints — варіанти цього.

---

## 8. Failure Modes & Degradation

| Failure | Detection | Degradation |
|---------|-----------|-------------|
| **VPS offline** | Mac не може ssh | Claude Code на Mac працює **без MCP MemPalace**; CLAUDE.md/rules/MEMORY.md залишаються; агент повідомляє "MemPalace unreachable, operating on L0/L1 only"; writes буферизуються у `~/.mempalace-outbox/` і флашаться коли VPS з'являється |
| **ChromaDB corruption** | `mempalace status` exit != 0 | Reindex з drawers (raw files) — <5 хв; writes продовжують йти в outbox |
| **Disk full** на VPS | Status service alert (вже моніторить) | Автоматичний rotate drawers старше 1 року до NAS; ingestion paused |
| **MCP auth fail** | SSH помилка на Mac | Fallback як у "VPS offline"; `mp_t14` перевіряє key rotation |
| **Secret leak в drawer** | Periodic grep job + secret scanner | Immediate removal; audit тimeline; rotate affected secrets через Infisical |
| **Garbage ingestion** (halucination) | Weekly digest (`mp_t09` або окремо) | Quarantine API, manual prune |
| **Embedding model update** breaks index | Pinned version | MemPalace version pinning + reindex procedure |
| **mempalace upstream bug** (#100, #110, #74) | Pre-release test | Pin version, slow upgrade, security review |

**Fallback principle**: якщо MemPalace не працює, **ніщо не ламається**. Short-term memory (CLAUDE.md, rules, MEMORY.md) — standalone. Long-term пам'ять стає недоступною тимчасово, але не втрачається: raw drawers — на диску + backup.

---

## 9. Secret Scrubbing (hard requirement)

**Ніколи не зберігати raw secrets у drawers.** Порушення цього правила — автоматичне видалення і security incident.

### 9.1 Scrubbing pipeline

Перед записом у Chroma/drawer, content проходить через `mempalace_scrub()`:

1. **Pattern-based redaction** (regex):
   - `sk-[a-zA-Z0-9]{32,}` — OpenAI keys
   - `ghp_[a-zA-Z0-9]{36}` — GitHub tokens
   - `gho_...`, `ghs_...`
   - AWS AKIA pattern
   - `xai-...`, `gsk_...` — Groq/xAI
   - `postgres://.*:.*@` → `postgres://REDACTED@`
   - Bearer tokens в HTTP headers
   - JWT (eyJ...)
   - Private keys (`-----BEGIN.*PRIVATE KEY-----`)
   - Email + password pair heuristics
2. **Entropy detector** — base64 strings >32 chars з високою ентропією → REDACT.
3. **Known-secrets whitelist** — читаємо `/opt/docker/secrets/` (metadata only, names) і блокуємо будь-які записи, що містять значення цих env-vars. Порівняння через hash, не plaintext.
4. **Filename blacklist** — drawers, що ingested з файлів, не можуть містити шляхи `.env`, `/secrets/`, `authorized_keys`, `id_ed25519`, etc.
5. **Audit log** — кожен scrub записує в `/home/owner/.mempalace/audit.log` (append-only, 600): timestamp, source, pattern matched, redaction count (не сам секрет).

### 9.2 Enforcement

- Unit tests на scrubbing у `mp_t14`.
- Regular hunt: `rg 'sk-[a-zA-Z0-9]{32,}' ~/.mempalace/palace/drawers/` — cron weekly, alert via Telegram.
- Якщо знайдено — `mempalace_purge_drawer(id)` + rotate secret через Infisical + postmortem.

### 9.3 Що **не** ingested взагалі

- Будь-який файл у `/opt/docker/secrets/`.
- `.env*` файли (blacklist у hook).
- Вміст `/opt/docker/backups/` (DB dumps — занадто чутливі, залишаються як binary backups).
- PG `pd.secrets` таблиця (AES-GCM ciphertext — ingestion через decrypted path категорично ні).

---

## 10. Alternatives Considered

### 10.1 Mac як primary

**Pros**: SSD швидший, розробка там.
**Cons**: не 24/7; ingestion від PD/JF/Telegram мала б йти через Tailscale назад на Mac; backup не налаштовано; loss of laptop = loss of memory (навіть з бекапом recovery довше).
**Verdict**: відхилено.

### 10.2 Distributed (Mac + VPS з sync)

**Pros**: local-first на обох.
**Cons**: Chroma sync nontrivial (ingestion race, embedding drift); подвоєний backup complexity; MemPalace upstream не підтримує multi-node.
**Verdict**: відхилено. Single source of truth краще.

### 10.3 Cloud-hosted (VPS, S3-backed)

**Pros**: available звідки завгодно.
**Cons**: data leaves premises; vendor lock; billable; проти принципу VS (self-hosted); compliance risk для українських/іспанських фінансових даних.
**Verdict**: відхилено.

### 10.4 pgvector замість Chroma (власна імплементація)

**Pros**: вже є PG; один DB бекап; SQL joins з vs.Task.
**Cons**: треба переписати MemPalace searcher; губимо upstream updates і бенчмарки; MemPalace MCP tools заточені під Chroma. Vs — писати свій "MemPalace-lite".
**Verdict**: відхилено в v1. Потенційний v2: build thin adapter, поки benchmarks тримаються.

### 10.5 Notion / Obsidian / LogSeq з vector plugin

**Pros**: готові GUI, markdown-first.
**Cons**: GUI для Owner — не пріоритет, агенти пишуть автоматично; vendor-specific plugins крихкі; не MCP-native; Notion — cloud.
**Verdict**: відхилено.

### 10.6 Mem0 / Zep / Letta

**Pros**: managed, має API.
**Cons**: cloud, platform lock, платно, дані зовні.
**Verdict**: відхилено за тим самим принципом, що й cloud option.

### 10.7 Нічого не робити

**Pros**: zero work.
**Cons**: фрагментація прогресує; L1 в CLAUDE.md роздуватиметься; Mac↔VPS sync продовжує ламатись.
**Verdict**: відхилено — ініціатива існує саме тому.

---

## 11. Risks & Trade-offs

| Ризик | Ймовірність | Impact | Mitigation |
|-------|-------------|--------|------------|
| MemPalace upstream кине проект | Medium | High | AGPL license; форкаємо у `vendor/mempalace` при алерті; drawers — plain files, переносимі |
| Chroma breaking changes | High (issue #100) | Medium | Version pinning в requirements; test upgrade в okремому venv |
| Scrubbing пропустить секрет | Medium | Critical | Defense in depth: pattern + entropy + whitelist + audit + weekly hunt |
| Надмірна залежність агентів від MemPalace | Low | Medium | Fallback design (§8); агенти мусять працювати і без MCP |
| Перформанс embeddings на CPU | Low | Low | SentenceTransformers на Ryzen 5500U дає 0.5-2 s/memory — прийнятно для single-user. Якщо забагато — Ollama embedding endpoint вже є |
| Context pollution — засмічення палацу junk | Medium | Medium | Weekly digest + quarantine API + room detection |
| Secret leak через untrusted transcript | Medium | High | Shuleansky audio ingest — окремий scrub profile; faster-whisper output review step |
| Mac↔VPS network split | Low | Low | Fallback (§8); writes to outbox |
| Migration pain від MEMORY.md | Low | Low | Coexistence design (§4) — нічого мігрувати насильно |

### Trade-offs accepted

- **VPS стає ще більш критичним** — це вже так, MemPalace не змінює threat model якісно.
- **Додатковий moving part** — ~500 MB Python env + ChromaDB + sidecar. Ресурси є.
- **Learning curve** — wings/rooms taxonomy треба налаштувати на наші домени (`mp_t03`).
- **Зайвий ingestion traffic** — писатимемо дублі (CLAUDE auto-memory + MemPalace drawers). Це плата за fallback резистентність.

---

## 12. Security Review Hooks

Task `mp_t14` — full security review перед prod. Must-check:

1. Secret scrubbing unit tests (§9) — coverage + red team inputs.
2. SSH forced-command escape attempts (SSH_ORIGINAL_COMMAND injection).
3. Ingestion bearer token rotation + timing-safe comparison.
4. ChromaDB query injection (input sanitization).
5. MemPalace upstream issues: #100 (Chroma pinning), #110 (shell injection у hooks), #74 (ARM64 segfault — не стосується VPS, але фіксуємо).
6. File permissions on `/home/owner/.mempalace/` (700/600).
7. Audit log integrity (append-only, protected from MCP tools).
8. Backup encryption (age) restore drill.
9. MCP tool whitelist — тільки read tools назовні від sidecar.
10. Drawer path traversal (ingestion санітація `source_id`).

Архітектор виконає security review **після** завершення ingestion tasks (Wave 2) і **перед** ввімкненням writes з PD/JF (Wave 3).

---

## 13. Open Questions

Залишаються для Wave 2 (не блокують цей ADR):

- **Q1**: Чи робити MemPalace окремим docker service у `/opt/docker/` чи systemd unit? → рішення у `mp_t02` (bootstrap).
- **Q2**: Embedding model — default SentenceTransformers чи Ollama-hosted `nomic-embed-text`? → benchmark у `mp_t04`.
- **Q3**: Як саме hook Claude Code session logs — через built-in MemPalace hooks чи власний wrapper? → `mp_t06`.
- **Q4**: Чи заводити wing per людина (Owner, Milla, Ben, clients) або тільки wing per project? → `mp_t03`.
- **Q5**: Retention policy — тримати все назавжди чи rotate drawers старіші за N років до NAS-only cold storage? → v2 decision.
- **Q6**: Чи експонувати MemPalace search у PD UI (як окремий модуль) у v2? → v2, не v1.

---

## 14. Rollout Plan (high-level)

| Wave | Scope | Blocks | Key tasks |
|------|-------|--------|-----------|
| **1** | ADR + taxonomy + bootstrap | — | `mp_t01` (this), `mp_t02`, `mp_t03` |
| **2** | Ingestion sources (read-only intake) | Wave 1 | `mp_t04`..`mp_t10` |
| **3** | MCP enable + Mac tunnel + writes from PD/JF | Wave 2 + `mp_t14` | `mp_t11`, `mp_t12`, `mp_t13` |
| **4** | Security review, backup drill, monitoring | Wave 3 | `mp_t14`, `mp_t15` |
| **5** | Production cutover — Mac MCP configured, CLAUDE.md updated з правилом "куди писати" | Wave 4 | `mp_t16` |

Git branch: `release-2026-04-10` (поточна, ця гілка для mp_t01) → merge в main після проходження Wave 2.

---

## 15. References

- MemPalace repo: https://github.com/milla-jovovich/mempalace
- LongMemEval: https://github.com/milla-jovovich/mempalace/tree/main/benchmarks
- VS Initiative: `mp_init_20260410` у `pg:vs.Initiative`
- Поточний memory layer: `~/.claude/projects/-opt-repos-vibe-studio/memory/MEMORY.md`
- Rules: `/opt/repos/vibe-studio/.claude/rules/*.md`
- Infisical: https://secrets.example.com
- Precedent (SSH forced-command): `/opt/docker/secrets/vs-landing-key`, `/opt/docker/secrets/vs-ssh-config`
- Infra baseline: `.claude/rules/infrastructure.md`

---

## 16. Decision Log

- **2026-04-10** — ADR created (mp_t01, architect).
- **2026-04-18** — Status updated Proposed → Implemented (REV2-15, devsecops). Scrubber extended with INFISICAL_TOKEN, NEXTAUTH_SECRET, ENCRYPTION_KEY patterns.
- Next review: after Wave 2 completion or if MemPalace upstream releases v4 with AAAK-in-closets.
