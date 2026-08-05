"""Unit tests for mempalace.scrubber.

Each known pattern is exercised with a SYNTHETIC credential that matches the
regex but is not a real secret. We verify:
  - the original bytes are removed from the output
  - the correct <REDACTED:NAME> marker appears
  - a Finding is recorded with the expected pattern_name
"""
from pathlib import Path

import pytest

from scrubber import Scrubber, scrub
from scrubber.secrets_index import SecretsIndex


@pytest.fixture
def s() -> Scrubber:
    # Isolated: do NOT load /opt/docker/secrets on the test host.
    return Scrubber(load_env=False)


def _assert_redacted(scrubber: Scrubber, text: str, marker: str, secret: str):
    out, findings = scrubber.scrub(text)
    assert secret not in out, f"raw secret leaked for {marker}: {out}"
    assert f"<REDACTED:{marker}>" in out, f"missing marker for {marker}: {out}"
    assert any(f.pattern_name == marker for f in findings), (
        f"no Finding for {marker}: {findings}"
    )


def test_google_oauth(s):
    secret = "GOCSPX-abcdefghijklmnopqrstuvwx1234"
    _assert_redacted(s, f"client_secret={secret} end", "GOOGLE_OAUTH", secret)


def test_openai_key(s):
    secret = "sk-" + "A" * 48
    _assert_redacted(s, f"key: {secret}.", "OPENAI_KEY", secret)


def test_openai_project(s):
    secret = "sk-proj-" + "a" * 70
    _assert_redacted(s, f"X {secret} Y", "OPENAI_PROJECT", secret)


def test_anthropic_key(s):
    secret = "sk-ant-api03-" + "b" * 95
    _assert_redacted(s, f"ant {secret} end", "ANTHROPIC_KEY", secret)


def test_jwt(s):
    secret = (
        "eyJhbGciOiJIUzI1NiJ9"
        ".eyJzdWIiOiIxMjM0NTY3ODkwIn0"
        ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    )
    _assert_redacted(s, f"token {secret} end", "JWT", secret)


def test_github_pat_ghp(s):
    secret = "ghp_" + "A" * 36
    _assert_redacted(s, f"pat={secret} ok", "GITHUB_PAT", secret)


def test_github_pat_fine_grained(s):
    secret = "github_pat_" + "A" * 82
    _assert_redacted(s, f"fine {secret} ok", "GITHUB_PAT", secret)


def test_ssh_private_key(s):
    secret = (
        "-----BEGIN RSA PRIVATE KEY-----\n"
        "MIIEpAIBAAKCAQEA" + "x" * 60 + "\n"
        + "y" * 60 + "\n"
        "-----END RSA PRIVATE KEY-----"
    )
    out, findings = s.scrub(f"before\n{secret}\nafter")
    assert "PRIVATE KEY" not in out
    assert "MIIE" not in out
    assert "<REDACTED:SSH_KEY>" in out
    assert any(f.pattern_name == "SSH_KEY" for f in findings)


def test_aws_access_key(s):
    secret = "AKIA" + "A" * 16
    _assert_redacted(s, f"aws: {secret} here", "AWS", secret)


def test_db_url(s):
    secret = "postgresql://user:supersecret@db.example.com:5432/mydb"
    out, findings = s.scrub(f"DATABASE_URL={secret}")
    assert "supersecret" not in out
    assert "<REDACTED:DB_URL>" in out
    assert any(f.pattern_name == "DB_URL" for f in findings)


def test_slack(s):
    secret = "xoxb-12345-67890-ABCDEFGHIJ1234567890"
    _assert_redacted(s, f"slack {secret} ok", "SLACK", secret)


def test_telegram_bot(s):
    secret = "1234567890:AAEabcdefghijklmnop_qrstuvwxyz01234"
    _assert_redacted(s, f"bot {secret} end", "TELEGRAM_BOT", secret)


def test_hex_low_confidence(s):
    secret = "0123456789abcdef0123456789abcdef"  # 32 hex
    out, findings = s.scrub(f"raw {secret} end")
    assert "<REDACTED:HEX_API>" in out
    assert any(f.confidence == "low" and f.pattern_name == "HEX_API" for f in findings)


