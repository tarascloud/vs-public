"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface ProjectUser {
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  techStack: string[];
  url: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  access: ProjectUser[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
  COMPLETED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ARCHIVED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function ProjectsAdminPage() {
  const t = useTranslations("admin");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", techStack: "", url: "" });
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", techStack: "", url: "" });

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      if (Array.isArray(data)) setProjects(data);
    } catch {
      showMessage("Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleAdd = async () => {
    if (!newProject.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProject.name,
          description: newProject.description || null,
          techStack: newProject.techStack
            ? newProject.techStack.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          url: newProject.url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      showMessage("Project created", "success");
      setNewProject({ name: "", description: "", techStack: "", url: "" });
      setShowAdd(false);
      await fetchProjects();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditForm({
      name: project.name,
      description: project.description || "",
      techStack: project.techStack.join(", "),
      url: project.url || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editForm.name,
          description: editForm.description || null,
          techStack: editForm.techStack
            ? editForm.techStack.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          url: editForm.url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      showMessage("Project updated", "success");
      setEditingId(null);
      await fetchProjects();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-col min-h-screen pt-20">
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

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-center mb-4">
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              {t("projects_title")}
            </span>
          </h1>
          <p className="text-muted text-center mb-8 max-w-2xl mx-auto">
            {t("projects_subtitle")}
          </p>

          {/* Add button */}
          <div className="flex justify-center mb-8">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 rounded-lg border border-accent/30 bg-accent/10 text-sm text-accent hover:bg-accent/20 transition-colors"
            >
              {showAdd ? t("cancel") : t("add_project")}
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="bg-card-bg border border-card-border rounded-xl p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">{t("new_project")}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                      {t("name")} *
                    </label>
                    <input
                      type="text"
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      placeholder="Project name"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                      URL
                    </label>
                    <input
                      type="text"
                      value={newProject.url}
                      onChange={(e) => setNewProject({ ...newProject, url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    {t("description")}
                  </label>
                  <input
                    type="text"
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    placeholder="Short description"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    {t("tech_stack")}
                  </label>
                  <input
                    type="text"
                    value={newProject.techStack}
                    onChange={(e) => setNewProject({ ...newProject, techStack: e.target.value })}
                    placeholder="Next.js, React, TypeScript (comma-separated)"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAdd}
                    disabled={saving || !newProject.name.trim()}
                    className="px-6 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? t("saving") : t("create")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Projects list */}
          {loading ? (
            <div className="text-center text-muted py-12">Loading...</div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => {
                const isEditing = editingId === project.id;

                return (
                  <div
                    key={project.id}
                    className={`bg-card-bg border rounded-xl p-6 transition-colors ${
                      isEditing ? "border-accent/50" : "border-card-border hover:border-accent/30"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                              {t("name")}
                            </label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                              URL
                            </label>
                            <input
                              type="text"
                              value={editForm.url}
                              onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                            {t("description")}
                          </label>
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                            {t("tech_stack")}
                          </label>
                          <input
                            type="text"
                            value={editForm.techStack}
                            onChange={(e) => setEditForm({ ...editForm, techStack: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                          >
                            {saving ? t("saving") : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-1.5 rounded-lg border border-card-border text-sm text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold">{project.name}</h2>
                            <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[project.status]}`}>
                              {project.status}
                            </span>
                          </div>
                          <button
                            onClick={() => startEdit(project)}
                            className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                            title="Edit project"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </button>
                        </div>

                        {project.description && (
                          <p className="text-muted text-sm mb-4">{project.description}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                          {project.techStack.map((tech) => (
                            <span
                              key={tech}
                              className="text-xs px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {project.url && (
                              <a
                                href={project.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-accent hover:text-accent-hover transition-colors"
                              >
                                {project.url}
                              </a>
                            )}
                          </div>
                          {project.access && project.access.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted mr-1">{t("clients")}:</span>
                              {project.access.map((pa) => (
                                <span
                                  key={pa.user.id}
                                  className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                >
                                  {pa.user.name || pa.user.email}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {projects.length === 0 && (
                <p className="text-muted text-sm text-center py-8">{t("no_projects")}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
