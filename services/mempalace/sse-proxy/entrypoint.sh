#!/bin/sh
# MemPalace SSE bridge entrypoint:
#   1. Start mcp-proxy (stdio→SSE) on 127.0.0.1:8033 (internal only)
#   2. Start sse_auth_proxy.py on 0.0.0.0:8032 (bearer-token gate)

set -e

PALACE_PATH="${PALACE_PATH:-/data/palace}"
PROXY_INTERNAL_PORT=8033

echo "[sse-bridge] Starting mcp-proxy on 127.0.0.1:${PROXY_INTERNAL_PORT} → mempalace.mcp_server"

python -m mcp_proxy \
    --host 127.0.0.1 \
    --port "${PROXY_INTERNAL_PORT}" \
    -- python -m mempalace.mcp_server --palace "${PALACE_PATH}" &

MCP_PROXY_PID=$!

# Wait for mcp-proxy to be ready (poll /status endpoint)
echo "[sse-bridge] Waiting for mcp-proxy to be ready..."
for i in $(seq 1 15); do
    if python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PROXY_INTERNAL_PORT}/status', timeout=2)" 2>/dev/null; then
        echo "[sse-bridge] mcp-proxy ready after ${i}s"
        break
    fi
    sleep 1
done

echo "[sse-bridge] Starting auth proxy on 0.0.0.0:8032"
exec python /app/sse-proxy/sse_auth_proxy.py
