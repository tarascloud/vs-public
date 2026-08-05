import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitOrNull } from "@/lib/rate-limit";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

export const dynamic = "force-dynamic";

type ActionId =
  | "sync"
  | "backup"
  | "deploy-pd"
  | "deploy-jf"
  | "deploy-vs"
  | "status-check"
  | "crash-check"
  | "restart-claude"
  | "cleanup-vps";

const VALID_ACTIONS: ActionId[] = [
  "sync",
  "backup",
  "deploy-pd",
  "deploy-jf",
  "deploy-vs",
  "status-check",
  "crash-check",
  "restart-claude",
  "cleanup-vps",
];

// SSH args — connects to the VPS host from inside the container.
// Uses execFile (no shell) to prevent shell injection.
const SSH_ARGS = [
  "-o", "ConnectTimeout=10",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "BatchMode=yes",
  "vps",
] as const;

async function executeCommand(
  command: string,
  timeoutMs: number = 60_000
): Promise<{ success: boolean; message: string; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [...SSH_ARGS, command],
      { timeout: timeoutMs }
    );
    const output = (stdout + stderr).trim();
    return { success: true, message: "Completed successfully", output };
  } catch (err: unknown) {
    const error = err as {
      message?: string;
      stdout?: string;
      stderr?: string;
    };
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((s) => s!.trim())
      .join("\n");
    return {
      success: false,
      message: "Command failed",
      output: output || error.message || "Unknown error",
    };
  }
}

const ACTIONS: Record<
  ActionId,
  { command: string; timeout: number; successMsg: string }
