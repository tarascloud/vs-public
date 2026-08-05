# Claude Code Update — Permission Runbook

**File:** `infra/sudoers.d/claude-update`
**Installed at:** `/etc/sudoers.d/claude-update`
**Ticket:** INFRA-05-claude-update-permission

---

## Why this exists

`@anthropic-ai/claude-code` is installed globally via `npm install -g` by root
(`/usr/lib/node_modules/@anthropic-ai/claude-code`, symlink `/usr/bin/claude`).
The daily cron (`0 4 * * * cron-wrapper.sh claude-update ...`) runs as user `owner`.

`npm update -g` needs to:
1. Write to `/usr/lib/node_modules/@anthropic-ai/` (root-owned)
2. Atomically replace `/usr/bin/claude` via `/usr/bin/.claude-XXXX` tmp (root-owned dir)

Without sudo, npm fails with `EACCES: permission denied`.

**Hot-fix 2026-05-06:** `chown -R owner:owner` on the paths above — this is a
security drift (user-writable system paths). **Permanent fix:** point NOPASSWD sudo
entry for exactly this one command, keep paths root-owned.

---

## How the sudoers entry works

```
owner ALL=(root) NOPASSWD: /usr/bin/npm update -g @anthropic-ai/claude-code
```

- `owner` — the user that runs the cron
- `ALL=(root)` — on any host, run as root
- `NOPASSWD:` — no password prompt (required for unattended cron)
- `/usr/bin/npm update -g @anthropic-ai/claude-code` — exact command match
  (full path `/usr/bin/npm` is mandatory; sudo won't match `npm` without path)

The cron entry uses `sudo /usr/bin/npm update -g ...` — must match exactly.

---

## Deployment

This file is the **single source of truth**. Deploy to VPS:

```bash
scp infra/sudoers.d/claude-update vps:/tmp/claude-update-sudoers
ssh vps '
  sudo visudo -c -f /tmp/claude-update-sudoers  # validate FIRST
  sudo cp /tmp/claude-update-sudoers /etc/sudoers.d/claude-update
  sudo chown root:root /etc/sudoers.d/claude-update
  sudo chmod 0440 /etc/sudoers.d/claude-update
  rm /tmp/claude-update-sudoers
'
```

**NEVER edit `/etc/sudoers.d/claude-update` directly on VPS** — edit this file,
validate locally, then deploy. Direct edits will be overwritten next time.

---

## Testing (without waiting for 04:00 cron)

```bash
ssh vps 'sudo -n /usr/bin/npm update -g @anthropic-ai/claude-code 2>&1 | tail -5'
```

Expected: exits 0, output shows `changed N packages` or `up to date`.
No password prompt = NOPASSWD entry is working.

---

## Recovery: sudoers syntax error

A broken `/etc/sudoers.d/` file disables `sudo` for everyone. Recovery options:

### Option A: pkexec (if graphical session available)
```bash
pkexec visudo
# Delete or fix /etc/sudoers.d/claude-update
```

### Option B: root login via console / SSH with root key
```bash
# If root SSH login is enabled (or via recovery console):
ssh root@vps
rm /etc/sudoers.d/claude-update   # or fix it
```

### Option C: Recovery mode (worst case)
Boot into recovery mode → root shell → delete the broken file.

**Prevention:** Always run `sudo visudo -c -f <file>` BEFORE installing.
The deployment procedure above does this.

---

## Ownership baseline (post-revert 2026-05-06)

| Path | Owner | Notes |
|------|-------|-------|
| `/usr/lib/node_modules/@anthropic-ai/` | root:root | npm global install dir |
| `/usr/bin/claude` | root:root (symlink) | Points to claude-code/bin/claude.exe |
| `/etc/sudoers.d/claude-update` | root:root | mode 0440 |

---

## Related

- Cron: `crontab -l | grep claude-update` (runs as `owner`, 04:00 UTC daily)
- Wrapper: `/opt/docker/scripts/cron-wrapper.sh` — logs to `/opt/docker/backups/claude-update.log`
- Ticket: INFRA-05 in Vibe Studio
