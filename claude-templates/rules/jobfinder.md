# JobFinder (jf-private / jf-public)

## URLs та контейнери
- **URL:** https://jobfinder.example.com
- **Контейнер:** `jobfinder` (:3456), окремий compose (`jf-private/docker-compose.prod.yml`)
- **БД:** `pg:5432/jobfinder` (user: jobfinder, shared PostgreSQL з VS infra)
- **GitHub:** private `yourorg/jf-private`, public `yourorg/JobFinder` (AGPL-3.0)

## Стек
- Next.js 16.2, React 19.2, TypeScript 6, Prisma 7.5 (@prisma/adapter-pg)
- Tailwind CSS 4.2, NextAuth 5.0.0-beta.30, next-intl 4.8
- Recharts 3.8, Serwist 9.5 (PWA), Lucide 1.6, date-fns 4.1
- Playwright 1.58 (E2E), Node 22-alpine (Docker)
- Auth: Google OAuth, GitHub OAuth, demo mode, invite-only
- AI: Ollama (gemma4:e4b, local default), Gemini Flash, Groq — configurable per user

## Модулі
- Profile: resume upload (PDF/URL), AI analysis, skills, languages
- Searches: multi-profile configs (job titles, salary, location)
- Vacancies: AI scoring (match %), tags, dedup, filtering
- Applications: pipeline (New → Applied → Response → Interview → Offer/Reject)
- Q&A Bank: screening questions з AI auto-fill
- Emails: recruiter response tracking (CF Email Worker → API)
- Analytics: funnel chart, weekly trends, platform comparison
- Onboarding: 6-step wizard
- Scraping: 11 scrapers (LinkedIn, Indeed, RemoteOK, WWR, Glassdoor, Wellfound, HN, Djinni, ZipRecruiter, Google Jobs, StackOverflow)
- Apply: Playwright headless (LinkedIn Easy Apply, Indeed Quick Apply)
- Cron: `scripts/cron-scrape.sh` (17:00 UTC), `scripts/cron-apply.sh` (18:00 UTC)

## Open Source
- Sync: `bash jf-private/scripts/sync-to-public.sh` — rsync + secret scan
- Public repo не містить: .env, secrets, seed-demo.sql, resumes/

## Деплой
```bash
ssh vps 'cd /opt/repos/vibe-studio/jf-private && git pull origin main && docker build --build-arg DATABASE_URL="postgresql://jobfinder:jobfinder@pg:5432/jobfinder" -t jobfinder:latest . && cd /opt/docker && docker compose up -d --force-recreate jobfinder'
```

Container entrypoint (`scripts/entrypoint.sh`) runs `prisma migrate deploy` before starting Next.js; new migrations are applied automatically on every deploy. Idempotent — if no pending migrations, exits 0 immediately.
