# MemPalace Nightly Incremental Ingestion

## Що запускається і коли

Скрипт `nightly.sh` щодня о **04:45 UTC** запускає всі 5 ingesters послідовно (серійно, не паралельно — для безпечної роботи з ChromaDB):

| Ingester | Timeout | Source |
|---|---|---|
| `ingest_claude_sessions.py` | 10 хв | JSONL-сесії з `~/.claude/projects/` |
| `ingest_pd_chat.py` | 5 хв | AI Chat з `pd_prod` PostgreSQL |
| `ingest_shuleansky.py` | 10 хв | Транскрипти з `/opt/docker/mempalace/ingest-state/shuleansky/` |
| `ingest_telegram.py` | 5 хв | Telegram повідомлення |
| `ingest_vs_db.py` | 10 хв | Tasks/Initiatives з VS PostgreSQL |

Розклад обраний так, щоб не конфліктувати з:
- `03:00` — PG backup (`db-backup.sh`)
- `04:00` — Claude Code update + mempalace-backup
- `04:30` — docker image prune
- `04:35` — docker builder prune

## Де логи

| Лог | Призначення |
|---|---|
| `/opt/docker/mempalace/ingest-logs/mempalace-ingest.log` | Основний лог orchestrator (успіх/провал кожного ingester) |
| `/opt/docker/mempalace/palace/audit.log` | MemPalace audit log (кожен ingest запис) |
| `/opt/docker/mempalace/ingest-state/zero_ingest_streak.json` | Streak of consecutive nightly runs з total_ingested=0 (AI-20260601-0001) |

Logrotate: `/etc/logrotate.d/mempalace-ingest` — зберігає 30 днів, стискає щодня.

## HEALTH line (AI-20260601-0001)

Кожен nightly run наприкінці друкує одну `HEALTH` лінію, яку легко зчитати моніторингу:

```
[YYYY-MM-DD_HH:MM:SS] HEALTH total_ingested=N total_skipped=N total_errors=N total_failed=N streak_zero_ingest_days=K
```

- `total_ingested` = сума `ingested` зі stdout усіх 6 ingesters (parsed by awk parser в `_parse_ingester_counts`)
- `total_skipped` = аналогічно для skipped
- `streak_zero_ingest_days` = підряд днів коли `total_ingested == 0`. При досягненні 3 днів — Telegram alert. Лічильник зберігається у `zero_ingest_streak.json`.

`SUMMARY` лінії per-ingester тепер теж показують реальні цифри (раніше було hardcoded `ingested=0 skipped=0 errors=0`).

## Як запустити вручну

```bash
# На VPS
bash /opt/repos/vibe-studio/services/mempalace/ingest/nightly.sh

# Або через встановлений скрипт
/opt/docker/scripts/mempalace-ingest-nightly.sh

# Один конкретний ingester
source /opt/docker/secrets/.mempalace.env
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py

# З dry-run (якщо ingester підтримує)
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_claude_sessions.py --dry-run
```

## Як відключити

```bash
# Видалити cron запис
crontab -l | grep -v 'mempalace-ingest-nightly' | crontab -

# Перевірити що видалено
crontab -l | grep mempalace
```

## Troubleshooting

### Скрипт не запускається
```bash
# Перевірити права
ls -la /opt/repos/vibe-studio/services/mempalace/ingest/nightly.sh
# Має бути: -rwxr-xr-x

# Перевірити cron
crontab -l | grep mempalace
```

### Ingester завершується з помилкою
```bash
# Переглянути останній запуск
tail -100 /opt/docker/backups/mempalace-ingest.log

# Запустити вручну з виводом
source /opt/docker/secrets/.mempalace.env
python3 /opt/repos/vibe-studio/services/mempalace/ingest/ingest_vs_db.py 2>&1 | tail -50
```

### MemPalace недоступний
```bash
# Перевірити контейнер
docker ps | grep mempalace

# Health check
curl -sf http://localhost:8888/health || echo "DOWN"

# Перезапустити
cd /opt/docker && docker compose restart mempalace
```

### MEMPALACE_TOKEN не знайдено
```bash
# Перевірити secrets файл
ls -la /opt/docker/secrets/.mempalace.env
cat /opt/docker/secrets/.mempalace.env | grep -c MEMPALACE_BEARER_TOKEN
```

### Timeout ingester
Збільшити таймаут у `nightly.sh`:
```bash
# Знайти рядок run_ingester для потрібного ingester і змінити секунди
# Наприклад: 600 → 1200 для 20 хв
```
