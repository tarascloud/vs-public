/**
 * task-status.ts — Shared task status configuration for VS Studio.
 *
 * Single source of truth for TaskStatus → { label i18n key, badge classes }.
 * Used by:
 *   - app/studio/components/kanban-board.types.tsx (kanban columns + statusBadge)
 *   - app/client/[projectSlug]/tasks/page.tsx     (client portal column headers + badges)
 *
 * REV22-043: eliminated STATUS_COLUMNS / STATUS_BADGE duplication.
 * REV22-044: badge classes reference --status-* CSS tokens from globals.css.
 */

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";

export interface StatusConfig {
  /** i18n key inside the "studio" and "client" namespaces */
  labelKey: string;
  /** Tailwind utility classes for the badge pill — use --status-* tokens */
  badge: string;
  /** Top border accent for column headers (client kanban) */
  columnBorder: string;
}

/**
 * Canonical map: TaskStatus → display config.
 *
 * badge classes use CSS custom properties registered in @theme inline
 * (globals.css §Status tokens):
 *   bg-status-{kind}-bg  — translucent surface (--status-{kind}-bg)
 *   text-status-{kind}-fg — text color       (--status-{kind}-fg)
 *   border-status-{kind} — accent border     (--status-{kind})
 */
export const TASK_STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  TODO: {
    labelKey: "status_todo",
    badge: "bg-status-todo-bg text-status-todo-fg border-status-todo/30",
    columnBorder: "border-t-status-todo",
  },
  IN_PROGRESS: {
    labelKey: "status_in_progress",
    badge: "bg-status-progress-bg text-status-progress-fg border-status-progress/30",
    columnBorder: "border-t-status-progress",
  },
  BLOCKED: {
    labelKey: "status_blocked",
    badge: "bg-status-blocked-bg text-status-blocked-fg border-status-blocked/30",
    columnBorder: "border-t-status-blocked",
  },
  TESTING: {
    labelKey: "status_testing",
    badge: "bg-status-testing-bg text-status-testing-fg border-status-testing/30",
    columnBorder: "border-t-status-testing",
  },
  DONE: {
    labelKey: "status_done",
    badge: "bg-status-done-bg text-status-done-fg border-status-done/30",
    columnBorder: "border-t-status-done",
  },
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "TESTING",
  "DONE",
];
