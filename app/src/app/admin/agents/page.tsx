"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface Agent {
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
  createdAt: string;
  updatedAt: string;
}


export default function AgentsPage() {
  const t = useTranslations("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isFromDb, setIsFromDb] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", description: "", role: "", instructions: "", avatarEmoji: "", avatarUrl: "", color: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (Array.isArray(data)) {
        setAgents(data);
        setIsFromDb(data.length > 0);
      }
    } catch {
      setAgents([]);
      setIsFromDb(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/agents/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Seed failed");
      showMessage(data.message, "success");
      await fetchAgents();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Seed failed", "error");
    } finally {
      setSeeding(false);
    }
  };

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditForm({
      displayName: agent.displayName,
      description: agent.description,
      role: agent.role,
      instructions: agent.instructions,
      avatarEmoji: agent.avatarEmoji ?? "",
      avatarUrl: agent.avatarUrl ?? "",
      color: agent.color ?? "",
      bio: agent.bio ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ displayName: "", description: "", role: "", instructions: "", avatarEmoji: "", avatarUrl: "", color: "", bio: "" });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      showMessage("Agent updated", "success");
      setEditingId(null);
      await fetchAgents();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasHistory = (agent: Agent) => {
    // If agent has been updated after creation (more than 1 second difference), it was edited
    if (!agent.createdAt || !agent.updatedAt) return false;
    const created = new Date(agent.createdAt).getTime();
    const updated = new Date(agent.updatedAt).getTime();
    return updated - created > 1000;
  };

  return (
    <main className="flex flex-col min-h-screen pt-20">
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-center mb-4">
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              {t("title")}
            </span>
          </h1>
          <p className="text-muted text-center mb-6 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>

          {/* Actions bar */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {isFromDb ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-500/30 bg-green-500/5 text-sm text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                Loaded from database ({agents.length} agents)
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-400">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                Static data (DB not seeded)
              </span>
            )}
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-4 py-2 rounded-lg border border-accent/30 bg-accent/10 text-sm text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seeding ? "Seeding..." : "Seed from .md files"}
            </button>
          </div>

          {/* Message toast */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => {
              const isEditing = editingId === agent.id;

              return (
                <div
                  key={agent.id || agent.name}
                  className={`bg-card-bg border rounded-xl p-6 transition-colors ${
                    isEditing
                      ? "border-accent/70 col-span-1 md:col-span-2 lg:col-span-3"
                      : "border-card-border hover:border-accent/50"
                  }`}
                >
                  {isEditing ? (
                    /* Edit mode */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-lg font-semibold">
                          Editing: {agent.displayName}
                        </h2>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-1.5 rounded-lg border border-card-border text-sm text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={editForm.displayName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, displayName: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                            Role
                          </label>
                          <input
                            type="text"
                            value={editForm.role}
                            onChange={(e) =>
                              setEditForm({ ...editForm, role: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                          Instructions
                        </label>
                        <textarea
                          value={editForm.instructions}
                          onChange={(e) =>
                            setEditForm({ ...editForm, instructions: e.target.value })
                          }
                          rows={16}
                          className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm font-mono focus:outline-none focus:border-accent/50 resize-y"
                        />
                      </div>

                      {/* Avatar / Customization fields */}
                      <div className="border-t border-card-border pt-4">
                        <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-3">
                          Customization
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                              Avatar Emoji
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editForm.avatarEmoji}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, avatarEmoji: e.target.value })
                                }
                                placeholder="e.g. 🏗️"
                                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                              />
                              {editForm.avatarEmoji && (
                                <div
                                  className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-lg bg-gradient-to-br ${editForm.color || "from-gray-500 to-gray-600"}`}
                                >
                                  {editForm.avatarEmoji}
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                              Color (Tailwind gradient)
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editForm.color}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, color: e.target.value })
                                }
                                placeholder="e.g. from-purple-500 to-violet-600"
                                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                              />
                              {editForm.color && (
                                <div
                                  className={`w-9 h-9 rounded-lg shrink-0 bg-gradient-to-br ${editForm.color}`}
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                              Avatar URL
                            </label>
                            <input
                              type="text"
                              value={editForm.avatarUrl}
                              onChange={(e) =>
                                setEditForm({ ...editForm, avatarUrl: e.target.value })
                              }
                              placeholder="https://..."
                              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-3">
                            Character
                          </label>
                          <div className="grid grid-cols-10 gap-1.5">
                            {Array.from({ length: 20 }, (_, i) => {
                              const nn = String(i + 1).padStart(2, "0");
                              const isSelected = editForm.avatarUrl === nn;
                              return (
                                <button
                                  key={nn}
                                  type="button"
                                  title={`Character ${nn}`}
                                  onClick={() => setEditForm({ ...editForm, avatarUrl: nn })}
                                  className={`relative rounded-lg overflow-hidden transition-all focus:outline-none ${
                                    isSelected
                                      ? "ring-2 ring-accent ring-offset-1 ring-offset-card-bg"
                                      : "opacity-70 hover:opacity-100"
                                  }`}
                                  style={{ width: 48, height: 72 }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/assets/office/characters/previews/preview_${nn}.png`}
                                    alt={`Character ${nn}`}
                                    className="w-full h-full object-contain"
                                    style={{ imageRendering: "pixelated" }}
                                  />
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-accent/20 pointer-events-none" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {editForm.avatarUrl && /^\d{2}$/.test(editForm.avatarUrl) && (
                            <p className="mt-2 text-xs text-muted/60">
                              Selected: Character {editForm.avatarUrl}
                              <button
                                type="button"
                                onClick={() => setEditForm({ ...editForm, avatarUrl: "" })}
                                className="ml-2 text-red-400/70 hover:text-red-400 transition-colors"
                              >
                                Clear
                              </button>
                            </p>
                          )}
                        </div>

                        <div className="mt-4">
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                            Bio
                          </label>
                          <textarea
                            value={editForm.bio}
                            onChange={(e) =>
                              setEditForm({ ...editForm, bio: e.target.value })
                            }
                            rows={3}
                            placeholder="Extended description / personality..."
                            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50 resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <h2 className="text-lg font-semibold">
                              {agent.displayName || agent.name}
                            </h2>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted px-2 py-0.5 rounded bg-card-border/50">
                                {agent.model}
                              </span>
                              {isFromDb && (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    hasHistory(agent)
                                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                      : "bg-green-500/10 text-green-400 border border-green-500/20"
                                  }`}
                                >
                                  {hasHistory(agent) ? "Edited via UI" : "Seeded from files"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isFromDb && (
                          <button
                            onClick={() => startEdit(agent)}
                            className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                            title="Edit agent"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <p className="text-muted text-sm mb-4">{agent.description}</p>

                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">
                          Tools
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.tools.map((tool) => (
                            <span
                              key={tool}
                              className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent/80 border border-accent/15"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>

                      {agent.instructions && agent.instructions !== "See agents/" + agent.name + ".md" && (
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-medium text-muted/70 uppercase tracking-wider mb-2 hover:text-muted select-none">
                            Instructions <span className="text-muted/40 group-open:hidden">▸</span><span className="text-muted/40 hidden group-open:inline">▾</span>
                          </summary>
                          <div className="mt-2 p-3 rounded-lg bg-background border border-card-border max-h-96 overflow-y-auto">
                            <pre className="text-xs text-muted whitespace-pre-wrap font-mono leading-relaxed">{agent.instructions}</pre>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
