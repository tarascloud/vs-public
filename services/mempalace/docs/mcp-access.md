# MemPalace MCP Access

Документація по підключенню до MemPalace MCP сервера з різних контекстів.

## Mac → VPS (SSH forced-command)

Mac Claude Code підключається через SSH tunnel з окремим ключем `mempalace-mac-key`.
Forced-command на VPS обмежує виконання до єдиної команди — mempalace MCP stdio.

### Налаштування SSH ключа на Mac

```bash
# Скопіювати private key з VPS (одноразово, при налаштуванні)
scp vps:/opt/docker/secrets/mempalace-mac-key ~/.ssh/mempalace-mac-key
chmod 600 ~/.ssh/mempalace-mac-key

# Перевірити підключення
ssh -i ~/.ssh/mempalace-mac-key owner@100.64.0.10 'echo SSH_OK'
```

### .mcp.json для Mac Claude Code

Додати в `~/.claude/mcp.json` або `.mcp.json` в проекті:

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "ssh",
      "args": [
        "vps-mempalace",
        "docker exec -i -e HOME=/home/mempalace/.cache mempalace python -m mempalace.mcp_server --palace /data/palace"
      ],
      "env": {}
    }
  }
}
```

SSH config (`~/.ssh/config`) на Mac:
```
Host vps-mempalace
  HostName 100.64.0.10
  User owner
  IdentityFile ~/.ssh/mempalace-mac-key
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
```

Детальна інструкція: [install-mac.md](./install-mac.md)

### VPS local (~/.claude/mcp.json на VPS)

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "docker",
      "args": ["exec", "-i", "-e", "HOME=/home/mempalace/.cache", "mempalace", "python", "-m", "mempalace.mcp_server", "--palace", "/data/palace"],
      "env": {}
    }
  }
}
```

Файл: `/home/owner/.claude/mcp.json`

### Як це працює

```
Mac Claude Code
    │
    │  SSH (ed25519 key: ~/.ssh/mempalace-mac-key)
    │  Tailscale: owner@100.64.0.10 (Host: vps-mempalace)
    ▼
authorized_keys forced-command=/opt/docker/scripts/mempalace-runner.sh
    │
    │  forced-command whitelist (literal match only)
    ▼
/opt/docker/scripts/mempalace-runner.sh
    │
    │  exec: docker exec -i -e HOME=/home/mempalace/.cache mempalace
    │         python -m mempalace.mcp_server --palace /data/palace
    ▼
mempalace container → MCP stdio → Mac Claude Code
```

**Palace path:** `/data/palace` (bind mount: `/opt/docker/mempalace/palace` on host)
**WAL dir:** `/home/mempalace/.cache/.mempalace/wal/` (home is read-only, .cache is writable)

Клієнт не може запустити довільну команду — runner ігнорує будь-який
`SSH_ORIGINAL_COMMAND` крім точно вказаного whitelist.

---

## VPS local (FastAPI sidecar 127.0.0.1:8031)

Для PD, JF, pd-scheduler та інших сервісів на VPS використовується
HTTP ingest sidecar (mp_t03). Він слухає тільки на localhost.

### Health check

```bash
curl http://127.0.0.1:8031/health
```

### Ingest пам'яті (з bearer token)

```bash
# Отримати токен з .mempalace.env
source /opt/docker/secrets/.mempalace.env

# POST conversation
curl -X POST http://127.0.0.1:8031/ingest/convo \
  -H "Authorization: Bearer $MEMPALACE_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wing": "pd",
    "room": "ai-chat",
    "content": "User asked about ...",
    "source": "pd-prod"
  }'

# POST decision
curl -X POST http://127.0.0.1:8031/ingest/decision \
  -H "Authorization: Bearer $MEMPALACE_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wing": "vs",
    "room": "architecture",
    "content": "Decided to use FastAPI for ingest sidecar",
    "source": "pd-scheduler"
  }'
```

### Whitelist endpoints

| Method | Path | Опис |
|--------|------|------|
| GET | /health | Health check (без auth) |
| POST | /ingest/convo | Ingest розмови |
| POST | /ingest/decision | Ingest рішення |
| POST | /ingest/transcript | Ingest транскрипту |

Ендпоінт `/search` навмисно відсутній — пошук тільки через MCP від Claude Code.

---

## Авторизація

### SSH ключ (Mac → VPS)

- **Private key:** `~/.ssh/mempalace-mac-key` (тільки на Mac, НЕ в git)
- **Public key:** `/opt/docker/secrets/mempalace-mac-key.pub` + `services/mempalace/keys/mempalace-mac-key.pub`
- **Ротація:** кожні 90 днів (нагадування в vibe-studio.example.com)
- **Revoke:** видалити рядок з `/home/owner/.ssh/authorized_keys` на VPS

### Bearer token (FastAPI sidecar)

- **Зберігається в:** Infisical `/mempalace` → key `MEMPALACE_BEARER_TOKEN`
- **Генерується як:** `openssl rand -hex 32`
- **Пишеться в:** `/opt/docker/secrets/.mempalace.env` через Infisical Agent
- **Comparison:** timing-safe (`hmac.compare_digest` в Python)
- **Ротація:** через Infisical UI, після чого Infisical Agent оновлює `.mempalace.env` і restart sidecar

---

## Troubleshooting

### Mac не може підключитись до VPS

```bash
# Перевірити Tailscale
tailscale status | grep 100.64.0.10

# Перевірити SSH з verbose
ssh -v -i ~/.ssh/mempalace-mac-key owner@100.64.0.10 'echo SSH_OK'

# Перевірити runner script на VPS
cat /opt/docker/scripts/mempalace-runner.sh
```

### MCP сервер не відповідає

```bash
# Перевірити контейнер mempalace на VPS
ssh vps 'docker ps --filter name=mempalace'

# Перевірити логи
ssh vps 'docker logs --tail 50 mempalace'

# Тест runner вручну
ssh vps 'SSH_ORIGINAL_COMMAND="echo SSH_OK" /opt/docker/scripts/mempalace-runner.sh'
```

### Bearer token відхиляється (401)

```bash
# Перевірити що .mempalace.env існує і свіжий
ssh vps 'ls -la /opt/docker/secrets/.mempalace.env && head -1 /opt/docker/secrets/.mempalace.env'

# Перевірити Infisical agent
ssh vps 'docker logs --tail 20 infisical-agent 2>/dev/null || echo "infisical-agent not running"'

# Перезапустити sidecar якщо потрібно
ssh vps 'docker restart mempalace'
```

### authorized_keys пошкоджений

```bash
# Перевірити кількість рядків (має бути 4)
ssh vps 'wc -l /home/owner/.ssh/authorized_keys'

# Переглянути вміст
ssh vps 'cat /home/owner/.ssh/authorized_keys'
```
