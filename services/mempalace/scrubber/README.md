# mempalace.scrubber

Defensive secret-redaction library for MemPalace. Scrubs AI transcripts,
logs, and any free-form text before they are persisted or sent to an LLM.

## Coverage

| Type | Marker | Confidence |
|---|---|---|
| Google OAuth client secret | `<REDACTED:GOOGLE_OAUTH>` | high |
| OpenAI classic key | `<REDACTED:OPENAI_KEY>` | high |
| OpenAI project key | `<REDACTED:OPENAI_PROJECT>` | high |
| Anthropic API key | `<REDACTED:ANTHROPIC_KEY>` | high |
| GitHub PAT (classic + fine-grained) | `<REDACTED:GITHUB_PAT>` | high |
| SSH private keys (PEM) | `<REDACTED:SSH_KEY>` | high |
| AWS access key ID | `<REDACTED:AWS>` | high |
| Slack tokens | `<REDACTED:SLACK>` | high |
| Telegram bot tokens | `<REDACTED:TELEGRAM_BOT>` | high |
| JWT | `<REDACTED:JWT>` | high |
| DB URLs with credentials (postgres/mysql/mongo/redis) | `<REDACTED:DB_URL>` | high |
| Generic 32-64 char hex blob | `<REDACTED:HEX_API>` | low |
| Exact match from `/opt/docker/secrets/*.env` | `<REDACTED:ENV_FILE>` | high |

## Usage

```python
from scrubber import Scrubber

s = Scrubber()  # loads env values from /opt/docker/secrets by default
cleaned, findings = s.scrub(user_message)

for f in findings:
    print(f.pattern_name, f.confidence, f.original_hash)
```

To disable the env-file pass (e.g. in tests or on a dev machine):

```python
s = Scrubber(load_env=False)
```

Or point at a custom directory:

```python
s = Scrubber(secrets_dir="/etc/myapp/secrets")
```

## Design notes

1. **No overlapping matches.** High-confidence patterns run first and
   claim byte ranges; the low-confidence `HEX_API` rule cannot re-match
   inside an already-redacted GitHub PAT or Anthropic key.
2. **Env index runs second.** After regex replacement, any remaining
   verbatim value from a readable `.env` file is replaced with
   `<REDACTED:ENV_FILE>`. Unreadable files are silently skipped —
   production must not crash because a file is root-owned.
3. **Audit without leakage.** `Finding.original_hash` is a 16-char sha256
   prefix of the original bytes, suitable for correlation without
   round-trippable recovery.
4. **Short values ignored.** Env values shorter than 16 chars are not
   indexed (avoids matching `production`, `true`, etc.).

## Running tests

```bash
cd services/mempalace/scrubber
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m pytest tests/ -v
```

## Known false-positive risks

- `HEX_API` (32-64 hex chars) is intentionally low-confidence. It WILL
  match git commit SHAs, MD5/SHA hashes in text, and hex-encoded
  fixtures. Callers that render scrubbed text should label this tier as
  "possible secret" rather than a confirmed leak.
- `DB_URL` assumes credentials are embedded (`user:pass@host`). URLs
  without a password component are not flagged.
- `TELEGRAM_BOT` can collide with other `<digits>:<base64ish>` shapes;
  the 35-char length constraint mitigates this.
