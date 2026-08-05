"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export type { InitiativeStatus, TaskTypeValue, InitiativeTask, InitiativeMessage, Initiative, ProjectOption, Agent, NewTaskPayload } from "./ideas-tab.types";
export { INITIATIVE_STATUS_CONFIG } from "./ideas-tab.types";

import type {
  Initiative,
  InitiativeStatus,
  ProjectOption,
  Agent,
  NewTaskPayload,
} from "./ideas-tab.types";

import { InitiativeCard } from "./InitiativeCard";
import { CompletedInitiativeCard } from "./CompletedInitiativeCard";

// ---------- AutoGrow Textarea ----------

interface AutoGrowTextareaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  id?: string;
}

function AutoGrowTextarea({ value, onChange, placeholder, className = "", minRows = 4, id }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden" }}
      className={`w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50 ${className}`}
    />
  );
}

// ---------- Main IdeasTab Component ----------

interface IdeasTabProps {
  activeInitiatives: Initiative[];
  completedInitiatives: Initiative[];
  newIdea: string;
  onNewIdeaChange: (val: string) => void;
  ideaProjectId: string;
  onIdeaProjectIdChange: (val: string) => void;
  projectOptions: ProjectOption[];
  submittingIdea: boolean;
  onSubmitIdea: () => void;
  expandedInitiativeId: string | null;
  onToggleExpand: (id: string) => void;
  isOwner: boolean;
  agents: Agent[];
  answerInputs: Record<string, string>;
  onAnswerInputChange: (initiativeId: string, val: string) => void;
  sendingAnswer: string | null;
  onSendAnswer: (initiativeId: string, messageType: string) => void;
  onQuickReply: (initiativeId: string, reply: string) => void;
  executingInitiativeId: string | null;
  onExecute: (id: string) => void;
  deletingInitiativeId: string | null;
  onDelete: (id: string) => void;
  changingStatusId: string | null;
  onChangeStatus: (id: string, status: InitiativeStatus) => void;
  creatingInitiativeTask: boolean;
  onCreateTask: (initiativeId: string, task: NewTaskPayload) => Promise<void>;
  onFileUpload?: (initiativeId: string | null, file: File) => Promise<string | null>;
  initiativesLoading?: boolean;
}

