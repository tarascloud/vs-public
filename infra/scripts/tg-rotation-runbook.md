# TG Bot Token Rotation Runbook

**Created:** 2026-05-07  
**Task:** DEV-20260507-0013  
**Context:** TG_BOT_TARASCLOUDBOT та TG_BOT_PD були plaintext у `/opt/docker/.env`, що підвантажувалось через cron `source /opt/docker/.env`. Це дозволяло будь-якому процесу прочитати токени через `/proc/<pid>/environ`.

## Стан після підготовки агента

Зроблено (агент):
- Перевірено: TG_BOT_TARASCLOUDBOT та TG_BOT_PD вже є у Infisical `/infra` path → генеруються в `/opt/docker/secrets/.infra.env`
- `send-tg-alert.sh` вже читає TELEGRAM_BOT_TOKEN з `.infra.env` — OK, не потребує змін
- `backup-restore-test.sh` оновлено: більше не отримує TG_BOT_PD через cron `source /opt/docker/.env`, а читає з `.infra.env` напряму
- Crontab рядки оновлені: `source /opt/docker/.env &&` видалено з `db-backup` та `backup-restore-test` джобів
- Runbook закомічений у `release-20260507` гілку vs-private

## Кроки для Owner (REQUIRED для завершення)

### Крок 1: Ротація TG_BOT_TARASCLOUDBOT

1. Відкрий Telegram → @BotFather
2. Напиши `/mybots` → вибери `@yourbot`
3. `API Token` → `Revoke current token`
4. Скопіюй новий токен
5. Оновити в Infisical:
   ```bash
   # З VPS або через UI secrets.example.com
   docker exec infisical infisical secrets set TG_BOT_TARASCLOUDBOT=<NEW_TOKEN> --env=prod --path=/infra
   ```
6. Перевір що infisical-agent оновив `.infra.env` (до 5 хвилин polling):
   ```bash
   ssh vps 'grep TG_BOT_TARASCLOUDBOT /opt/docker/secrets/.infra.env | cut -c1-40'
   ```

### Крок 2: Ротація TG_BOT_PD

1. @BotFather → `/mybots` → вибери PD bot
2. `API Token` → `Revoke current token`
3. Скопіюй новий токен
4. Оновити в Infisical:
   ```bash
   docker exec infisical infisical secrets set TG_BOT_PD=<NEW_TOKEN> --env=prod --path=/infra
   ```
5. Перевір:
   ```bash
   ssh vps 'grep TG_BOT_PD /opt/docker/secrets/.infra.env | cut -c1-40'
   ```

### Крок 3: Видалити старі токени з /opt/docker/.env

```bash
ssh vps 'cp /opt/docker/.env /opt/docker/.env.bak-before-tg-cleanup'
ssh vps 'sed -i "/^TG_BOT_TARASCLOUDBOT=/d; /^TG_BOT_PD=/d" /opt/docker/.env'
ssh vps 'grep TG_BOT /opt/docker/.env'  # має повернути порожньо
```

### Крок 4: Перевірка crontab (вже застосовано)

```bash
ssh vps 'crontab -l | grep -E "db-backup|backup-restore" '
# Має показати WITHOUT "source /opt/docker/.env"
```

### Крок 5: Test backup-restore-test.sh

```bash
ssh vps 'bash /opt/docker/scripts/backup-restore-test.sh'
# Має отримати Telegram алерт success
```

### Крок 6: Verification command задачі

```bash
ssh vps '! grep -E "^TG_BOT_(TARASCLOUDBOT|PD)=[0-9]" /opt/docker/.env'
# exit 0 = токени видалені з .env
```

## Що більше НЕ потрібно (вже виправлено)

- `db-backup.sh` не використовував TG токени взагалі — cron line очищено
- `backup-restore-test.sh` тепер читає TG_BOT_PD напряму з `.infra.env` замість `$TG_BOT_PD` env var

## Security notes

- `/opt/docker/.env` НЕ відстежується git (verify: `ssh vps 'cd /opt/docker && git status .env 2>/dev/null || echo not-tracked'`)
- Після ротації старі токени негайно інвалідуються BotFather
- Infisical agent оновлює `.infra.env` кожні 5 хвилин автоматично
