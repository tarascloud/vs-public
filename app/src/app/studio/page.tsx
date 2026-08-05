"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import OfficeControls from "./components/office-controls";
import OfficeCommunication from "./components/office-communication";

// Lazy-load the office trio (office-view -> office-canvas -> office-canvas.utils,
// ~2000 LOC client TSX) so it doesn't bloat the initial Studio bundle for the
// Ideas / Board / SMM tabs which are the default landing.
const OfficeView = dynamic(() => import("./components/office-view"), {
  ssr: false,
  loading: () => (
    <div className="text-sm text-muted py-12 text-center">Loading office view…</div>
  ),
});
import BoardTab from "./components/board-tab";
import SmmDashboard from "./components/smm-dashboard";
import MempalaceTab from "./components/mempalace-tab";
import type { SmmAccount } from "./components/smm-dashboard";
import IdeasTab from "./components/ideas-tab";
import type { NewTaskPayload } from "./components/ideas-tab";
import type { TaskStatus as KanbanTaskStatus } from "./components/kanban-board";
import { useStudioData } from "./hooks/use-studio-data";
import { INITIATIVE_STATUS_CONFIG, HARDCODED_PROJECTS } from "./lib/studio-constants";

type TabId = "ideas" | "board" | "office" | "controls" | "communication" | "smm" | "mempalace";

