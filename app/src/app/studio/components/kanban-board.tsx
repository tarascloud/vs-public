"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  UniqueIdentifier,
} from "@dnd-kit/core";

import type {
  Task,
  TaskStatus,
  Agent,
  ColumnDef,
  InitiativeOption,
} from "./kanban-board.types";

import {
  STATUS_COLUMNS,
  statusBadge,
} from "./kanban-board.types";

import DraggableTaskCard from "./kanban-board.card";
import { TaskCardInner } from "./kanban-board.card-inner";

// Lazy-load fullscreen modal: marked + DOMPurify are heavy and only needed
// when the user opens a task in fullscreen view. ssr: false avoids shipping
// marked to the server bundle as well.
const TaskFullscreenModal = dynamic(() => import("./kanban-board.modal"), {
  ssr: false,
});

// ---------- Droppable Column ----------

function DroppableColumn({
  column, tasks, isOver, isDragActive, children,
}: {
  column: ColumnDef; tasks: Task[]; isOver: boolean; isDragActive: boolean; children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });

  return (
    <div ref={setNodeRef}
      className={`rounded-xl border transition-colors ${isOver ? "border-accent/60 bg-accent/5" : isDragActive ? "border-card-border/80 bg-card-bg/50" : "border-card-border bg-card-bg/30"}`}>
      <div className="px-3 py-2.5 border-b border-card-border flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${column.badge}`}>{column.title}</span>
        <span className="text-xs text-muted/50 ml-auto">{tasks.length}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[100px]">{children}</div>
    </div>
  );
}

// ---------- MobileMoveButtons ----------
// WCAG 2.5.4 pointer alternative: on the mobile snap-scroll board drag-and-drop
// is the only way to move a task between columns. These buttons provide a
// single-pointer / keyboard fallback, rendered only in the md:hidden variant.

function MobileMoveButtons({ task, onMove }: { task: Task; onMove: (taskId: string, newStatus: TaskStatus) => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-1 pt-1" role="group" aria-label={`Move task ${task.ticketId}`}>
      <span className="text-xs text-muted-2 uppercase tracking-wider" aria-hidden="true">Move:</span>
      {STATUS_COLUMNS.filter((c) => c.id !== task.status).map((c) => (
        <button key={c.id} type="button" onClick={() => onMove(task.id, c.id)}
          aria-label={`Move task ${task.ticketId} to ${c.title}`}
          className={`text-xs px-2 py-1 rounded border transition-colors ${c.badge}`}>
          {c.title}
        </button>
      ))}
    </div>
  );
}

// ---------- CreateTaskModal ----------

