"""
MemPalace SSE Auth Proxy — thin bearer-token gate in front of mcp-proxy.

Listens on 0.0.0.0:8032, checks Authorization: Bearer <MEMPALACE_BEARER_TOKEN>,
then reverse-proxies the SSE stream to mcp-proxy on 127.0.0.1:8033.

Uses only stdlib + httpx (already pulled in by mcp-proxy deps).
"""

import os
import sys
import hmac
import asyncio
import logging
from collections.abc import AsyncGenerator

import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sse-auth-proxy")

UPSTREAM = os.environ.get("UPSTREAM_URL", "http://127.0.0.1:8033")
LISTEN_HOST = os.environ.get("SSE_AUTH_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("SSE_AUTH_PORT", "8032"))

_TOKEN_ENV = os.environ.get("MEMPALACE_BEARER_TOKEN", "")
if not _TOKEN_ENV:
    log.error("MEMPALACE_BEARER_TOKEN not set — refusing to start")
    sys.exit(1)
_TOKEN_BYTES = _TOKEN_ENV.encode()


def _check_auth(request: Request) -> bool:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    provided = auth[len("Bearer "):].encode()
    return hmac.compare_digest(provided, _TOKEN_BYTES)


async def _stream_upstream(request: Request, path: str) -> Response:
    if not _check_auth(request):
        log.warning("401 from %s %s", request.client.host if request.client else "?", path)
        return Response("Unauthorized", status_code=401,
                        headers={"WWW-Authenticate": "Bearer"})

    upstream_url = f"{UPSTREAM}{path}"
    qs = request.url.query
    if qs:
        upstream_url += f"?{qs}"

    # Pass all headers except Authorization (mcp-proxy doesn't need it)
    fwd_headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in ("authorization", "host")}

    async def _generate(client: httpx.AsyncClient, resp: httpx.Response) -> AsyncGenerator[bytes, None]:
        async for chunk in resp.aiter_bytes(chunk_size=None):
            yield chunk

    client = httpx.AsyncClient(timeout=None)
    try:
        req = client.build_request(
            request.method,
            upstream_url,
            headers=fwd_headers,
            content=await request.body() if request.method in ("POST", "PUT", "PATCH") else None,
        )
        resp = await client.send(req, stream=True)

        response_headers = dict(resp.headers)
        response_headers.pop("transfer-encoding", None)

        if "text/event-stream" in resp.headers.get("content-type", ""):
            return StreamingResponse(
                _generate(client, resp),
                status_code=resp.status_code,
                headers=response_headers,
                media_type="text/event-stream",
            )
        content = await resp.aread()
        await client.aclose()
        return Response(content=content, status_code=resp.status_code, headers=response_headers)
    except Exception as exc:
        await client.aclose()
        log.error("upstream error: %s", exc)
        return Response("Bad Gateway", status_code=502)


async def proxy(request: Request) -> Response:
    return await _stream_upstream(request, request.url.path)


app = Starlette(routes=[Route("/{path:path}", proxy, methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])])


if __name__ == "__main__":
    log.info("MemPalace SSE Auth Proxy starting on %s:%s → upstream %s", LISTEN_HOST, LISTEN_PORT, UPSTREAM)
    uvicorn.run(app, host=LISTEN_HOST, port=LISTEN_PORT, log_level="info")
