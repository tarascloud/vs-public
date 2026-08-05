"use client";

import { useEffect, useMemo } from "react";

import { sanitizeHtml } from "@/lib/sanitize-html";
import { marked } from "marked";
import type { Task, TaskStatus } from "./kanban-board.types";

import {
  STATUS_COLUMNS,
  PRIORITY_MAP,
  TASK_TYPE_MAP,
  projectBadge,
  formatDateTime,
  formatTokens,
  statusBadge,
} from "./kanban-board.types";

interface TaskFullscreenModalProps {
  task: Task;
  onClose: () => void;
  onMove: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
}

export default function TaskFullscreenModal({ task, onClose, onMove, onDelete }: TaskFullscreenModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [onClose]);

  const prio = PRIORITY_MAP[task.priority] || PRIORITY_MAP[0];
  const taskTypeCfg = TASK_TYPE_MAP[task.type] || TASK_TYPE_MAP["FEATURE"];

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
      case "BLOCKED":     return "border-red-500/30 text-red-400 hover:bg-red-500/10";
      case "TESTING":     return "border-amber-500/30 text-amber-400 hover:bg-amber-500/10";
      case "DONE":        return "border-green-500/30 text-green-400 hover:bg-green-500/10";
    }
  };

  // Markdown-to-HTML via marked + DOMPurify sanitization.
  // DEV-20260507-0006: Memoize on task.description so marked.parse + DOMPurify
  // don't re-run on every parent re-render (e.g. drag, status filter change)
  // when only the modal's other props changed. Description rarely changes.
  const descriptionHtml = useMemo(
    () => {
      if (!task.description) return "";
      const html = marked.parse(task.description, { async: false, breaks: true }) as string;
      return sanitizeHtml(html);
    },
    [task.description],
  );

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-16" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-mono text-muted">{task.ticketId}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${taskTypeCfg.style}`}>{taskTypeCfg.icon} {taskTypeCfg.labelKey}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${prio.style}`}>{prio.label}</span>
              {statusBadge(task.status)}
            </div>
            <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
            {task.initiative?.title && (
              <p className="text-sm text-muted mt-1">
                <span className="text-muted/40">→</span> {task.initiative.title}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {projectBadge(task.project?.name)}
              {task.agent && <span className="text-xs text-accent/70">{task.agent.displayName} ({task.agent.role})</span>}
              {task.assigneeUser?.name && <span className="text-xs text-muted">{task.assigneeUser.name}</span>}
              <span className="text-xs text-muted/50">Created {formatDateTime(task.createdAt)} · Updated {formatDateTime(task.updatedAt)}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close task" className="p-2 rounded-lg border border-card-border hover:border-accent/30 text-muted hover:text-foreground transition-colors shrink-0 ml-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Status action buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {getNextStatuses(task.status).map((s) => (
            <button key={s} onClick={() => { onMove(task.id, s); onClose(); }} className={`text-sm px-4 py-2 rounded-lg border transition-colors ${statusBtnColor(s)}`}>
              {statusLabel(s)}
            </button>
          ))}
          {onDelete && (
            <button onClick={() => { if (confirm(`Delete "${task.title}"?`)) { onDelete(task.id); onClose(); } }}
              aria-label={`Delete task ${task.ticketId}`}
              className="text-sm px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors ml-auto">
              Delete
            </button>
          )}
        </div>

        {/* Dependency graph (compact linear flow) */}
        {((task.blockedBy && task.blockedBy.length > 0) || (task.blocking && task.blocking.length > 0)) && (
          <div className="rounded-xl border border-card-border bg-card-bg p-6 mb-6">
            <h3 className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-3">Dependencies</h3>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {task.blockedBy?.map((b) => (
                <span key={b.id} className={`px-2 py-1 rounded ${b.status === "DONE" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {b.ticketId}
                </span>
              ))}
              {task.blockedBy && task.blockedBy.length > 0 && (
                <span className="text-muted">→</span>
              )}
              <span className="px-2 py-1 rounded bg-accent/10 text-accent font-semibold">{task.ticketId}</span>
              {task.blocking && task.blocking.length > 0 && (
                <>
                  <span className="text-muted">→</span>
                  {task.blocking.map((b) => (
                    <span key={b.id} className={`px-2 py-1 rounded ${b.status === "DONE" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                      {b.ticketId}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="rounded-xl border border-card-border bg-card-bg p-6 mb-6">
            <h3 className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-3">Description</h3>
            <div className="text-sm text-foreground-secondary leading-relaxed"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          </div>
        )}

        {/* Completion */}
        {task.status === "DONE" && (task.completionNote || task.commitHash || task.tokensUsed || task.completedAt) && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 mb-6">
            <h3 className="text-sm font-semibold text-green-400 mb-2">Completion</h3>
            {task.completionNote && <p className="text-sm text-green-300 mb-3">{task.completionNote}</p>}
            <div className="flex items-center gap-3 flex-wrap">
              {task.commitHash && (
                <span className="text-xs font-mono text-muted">
                  {task.commitUrl ? <a href={task.commitUrl} target="_blank" rel="noopener noreferrer" className="text-accent/70 hover:text-accent">{task.commitHash.slice(0, 7)}</a> : task.commitHash.slice(0, 7)}
                </span>
              )}
              {task.tokensUsed != null && <span className="text-xs text-muted">{formatTokens(task.tokensUsed)}</span>}
              {task.completedAt && <span className="text-xs text-muted/50">{formatDateTime(task.completedAt)}</span>}
            </div>
          </div>
        )}

        {/* Blocked by */}
        {task.blockedBy && task.blockedBy.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card-bg p-6 mb-6">
            <h3 className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-3">Blocked by</h3>
            <div className="space-y-2">
              {task.blockedBy.map((b) => (
                <div key={b.id} className={`flex items-center gap-2 text-sm ${b.status === "DONE" ? "text-green-400" : "text-red-400"}`}>
                  <span className={`w-2 h-2 rounded-full ${b.status === "DONE" ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="font-mono text-xs">{b.ticketId}</span>
                  <span>{b.title}</span>
                  {b.status === "DONE" && <span className="text-green-400/60">(done)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocking */}
        {task.blocking && task.blocking.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card-bg p-6 mb-6">
            <h3 className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-3">Blocking</h3>
            <div className="space-y-2">
              {task.blocking.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm text-muted">
                  <span className="font-mono text-xs">{b.ticketId}</span>
                  <span>{b.title}</span>
                  {statusBadge(b.status as TaskStatus)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions */}
        {task.questions.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card-bg p-6 mb-6">
            <h3 className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-3">Questions ({task.questions.length})</h3>
            <div className="space-y-3">
              {task.questions.map((q) => (
                <div key={q.id} className={`p-3 rounded-lg border ${q.status === "PENDING" ? "border-red-500/20 bg-red-500/5" : "border-green-500/20 bg-green-500/5"}`}>
                  <p className="text-sm text-foreground">{q.text}</p>
                  {q.answer && <p className="text-sm text-muted mt-2 pl-3 border-l-2 border-green-500/30">{q.answer}</p>}
                  <span className="text-xs text-muted/40 mt-1 block">{formatDateTime(q.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