def test_mixed_fixture(s):
    fixture = Path(__file__).parent / "fixtures" / "sample_chat.md"
    text = fixture.read_text()
    out, findings = s.scrub(text)
    # All expected secret types present
    expected = {
        "OPENAI_KEY", "ANTHROPIC_KEY", "GOOGLE_OAUTH", "GITHUB_PAT",
        "AWS", "SLACK", "TELEGRAM_BOT", "JWT", "DB_URL", "HEX_API", "SSH_KEY",
    }
    seen = {f.pattern_name for f in findings}
    missing = expected - seen
    assert not missing, f"missing in fixture scrub: {missing}"
    # Preserved prose
    assert "Normal markdown" in out
    assert "authentication" in out
    assert "123-456-7890" in out  # phone-like not flagged
    # No leaks
    for bad in ["supersecret", "GOCSPX-", "MIIE", "eyJhbGciOi"]:
        assert bad not in out, f"leak: {bad}"


def test_false_positives_clean_markdown(s):
    text = (
        "# Title\n"
        "This is regular documentation with `inline code`.\n"
        "Visit https://example.com/docs for more info.\n"
        "Short hex abc123 and a UUID-ish 12345678 are fine.\n"
        "Phone: +380 123 456 789.\n"
    )
    out, findings = s.scrub(text)
    assert out == text, f"clean text was mutated: {out!r}"
    assert findings == [], f"false positives: {findings}"


def test_no_overlap_between_patterns(s):
    # GitHub PAT hex body must not be re-matched as HEX_API
    secret = "ghp_" + "A" * 36
    out, findings = s.scrub(secret)
    assert out == "<REDACTED:GITHUB_PAT>"
    names = [f.pattern_name for f in findings]
    assert names.count("GITHUB_PAT") == 1
    assert "HEX_API" not in names


def test_convenience_scrub_fn():
    secret = "sk-" + "Z" * 48
    out, findings = scrub(f"v={secret}", load_env=False)
    assert secret not in out
    assert findings and findings[0].pattern_name == "OPENAI_KEY"


def test_secrets_index_graceful_missing_dir():
    idx = SecretsIndex(secrets_dir="/nonexistent/path/xyz")
    assert len(idx) == 0
    out, count = idx.scrub("nothing to do")
    assert out == "nothing to do"
    assert count == 0


def test_secrets_index_exact_match(tmp_path):
    env = tmp_path / ".sample.env"
    env.write_text(
        "# comment\n"
        'API_KEY="supercalifragilistic_value_1234"\n'
        "SHORT=abc\n"
        "OTHER=another_long_enough_value_xyz\n"
    )
    idx = SecretsIndex(secrets_dir=tmp_path)
    assert len(idx) == 2  # SHORT filtered out
    out, count = idx.scrub("foo supercalifragilistic_value_1234 bar")
    assert "supercalifragilistic_value_1234" not in out
    assert "<REDACTED:ENV_FILE>" in out
    assert count == 1


def test_scrubber_with_env_index(tmp_path):
    env = tmp_path / ".site.env"
    env.write_text("TOKEN=unique_test_token_abcdef0123456789\n")
    scr = Scrubber(secrets_dir=tmp_path)
    out, findings = scr.scrub("hello unique_test_token_abcdef0123456789 world")
    assert "unique_test_token_abcdef0123456789" not in out
    assert "<REDACTED:ENV_FILE>" in out
    assert any(f.pattern_name == "ENV_FILE" for f in findings)


# ============================================================
# New pattern tests (F-03) — mp_t14b
# ============================================================


def test_google_api_key(s):
    # AIza + exactly 35 base62+_- chars = total 39 chars
    secret = "AIza" + "B" * 35
    assert len(secret) == 39
    _assert_redacted(s, f"key={secret} end", "GOOGLE_API_KEY", secret)


def test_groq_key(s):
    secret = "gsk_" + "A" * 52
    _assert_redacted(s, f"groq api: {secret}", "GROQ_KEY", secret)


def test_xai_key(s):
    secret = "xai-" + "A" * 80
    _assert_redacted(s, f"xAI key: {secret}", "XAI_KEY", secret)


def test_stripe_live_sk(s):
    secret = "sk_live_" + "A" * 24
    _assert_redacted(s, f"stripe={secret} end", "STRIPE_LIVE_SK", secret)


def test_stripe_test_sk(s):
    secret = "sk_test_" + "A" * 24
    _assert_redacted(s, f"stripe={secret} end", "STRIPE_TEST_SK", secret)


def test_stripe_pk_live(s):
    secret = "pk_live_" + "A" * 24
    out, findings = s.scrub(f"stripe pk: {secret}")
    assert secret not in out
    assert "<REDACTED:STRIPE_PK_LIVE>" in out
    assert any(f.pattern_name == "STRIPE_PK_LIVE" for f in findings)
    assert any(f.confidence == "medium" for f in findings)