export default function IdeasTab({
  activeInitiatives, completedInitiatives, newIdea, onNewIdeaChange, ideaProjectId,
  onIdeaProjectIdChange, projectOptions, submittingIdea, onSubmitIdea, expandedInitiativeId,
  onToggleExpand, isOwner, agents, answerInputs, onAnswerInputChange, sendingAnswer,
  onSendAnswer, onQuickReply, executingInitiativeId, onExecute, deletingInitiativeId, onDelete,
  changingStatusId, onChangeStatus, creatingInitiativeTask, onCreateTask, onFileUpload,
  initiativesLoading = false,
}: IdeasTabProps) {
  const t = useTranslations("studio");
  const router = useRouter();
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [timeFilter, setTimeFilter] = useState<string>("all");

  const getFilteredCompleted = () => {
    if (timeFilter === "all") return completedInitiatives;
    const now = new Date();
    let start: Date;
    let end: Date = now;
    switch (timeFilter) {
      case "today":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "this_week": {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        break;
      }
      case "last_week": {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1) - 7);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const e = new Date(start);
        e.setDate(e.getDate() + 7);
        end = e;
        break;
      }
      case "this_month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "this_year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "last_year":
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        return completedInitiatives;
    }
    return completedInitiatives.filter((i) => {
      const d = new Date(i.updatedAt);
      return d >= start && d < end;
    });
  };
  const filteredCompleted = getFilteredCompleted();

  const handleTaskClick = (taskId: string) => {
    router.push(`/studio?tab=board&taskId=${taskId}`);
  };

  return (
    <div className="space-y-10">
      <div className="bg-card-bg border border-card-border rounded-xl card-sm sm:card-lg">
        <h2 className="text-lg font-semibold mb-4">{t("new_idea")}</h2>
        <div className="space-y-4">
          <AutoGrowTextarea id="new-idea-input" value={newIdea} onChange={onNewIdeaChange} placeholder={t("describe_idea")} minRows={4} />
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted/50">/question -- запитати про статус (не створює ініціативу)</p>
            <label className="cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-card-border text-muted hover:border-accent/30 hover:text-accent transition-colors">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (onFileUpload) {
                    const url = await onFileUpload(null, file);
                    if (url) {
                      onNewIdeaChange(newIdea + (newIdea ? "\n" : "") + `[${file.name}](${url})`);
                    }
                  } else {
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const res = await fetch("/api/uploads", { method: "POST", body: formData });
                      if (res.ok) {
                        const data = await res.json();
                        onNewIdeaChange(newIdea + (newIdea ? "\n" : "") + `[${file.name}](${data.url})`);
                      }
                    } catch { /* upload failed silently */ }
                  }
                  e.target.value = "";
                }}
              />
              Attach file
            </label>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select value={ideaProjectId} onChange={(e) => onIdeaProjectIdChange(e.target.value)}
              className="w-full sm:flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50">
              <option value="">{t("select_project")}</option>
              {projectOptions.map((p) => (<option key={p.id || p.name} value={p.id}>{p.name}</option>))}
            </select>
            <button onClick={onSubmitIdea} disabled={submittingIdea || !newIdea.trim()}
              className="w-full sm:w-auto px-6 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
              {submittingIdea ? t("submitting") : t("submit_idea")}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">{t("active_ideas")}</h2>
        {initiativesLoading && activeInitiatives.length === 0 && completedInitiatives.length === 0 ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card-bg border border-card-border rounded-xl p-4">
                <Skeleton className="h-4 w-1/3 mb-3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : activeInitiatives.length === 0 && completedInitiatives.length === 0 ? (
          <div className="bg-card-bg border border-dashed border-card-border rounded-xl">
            <EmptyState
              icon={
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              }
              title={t("no_ideas")}
              action={{
                label: t("create_first_idea"),
                onClick: () => {
                  const el = document.getElementById("new-idea-input") as HTMLTextAreaElement | null;
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.focus({ preventScroll: true });
                },
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {activeInitiatives.map((initiative) => (
              <InitiativeCard key={initiative.id} initiative={initiative} isExpanded={expandedInitiativeId === initiative.id}
                onToggle={() => onToggleExpand(initiative.id)} isOwner={isOwner} agents={agents} onExecute={onExecute} onDelete={onDelete}
                onChangeStatus={onChangeStatus} onCreateTask={onCreateTask} onSendAnswer={onSendAnswer} onQuickReply={onQuickReply} answerInput={answerInputs[initiative.id] || ""}
                onAnswerInputChange={(val) => onAnswerInputChange(initiative.id, val)} isExecuting={executingInitiativeId === initiative.id}
                isDeleting={deletingInitiativeId === initiative.id} isChangingStatus={changingStatusId === initiative.id}
                isSendingAnswer={sendingAnswer === initiative.id} isCreatingTask={creatingInitiativeTask} t={t} onTaskClick={handleTaskClick} />
            ))}

            {completedInitiatives.length > 0 && (
              <div className="mt-6">
                <button onClick={() => setCompletedExpanded((v) => !v)}
                  className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-3 w-full min-h-[40px]">
                  <svg className={`w-4 h-4 transition-transform ${completedExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium">{t("completed_ideas")}</span>
                  <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-success-subtle text-success border border-success/20">{filteredCompleted.length}</span>
                </button>

                {completedExpanded && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {([
                        ["today", "Сьогодні"],
                        ["this_week", "Цей тиждень"],
                        ["last_week", "Мін. тиждень"],
                        ["this_month", "Цей місяць"],
                        ["last_month", "Мін. місяць"],
                        ["this_year", "Цей рік"],
                        ["last_year", "Мін. рік"],
                        ["all", "Все"],
                      ] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setTimeFilter(key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeFilter === key ? "bg-accent text-white" : "bg-card-border/50 text-muted hover:text-foreground hover:bg-card-border"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {filteredCompleted.length === 0 ? (
                      <p className="text-xs text-muted/60 py-4 text-center">Немає завершених ідей за цей період</p>
                    ) : (
                      filteredCompleted.map((initiative) => (
                        <CompletedInitiativeCard key={initiative.id} initiative={initiative} isExpanded={expandedInitiativeId === initiative.id}
                          onToggle={() => onToggleExpand(initiative.id)} isOwner={isOwner} onChangeStatus={onChangeStatus} onDelete={onDelete}
                          onExecute={onExecute} onSendAnswer={onSendAnswer} onQuickReply={onQuickReply} answerInput={answerInputs[initiative.id] || ""}
                          onAnswerInputChange={(val) => onAnswerInputChange(initiative.id, val)} isExecuting={executingInitiativeId === initiative.id}
                          isDeleting={deletingInitiativeId === initiative.id} isChangingStatus={changingStatusId === initiative.id}
                          isSendingAnswer={sendingAnswer === initiative.id} t={t} onTaskClick={handleTaskClick} />
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
