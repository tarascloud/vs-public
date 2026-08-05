# Security Review: MemPalace (Wave 2)

- **Scope:** MemPalace design (ADR `adr/mempalace`) + implementation as of 2026-04-10 (Wave 2)
- **Task:** `mp_t14` (security)
- **Reviewer:** security agent (VS)
- **Method:** READ-ONLY audit of code, Dockerfile, compose entry, ADR, live VPS state
- **Files in scope:**
  - `docs/adr/mempalace.md`
  - `services/mempalace/Dockerfile`
  - `services/mempalace/ingest_server.py`
  - `services/mempalace/requirements.txt`
  - `services/mempalace/scrubber/{scrubber,patterns,secrets_index,findings,__init__}.py`
  - `services/mempalace/scrubber/tests/test_scrubber.py`
  - `infra/docker-compose.yml` (service `mempalace`)
  - VPS host state: `/opt/docker/mempalace/`, `/opt/docker/secrets/`

---

## 1. Executive Summary

**Overall risk posture: MEDIUM — Go with mitigations before enabling writes from PD/JF (Wave 3).**

The MemPalace design in the ADR is sound: single-tenant, Tailscale/SSH-only, scrubber gate on ingestion, defense-in-depth against secret leaks, explicit threat model, layered L0/L1/L2 memory architecture. Wave 2 implementation (`mp_t02` scrubber, `mp_t03` Docker+compose) matches the design intent: scrubber is correct and reasonably thorough; FastAPI sidecar binds to localhost-only, uses Bearer + `hmac.compare_digest`, runs as non-root UID 1000; compose binds `127.0.0.1:8031:8030` and mounts `/opt/docker/secrets` read-only.

There are **no CRITICAL findings**, but several **HIGH** items that should be closed before Wave 3 enables writes from PD/JF or the Mac SSH MCP tunnel is opened:

- Container is not hardened (no `read_only`, no `cap_drop`, no `no-new-privileges`, no PID limit).
- `/opt/docker/secrets` host dir is `755 owner:owner` — wider than ADR §6.1 "700/600".
- Scrubber default `secrets_dir=/opt/docker/secrets` on the host has never been compared against the in-container mount path `/secrets` — works only because `ingest_server.py` sets `secrets_dir` from `SECRETS_DIR` env, but documentation / default class value is misleading and could regress.
- No rate limiting on ingest endpoints; no audit log of ingest events (ADR §9.1 step 5 promises `audit.log`, not implemented).
- Scrubber coverage gaps on several common provider tokens (Cloudflare, Stripe, Twilio, Google API keys, Groq `gsk_`, xAI `xai-`) despite ADR §9.1 listing some of them.
- Failure-open behavior when scrubber cannot initialize (`_scrubber = None` → text passes through un-scrubbed with only a stderr warning).
- Container is **not yet running** on VPS (image present: `mempalace:latest` 710 MB; no `.mempalace.env` file; no live endpoint on `127.0.0.1:8031`). Several runtime checks below are therefore "not yet deployed".

These are all fixable without architectural changes. I recommend Owner schedules a "hardening pass" task as a blocker on Wave 3 / `mp_t11`+.

---

## 2. Findings Table

Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO.

