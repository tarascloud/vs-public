"use client";

import type {
  Initiative,
  InitiativeStatus,
  StudioTranslations,
} from "./ideas-tab.types";
import { INITIATIVE_STATUS_CONFIG, projectBadge, statusBadge, formatDate, formatTokens } from "./ideas-tab.types";
import { MobileTaskList } from "./TaskListViews";
import { MessagesSection } from "./InitiativeCard";

// ---- CompletedInitiativeCard ----

export interface CompletedInitiativeCardProps {
  initiative: Initiative;
  isExpanded: boolean;
  onToggle: () => void;
  isOwner: boolean;
  onChangeStatus: (id: string, status: InitiativeStatus) => void;
  onDelete: (id: string) => void;
  onExecute: (id: string) => void;
  onSendAnswer: (initiativeId: string, messageType: string) => void;
  onQuickReply: (initiativeId: string, reply: string) => void;
  answerInput: string;
  onAnswerInputChange: (val: string) => void;
  isExecuting: boolean;
  isDeleting: boolean;
  isChangingStatus: boolean;
  isSendingAnswer: boolean;
  t: StudioTranslations;
  onTaskClick: (taskId: string) => void;
}

export function CompletedInitiativeCard({
  initiative, isExpanded, onToggle, isOwner, onChangeStatus, onDelete,
  onExecute, onSendAnswer, onQuickReply, answerInput, onAnswerInputChange,
  isExecuting, isDeleting, isChangingStatus, isSendingAnswer, t, onTaskClick,
}: CompletedInitiativeCardProps) {
  const statusConf = INITIATIVE_STATUS_CONFIG[initiative.status];
  const doneCount = initiative.tasks.filter((tk) => tk.status === "DONE").length;
  const totalTasks = initiative.tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const totalTokens = initiative.tasks.reduce((sum, tk) => sum + (tk.tokensUsed ?? 0), 0);
  const pendingMessages = initiative.messages.filter((m) => m.type === "question" || m.type === "blocker");

  return (
    <div className={`bg-card-bg border rounded-xl transition-colors opacity-60 hover:opacity-80 ${isExpanded ? "border-accent/50 opacity-90" : "border-card-border hover:border-accent/30"}`}>
      <div className="card-sm cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusConf.dot}`} />
          <span className={`text-xs px-2 py-0.5 rounded border ${statusConf.badge}`}>{t("initiative_done")}</span>
          {initiative.project && projectBadge(initiative.project.name)}
          {totalTokens > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20" title={`${totalTokens.toLocaleString()} tokens`}>{formatTokens(totalTokens)} tok</span>
          )}
          <span className="ml-auto text-xs text-muted shrink-0">{formatDate(initiative.updatedAt)}</span>
          <button onClick={(e) => { e.stopPropagation(); onChangeStatus(initiative.id, "IN_PROGRESS"); }} disabled={isChangingStatus} title={t("reopen")}
            className="ml-1 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-muted/40 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isChangingStatus ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
          </button>
          {isOwner && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(initiative.id); }} disabled={isDeleting} title={t("delete_idea")}
              className="ml-1 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-muted/40 hover:text-danger hover:bg-danger-subtle transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isDeleting ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              )}
            </button>
          )}
        </div>
        <h3 className="text-sm font-medium mb-1 line-through text-muted">{initiative.title || t("untitled")}</h3>
        <p className="text-xs text-muted/60 line-clamp-2">{initiative.rawIdea}</p>
        {totalTasks > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">{t("tasks_progress", { done: doneCount, total: totalTasks })}</span>
              <span className="text-xs text-muted">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-card-border rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
        {initiative.summary && (
          <div className="mt-2 text-xs text-muted/80 border-l-2 border-success/30 pl-2 line-clamp-2">{initiative.summary}</div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-success">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {t("initiative_done")}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-card-border px-4 pb-4 pt-3 space-y-4">
          <div><h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">{t("new_idea")}</h4><p className="text-sm text-foreground whitespace-pre-wrap">{initiative.rawIdea}</p></div>
          <div><h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">{t("summary")}</h4><p className="text-sm text-muted">{initiative.summary || t("no_summary")}</p></div>
          {initiative.tasks.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">{t("linked_tasks")}</h4>
              <div className="sm:hidden"><MobileTaskList tasks={initiative.tasks} onTaskClick={onTaskClick} t={t} /></div>
              <div className="hidden sm:block rounded-lg border border-card-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-card-border bg-card-border/20"><th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">#</th><th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">{t("title_label")}</th><th scope="col" className="text-left px-3 py-2 text-muted/70 font-medium">Status</th></tr></thead>
                  <tbody>
                    {initiative.tasks.map((itask) => (
                      <tr key={itask.id} className="border-b border-card-border/50 last:border-0 opacity-60"><td className="px-3 py-2 font-mono text-muted/60">{itask.ticketId}</td><td className="px-3 py-2 line-through text-muted">{itask.title}</td><td className="px-3 py-2">{statusBadge(itask.status)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-muted/60"><span>{t("created")} {formatDate(initiative.createdAt)}</span><span>{t("updated")} {formatDate(initiative.updatedAt)}</span></div>
          {initiative.status === "PLANNED" && (
            <div className="flex items-center gap-3 py-2 border-t border-card-border">
              <button onClick={() => onExecute(initiative.id)} disabled={isExecuting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-success hover:bg-success/90 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{t("start_execution")}</button>
            </div>
          )}

          <MessagesSection
            messages={initiative.messages}
            pendingMessages={pendingMessages}
            isSendingAnswer={isSendingAnswer}
            onSendAnswer={onSendAnswer}
            onQuickReply={onQuickReply}
            answerInput={answerInput}
            onAnswerInputChange={onAnswerInputChange}
            initiativeId={initiative.id}
            t={t}
          />
        </div>
      )}
    </div>
  );
}
