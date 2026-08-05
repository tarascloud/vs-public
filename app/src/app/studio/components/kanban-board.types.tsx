// ---------- Re-exports from shared lib ----------
// REV22-043: STATUS_COLUMNS is now derived from the canonical TASK_STATUS_CONFIG
// in @/lib/task-status.ts — single source of truth across Studio kanban and
// the client portal (/client/[projectSlug]/tasks).

export type { TaskStatus } from "@/lib/task-status";
export { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/task-status";

import type { TaskStatus } from "@/lib/task-status";
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/task-status";
import { Plus, Bug, Wrench, Eye } from "lucide-react";

// ---------- Types ----------

export interface Project {
  id: string;
  name: string;
  status: string;
}

export interface Question {
  id: string;
  text: string;
  answer: string | null;
  status: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  color: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
}

export interface Task {
  id: string;
  ticketId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  type: string;
  assigneeType: "AGENT" | "OWNER" | "CLIENT";
  assigneeUser: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  agent: {
    id: string;
    name: string;
    displayName: string;
    role: string;
    color: string | null;
  } | null;
  project: { id: string; name: string } | null;
  initiative: { id: string; rawIdea: string; title: string | null; status: string } | null;
  questions: Question[];
  blockedBy: { id: string; ticketId: string; title: string; status: string }[];
  blocking: { id: string; ticketId: string; title: string; status: string }[];
  completionNote: string | null;
  commitHash: string | null;
  commitUrl: string | null;
  tokensUsed: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDef {
  id: TaskStatus;
  title: string;
  badge: string;
}

// ---------- Constants ----------

/**
 * STATUS_COLUMNS — derived from canonical TASK_STATUS_CONFIG.
 * Kept for backward-compat with kanban-board.tsx that iterates over it.
 * Title defaults to the English label key text; runtime i18n uses labelKey.
 */
export const STATUS_COLUMNS: ColumnDef[] = TASK_STATUS_ORDER.map((id) => ({
  id,
  title: TASK_STATUS_CONFIG[id].labelKey.replace("status_", "").replace("_", " "),
  badge: TASK_STATUS_CONFIG[id].badge,
}));

export const PRIORITY_MAP: Record<number, { label: string; style: string }> = {
  0: { label: "Low",    style: "bg-gray-500/10 text-gray-400" },
  1: { label: "Medium", style: "bg-yellow-500/10 text-yellow-400" },
  2: { label: "High",   style: "bg-red-500/10 text-red-400" },
};

export type TaskTypeValue = "FEATURE" | "BUG" | "CHORE" | "REVIEW";

/**
 * TASK_TYPE_MAP — REV22-043: replaced glyph strings with Lucide icon components.
 * icon is now a React element (JSX), not a string character.
 */
export const TASK_TYPE_MAP: Record<string, { icon: React.ReactElement; style: string; labelKey: string }> = {
  FEATURE: { icon: <Plus  className="w-3 h-3" aria-hidden="true" />, style: "bg-blue-500/10 text-blue-400",   labelKey: "type_feature" },
  BUG:     { icon: <Bug   className="w-3 h-3" aria-hidden="true" />, style: "bg-red-500/10 text-red-400",     labelKey: "type_bug" },
  CHORE:   { icon: <Wrench className="w-3 h-3" aria-hidden="true" />, style: "bg-gray-500/10 text-gray-400",  labelKey: "type_chore" },
  REVIEW:  { icon: <Eye   className="w-3 h-3" aria-hidden="true" />, style: "bg-purple-500/10 text-purple-400", labelKey: "type_review" },
};

// ---------- Helpers ----------

const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PD:            { bg: "bg-blue-500/15",   text: "text-blue-400",   border: "border-blue-500/25" },
  JobFinder:     { bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/25" },
  "Vibe Studio": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  Status:        { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25" },
  Website:       { bg: "bg-cyan-500/15",   text: "text-cyan-400",   border: "border-cyan-500/25" },
  Trade:         { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25" },
};

export function projectBadge(name: string | undefined) {
  if (!name) return null;
  const colors = PROJECT_COLORS[name] || { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/25" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
      {name}
    </span>
  );
}

export function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatDateTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K tokens`;
  return `${n} tokens`;
}

export function statusBadge(status: TaskStatus) {
  const cfg = TASK_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${cfg.badge}`}>
      {cfg.labelKey.replace("status_", "").replace("_", " ")}
    </span>
  );
}

export interface InitiativeOption {
  id: string;
  rawIdea: string;
  title: string | null;
  status: string;
  project: { id: string; name: string } | null;
}