export default function StudioPage() {
  useSession();
  const t = useTranslations("studio");
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = (searchParams.get("tab") as TabId) || "ideas";
  const taskIdParam = searchParams.get("taskId");
  const urlProjectId = searchParams.get("projectId") || searchParams.get("project") || null;

  const [activeTab, setActiveTab] = useState<TabId>(tabParam);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Initiative interaction state
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [sendingAnswer, setSendingAnswer] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState("");
  const [ideaProjectId, setIdeaProjectId] = useState("");
  const [submittingIdea, setSubmittingIdea] = useState(false);
  const [expandedInitiativeId, setExpandedInitiativeId] = useState<string | null>(null);
  const [executingInitiativeId, setExecutingInitiativeId] = useState<string | null>(null);
  const [deletingInitiativeId, setDeletingInitiativeId] = useState<string | null>(null);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [creatingInitiativeTask, setCreatingInitiativeTask] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcuts
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const filteredTasksRef = useRef<typeof visibleTasks>([]);

  // SMM
  const [smmAccounts, setSmmAccounts] = useState<SmmAccount[]>([]);

  const {
    tasks,
    projects,
    agents,
    initiatives,
    initiativesLoading,
    isOwner,
    visibleTasks,
    fetchTasks,
    fetchInitiatives,
  } = useStudioData(urlProjectId);

  // Sync tab with URL
  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  // Handle taskId param: expand task on Board tab
  useEffect(() => {
    if (tabParam === "board" && taskIdParam) {
      setExpandedId(taskIdParam);
      const timer = setTimeout(() => {
        const el = document.getElementById(`task-card-${taskIdParam}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [tabParam, taskIdParam]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/studio?tab=${tab}`);
  };
  // handleTabChange is used by NavBar — kept for external consumers
  void handleTabChange;

  const showMessage = useCallback((text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const fetchSmmAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/smm/accounts");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setSmmAccounts(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSmmAccounts();
  }, [fetchSmmAccounts]);

  // ---------- Task handlers ----------

  const handleMoveTask = async (taskId: string, newStatus: KanbanTaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Move failed");
      }
      await fetchTasks();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Move failed", "error");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setExpandedId(null);
      await fetchTasks();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  // ---------- Initiative handlers ----------

  const handleSubmitIdea = async () => {
    if (!newIdea.trim()) return;
    setSubmittingIdea(true);
    try {
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea: newIdea, projectId: ideaProjectId || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submit failed");
      }
      const data = await res.json();
      if (data.type === "answer") {
        // Question detected — show answer instead of creating initiative
        showMessage(data.answer, "success");
      } else {
        showMessage(t("idea_submitted"), "success");
        await fetchInitiatives();
      }
      setNewIdea("");
      setIdeaProjectId("");
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setSubmittingIdea(false);
    }
  };

  const handleSendAnswer = async (initiativeId: string, messageType: string) => {
    const content = answerInputs[initiativeId];
    if (!content?.trim()) return;
    setSendingAnswer(initiativeId);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: messageType === "question" || messageType === "blocker" ? "answer" : "info",
          content,
        }),
      });
      if (!res.ok) throw new Error("Send failed");
      setAnswerInputs((prev) => ({ ...prev, [initiativeId]: "" }));
      await fetchInitiatives();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Send failed", "error");
    } finally {
      setSendingAnswer(null);
    }
  };

  const handleQuickReply = async (initiativeId: string, reply: string) => {
    setSendingAnswer(initiativeId);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", content: reply }),
      });
      if (!res.ok) throw new Error("Send failed");
      setAnswerInputs((prev) => ({ ...prev, [initiativeId]: "" }));
      await fetchInitiatives();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Send failed", "error");
    } finally {
      setSendingAnswer(null);
    }
  };

  const handleExecuteInitiative = async (initiativeId: string) => {
    setExecutingInitiativeId(initiativeId);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Execute failed");
      }
      showMessage(t("execute_success"), "success");
      await fetchInitiatives();
      await fetchTasks();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Execute failed", "error");
    } finally {
      setExecutingInitiativeId(null);
    }
  };

  const handleDeleteInitiative = async (initiativeId: string) => {
    if (!window.confirm(t("confirm_delete_idea"))) return;
    setDeletingInitiativeId(initiativeId);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      showMessage(t("delete_idea"), "success");
      if (expandedInitiativeId === initiativeId) setExpandedInitiativeId(null);
      await fetchInitiatives();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingInitiativeId(null);
    }
  };

  const handleChangeInitiativeStatus = async (initiativeId: string, newStatus: string) => {
    setChangingStatusId(initiativeId);
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Update failed");
      }
      await fetchInitiatives();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleCreateInitiativeTaskFromTab = async (initiativeId: string, payload: NewTaskPayload) => {
    setCreatingInitiativeTask(true);
    try {
      const body: Record<string, unknown> = {
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority,
        type: payload.type,
        assigneeType: payload.assigneeType,
        initiativeId,
        blockedByIds: payload.blockedByIds,
      };
      if (payload.assigneeType === "AGENT" && payload.agentId) {
        body.agentId = payload.agentId;
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Create failed");
      }
      showMessage(t("task_created"), "success");
      await fetchInitiatives();
      await fetchTasks();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setCreatingInitiativeTask(false);
    }
  };

  // ---------- Derived data ----------

  const sortedInitiatives = [...initiatives].sort((a, b) => {
    const orderA = INITIATIVE_STATUS_CONFIG[a.status]?.order ?? 99;
    const orderB = INITIATIVE_STATUS_CONFIG[b.status]?.order ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const filteredTasks = useMemo(() => {
    if (!debouncedSearch) return visibleTasks;
    const q = debouncedSearch.toLowerCase();
    return visibleTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.ticketId.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q))
    );
  }, [visibleTasks, debouncedSearch]);

  // Keep ref in sync for keyboard handler
  filteredTasksRef.current = filteredTasks;

  // Keyboard shortcut handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

      // "/" — focus search (works outside inputs)
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape — close fullscreen / help / clear focus / blur search
      if (e.key === "Escape") {
        if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
        if (expandedId) { setExpandedId(null); return; }
        if (focusedTaskId) { setFocusedTaskId(null); return; }
        if (isInput) { (e.target as HTMLElement).blur(); return; }
        return;
      }

      // All other shortcuts only work outside inputs
      if (isInput) return;

      // "?" — toggle help modal
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
        return;
      }

      // j/k — navigate tasks (only on board tab)
      if ((e.key === "j" || e.key === "k") && activeTab === "board") {
        e.preventDefault();
        const taskList = filteredTasksRef.current;
        if (taskList.length === 0) return;
        if (!focusedTaskId) {
          const firstId = taskList[0].id;
          setFocusedTaskId(firstId);
          document.getElementById(`task-card-${firstId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        const currentIdx = taskList.findIndex((t) => t.id === focusedTaskId);
        let nextIdx: number;
        if (e.key === "j") {
          nextIdx = currentIdx < taskList.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : taskList.length - 1;
        }
        const nextId = taskList[nextIdx].id;
        setFocusedTaskId(nextId);
        document.getElementById(`task-card-${nextId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }

      // Enter — open fullscreen for focused task
      if (e.key === "Enter" && focusedTaskId && activeTab === "board") {
        e.preventDefault();
        setExpandedId(focusedTaskId);
        return;
      }

      // s — change status (toggle expand for focused task)
      if (e.key === "s" && focusedTaskId && activeTab === "board") {
        e.preventDefault();
        setExpandedId(expandedId === focusedTaskId ? null : focusedTaskId);
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showShortcutsHelp, expandedId, focusedTaskId, activeTab]);

  const filteredInitiatives = useMemo(() => {
    if (!debouncedSearch) return sortedInitiatives;
    const q = debouncedSearch.toLowerCase();
    return sortedInitiatives.filter(
      (i) =>
        (i.title?.toLowerCase().includes(q)) ||
        i.rawIdea.toLowerCase().includes(q)
    );
  }, [sortedInitiatives, debouncedSearch]);

  const activeInitiatives = filteredInitiatives.filter((i) => i.status !== "DONE");
  const completedInitiatives = filteredInitiatives.filter((i) => i.status === "DONE");

  const projectOptions = projects.length > 0
    ? projects.map((p) => ({ id: p.id, name: p.name }))
    : HARDCODED_PROJECTS.map((name) => ({ id: "", name }));

  // ---------- Render ----------

  return (
    <main className="flex flex-col min-h-screen pt-[calc(5rem+2.5rem)] md:pt-20">
      {message && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg border text-sm transition-all ${
            message.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          {/* Search bar — visible on Ideas and Board tabs */}
          {(activeTab === "ideas" || activeTab === "board") && (
            <div className="mb-6">
              <div className="relative w-full max-w-sm">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search tasks and ideas...  (/)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 pr-8 rounded-lg border border-card-border bg-background text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* IDEAS TAB */}
          {activeTab === "ideas" && (
            <IdeasTab
              activeInitiatives={activeInitiatives}
              completedInitiatives={completedInitiatives}
              initiativesLoading={initiativesLoading}
              newIdea={newIdea}
              onNewIdeaChange={setNewIdea}
              ideaProjectId={ideaProjectId}
              onIdeaProjectIdChange={setIdeaProjectId}
              projectOptions={projectOptions}
              submittingIdea={submittingIdea}
              onSubmitIdea={handleSubmitIdea}
              expandedInitiativeId={expandedInitiativeId}
              onToggleExpand={(id) => setExpandedInitiativeId(expandedInitiativeId === id ? null : id)}
              isOwner={isOwner}
              agents={agents.map((a) => ({ id: a.id, displayName: a.displayName }))}
              answerInputs={answerInputs}
              onAnswerInputChange={(initiativeId, val) =>
                setAnswerInputs((prev) => ({ ...prev, [initiativeId]: val }))
              }
              sendingAnswer={sendingAnswer}
              onSendAnswer={handleSendAnswer}
              onQuickReply={handleQuickReply}
              executingInitiativeId={executingInitiativeId}
              onExecute={handleExecuteInitiative}
              deletingInitiativeId={deletingInitiativeId}
              onDelete={handleDeleteInitiative}
              changingStatusId={changingStatusId}
              onChangeStatus={handleChangeInitiativeStatus}
              creatingInitiativeTask={creatingInitiativeTask}
              onCreateTask={handleCreateInitiativeTaskFromTab}
            />
          )}

          {/* BOARD TAB */}
          {activeTab === "board" && (
            <BoardTab
              visibleTasks={filteredTasks}
              initiatives={initiatives}
              projects={projects}
              agents={agents}
              urlProjectId={urlProjectId}
              isOwner={isOwner}
              expandedId={expandedId}
              onToggleExpand={setExpandedId}
              onMoveTask={handleMoveTask}
              onDeleteTask={handleDeleteTask}
              onRefresh={fetchTasks}
              focusedTaskId={focusedTaskId}
            />
          )}

          {/* OFFICE TAB */}
          {activeTab === "office" && (
            <div className="bg-card-bg border border-card-border rounded-xl p-6">
              <OfficeView />
            </div>
          )}

          {/* CONTROLS TAB (OWNER only) */}
          {activeTab === "controls" && isOwner && (
            <div className="bg-card-bg border border-card-border rounded-xl p-6">
              <OfficeControls isOwner={isOwner} />
            </div>
          )}

          {/* COMMUNICATION TAB (OWNER only) */}
          {activeTab === "communication" && isOwner && (
            <OfficeCommunication />
          )}

          {/* SMM TAB (OWNER only) */}
          {activeTab === "smm" && isOwner && (
            <div className="bg-card-bg border border-card-border rounded-xl p-6">
              <SmmDashboard
                accounts={smmAccounts}
                projects={projects}
                onRefresh={fetchSmmAccounts}
              />
            </div>
          )}

          {/* MEMPALACE TAB (OWNER only) */}
          {activeTab === "mempalace" && isOwner && (
            <MempalaceTab />
          )}

        </div>
      </section>

      {/* Keyboard shortcuts help modal */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowShortcutsHelp(false)}>
          <div className="bg-card-bg border border-card-border rounded-xl p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">/</kbd><span>Search</span></div>
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">?</kbd><span>This help</span></div>
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">j / k</kbd><span>Next / prev task</span></div>
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">Enter</kbd><span>Open focused task</span></div>
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">s</kbd><span>Toggle status panel</span></div>
              <div className="flex justify-between gap-6"><kbd className="text-muted font-mono text-xs bg-card-border/30 px-1.5 py-0.5 rounded">Esc</kbd><span>Close / unfocus</span></div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
