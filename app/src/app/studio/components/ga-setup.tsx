"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface ProjectGA {
  id: string;
  name: string;
  url: string | null;
  ga4MeasurementId: string | null;
}

export default function GoogleAnalyticsSetup() {
  const t = useTranslations("smm");
  const [projects, setProjects] = useState<ProjectGA[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchProjects = () => {
    fetch("/api/projects/analytics")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, []);

  const showMsg = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleEdit = (project: ProjectGA) => {
    setEditingId(project.id);
    setEditValue(project.ga4MeasurementId || "");
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleSave = async (projectId: string) => {
    const trimmed = editValue.trim();
    if (trimmed && !/^G-[A-Z0-9]+$/.test(trimmed)) {
      showMsg(t("ga_invalid_format"), "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/projects/analytics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ga4MeasurementId: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || "Failed to save");
      }
      setEditingId(null);
      setEditValue("");
      fetchProjects();
      showMsg(t("ga_saved"), "success");
    } catch (err) {
      showMsg(err instanceof Error ? err.message : t("ga_save_error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (projectId: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/projects/analytics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ga4MeasurementId: "" }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      fetchProjects();
      showMsg(t("ga_removed"), "success");
    } catch {
      showMsg(t("ga_save_error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const connectedCount = projects.filter((p) => p.ga4MeasurementId).length;

  if (loading) {
    return (
      <div className="text-sm text-muted py-8 text-center">{t("ga_loading")}</div>
    );
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <svg className="w-4.5 h-4.5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.844 11.35l-1.96 7.13a1.997 1.997 0 01-1.93 1.48H5.046a1.997 1.997 0 01-1.93-1.48l-1.96-7.13a1 1 0 01.97-1.27h3.09l2.54-5.07a1 1 0 011.34-.45l.11.06L12 6.57l2.78-1.94a1 1 0 011.34.45l2.54 5.07h3.09a1 1 0 01.97 1.27z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("ga_title")}
          </h3>
          <p className="text-xs text-muted">
            {connectedCount}/{projects.length} {t("ga_connected_count")}
          </p>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Setup instructions (collapsible) */}
      <details className="mb-4 group">
        <summary className="text-xs text-muted cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {t("ga_setup_guide")}
        </summary>
        <div className="mt-3 p-4 rounded-lg bg-card-border/20 border border-card-border/50">
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted">
            <li>
              {t("ga_step1")}{" "}
              <a
                href="https://analytics.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                analytics.google.com
              </a>
            </li>
            <li>{t("ga_step2")}</li>
            <li>{t("ga_step3")}</li>
          </ol>
        </div>
      </details>

      {/* Projects list */}
      <div className="space-y-2">
        {projects.map((project) => {
          const isEditing = editingId === project.id;
          const isConnected = !!project.ga4MeasurementId;

          return (
            <div
              key={project.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                isConnected
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-background border-card-border"
              }`}
            >
              {/* Status dot */}
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isConnected ? "bg-green-500" : "bg-muted/30"
                }`}
              />

              {/* Project info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{project.name}</span>
                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted hover:text-accent transition-colors truncate hidden sm:inline"
                    >
                      {project.url.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                      placeholder="G-XXXXXXX"
                      className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-card-border text-foreground text-xs font-mono focus:outline-none focus:border-accent/50 max-w-[200px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(project.id);
                        if (e.key === "Escape") handleCancel();
                      }}
                    />
                    <button
                      onClick={() => handleSave(project.id)}
                      disabled={saving}
                      className="px-2.5 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {saving ? "..." : t("save")}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-2.5 py-1.5 rounded-md border border-card-border text-xs text-muted hover:text-foreground transition-colors"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : isConnected ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs font-mono text-green-400">
                      {project.ga4MeasurementId}
                    </code>
                    <a
                      href={`https://analytics.google.com/analytics/web/#/p${project.ga4MeasurementId!.replace("G-", "")}/reports/reportinghub`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      {t("ga_open_dashboard")}
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-muted mt-0.5">{t("ga_not_connected")}</p>
                )}
              </div>

              {/* Actions */}
              {!isEditing && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(project)}
                    className="px-2.5 py-1.5 rounded-md border border-card-border text-xs text-muted hover:text-foreground transition-colors"
                  >
                    {isConnected ? t("edit") : t("ga_connect")}
                  </button>
                  {isConnected && (
                    <button
                      onClick={() => handleRemove(project.id)}
                      disabled={saving}
                      className="px-2.5 py-1.5 rounded-md border border-red-500/20 text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {t("ga_disconnect")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
