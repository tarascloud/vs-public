"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";

// ---------- Types ----------

interface Task {
  id: string;
  ticketId: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";
  priority: number;
  agent: { id: string; displayName: string } | null;
  project: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

type InitiativeStatus = "IDEA" | "PLANNING" | "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "DONE";

interface Initiative {
  id: string;
  title: string | null;
  rawIdea: string;
  status: InitiativeStatus;
  priority: number;
  project: { id: string; name: string } | null;
  tasks: { id: string; status: string }[];
  createdAt: string;
  updatedAt: string;
}

interface SummaryProps {
  tasks: Task[];
  initiatives: Initiative[];
}

// ---------- Helpers ----------

function formatDate(iso: string) {
  if (!iso) return "";
  const now = new Date();
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ---------- Sub-components ----------

function StatPill({
  label,
  count,
  dotClass,
}: {
  label: string;
  count: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-card-border">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className="text-xs text-muted">{label}</span>
      <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{count}</span>
    </div>
  );
}

// ---------- Main Component ----------

export default function OfficeSummary({ tasks, initiatives }: SummaryProps) {
  const t = useTranslations("studio");

  // Task stats
  const taskStats = {
    TODO: tasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    BLOCKED: tasks.filter((t) => t.status === "BLOCKED").length,
    TESTING: tasks.filter((t) => t.status === "TESTING").length,
    DONE: tasks.filter((t) => t.status === "DONE").length,
  };
  const activeTasks = taskStats.TODO + taskStats.IN_PROGRESS + taskStats.BLOCKED + taskStats.TESTING;

  // Initiative stats
  const initStats: Record<InitiativeStatus, number> = {
    IDEA: 0,
    PLANNING: 0,
    PLANNED: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    DONE: 0,
  };
  for (const i of initiatives) {
    initStats[i.status] = (initStats[i.status] || 0) + 1;
  }

  // Recent activity: last 5 updated tasks (non-DONE) + completed tasks
  const recentActivity = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const activityStatusColor: Record<string, string> = {
    TODO: "bg-blue-500",
    IN_PROGRESS: "bg-yellow-500",
    BLOCKED: "bg-red-500",
    TESTING: "bg-amber-500",
    DONE: "bg-green-500",
  };

  const activityStatusLabel: Record<string, string> = {
    TODO: t("status_ready"),
    IN_PROGRESS: t("status_in_progress"),
    BLOCKED: t("status_blocked"),
    TESTING: t("status_testing"),
    DONE: t("status_done"),
  };

  const initStatusLabel: Record<InitiativeStatus, string> = {
    IDEA: t("status_idea"),
    PLANNING: t("status_planning"),
    PLANNED: t("status_planned"),
    IN_PROGRESS: t("initiative_in_progress"),
    BLOCKED: t("initiative_blocked"),
    DONE: t("initiative_done"),
  };

  const initStatusDot: Record<InitiativeStatus, string> = {
    IDEA: "bg-gray-500",
    PLANNING: "bg-blue-500",
    PLANNED: "bg-emerald-500",
    IN_PROGRESS: "bg-yellow-500",
    BLOCKED: "bg-red-500",
    DONE: "bg-green-500",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Tasks summary */}
      <div className="bg-card-bg border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t("summary_tasks")}</h3>
          <span className="text-xs text-muted/60">
            {activeTasks} {t("summary_active")}
          </span>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="mb-4">
            <div className="w-full h-2 rounded-full bg-card-border overflow-hidden flex gap-0.5">
              {taskStats.DONE > 0 && (
                <div
                  className="h-full bg-green-500 rounded-l-full"
                  style={{ width: `${(taskStats.DONE / tasks.length) * 100}%` }}
                />
              )}
              {taskStats.IN_PROGRESS > 0 && (
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${(taskStats.IN_PROGRESS / tasks.length) * 100}%` }}
                />
              )}
              {taskStats.TESTING > 0 && (
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${(taskStats.TESTING / tasks.length) * 100}%` }}
                />
              )}
              {taskStats.BLOCKED > 0 && (
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${(taskStats.BLOCKED / tasks.length) * 100}%` }}
                />
              )}
              {taskStats.TODO > 0 && (
                <div
                  className="h-full bg-blue-500 rounded-r-full"
                  style={{ width: `${(taskStats.TODO / tasks.length) * 100}%` }}
                />
              )}
            </div>
            <p className="text-xs text-muted/50 mt-1 text-right">
              {taskStats.DONE}/{tasks.length} {t("done")}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <StatPill label={t("status_ready")} count={taskStats.TODO} dotClass="bg-blue-500" />
          <StatPill label={t("status_in_progress")} count={taskStats.IN_PROGRESS} dotClass="bg-yellow-500" />
          <StatPill label={t("status_blocked")} count={taskStats.BLOCKED} dotClass="bg-red-500" />
          <StatPill label={t("status_testing")} count={taskStats.TESTING} dotClass="bg-amber-500" />
          <StatPill label={t("status_done")} count={taskStats.DONE} dotClass="bg-green-500" />
        </div>
      </div>

      {/* Initiatives summary */}
      <div className="bg-card-bg border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t("summary_initiatives")}</h3>
          <span className="text-xs text-muted/60">
            {initiatives.length} {t("summary_total")}
          </span>
        </div>

        <div className="space-y-2">
          {(Object.keys(initStats) as InitiativeStatus[]).map((s) => (
            <StatPill
              key={s}
              label={initStatusLabel[s]}
              count={initStats[s]}
              dotClass={initStatusDot[s]}
            />
          ))}
        </div>

        {initiatives.length === 0 && (
          <EmptyState title={t("no_initiatives")} compact />
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-card-bg border border-card-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">{t("summary_recent")}</h3>

        {recentActivity.length === 0 ? (
          <EmptyState title={t("no_tasks")} compact />
        ) : (
          <div className="space-y-3">
            {recentActivity.map((task) => (
              <div key={task.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${activityStatusColor[task.status] || "bg-gray-500"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{task.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted/60">
                      {activityStatusLabel[task.status]}
                    </span>
                    {task.agent && (
                      <>
                        <span className="text-muted/40">·</span>
                        <span className="text-xs text-muted/60 truncate">
                          {task.agent.displayName}
                        </span>
                      </>
                    )}
                    {task.project && (
                      <>
                        <span className="text-muted/40">·</span>
                        <span className="text-xs text-muted/50 truncate">
                          {task.project.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted/40 shrink-0 mt-0.5">
                  {formatDate(task.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
