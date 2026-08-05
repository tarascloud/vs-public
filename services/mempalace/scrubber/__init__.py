"""mempalace.scrubber — defensive secret redaction library.

Scrubs OpenAI / Anthropic / Google OAuth / GitHub / AWS / Slack / Telegram /
JWT / SSH private keys / DB URLs / generic hex API keys + any verbatim value
that appears in /opt/docker/secrets/*.env.
"""
from .findings import Finding
from .patterns import PATTERNS, SecretPattern
from .scrubber import Scrubber, scrub
from .secrets_index import SecretsIndex, load_env_values

__all__ = [
    "Finding",
    "PATTERNS",
    "SecretPattern",
    "Scrubber",
    "scrub",
    "SecretsIndex",
    "load_env_values",
]
