# Runbook: Контейнери що запускаються як root

**Дата:** 2026-05-04
**Контекст:** REV-12 Security Review — Docker containers running as root

## Підсумок

Аудит виявив наступні контейнери що запускаються як root. Частина виправлена через user: directive в compose або USER в Dockerfile. Решта — third-party образи де зміна небезпечна через data volumes, прав на сокети або upstream обмеження.

---

## Виправлено (REV-12, 2026-05-04)

| Контейнер | Виправлення | User |
|-----------|-------------|------|
| owner | user: "101:101" в compose | nginx (101) |
| ttyd-proxy | user: "101:101" в compose | nginx (101) |
| ko-bot | user: "1001:1001" в compose | appuser (1001) |
| booking-api | user: "1001:1001" в compose | appuser (1001) |
| vs-landing | user: "node" в compose (вже було) | node |

## Вже були non-root (Dockerfile USER)

| Контейнер | User | Dockerfile |
|-----------|------|-----------|
| pd-prod | nextjs (1001) | pd-private/next/Dockerfile |
| pd-dev | nextjs (1001) | pd-private/next/Dockerfile |
| pd-scheduler | scheduler (1001) | pd-private/deploy/pd-Dockerfile |
| pd-bot | scheduler (1001) | pd-private/deploy/pd-Dockerfile |
| korobkov | nextjs (1001) | korobkovart/site/Dockerfile |
| mempalace | mempalace | services/mempalace/Dockerfile |

---

## Third-party контейнери що залишаються root (не чіпаємо зараз)

НЕ змінювати без ретельного тестування та окремого тикету.

### pg (pgvector/pgvector:pg16)
- Чому root: PostgreSQL ініціалізує data volume та змінює ownership при першому старті через init-скрипти.
- Ризик зміни: Корупція pgdata volume, неможливість старту.
- Пом'якшення: pg обмежений backend (internal) мережею, port 127.0.0.1:5432 only.

### redis:7-alpine
- Чому залишаємо: docker inspect показує USER="" але entrypoint виконує su-exec redis — процес реально запускається як redis (UID 999).
- Дія: Підтвердити через docker exec redis ps aux перед наступним review.

### ollama/ollama:0.20.5
- Чому root: Модельний storage в /root/.ollama (9.6GB+ даних). Upstream не підтримує rootless без перемонтування volume з коректним ownership.
- Пом'якшення: Обмежений 127.0.0.1:9002, тільки backend мережа.

### cloudflare/cloudflared:2025.4.1
- Чому root: network_mode: host вимагає root або CAP_NET_BIND_SERVICE.
- Пом'якшення: Офіційний Cloudflare образ. Оновлювати pin регулярно.

### infisical/infisical:v0.159.1
- Чому root: Upstream не підтримує rootless офіційно.
- Пом'якшення: Обмежений 127.0.0.1:8010, Cloudflare tunnel.

### infisical/cli:0.43.67 (infisical-agent)
- Чому root: Потребує запису .env файлів в /opt/docker/secrets (root ownership).
- Наступний крок: Змінити ownership /opt/docker/secrets до UID 1000, додати user: "1000:1000" — окремий тикет.

### stalwart/stalwart:v0.15.5
- Чому root: Порти < 1024 (25, 587, 993) вимагають CAP_NET_BIND_SERVICE або root.
- Наступний крок: Додати cap_add: [NET_BIND_SERVICE] + non-root user — окремий тикет.

### ~~roundcube/roundcubemail:1.6.10-apache~~ — DECOMMISSIONED 2026-08-03
- Контейнер видалений (нуль реальних юзерів за 30 днів). Пункт лишено для історії.

### freqtradeorg/freqtrade:2025.5
- Чому root: Upstream не підтримує rootless.
- Пом'якшення: Обмежений 127.0.0.1:9001, не публічний.

### registry:2
- Чому root: Upstream image без rootless підтримки.
- Пом'якшення: Обмежений 127.0.0.1:5000, не публічний.

### watchtower (profile: disabled)
- Статус: Не запущений (profiles: [disabled]).

---

## Наступні кроки (пріоритет LOW, окремі тикети)

1. infisical-agent rootless: chown -R 1000:1000 /opt/docker/secrets, user: "1000:1000" в compose.
2. stalwart rootless: cap_add: [NET_BIND_SERVICE] + non-root user.
3. redis verification: docker exec redis ps aux — підтвердити що процес запускається як redis (999), не root.
