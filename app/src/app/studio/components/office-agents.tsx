"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// ---------- Types ----------

interface AgentTask {
  id: string;
  ticketId: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";
  priority: number;
  project: { id: string; name: string } | null;
  updatedAt: string;
}

export interface AgentWithTasks {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  instructions: string;
  tools: string[];
  model: string;
  isActive: boolean;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  color: string | null;
  bio: string | null;
  tasks: AgentTask[];
}

type AgentStatus = "working" | "blocked" | "idle";

// ---------- Helpers ----------

function getAgentStatus(agent: AgentWithTasks): AgentStatus {
  const active = agent.tasks.filter((t) => t.status !== "DONE");
  if (active.some((t) => t.status === "BLOCKED")) return "blocked";
  if (active.some((t) => t.status === "IN_PROGRESS" || t.status === "TESTING")) return "working";
  return "idle";
}

function getAvatarInitials(displayName: string): string {
  return displayName
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "from-purple-500 to-violet-600",
    "from-blue-500 to-cyan-600",
    "from-green-500 to-emerald-600",
    "from-orange-500 to-amber-600",
    "from-pink-500 to-rose-600",
    "from-teal-500 to-cyan-600",
    "from-indigo-500 to-blue-600",
    "from-yellow-500 to-amber-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ---------- Agent Avatar ----------

function AgentAvatar({
  agent,
  size = "md",
}: {
  agent: AgentWithTasks;
  size?: "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "w-14 h-[84px] text-lg" : "w-12 h-[72px] text-sm";
  const gradientColor = agent.color ?? getAvatarColor(agent.name);

  if (agent.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.avatarUrl}
        alt={agent.displayName}
        className={`${sizeClass} rounded-xl object-contain`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl bg-gradient-to-br ${gradientColor} flex items-center justify-center text-white font-bold shrink-0`}
    >
      {agent.avatarEmoji ?? getAvatarInitials(agent.displayName)}
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ---------- Status dot ----------

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "working") {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  if (status === "blocked") {
    return <span className="h-2.5 w-2.5 rounded-full bg-red-500" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-500/60" />;
}

// ---------- Agent Detail Modal ----------

function AgentDetailModal({
  agent,
  onClose,
}: {
  agent: AgentWithTasks;
  onClose: () => void;
}) {
  const t = useTranslations("studio");
  const status = getAgentStatus(agent);
  const inProgressTasks = agent.tasks.filter(
    (t) => t.status === "IN_PROGRESS" || t.status === "TESTING"
  );
  const doneTasks = agent.tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const todoTasks = agent.tasks.filter((t) => t.status === "TODO" || t.status === "BLOCKED");

  const statusLabelMap: Record<AgentStatus, string> = {
    working: t("agent_status_working"),
    blocked: t("agent_status_blocked"),
    idle: t("agent_status_idle"),
  };

  const statusBadgeClass: Record<AgentStatus, string> = {
    working: "bg-green-500/10 text-green-400 border-green-500/20",
    blocked: "bg-red-500/10 text-red-400 border-red-500/20",
    idle: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  const taskStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      IN_PROGRESS: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      TESTING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      TODO: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      BLOCKED: "bg-red-500/10 text-red-400 border-red-500/20",
      DONE: "bg-green-500/10 text-green-400 border-green-500/20",
    };
    return map[s] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card-bg border border-card-border rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-card-border">
          <div className="flex items-start gap-4">
            <AgentAvatar agent={agent} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={status} />
                <h2 className="font-semibold text-foreground">{agent.displayName}</h2>
              </div>
              <p className="text-xs text-muted mb-2">{agent.role}</p>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass[status]}`}
              >
                {statusLabelMap[status]}
              </span>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2 text-muted hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Description */}
          <div>
            <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
              {t("agent_description")}
            </h3>
            <p className="text-sm text-muted">{agent.description}</p>
          </div>

          {/* Bio */}
          {agent.bio && (
            <div>
              <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                Bio
              </h3>
              <p className="text-sm text-muted">{agent.bio}</p>
            </div>
          )}

          {/* Instructions preview */}
          <div>
            <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
              {t("agent_instructions")}
            </h3>
            <div className="bg-background rounded-lg p-3 border border-card-border">
              <p className="text-xs text-muted font-mono line-clamp-4 whitespace-pre-wrap">
                {agent.instructions}
              </p>
            </div>
          </div>

          {/* Tools */}
          {agent.tools.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                {t("agent_tools")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent/80 border border-accent/15"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Active tasks */}
          {inProgressTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                {t("agent_active_tasks")}
              </h3>
              <div className="space-y-2">
                {inProgressTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 text-xs bg-background rounded-lg p-2.5 border border-card-border"
                  >
                    <span className={`px-1.5 py-0.5 rounded border ${taskStatusBadge(task.status)}`}>
                      {task.status.replace("_", " ")}
                    </span>
                    <span className="font-mono text-muted">{task.ticketId}</span>
                    <span className="text-foreground flex-1 truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Todo tasks */}
          {todoTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                {t("agent_queued")}
              </h3>
              <div className="space-y-2">
                {todoTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 text-xs bg-background rounded-lg p-2.5 border border-card-border"
                  >
                    <span className={`px-1.5 py-0.5 rounded border ${taskStatusBadge(task.status)}`}>
                      {task.status.replace("_", " ")}
                    </span>
                    <span className="font-mono text-muted">{task.ticketId}</span>
                    <span className="text-foreground flex-1 truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent done */}
          {doneTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                {t("agent_recent_done")}
              </h3>
              <div className="space-y-1.5">
                {doneTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-xs text-muted">
                    <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className="shrink-0">{formatDate(task.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agent.tasks.length === 0 && (
            <p className="text-sm text-muted text-center py-4">{t("agent_no_tasks")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Agent Card ----------

function AgentCard({
  agent,
  onClick,
}: {
  agent: AgentWithTasks;
  onClick: () => void;
}) {
  const t = useTranslations("studio");
  const status = getAgentStatus(agent);
  const currentTask = agent.tasks.find(
    (t) => t.status === "IN_PROGRESS" || t.status === "TESTING"
  );
  const taskCount = agent.tasks.filter((t) => t.status !== "DONE").length;

  const statusLabel: Record<AgentStatus, string> = {
    working: t("agent_status_working"),
    blocked: t("agent_status_blocked"),
    idle: t("agent_status_idle"),
  };

  return (
    <button
      onClick={onClick}
      className="bg-card-bg border border-card-border rounded-xl p-4 text-left hover:border-accent/40 transition-all hover:shadow-lg hover:shadow-accent/5 group w-full"
    >
      {/* Avatar + status */}
      <div className="flex items-start justify-between mb-3">
        <div className="relative">
          <AgentAvatar agent={agent} size="md" />
          <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
            <StatusDot status={status} />
          </div>
        </div>
        <span className="text-xs text-muted/60 bg-card-border/50 px-2 py-0.5 rounded-full">
          {taskCount > 0 ? `${taskCount} tasks` : "idle"}
        </span>
      </div>

      {/* Name + role */}
      <h3 className="text-sm font-semibold text-foreground mb-0.5 group-hover:text-accent transition-colors">
        {agent.displayName}
      </h3>
      <p className="text-xs text-muted/70 mb-3 line-clamp-1">{agent.role}</p>

      {/* Current task */}
      {currentTask ? (
        <div className="bg-background rounded-lg p-2.5 border border-card-border">
          <p className="text-xs text-muted/60 mb-0.5">{t("agent_working_on")}</p>
          <p className="text-xs text-foreground line-clamp-2">{currentTask.title}</p>
        </div>
      ) : (
        <div className="bg-background rounded-lg p-2.5 border border-dashed border-card-border/60">
          <p className="text-xs text-muted/40 text-center">{statusLabel[status]}</p>
        </div>
      )}

      {/* Model badge */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent/70 border border-accent/15">
          {agent.model}
        </span>
        {agent.tools.length > 0 && (
          <span className="text-xs text-muted/50">
            {agent.tools.length} tools
          </span>
        )}
      </div>
    </button>
  );
}

// ---------- Main Component ----------

export default function OfficeAgents({
  agents,
}: {
  agents: AgentWithTasks[];
}) {
  const t = useTranslations("studio");
  const [selectedAgent, setSelectedAgent] = useState<AgentWithTasks | null>(null);

  const working = agents.filter((a) => getAgentStatus(a) === "working");
  const blocked = agents.filter((a) => getAgentStatus(a) === "blocked");
  const idle = agents.filter((a) => getAgentStatus(a) === "idle");

  return (
    <div>
      {/* Stats row */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold flex-1">{t("agents_title")}</h2>
        <div className="flex items-center gap-3 text-xs text-muted">
          {working.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {working.length} {t("agent_working")}
            </span>
          )}
          {blocked.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {blocked.length} {t("agent_blocked_count")}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-500/60" />
            {idle.length} {t("agent_idle")}
          </span>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm border border-dashed border-card-border rounded-xl">
          {t("agents_empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
