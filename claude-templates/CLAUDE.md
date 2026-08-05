# <Your workspace> — project instructions

> Template. Copy to the root of the repo you want agents to work in, then replace every
> `<placeholder>` and delete what you do not use. Claude Code loads this file automatically.

## General rules

- Language of communication: `<English / your language>`
- Merge to `main` and push only after the owner confirms
- Split parallel work across agents, **each in its own git worktree** — see
  `.claude/rules/parallel-agents.md`
- Coding principles: `.claude/rules/karpathy-coding.md`

## Task management (Vibe Studio)

- **UI:** `<https://vibe-studio.example.com>/studio` → Ideas, Board, Controls
- **API:** `<https://vibe-studio.example.com>/api/tasks`, `/api/initiatives`
- **Auth:** every request carries `x-internal-secret: $INTERNAL_API_SECRET`
- **Database:** PostgreSQL `vs` (`docker exec vs-pg psql -U vs -d vs`)

**Task workflow:**

1. An idea (Initiative) is created by the owner → status `PLANNING`
2. Tasks are created inside the initiative with an assignee (`AGENT` / `OWNER`) and dependencies
3. Before starting: `PUT /api/tasks/{id}` → `{ "status": "IN_PROGRESS" }`
4. When finished: `PUT /api/tasks/{id}` → `{ "status": "DONE" }`
5. If blocked: `PUT /api/tasks/{id}` → `{ "status": "BLOCKED" }`
6. Check dependencies: if anything in `blockedBy` is not `DONE`, do not start

**Acceptance criteria — enforced by the API:**

- New tasks must set `acceptanceCriteria` (markdown: what must be true for this to be done)
- `verificationCommand` — shell/SQL that exits 0 when the criteria are met, or `NULL` when
  runtime verification is impossible
- Closing a task requires `verificationStatus` of `PASS`, `NO_RUNTIME` (docs/decision) or
  `NO_GIT` (disk-only changes). `FAIL` and `SKIPPED` are rejected with 400
- Pass `verificationOutput` (≤4 KB of stdout+stderr) so the evidence is recorded

## Working directories

- **Local development:** `<~/code/your-workspace>`
- **Production host:** `<user@host:/opt/repos/your-workspace>` — `git pull` on every repo before work

## Projects

| Project | Path | URL | Description |
|---------|------|-----|-------------|
| `<name>` | `<path/>` | `<url>` | `<what it is>` |

## Agents

- Definitions: `.claude/agents/*.md` (the `subagent_type` used by the Agent tool)
- Roster: architect, developer, designer, coo, devsecops, tester, trader, smm, cat, ai, voice, trainer
- One prompt covers all projects; agents have full MCP access

## Security rules (all agents)

- **API routes:** every endpoint has an auth check. No exceptions. Public webhooks
  authenticate through a secret in a header
- **HTML rendering:** never `dangerouslySetInnerHTML` without `DOMPurify.sanitize()` —
  import from `@/lib/sanitize-html.ts`
- **Auth helpers:** use `requireOwner()` / `requireAuth()` from `@/lib/auth-helpers.ts`;
  do not copy the logic
- **CSP in Next.js:** never remove `'unsafe-inline'` from `script-src` without shipping
  nonce-based CSP in the same change — Next.js injects inline hydration scripts, and the
  page renders blank (HTTP 200, zero interactivity) without them
- **Secrets:** timing-safe comparison (`crypto.timingSafeEqual`), secrets in headers, never
  in query parameters

## Branches and deployment

- Never work directly on `main` — always `release-YYYY-MM-DD`
- Flow: `git pull origin main` → `git checkout -b release-YYYY-MM-DD main` → work → tests → prod
- Database backup before every production deploy
- Build on the target architecture, not on your laptop, if they differ

## Voice commands

Short phrases the owner uses to trigger a whole workflow. Define your own; these are examples:

- **"wrap up"** — check uncommitted changes → commit → merge branches into `main` → push all
  repos → sync shared files between hosts
- **"go"** — execute all TODO tasks from the Studio API with parallel agents, in waves
- **"status"** — short status report: tasks in progress, done, next
- **"review"** — full multi-agent review of every project, creating an initiative and tasks
  from the findings