function CreateTaskModal({ agents, onClose, onCreated }: { agents: Agent[]; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("studio");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [type, setType] = useState<"FEATURE" | "BUG" | "CHORE" | "REVIEW">("FEATURE");
  const [priority, setPriority] = useState(0);
  const [initiatives, setInitiatives] = useState<InitiativeOption[]>([]);
  const [loadingInitiatives, setLoadingInitiatives] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedInitiative = initiatives.find((i) => i.id === initiativeId) || null;

  useEffect(() => {
    fetch("/api/initiatives")
      .then((r) => r.json())
      .then((data: InitiativeOption[]) => {
        const active = Array.isArray(data) ? data.filter((i) => i.status !== "DONE") : [];
        setInitiatives(active);
        if (active.length > 0) setInitiativeId(active[0].id);
      })
      .catch(() => setError("Failed to load initiatives"))
      .finally(() => setLoadingInitiatives(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const cooAgent = agents.find((a) => a.name === "coo") || agents[0] || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError(t("title_required")); return; }
    if (!initiativeId) { setError(t("initiative_required")); return; }
    if (!cooAgent) { setError("COO agent not found"); return; }

    setSubmitting(true);
    setError(null);

    try {
      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, type, priority, initiativeId, assigneeType: "AGENT", agentId: cooAgent.id }),
      });
      if (!taskRes.ok) {
        const body = await taskRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create task");
      }
      const task = await taskRes.json();
      await fetch(`/api/tasks/${task.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Ola: please review this task formulation and approve or ask clarifying questions to the creator." }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors";
  const labelCls = "block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-background border border-card-border rounded-xl shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="text-sm font-semibold">{t("new_task")}</h2>
          <button onClick={onClose} className="text-muted/50 hover:text-foreground transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div><label className={labelCls} htmlFor="new-task-title">{t("title_label")} *</label><input id="new-task-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("title_placeholder")} className={inputCls} autoFocus disabled={submitting} aria-required="true" aria-invalid={!!error && !title.trim()} aria-describedby={error ? "new-task-error" : undefined} /></div>
          <div>
            <label className={labelCls}>{t("initiative_label")} *</label>
            {loadingInitiatives ? (<div className="text-xs text-muted/50 py-2">{t("loading")}</div>) : (
              <select value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)} className={`${inputCls} cursor-pointer`} disabled={submitting}>
                {initiatives.length === 0 && <option value="">{t("no_initiatives_available")}</option>}
                {initiatives.map((i) => (<option key={i.id} value={i.id}>{i.title || i.rawIdea.slice(0, 60)}{i.project ? ` [${i.project.name}]` : ""}</option>))}
              </select>
            )}
          </div>
          {selectedInitiative?.project && (<div><label className={labelCls}>{t("project_label")}</label><div className="text-sm text-muted px-3 py-2 bg-card-bg border border-card-border rounded-lg">{selectedInitiative.project.name}</div></div>)}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>{t("task_type")}</label><select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={`${inputCls} cursor-pointer`} disabled={submitting}><option value="FEATURE">{t("type_feature")}</option><option value="BUG">{t("type_bug")}</option><option value="CHORE">{t("type_chore")}</option><option value="REVIEW">{t("type_review")}</option></select></div>
            <div><label className={labelCls}>{t("priority_label")}</label><select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={`${inputCls} cursor-pointer`} disabled={submitting}><option value={0}>{t("priority_low")}</option><option value={1}>{t("priority_medium")}</option><option value={2}>{t("priority_high")}</option></select></div>
          </div>
          <div><label className={labelCls}>{t("description_label")}</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description_placeholder")} rows={3} className={`${inputCls} resize-none`} disabled={submitting} /></div>
          {cooAgent && (
            <div className="flex items-center gap-2 text-xs text-muted/60 bg-card-bg border border-card-border/50 rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[11px] font-semibold text-accent shrink-0">{cooAgent.displayName.charAt(0).toUpperCase()}</span>
              {t("assigned_for_review", { name: cooAgent.displayName })}
            </div>
          )}
          {error && <div id="new-task-error" role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/20 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting} className="text-sm px-4 py-1.5 rounded-lg border border-card-border text-muted hover:text-foreground hover:border-card-border-hover transition-colors">{t("cancel")}</button>
            <button type="submit" disabled={submitting || loadingInitiatives} className="text-sm px-4 py-1.5 rounded-lg bg-accent text-background font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{submitting ? t("creating") : t("create_task")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- KanbanBoard ----------

interface KanbanBoardProps {
  tasks: Task[];
  expandedId: string | null;
  onToggleExpand: (taskId: string) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  agents: Agent[];
  onRefresh?: () => void;
  focusedTaskId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
}

export default function KanbanBoard({ tasks, expandedId, onToggleExpand, onMoveTask, onDeleteTask, agents, onRefresh, focusedTaskId, selectedIds, onToggleSelect }: KanbanBoardProps) {
  const t = useTranslations("studio");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullscreenTask, setFullscreenTask] = useState<Task | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<UniqueIdentifier | null>(null);
  const [overColumnId, setOverColumnId] = useState<TaskStatus | null>(null);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, TaskStatus>>({});

  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => { const { scrollLeft, clientWidth } = el; setActiveColumnIndex(Math.round(scrollLeft / clientWidth)); };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => { setActiveTaskId(event.active.id); }, []);
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) { setOverColumnId(STATUS_COLUMNS.find((c) => c.id === over.id)?.id || null); } else { setOverColumnId(null); }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    setOverColumnId(null);
    if (!over) return;
    const taskId = active.id as string;
    const targetColumnId = over.id as TaskStatus;
    if (!STATUS_COLUMNS.some((c) => c.id === targetColumnId)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetColumnId) return;
    const previousStatus = task.status;
    setOptimisticStatuses((prev) => ({ ...prev, [taskId]: targetColumnId }));
    try { await onMoveTask(taskId, targetColumnId); } catch { setOptimisticStatuses((prev) => ({ ...prev, [taskId]: previousStatus })); }
    finally { setTimeout(() => { setOptimisticStatuses((prev) => { const updated = { ...prev }; delete updated[taskId]; return updated; }); }, 2000); }
  }, [tasks, onMoveTask]);

  const effectiveTasks = tasks.map((t) => ({ ...t, status: (optimisticStatuses[t.id] || t.status) as TaskStatus }));
  const activeTask = activeTaskId ? effectiveTasks.find((t) => t.id === activeTaskId) || null : null;

  const columnItems = STATUS_COLUMNS.map((column) => {
    const columnTasks = effectiveTasks.filter((t) => t.status === column.id && t.status !== "DONE");
    return { column, columnTasks, isOver: overColumnId === column.id, isDragActive: activeTaskId !== null };
  });

  return (
    <>
      {showCreateModal && <CreateTaskModal agents={agents} onClose={() => setShowCreateModal(false)} onCreated={() => { onRefresh?.(); }} />}
      {fullscreenTask && <TaskFullscreenModal task={fullscreenTask} onClose={() => setFullscreenTask(null)} onMove={onMoveTask} onDelete={onDeleteTask} />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex items-center justify-end mb-4">
          <button onClick={() => setShowCreateModal(true)} aria-label="Create new task" className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t("new_task")}
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mb-3 md:hidden">
          {STATUS_COLUMNS.map((column, i) => (
            <button key={column.id} aria-label={`Go to ${column.title}`}
              onClick={() => { const el = scrollRef.current; if (!el) return; el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); }}
              className={`transition-all duration-200 rounded-full ${i === activeColumnIndex ? "w-5 h-2 bg-accent" : "w-2 h-2 bg-card-border hover:bg-card-border-hover"}`} />
          ))}
        </div>

        <div ref={scrollRef} className="flex md:hidden overflow-x-auto no-scrollbar snap-x snap-mandatory gap-0" style={{ scrollSnapType: "x mandatory" }}>
          {columnItems.map(({ column, columnTasks, isOver, isDragActive }) => (
            <div key={column.id} className="shrink-0 w-full snap-center px-1" style={{ scrollSnapAlign: "center" }}>
              <DroppableColumn column={column} tasks={columnTasks} isOver={isOver} isDragActive={isDragActive}>
                {columnTasks.map((task) => (
                  <div key={task.id}>
                    <DraggableTaskCard task={task} isExpanded={expandedId === task.id} onToggle={() => onToggleExpand(task.id)}
                      onMove={onMoveTask} onDelete={onDeleteTask} onFullscreen={setFullscreenTask} agents={agents} isDragging={activeTaskId === task.id}
                      isFocused={focusedTaskId === task.id} isSelected={selectedIds?.has(task.id) ?? false} onToggleSelect={onToggleSelect} />
                    <MobileMoveButtons task={task} onMove={onMoveTask} />
                  </div>
                ))}
              </DroppableColumn>
            </div>
          ))}
        </div>

        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columnItems.map(({ column, columnTasks, isOver, isDragActive }) => (
            <DroppableColumn key={column.id} column={column} tasks={columnTasks} isOver={isOver} isDragActive={isDragActive}>
              {columnTasks.map((task) => (
                <DraggableTaskCard key={task.id} task={task} isExpanded={expandedId === task.id} onToggle={() => onToggleExpand(task.id)}
                  onMove={onMoveTask} onDelete={onDeleteTask} onFullscreen={setFullscreenTask} agents={agents} isDragging={activeTaskId === task.id}
                  isFocused={focusedTaskId === task.id} isSelected={selectedIds?.has(task.id) ?? false} onToggleSelect={onToggleSelect} />
              ))}
            </DroppableColumn>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-64 pointer-events-none">
              <TaskCardInner task={activeTask} isExpanded={false} onToggle={() => {}} onMove={async () => {}} agents={agents} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

// Re-export for use in board-tab.tsx and page.tsx Done section (non-draggable cards)
export { TaskCardInner, statusBadge };
export type { Task, TaskStatus, Agent };
