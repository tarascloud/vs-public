# MemPalace — Backup & Restore

## Що бекапиться

Два каталоги на VPS:

| Шлях | Вміст |
|------|-------|
| `/opt/docker/mempalace/palace/` | Основне сховище — wings, rooms, drawers, ChromaDB |
| `/opt/docker/mempalace/outbox/` | Буфер Mac→VPS (записи, що ще не записані в palace) |

Бекап: `tar.gz` + age-encryption → on-host + NAS offsite.

## Розклад

| Задача | Cron | Час |
|--------|------|-----|
| Backup | `0 4 * * *` | 04:00 UTC щодня (після PG backup о 03:00) |
| Restore drill | `0 5 * * 1` | 05:00 UTC щопонеділка |
| Scrubber regression check | `0 6 * * 0` | 06:00 UTC щонеділі (DEV-20260507-0032) |

### Scrubber regression check (DEV-20260507-0032)

Cron entry to add on VPS (recommended):
```
0 6 * * 0 /opt/docker/scripts/cron-wrapper.sh mempalace-scrubber /opt/repos/vibe-studio/infra/scripts/mempalace-scrubber-weekly.sh >> /opt/docker/backups/mempalace-scrubber-weekly.log 2>&1
```

What it does:
1. Runs `pytest scrubber/tests/` inside the mempalace container (or host fallback) — verifies all known patterns still redact.
2. Samples 20 random drawers from `pg:mempalace.drawers`, re-scrubs their content, exits non-zero if any pattern fires (= drift, content slipped past ingest-time scrubber).

Telegram alerts via `cron-wrapper.sh mempalace-scrubber` tag.

## Retention

| Місце | Тип | Термін |
|-------|-----|--------|
| VPS `/opt/docker/backups/` | `.tar.gz` + `.tar.gz.age` | 30 днів |
| NAS `/volume1/Backups/mempalace/` | `.tar.gz.age` | 90 днів |

## Скрипти (на VPS, не в git)

Обидва скрипти живуть на VPS в `/opt/docker/scripts/`:

- `/opt/docker/scripts/mempalace-backup.sh` — щоденний backup
- `/opt/docker/scripts/mempalace-restore-test.sh` — weekly restore drill

**Примітка**: ці файли не в git-репозиторії (лежать поза ``). При re-provision VPS — відновити з цієї документації або з NAS backup скрипта.

### Ключові параметри backup скрипта

```bash
BACKUP_DIR="/opt/docker/backups"
PALACE_DIR="/opt/docker/mempalace"
AGE_RECIPIENTS="/opt/docker/secrets/age-recipients.txt"
NAS_USER="terminal-user"
NAS_HOST="10.0.0.20"
NAS_BACKUP_DIR="/volume1/Backups/mempalace"
KEEP_LOCAL_DAYS=30
KEEP_NAS_DAYS=90
```

## Encryption

