# vs-landing — build context (monorepo root)

## Проблема

`app/Dockerfile` використовує `COPY packages/ /packages/` — пакети з кореня ``.
Якщо запускати `docker build` з `app/` directory, Docker не знайде `packages/` і build впаде.

## Правило

**Завжди будувати з кореня ``:**

```bash
# ПРАВИЛЬНО:
cd /opt/repos/vibe-studio
docker build -f app/Dockerfile -t vs-landing:latest .

# НЕПРАВИЛЬНО:
cd /opt/repos/vibe-studio/app && docker build -t vs-landing:latest .
```

## Повна команда деплою

```bash
ssh vps 'cd /opt/repos/vibe-studio && git pull origin main -q && docker build -f app/Dockerfile -t vs-landing:latest . && cd /opt/docker && docker compose up -d --force-recreate vs-landing'
```

Зафіксовано у `.claude/rules/infrastructure.md` (секція "Deploy — vs-landing").

## Контекст

REV-POST-20260419-01 (2026-04-19): виявлено що deploy команда використовувала
`cd app && docker build .` замість root context. Rebuild виконано успішно.
