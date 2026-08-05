# New Agent Onboarding Checklist

Formal protocol for adding a new agent to the VS team.
Ensures that all existing agents learn about the new peer and update their wikis accordingly.

**When to use:** every time a new `agents/<name>.md` is created.

## Why this matters

Without this protocol, every new agent becomes a silent addition → cross-refs stop being updated → the wiki deteriorates → compound memory breaks. Karpathy's pattern relies on bookkeeping discipline, so the onboarding process must be explicit.

## Mandatory steps

### 1. Prompt

Create `agents/<name>.md` with frontmatter:

```yaml
---
name: <name>
description: "Short — role + domain. One sentence."
subagent_type: <name>
model: sonnet|opus
tools: [Read, Write, Edit, Grep, Glob, Bash, ...]
---
```

Body: Role / Tools / Instructions / Projects. Copy from the closest existing agent as a baseline.

### 2. Wiki skeleton

```bash
cp -r docs/agent-wiki-template agents/<name>/wiki
```

Then:
- `find agents/<name>/wiki -type f -name "*.md" | xargs sed -i '' 's/<agent-name>/<name>/g'` (on macOS: `sed -i ''`)
- Adapt `README.md` to the agent's specifics (which entity pages to expect)
- Log the first entry in `log.md`: `## [YYYY-MM-DD] ingest | Wiki seeded from template`
- Optionally create 2-3 seed entity/concept pages if initial context is available

### 3. VS DB — Agent record

```sql
INSERT INTO "Agent" (id, name) VALUES (gen_random_uuid()::text, '<name>');
```

Or via the API if an endpoint exists. Verify `GET /api/tasks?agentName=<name>` returns an empty array (not 404).

### 4. Update the roster

Add a row to [`agents-roster.md`](./agents-roster.md) → `Active` table. Status `ACTIVE`, creation date, link to the wiki. If there's functional overlap with another agent, add a row to the `Collaboration matrix`.

### 5. Broadcast to all existing agents

Create a welcome initiative in VS:

```sql
-- Welcome initiative
INSERT INTO "Initiative" (id, title, "rawIdea", summary, status, priority, "userId", "projectId", "createdAt", "updatedAt")
VALUES (
  'cm' || <random>,
  'Welcome <name> — peer onboarding for existing agents',
  'New agent <name> (<role>) has joined. Each existing agent must (1) read the new agent''s README, (2) append a new-peer entry to its log.md, (3) create/update concept_collaboration.md if functional overlap exists.',
  '...',
  'IN_PROGRESS', 2, ..., ..., NOW(), NOW()
);

-- One welcome task per existing agent (currently 8, excluding the new one)
```

Each welcome task has a 48h deadline. Typical task description:

> Read `agents/<new-agent>/wiki/README.md` and `index.md`. Append to your `log.md`:
> ```
> ## [YYYY-MM-DD] new-peer | <new-agent> joined
>   role: <role>
>   domain: <domain>
>   wiki: agents/<new-agent>/wiki/
>   collaboration: <how to interact, or "no overlap">
> ```
> If functional overlap exists, create or update `concepts/concept_collaboration.md` with explicit responsibility boundaries.

### 6. CLAUDE.md / .claude/rules/

If the new agent appears in the Agent tool list, update:
- `CLAUDE.md` → "Субагенти" section → list of agents
- `.claude/rules/vs-agents.md` → if global rules change

### 7. Telegram announcement

Via `@yourbot`, post in Owner's chat:

```
🆕 New agent <name> has joined
Role: <role>
Domain: <domain>
Wiki: agents/<name>/wiki/
```

Manually or via the bot API. The goal is for Owner to see that it happened.

### 8. Commit

Everything (prompt + wiki + roster update + CLAUDE.md) in a single commit on the `release-YYYY-MM-DD` branch. Commit message:

```
feat(agents): onboard <name> agent

- Create prompt at agents/<name>.md
- Seed wiki from template
- Add to agents-roster.md
- Create welcome initiative (VS <initiative-id>)

Co-Authored-By: architect
```

## Automation (phase 2)

The `scripts/add-agent.sh` script automates steps 1-5, 7, 8. Step 6 is manual because it requires judgment. Step 5 creates the initiative, but `log.md` entries are written by each agent itself — not mechanically — so the entries carry real context.

See the TODO note in [`agent-wiki-convention.md`](./agent-wiki-convention.md).

## What existing agents must do (48h SLA)

Once the Welcome initiative is created:

1. Read the new agent (README + index as a minimum, entity/concept pages if there's overlap)
2. Append to log.md: `## [date] new-peer | <name> joined` + role + collaboration note
3. If overlap exists → `concept_collaboration.md` (create or update)
4. `PUT` the VS task → status `DONE` with a `completionNote`
5. Commit in the next release branch

**If not completed within 48h** — the `memory-lint` subagent (once created) flags this as a missing cross-ref.

## Deprecation

Symmetric process — see [`agent-wiki-convention.md`](./agent-wiki-convention.md) → "When an agent is deprecated".

Short: roster status `DEPRECATED` (do not delete the row), wiki → `agents/archive/<name>/`, log.md entry in every peer's log, ADR with the reason.
