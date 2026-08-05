"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import KanbanBoard, { TaskCardInner } from "./kanban-board";
import OfficeSummary from "./office-summary";
import ProjectSelector from "./project-selector";
import type { Task as KanbanTask, TaskStatus as KanbanTaskStatus, Agent as KanbanAgent } from "./kanban-board";
import type { Task, Initiative, Agent, Project } from "../hooks/use-studio-data";
import { useTranslations } from "next-intl";

interface BoardTabProps {
  visibleTasks: Task[];
  initiatives: Initiative[];
  projects: Project[];
  agents: Agent[];
  urlProjectId: string | null;
  isOwner: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onMoveTask: (taskId: string, newStatus: KanbanTaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  focusedTaskId?: string | null;
}

const HISTORY_PERIODS = [
  ["today", "Сьогодні"],
  ["this_week", "Цей тиждень"],
  ["last_week", "Мін. тиждень"],
  ["this_month", "Цей місяць"],
  ["last_month", "Мін. місяць"],
  ["this_year", "Цей рік"],
  ["last_year", "Мін. рік"],
  ["all", "Все"],
] as const;

type HistoryPeriod = typeof HISTORY_PERIODS[number][0];

function filterByPeriod(tasks: Task[], period: HistoryPeriod): Task[] {
  if (period === "all") return tasks;
  const now = new Date();
  let start: Date;
  switch (period) {
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
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return tasks.filter((t) => {
        const dt = new Date(t.completedAt || t.updatedAt).getTime();
        return dt >= start.getTime() && dt < end.getTime();
      });
    }
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return tasks.filter((t) => {
        const dt = new Date(t.completedAt || t.updatedAt);
        return dt >= start && dt < new Date(now.getFullYear(), now.getMonth(), 1);
      });
    case "this_year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "last_year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      return tasks.filter((t) => {
        const dt = new Date(t.completedAt || t.updatedAt);
        return dt >= start && dt < new Date(now.getFullYear(), 0, 1);
      });
    default:
      return tasks;
  }
  return tasks.filter((t) => new Date(t.completedAt || t.updatedAt) >= start);
}

