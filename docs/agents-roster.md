# Agents Roster

Canonical list of the VS team's agents. Single source of truth for who is on the team and what they own.

Updated whenever an agent is added or deprecated (see [`new-agent-checklist.md`](./new-agent-checklist.md)).
Every agent wiki cross-references this file.

## Active

| Name | Role | Subagent type | Domain | Wiki | Created | Status |
|------|------|---------------|--------|------|---------|--------|
| **architect** | Architect + code reviewer | `architect` | System design, ADR, performance, DB optimization, API design | [wiki](../agents/architect/wiki/) | 2026-03 | ACTIVE |
| **developer** | Developer | `developer` | Feature implementation, bug fixes, refactoring | [wiki](../agents/developer/wiki/) | 2026-03 | ACTIVE |
| **designer** | Dizi — UI/UX designer | `designer` | UI/UX, logos, banners, branding, Recraft.ai, Figma | [wiki](../agents/designer/wiki/) | 2026-03 | ACTIVE |
| **coo** | Chief Operating Officer | `coo` | Coordination, sprints, prioritization, clients, product | [wiki](../agents/coo/wiki/) | 2026-03 | ACTIVE |
| **devsecops** | DevSecOps engineer | `devsecops` | Docker, deploy, backups, secrets, security audits, CVE, TLS | [wiki](../agents/devsecops/wiki/) | 2026-03 | ACTIVE |
| **tester** | QA tester | `tester` | Unit (Vitest), E2E (Playwright), smoke, coverage, regression | [wiki](../agents/tester/wiki/) | 2026-03 | ACTIVE |
| **trader** | Trading analyst | `trader` | Freqtrade, backtesting, portfolio, monitoring, Kraken/IBKR | [wiki](../agents/trader/wiki/) | 2026-03 | ACTIVE |
| **smm** | SMM manager | `smm` | Marketing, content, social media, Building the Office, cross-posting | [wiki](../agents/smm/wiki/) | 2026-03 | ACTIVE |
| **cat** | Chaos Engineer | `cat` | Controlled chaos experiments: break server/backup, resilience testing | [wiki](../agents/cat/wiki/) | 2026-03 | ACTIVE |
| **ai** | AI/ML Engineer | `ai` | Model training, fine-tuning, RAG pipelines, MemPalace, embeddings, eval | [wiki](../agents/ai/wiki/) | 2026-04 | ACTIVE |
| **voice** | Voice & STT Engineer | `voice` | Speech-to-text, TTS, voice enrollment, pyannote, faster-whisper | [wiki](../agents/voice/wiki/) | 2026-04 | ACTIVE |

## Deprecated

_(none yet — no agents have been deprecated)_

## Collaboration matrix

Functional overlaps between agents — explicit boundaries go here.

| Agent A | Agent B | Overlap | Rule |
|---------|---------|---------|------|
| architect | developer | Architecture vs implementation | architect makes architectural decisions (ADR), developer implements them |
| developer | tester | Tests as part of features | developer writes unit tests as part of a feature, tester handles E2E + regression + coverage audits |
| devsecops | developer | Secrets in code | developer uses `getSecret()` helper, devsecops manages the Infisical catalog |
| coo | — | Priority decisions | coo ranks tasks in agreement with Owner; other agents execute in order |
| smm | designer | Visual assets for posts | designer produces static visuals, smm uses them in posts (cross-refs between wikis are required) |
| cat | devsecops | Chaos vs recovery | cat breaks things (within `entity_blast_radius.md`), devsecops restores and writes post-mortems |

If this matrix doesn't cover a situation, each agent should add `concepts/concept_collaboration.md` to its own wiki with an explicit peer mention.

## How to add a new agent

See [`new-agent-checklist.md`](./new-agent-checklist.md).

## How to deprecate an agent

See [`agent-wiki-convention.md`](./agent-wiki-convention.md) → "When an agent is deprecated".

---

**Last updated:** 2026-04-18 by developer (REV2-15)
