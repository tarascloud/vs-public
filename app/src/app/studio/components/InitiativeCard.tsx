"use client";

import { useState } from "react";
import type {
  Initiative,
  InitiativeStatus,
  InitiativeTask,
  Agent,
  NewTaskPayload,
  TaskTypeValue,
  StudioTranslations,
} from "./ideas-tab.types";
import { INITIATIVE_STATUS_CONFIG, projectBadge, statusBadge, formatDate, formatTokens } from "./ideas-tab.types";
import { MobileTaskList, DesktopTaskTable } from "./TaskListViews";
import { EmptyState } from "@/components/ui/empty-state";

// ---- Quick Reply Parser ----

function parseQuickReplies(content: string): { cleanContent: string; replies: string[] } | null {
  const buttons = content.match(/\[([^\]]+)\]/g);
  if (!buttons || buttons.length === 0) return null;
  const cleanContent = content.replace(/\[([^\]]+)\]/g, "").trim();
  return { cleanContent, replies: buttons.map((b) => b.slice(1, -1)) };
}

// ---- Messages Section (shared between InitiativeCard and CompletedInitiativeCard) ----

export interface MessagesSectionProps {
  messages: Initiative["messages"];
  pendingMessages: Initiative["messages"];
  isSendingAnswer: boolean;
  onSendAnswer: (initiativeId: string, messageType: string) => void;
  onQuickReply: (initiativeId: string, reply: string) => void;
  answerInput: string;
  onAnswerInputChange: (val: string) => void;
  initiativeId: string;
  t: StudioTranslations;
}

