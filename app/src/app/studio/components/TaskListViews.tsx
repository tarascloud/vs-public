"use client";

import type { InitiativeTask, StudioTranslations } from "./ideas-tab.types";
import { statusBadge } from "./ideas-tab.types";

// ---- Mobile Task List ----

interface MobileTaskListProps {
  tasks: InitiativeTask[];
  onTaskClick: (taskId: string) => void;
  t: StudioTranslations;
}

export function MobileTaskList({ tasks, onTaskClick, t }: MobileTaskListProps) {
  return (
    <div className="space-y-2">
      {tasks.map((itask) => {
        const isDone = itask.status === "DONE";
        const activeBlockers = itask.blockedBy.filter((b) => b.status !== "DONE");
        const allBlockersDone = itask.blockedBy.length > 0 && activeBlockers.length === 0;

        return (
          <div
            key={itask.id}
            onClick={() => onTaskClick(itask.id)}
            className={`rounded-lg border border-card-border/60 px-3 py-2.5 cursor-pointer hover:bg-accent/5 transition-colors ${
              isDone ? "opacity-50" : ""
            }`}
            title={t("open_on_board")}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted/60 shrink-0">{itask.ticketId}</span>
              {statusBadge(itask.status)}
            </div>
            <p className={`text-xs font-medium leading-snug ${isDone ? "line-through text-muted" : "text-foreground"}`}>
              {itask.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {itask.assigneeType === "AGENT" && itask.agent && (
                <span className="inline-flex items-center gap-1 text-xs text-accent/80">
                  <span className="w-4 h-4 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-semibold text-accent shrink-0">
                    {itask.agent.displayName.charAt(0).toUpperCase()}
                  </span>
                  {itask.agent.displayName}
                </span>
              )}
              {(itask.assigneeType === "OWNER" || itask.assigneeType === "CLIENT") && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  {itask.assigneeUser?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={itask.assigneeUser.image}
                      alt={itask.assigneeUser.name || ""}
                      className="w-4 h-4 rounded-full border border-gray-500/30 shrink-0 object-cover"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center text-[9px] font-semibold shrink-0">
                      {(itask.assigneeUser?.name || "T").charAt(0).toUpperCase()}
                    </span>
                  )}
                  {itask.assigneeUser?.name || "Owner"}
                </span>
              )}
              {itask.blockedBy.length === 0 ? (
                <span className="text-xs text-green-400">{t("ready")}</span>
              ) : allBlockersDone ? (
                <span className="text-xs text-green-400">{t("unblocked")}</span>
              ) : (
                <span className="text-xs text-red-400 truncate max-w-[160px]">
                  {t("blocked_by")}: {activeBlockers.map((b) => b.title).join(", ")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Desktop Task Table ----

interface DesktopTaskTableProps {
  tasks: InitiativeTask[];
  onTaskClick: (taskId: string) => void;
  t: StudioTranslations;
}

export function DesktopTaskTable({ tasks, onTaskClick, t }: DesktopTaskTableProps) {
  return (
    <div className="rounded-lg border border-card-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-card-border bg-card-border/20">
            <th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">#</th>
            <th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">{t("title_label")}</th>
            <th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">{t("assignee")}</th>
            <th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">Status</th>
            <th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">{t("dependencies")}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((itask) => {
            const isDone = itask.status === "DONE";
            const activeBlockers = itask.blockedBy.filter((b) => b.status !== "DONE");
            const allBlockersDone = itask.blockedBy.length > 0 && activeBlockers.length === 0;

            return (
              <tr
                key={itask.id}
                onClick={() => onTaskClick(itask.id)}
                className={`border-b border-card-border/50 last:border-0 cursor-pointer hover:bg-accent/5 transition-colors ${
                  isDone ? "opacity-50" : ""
                }`}
                title={t("open_on_board")}
              >
                <td className="px-3 py-2 font-mono text-muted/60">{itask.ticketId}</td>
                <td className="px-3 py-2">
                  <span className={`font-medium ${isDone ? "line-through text-muted" : "text-foreground"}`}>
                    {itask.title}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {itask.assigneeType === "AGENT" && itask.agent ? (
                    <span className="inline-flex items-center gap-1 text-accent/80">
                      <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-semibold text-accent shrink-0">
                        {itask.agent.displayName.charAt(0).toUpperCase()}
                      </span>
                      {itask.agent.displayName}
                    </span>
                  ) : (itask.assigneeType === "OWNER" || itask.assigneeType === "CLIENT") ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      {itask.assigneeUser?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={itask.assigneeUser.image}
                          alt={itask.assigneeUser.name || ""}
                          className="w-5 h-5 rounded-full border border-gray-500/30 shrink-0 object-cover"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center text-[9px] font-semibold shrink-0">
                          {(itask.assigneeUser?.name || "T").charAt(0).toUpperCase()}
                        </span>
                      )}
                      {itask.assigneeUser?.name || "Owner"}
                    </span>
                  ) : (
                    <span className="text-muted/50">--</span>
                  )}
                </td>
                <td className="px-3 py-2">{statusBadge(itask.status)}</td>
                <td className="px-3 py-2">
                  {itask.blockedBy.length === 0 ? (
                    <span className="text-green-400">{t("ready")}</span>
                  ) : allBlockersDone ? (
                    <span className="text-green-400">{t("unblocked")}</span>
                  ) : (
                    <span className="text-red-400">
                      {t("blocked_by")}: {activeBlockers.map((b) => b.title).join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