def test_stripe_rk_live(s):
    secret = "rk_live_" + "A" * 24
    _assert_redacted(s, f"restricted key: {secret}", "STRIPE_RK_LIVE", secret)


def test_auth_bearer_preserves_prefix(s):
    token = "A" * 32
    text = f"Authorization: Bearer {token}"
    out, findings = s.scrub(text)
    assert token not in out, f"token leaked: {out}"
    # Prefix must be preserved
    assert "Authorization: Bearer" in out, f"prefix stripped: {out}"
    assert "<REDACTED:AUTH_BEARER>" in out
    assert any(f.pattern_name == "AUTH_BEARER" for f in findings)


def test_cloudflare_token_with_context(s):
    token = "A" * 40
    text = f"X-Auth-Key: {token}"
    out, findings = s.scrub(text)
    assert token not in out, f"token leaked: {out}"
    assert "<REDACTED:CLOUDFLARE_TOKEN>" in out
    assert any(f.pattern_name == "CLOUDFLARE_TOKEN" for f in findings)


def test_new_patterns_mixed(s):
    """One text containing all new secret types — all must be redacted."""
    google = "AIza" + "A" * 35
    groq = "gsk_" + "B" * 52
    xai = "xai-" + "C" * 80
    stripe_sk = "sk_live_" + "D" * 24
    stripe_test = "sk_test_" + "E" * 24
    stripe_pk = "pk_live_" + "F" * 24
    stripe_rk = "rk_live_" + "G" * 24
    bearer_token = "H" * 32
    cf_token = "I" * 40

    lines = [
        f"google api: {google}",
        f"groq key: {groq}",
        f"xai key: {xai}",
        f"stripe sk: {stripe_sk}",
        f"stripe test: {stripe_test}",
        f"stripe pk: {stripe_pk}",
        f"stripe rk: {stripe_rk}",
        f"Authorization: Bearer {bearer_token}",
        f"X-Auth-Email: test@example.com",
        f"X-Auth-Key: {cf_token}",
    ]
    text = "\n".join(lines)
    out, findings = s.scrub(text)

    for raw in [google, groq, xai, stripe_sk, stripe_test, stripe_pk, stripe_rk,
                bearer_token, cf_token]:
        assert raw not in out, f"leaked: {raw[:16]}..."

    expected_patterns = {
        "GOOGLE_API_KEY", "GROQ_KEY", "XAI_KEY",
        "STRIPE_LIVE_SK", "STRIPE_TEST_SK", "STRIPE_PK_LIVE", "STRIPE_RK_LIVE",
        "AUTH_BEARER", "CLOUDFLARE_TOKEN",
    }
    seen = {f.pattern_name for f in findings}
    missing = expected_patterns - seen
    assert not missing, f"patterns not triggered: {missing}"


def test_false_positive_google_api_key_wrong_length(s):
    # AIza + 34 chars (one short) must NOT match GOOGLE_API_KEY
    too_short = "AIzaSyAbcDefGhiJklMnoPqrStUvWxYz1234"  # 38 chars total
    out, findings = s.scrub(f"key={too_short} end")
    google_findings = [f for f in findings if f.pattern_name == "GOOGLE_API_KEY"]
    assert not google_findings, f"false positive GOOGLE_API_KEY on {too_short}"

    # AIza + 36 chars (one too many) must NOT match (exact 35 required)
    too_long = "AIzaSyAbcDefGhiJklMnoPqrStUvWxYz123456"  # 40 chars total
    out2, findings2 = s.scrub(f"key={too_long} end")
    google_findings2 = [f for f in findings2 if f.pattern_name == "GOOGLE_API_KEY"]
    assert not google_findings2, f"false positive GOOGLE_API_KEY on {too_long}"


def test_false_positive_groq_wrong_prefix(s):
    # A 56-char string starting with "gsk-" (dash not underscore) must NOT match
    not_groq = "gsk-" + "A" * 52
    out, findings = s.scrub(f"tag {not_groq} end")
    groq_findings = [f for f in findings if f.pattern_name == "GROQ_KEY"]
    assert not groq_findings, f"false positive GROQ_KEY on {not_groq}"


def test_auth_bearer_too_short_not_matched(s):
    # Tokens shorter than 20 chars must NOT be flagged as AUTH_BEARER
    short_token = "shorttoken12345"  # 15 chars
    text = f"Authorization: Bearer {short_token}"
    _, findings = s.scrub(text)
    bearer_findings = [f for f in findings if f.pattern_name == "AUTH_BEARER"]
    assert not bearer_findings, f"AUTH_BEARER false positive on short token"


