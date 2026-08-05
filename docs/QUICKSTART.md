# Quickstart

From an empty machine to a working Studio whose API an agent can drive. Every command here was
run against this repository; where something is easy to get wrong, the reason is spelled out.

- [1. Prerequisites](#1-prerequisites)
- [2. Clone and configure](#2-clone-and-configure)
- [3. Start PostgreSQL and Redis](#3-start-postgresql-and-redis)
- [4. Create the schema and run the app](#4-create-the-schema-and-run-the-app)
- [5. Become the owner](#5-become-the-owner)
- [6. Seed agents and a project](#6-seed-agents-and-a-project)
- [7. Drive the API the way an agent does](#7-drive-the-api-the-way-an-agent-does)
- [8. Point Claude Code at it](#8-point-claude-code-at-it)
- [9. Parallel agents, safely](#9-parallel-agents-safely)
- [10. Run the whole stack in Docker](#10-run-the-whole-stack-in-docker)
- [11. MemPalace (optional)](#11-mempalace-optional)
- [12. Telegram bot (optional)](#12-telegram-bot-optional)
- [Troubleshooting](#troubleshooting)

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 22+ | `node -v`. Next.js 16 will not build on older majors |
| Docker + Compose | For PostgreSQL/Redis/MemPalace; the app itself can run with `npm run dev` |
| PostgreSQL 16 | The bundled `pg` service uses `pgvector/pgvector:pg16`; plain Postgres 16 is fine unless you want MemPalace, which needs the `pgvector` extension |
| A Google or GitHub OAuth app | Sign-in is OAuth-only — there is no password login |
| [Claude Code](https://claude.com/claude-code) | For the agent side |

## 2. Clone and configure

```bash
git clone git@github.com:tarascloud/vs-public.git vibe-studio
cd vibe-studio
cp .env.example .env
```

Generate the secrets:

```bash
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -hex 32      # → INTERNAL_API_SECRET
openssl rand -hex 32      # → SEED_SECRET
```

What they do:

- `INTERNAL_API_SECRET` — sent by agents as the `x-internal-secret` header. Routes that accept
  it skip the session check entirely, so anything holding this secret can read and write every
  task. Treat it as a root password.
- `SEED_SECRET` — a second secret required by the two seed endpoints, **on top of** an
  authenticated OWNER session. If it is empty those endpoints answer `403` to everyone.
- `AUTH_SECRET` / `NEXTAUTH_SECRET` — NextAuth session encryption. Changing them invalidates
  every existing session.

OAuth redirect URIs to register for local development:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/github
```

Leave `DATABASE_URL` pointing at `localhost:5432` for now — it changes to `pg:5432` only when
the app itself runs inside Compose (step 10).

**Two consumers, one file.** Compose reads `.env` at the repository root; Next.js and the Prisma
CLI read `.env` from `app/`, because that is their working directory. Link them so there is only
ever one file to edit:

```bash
ln -s ../.env app/.env
```

Without this, `npx prisma db push` stops with
`Error: The datasource.url property is required in your Prisma config file`, and `npm run dev`
starts with no OAuth credentials.

## 3. Start PostgreSQL and Redis

```bash
docker compose up -d pg redis
docker compose ps            # both should report (healthy) within ~10s
```

Redis is optional in development — rate limiting falls back to in-memory when it is
unreachable — but the compose file starts it alongside Postgres anyway.

## 4. Create the schema and run the app

```bash
cd app
npm ci
npx prisma generate
npx prisma db push          # NOT `migrate deploy` — see the note below
npm run dev
```

Open <http://localhost:3000/studio> and sign in.

Expected output: `prisma generate` prints `Generated Prisma Client (7.x) to ./src/generated/prisma`,
and `db push` reports `Your database is now in sync with your Prisma schema`. Verify the tables
exist:

```bash
docker exec -i vs-pg psql -U vs -d vs -c "\dt" | head    # Account, Agent, Initiative, Task, …
curl -s http://localhost:3000/api/health                 # {"status":"ok","timestamp":"…"}
```

> `npm run start` does **not** work here: `next.config.ts` sets `output: "standalone"`, so a
> production run is `node .next/standalone/server.js` (which is what the Docker image does), or
> just use `npm run dev` locally.

> **Why `db push` and not `migrate deploy`.**
> `app/prisma/migrations/` contains the incremental migrations of the author's long-running
> deployment; there is no baseline migration that creates the tables from nothing. Against an
> empty database `migrate deploy` fails on the first `ALTER TABLE "Agent"`. `prisma db push`
> builds the current schema straight from `schema.prisma`, which is the right path for a fresh
> install. Start your own migration history afterwards with
> `npx prisma migrate dev --create-only`.

## 5. Become the owner

Every new account is created with the role `CLIENT`, and `OWNER_EMAIL` does **not** grant the
role — it is only used by internal workflow routes to resolve your user id. Sign in once so the
row exists, then promote yourself:

```bash
docker exec -i vs-pg psql -U vs -d vs \
  -c "UPDATE \"User\" SET role='OWNER' WHERE email='you@example.com';"
```

Expected output: `UPDATE 1`. Sign out and back in — the role is baked into the session, so an
old session still behaves like a `CLIENT`. After re-login the Studio tabs (Ideas, Board, Office,
Controls) appear.

## 6. Seed agents and a project

The roster is built from the markdown files in `agents/`: `/api/agents/seed` parses each file's
YAML frontmatter and upserts an `Agent` row.

Both seed endpoints require an OWNER **session cookie** *and* the `x-seed-secret` header, so a
plain `curl` cannot satisfy them. Use the browser console while signed in as OWNER on
<http://localhost:3000>:

```js
// DevTools → Console
await fetch("/api/agents/seed",   { method: "POST", headers: { "x-seed-secret": "<SEED_SECRET>" } }).then(r => r.json())
await fetch("/api/projects/seed", { method: "POST", headers: { "x-seed-secret": "<SEED_SECRET>" } }).then(r => r.json())
```

`/api/agents/seed` returns one `{ name, status: "created" | "updated" }` entry per prompt file.

Two things to know:

- The **Seed** button on `/admin/agents` does not send the `x-seed-secret` header, so it
  currently returns `403`. Use the console call above.
- `/api/projects/seed` inserts the author's example projects. Edit
  `app/src/app/api/projects/seed/route.ts` first if you would rather seed your own, or skip it
  and create projects in the UI.

## 7. Drive the API the way an agent does

Agents authenticate with the `x-internal-secret` header — no browser session involved:

```bash
export VS=http://localhost:3000
export SECRET=<INTERNAL_API_SECRET>
```

**A task must belong to an initiative, and an agent task must name an agent by id.** Both are
required by the schema, so create things in order:

```bash
# 1. your user id and the agent id (/api/agents itself needs an OWNER session, so read the DB)
docker exec -i vs-pg psql -U vs -d vs -t -A \
  -c "SELECT id FROM \"User\" WHERE email='you@example.com';"
docker exec -i vs-pg psql -U vs -d vs -t -A \
  -c "SELECT id, name FROM \"Agent\" WHERE name='developer';"

# 2. a project id (from the seed above, or created in the UI)
docker exec -i vs-pg psql -U vs -d vs -t -A -c "SELECT id, slug FROM \"Project\";"

# 3. an initiative — internal calls must pass userId in the body
curl -sX POST "$VS/api/initiatives" \
  -H "x-internal-secret: $SECRET" -H "content-type: application/json" \
  -d '{"userId":"<USER_ID>","projectId":"<PROJECT_ID>","rawIdea":"Smoke test the task pipeline"}'

# 4. a task inside it
curl -sX POST "$VS/api/tasks" \
  -H "x-internal-secret: $SECRET" -H "content-type: application/json" \
  -d '{"title":"Smoke test",
       "initiativeId":"<INITIATIVE_ID>",
       "agentId":"<AGENT_ID>",
       "assigneeType":"AGENT",
       "type":"CHORE",
       "acceptanceCriteria":"README.md exists at the repo root",
       "verificationCommand":"test -f README.md"}'
```

The response carries a generated `ticketId` such as `DEV-20260805-0001`.

What the agent then does:

```bash
# what is assigned to me
curl -s "$VS/api/tasks?assigneeType=AGENT&agentName=developer&status=TODO" \
  -H "x-internal-secret: $SECRET"

# claim it
curl -sX PUT "$VS/api/tasks/<TASK_ID>" \
  -H "x-internal-secret: $SECRET" -H "content-type: application/json" \
  -d '{"status":"IN_PROGRESS"}'

# finish it — run the verification command first, then report what happened
curl -sX PUT "$VS/api/tasks/<TASK_ID>" \
  -H "x-internal-secret: $SECRET" -H "content-type: application/json" \
  -d '{"status":"DONE",
       "completionNote":"Checked the file exists",
       "verificationStatus":"PASS",
       "verificationOutput":"$ test -f README.md → exit 0"}'
```

**Closing a task is guarded** (`app/src/lib/task-validation.ts`):

| Requirement | Applies when |
|-------------|--------------|
| `completionNote` non-empty | always, on the transition to `DONE` |
| `verificationStatus` ∈ `PASS`, `NO_RUNTIME`, `NO_GIT` | the task has `acceptanceCriteria` |
| `FAIL` and `SKIPPED` rejected with `400` | always |

`NO_RUNTIME` is for work with nothing to execute (a document, a decision); `NO_GIT` for changes
on disk outside version control. Everything else has to actually run its `verificationCommand`.

Writes are rate limited: 10 task creations and 20 task updates per minute, 5 initiatives per
minute. Exceeding a limit returns `429`.

## 8. Point Claude Code at it

In the repository you want the agents to work on:

```bash
mkdir -p .claude/agents .claude/rules
cp /path/to/vibe-studio/agents/*.md                  .claude/agents/
cp /path/to/vibe-studio/claude-templates/rules/*.md  .claude/rules/
cp /path/to/vibe-studio/claude-templates/CLAUDE.md   ./CLAUDE.md
```

Then edit `CLAUDE.md` and replace the placeholders — the Studio URL
(`https://vibe-studio.example.com`), the project table, the working directories. Agents read that
file to learn where the task API lives; skip this and they will call a domain that is not yours.

Each `agents/<name>.md` opens with the frontmatter Claude Code uses to register the subagent:

```yaml
---
name: developer
description: "..."
subagent_type: developer
model: opus
tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---
```

The prompt bodies are written in Ukrainian and reference the endpoints above. Translate or
rewrite them freely — they are prompts, not code.

## 9. Parallel agents, safely

Never point two agents at one working tree: `git checkout` is global state, so they commit onto
each other's branches and stash each other's work.

```bash
./scripts/spawn-parallel-agents.sh --tickets "TASK-1:developer,TASK-2:devsecops"
```

It prints one line per ticket:

```
WORKTREE=/tmp/agent-TASK-1-12345 BRANCH=release-...-task-1 TICKET=TASK-1 AGENT=developer
```

Pass each `WORKTREE` path into that agent's prompt as its working directory. Rules and teardown:
`claude-templates/rules/parallel-agents.md`.

## 10. Run the whole stack in Docker

```bash
# DATABASE_URL must now use the compose service name
sed -i '' 's|@localhost:5432|@pg:5432|' .env      # Linux: sed -i 's|...|...|'
docker compose up -d --build studio
curl -s http://localhost:8020/api/health          # {"status":"ok","timestamp":"..."}
```

Notes that save time:

- The image builds from the **repository root**, not `app/` — the Dockerfile copies both
  `packages/` and `app/`. The compose file already sets `context: .`.
- The container does **not** run migrations on start. Apply schema changes yourself
  (`npx prisma db push`, or `migrate deploy` once you own a migration history) before restarting.
- `agents/` is bind-mounted read-only at `/agents`, so editing a prompt on the host takes effect
  on the next seed/sync call without a rebuild.

## 11. MemPalace (optional)

Long-term semantic memory that outlives context windows. It needs its own database with
`pgvector`, plus an embedding model — the `memory` profile starts Ollama for that.

**Order matters here.** The DDL has to exist before anything writes, and the bootstrap script
seeds rows into tables it does not create.

```bash
# 1. database + extensions
docker exec vs-pg psql -U vs -d postgres -c "CREATE DATABASE mempalace;"
docker exec -i vs-pg psql -U vs -d mempalace -f - < services/mempalace/pg/schema.sql

# 2. embeddings (~275 MB model, one-off)
docker compose --profile memory up -d ollama
docker compose --profile memory exec ollama ollama pull nomic-embed-text

# 3. the service itself
docker compose --profile memory up -d --build mempalace
curl -s http://localhost:8031/health
# {"status":"ok","storage":"postgres+pgvector","scrubber":true,...}

# 4. seed the wings and rooms
docker exec -e DATABASE_URL="postgresql://vs:<PG_PASSWORD>@pg:5432/mempalace" \
  mempalace python /app/init_palace.py --palace /data/palace
docker exec -i vs-pg psql -U vs -d mempalace \
  -c "SELECT count(*) FROM wings;"      # non-zero
```

Three traps in that sequence, all of them things that fail quietly:

- **`init_palace.sh` does not work against this container.** It `docker cp`s the script in, and
  the rootfs is read-only; the compose file mounts `init_palace.py` at `/app/init_palace.py`
  instead, which is what the command above runs.
- **`init_palace.py` reads `DATABASE_URL`, not `MEMPALACE_DB_URL`** — and `.env` points
  `DATABASE_URL` at the *Studio* database. Without the explicit override above you seed the
  wrong database.
- **If the tables are missing it logs `PostgreSQL seeding failed … continuing with
  filesystem-only initialization` and still exits 0**, printing a wing/room summary that only
  describes directories. Always confirm with the `SELECT count(*)` above.

Smoke-test the round trip (the same bearer token guards ingest and search):

```bash
TOKEN=<MEMPALACE_INGEST_TOKEN>
curl -sX POST http://localhost:8031/ingest/decision \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"wing":"wing_vs","room":"room_decisions","title":"Licensing",
       "content":"Vibe Studio ships under AGPL-3.0.",
       "timestamp":"2026-01-01T00:00:00Z","source":"smoke"}'
# {"accepted":true,"wing":"wing_vs","room":"room_decisions","chunks":1}

curl -sX POST http://localhost:8031/search \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"query":"what license does the studio use","top_k":3}'
```

Wing and room names are the **full identifiers** (`wing_vs`, `room_decisions`); short forms fail
the foreign key. The default taxonomy in `init_palace.py` mirrors the author's projects — edit
`WINGS` there to describe yours before seeding.

Wire it into Claude Code as an MCP server. Use the local fork — the upstream
`mempalace.mcp_server` module in the image still talks to ChromaDB, while this one reads the
same Postgres tables ingestion writes to:

```json
{
  "mcpServers": {
    "mempalace": {
      "command": "docker",
      "args": ["exec", "-i", "mempalace", "python", "/app/local_mcp_server.py",
               "--palace", "/data/palace"]
    }
  }
}
```

Retrieval is hybrid — pgvector cosine similarity fused with PostgreSQL full-text ranking through
Reciprocal Rank Fusion, then re-scored by a cross-encoder. Nightly ingestion of Claude Code
sessions, task history and agent wikis lives in `services/mempalace/ingest/nightly.sh`; run it
from cron. Architecture and evaluation methodology: `services/mempalace/docs/` and
`docs/adr/mempalace*.md`.

The ingesters are written against the author's data sources (Claude Code JSONL sessions, a
Telegram bot, this Studio's database), so expect to adapt `services/mempalace/ingest/` to yours.

## 12. Telegram bot (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather); put the token in `TG_BOT_TOKEN` and
   the username in `TG_BOT_USERNAME`.
2. Set `TELEGRAM_WEBHOOK_SECRET`, and `TG_CHAT_OWNER` to your numeric chat id (message the bot,
   then read `chat.id` from `https://api.telegram.org/bot<TOKEN>/getUpdates`).
3. Signed in as OWNER, call `POST /api/telegram/setup` from the browser console.

Telegram only delivers webhooks over public HTTPS, so a local instance needs a tunnel
(Cloudflare Tunnel, ngrok, tailscale funnel) in front of it.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `403 Forbidden` on every agent call | `x-internal-secret` missing, or `INTERNAL_API_SECRET` unset in the app's environment — an unset secret makes the check fail closed |
| `403 Invalid seed secret` | `SEED_SECRET` unset, or you used the `/admin/agents` button instead of the console `fetch` with the header |
| `400 {"initiativeId":["initiativeId is required"]}` | Tasks cannot be orphans — create an initiative first (step 7) |
| `400 agentId is required when assigneeType is AGENT` | Pass the agent's UUID; `agentName` is a query filter only |
| `migrate deploy` fails: `relation "Agent" does not exist` | Use `npx prisma db push` on a fresh database (step 4) |
| Studio tabs missing after sign-in | Role is still `CLIENT`, or you did not sign out and back in after the `UPDATE` |
| `PrismaClientInitializationError: Can't reach database server` | Inside Compose the host is `pg`, not `localhost` |
| Blank page, console full of CSP errors | Something removed `'unsafe-inline'` from `script-src` without adding nonces — Next.js needs inline bootstrap scripts |
| Office tab renders an empty grid | The tileset art is not redistributable and is not in this repo — see the note in `README.md` |
| `429 Too Many Requests` | Write rate limits (step 7); wait out the minute window |
| `Error: The datasource.url property is required in your Prisma config file` | The Prisma CLI reads `app/.env`, not the root one — create the symlink from step 2 |
| `npm run start` warns `"next start" does not work with "output: standalone"` | Use `npm run dev`, or `node .next/standalone/server.js` |
| `P1013: invalid port number in database URL` | A mangled `DATABASE_URL` — the `@` before the host is missing or was eaten by shell interpolation |
