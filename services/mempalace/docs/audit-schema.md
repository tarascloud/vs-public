# MemPalace audit.log schema

**Path (container):** `/data/palace/audit.log`
**Path (host):** `/opt/docker/mempalace/palace/audit.log`
**Format:** JSON Lines (one record per line, UTF-8).
**Permissions:** `0600`, owned by container UID 1000.
**Durability:** line-buffered + `fsync()` per write.
**Rotation:** `logrotate` daily, keep 14, compress (MP-IMPROVE-20260411-11).

Implemented in `mempalace/audit.py` → `AuditLogger`.

## Record types

All records share:

| Field | Type | Description |
|-------|------|-------------|
| `ts` | int | Unix epoch seconds of the write |
| `op` | string | One of `ingest`, `startup`, `scrubber_fail` |

### `op: "ingest"`

Written from FastAPI ingest endpoints in `mempalace/ingest_server.py`:

- `/ingest/convo`
- `/ingest/decision`
- `/ingest/transcript`

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | string | Request path, e.g. `/ingest/convo` |
| `source` | string | Logical sender (from `req.source`), e.g. `claude-code`, `pd-bot` |
| `client_ip` | string | `request.client.host`; `"unknown"` if not present. **MP-SEC-20260411-03** |
| `forwarded_for` | string | `X-Forwarded-For` header verbatim; `""` if absent. **MP-SEC-20260411-03** |
| `user_agent` | string | `User-Agent` header; `""` if absent. **MP-SEC-20260411-03** |
| `bytes_in` | int | UTF-8 byte length of the raw request content (pre-scrub) |
| `bytes_redacted` | int | Bytes removed/replaced by the scrubber |
| `findings_count` | int | Number of scrubber pattern hits |
| `status` | string | `ok`, `error`, or `scrubber_unavailable` |
| `error` | string or null | Error message when `status != "ok"` |

### Example record (MP-SEC-20260411-03)

```json
{
  "ts": 1776800421,
  "op": "ingest",
  "endpoint": "/ingest/convo",
  "source": "claude-code",
  "client_ip": "127.0.0.1",
  "forwarded_for": "1.2.3.4",
  "user_agent": "curl/8.4.0",
  "bytes_in": 842,
  "bytes_redacted": 0,
  "findings_count": 0,
  "status": "ok",
  "error": null
}
```

### `op: "startup"`

Written once on `AuditLogger.log_startup()` during FastAPI startup.

| Field | Type |
|-------|------|
| `scrubber_ok` | bool |
| `secrets_dir` | string |
| `secrets_count` | int |

### `op: "scrubber_fail"`

Written on fail-closed scrubber initialization failure.

| Field | Type |
|-------|------|
| `error` | string |

## Observability use cases

With `client_ip`, `forwarded_for`, and `user_agent` captured, you can:

- Detect unauthorized ingest attempts from unexpected IPs (the sidecar binds `127.0.0.1:8031` but misconfig could expose it).
- Correlate audit events with reverse-proxy logs via `X-Forwarded-For`.
- Identify which agent / CLI version wrote a given drawer (`user_agent`).
- Alert on sudden fan-out of `source` values from a single `client_ip`.

## ADR link

ADR §9.1 step 5 — tamper-evident audit includes: timestamp, source, pattern matched
(`findings_count`), redaction count (`bytes_redacted + findings_count`).
MP-SEC-20260411-03 extends this with request provenance (`client_ip`, `forwarded_for`, `user_agent`).