// Group DONE tasks by ISO week (Monday-based)
function groupByWeek(tasks: Task[]): [string, Task[]][] {
  const groups: Record<string, Task[]> = {};
  for (const t of tasks) {
    const date = new Date(t.completedAt || t.updatedAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // Monday
    weekStart.setHours(0, 0, 0, 0);
    const key = weekStart.toISOString().slice(0, 10);
    (groups[key] ??= []).push(t);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function BoardTab({
  visibleTasks,
  initiatives,
  projects,
  agents,
  urlProjectId,
  isOwner,
  expandedId,
  onToggleExpand,
  onMoveTask,
  onDeleteTask,
  onRefresh,
  focusedTaskId,
}: BoardTabProps) {
  const t = useTranslations("studio");
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    urlProjectId ? [urlProjectId] : []
  );
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("this_week");

  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);
  const bulkMove = useCallback(async (status: string) => {
    if (!status) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => onMoveTask(id, status as KanbanTaskStatus)));
    setSelectedIds(new Set());
  }, [selectedIds, onMoveTask]);

  // Filter states — initialized from URL searchParams
  const [filterAgent, setFilterAgent] = useState<string>(searchParams.get("agent") || "");
  const [filterType, setFilterType] = useState<string>(searchParams.get("type") || "");
  const [filterProject, setFilterProject] = useState<string>(searchParams.get("project") || "");

  // Persist filters to URL
  const updateUrlFilters = useCallback((agent: string, type: string, project: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "board");
    if (agent) params.set("agent", agent); else params.delete("agent");
    if (type) params.set("type", type); else params.delete("type");
    if (project) params.set("project", project); else params.delete("project");
    router.replace(`/studio?${params.toString()}`);
  }, [searchParams, router]);

  const handleFilterAgent = useCallback((val: string) => {
    setFilterAgent(val);
    updateUrlFilters(val, filterType, filterProject);
  }, [filterType, filterProject, updateUrlFilters]);

  const handleFilterType = useCallback((val: string) => {
    setFilterType(val);
    updateUrlFilters(filterAgent, val, filterProject);
  }, [filterAgent, filterProject, updateUrlFilters]);

  const handleFilterProject = useCallback((val: string) => {
    setFilterProject(val);
    updateUrlFilters(filterAgent, filterType, val);
  }, [filterAgent, filterType, updateUrlFilters]);

  const handleClearFilters = useCallback(() => {
    setFilterAgent("");
    setFilterType("");
    setFilterProject("");
    updateUrlFilters("", "", "");
  }, [updateUrlFilters]);

  const hasActiveFilters = filterAgent || filterType || filterProject;

  // Unique agent names from tasks for the dropdown
  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of agents) {
      if (!seen.has(a.name)) seen.set(a.name, a.displayName);
    }
    return Array.from(seen.entries()).map(([name, displayName]) => ({ name, displayName }));
  }, [agents]);

  // Apply all filters
  const boardTasksBase = useMemo(() => {
    let filtered = selectedProjectIds.length === 0
      ? visibleTasks
      : visibleTasks.filter((tk) => tk.projectId && selectedProjectIds.includes(tk.projectId));

    if (filterAgent) {
      filtered = filtered.filter((tk) => tk.agent?.name === filterAgent);
    }
    if (filterType) {
      filtered = filtered.filter((tk) => tk.type === filterType);
    }
    if (filterProject) {
      filtered = filtered.filter((tk) => tk.project?.id === filterProject);
    }

    return filtered;
  }, [visibleTasks, selectedProjectIds, filterAgent, filterType, filterProject]);

  const boardTasks = myTasksOnly
    ? boardTasksBase.filter((tk) => tk.assigneeType === "OWNER")
    : boardTasksBase;

  const activeTasks = boardTasks.filter((t) => t.status !== "DONE");
  const allDoneTasks = boardTasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const doneTasks = filterByPeriod(allDoneTasks, historyPeriod);

  return (
    <div className="space-y-8">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterAgent}
          onChange={(e) => handleFilterAgent(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-card-border bg-background text-xs"
        >
          <option value="">All agents</option>
          {agentOptions.map((a) => (
            <option key={a.name} value={a.name}>{a.displayName}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => handleFilterType(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-card-border bg-background text-xs"
        >
          <option value="">All types</option>
          <option value="FEATURE">Feature</option>
          <option value="BUG">Bug</option>
          <option value="CHORE">Chore</option>
          <option value="REVIEW">Review</option>
        </select>
        <select
          value={filterProject}
          onChange={(e) => handleFilterProject(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-card-border bg-background text-xs"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="px-2 py-1.5 rounded-lg border border-card-border text-xs text-muted hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Project filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        {!urlProjectId && (
          <ProjectSelector
            projects={projects}
            selectedProjectIds={selectedProjectIds}
            onSelectionChange={setSelectedProjectIds}
            isOwner={isOwner}
            taskCount={activeTasks.length}
          />
        )}
        <div className="flex items-center rounded-lg border border-card-border overflow-hidden text-xs">
          <button
            onClick={() => setMyTasksOnly(false)}
            className={`px-3 py-1.5 transition-colors ${
              !myTasksOnly ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {t("all_tasks")}
          </button>
          <button
            onClick={() => setMyTasksOnly(true)}
            className={`px-3 py-1.5 transition-colors ${
              myTasksOnly ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {t("my_tasks")}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <OfficeSummary tasks={boardTasks} initiatives={initiatives} />

      {/* Bulk operations toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 bg-card-bg border border-accent/30 rounded-lg p-3 mb-4 flex items-center gap-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <select
            onChange={(e) => { bulkMove(e.target.value); e.target.value = ""; }}
            className="text-xs px-2 py-1 rounded border border-card-border bg-background"
            defaultValue=""
          >
            <option value="">Move to...</option>
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="TESTING">Testing</option>
            <option value="DONE">Done</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Kanban board */}
      <KanbanBoard
        tasks={activeTasks as KanbanTask[]}
        expandedId={expandedId}
        onToggleExpand={(taskId) => onToggleExpand(expandedId === taskId ? null : taskId)}
        onMoveTask={onMoveTask}
        onDeleteTask={onDeleteTask}
        agents={agents as KanbanAgent[]}
        onRefresh={onRefresh}
        focusedTaskId={focusedTaskId ?? null}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      {/* Done history */}
      <div className="border-t border-card-border pt-6">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted hover:text-foreground transition-colors mb-4"
        >
          <svg
            className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="w-3 h-3 rounded-full bg-success" />
          {t("done")}
          <span className="text-xs text-muted bg-card-border/50 px-2 py-0.5 rounded-full font-normal">
            {doneTasks.length}
          </span>
        </button>

        {historyOpen && (
          <>
            <div className="flex flex-wrap gap-1 mb-4">
              {HISTORY_PERIODS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setHistoryPeriod(key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    historyPeriod === key
                      ? "bg-accent border-accent text-white"
                      : "border-card-border text-muted hover:text-foreground hover:border-foreground/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {doneTasks.length === 0 ? (
              <p className="text-muted text-sm text-center py-4">
                {t("no_completed")}
              </p>
            ) : (
              <div className="space-y-4">
                {groupByWeek(doneTasks).map(([week, weekTasks], index) => (
                  <details key={week} open={index === 0}>
                    <summary className="cursor-pointer text-sm font-medium text-muted py-2 hover:text-foreground transition-colors">
                      Week of {new Date(week + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} — {weekTasks.length} task{weekTasks.length !== 1 ? "s" : ""}
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-4 mt-2">
                      {weekTasks.map((task) => (
                        <TaskCardInner
                          key={task.id}
                          task={task as KanbanTask}
                          isExpanded={expandedId === task.id}
                          onToggle={() => onToggleExpand(expandedId === task.id ? null : task.id)}
                          onMove={onMoveTask}
                          onDelete={onDeleteTask}
                          agents={agents as KanbanAgent[]}
                          compact
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
