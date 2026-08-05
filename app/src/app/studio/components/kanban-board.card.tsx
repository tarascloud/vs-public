"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { Task, TaskStatus, Agent } from "./kanban-board.types";
import { TaskCardInner } from "./kanban-board.card-inner";

interface DraggableTaskCardProps {
  task: Task;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onFullscreen?: (task: Task) => void;
  agents: Agent[];
  isDragging?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}

export default function DraggableTaskCard({
  task,
  isExpanded,
  onToggle,
  onMove,
  onDelete,
  onFullscreen,
  agents,
  isDragging = false,
  isFocused = false,
  isSelected = false,
  onToggleSelect,
}: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id, data: { task } });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 999 : undefined }
    : { opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`transition-opacity ${isDragging ? "cursor-grabbing" : ""} ${isFocused ? "ring-2 ring-accent/60 rounded-lg" : ""}`}>
      <TaskCardInner
        task={task}
        isExpanded={isExpanded}
        onToggle={onToggle}
        onMove={onMove}
        onDelete={onDelete}
        onFullscreen={onFullscreen}
        agents={agents}
        dragListeners={listeners}
        dragAttributes={attributes}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
}