def test_new_patterns_no_overlap_with_hex(s):
    """New high-confidence patterns must claim their ranges before HEX_API."""
    # Google API key contains no pure hex, but GROQ_KEY body could be hex-ish.
    groq = "gsk_" + "a" * 52  # lowercase hex chars in body
    out, findings = s.scrub(groq)
    names = [f.pattern_name for f in findings]
    assert "GROQ_KEY" in names, "GROQ_KEY not matched"
    assert names.count("GROQ_KEY") == 1
    # HEX_API must not also fire on the same span
    assert "HEX_API" not in names, "HEX_API stole GROQ_KEY span"


# ============================================================
# New pattern tests (MP-SEC-20260411-02) — scrubber coverage gaps
# ============================================================


def test_kraken_api_key(s):
    # Freqtrade env var form: FREQTRADE__EXCHANGE__KEY=<56-char public key>
    secret = "A" * 56
    text = f"FREQTRADE__EXCHANGE__KEY={secret}"
    _assert_redacted(s, text, "KRAKEN_API_KEY", secret)


def test_kraken_api_secret(s):
    # Freqtrade env var form: FREQTRADE__EXCHANGE__SECRET=<base64 private key>
    import base64
    raw_secret = base64.b64encode(b"x" * 64).decode()  # 88 base64 chars
    text = f"FREQTRADE__EXCHANGE__SECRET={raw_secret}"
    _assert_redacted(s, text, "KRAKEN_API_KEY", raw_secret)


def test_kraken_false_positive_no_context(s):
    # A long base64 string WITHOUT Kraken context must NOT trigger KRAKEN_API_KEY
    import base64
    benign = base64.b64encode(b"y" * 64).decode()
    text = f"some_other_key={benign}"
    _, findings = s.scrub(text)
    kraken_findings = [f for f in findings if f.pattern_name == "KRAKEN_API_KEY"]
    assert not kraken_findings, f"false positive KRAKEN_API_KEY: {benign[:20]}"


def test_bunq_token(s):
    # BUNQ_ACCESS_TOKEN=<64-char token>
    token = "B" * 64
    text = f"BUNQ_ACCESS_TOKEN={token}"
    _assert_redacted(s, text, "BUNQ_TOKEN", token)


def test_bunq_api_key(s):
    # bunq_api_key = <token>
    token = "C" * 48
    text = f"bunq_api_key = {token}"
    _assert_redacted(s, text, "BUNQ_TOKEN", token)


def test_bunq_false_positive_no_context(s):
    # A 64-char alphanumeric string without bunq context must NOT trigger BUNQ_TOKEN
    benign = "D" * 64
    text = f"access_token = {benign}"
    _, findings = s.scrub(text)
    bunq_findings = [f for f in findings if f.pattern_name == "BUNQ_TOKEN"]
    assert not bunq_findings, "false positive BUNQ_TOKEN on generic access_token"


def test_stalwart_smtp_password(s):
    password = "Sup3rS3cur3Passw0rd!"
    text = f"SMTP_PASSWORD={password}"
    _assert_redacted(s, text, "STALWART_SECRET", password)


def test_stalwart_admin_secret(s):
    secret = "stalwartAdminSecret123XYZ"
    text = f"STALWART_ADMIN_SECRET={secret}"
    _assert_redacted(s, text, "STALWART_SECRET", secret)


def test_stalwart_false_positive_short(s):
    # Passwords shorter than 12 chars must NOT trigger STALWART_SECRET
    short_pw = "short"
    text = f"SMTP_PASSWORD={short_pw}"
    _, findings = s.scrub(text)
    stalwart_findings = [f for f in findings if f.pattern_name == "STALWART_SECRET"]
    assert not stalwart_findings, "false positive STALWART_SECRET on short value"


def test_pg_dsn_no_scheme(s):
    # Shortform DSN used in docker-compose build args: pd:pd@pg:5432/pd_prod
    secret = "pd:pd@pg:5432/pd_prod"
    text = f"DATABASE_URL={secret}"
    out, findings = s.scrub(text)
    assert "pd:pd@pg" not in out, f"PG DSN leaked: {out}"
    assert any(f.pattern_name == "PG_DSN_NO_SCHEME" for f in findings), (
        f"PG_DSN_NO_SCHEME not triggered on {secret}: {findings}"
    )


def test_pg_dsn_no_scheme_pgbouncer(s):
    secret = "jobfinder:jobfinder@pgbouncer:6432/jobfinder"
    text = f"--build-arg DATABASE_URL={secret} ."
    out, findings = s.scrub(text)
    assert "jobfinder:jobfinder@pgbouncer" not in out, f"PG DSN leaked: {out}"
    assert any(f.pattern_name == "PG_DSN_NO_SCHEME" for f in findings)


