"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// ---------- Types ----------

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

type ActionState = "idle" | "running" | "success" | "error";

interface ActionResult {
  success: boolean;
  message: string;
  output?: string;
}

interface ActionConfig {
  id: ActionId;
  icon: React.ReactNode;
  colorClass: string;
  dangerLevel?: "safe" | "warning" | "danger";
}

// ---------- Icons ----------

function SyncIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function BackupIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function DeployIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

function StatusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RestartClaudeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 3h5v5M4 20L20.2 3.8M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}

function CleanupIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function CrashCheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    id: "sync",
    icon: <SyncIcon />,
    colorClass: "text-blue-400",
    dangerLevel: "safe",
  },
  {
    id: "backup",
    icon: <BackupIcon />,
    colorClass: "text-purple-400",
    dangerLevel: "safe",
  },
  {
    id: "status-check",
    icon: <StatusIcon />,
    colorClass: "text-cyan-400",
    dangerLevel: "safe",
  },
  {
    id: "deploy-pd",
    icon: <DeployIcon />,
    colorClass: "text-green-400",
    dangerLevel: "warning",
  },
  {
    id: "deploy-jf",
    icon: <DeployIcon />,
    colorClass: "text-emerald-400",
    dangerLevel: "warning",
  },
  {
    id: "deploy-vs",
    icon: <DeployIcon />,
    colorClass: "text-violet-400",
    dangerLevel: "danger",
  },
  {
    id: "crash-check",
    icon: <CrashCheckIcon />,
    colorClass: "text-amber-400",
    dangerLevel: "safe",
  },
  {
    id: "restart-claude",
    icon: <RestartClaudeIcon />,
    colorClass: "text-pink-400",
    dangerLevel: "warning",
  },
  {
    id: "cleanup-vps",
    icon: <CleanupIcon />,
    colorClass: "text-orange-400",
    dangerLevel: "warning",
  },
];

// ---------- Action Toggle ----------

function ActionToggle({
  config,
  isOwner,
  onTrigger,
}: {
  config: ActionConfig;
  isOwner: boolean;
  onTrigger: (id: ActionId) => Promise<ActionResult>;
}) {
  const t = useTranslations("studio");
  const [state, setState] = useState<ActionState>("idle");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  const labelKey = `action_${config.id.replace(/-/g, "_")}` as const;
  const descKey = `action_${config.id.replace(/-/g, "_")}_desc` as const;

  const handleClick = async () => {
    if (!isOwner || state === "running") return;

    if (config.dangerLevel === "danger" || config.dangerLevel === "warning") {
      if (!confirmPending) {
        setConfirmPending(true);
        setTimeout(() => setConfirmPending(false), 3000);
        return;
      }
    }

    setConfirmPending(false);
    setState("running");
    setResult(null);

    try {
      const res = await onTrigger(config.id);
      setResult(res);
      setState(res.success ? "success" : "error");
    } catch {
      setResult({ success: false, message: "Unexpected error" });
      setState("error");
    }

    setTimeout(() => setState("idle"), 5000);
  };

  const stateColors: Record<ActionState, string> = {
    idle: "border-card-border bg-card-bg hover:border-accent/30",
    running: "border-accent/30 bg-accent/5",
    success: "border-green-500/30 bg-green-500/5",
    error: "border-red-500/30 bg-red-500/5",
  };

  const buttonColors: Record<ActionState, string> = {
    idle: confirmPending
      ? "bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20"
      : "bg-accent/10 text-accent border-accent/20 hover:bg-accent/20",
    running: "bg-accent/5 text-accent/50 border-accent/10 cursor-not-allowed",
    success: "bg-green-500/10 text-green-400 border-green-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <div className={`rounded-xl border transition-all p-3 md:p-4 ${stateColors[state]}`}>
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        {/* Icon + Text block */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className={`mt-0.5 shrink-0 ${config.colorClass}`}>
            {config.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-medium text-foreground">
                {t(labelKey)}
              </h3>
              {config.dangerLevel === "danger" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  prod
                </span>
              )}
            </div>
            <p className="text-xs text-muted/70">{t(descKey)}</p>

            {/* Result message */}
            {result && (
              <div className="mt-2">
                <p className={`text-xs ${result.success ? "text-green-400" : "text-red-400"}`}>
                  {result.message}
                </p>
                {result.output && (
                  <button
                    onClick={() => setShowOutput(!showOutput)}
                    className="text-xs text-muted/50 hover:text-muted mt-1 underline"
                  >
                    {showOutput ? t("hide_output") : t("show_output")}
                  </button>
                )}
                {showOutput && result.output && (
                  <pre className="mt-2 text-xs text-muted/70 bg-background rounded-lg p-2 border border-card-border overflow-x-auto font-mono whitespace-pre-wrap">
                    {result.output}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Button — full width on mobile, auto on md+ */}
        <button
          onClick={handleClick}
          disabled={!isOwner || state === "running"}
          className={`w-full md:w-auto shrink-0 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 min-h-[44px] rounded-lg border transition-all font-medium ${
            !isOwner
              ? "opacity-40 cursor-not-allowed bg-card-bg text-muted border-card-border"
              : buttonColors[state]
          }`}
        >
          {state === "running" ? (
            <>
              <SpinnerIcon />
              {t("action_running")}
            </>
          ) : state === "success" ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t("action_done")}
            </>
          ) : state === "error" ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t("action_failed")}
            </>
          ) : confirmPending ? (
            t("action_confirm")
          ) : (
            t("action_run")
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function OfficeControls({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("studio");

  const handleTrigger = async (actionId: ActionId): Promise<ActionResult> => {
    const res = await fetch(`/api/studio/actions/${actionId}`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Request failed");
    }
    return res.json();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t("controls_title")}</h2>
          <p className="text-xs text-muted/70 mt-0.5">{t("controls_desc")}</p>
        </div>
        {!isOwner && (
          <span className="text-xs text-muted/50 border border-card-border rounded-lg px-3 py-1.5">
            {t("controls_owner_only")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACTION_CONFIGS.map((config) => (
          <ActionToggle
            key={config.id}
            config={config}
            isOwner={isOwner}
            onTrigger={handleTrigger}
          />
        ))}
      </div>
    </div>
  );
}
