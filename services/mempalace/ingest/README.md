# MemPalace Ingest Scripts

Скрипти для завантаження даних у MemPalace через `/ingest/convo` endpoint.

---

## Скрипти

| Скрипт | Джерело | Task |
|--------|---------|------|
| `ingest_claude_sessions.py` | Claude Code JSONL sessions (`~/.claude/projects/`) | mp_t06 |
| `ingest_pd_chat.py` | PD AI Chat history (`pd_prod.chat_history`) | mp_t07 |
| `ingest_shuleansky.py` | Shuleansky курс: транскрипти, матеріали, учасники (`sh` PostgreSQL) | mp_t08 |
| `ingest_telegram.py` | Telegram bot conversations (`@yourbot` claude-channels SQLite) | mp_t09 |
| `ingest_vs_db.py` | VS DB: ініціативи, задачі (DONE), feedback, project updates | mp_t10 |

---

## ingest_claude_sessions.py — Claude Code Sessions

Читає `.jsonl` файли з `/home/owner/.claude/projects/{project}/` і завантажує кожну сесію як conversation chunk.

### Запуск вручну

```bash
# Dry-run — показує що буде завантажено без реальних POST запитів
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --dry-run

# Dry-run з ліміт 5 сесій
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --dry-run --limit 5

# Реальний ingest, обмежити 10 сесіями
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --limit 10

# Тільки сесії новіші за дату
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --since 2026-04-01

# Конкретний проект
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --project -opt-repos-vibe-studio

# Повний ingest всіх проектів
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py
```

### CLI аргументи

| Аргумент | Опис |
|----------|------|
| `--dry-run` | Показати що буде завантажено без POST запитів |
| `--limit N` | Максимальна кількість сесій (0 = необмежено) |
| `--since YYYY-MM-DD` | Фільтр за датою першого повідомлення сесії |
| `--project NAME` | Назва проекту або `all` (за замовчуванням) |

### Токен

Скрипт шукає токен у такому порядку:
1. Env var `MEMPALACE_TOKEN`
2. Env var `MEMPALACE_BEARER_TOKEN`
3. `/opt/docker/secrets/.mempalace.env` (рядок `MEMPALACE_BEARER_TOKEN=...`)

В dry-run режимі токен не потрібен.

### State file — перевірка стану ingestion

Кожен project directory зберігає стан у `.mp_ingested.json` поруч з `.jsonl` файлами:

```
/home/owner/.claude/projects/-opt-repos-vibe-studio/.mp_ingested.json
```

Приклад вмісту (тільки metadata, БЕЗ content):

```json
{
  "ingested_sessions": {
    "44fffdda-3b40-46b0-be23-12bd92014937": {
      "timestamp": "2026-03-27T10:38:27.804Z",
      "file": "44fffdda-3b40-46b0-be23-12bd92014937.jsonl",
      "ingested_at": "2026-04-10T17:14:19.422180+00:00"
    }
  }
}
```

Переглянути стан:
```bash
cat /home/owner/.claude/projects/-opt-repos-vibe-studio/.mp_ingested.json | python3 -m json.tool
```

Кількість вже оброблених сесій:
```bash
cat /home/owner/.claude/projects/-opt-repos-vibe-studio/.mp_ingested.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('ingested_sessions',{})), 'sessions ingested')"
```

### Audit log

Перевірити останні ingest записи:
```bash
sudo tail -20 /opt/docker/mempalace/palace/audit.log | python3 -m json.tool
```

Поля: `ts`, `op=ingest`, `source=claude-code`, `bytes_in`, `bytes_redacted`, `findings_count`, `status`.

### Rollback / reset ingestion

Видалити state file щоб дозволити повторний ingest:

```bash
# Для конкретного проекту
rm /home/owner/.claude/projects/-opt-repos-vibe-studio/.mp_ingested.json

# Для всіх проектів
rm /home/owner/.claude/projects/*/.mp_ingested.json
```

Після видалення state file, наступний запуск скрипта завантажить всі сесії знову.

### Cron (mp_t11)

Cron job для автоматичного інкрементального ingest налаштовується в mp_t11.
Рекомендовано: щоденно о 02:00 UTC.

```bash
0 2 * * * python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py 2>&1 | logger -t mempalace-claude
```

---

## ingest_pd_chat.py — PD AI Chat History

Читає діалоги з `pd_prod.chat_history` і завантажує їх як conversation exchanges у MemPalace.

### Запуск вручну

```bash
# Dry-run — показує що буде завантажено без реальних POST запитів
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py --dry-run

# Dry-run з лімітом 3 повідомлень
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py --dry-run --limit 3

# Реальний ingest одного exchange
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py --limit 2

# Тільки повідомлення новіші за дату
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py --since 2026-04-01

# Повний incremental ingest (використовує state file)
MEMPALACE_BEARER_TOKEN=<token> python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py

# Reset state (re-ingest з початку)
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_pd_chat.py --reset-state
```

### CLI аргументи