export function MessagesSection({
  messages, pendingMessages, isSendingAnswer, onSendAnswer, onQuickReply,
  answerInput, onAnswerInputChange, initiativeId, t,
}: MessagesSectionProps) {
  return (
    <>
      {messages.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">{t("messages_label")} ({messages.length})</h4>
          <div className="space-y-2">
            {messages.map((msg) => {
              const isQuestion = msg.type === "question" || msg.type === "blocker";
              const isAnswer = msg.type === "answer";
              const borderColor = isQuestion ? (msg.type === "blocker" ? "border-orange-500/20 bg-orange-500/5" : "border-red-500/20 bg-red-500/5") : isAnswer ? "border-green-500/20 bg-green-500/5" : "border-card-border bg-card-bg";
              const parsed = isQuestion ? parseQuickReplies(msg.content) : null;
              const isLastPending = pendingMessages.length > 0 && pendingMessages[pendingMessages.length - 1].id === msg.id;
              return (
                <div key={msg.id} className={`text-sm p-3 rounded-lg border ${borderColor}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${isQuestion ? "bg-red-500/10 text-red-400" : isAnswer ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>{msg.type}</span>
                    <span className="text-xs text-muted">{msg.fromAgent || msg.fromUser?.name || "System"}</span>
                    <span className="text-xs text-muted/50 ml-auto">{formatDate(msg.createdAt)}</span>
                  </div>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{parsed ? parsed.cleanContent : msg.content}</p>
                  {parsed && isLastPending && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {parsed.replies.map((reply, i) => (
                        <button key={i} onClick={() => onQuickReply(initiativeId, reply)} disabled={isSendingAnswer}
                          className="text-xs px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingMessages.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" value={answerInput} onChange={(e) => onAnswerInputChange(e.target.value)} placeholder={t("answer_placeholder")}
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
            onKeyDown={(e) => { if (e.key === "Enter" && answerInput.trim()) onSendAnswer(initiativeId, pendingMessages[pendingMessages.length - 1].type); }} />
          <button onClick={() => onSendAnswer(initiativeId, pendingMessages[pendingMessages.length - 1].type)} disabled={isSendingAnswer || !answerInput.trim()}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t("send")}</button>
        </div>
      )}
    </>
  );
}

// ---- InitiativeCard ----

export interface InitiativeCardProps {
  initiative: Initiative;
  isExpanded: boolean;
  onToggle: () => void;
  isOwner: boolean;
  agents: Agent[];
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, status: InitiativeStatus) => void;
  onCreateTask: (initiativeId: string, task: NewTaskPayload) => Promise<void>;
  onSendAnswer: (initiativeId: string, messageType: string) => void;
  onQuickReply: (initiativeId: string, reply: string) => void;
  answerInput: string;
  onAnswerInputChange: (val: string) => void;
  isExecuting: boolean;
  isDeleting: boolean;
  isChangingStatus: boolean;
  isSendingAnswer: boolean;
  isCreatingTask: boolean;
  t: StudioTranslations;
  onTaskClick: (taskId: string) => void;
}

export function InitiativeCard({
  initiative, isExpanded, onToggle, isOwner, agents, onExecute, onDelete,
  onChangeStatus, onCreateTask, onSendAnswer, onQuickReply, answerInput, onAnswerInputChange,
  isExecuting, isDeleting, isChangingStatus, isSendingAnswer, isCreatingTask, t, onTaskClick,
}: InitiativeCardProps) {
  const statusConf = INITIATIVE_STATUS_CONFIG[initiative.status];
  const doneCount = initiative.tasks.filter((tk) => tk.status === "DONE").length;
  const totalTasks = initiative.tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const totalTokens = initiative.tasks.reduce((sum, tk) => sum + (tk.tokensUsed ?? 0), 0);
  const pendingMessages = initiative.messages.filter((m) => m.type === "question" || m.type === "blocker");
  const allTasksDone = totalTasks > 0 && doneCount === totalTasks;

  const statusKey = {
    IDEA: "status_idea", PLANNING: "status_planning", PLANNED: "status_planned",
    IN_PROGRESS: "initiative_in_progress", BLOCKED: "initiative_blocked", DONE: "initiative_done",
  }[initiative.status];

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState<NewTaskPayload>({
    title: "", description: "", priority: 1, type: "FEATURE", assigneeType: "AGENT", agentId: "", blockedByIds: [],
  });

  const handleAddTask = async () => {
    await onCreateTask(initiative.id, newTask);
    setShowAddTask(false);
    setNewTask({ title: "", description: "", priority: 1, type: "FEATURE", assigneeType: "AGENT", agentId: "", blockedByIds: [] });
  };

  return (
    <div className={`bg-card-bg border rounded-xl transition-colors ${isExpanded ? "border-accent/50" : "border-card-border hover:border-accent/30"}`}>
      {/* Card header */}
      <div className="card-sm cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusConf.dot}`} />
          <span className={`text-xs px-2 py-0.5 rounded border ${statusConf.badge}`}>{t(statusKey)}</span>
          {initiative.project && projectBadge(initiative.project.name)}
          {pendingMessages.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{pendingMessages.length} Q</span>
          )}
          {totalTokens > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20" title={`${totalTokens.toLocaleString()} tokens`}>{formatTokens(totalTokens)} tok</span>
          )}
          <span className="ml-auto text-xs text-muted shrink-0">{formatDate(initiative.createdAt)}</span>

          {allTasksDone && initiative.status !== "DONE" ? (
            <button onClick={(e) => { e.stopPropagation(); onChangeStatus(initiative.id, "DONE"); }} disabled={isChangingStatus}
              aria-label="Mark initiative as done"
              className="ml-1 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 text-xs font-medium hover:bg-green-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isChangingStatus ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              )}
              Done
            </button>
          ) : initiative.status !== "DONE" ? (
            <button onClick={(e) => { e.stopPropagation(); }} disabled title={t("complete_all_tasks_first")}
              aria-label={t("complete_all_tasks_first")}
              className="ml-1 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-muted/40 opacity-30 cursor-not-allowed">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </button>
          ) : null}

          {isOwner && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(initiative.id); }} disabled={isDeleting} title={t("delete_idea")}
              aria-label={t("delete_idea")}
              className="ml-1 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center rounded text-muted/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isDeleting ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              )}
            </button>
          )}
        </div>

        <h3 className="text-sm font-medium mb-1">{initiative.title || t("untitled")}</h3>
        <p className="text-xs text-muted line-clamp-2">{initiative.rawIdea}</p>

        {totalTasks > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">{t("tasks_progress", { done: doneCount, total: totalTasks })}</span>
              <span className="text-xs text-muted">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-card-border rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {initiative.summary && (
          <div className="mt-2 text-xs text-muted/80 border-l-2 border-accent/30 pl-2 line-clamp-2">{initiative.summary}</div>
        )}

        {(initiative.status === "IDEA" || initiative.status === "PLANNING") && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-400">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            {t("auto_planning")}
          </div>
        )}

        {initiative.status === "PLANNED" && (
          <div className="mt-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onExecute(initiative.id)} disabled={isExecuting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20">
              {isExecuting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
              {isExecuting ? t("planning_in_progress") : t("start_execution")}
            </button>
            <span className="text-xs text-emerald-400">{t("plan_ready")}</span>
          </div>
        )}

        {initiative.status === "DONE" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {t("initiative_done")}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-card-border px-4 pb-4 pt-3 space-y-4">
          <div>
            <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">{t("new_idea")}</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{initiative.rawIdea}</p>
          </div>
          <div>
            <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">{t("summary")}</h4>
            <p className="text-sm text-muted">{initiative.summary || t("no_summary")}</p>
          </div>

          <div>
            <h4 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">{t("linked_tasks")}</h4>
            {initiative.tasks.length > 0 ? (
              <>
                <div className="sm:hidden"><MobileTaskList tasks={initiative.tasks} onTaskClick={onTaskClick} t={t} /></div>
                <div className="hidden sm:block"><DesktopTaskTable tasks={initiative.tasks} onTaskClick={onTaskClick} t={t} /></div>
              </>
            ) : (
              <EmptyState
                title={t("no_tasks")}
                compact
                icon={
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
              />
            )}

            {showAddTask ? (
              <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-3">
                <h5 className="text-xs font-semibold text-accent">{t("add_task")}</h5>
                <input type="text" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t("title_placeholder")} className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs focus:outline-none focus:border-accent/50" />
                <textarea value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t("description_placeholder")} rows={2} className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs focus:outline-none focus:border-accent/50 resize-none" />
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={newTask.priority} onChange={(e) => setNewTask((p) => ({ ...p, priority: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs focus:outline-none focus:border-accent/50">
                    <option value={2}>{t("priority_high")}</option><option value={1}>{t("priority_medium")}</option><option value={0}>{t("priority_low")}</option>
                  </select>
                  <select value={newTask.type} onChange={(e) => setNewTask((p) => ({ ...p, type: e.target.value as TaskTypeValue }))}
                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs focus:outline-none focus:border-accent/50">
                    <option value="FEATURE">{t("type_feature")}</option><option value="BUG">{t("type_bug")}</option><option value="CHORE">{t("type_chore")}</option><option value="REVIEW">{t("type_review")}</option>
                  </select>
                  <div className="flex items-center gap-3 rounded-lg border border-card-border px-3 py-2 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`assignee-${initiative.id}`} value="AGENT" checked={newTask.assigneeType === "AGENT"} onChange={() => setNewTask((p) => ({ ...p, assigneeType: "AGENT" }))} />{t("assignee_agent")}</label>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`assignee-${initiative.id}`} value="OWNER" checked={newTask.assigneeType === "OWNER"} onChange={() => setNewTask((p) => ({ ...p, assigneeType: "OWNER" }))} />{t("assignee_owner")}</label>
                  </div>
                </div>
                {newTask.assigneeType === "AGENT" && (
                  <select value={newTask.agentId} onChange={(e) => setNewTask((p) => ({ ...p, agentId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs focus:outline-none focus:border-accent/50">
                    <option value="">{t("assignee_agent")}...</option>
                    {agents.map((ag) => (<option key={ag.id} value={ag.id}>{ag.displayName}</option>))}
                  </select>
                )}
                {initiative.tasks.length > 0 && (
                  <div>
                    <p className="text-xs text-muted/70 mb-1">{t("select_dependencies")}</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {initiative.tasks.map((itask) => (
                        <label key={itask.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={newTask.blockedByIds.includes(itask.id)}
                            onChange={(e) => { setNewTask((p) => ({ ...p, blockedByIds: e.target.checked ? [...p.blockedByIds, itask.id] : p.blockedByIds.filter((id) => id !== itask.id) })); }} />
                          <span className="text-muted">{itask.ticketId}</span><span className="text-foreground">{itask.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={handleAddTask} disabled={isCreatingTask || !newTask.title.trim()}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isCreatingTask ? t("creating") : t("create_task")}
                  </button>
                  <button onClick={() => setShowAddTask(false)}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg border border-card-border text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddTask(true)}
                className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors min-h-[36px]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {t("add_task")}
              </button>
            )}
          </div>

          {initiative.status === "PLANNED" && (
            <div className="flex items-center gap-3 py-2 border-t border-card-border">
              <button onClick={() => onExecute(initiative.id)} disabled={isExecuting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20">
                {isExecuting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
                {isExecuting ? t("planning_in_progress") : t("start_execution")}
              </button>
              <p className="text-xs text-muted">{t("plan_ready")} -- {t("start_execution").toLowerCase()}</p>
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

          <div className="flex items-center gap-3 text-xs text-muted/60">
            <span>{t("created")} {formatDate(initiative.createdAt)}</span>
            <span>{t("updated")} {formatDate(initiative.updatedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
