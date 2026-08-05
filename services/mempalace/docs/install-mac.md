# MemPalace — Встановлення на Mac (Claude Code)

Крок за кроком для підключення Mac Claude Code до MemPalace на VPS через SSH.

## Передумови

- Tailscale запущений на Mac (vps доступний через Tailscale)
- VPS Tailscale IP: `100.64.0.10`
- SSH ключ `mempalace-mac-key` вже згенерований на VPS (mp_t04)

---

## Крок 1. Скопіювати private key на Mac

```bash
scp vps:/opt/docker/secrets/mempalace-mac-key ~/.ssh/mempalace-mac-key
chmod 600 ~/.ssh/mempalace-mac-key
```

---

## Крок 2. SSH config

Додати в `~/.ssh/config`:

```
Host vps-mempalace
  HostName 100.64.0.10
  User owner
  IdentityFile ~/.ssh/mempalace-mac-key
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
```

---

## Крок 3. Перевірити SSH runner

```bash
ssh vps-mempalace 'echo SSH_OK'
```

Має повернути: `SSH_OK`

Якщо повернуло `DENIED: interactive sessions not permitted` — runner спрацьовує, але без команди. Переконайтесь що передаєте команду як аргумент, не як інтерактивну сесію.

---

## Крок 4. Налаштувати ~/.claude/mcp.json на Mac

Якщо файл не існує — створити. Якщо є інші MCP servers — додати тільки блок `mempalace` в існуючий `mcpServers`.

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

**Важливо:** SSH runner на VPS дозволяє тільки точно цю команду (literal whitelist). Не змінюй args без оновлення `/opt/docker/scripts/mempalace-runner.sh` на VPS.

---

## Крок 5. Перезапустити Claude Code

Закрити і відкрити Claude Code (або `claude` в terminal). MCP servers ініціалізуються при старті.

---

## Крок 6. Перевірити підключення

В Claude Code:
```
/mcp
```

Має показати `mempalace` зі статусом `connected`.

---

## Крок 7. Тест пошуку

Попросити Claude:
```
search mempalace for "Garmin 429"
```

або:
```
mempalace_search query="Garmin 429"
```

---

## Troubleshooting

### SSH: connection refused або timeout

```bash
# Перевірити Tailscale
tailscale status | grep vps

# Перевірити SSH з verbose
ssh -v vps-mempalace 'echo SSH_OK'
```

### DENIED: command not whitelisted

Команда яку надсилає Claude Code не збігається з whitelistом runner'а.

Перевірити поточний whitelist на VPS:
```bash
ssh vps 'grep MCP_STDIO_CMD /opt/docker/scripts/mempalace-runner.sh'
```

Команда в `args` mcp.json має точно збігатись з `MCP_STDIO_CMD` у runner'і.

### MCP сервер не відповідає (timeout)

```bash
# Перевірити контейнер
ssh vps 'docker ps --filter name=mempalace'

# Тест прямо
ssh vps 'timeout 3 docker exec -i -e HOME=/home/mempalace/.cache mempalace python -m mempalace.mcp_server --palace /data/palace 2>/dev/null || echo "failed"'
```

### Permission denied (key)

```bash
ls -la ~/.ssh/mempalace-mac-key
# Має бути: -rw------- (600)
chmod 600 ~/.ssh/mempalace-mac-key
```

---

## Архітектура

```
Mac Claude Code
    │
    │  ssh vps-mempalace "docker exec -i -e HOME=... mempalace python -m mempalace.mcp_server --palace /data/palace"
    │  Tailscale: owner@100.64.0.10
    ▼
authorized_keys forced-command=/opt/docker/scripts/mempalace-runner.sh
    │
    │  literal whitelist match
    ▼
mempalace-runner.sh → docker exec mempalace
    │
    ▼
/data/palace (bind mount: /opt/docker/mempalace/palace)
    │
    ▼
MCP stdio → Mac Claude Code
```

---

## Примітки

