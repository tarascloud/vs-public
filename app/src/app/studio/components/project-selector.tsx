"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

// ---------- Types ----------

interface Project {
  id: string;
  name: string;
}

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isOwner: boolean;
  taskCount?: number;
}

// ---------- Constants ----------

const PROJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PD:            { bg: "bg-blue-500/15",   text: "text-blue-400",   border: "border-blue-500/25" },
  JobFinder:     { bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/25" },
  "Vibe Studio": { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25" },
  Status:        { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25" },
  Website:       { bg: "bg-cyan-500/15",   text: "text-cyan-400",   border: "border-cyan-500/25" },
  Trade:         { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/25" },
};

function getProjectColors(name: string) {
  return PROJECT_COLORS[name] || { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/25" };
}

// ---------- Main Component ----------

export default function ProjectSelector({
  projects,
  selectedProjectIds,
  onSelectionChange,
  isOwner,
  taskCount,
}: ProjectSelectorProps) {
  const t = useTranslations("studio");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------- Owner: multi-select ----------

  if (isOwner) {
    const allSelected = selectedProjectIds.length === 0;

    const toggleProject = (id: string) => {
      if (selectedProjectIds.includes(id)) {
        const next = selectedProjectIds.filter((pid) => pid !== id);
        onSelectionChange(next);
      } else {
        onSelectionChange([...selectedProjectIds, id]);
      }
    };

    const selectAll = () => onSelectionChange([]);

    // Build button label
    let buttonLabel: React.ReactNode;
    if (allSelected) {
      buttonLabel = <span className="text-foreground">{t("all_projects")}</span>;
    } else {
      const selectedNames = projects
        .filter((p) => selectedProjectIds.includes(p.id))
        .map((p) => p.name);
      buttonLabel = (
        <span className="flex items-center gap-1.5 flex-wrap">
          {selectedNames.map((name) => {
            const colors = getProjectColors(name);
            return (
              <span
                key={name}
                className={`text-xs px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {name}
              </span>
            );
          })}
        </span>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          {/* Trigger button */}
          <button
            onClick={() => setIsOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm hover:border-accent/40 transition-colors min-w-[160px] max-w-[320px]"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
            </svg>
            <span className="flex-1 text-left truncate">{buttonLabel}</span>
            <svg
              className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          <div
            className={`absolute top-full left-0 mt-1 z-20 min-w-[200px] bg-card-bg border border-card-border rounded-xl shadow-xl overflow-hidden transition-all duration-150 origin-top ${
              isOpen ? "opacity-100 scale-y-100 pointer-events-auto" : "opacity-0 scale-y-95 pointer-events-none"
            }`}
          >
            {/* All Projects option */}
            <button
              onClick={() => { selectAll(); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/5 transition-colors border-b border-card-border ${
                allSelected ? "text-accent" : "text-foreground"
              }`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                allSelected ? "bg-accent border-accent" : "border-card-border"
              }`}>
                {allSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {t("all_projects")}
            </button>

            {/* Individual projects */}
            {projects.map((project) => {
              const isChecked = selectedProjectIds.includes(project.id);
              const colors = getProjectColors(project.name);
              return (
                <button
                  key={project.id}
                  onClick={() => toggleProject(project.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/5 transition-colors"
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                    isChecked ? "bg-accent border-accent" : "border-card-border"
                  }`}>
                    {isChecked && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                    {project.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Task count badge */}
        {taskCount !== undefined && (
          <span className="text-xs text-muted bg-card-border/50 px-2.5 py-1 rounded-full">
            {taskCount} {t("summary_active")}
          </span>
        )}
      </div>
    );
  }

  // ---------- Client: single-select or static badge ----------

  if (projects.length === 0) return null;

  if (projects.length === 1) {
    const project = projects[0];
    const colors = getProjectColors(project.name);
    return (
      <div className="flex items-center gap-3">
        <span className={`text-sm px-3 py-1.5 rounded-lg border ${colors.bg} ${colors.text} ${colors.border}`}>
          {project.name}
        </span>
        {taskCount !== undefined && (
          <span className="text-xs text-muted bg-card-border/50 px-2.5 py-1 rounded-full">
            {taskCount} {t("summary_active")}
          </span>
        )}
      </div>
    );
  }

  // Multiple projects — single select dropdown
  const selectedId = selectedProjectIds[0] || "";
  const selectedProject = projects.find((p) => p.id === selectedId);

  return (
    <div className="flex items-center gap-3">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card-bg border border-card-border text-sm hover:border-accent/40 transition-colors min-w-[160px]"
        >
          {selectedProject ? (
            (() => {
              const colors = getProjectColors(selectedProject.name);
              return (
                <span className={`text-xs px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {selectedProject.name}
                </span>
              );
            })()
          ) : (
            <span className="text-foreground">{t("all_projects")}</span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-muted ml-auto shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div
          className={`absolute top-full left-0 mt-1 z-20 min-w-[180px] bg-card-bg border border-card-border rounded-xl shadow-xl overflow-hidden transition-all duration-150 origin-top ${
            isOpen ? "opacity-100 scale-y-100 pointer-events-auto" : "opacity-0 scale-y-95 pointer-events-none"
          }`}
        >
          {/* All option */}
          <button
            onClick={() => { onSelectionChange([]); setIsOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent/5 transition-colors border-b border-card-border ${
              !selectedId ? "text-accent" : "text-foreground"
            }`}
          >
            {t("all_projects")}
          </button>

          {projects.map((project) => {
            const colors = getProjectColors(project.name);
            const isSelected = selectedId === project.id;
            return (
              <button
                key={project.id}
                onClick={() => { onSelectionChange([project.id]); setIsOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent/5 transition-colors ${
                  isSelected ? "bg-accent/5" : ""
                }`}
              >
                <span className={`text-xs px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {project.name}
                </span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-accent ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {taskCount !== undefined && (
        <span className="text-xs text-muted bg-card-border/50 px-2.5 py-1 rounded-full">
          {taskCount} {t("summary_active")}
        </span>
      )}
    </div>
  );
}