def test_pg_dsn_no_scheme_localhost(s):
    secret = "user:secretpass@localhost/mydb"
    out, findings = s.scrub(secret)
    assert "secretpass@localhost" not in out, f"PG DSN leaked: {out}"
    assert any(f.pattern_name == "PG_DSN_NO_SCHEME" for f in findings)


def test_pg_dsn_no_scheme_false_positive_external_host(s):
    # DSN pointing to external host must NOT be flagged by PG_DSN_NO_SCHEME
    # (it should be caught by DB_URL with scheme, or not at all)
    text = "user:pass@db.example.com:5432/prod"
    _, findings = s.scrub(text)
    pg_findings = [f for f in findings if f.pattern_name == "PG_DSN_NO_SCHEME"]
    assert not pg_findings, f"false positive PG_DSN_NO_SCHEME on external host: {text}"


# --- ARCH-08-20260425: Sentry / Tavily / Brave / npm / Cohere -----------------

def test_sentry_dsn(s):
    secret = "https://abcdef0123456789abcdef0123456789@o123456.ingest.sentry.io/4509876"
    out, findings = s.scrub(secret)
    assert "abcdef0123456789abcdef0123456789" not in out
    assert any(f.pattern_name == "SENTRY_DSN" for f in findings)


def test_sentry_dsn_in_env(s):
    text = "SENTRY_DSN=https://1234567890abcdef1234567890abcdef@o9.ingest.sentry.io/42"
    out, findings = s.scrub(text)
    assert "1234567890abcdef" not in out
    assert any(f.pattern_name == "SENTRY_DSN" for f in findings)


def test_tavily_key(s):
    secret = "tvly-abcdef1234567890ABCDEFabcdef1234"
    out, findings = s.scrub(secret)
    assert secret not in out
    assert any(f.pattern_name == "TAVILY_KEY" for f in findings)


def test_tavily_key_in_text(s):
    # In a free-standing position the Tavily key is detected by its prefix.
    text = "Set TAVILY_API_KEY=tvly-abcdef1234567890ABCDEFabcdef1234 in env"
    out, findings = s.scrub(text)
    assert "tvly-abcdef1234567890ABCDEFabcdef1234" not in out
    assert any(f.pattern_name == "TAVILY_KEY" for f in findings)


def test_tavily_key_via_bearer_header_still_scrubbed(s):
    # In a Bearer header, AUTH_BEARER captures it first (broader pattern).
    # The important contract: the secret is redacted (regardless of label).
    text = "Authorization: Bearer tvly-abcdef1234567890ABCDEFabcdef1234 next"
    out, _ = s.scrub(text)
    assert "tvly-abcdef1234567890ABCDEFabcdef1234" not in out


def test_brave_search_key(s):
    secret = "BSAabcdefghijklmnop1234567890_-XYZqr"
    out, findings = s.scrub(secret)
    assert secret not in out
    assert any(f.pattern_name == "BRAVE_SEARCH_KEY" for f in findings)


def test_brave_short_no_match(s):
    # too short — should not match (requires 30+ chars after BSA)
    text = "BSA12345"
    _, findings = s.scrub(text)
    assert not any(f.pattern_name == "BRAVE_SEARCH_KEY" for f in findings)


def test_npm_token(s):
    secret = "npm_abcdef0123456789ABCDEFabcdef0123456X"  # 36 chars after npm_
    out, findings = s.scrub(secret)
    assert secret not in out
    assert any(f.pattern_name == "NPM_TOKEN" for f in findings)


def test_cohere_key_with_context(s):
    secret = "1234567890abcdef1234567890ABCDEF12345678"  # 40 alnum
    text = f"COHERE_API_KEY={secret}"
    out, findings = s.scrub(text)
    assert secret not in out
    assert any(f.pattern_name == "COHERE_KEY" for f in findings)


def test_cohere_key_co_api_alias(s):
    secret = "abcdef1234567890abcdef1234567890ABCDEF12"  # 40 alnum
    text = f"CO_API_KEY: {secret}"
    out, findings = s.scrub(text)
    assert secret not in out
    assert any(f.pattern_name == "COHERE_KEY" for f in findings)


def test_cohere_no_context_no_match(s):
    # 40 alnum chars without env-name context should NOT trigger Cohere
    text = "abcdef1234567890abcdef1234567890ABCDEF12"
    _, findings = s.scrub(text)
    cohere_findings = [f for f in findings if f.pattern_name == "COHERE_KEY"]
    assert not cohere_findings