- Private key НЕ зберігається в git (тільки public key в `services/mempalace/keys/`)
- WAL log пишеться в `/home/mempalace/.cache/.mempalace/wal/` (writable bind mount)
- Palace data: `/opt/docker/mempalace/palace/` на VPS host
- Ротація ключа: кожні 90 днів через `ssh-keygen -t ed25519` + оновити authorized_keys

---

## Alternative: Direct HTTP/SSE access via Tailscale (без SSH)

Якщо Mac знаходиться в тій же Tailscale мережі що і VPS, можна підключитись напряму через HTTP/SSE без SSH forwarding.

### Передумови

- Tailscale запущений на Mac (`tailscale status | grep vps` → 100.64.0.10)
- Токен з Infisical: `secrets.example.com` → проект `mempalace` → `MEMPALACE_BEARER_TOKEN`
- Порт 8032 відкритий на VPS (UFW allow від 100.64.0.0/10)

### Конфігурація ~/.claude/mcp.json на Mac

```json
{
  "mcpServers": {
    "mempalace": {
      "type": "sse",
      "url": "http://100.64.0.10:8032/sse",
      "headers": {
        "Authorization": "Bearer <MEMPALACE_BEARER_TOKEN>"
      }
    }
  }
}
```

Замінити `<MEMPALACE_BEARER_TOKEN>` на реальний токен з Infisical.

### Отримати токен з Infisical

```bash
# Відкрити secrets.example.com в браузері
# Проект: mempalace
# Ключ: MEMPALACE_BEARER_TOKEN
```

Або через CLI якщо встановлено infisical:
```bash
infisical secrets get MEMPALACE_BEARER_TOKEN --projectId <id> --env prod
```

### Верифікація підключення

```bash
# Перевірити доступність без токена (має повернути 401)
curl -s -o /dev/null -w '%{http_code}' http://100.64.0.10:8032/status

# Перевірити з токеном (має повернути 200 + JSON)
curl -s -H "Authorization: Bearer <TOKEN>" http://100.64.0.10:8032/status
```

### Troubleshooting

**Connection refused:**
```bash
# Перевірити Tailscale
tailscale status | grep 100.64.0.10

# Перевірити що контейнер запущений
ssh vps 'docker ps --filter name=mempalace-sse'

# Перевірити UFW
ssh vps 'sudo ufw status | grep 8032'
```

**401 Unauthorized:**
- Перевірити що токен скопійований повністю без пробілів
- Токен: `MEMPALACE_BEARER_TOKEN` в Infisical (проект mempalace)

**SSE stream не відкривається (timeout):**
```bash
# Тест SSE stream з токеном
curl -sv -H "Authorization: Bearer <TOKEN>" http://100.64.0.10:8032/sse --max-time 5
# Має повернути HTTP 200 з content-type: text/event-stream
```

### Архітектура SSE bridge

```
Mac Claude Code
    │
    │  HTTP SSE — http://100.64.0.10:8032/sse
    │  Tailscale encrypted tunnel
    ▼
VPS 0.0.0.0:8032 (UFW: allow LAN + Tailscale only)
    │
    ▼
mempalace-sse container: sse_auth_proxy.py
    │  Bearer token check (hmac.compare_digest)
    │  → 401 if invalid
    │  → proxy to mcp-proxy if valid
    ▼
mcp-proxy 127.0.0.1:8033 (internal, not exposed)
    │  stdio→SSE bridge
    ▼
mempalace.mcp_server (stdio)
    │
    ▼
/data/palace (bind-mount: /opt/docker/mempalace/palace)
```

**Security notes:**
- Порт 8032 НЕ доступний через Cloudflare Tunnel (немає ingress rule)
- UFW default deny — тільки explicit allow для LAN (10.0.0.0/24) і Tailscale (100.64.0.0/10)
- Bearer token перевіряється через `hmac.compare_digest` (timing-safe)
- Контейнер hardened: `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit: 128`