| Аргумент | Опис |
|----------|------|
| `--dry-run` | Показати що буде завантажено без POST запитів |
| `--limit N` | Максимальна кількість raw повідомлень для fetch |
| `--since YYYY-MM-DD` | Фільтр за датою (created_at >= date) |
| `--user-id N` | Фільтр по user_id (за замовчуванням=1, Owner) |
| `--reset-state` | Скинути state file (re-ingest з нуля) |

### State file

```
/opt/docker/mempalace/ingest-state/pd_chat.json
```

Формат: `{"last_processed_id": <int>}` — зберігає max processed message id.
Incremental: кожен запуск читає тільки нові повідомлення (id > last_processed_id).

### Grouping логіка

- Повідомлення групуються в exchanges: (user_message, assistant_response)
- Orphan user messages (без відповіді assistant) — інгестуються окремо
- source_id = assistant message id (або `user_{id}` для orphans)
- hall = `hall_chat_YYYY_MM` за місяцем timestamp

### Архітектура

- **Wing:** `wing_pd`
- **Room:** `room_ai_chat`
- **Hall:** `hall_chat_YYYY_MM` (per month)
- **Source:** `pd-chat`
- **Source ID:** assistant message id або `user_{id}` для orphans
- **Idempotency:** state file зі збереженим max processed id
- **Rate limit:** 100ms між запитами

---

## ingest_shuleansky.py — Shuleansky Курс (mp_t08)

Читає дані з PostgreSQL бази `sh` і завантажує їх у MemPalace.

### Джерела даних

| Таблиця | Тип | Wing/Room | Endpoint |
|---------|-----|-----------|----------|
| `transcripts` + `sessions` | Повні транскрипти сесій | `wing_shuleansky/room_transcripts` | `/ingest/transcript` |
| `materials` (type=document) | Сценарії, конспекти, глосарії, ДЗ | `wing_shuleansky/room_scripts` або `room_topics` | `/ingest/decision` |
| `participants` | Учасники курсів | `wing_shuleansky/room_guests` | `/ingest/decision` |

**База даних:** `sh` в PostgreSQL (pg:5432), user `sh`. На VPS: `docker exec pg psql -U sh -d sh`.

**Статистика (2026-04-10):** 11 сесій, 11 транскриптів (68–433 KB кожен), 107 матеріалів, 17 учасників.

### Запуск вручну

```bash
# Dry-run — показує що буде завантажено без реальних POST запитів
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_shuleansky.py --dry-run

# Dry-run з лімітом 2 записів на тип
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_shuleansky.py --dry-run --limit 2

# Реальний ingest (1 запис на тип для тесту)
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_shuleansky.py --limit 1

# Тільки сесії новіші за дату
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_shuleansky.py --since 2026-01-01

# Повний ingest
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_shuleansky.py
```

### CLI аргументи

| Аргумент | Опис |
|----------|------|
| `--dry-run` | Показати що буде завантажено без POST запитів |
| `--limit N` | Максимальна кількість записів на тип (0 = необмежено) |
| `--since YYYY-MM-DD` | Фільтр за датою сесії (тільки для transcripts + materials) |

### State file

```
/opt/docker/mempalace/ingest-state/shuleansky.json
```

Формат:
```json
{
  "transcripts": {"1": {"ingested_at": "...", "session_number": 0, "chunks": 1}},
  "materials":   {"46": {"ingested_at": "...", "title": "..."}},
  "participants": {"1": {"ingested_at": "...", "name": "Андрій Шулянський"}}
}
```

### Chunking транскриптів

Транскрипти > 10 000 символів автоматично розбиваються на chunks. Кожен chunk отримує:
- `source_id = "session_{id}_chunk_{i}of{n}"` — унікальний ідентифікатор
- Перший chunk містить заголовок сесії (назва, опис, дата, мова)

### Env vars (опціонально)

| Змінна | За замовчуванням |
|--------|-----------------|
| `SH_DB_HOST` | `127.0.0.1` |
| `SH_DB_PORT` | `5432` |
| `SH_DB_NAME` | `sh` |
| `SH_DB_USER` | `sh` |
| `SH_DB_PASS` | `sh` |
| `MEMPALACE_BEARER_TOKEN` | з `/opt/docker/secrets/.mempalace.env` |

### Якщо база недоступна

Скрипт завершується з `exit(0)` та WARNING — не аварійно. Це нормально якщо запускається на хості де немає доступу до `sh` бази.

### Архітектура

- **Wing:** `wing_shuleansky`
- **Rooms:** `room_transcripts`, `room_scripts`, `room_topics`, `room_guests`
- **Source:** `shuleansky`
- **Idempotency:** state file `/opt/docker/mempalace/ingest-state/shuleansky.json`
- **Rate limit:** 200ms між запитами (транскрипти великі)
- **Chunking:** max 10 000 символів/chunk для transcripts

---

## ingest_telegram.py — Telegram Bot Conversations (mp_t09)

Читає розмови з Telegram бота `@yourbot` (Claude Code на VPS) зі SQLite бази
`/home/owner/.claude/channels/telegram/messages.db` і завантажує їх у MemPalace.