| # | Severity | Category | Description | Recommendation |
|---|---|---|---|---|
| F-01 | HIGH | Container hardening | `docker-compose.yml` service `mempalace` has `mem_limit: 2g` but no `read_only: true`, no `security_opt: [no-new-privileges:true]`, no `cap_drop: [ALL]`, no `pids_limit`, no `tmpfs` for writable temp. Attacker with code exec in the container can install tools, write anywhere in the FS layers, and keep caps like `NET_RAW`. | Add `read_only: true`, `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, `pids_limit: 256`, and a `tmpfs` mount at `/tmp` for uvicorn. Data volumes `/data/palace` and `/data/outbox` remain writable. |
| F-02 | HIGH | Secrets exposure | Host dir `/opt/docker/secrets` is `755 owner:owner` (world-readable), not `700` as ADR §6.1 implies for palace. Individual `.env` files are a mix of `600`, `640`, `644`, and several are `root:root` (`.infra.env`, `.sh.env`). Bind-mounting the entire dir `:ro` into mempalace container means the mempalace process (UID 1000) sees everything it has POSIX read access to — including `.pd-prod.env`, `.jobfinder.env`, `.shuleansky.env`, etc. That is strictly more than the scrubber needs. | Option A (preferred): create `/opt/docker/secrets/mempalace-scrub/` symlink-farm or directory containing **copies** of just the env files the scrubber should index, owned `owner:mempalace 640`, and bind that in instead of the full secrets dir. Option B: tighten `/opt/docker/secrets` to `750 root:owner`, make all `.env` `640 root:owner`, and add the mempalace container user to group `owner` (less clean). Either way, document the decision in ADR §9.1 step 3. |
| F-03 | HIGH | Scrubber coverage gaps | `patterns.py` does not cover: Cloudflare API tokens (`cf-...` / 40-char), Stripe (`sk_live_`, `pk_live_`, `rk_live_`), Twilio (`AC[0-9a-f]{32}` + `SK...`), Groq (`gsk_...`), xAI (`xai-...`), Google API keys (`AIza[0-9A-Za-z_-]{35}`), Google service-account JSON (`"private_key":`), Azure (`DefaultEndpointsProtocol=...;AccountKey=`), Datadog `DDOG_` etc. ADR §9.1 explicitly lists Groq/xAI and Bearer tokens in HTTP headers — both absent from code. | Extend `PATTERNS` to cover at minimum: Google API key, Cloudflare token, Stripe live/test, Groq, xAI, Twilio, Google SA JSON blob, Azure connection string, generic `Authorization: Bearer ...` header. Add unit tests. |
| F-04 | HIGH | Fail-open on scrubber | `ingest_server.py` lines 37–43: if `Scrubber(...)` raises (e.g., filesystem change, import error, secrets dir missing), `_scrubber = None` and later `_scrub()` returns text **unchanged**, only a stderr warning is printed. No alert, no refusal of ingest. An operator who does not tail stderr will never know. | Change failure mode to fail-closed: if scrubber fails to initialize, refuse all `/ingest/*` with 503 until manually reset. Regex patterns should always succeed — only the env-index load should be allowed to fail gracefully (it already does via `try/except` in `load_env_values`), but the regex path must be mandatory. Log a structured warning to an audit log and optionally Telegram. |
| F-05 | HIGH | No ingest audit log | ADR §9.1 step 5 commits to an append-only `~/.mempalace/audit.log` (timestamp, source, pattern matched, redaction count). `ingest_server.py` does **not** write it; it only calls `logging.getLogger("mempalace.ingest").info(...)` which goes to stdout and is lost on container recreate (docker log max 5m/2 files). | Implement an append-only log writer to `/data/palace/audit.log` (mode 600, UID 1000) capturing per request: ts, endpoint, wing, room, hall, source, source_id, content SHA-256, scrubber finding count and pattern names (NOT the redacted bytes). Ensure opened `O_APPEND` and `fsync()` per line. Add a Status.service check that audit log is growing. |
| F-06 | MEDIUM | No rate limiting / brute force | FastAPI sidecar has no rate limiting on `/ingest/*` or `/health`. Even though bound to 127.0.0.1, anything with localhost shell access (other containers on the `backend`/`frontend` Docker networks) can attempt token brute force. `hmac.compare_digest` prevents timing-based leaks, but absent rate limiting a malicious container could saturate CPU / memory. | Add a per-IP token bucket (e.g., 10 req/s, 100 burst) using `slowapi` or a simple in-memory deque. Alternatively, restrict network membership: service is on both `backend` and `frontend` networks, but nothing documented needs it on `frontend` — remove if PD/JF reach it through `backend`. |
| F-07 | MEDIUM | Dual-network attack surface | Service joins both `backend` AND `frontend` Docker networks (docker-compose lines 657–659). `frontend` is typically the Cloudflare-tunneled network; MemPalace explicitly must NOT be reachable from there (ADR §3.3 last bullet, §5.5 "External — None"). | Drop `frontend` from the networks list. Verify PD, JF, pd-scheduler, pd-bot all reach mempalace through `backend`. |
| F-08 | MEDIUM | Bind-mount 0.0.0.0 inside container | `uvicorn.run(host="0.0.0.0", ...)` is fine because the only published port is `127.0.0.1:8031:8030`, but any other container on the same Docker network can reach `mempalace:8030` directly without the host-side `127.0.0.1` guard. Combined with F-07, the effective attack surface is "any container on frontend or backend that has the bearer token or tries to brute force it". | Either keep `0.0.0.0` (needed for other containers on `backend`) but ensure network membership is minimal (F-07) and rate limited (F-06), or move to a dedicated `mempalace` internal network that only the specific ingestion-source services join. |
| F-09 | MEDIUM | Scrubber env-index inside container uses SECRETS_DIR default `/secrets` but loader uses os.walk-style iter | `secrets_index.py` iterates only files whose `name.endswith(".env") or ".env" in name`. Files like `.pd-prod.env.bak` (present on VPS!) match and are indexed. That is actually a *good* side effect (backups are scanned), but files like `age-recipients.txt` are ignored even though they contain age public keys — fine because those are public. More concerning: the `.bak` values might be stale rotated secrets; a stale secret landing in the index means we will redact text that contains a value that is no longer sensitive, which is harmless. **No functional issue — informational.** | None. Leave as-is, but document that `.env*` glob is intentionally broad. |
| F-10 | MEDIUM | Scrubber edge case — chunk boundary | Scrubber is applied to `req.content` as a whole, so secrets straddling chunks from an upstream source are NOT a problem for this endpoint. However, when an upstream ingester (e.g., mp_t06 Claude Code hook, mp_t08 Shuleansky) splits conversations into chunks *before* sending, a secret that spans two chunks will not match any regex and will pass through. | Document in `mp_t06`..`mp_t10` that chunking MUST happen on message boundaries, never mid-line. Additionally, consider having ingest-side hooks call scrubber *before* chunking. |
| F-11 | MEDIUM | `HEX_API` pattern is low-confidence and very broad | `re.compile(r"\b[A-Fa-f0-9]{32,64}\b")` will match commit SHAs (40 hex), MD5/SHA-256 hashes in logs, UUIDs-without-dashes. Test `test_false_positives_clean_markdown` passes only because the test input has no 32+ hex blob. Real Claude Code transcripts contain git commit SHAs constantly → they will be redacted as `<REDACTED:HEX_API>`, hurting search recall. | Either remove HEX_API entirely (rely on env-index for real secrets) or narrow it: require "key"/"token"/"secret" keyword within N bytes before the match, or exclude exactly 40-char all-lowercase (git SHA shape). Ship unit tests for git SHA, MD5, SHA-256 hash → NOT redacted. |
| F-12 | MEDIUM | No Infisical token rotation documented | ADR §5.6 mentions "short TTL rotate through Infisical" for `MEMPALACE_INGEST_TOKEN`, but there is no rotation schedule, no Infisical agent template visible for `.mempalace.env`, and on VPS `/opt/docker/secrets/.mempalace.env` does not exist yet (container therefore cannot start in enforcing mode). | Create the Infisical agent template for `.mempalace.env`, set rotation to 30 days, document rotation procedure in `docs/runbooks/mempalace-rotate-token.md`. |
| F-13 | LOW | OPENAI_KEY regex may over-match | `sk-[A-Za-z0-9]{48}(?![A-Za-z0-9])` — but modern OpenAI keys can be 51+ chars, and legacy keys sometimes 51. Will miss newer key formats. | Add explicit `sk-proj-` and `sk-svcacct-` patterns (proj partially covered) and loosen length bound to `{48,}`. |
| F-14 | LOW | JWT pattern risk of false positive | `eyJ...eyJ...` three-part base64url. Could match fake JWTs in documentation. Redacting docs JWTs is harmless but loses readability. | Accept. |
| F-15 | LOW | Dockerfile uses `python:3.12-slim` (latest) without digest pin | Reproducible builds require digest pin. Current ADR §11 mentions "version pinning" as mitigation for upstream chroma risk but Dockerfile base is floating tag. | Pin: `FROM python:3.12-slim@sha256:<digest>`. Update via Dependabot or manual quarterly review. |
| F-16 | LOW | `requirements.txt` ranges (not pinned) | `mempalace>=3.1.0`, `chromadb>=0.5.0,<0.7`, `fastapi>=0.111,<0.113`, etc. Using ranges means two builds of the same Dockerfile can differ. Supply-chain risk is small (single-tenant) but reproducibility matters for audit. | Generate `requirements.lock` via `pip-compile` and COPY it in the Dockerfile instead of the range file. |
| F-17 | LOW | `curl` kept in final image | Dockerfile installs `curl` for `HEALTHCHECK`. Curl is a useful post-exploitation tool (exfil). | Replace HEALTHCHECK with a Python one-liner: `python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8030/health',timeout=3).status==200 else 1)"`. Drop curl. |
| F-18 | LOW | Palace data permissions | Host paths `/opt/docker/mempalace/palace` and `/opt/docker/mempalace/outbox` are `775 owner:owner`. ADR §6.1 requires `700`. World-exec and group-write are not needed. | `chmod 700 /opt/docker/mempalace/palace /opt/docker/mempalace/outbox`, ensure owned by UID 1000 to match container. |
| F-19 | LOW | Data at rest not encrypted | Palace lives on VPS ext4 without at-rest encryption. Threat: disk theft / RMA. Consistent with the rest of VS infra (PG not encrypted either), so not a regression. | Accept. Mitigate via physical security + age-encrypted off-site backup (ADR §6.5). Document in ADR §5.6. |
| F-20 | LOW | No backup implementation yet | ADR §6.5 specifies `tar czf ... ~/.mempalace/palace/` + age encryption + NAS rsync. As of 2026-04-10, no cron entry, no age keys referenced, no `mp_t11` artifact. | Out of scope for `mp_t14` (blocked by mp_t11). Flag as action item. |
| F-21 | INFO | `POST /ingest/*` is `mempalace.add_memory(...)` positional | If upstream `mempalace` library changes its `add_memory` signature, sidecar breaks silently at ingest time, not at import time. | Write a thin wrapper or assert on library version at startup. |
| F-22 | INFO | Request size not limited | No `max_request_size` on FastAPI; a single 100 MB content POST could OOM the 2 GB container. | Add `uvicorn --limit-max-requests` / starlette middleware to cap at e.g. 4 MB per request. |
| F-23 | INFO | No CSRF concern | API uses Bearer, not cookies → no CSRF. Good. | — |
| F-24 | INFO | SSH MCP runner not yet implemented | `/opt/mempalace/bin/mcp-stdio-wrapper` (ADR §5.2) does not exist. That will be reviewed in a future pass under `mp_t11`. | Flag as action item for Wave 3 review. |
| F-25 | INFO | MCP SSH key whitelisting untested | No `authorized_keys` entry for `mempalace-mac-key` exists on VPS yet. SSH_ORIGINAL_COMMAND injection scenario (ADR §12 hook 2) is therefore theoretical and will be tested in Wave 3. | Not yet deployed. |

---

## 3. ADR §12 Security Review Hooks — Pass/Fail

ADR §12 enumerates 10 must-check items for `mp_t14`. Status as of Wave 2:

| # | Hook | Status | Notes |
|---|---|---|---|
| 1 | Secret scrubbing unit tests + red team inputs | **PASS (partial)** | 18 tests cover all regex patterns and the env-index pathway. Missing red-team inputs for patterns listed as gaps in F-03 (no tests fail because patterns do not exist). Also missing adversarial tests: secrets with zero-width chars, unicode confusables, CR/LF injection, gzip/base64-encoded secrets. |
| 2 | SSH forced-command escape attempts | **N/A — not yet deployed** | `/opt/mempalace/bin/mcp-stdio-wrapper` does not exist on VPS. No `authorized_keys` entry. Will re-test in Wave 3. The shell script shape in ADR §5.2 is correct (ignores `SSH_ORIGINAL_COMMAND`, uses `set -euo pipefail`, no `eval`). |
| 3 | Ingestion bearer token rotation + timing-safe comparison | **PASS (comparison) / FAIL (rotation)** | `hmac.compare_digest(sha256(a), sha256(b))` is timing-safe and length-safe. Rotation is not implemented (F-12). `.mempalace.env` file does not yet exist on VPS. |
| 4 | ChromaDB query injection | **N/A (search not exposed)** | Sidecar has no `/search` endpoint. MCP path (which does call Chroma) is not yet enabled. Review deferred to Wave 3. Chroma queries use metadata filter dicts, not string concat — low intrinsic risk. |
| 5 | Upstream issues #100 (Chroma pin), #110 (shell injection hooks), #74 (ARM64 segfault) | **MIXED** | #100: `chromadb>=0.5.0,<0.7` range is NOT a pin; bump to exact once stable (F-16). #110: we do not use MemPalace built-in hooks in the sidecar path — safe for ingestion. Need to re-check when MCP tunnel is enabled. #74: not applicable (VPS is amd64). |
| 6 | File permissions 700/600 | **FAIL** | `/opt/docker/mempalace/palace` and `/outbox` are `775`, `/opt/docker/secrets` is `755`. See F-02, F-18. |
| 7 | Audit log append-only, protected from MCP tools | **FAIL** | No audit log exists. See F-05. |
| 8 | Backup encryption (age) restore drill | **N/A — not yet deployed** | See F-20. Blocked by `mp_t11`. |
| 9 | MCP tool whitelist (read-only from sidecar) | **PASS** | Sidecar exposes only 3 write endpoints + `/health`. No search. No tool listing. No `mempalace_purge` or KG mutation. |
| 10 | Drawer path traversal (`source_id` sanitization) | **UNVERIFIED** | `IngestConvoRequest.source_id` is free-form `Optional[str]` with no max length, no character filter. It is passed into `metadata["source_id"]` which MemPalace may or may not use in a file path. **Action:** verify how upstream `mempalace.add_memory` uses metadata; if it ever forms a drawer filename from `source_id`, a value like `../../../../etc/passwd` is a traversal risk. |

**Overall hooks score: 3 PASS, 2 partial PASS, 2 FAIL, 3 N/A-blocked-by-deployment.**

---

## 4. Scrubber Coverage Gaps (detail)

Gaps separate from the general findings list, because the scrubber is the hard security boundary and ADR §9 calls it a "hard requirement".

| Provider / Secret type | Pattern | Currently caught? | Criticality | Notes |
|---|---|---|---|---|
| OpenAI classic `sk-…48` | yes | ✔ | — | |
| OpenAI project `sk-proj-…64+` | yes | ✔ | — | |
| OpenAI service account `sk-svcacct-…` | no | — | MEDIUM | Add. |
| Anthropic `sk-ant-api03-…90+` | yes | ✔ | — | |
| Google OAuth `GOCSPX-…28` | yes | ✔ | — | |
| Google API key `AIza[0-9A-Za-z_-]{35}` | no | — | HIGH | Used by PD (Gemini), JF. Add. |
| Google service account JSON `"private_key": "-----BEGIN...` | partial | via SSH_KEY regex | HIGH | Only catches the key block; leaves `client_email`, `private_key_id` intact which may still be sensitive. Add an explicit JSON-SA pattern. |
| GitHub PAT (classic/fine) | yes | ✔ | — | |
| AWS AKIA | yes | ✔ | — | |
| AWS SECRET (40 base64) | no | — | HIGH | Current `HEX_API` won't catch base64. Add. |
| Azure connection string | no | — | MEDIUM | Add. |
| Slack xox* | yes | ✔ | — | |
| Telegram bot token | yes | ✔ | — | |
| JWT | yes | ✔ | — | |
| SSH private key (any format) | yes | ✔ | — | |
| Generic DB URL | yes | ✔ | — | |
| Stripe `sk_live_`, `sk_test_`, `rk_live_`, `pk_live_` | no | — | HIGH | Shuleansky may discuss them. Add. |
| Twilio `AC[hex]{32}` SID + `SK[hex]{32}` | no | — | MEDIUM | Add. |
| Cloudflare API token (40 chars) | no | — | HIGH | CF is core infra. Add. |
| Cloudflare global API key (37 chars hex) | via HEX_API (low conf) | ~partial | HIGH | Promote to high-confidence. |
| Groq `gsk_…` | no | — | HIGH | PD uses Groq. ADR §9.1 explicitly mentions; missing. |
| xAI `xai-…` | no | — | MEDIUM | ADR §9.1 mentions; missing. |
| DigitalOcean `dop_v1_…` | no | — | LOW | |
| Linear / Notion / HF / Datadog / Sentry DSN | no | — | LOW-MEDIUM | Pattern group "API tokens" worth adding. |
| Generic `Authorization: Bearer <32+ chars>` | no | — | MEDIUM | ADR §9.1 mentions; missing. Easy add. |
| Email + password pair heuristic | no | — | LOW | ADR §9.1 mentions; heuristic is hard, acceptable gap. |

**Recommendation:** extend `patterns.py` as a follow-up task. All additions are pattern-only, no architecture change.

---

## 5. Attack Scenarios Considered

| Scenario | Mitigation status | Notes |
|---|---|---|
| External attacker scans `*.example.com` for `/ingest/*` | **BLOCKED** | Port bound to `127.0.0.1:8031`, not on CF tunnel list. Verified in ADR §5.5 and compose line 644. |
| Container-to-container attacker on `frontend` network brute-forces token | **PARTIAL** | No rate limit (F-06); timing-safe compare prevents leak but not DoS / brute attempts. Fix: F-06 + F-07. |
| Compromised `mempalace` process attempts to escape container | **PARTIAL** | Non-root UID 1000, but container is not `read_only`, has full capabilities, no `no-new-privileges` (F-01). Escape via kernel 0-day would run as UID 1000 on host, limited. |
| Malicious ingest payload contains SQL-injection-like string aimed at Chroma | **LIKELY BLOCKED** | Chroma accepts Python dict filters, not SQL. Sidecar does not concatenate strings. Low risk. |
| Ingest payload contains secret; scrubber misses it → secret stored in drawer | **MITIGATED with gaps** | Scrubber works for listed patterns, F-03 lists gaps. Defense in depth: env-index catches any verbatim value from `/opt/docker/secrets`. Weekly `rg` hunt (ADR §9.2) is not yet implemented. |
| Attacker sends 100 MB content to OOM container | **OPEN** | F-22: no request size cap. |
| Attacker brute-forces bearer token | **MITIGATED** | `hmac.compare_digest` is constant-time; 256-bit token assumed → infeasible. Rate limit still desired. |
| Path traversal via `source_id: "../../etc/passwd"` | **UNVERIFIED** | F-10 hook item #10. Needs upstream library check. |
| Scrubber init fails, ingest continues unscrubbed | **OPEN** | F-04, fail-open. |
| Mac SSH key stolen → read/write palace via MCP | **ACCEPTED (ADR §5.6)** | Key in Keychain + 90-day rotation + audit log of SSH sessions. |
| Infisical token leak | **PARTIAL** | Not yet rotated (F-12). |
| Docker socket or bind mount of host root | **BLOCKED** | Only data volumes + secrets RO. No `/var/run/docker.sock` mount. Verified in compose. |
| Pull `mempalace:latest` from malicious registry | **OK** | Image built locally on VPS (no external pull). Chain of trust = pip index for Python deps. F-16 improves reproducibility. |

---

## 6. Live State on VPS (2026-04-10)

- Image `mempalace:latest` (710 MB) present, built locally.
- Container **not running**. `docker ps` returns nothing for mempalace.
- Bind-mount host dirs exist (`/opt/docker/mempalace/{palace,outbox}`) but empty and mode `775`.
- `/opt/docker/secrets/.mempalace.env` **does not exist** → container would fail-open on token (ingest_server.py prints warning, all requests get 503 "ingest token not configured"). That is actually the correct fail-closed behavior for the Bearer check. Still, means the service cannot come up functional.
- curl to `http://127.0.0.1:8031/health` → connection refused (expected, not running).
- Network check deferred until service is up.

**Conclusion of live portion:** nothing is exposed because nothing is running. Deployment is currently in a safe "not started" state.

---

## 7. Positive Findings

Things this implementation does right and should be preserved:

- **Non-root container user**, UID/GID 1000 matched to bind-mount owner.
- **`ENTRYPOINT` is the Python sidecar, not a shell** → no `CMD /bin/sh -c …` injection surface.
- **`docs_url=None, redoc_url=None`** → no Swagger UI leak.
- **`hmac.compare_digest` + SHA-256 of both sides** → constant-time comparison even against unequal-length inputs.
- **`503` if token missing** → fail-closed auth configuration.
- **Pydantic schema validation** with explicit `min_length`/`max_length` for wing/room/hall (prevents trivially huge keys).
- **Scrubber ordering**: high-confidence patterns before low-confidence HEX_API, with overlap tracking (`claimed` list) → GitHub PAT won't be stolen by HEX_API (unit-tested).
- **Finding dataclass stores SHA-256 hash of the original match**, not the raw bytes → audit without leak.
- **Secrets dir mounted read-only** (`/opt/docker/secrets:/secrets:ro`).
- **Memory limit** set (`mem_limit: 2g`).
- **Restart policy** `unless-stopped` prevents restart loops on ingest-triggered crashes.
- **Volume definition** in Dockerfile declares intent even when compose is absent.
- **Scrubber imports use relative package path** — no PYTHONPATH abuse.
- **ADR is thorough** — trust boundary, compromise scenarios, fallback design, and §12 hooks are already laid out; this review is just executing them.
- **Unit tests cover every implemented pattern** plus mixed-fixture red team input, env-index, graceful-missing-dir, overlap prevention, and a false-positive sanity test.

---

## 8. Recommendations for Wave 2 → Wave 3

Before starting `mp_t11` (backup drill) / `mp_t12` (JF hook) / Mac SSH MCP tunnel:

**Blocker (must fix, HIGH):**

1. Harden docker-compose (F-01): `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `pids_limit`, `tmpfs /tmp`.
2. Tighten secrets bind or scope scrub-index inputs (F-02).
3. Extend scrubber patterns (F-03) — at minimum Google API key, Cloudflare token, Groq `gsk_`, xAI `xai-`, Stripe, Bearer header. Unit tests for each.
4. Fail-closed scrubber initialization (F-04).
5. Implement append-only audit log (F-05).

**Nice-to-have before Wave 3:**

6. Rate limit on ingest (F-06).
7. Drop `frontend` network (F-07).
8. Verify drawer path traversal behavior of upstream library (Hook 10).
9. Tighten `HEX_API` regex or drop (F-11).
10. Restrict palace dir permissions to 700 (F-18).
11. Provision `.mempalace.env` via Infisical agent (F-12) + rotation runbook.

**Recommendations for `mp_t06..t10` (safe ingest tasks):**

- Ingesters must call scrubber **before chunking** when splitting long content.
- Ingesters must use the existing Pydantic schema (don't bypass the sidecar) — do not import `mempalace.add_memory` directly from other services.
- Each ingester should persist its own last-seen cursor so replay is idempotent (prevents double-ingest on crash).
- Shuleansky transcripts (`mp_t08`) should run scrubber in "aggressive mode" — lower entropy threshold, because transcripts contain OCR/ASR noise in which secrets are more likely to appear out of context.
- Telegram bot ingester (`mp_t09`) must filter out `@yourbot` command arguments that look like tokens (user might paste one in chat).

**For `mp_t11` (backup drill):**

- Back up `/opt/docker/mempalace/palace/` (chroma + drawers + kg.json + audit.log) as a single `tar.gz`.
- Encrypt with `age -R /opt/docker/secrets/age-recipients.txt`.
- Rsync to NAS using `cat | ssh NAS 'cat > …'` pattern (scp doesn't work on Synology).
- Test restore to `/tmp/mempalace-restore-drill/` monthly.

---

## 9. Conclusion

**Go with mitigations.**

MemPalace Wave 2 is ready for internal local ingestion from VPS-side services once the five HIGH findings (F-01..F-05) are resolved. No CRITICAL findings. The trust boundary, transport, non-root execution, and scrubber architecture are all sound. The gaps are predominantly hardening, coverage breadth, and operational completeness (audit log, rotation) — not design flaws.

**DO NOT** open the Mac SSH MCP tunnel or enable PD/JF write-in until:
- F-01 through F-05 are closed, AND
- A second review pass verifies `mp_t11` (backup restore drill) and the SSH forced-command wrapper are in place.

The scrubber, once extended with the F-03 patterns, will be a solid boundary. The single biggest risk right now is the fail-open scrubber behavior (F-04) combined with missing audit log (F-05) — a misconfigured deploy could silently store unscrubbed content with no trace. That combination is why the overall posture is MEDIUM rather than LOW-MEDIUM.

---

## 10. Action Items (for Owner)

- [ ] Create follow-up task `mp_t14a` — "MemPalace hardening: F-01..F-05" as blocker on `mp_t11`/`mp_t12`.
- [ ] Create follow-up task `mp_t14b` — "Scrubber pattern coverage: add provider tokens (F-03)".
- [ ] Decide on secrets dir scoping strategy (F-02 option A vs B).
- [ ] Verify upstream `mempalace.add_memory` path handling of `source_id` (Hook 10).
- [ ] Add weekly `rg` hunt cron per ADR §9.2.
- [ ] Schedule re-review after Wave 3 (`mp_t14` part 2) before cutover in Wave 5.

---

*Generated 2026-04-10 by security agent (mp_t14). READ-ONLY audit — no code modified.*
