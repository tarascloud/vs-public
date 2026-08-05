"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";

import type { Task, TaskStatus, Agent } from "./kanban-board.types";
import {
  STATUS_COLUMNS,
  PRIORITY_MAP,
  TASK_TYPE_MAP,
  projectBadge,
  formatDate,
  formatDateTime,
  formatTokens,
} from "./kanban-board.types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/app/components/ui/dialog";

interface TaskCardInnerProps {
  task: Task;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onFullscreen?: (task: Task) => void;
  agents: Agent[];
  dragListeners?: ReturnType<typeof useDraggable>["listeners"];
  dragAttributes?: ReturnType<typeof useDraggable>["attributes"];
  compact?: boolean;
  overlay?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}

export function TaskCardInner({
  task,
  isExpanded,
  onToggle,
  onMove,
  onDelete,
  onFullscreen,
  dragListeners,
  dragAttributes,
  compact = false,
  overlay = false,
  isSelected = false,
  onToggleSelect,
}: TaskCardInnerProps) {
  const t = useTranslations("studio");
  const prio = PRIORITY_MAP[task.priority] || PRIORITY_MAP[0];
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const taskTypeCfg = TASK_TYPE_MAP[task.type] || TASK_TYPE_MAP["FEATURE"];
  const pendingQuestions = task.questions.filter((q) => q.status === "PENDING");

  const getNextStatuses = (current: TaskStatus): TaskStatus[] => {
    switch (current) {
      case "TODO":        return ["IN_PROGRESS", "DONE", "BLOCKED"];
      case "IN_PROGRESS": return ["TESTING", "DONE", "BLOCKED", "TODO"];
      case "BLOCKED":     return ["TODO", "IN_PROGRESS", "DONE"];
      case "TESTING":     return ["DONE", "IN_PROGRESS", "BLOCKED"];
      case "DONE":        return ["TODO"];
      default:            return [];
    }
  };

  const statusLabel = (s: TaskStatus) => STATUS_COLUMNS.find((c) => c.id === s)?.title || s;

  const statusBtnColor = (s: TaskStatus) => {
    switch (s) {
      case "TODO":        return "border-blue-500/30 text-blue-400 hover:bg-blue-500/10";
      case "IN_PROGRESS": return "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10";
      case "BLOCKED":     return "border-danger/30 text-danger hover:bg-danger-subtle";
      case "TESTING":     return "border-amber-500/30 text-amber-400 hover:bg-amber-500/10";
      case "DONE":        return "border-success/30 text-success hover:bg-success-subtle";
    }
  };

  return (
    <div id={`task-card-${task.id}`}
      className={`bg-card-bg border rounded-lg transition-colors select-none ${overlay ? "border-accent/60 shadow-2xl shadow-black/40 rotate-1 scale-105" : isExpanded ? "border-accent/50" : "border-card-border hover:border-accent/30"}`}>
      <div className={`${compact ? "p-3" : "p-4"}`}>
        {/* Top row: checkbox + drag handle + priority (highest signal only) */}
        <div className="flex items-center gap-2 mb-1.5">
          {!overlay && onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(task.id)}
              aria-label={`Select task ${task.ticketId}`}
              className="w-3.5 h-3.5 rounded border-card-border accent-accent shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {!overlay && (
            <button {...dragListeners} {...dragAttributes}
              aria-label={`Drag task ${task.ticketId}`}
              className="cursor-grab active:cursor-grabbing text-muted/30 hover:text-muted/70 transition-colors touch-none shrink-0 p-0.5 rounded"
              title="Drag to move" onClick={(e) => e.stopPropagation()}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" /><circle cx="5" cy="8" r="1.2" />
                <circle cx="11" cy="8" r="1.2" /><circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
              </svg>
            </button>
          )}
          {/* Priority is the highest scan signal — keep visible always */}
          <span className={`text-xs px-1.5 py-0.5 rounded ml-auto ${prio.style}`}>{prio.label}</span>
        </div>

        <div className="cursor-pointer" onClick={overlay ? undefined : onToggle}>
          {/* Primary: title — strongest visual weight */}
          <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold leading-snug mb-1 text-foreground`}>{task.title}</h3>

          {/* Secondary line: ticketId + type — muted, scannable */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <span className="font-mono">{task.ticketId}</span>
            <span className="text-muted-2">·</span>
            <span className="inline-flex items-center gap-1" title={t(taskTypeCfg.labelKey as Parameters<typeof t>[0])}>
              {taskTypeCfg.icon}
              {!compact && <span>{t(taskTypeCfg.labelKey as Parameters<typeof t>[0])}</span>}
            </span>
          </p>

          {task.initiative?.title && (
            <p className="text-xs text-muted-2 mb-2 truncate" title={task.initiative.title}>
              <span className="text-muted-3">→</span> {task.initiative.title}
            </p>
          )}

          {/* Badge row: max 3 visible, rest collapsed under 'i' affordance */}
          {(() => {
            const activeBlockers = task.blockedBy?.filter((b) => b.status !== "DONE") ?? [];
            const isBlocked = activeBlockers.length > 0;
            const hasQuestions = pendingQuestions.length > 0;
            const assigneeAvatar =
              task.assigneeType === "AGENT" && task.agent
                ? task.agent.displayName.charAt(0).toUpperCase()
                : task.assigneeType === "OWNER" || task.assigneeType === "CLIENT"
                  ? (task.assigneeUser?.name || "T").charAt(0).toUpperCase()
                  : null;

            // Always-visible: project badge (project = top-level grouping)
            const projBadge = projectBadge(task.project?.name);

            // Secondary badges: assignee/agent (icon-only in compact, full in expanded)
            const renderAssignee = () => {
              if (task.assigneeType === "AGENT" && task.agent) {
                return (
                  <span
                    key="agent"
                    title={`Agent: ${task.agent.displayName}`}
                    className="inline-flex items-center gap-1 text-xs rounded bg-accent/10 text-accent/80 border border-accent/15 px-1.5 py-0.5"
                  >
                    <span className="w-4 h-4 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[11px] font-semibold text-accent shrink-0">
                      {assigneeAvatar}
                    </span>
                    {!compact && <span>{task.agent.displayName}</span>}
                  </span>
                );
              }
              if (task.assigneeType === "OWNER" || task.assigneeType === "CLIENT") {
                return (
                  <span
                    key="user"
                    title={task.assigneeUser?.name || "Owner"}
                    className="inline-flex items-center gap-1 text-xs rounded bg-gray-500/10 text-gray-400 border border-gray-500/20 px-1.5 py-0.5"
                  >
                    {task.assigneeUser?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={task.assigneeUser.image} alt={task.assigneeUser.name || ""} className="w-4 h-4 rounded-full border border-gray-500/30 shrink-0 object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-gray-500/20 border border-gray-500/30 flex items-center justify-center text-[11px] font-semibold shrink-0">{assigneeAvatar}</span>
                    )}
                    {!compact && <span>{task.assigneeUser?.name || "Owner"}</span>}
                  </span>
                );
              }
              return null;
            };

            // Status pills: blocked / questions — icon-only in compact, label in expanded
            const renderBlocked = () =>
              isBlocked ? (
                <span
                  key="blocked"
                  title={`Blocked by ${activeBlockers.length} task(s)`}
                  className="inline-flex items-center gap-1 text-xs rounded bg-danger-subtle text-danger border border-danger/20 px-1.5 py-0.5"
                  aria-label="Blocked"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {!compact && <span>Blocked</span>}
                </span>
              ) : null;

            const renderQuestions = () =>
              hasQuestions ? (
                <span
                  key="q"
                  title={`${pendingQuestions.length} pending question(s)`}
                  className="inline-flex items-center gap-1 text-xs rounded bg-danger-subtle text-danger border border-danger/20 px-1.5 py-0.5"
                  aria-label={`${pendingQuestions.length} pending questions`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {!compact && <span>{pendingQuestions.length}</span>}
                </span>
              ) : null;

            // Compose badges, cap visible at 3, surface count for the rest
            const items = [projBadge, renderAssignee(), renderBlocked(), renderQuestions()].filter(
              Boolean,
            ) as React.ReactNode[];
            const visible = items.slice(0, 3);
            const hidden = items.length - visible.length;

            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                {visible}
                {hidden > 0 && (
                  <button
                    type="button"
                    title="Show more info — expand card"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle();
                    }}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs text-muted/70 hover:text-foreground hover:bg-card-bg-hover border border-card-border transition-colors"
                    aria-label={`Show ${hidden} more info badges`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })()}

          {compact && task.status === "DONE" && (
            <div className="mt-2 space-y-1">
              {task.completionNote && <p className="text-xs text-success/80 line-clamp-1">{task.completionNote}</p>}
              {task.commitHash && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20 font-mono">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                  {task.commitHash.slice(0, 7)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isExpanded && !overlay && (
        <div className="border-t border-card-border px-4 pb-4 pt-3 space-y-3">
          {task.description && <p className="text-sm text-muted">{task.description}</p>}

          {task.status === "DONE" && (task.completionNote || task.commitHash || task.tokensUsed || task.completedAt) && (
            <div className="rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 space-y-2">
              {task.completionNote && (
                <div className="flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <p className="text-xs text-success">{task.completionNote}</p>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {task.commitHash && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted/70">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                    {task.commitUrl ? (
                      <a href={task.commitUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-accent/70 hover:text-accent transition-colors" onClick={(e) => e.stopPropagation()}>{task.commitHash.slice(0, 7)}</a>
                    ) : (<span className="font-mono">{task.commitHash.slice(0, 7)}</span>)}
                  </span>
                )}
                {task.tokensUsed !== null && task.tokensUsed !== undefined && (
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20">{formatTokens(task.tokensUsed)}</span>
                )}
                {task.completedAt && <span className="text-xs text-muted-2 ml-auto">{formatDateTime(task.completedAt)}</span>}
              </div>
            </div>
          )}

          {task.blockedBy && task.blockedBy.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-2 uppercase tracking-wider">Blocked by</h4>
              {task.blockedBy.map((b) => {
                const isResolved = b.status === "DONE";
                return (
                  <div key={b.id} className={`flex items-center gap-2 text-xs ${isResolved ? "text-success" : "text-danger"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isResolved ? "bg-success" : "bg-danger"}`} />
                    <span className="font-mono">{b.ticketId}</span><span>{b.title}</span>
                    {isResolved && <span className="text-success/60">(done)</span>}
                  </div>
                );
              })}
            </div>
          )}

          {task.questions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-2 uppercase tracking-wider">Questions ({task.questions.length})</h4>
              {task.questions.map((q) => (
                <div key={q.id} className={`text-sm p-2 rounded-lg border ${q.status === "PENDING" ? "border-danger/20 bg-danger/5" : "border-success/20 bg-success/5"}`}>
                  <p className="text-foreground text-xs">{q.text}</p>
                  {q.answer && <p className="text-muted text-xs mt-1 pl-2 border-l-2 border-success/30">{q.answer}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {getNextStatuses(task.status).map((s) => (
              <button key={s} onClick={() => onMove(task.id, s)} className={`text-xs px-3 py-1 rounded border transition-colors ${statusBtnColor(s)}`}>{statusLabel(s)}</button>
            ))}
            {onFullscreen && (
              <button onClick={() => onFullscreen(task)}
                className="text-xs px-3 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition-colors ml-auto">Open</button>
            )}
            {onDelete && (
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className={`text-xs px-3 py-1 rounded border border-danger/30 text-danger hover:bg-danger-subtle transition-colors ${onFullscreen ? "" : "ml-auto"}`}
              >
                Delete
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-2">
            <span>Created {formatDate(task.createdAt)}</span><span>Updated {formatDate(task.updatedAt)}</span>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog — REV22-043: replaces native confirm() */}
      {onDelete && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete task</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-medium text-foreground">{task.ticketId}</span>?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 gap-2">
              <button
                onClick={() => setDeleteDialogOpen(false)}
                className="text-sm px-4 py-2 rounded-lg border border-card-border text-muted hover:text-foreground hover:border-card-border-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeleteDialogOpen(false);
                  onDelete(task.id);
                }}
                className="text-sm px-4 py-2 rounded-lg border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
              >
                Delete
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