### Джерела

| Джерело | Бот | Сховище | Статус |
|---------|-----|---------|--------|
| `claude-channels` | `@yourbot` (Claude Code) | `/home/owner/.claude/channels/telegram/messages.db` | Активно |
| `pd-bot` | PD assistant bot | Немає — stateless | Не зберігається |

**Примітка:** `pd-bot` обробляє кожне повідомлення незалежно через `python-telegram-bot` polling
і не зберігає історію розмов у жодну БД.

### Запуск вручну

```bash
# Dry-run — показує що буде завантажено
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --dry-run

# Dry-run з лімітом 5 повідомлень
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --dry-run --limit 5

# Реальний ingest, обмежити 20 повідомленнями
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --limit 20

# Тільки повідомлення новіші за дату
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --since 2026-04-01

# Конкретне джерело
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --source claude-channels

# Скинути стан (повторний ingest з початку)
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_telegram.py --reset-state --dry-run
```

### CLI аргументи

| Аргумент | Опис |
|----------|------|
| `--dry-run` | Показати що буде завантажено без POST запитів |
| `--limit N` | Максимальна кількість raw повідомлень на джерело |
| `--since YYYY-MM-DD` | Фільтр за датою |
| `--source` | `claude-channels` або `all` (за замовчуванням `all`) |
| `--reset-state` | Скинути state file (re-ingest від початку) |

### State file

```
/opt/docker/mempalace/ingest-state/telegram.json
```

```json
{
  "claude_channels": {
    "last_processed_id": 116
  }
}
```

### MemPalace mapping

- **Wing:** `wing_workflow`
- **Room:** `room_commands`
- **Hall:** `hall_telegram_YYYY_MM` (per month)
- **Source:** `telegram-yourbot`
- **Source ID:** `cc_{message_id}` (assistant exchange) або `cc_user_{message_id}` (orphan user)
- **Idempotency:** state file зі збереженим max processed row id
- **Rate limit:** 100ms між запитами

---

## ingest_vs_db.py — VS DB (mp_t10)

Читає ініціативи, завершені задачі, feedback та project updates з VS PostgreSQL і завантажує їх у MemPalace як decisions.

### Джерела даних

| Entity | Таблиця VS | Wing/Room | Source |
|--------|-----------|-----------|--------|
| Ініціативи | `Initiative` | `wing_vs/room_decisions` | `vs-initiatives` |
| Задачі (DONE) | `Task WHERE status='DONE'` | `wing_vs/room_tasks` | `vs-tasks` |
| Feedback | `TaskFeedback` | `wing_vs/room_decisions` | `vs-feedback` |
| Project Updates | `ProjectUpdate` | `wing_vs/room_decisions` | `vs-updates` |

### Запуск вручну

```bash
# Dry-run — ініціативи, 3 записи
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py --dry-run --entity initiatives --limit 3

# Dry-run — всі entities
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py --dry-run --entity all

# Реальний ingest — ініціативи
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py --entity initiatives

# Реальний ingest — тільки задачі новіші за дату
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py --entity tasks --since 2026-04-01

# Повний incremental ingest (всі entities)
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py
```

### CLI аргументи

| Аргумент | Опис |
|----------|------|
| `--dry-run` | Показати що буде завантажено без POST запитів |
| `--limit N` | Максимальна кількість записів на entity (0 = необмежено) |
| `--since YYYY-MM-DD` | Фільтр за датою (createdAt >= date) |
| `--entity` | `initiatives`, `tasks`, `feedback`, `updates`, або `all` |

### State file

```
/opt/docker/mempalace/ingest-state/vs_db.json
```

Формат:
```json
{
  "initiatives": {
    "ingested_ids": ["id1", "id2"],
    "last_synced": "2026-04-10T..."
  },
  "tasks": { ... },
  "feedback": { ... },
  "updates": { ... }
}
```

### DB connection

Підключається до VS PostgreSQL на `localhost:5432` (заміняє `pg` hostname → `localhost`).
Credentials читає з `/opt/docker/secrets/.vs.env` (рядок `DATABASE_URL=...`).
Fallback: `postgresql://vs:vs2026secure@localhost:5432/vs`.

### Архітектура

- **Wing:** `wing_vs`
- **Rooms:** `room_decisions` (initiatives, feedback, updates), `room_tasks` (tasks)
- **Source IDs:** `vs-initiatives`, `vs-tasks`, `vs-feedback`, `vs-updates`
- **Idempotency:** state file зі списком ingested_ids per entity
- **Rate limit:** 100ms між запитами
- **Batch checkpoint:** кожні 50 записів

---

## Архітектура

- **Wing:** `wing_workflow`
- **Room:** `room_sessions`
- **Hall:** `hall_sessions_YYYY_MM` (per month)
- **Source:** `claude-code`
- **Source ID:** `sessionId` (UUID)
- **Idempotency:** state file per project, dedup by sessionId
- **Rate limit:** 100ms між запитами
- **Scrubber:** fail-closed — якщо scrubber повертає 500, ingest не відбувається (правильна поведінка)
