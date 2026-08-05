"use client";

import { useState, useEffect, useCallback } from "react";

// ---------- Types ----------

export interface Project {
  id: string;
  name: string;
  description: string | null;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  instructions: string;
  tools: string[];
  model: string;
  isActive: boolean;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  color: string | null;
  bio: string | null;
  tasks: {
    id: string;
    ticketId: string;
    title: string;
    status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";
    priority: number;
    project: { id: string; name: string } | null;
    updatedAt: string;
  }[];
}

export interface Question {
  id: string;
  taskId: string;
  text: string;
  answer: string | null;
  status: "PENDING" | "ANSWERED";
  createdAt: string;
}

export interface Task {
  id: string;
  ticketId: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "TESTING" | "DONE";
  type: "FEATURE" | "BUG" | "CHORE" | "REVIEW";
  priority: number;
  agentId: string | null;
  projectId: string | null;
  agent: Agent | null;
  project: Project | null;
  questions: Question[];
  assigneeType: "AGENT" | "OWNER" | "CLIENT";
  assigneeUserId: string | null;
  assigneeUser: { id: string; name: string | null; image: string | null } | null;
  blockedBy: { id: string; ticketId: string; title: string; status: string }[];
  blocking: { id: string; ticketId: string; title: string; status: string }[];
  initiative: { id: string; title: string | null } | null;
  completionNote: string | null;
  commitHash: string | null;
  commitUrl: string | null;
  tokensUsed: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InitiativeStatus = "IDEA" | "PLANNING" | "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "DONE";

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

// ---------- Hook ----------

export function useStudioData(urlProjectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [initiativesLoading, setInitiativesLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("CLIENT");
  const [userProjectIds, setUserProjectIds] = useState<string[]>([]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data?.user?.role) {
        setUserRole(data.user.role);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
        setUserProjectIds(data.map((p: Project) => p.id));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const url = urlProjectId ? `/api/tasks?take=2000&projectId=${encodeURIComponent(urlProjectId)}` : "/api/tasks?take=2000";
      const res = await fetch(url);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      // Support both paginated { tasks, total } and legacy array responses
      if (Array.isArray(data)) {
        setTasks(data);
      } else if (data && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
      }
    } catch {
      // ignore
    }
  }, [urlProjectId]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/status");
      if (!res.ok) {
        const fallback = await fetch("/api/agents");
        if (fallback.ok) {
          const data = await fallback.json();
          if (Array.isArray(data)) setAgents(data);
        }
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.agents)) setAgents(data.agents);
    } catch {
      // ignore
    }
  }, []);

  const fetchInitiatives = useCallback(async () => {
    try {
      const url = urlProjectId ? `/api/initiatives?projectId=${encodeURIComponent(urlProjectId)}` : "/api/initiatives";
      const res = await fetch(url);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (Array.isArray(data)) setInitiatives(data);
    } catch {
      // ignore
    } finally {
      setInitiativesLoading(false);
    }
  }, [urlProjectId]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
    fetchProjects();
    fetchTasks();
    fetchAgents();
    fetchInitiatives();
  }, [fetchSession, fetchProjects, fetchTasks, fetchAgents, fetchInitiatives]);

  // SSE is handled by use-studio-events.ts — single connection, no duplicate

  const isOwner = userRole === "OWNER";

  const visibleTasks = isOwner
    ? tasks
    : tasks.filter((t) => !t.projectId || userProjectIds.includes(t.projectId));

  return {
    tasks,
    projects,
    agents,
    initiatives,
    initiativesLoading,
    setInitiatives,
    isOwner,
    visibleTasks,
    fetchTasks,
    fetchInitiatives,
  };
}
