# MemPalace audit.log Rotation

**Last reviewed:** 2026-04-19 (REV-20260419-0054)

## Current config

`infra/logrotate/mempalace` → `/etc/logrotate.d/mempalace` on VPS.

```
/opt/docker/mempalace/palace/audit.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    create 0600 1000 1000
}
```

**Why `copytruncate`:** the mempalace Python process keeps an open fd +
fsync per append (security requirement — tamper-evident audit trail).
A traditional rotate would leave the writer pointed at the moved file
until container restart, losing entries. `copytruncate` atomically copies
then truncates in place, so the writer keeps appending to a zero-length
file.

## Ticket REV-20260419-0054 — `dateext` recommendation

**Recommendation (deferred):** add `dateext` + `dateformat -%Y%m%d` so
rotated files have ISO-date suffixes (`audit.log-20260419.gz`) instead of
integer suffixes (`audit.log.1.gz`, `.2.gz`, ...). Benefits:

1. Retention scripts + NAS offsite sync can glob by date
   (`audit.log-2026*.gz`) without parsing numbered rotations.
2. Audit recovery: "which file covers 2026-04-19?" answers from filename
   alone, no `ls -lt` math.
3. `rotate 14` stays valid; logrotate dates each file instead of
   renumbering on each run.

**Proposed updated config:**
```
/opt/docker/mempalace/palace/audit.log {
    daily
    dateext
    dateformat -%Y%m%d
    missingok
    notifempty
    rotate 30
    compress
    delaycompress
    copytruncate
    create 0600 1000 1000
}
```

Also extends retention `14 → 30` days, aligned with mempalace backup
retention on VPS (`CLAUDE.md §MemPalace Backup`).

## Why this file, not a PR

The installed config at `/etc/logrotate.d/mempalace` is owned by `root`
and outside any repo. Changes require `sudo cp infra/logrotate/mempalace
/etc/logrotate.d/mempalace && sudo logrotate -d /etc/logrotate.d/mempalace`
(dry-run) + `sudo logrotate -f ...` (force rotate to validate). Do this
under the "infrastructure maintenance" window, not mid-review.

## Verify after install

```bash
ssh vps sudo logrotate -d /etc/logrotate.d/mempalace
ssh vps ls -la /opt/docker/mempalace/palace/
