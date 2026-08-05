import { requireAuthApi } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight server-side check interval (ms) — only COUNT queries */
const CHECK_INTERVAL = 5_000;
/** Keep-alive heartbeat interval (ms) */
const HEARTBEAT_INTERVAL = 30_000;
/** Max stream duration before client auto-reconnects (ms) */
const MAX_DURATION = 55_000;

export async function GET(request: Request) {
  const _gate = await requireAuthApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  let closed = false;
  let checkTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // Controller already closed
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (checkTimer) clearInterval(checkTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (maxTimer) clearTimeout(maxTimer);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // Track last check time — only notify client when something changed
      let lastCheck = Date.now();

      const checkForUpdates = async () => {
        if (closed) return;
        try {
          const since = new Date(lastCheck);
          const [taskCount, initCount] = await Promise.all([
            prisma.task.count({ where: { updatedAt: { gte: since } } }),
            prisma.initiative.count({ where: { updatedAt: { gte: since } } }),
          ]);
          if (taskCount > 0 || initCount > 0) {
            send(
              `data: ${JSON.stringify({ type: "refresh", tasks: taskCount, initiatives: initCount })}\n\n`,
            );
          }
          lastCheck = Date.now();
        } catch (err) {
          console.error("[SSE] check error:", err);
          // Don't close — next check will retry
        }
      };

      // Check for updates every CHECK_INTERVAL
      checkTimer = setInterval(checkForUpdates, CHECK_INTERVAL);

      // Keep-alive heartbeat to prevent proxy timeouts
      heartbeatTimer = setInterval(() => {
        send(": heartbeat\n\n");
      }, HEARTBEAT_INTERVAL);

      // Close stream after MAX_DURATION — browser EventSource will auto-reconnect
      maxTimer = setTimeout(close, MAX_DURATION);

      // Listen for client disconnect
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      if (checkTimer) clearInterval(checkTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (maxTimer) clearTimeout(maxTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
