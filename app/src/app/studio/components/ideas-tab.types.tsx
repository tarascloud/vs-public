import type { useTranslations } from "next-intl";

// ---------- Types ----------

export type InitiativeStatus = "IDEA" | "PLANNING" | "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type TaskTypeValue = "FEATURE" | "BUG" | "CHORE" | "REVIEW";

export interface InitiativeTask {
  id: string;
  ticketId: string;
  title: string;
  status: string;
  assigneeType: "AGENT" | "OWNER" | "CLIENT";
  assigneeUser: { id: string; name: string | null; image: string | null } | null;
  agent: { id: string; displayName: string; role: string } | null;
  blockedBy: { id: string; title: string; status: string }[];
  blocking: { id: string; title: string; status: string }[];
  priority: number;
  tokensUsed: number | null;
}

export interface InitiativeMessage {
  id: string;
  type: string;
  content: string;
  fromAgent: string | null;
  fromUserId: string | null;
  fromUser: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface Initiative {
  id: string;
  title: string | null;
  rawIdea: string;
  summary: string | null;
  status: InitiativeStatus;
  priority: number;
  userId: string;
  projectId: string | null;
  user: { id: string; name: string | null; image: string | null };
  project: { id: string; name: string } | null;
  tasks: InitiativeTask[];
  messages: InitiativeMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface Agent {
  id: string;
  displayName: string;
}

export interface NewTaskPayload {
  title: string;
  description: string;
  priority: number;
  type: TaskTypeValue;
  assigneeType: "AGENT" | "OWNER" | "CLIENT";
  agentId: string;
  blockedByIds: string[];
}

// ---------- Constants ----------

export const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PD:            { bg: "bg-blue-500/15",   text: "text-blue-400",   border: "border-blue-500/25" },
  JobFinder:     { bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/25" },
  "Vibe Studio": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  Status:        { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25" },
  Website:       { bg: "bg-cyan-500/15",   text: "text-cyan-400",   border: "border-cyan-500/25" },
  Trade:         { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25" },
};

export const STATUS_COLUMNS = [
  { id: "TODO",        title: "Ready",       badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { id: "IN_PROGRESS", title: "In Progress", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { id: "BLOCKED",     title: "Blocked",     badge: "bg-red-500/10 text-red-400 border-red-500/20" },
  { id: "TESTING",     title: "Testing",     badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "DONE",        title: "Done",        badge: "bg-green-500/10 text-green-400 border-green-500/20" },
];

export const INITIATIVE_STATUS_CONFIG: Record<InitiativeStatus, { dot: string; badge: string; order: number }> = {
  IDEA:        { dot: "bg-gray-500",    badge: "bg-gray-500/10 text-gray-400 border-gray-500/20",          order: 0 },
  PLANNING:    { dot: "bg-blue-500",    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",           order: 1 },
  PLANNED:     { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",  order: 2 },
  IN_PROGRESS: { dot: "bg-yellow-500",  badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",    order: 3 },
  BLOCKED:     { dot: "bg-red-500",     badge: "bg-red-500/10 text-red-400 border-red-500/20",              order: 4 },
  DONE:        { dot: "bg-green-500",   badge: "bg-green-500/10 text-green-400 border-green-500/20",        order: 5 },
};

// ---------- Helpers ----------

export function projectBadge(name: string | undefined) {
  if (!name) return null;
  const colors = PROJECT_COLORS[name] || { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/25" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
      {name}
    </span>
  );
}

export function statusBadge(status: string) {
  const col = STATUS_COLUMNS.find((c) => c.id === status);
  if (!col) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${col.badge}`}>
      {col.title}
    </span>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export type StudioTranslations = ReturnType<typeof useTranslations<"studio">>;
