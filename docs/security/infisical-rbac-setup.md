# Infisical RBAC — обмеження delete для Machine Identities

## Контекст

Infisical v0.159.1 (self-hosted) на VPS. Два проекти:
- `owner-cloud` (ID: `306a6de6-ab9d-492c-9ce5-74503bb89aab`) — основний проект з усіма секретами
- `sh` (ID: `627acf9c-d1cb-4feb-b385-70b5ae9cae32`) — Shuleansky проект

Три Machine Identities:
| Identity | ID | Org Role | Project Role |
|----------|-----|----------|-------------|
| `infisical-agent-vps` | `6af6eeea-ef92-47f9-b3a9-577e105f42bc` | admin | **agent-readwrite** (обмежена) |
| `claude-mac` | `a77a7f7a-e92b-49cc-9597-2bd8d9ee3a2e` | no-access | member (Developer) |
| `claude-code` | `a8f366b7-7242-44a6-bc19-191714006905` | admin | admin |

## Впроваджена зміна (2026-04-19, ARCH-SF-07)

### Кастомна роль `agent-readwrite`

Створена в обох проектах через API:

```
POST /api/v2/workspace/{projectId}/roles
{
  "name": "agent-readwrite",
  "description": "Read, create, update — no delete",
  "slug": "agent-readwrite",
  "permissions": [
    {"action": "read",   "subject": "secrets"},
    {"action": "create", "subject": "secrets"},
    {"action": "edit",   "subject": "secrets"}
  ]
}
```

Дозволи: read + create + edit секретів. **Delete заборонено.**

### Призначення ролі

`infisical-agent-vps` понижено з `admin` → `agent-readwrite` в обох проектах:

```bash
PATCH /api/v2/workspace/{projectId}/identity-memberships/{identityId}
{"roles": [{"role": "agent-readwrite"}]}
```

### Тест результати

| Операція | Очікуваний результат | Фактичний результат |
|----------|---------------------|---------------------|
| Read `/infra` secrets | 200 OK | 200 OK, 4 секрети |
| Create `RBAC_TEST_DELETE_ME` в `/infra` | 200 OK | 200 OK, секрет створено |
| Delete `RBAC_TEST_DELETE_ME` | 403 Forbidden | **403: "You are not allowed to delete on secrets"** |

## Як відновити/перевірити через API

```bash
# 1. Отримати токен (infisical-agent-vps credentials)
TOKEN=$(curl -s -X POST http://127.0.0.1:8010/api/v1/auth/universal-auth/login \
  -H 'Content-Type: application/json' \
  -d '{"clientId": "afe4fc81-9bf6-4345-b949-fbdfeb747b43", "clientSecret": "..."}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')

# 2. Перевірити поточні ролі
curl -s "http://127.0.0.1:8010/api/v2/workspace/306a6de6-ab9d-492c-9ce5-74503bb89aab/identity-memberships" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Тест заборони delete
curl -s -X DELETE 'http://127.0.0.1:8010/api/v3/secrets/raw/TEST_KEY' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId": "306a6de6-ab9d-492c-9ce5-74503bb89aab", "environment": "prod", "secretPath": "/infra"}'
# Expected: {"statusCode": 403, "message": "You are not allowed to delete on secrets"}
```

## Якщо треба додати нову Machine Identity для агента

1. Відкрити https://secrets.example.com → Organization Settings → Machine Identities → Create
2. Type: Universal Auth, Name: `agent-<name>-vps`
3. Project Settings → Access Control → Machine Identities → Add → роль: **agent-readwrite** (НЕ admin, НЕ Developer)
4. Не давати org-level admin — тільки project-level `agent-readwrite`

## Чому НЕ `viewer` (read-only)?

`infisical-agent-vps` потребує `create`+`edit` щоб Infisical Agent міг оновлювати
template-rendered `.env` файли. Але `delete` — не потрібен для читання секретів.

## IDs для довідки

```
owner-cloud project:
  agent-readwrite role ID: 220c65c7-dbd8-4151-8071-028d0ceb3c9a
  membership ID (agent-vps): 5d179e09-ed8a-42b6-8f10-27637b256d26

sh project:
  agent-readwrite role ID: 7698a4d7-fab5-449d-a070-7c42abc5b952
  membership ID (agent-vps): 0e72bfd2-c3e7-4b12-b378-bf5d63b2e855
```
