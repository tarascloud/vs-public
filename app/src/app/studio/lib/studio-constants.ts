import type { InitiativeStatus } from "../hooks/use-studio-data";

export const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PD:            { bg: "bg-blue-500/15",   text: "text-blue-400",   border: "border-blue-500/25" },
  JobFinder:     { bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/25" },
  "Vibe Studio": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  Status:        { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25" },
  Website:       { bg: "bg-cyan-500/15",   text: "text-cyan-400",   border: "border-cyan-500/25" },
  Trade:         { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25" },
};

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";

export const STATUS_COLUMNS: { id: TaskStatus; title: string; dot: string; badge: string }[] = [
  { id: "TODO",        title: "Ready",       dot: "bg-blue-500",   badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { id: "IN_PROGRESS", title: "In Progress", dot: "bg-yellow-500", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { id: "BLOCKED",     title: "Blocked",     dot: "bg-red-500",    badge: "bg-red-500/10 text-red-400 border-red-500/20" },
  { id: "TESTING",     title: "Testing",     dot: "bg-amber-500",  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "DONE",        title: "Done",        dot: "bg-green-500",  badge: "bg-green-500/10 text-green-400 border-green-500/20" },
];

export const INITIATIVE_STATUS_CONFIG: Record<InitiativeStatus, { dot: string; badge: string; order: number }> = {
  IDEA:        { dot: "bg-gray-500",    badge: "bg-gray-500/10 text-gray-400 border-gray-500/20",         order: 0 },
  PLANNING:    { dot: "bg-blue-500",    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",         order: 1 },
  PLANNED:     { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", order: 2 },
  IN_PROGRESS: { dot: "bg-yellow-500",  badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",   order: 3 },
  BLOCKED:     { dot: "bg-red-500",     badge: "bg-red-500/10 text-red-400 border-red-500/20",            order: 4 },
  DONE:        { dot: "bg-green-500",   badge: "bg-green-500/10 text-green-400 border-green-500/20",      order: 5 },
};

export const HARDCODED_PROJECTS = ["PD", "JobFinder", "Vibe Studio", "Status", "Website", "Trade"];

export function projectBadge(name: string | undefined): { bg: string; text: string; border: string } {
  if (!name) return { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/25" };
  return PROJECT_COLORS[name] || { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/25" };
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