> = {
  sync: {
    command:
      'cd /opt/repos/vibe-studio && for repo in vs-public; do echo "=== $repo ===" && cd /opt/repos/vibe-studio/$repo && git pull origin main 2>&1 && cd /opt/repos/vibe-studio; done',
    timeout: 60_000,
    successMsg: "Git pull completed on all repos",
  },
  backup: {
    command: "/opt/docker/scripts/db-backup.sh 2>&1",
    timeout: 120_000,
    successMsg: "All databases backed up successfully",
  },
  "deploy-pd": {
    // Safe deploy: ff-only pull, pg_dump backup, SHA tag, auto-rollback on health fail.
    command: "bash /opt/docker/scripts/deploy-pd.sh",
    timeout: 420_000,
    successMsg: "PD deployed (backup + rollback ready)",
  },
  "deploy-jf": {
    // Safe deploy: ff-only pull, pg_dump backup, SHA tag, auto-rollback on health fail.
    command: "bash /opt/docker/scripts/deploy-jf.sh",
    timeout: 420_000,
    successMsg: "JobFinder deployed (backup + rollback ready)",
  },
  "deploy-vs": {
    // Runs in background via nohup — survives vs-landing container recreation.
    command: "bash /opt/docker/scripts/deploy-vs.sh",
    timeout: 30_000,
    successMsg: "VS deploy launched (running in background, refresh in ~90s)",
  },
  "status-check": {
    command:
      'echo "=== Docker Containers ===" && docker ps --format "table {{.Names}}\\t{{.Status}}" | sort && echo "" && echo "=== Health Checks ===" && (wget -qO /dev/null --timeout=5 http://localhost:8003/api/health 2>&1 && echo "pd-prod      OK" || echo "pd-prod      FAIL") && (wget -qO /dev/null --timeout=5 http://localhost:8002/api/health 2>&1 && echo "pd-dev       OK" || echo "pd-dev       FAIL") && (wget -qO /dev/null --timeout=5 http://localhost:3456/ 2>&1 && echo "jobfinder    OK" || echo "jobfinder    FAIL") && (wget -qO /dev/null --timeout=5 http://localhost:8080 2>&1 && echo "website      OK" || echo "website      FAIL") && (wget -qO /dev/null --timeout=5 http://localhost:8090/api/health 2>&1 && echo "status       OK" || echo "status       FAIL") && (wget -qO /dev/null --timeout=5 http://localhost:8020 2>&1 && echo "vs-landing   OK" || echo "vs-landing   FAIL") && echo "" && echo "=== Disk ===" && df -h /opt | tail -1',
    timeout: 30_000,
    successMsg: "Status check completed",
  },
  "crash-check": {
    // The nightly script takes ~90s which exceeds the Cloudflare tunnel timeout (~100s).
    // /opt/docker/scripts/crash-check.sh launches run-nightly.sh in the background via nohup,
    // waits 8s for early output, and returns — total round-trip is ~8s.
    command: "bash /opt/docker/scripts/crash-check.sh",
    timeout: 30_000,
    successMsg: "Crash Check launched (running in background on VPS)",
  },
  "restart-claude": {
    // ARCH-20260413-11: --dangerously-skip-permissions is required here because Claude Code
    // runs in a headless tmux session without an interactive TTY. There is no alternative
    // safe mechanism: --allowedTools cannot cover the full set of tools the Telegram plugin
    // needs at runtime, and prompting for tool approval is impossible in non-interactive mode.
    // Mitigations in place:
    //   1. This action is restricted to OWNER role (auth check above, lines 133-149)
    //   2. vs-controls-runner.sh whitelists only this exact literal command (task-sec-20260410-022)
    //   3. The SSH forced-command prevents any other command injection
    // TODO: revisit when Claude Code adds a session-scoped tool allowlist mechanism
    //       or a dedicated non-interactive mode that does not require skip-all-permissions.
    command:
      "tmux kill-session -t claude 2>/dev/null; tmux new-session -d -s claude -c /opt/repos/vibe-studio \"claude --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions\" && sleep 4 && tmux capture-pane -t claude -p | tail -15",
    timeout: 30_000,
    successMsg: "Claude Code restarted on VPS",
  },
  "cleanup-vps": {
    // Runs /opt/docker/scripts/cleanup-vps.sh — prunes docker images + build cache older than 48h.
    // Exact-matched by vs-controls-runner.sh whitelist (task-sec-20260410-022 hardening).
    command: "bash /opt/docker/scripts/cleanup-vps.sh",
    timeout: 300_000,
    successMsg: "VPS cleanup completed",
  },
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    // Rate limit: 10 actions per minute per IP (exec commands on VPS)
    const blocked = await rateLimitOrNull("studio-action", { limit: 10, windowMs: 60_000 });
    if (blocked) return blocked;

    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check — only OWNER
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "OWNER") {
      return Response.json(
        { error: "Forbidden: OWNER role required" },
        { status: 403 }
      );
    }

    // Validate action
    const { action } = await params;
    if (!VALID_ACTIONS.includes(action as ActionId)) {
      return Response.json(
        { error: `Invalid action: ${action}` },
        { status: 400 }
      );
    }

    const actionId = action as ActionId;
    const actionDef = ACTIONS[actionId];

    // ARC-20260507-0005: AUDIT log every privileged action invocation.
    // restart-claude in particular runs Claude with --dangerously-skip-permissions
    // so we want a permanent record (status.errors collector picks up
    // console.error lines from docker logs). Format includes ip + user so the
    // audit trail survives container recycling.
    const auditUser = session.user.email ?? session.user.id ?? "unknown";
    if (actionId === "restart-claude") {
      console.error(
        `[AUDIT] studio-action restart-claude invoked by ${auditUser} ` +
          `at ${new Date().toISOString()} (skip-permissions mode)`,
      );
    } else {
      console.log(
        `[AUDIT] studio-action ${actionId} invoked by ${auditUser} ` +
          `at ${new Date().toISOString()}`,
      );
    }

    const result = await executeCommand(actionDef.command, actionDef.timeout);

    return Response.json({
      success: result.success,
      message: result.success ? actionDef.successMsg : result.message,
      output: result.output,
      action: actionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Studio action error:", error);
    return Response.json(
      {
        success: false,
        message: "Action failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