Backup зашифровується за допомогою [age](https://github.com/FiloSottile/age).

### Активний ключ (станом на 2026-04-11, MP-IMPROVE-20260411-02)

| Параметр | Значення |
|----------|----------|
| Публічний ключ | `age1l38v09ewmycef55hzd06tys9qqfauk3muq5c37mmaw56rh68n47s4cev5h` |
| Recipients файл | `/opt/docker/secrets/age-recipients.txt` |
| Приватний ключ (primary) | `/opt/docker/secrets/age-key.txt` |
| Приватний ключ (secondary) | `/opt/docker/backups/secrets/age-key.txt` |
| Приватний ключ (NAS offsite) | `/volume1/Backups/mempalace/secrets/age-key.txt` |
| Public key у git | `infra/age-recipients.txt` |

Якщо `age-recipients.txt` відсутній — backup зберігається без шифрування з WARNING у лозі.

**НІКОЛИ не комітити приватний age ключ в git.**

### Розміщення ключів (3 копії)

```
VPS primary:    /opt/docker/secrets/age-key.txt           (chmod 600, owner:owner)
VPS secondary:  /opt/docker/backups/secrets/age-key.txt   (chmod 600, owner:owner)
NAS offsite:     /volume1/Backups/mempalace/secrets/age-key.txt  (chmod 600)
```

Другорядна копія на VPS в `backups/secrets/` гарантує що ключ є там само де backups,
якщо основний secrets dir буде недоступний.

### Генерація нового ключа (ротація)

> **УВАГА:** Ротація ключа робить ВСІ існуючі encrypted backups непридатними для відновлення.
> Перед ротацією: або зберегти старий ключ поруч зі старими backups, або прийняти втрату.

```bash
# 1. Зупинити cron backup (опціонально, якщо потрібно атомарно)
# 2. Генерувати новий ключ
age-keygen -o /opt/docker/secrets/age-key.txt
# Виведе: Public key: age1...

# 3. Оновити recipients файл
echo "age1<NEW_PUBLIC_KEY>" > /opt/docker/secrets/age-recipients.txt

# 4. Оновити permissions
chmod 600 /opt/docker/secrets/age-key.txt

# 5. Розмістити recovery копії
cp /opt/docker/secrets/age-key.txt /opt/docker/backups/secrets/age-key.txt
chmod 600 /opt/docker/backups/secrets/age-key.txt

cat /opt/docker/secrets/age-key.txt | ssh terminal-user@10.0.0.20 \
  "mkdir -p /volume1/Backups/mempalace/secrets && cat > /volume1/Backups/mempalace/secrets/age-key.txt && chmod 600 /volume1/Backups/mempalace/secrets/age-key.txt"

# 6. Видалити старі backups (зашифровані старим ключем)
rm /opt/docker/backups/mempalace_*.tar.gz.age

# 7. Регенерувати свіжий backup з новим ключем
/opt/docker/scripts/mempalace-backup.sh

# 8. Перевірити restore drill
/opt/docker/scripts/mempalace-restore-test.sh

# 9. Оновити public key в git (infra/age-recipients.txt)
echo "age1<NEW_PUBLIC_KEY>" > infra/age-recipients.txt
git commit infra/age-recipients.txt -m "chore(infra): rotate age public key for mempalace backups"
```

### Відновлення ключа після re-provision VPS

```bash
# Варіант 1: з VPS backups/secrets (якщо диск цілий)
cat /opt/docker/backups/secrets/age-key.txt > /opt/docker/secrets/age-key.txt
chmod 600 /opt/docker/secrets/age-key.txt

# Варіант 2: з NAS offsite
ssh terminal-user@10.0.0.20 "cat /volume1/Backups/mempalace/secrets/age-key.txt" \
  > /opt/docker/secrets/age-key.txt
chmod 600 /opt/docker/secrets/age-key.txt

# Перевірити що ключ підходить
age --decrypt -i /opt/docker/secrets/age-key.txt /opt/docker/backups/mempalace_*.tar.gz.age | tar -tzf - | head -5
```

## NAS upload

Synology NAS не підтримує `scp` напряму — використовується `cat | ssh` pattern:

```bash
cat backup.tar.gz.age | ssh terminal-user@10.0.0.20 "cat > /volume1/Backups/mempalace/backup.tar.gz.age"
```

## Де дивитися логи

```bash
# Останні записи
tail -50 /opt/docker/backups/mempalace-backup.log

# Всі backup events
grep "backup started\|backup complete\|FAIL\|WARNING" /opt/docker/backups/mempalace-backup.log

# Backup files on-host
ls -lh /opt/docker/backups/mempalace_*.tar.gz*

# Backup files on NAS
ssh terminal-user@10.0.0.20 "ls -lh /volume1/Backups/mempalace/"
```

## Ручне відновлення (Manual Restore)

### 1. Знайти потрібний backup

```bash
# On-host (якщо ще в retention)
ls -lt /opt/docker/backups/mempalace_*.tar.gz.age | head -5

# NAS (якщо on-host вже очищено)
ssh terminal-user@10.0.0.20 "ls -lt /volume1/Backups/mempalace/ | head -5"
```

### 2. Завантажити з NAS (якщо потрібно)

```bash
# NAS → VPS (cat|ssh навпаки не потрібен, NAS читає через ssh нормально)
ssh terminal-user@10.0.0.20 "cat /volume1/Backups/mempalace/mempalace_YYYYMMDD_HHMMSS.tar.gz.age" \
  > /tmp/restore.tar.gz.age
```

### 3. Розшифрувати

```bash
# Потрібен приватний age ключ
age --decrypt -i /opt/docker/secrets/age-key.txt /tmp/restore.tar.gz.age > /tmp/restore.tar.gz
```

### 4. Перевірити вміст (без застосування)

```bash
tar -tzf /tmp/restore.tar.gz
```

### 5. Зупинити MemPalace (якщо запущено як сервіс)

```bash
cd /opt/docker && docker compose stop mempalace 2>/dev/null || true
# або якщо systemd:
# sudo systemctl stop mempalace
```

### 6. Відновити

```bash
# УВАГА: це перезапише поточний стан!
# Спочатку зробити snapshot поточного стану:
tar -czf /opt/docker/backups/mempalace_pre-restore_$(date +%Y%m%d_%H%M%S).tar.gz \
  -C /opt/docker/mempalace palace outbox

# Відновити:
tar -xzf /tmp/restore.tar.gz -C /opt/docker/mempalace
```

### 7. Запустити MemPalace

```bash
cd /opt/docker && docker compose up -d mempalace
# або: sudo systemctl start mempalace
```

### 8. Перевірити

```bash
# Health check (adjust endpoint per mp_t03 container setup)
curl -s http://localhost:<PORT>/health
```

## Restore Drill (автоматичний)

Restore drill запускається щопонеділка о 05:00 UTC. Він:
- Знаходить найновіший backup
- Розшифровує (потребує `/opt/docker/secrets/age-key.txt` — якщо відсутній, exit 2 fail-fast)
- Витягує архів у tmpdir
- Перевіряє наявність `palace/chroma.sqlite3`
- Рахує embeddings у ChromaDB (має бути > 100)
- **Не** застосовує до production
- Логує результат у `/opt/docker/backups/mempalace-backup.log`

Результат: `RESTORE OK: N embeddings` або `FAIL`.

**Примітка:** потребує `sqlite3` встановленого на VPS (встановлено 2026-04-11).

Щоб запустити вручну:

```bash
/opt/docker/scripts/mempalace-restore-test.sh
```

## Повне відновлення age приватного ключа

Якщо `/opt/docker/secrets/age-key.txt` відсутній на VPS (наприклад, після re-provision):

Дивись секцію **"Відновлення ключа після re-provision VPS"** в блоці Encryption вище.

Короткий варіант:
```bash
# З NAS
ssh terminal-user@10.0.0.20 "cat /volume1/Backups/mempalace/secrets/age-key.txt" \
  > /opt/docker/secrets/age-key.txt && chmod 600 /opt/docker/secrets/age-key.txt
```
