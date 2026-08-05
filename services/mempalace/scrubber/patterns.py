"""Regex patterns for secret detection.

Each pattern has a name (used in <REDACTED:NAME>), compiled regex,
confidence level (high|medium|low), and an optional flags flag for multiline.
"""
import re
from dataclasses import dataclass
from typing import Pattern


@dataclass(frozen=True)
class SecretPattern:
    name: str
    regex: Pattern[str]
    confidence: str  # high | medium | low
    secret_group: int = 0  # regex group that contains the secret; 0 = whole match


# Order matters: more specific patterns should be listed first so
# that a GitHub PAT is not accidentally matched by the generic hex rule.
PATTERNS: list[SecretPattern] = [
    SecretPattern(
        "GOOGLE_OAUTH",
        re.compile(r"GOCSPX-[A-Za-z0-9_-]{28}"),
        "high",
    ),
    SecretPattern(
        "OPENAI_PROJECT",
        re.compile(r"sk-proj-[A-Za-z0-9_-]{64,}"),
        "high",
    ),
    SecretPattern(
        "OPENAI_KEY",
        # Classic OpenAI key: sk- followed by 48 base62 chars.
        # Must not be followed by another base62 char to avoid partial match.
        re.compile(r"sk-[A-Za-z0-9]{48}(?![A-Za-z0-9])"),
        "high",
    ),
    SecretPattern(
        "ANTHROPIC_KEY",
        re.compile(r"sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{90,}"),
        "high",
    ),
    SecretPattern(
        "GITHUB_PAT",
        re.compile(r"\bgh[ps]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b"),
        "high",
    ),
    SecretPattern(
        "SSH_KEY",
        re.compile(
            r"-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----",
            re.MULTILINE,
        ),
        "high",
    ),
    SecretPattern(
        "AWS",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "high",
    ),
    SecretPattern(
        "SLACK",
        re.compile(r"\bxox[baprs]-[0-9a-zA-Z-]{10,}\b"),
        "high",
    ),
    SecretPattern(
        "TELEGRAM_BOT",
        re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b"),
        "high",
    ),
    SecretPattern(
        "JWT",
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        "high",
    ),
    SecretPattern(
        "DB_URL",
        re.compile(
            r"\b(?:postgresql|postgres|mysql|mongodb|mongodb\+srv|redis|rediss)://"
            r"[^@\s:/]+:[^@\s/]+@[^/\s]+"
        ),
        "high",
    ),
    # --- New patterns (F-03) ------------------------------------------------
    SecretPattern(
        # Google Cloud / Gemini / Maps API keys.
        # Shape: AIza followed by exactly 35 base62+_- chars.
        "GOOGLE_API_KEY",
        re.compile(r"AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])"),
        "high",
    ),
    SecretPattern(
        # Groq API keys (used by PD and JF).
        # Shape: gsk_ followed by exactly 52 base62 chars.
        "GROQ_KEY",
        re.compile(r"gsk_[A-Za-z0-9]{52}"),
        "high",
    ),
    SecretPattern(
        # xAI (Grok) API keys.
        # Shape: xai- followed by exactly 80 base62 chars.
        "XAI_KEY",
        re.compile(r"xai-[A-Za-z0-9]{80}"),
        "high",
    ),
    SecretPattern(
        # Stripe live secret key.
        "STRIPE_LIVE_SK",
        re.compile(r"sk_live_[A-Za-z0-9]{24,}"),
        "high",
    ),
    SecretPattern(
        # Stripe test secret key.
        "STRIPE_TEST_SK",
        re.compile(r"sk_test_[A-Za-z0-9]{24,}"),
        "high",
    ),
    SecretPattern(
        # Stripe live publishable key (medium confidence — less sensitive).
        "STRIPE_PK_LIVE",
        re.compile(r"pk_live_[A-Za-z0-9]{24,}"),
        "medium",
    ),
    SecretPattern(
        # Stripe live restricted key (high — same power as secret).
        "STRIPE_RK_LIVE",
        re.compile(r"rk_live_[A-Za-z0-9]{24,}"),
        "high",
    ),
    SecretPattern(
        # Cloudflare API token (40 base62+_- chars) detected via context:
        # requires "X-Auth-Key:" or "X-Auth-Email:" to appear within 3 lines
        # before the token, or an "Authorization: Bearer" prefix that is NOT
        # already matched by AUTH_BEARER (handled below).
        # Low-confidence standalone shape to avoid false-positives; paired
        # patterns are in AUTH_BEARER.
        # We use a context-requiring pattern: look for common CF header names
        # on the same line (case-insensitive).
        "CLOUDFLARE_TOKEN",
        re.compile(
            r"(?i)(?:X-Auth-Key|X-Auth-Email|CF-API-Token)[:\s=]+([A-Za-z0-9_-]{40})\b"
        ),
        "high",
        1,  # secret_group — group 1 is the token itself
    ),
    SecretPattern(
        # Generic Authorization: Bearer <token> header.
        # Replaces only the token portion (capture group 1) via secret_group=1.
        # The "Authorization: Bearer " prefix is preserved in the output.
        "AUTH_BEARER",
        re.compile(r"(?i)(authorization:\s*bearer\s+)([A-Za-z0-9_.\-+/=]{20,})"),
        "medium",
        2,  # secret_group — group 2 is the token; group 1 is the prefix
    ),
    # --- End new patterns (F-03) --------------------------------------------
    # --- New patterns (MP-SEC-20260411-02) ----------------------------------
    SecretPattern(
        # Kraken exchange API key / secret.
        # Freqtrade stores these as FREQTRADE__EXCHANGE__KEY and
        # FREQTRADE__EXCHANGE__SECRET. The private key is base64-encoded
        # (88+ chars); the public key is ~56 base62 chars.
        # We require context (key name on same line) to avoid false-positives.
        "KRAKEN_API_KEY",
        re.compile(
            r"(?i)(?:EXCHANGE__KEY|EXCHANGE__SECRET|kraken[_-]?(?:api[_-]?)?(?:key|secret|priv))"
            r"\s*[=:]\s*([A-Za-z0-9+/=_-]{40,})"
        ),
        "high",
        1,
    ),
    SecretPattern(
        # Bunq OAuth / API access token.
        # Bunq tokens have no distinctive prefix; match via context.
        # Patterns: BUNQ_ACCESS_TOKEN=..., "access_token": "...", bunq_token=...
        "BUNQ_TOKEN",
        re.compile(
            r"(?i)(?:bunq[_-]?(?:access[_-]?)?token|bunq[_-]?api[_-]?key)"
            r"\s*[=:\s]+([A-Za-z0-9_-]{32,})"
        ),
        "high",
        1,
    ),
    SecretPattern(
        # Stalwart mail server password / admin secret.
        # Env var names: STALWART_SMTP_PASS, SMTP_PASSWORD, STALWART_ADMIN_SECRET,
        # MAIL_PASSWORD, etc.
        "STALWART_SECRET",
        re.compile(
            r"(?i)(?:STALWART[_A-Z0-9]*(?:PASS(?:WORD)?|SECRET|TOKEN)"
            r"|SMTP_(?:PASS(?:WORD)?|SECRET)"
            r"|MAIL_(?:PASS(?:WORD)?|SECRET|TOKEN))"
            r'\s*[=:]\s*([^\s\'"]{12,})'
        ),
        "high",
        1,
    ),
    SecretPattern(
        # PG DSN without scheme — shortform common in docker-compose args and logs.
        # Shape: user:password@host[:port][/db]
        # Host anchored to known local names (pg, pgbouncer, localhost, 127.0.0.1)
        # to avoid false-positives on generic user@host strings.
        "PG_DSN_NO_SCHEME",
        re.compile(
            r"\b([a-z_][a-z0-9_]*):[A-Za-z0-9_@!#$%^&*()+.\-]{1,}"
            r"@(pg|localhost|127\.0\.0\.1|pgbouncer)"
            r"(?:\:\d{1,5})?(?:/[a-zA-Z_][a-zA-Z0-9_]*)?\b"
        ),
        "high",
        0,
    ),
    # --- End new patterns (MP-SEC-20260411-02) ------------------------------
    # --- New patterns (REV2-15) ---------------------------------------------
    SecretPattern(
        # Recraft.ai API key — used by designer agent for image generation.
        # Detected via env var context (RECRAFT_API_KEY or RECRAFT_TOKEN).
        "RECRAFT_API_KEY",
        re.compile(
            r"(?i)(?:RECRAFT[_-]?(?:API[_-]?)?KEY|RECRAFT[_-]?TOKEN)"
            r"\s*[=:\s]+([A-Za-z0-9_-]{32,})"
        ),
        "high",
        1,
    ),
    SecretPattern(
        # Infisical service token — format st.<base62url> with 20+ chars after dot.
        # These appear in env vars INFISICAL_TOKEN, INFISICAL_SERVICE_TOKEN, etc.
        # Must not conflict with generic hex or bearer patterns above.
        "INFISICAL_TOKEN",
        re.compile(r"\bst\.[a-zA-Z0-9_-]{20,}\b"),
        "high",
    ),
    SecretPattern(
        # NextAuth session secret — detected via env var name + value on same line.
        # Captures only the secret value (group 1) via secret_group=1.
        "NEXTAUTH_SECRET",
        re.compile(
            r"NEXTAUTH_SECRET\s*[=:]\s*['\"]?([a-zA-Z0-9+/=_\-]{20,})['\"]?"
        ),
        "high",
        1,
    ),
    SecretPattern(
        # AES-GCM encryption key used by Next.js PD for secrets table.
        # Detected via env var name + value on same line.
        # НІКОЛИ не ротувати без міграції secrets таблиці (CLAUDE.md rule).
        # Captures only the key value (group 1) via secret_group=1.
        "ENCRYPTION_KEY",
        re.compile(
            r"ENCRYPTION_KEY\s*[=:]\s*['\"]?([a-zA-Z0-9+/=_\-]{20,})['\"]?"
        ),
        "high",
        1,
    ),
    # --- End new patterns (REV2-15) -----------------------------------------
    # --- New patterns (ARCH-08-20260425) ------------------------------------
    SecretPattern(
        # Sentry DSN — exposes project + auth on a single URL.
        # Shape: https://<32 hex>@<sub>.ingest.sentry.io/<project_id>
        # Also covers self-hosted ingest.<region>.sentry.io.
        "SENTRY_DSN",
        re.compile(
            r"https://[a-f0-9]{32}@[a-z0-9.-]+\.ingest\.sentry\.io/\d+"
        ),
        "high",
    ),
    SecretPattern(
        # Tavily AI search API key — used by SMM and developer agents.
        # Shape: tvly- followed by exactly 32 base62 chars.
        "TAVILY_KEY",
        re.compile(r"\btvly-[A-Za-z0-9]{32}\b"),
        "high",
    ),
    SecretPattern(
        # Brave Search API key — used by SMM agent / web research.
        # Shape: BSA followed by 30+ base62+_- chars.
        "BRAVE_SEARCH_KEY",
        re.compile(r"\bBSA[A-Za-z0-9_-]{30,}\b"),
        "high",
    ),
    SecretPattern(
        # npm publish access token (npm_<36 base62>).
        # Leaks let attacker publish malicious package versions.
        "NPM_TOKEN",
        re.compile(r"\bnpm_[A-Za-z0-9]{36}\b"),
        "high",
    ),
    SecretPattern(
        # Cohere AI API key — agentic LLM provider.
        # Shape: 40 alnum chars; detected via env var context to avoid FPs.
        "COHERE_KEY",
        re.compile(
            r"(?i)(?:COHERE[_-]?(?:API[_-]?)?KEY|CO_API_KEY)"
            r"\s*[=:\s]+([A-Za-z0-9]{40})\b"
        ),
        "high",
        1,
    ),
    # --- End new patterns (ARCH-08-20260425) --------------------------------
    SecretPattern(
        # Low confidence: any 32-64 char hex blob. Runs LAST so it does not
        # steal bytes from higher-confidence patterns.
        "HEX_API",
        re.compile(r"\b[A-Fa-f0-9]{32,64}\b"),
        "low",
    ),
]
