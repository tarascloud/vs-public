# VS Agents

Субагенти команди Vibe Studio. Кожен агент — markdown файл з промптом, що використовується через `Agent` tool (Claude Code subagents).

## Список агентів

| Агент | Файл | Роль |
|-------|------|------|
| Architect | `architect.md` | Code review, performance, архітектура |
| Developer | `developer.md` | Написання коду, фічі, баг фікси |
| Designer (Дізі) | `designer.md` | UX/UI, Figma, дизайн-система |
| COO | `coo.md` | Координація, продукт, фінанси |
| DevSecOps | `devsecops.md` | Deploy, Docker, security, infra |
| Tester | `tester.md` | Тести, regression, health checks |
| Trader | `trader.md` | Freqtrade, ринки, стратегії |
| SMM | `smm.md` | Контент, соцмережі, відео |
| Cat | `cat.md` | Chaos engineering |
| Voice | `voice.md` | Voice pipeline, STT |
| Trainer (Трен) | `trainer.md` | Плани тренувань, прогресія, recovery, Telegram нагадування |

## Parallel execution via COO

**Коли COO спавнить 2+ агентів одночасно — кожен ОБОВʼЯЗКОВО отримує власний git worktree.**

Shared working tree при паралельній роботі призводить до:
- Commits на неправильних branches (checkout — global state)
- Stash conflicts між агентами
- Merge у main падає через leftover uncommitted файли
- Race conditions при `git add`/`git commit`

### Wrapper pattern

COO використовує `scripts/spawn-parallel-agents.sh` для створення worktrees per ticket, потім передає кожному subagent-у `cwd` у prompt:

```
Working directory for this task: /tmp/agent-MP-FIX-20260411-01-1234
Branch: release-20260411-mp-fix-20260411-01
```

Subagent працює **виключно** у тій директорії. Детальні правила — `.claude/rules/parallel-agents.md`.

### Sequential vs parallel

- **Sequential (1 агент за раз):** можна працювати у базовому repo `/opt/repos/vibe-studio/` — worktree не потрібен.
- **Parallel (2+ агентів одночасно):** кожен у своєму worktree, без виключень.

### Coordination rules

1. Перед хвилею COO робить `git fetch origin main` один раз.
2. Для кожного task — `git worktree add -b <branch> <worktree> origin/main`.
3. Спавн subagents паралельно через `Agent` tool з `run_in_background: true`.
4. Після завершення — зібрати commit hashes, coordinated merge.
5. Teardown worktrees тільки після merge у main.

## Посилання

- `.claude/rules/parallel-agents.md` — детальні правила worktree
- `scripts/spawn-parallel-agents.sh` — helper script
- `CLAUDE.md` (root) — global rules для всього таrаs-code workspace
