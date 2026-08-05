"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import SmmAnalyticsCharts from "./smm-analytics-charts";
import GoogleAnalyticsSetup from "./ga-setup";
import GaAnalyticsDashboard from "./ga-analytics-dashboard";

// ---------- Types ----------

export interface SmmInitiative {
  id: string;
  title: string | null;
  rawIdea: string;
  status: string;
}

export interface SmmAccount {
  id: string;
  platform: "youtube" | "twitter" | "instagram" | "tiktok" | "linkedin";
  accountName: string;
  accountUrl: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  secrets: { keys: string[] } | null;
  avatarUrl: string | null;
  description: string | null;
  analytics: Record<string, unknown> | null;
  initiatives: SmmInitiative[];
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
}

interface SmmDashboardProps {
  accounts: SmmAccount[];
  projects: Project[];
  onRefresh: () => void;
}

// ---------- Platform config ----------

const PLATFORM_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  youtube: {
    label: "YouTube",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  twitter: {
    label: "X / Twitter",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.19 8.19 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z" />
      </svg>
    ),
  },
  linkedin: {
    label: "LinkedIn",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
};

const INITIATIVE_STATUS_BADGE: Record<string, string> = {
  IDEA: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  PLANNING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PLANNED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  IN_PROGRESS: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  BLOCKED: "bg-red-500/10 text-red-400 border-red-500/20",
  DONE: "bg-green-500/10 text-green-400 border-green-500/20",
};

// ---------- Add/Edit Modal ----------

interface AccountFormData {
  platform: SmmAccount["platform"];
  accountName: string;
  accountUrl: string;
  projectId: string;
  description: string;
  avatarUrl: string;
  secretKeys: string[];
}

const defaultFormData: AccountFormData = {
  platform: "youtube",
  accountName: "",
  accountUrl: "",
  projectId: "",
  description: "",
  avatarUrl: "",
  secretKeys: [],
};

