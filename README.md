# Vibe Studio

**An AI dev team you run yourself.** Vibe Studio is a self-hosted workspace where you
describe an idea, it becomes a set of verifiable tasks, and Claude Code agents pick those
tasks up, do the work in isolated git worktrees, and report back — with acceptance criteria
that must actually pass before anything is marked done.

It is the open-source release of the system its author uses daily to run several production
projects. Personal hosts, credentials and private knowledge are stripped; the mechanics are not.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

---

## What you get

| Piece | What it does |
|-------|--------------|
| **Studio** (`app/`) | Next.js 16 + Prisma app: initiatives → tasks → Kanban board, agent roster, client portal, Telegram inbox, activity feed, pixel-art office view |
| **Agents** (`agents/`) | 13 ready-made Claude Code subagent prompts — architect, developer, designer, devsecops, tester, COO, QA, SMM, chaos engineer and more |
| **MemPalace** (`services/mempalace/`) | Long-term semantic memory: PostgreSQL + pgvector with local Ollama embeddings, hybrid dense/lexical retrieval fused by RRF, a cross-encoder reranker, an MCP server, and nightly ingesters that feed it your own sessions |
| **Claude templates** (`claude-templates/`) | `CLAUDE.md` and `.claude/rules/*` starting points: parallel-agent worktree discipline, deploy smoke checks, security rules, coding principles |
| **Infra** (`infra/`) | Deploy, backup, restore-drill and monitoring scripts; secret management via Infisical; systemd units and logrotate configs |
| **Packages** (`packages/`) | Shared design tokens, UI components, Tailwind preset and security helpers |

## Why it exists

Agentic coding falls over in predictable ways: agents forget what was decided last month,
several agents editing one working tree produce git chaos, and "done" gets claimed for work
that was never verified. Vibe Studio answers each one directly:

- **Task contracts.** Every task carries `acceptanceCriteria` and a `verificationCommand`
  (a shell or SQL command that exits 0 when the work is genuinely complete). The API rejects
  a `DONE` status without a valid verification status — see `docs/api-auth.md`.
- **Worktree isolation.** `scripts/spawn-parallel-agents.sh` gives every parallel agent its
  own git worktree and branch. No shared checkouts, no stash races.
- **Persistent memory.** MemPalace ingests your Claude Code sessions, decisions and task
  history each night, so an agent starting today can retrieve why a decision was made in March.
- **Agent wikis.** A convention (`docs/agent-wiki-convention.md`) for the knowledge each agent
  accumulates about your codebase, versioned in git rather than trapped in a context window.

## Quickstart

Requirements: Docker, Node 22+, PostgreSQL 16 (with `pgvector` if you want MemPalace), Redis.

```bash
git clone git@github.com:tarascloud/vs-public.git vibe-studio
cd vibe-studio
cp .env.example .env          # generate the secrets it asks for
ln -s ../.env app/.env        # Compose reads the root file, Next/Prisma read app/
docker compose up -d pg redis

cd app
npm ci
npx prisma generate
npx prisma db push            # fresh database — see QUICKSTART for why not `migrate deploy`
npm run dev                   # http://localhost:3000/studio
```

Sign in, promote your account to `OWNER` (new accounts start as `CLIENT`), then seed the agent
roster from the markdown prompts — both steps are two commands each in
[`docs/QUICKSTART.md`](docs/QUICKSTART.md), which also covers the task API, parallel agents,
MemPalace and the Telegram bot.

## How a task flows

```
Idea (Initiative)  →  Tasks with acceptance criteria  →  Agent picks up (IN_PROGRESS)
                                                              ↓
       DONE (verificationStatus=PASS)  ←  verificationCommand exits 0
```

Agents talk to the Studio over a small REST API (`/api/tasks`, `/api/initiatives`) using an
`x-internal-secret` header. The same API backs the board UI, so a human and an agent see the
same state.

## Using the agents with Claude Code

Copy the prompts into your Claude Code project and point your `CLAUDE.md` at them:

```bash
mkdir -p ~/your-project/.claude/agents ~/your-project/.claude/rules
cp agents/*.md                 ~/your-project/.claude/agents/
cp claude-templates/rules/*.md ~/your-project/.claude/rules/
cp claude-templates/CLAUDE.md  ~/your-project/CLAUDE.md
```

Each `agents/<name>.md` carries YAML frontmatter (`name`, `description`, `model`, `tools`)
that Claude Code reads to register the subagent. Edit them freely — they are prompts, not code.
`CLAUDE.md` is a template full of placeholders: fill in your Studio URL and project list before
the agents can find the task API.

## Notes on this public release

- Agent prompts and several docs are written in **Ukrainian**; they work as-is with Claude,
  and translations are welcome (see `CONTRIBUTING.md`).
- **Lint and unit tests are not green.** 24 ESLint errors (mostly `no-explicit-any`) and 10
  failing vitest cases come straight from upstream — a few test files mock `@/lib/auth-helpers`
  without the `verifyInternalSecret` export the routes now import. `npm run build` passes, and
  CI treats build as the gate while reporting the other two. Fixes welcome.
- **Seed data and several docs still name the author's own projects** (PD, JobFinder and
  friends). They are examples, not dependencies — replace them with yours.
- The office view expects LimeZu's **Modern Office** tileset in `app/public/assets/office/`.
  That art is commercially licensed and cannot be redistributed here — buy it from
  [LimeZu on itch.io](https://limezu.itch.io/) and drop it in, or leave the office tab unused.
- Integrations that assume the author's infrastructure (Cloudflare Tunnel, Infisical, a
  Synology NAS for offsite backups) are included as *examples*. Swap them for your own or
  delete them; nothing in the Studio depends on them.
- Hosts, emails, IPs and identifiers are placeholders (`example.com`, `10.0.0.10`) — replace
  them with yours.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, you must publish
your changes.
