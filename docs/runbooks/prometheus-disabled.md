# Prometheus — Disabled

## Status

Prometheus snap is **disabled** on VPS as of 2026-05-04.

```bash
sudo snap list prometheus
# Name        Version  Rev  Tracking  Publisher    Notes
# prometheus  2.37.0   86   2/stable  canonical**  disabled
```

## Why disabled

1. **Duplicate coverage.** The `status` service (Go, `services/status/`) already
   monitors all containers, HTTP endpoints, Cloudflare tunnel health, disk, Redis, and PostgreSQL.
   Prometheus added no additional coverage.

2. **No consumers.** There was no Grafana instance, no alertmanager, and no scrape targets
   configured. Prometheus was collecting nothing and alerting no one.

3. **Port exposure risk.** Prometheus defaulted to `0.0.0.0:9090`. While UFW blocks external
   access, binding on all interfaces is a needless surface. The status service listens on
   `127.0.0.1:8090` and is fronted by Cloudflare Tunnel.

4. **Resource waste.** ~200 MB RSS idle on a server where RAM is shared between 30+ containers.

## How to re-enable (if needed)

If Prometheus is needed in the future (e.g., for Grafana dashboards):

```bash
# Re-enable
sudo snap enable prometheus

# Restrict to loopback only — edit /etc/prometheus/prometheus.yml
# Add: --web.listen-address="127.0.0.1:9090"
sudo snap restart prometheus

# Verify
curl -s http://127.0.0.1:9090/-/healthy
```

Also update the Cloudflare tunnel config to expose `127.0.0.1:9090` if external Grafana access
is required, or use Tailscale for internal access only.

## Monitoring alternatives

All production monitoring is handled by:

- **Status service:** https://status.example.com — Docker container health, HTTP endpoints, Cloudflare, Redis, PostgreSQL, backup integrity
- **Telegram alerts:** `@yourbot` — nightly reports + threshold alerts via status healer
- **Infisical:** secrets rotation alerts