function AccountModal({
  initial,
  projects,
  onSave,
  onClose,
}: {
  initial?: SmmAccount;
  projects: Project[];
  onSave: (data: AccountFormData) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("smm");
  const [form, setForm] = useState<AccountFormData>(() => {
    if (initial) {
      return {
        platform: initial.platform,
        accountName: initial.accountName,
        accountUrl: initial.accountUrl,
        projectId: initial.projectId ?? "",
        description: initial.description ?? "",
        avatarUrl: initial.avatarUrl ?? "",
        secretKeys: initial.secrets?.keys ?? [],
      };
    }
    return defaultFormData;
  });
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddKey = () => {
    const trimmed = newKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (!trimmed || form.secretKeys.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, secretKeys: [...prev.secretKeys, trimmed] }));
    setNewKey("");
  };

  const handleRemoveKey = (key: string) => {
    setForm((prev) => ({ ...prev, secretKeys: prev.secretKeys.filter((k) => k !== key) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card-bg border border-card-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <h2 className="text-lg font-semibold">
            {initial ? t("edit_account") : t("add_account")}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t("platform")}</label>
            <select
              value={form.platform}
              onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value as SmmAccount["platform"] }))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
            >
              {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t("account_name")}</label>
            <input
              type="text"
              required
              value={form.accountName}
              onChange={(e) => setForm((prev) => ({ ...prev, accountName: e.target.value }))}
              placeholder="TT Family"
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Account URL */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t("account_url")}</label>
            <input
              type="url"
              required
              value={form.accountUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, accountUrl: e.target.value }))}
              placeholder="https://youtube.com/channel/..."
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t("project_optional")}</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm((prev) => ({ ...prev, projectId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
            >
              <option value="">{t("no_project")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t("description_optional")}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder={t("description_placeholder")}
              className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50 resize-none"
            />
          </div>

          {/* Secrets */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1">{t("secret_keys")}</label>
            <p className="text-xs text-muted mb-2">
              {t("secrets_hint")}
            </p>
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 mb-3">
              <p className="text-xs text-amber-400">{t("secrets_infisical_note")}</p>
            </div>

            {form.secretKeys.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {form.secretKeys.map((key) => (
                  <span
                    key={key}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-card-border/50 text-muted font-mono"
                  >
                    {key}
                    <button
                      type="button"
                      onClick={() => handleRemoveKey(key)}
                      className="text-muted hover:text-red-400 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddKey(); } }}
                placeholder="YOUTUBE_API_KEY"
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm font-mono focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={handleAddKey}
                className="px-3 py-2 rounded-lg bg-card-border/50 text-muted hover:text-foreground text-sm transition-colors"
              >
                {t("add_key")}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-card-border text-muted hover:text-foreground text-sm transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Account Card ----------

function AccountCard({
  account,
  onEdit,
  onDelete,
  onViewIdeas,
}: {
  account: SmmAccount;
  onEdit: () => void;
  onDelete: () => void;
  onViewIdeas: () => void;
}) {
  const t = useTranslations("smm");
  const cfg = PLATFORM_CONFIG[account.platform] ?? PLATFORM_CONFIG.youtube;
  const secretCount = account.secrets?.keys?.length ?? 0;
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  return (
    <div className="bg-background border border-card-border rounded-xl p-5 hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg ${cfg.bg} ${cfg.border} border flex items-center justify-center ${cfg.color} shrink-0`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={account.accountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm text-foreground hover:text-accent transition-colors truncate"
            >
              {account.accountName}
            </a>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              {cfg.label}
            </span>
          </div>
          {account.project && (
            <p className="text-xs text-muted mt-0.5">{account.project.name}</p>
          )}
          {account.description && (
            <p className="text-xs text-muted mt-1 line-clamp-2">{account.description}</p>
          )}
        </div>
      </div>

      {/* Secrets indicator */}
      {secretCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span>{secretCount} {t("secrets_stored_in_infisical")}</span>
        </div>
      )}

      {/* Linked ideas */}
      {account.initiatives.length > 0 && (
        <button
          onClick={onViewIdeas}
          className="w-full text-left mb-3"
        >
          <div className="text-xs text-muted mb-1.5">{t("linked_ideas")} ({account.initiatives.length})</div>
          <div className="flex flex-wrap gap-1">
            {account.initiatives.slice(0, 3).map((ini) => (
              <span
                key={ini.id}
                className={`text-xs px-1.5 py-0.5 rounded border ${INITIATIVE_STATUS_BADGE[ini.status] ?? INITIATIVE_STATUS_BADGE.IDEA}`}
              >
                {ini.title ?? ini.rawIdea.slice(0, 30) + "..."}
              </span>
            ))}
            {account.initiatives.length > 3 && (
              <span className="text-xs text-muted">+{account.initiatives.length - 3} more</span>
            )}
          </div>
        </button>
      )}

      {/* Analytics panel */}
      <button
        onClick={() => setAnalyticsOpen(!analyticsOpen)}
        className="w-full flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors mb-3"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${analyticsOpen ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {t("analytics")}
      </button>

      {analyticsOpen && (
        <div className="mb-4 p-3 rounded-lg bg-card-border/20 border border-card-border/50">
          <SmmAnalyticsCharts
            accountId={account.id}
            analytics={account.analytics as Parameters<typeof SmmAnalyticsCharts>[0]["analytics"]}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={account.accountUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center px-3 py-1.5 rounded-lg border border-card-border text-xs text-muted hover:text-foreground transition-colors"
        >
          {t("view_profile")}
        </a>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-lg border border-card-border text-xs text-muted hover:text-foreground transition-colors"
        >
          {t("edit")}
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg border border-red-500/20 text-xs text-red-400/70 hover:text-red-400 transition-colors"
        >
          {t("delete")}
        </button>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function SmmDashboard({ accounts, projects, onRefresh }: SmmDashboardProps) {
  const t = useTranslations("smm");
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<SmmAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMsg = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreate = async (data: AccountFormData) => {
    const res = await fetch("/api/smm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: data.platform,
        accountName: data.accountName,
        accountUrl: data.accountUrl,
        projectId: data.projectId || null,
        description: data.description || null,
        avatarUrl: data.avatarUrl || null,
        secretKeys: data.secretKeys,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error || "Failed to create account");
    }
    onRefresh();
    showMsg(t("account_created"), "success");
  };

  const handleUpdate = async (data: AccountFormData) => {
    if (!editAccount) return;
    const res = await fetch(`/api/smm/accounts/${editAccount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: data.platform,
        accountName: data.accountName,
        accountUrl: data.accountUrl,
        projectId: data.projectId || null,
        description: data.description || null,
        avatarUrl: data.avatarUrl || null,
        secretKeys: data.secretKeys,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error || "Failed to update account");
    }
    setEditAccount(null);
    onRefresh();
    showMsg(t("account_updated"), "success");
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirm_delete"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/smm/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      onRefresh();
      showMsg(t("account_deleted"), "success");
    } catch {
      showMsg(t("delete_failed"), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewIdeas = (accountId: string) => {
    router.push(`/studio?tab=ideas&smmAccountId=${accountId}`);
  };

  // Group by platform
  const byPlatform = accounts.reduce<Record<string, SmmAccount[]>>((acc, a) => {
    if (!acc[a.platform]) acc[a.platform] = [];
    acc[a.platform].push(a);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("add_account")}
        </button>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="text-center py-16 text-muted">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <p className="text-sm">{t("no_accounts")}</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            {t("add_first_account")}
          </button>
        </div>
      )}

      {/* Google Analytics Dashboard */}
      <GaAnalyticsDashboard />

      {/* Google Analytics Setup */}
      <GoogleAnalyticsSetup />

      {/* Accounts grouped by platform */}
      {Object.entries(byPlatform).map(([platform, platformAccounts]) => {
        const cfg = PLATFORM_CONFIG[platform];
        return (
          <div key={platform} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-5 h-5 ${cfg.color}`}>{cfg.icon}</div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{cfg.label}</h3>
              <span className="text-xs text-muted bg-card-border/50 px-2 py-0.5 rounded-full">
                {platformAccounts.length}
              </span>
            </div>
            <div className={`grid gap-4 ${platform === "youtube" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
              {platformAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={() => setEditAccount(account)}
                  onDelete={() => {
                    if (deletingId !== account.id) handleDelete(account.id);
                  }}
                  onViewIdeas={() => handleViewIdeas(account.id)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Add Modal */}
      {showAdd && (
        <AccountModal
          projects={projects}
          onSave={handleCreate}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Edit Modal */}
      {editAccount && (
        <AccountModal
          initial={editAccount}
          projects={projects}
          onSave={handleUpdate}
          onClose={() => setEditAccount(null)}
        />
      )}
    </div>
  );
}
