"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface Project {
  id: string;
  name: string;
  status: string;
}

interface ClientProject {
  accessId: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  accessRole: "CLIENT" | "VIEWER";
  accessCreatedAt: string;
}

interface Client {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "CLIENT" | "VIEWER";
  telegramUsername: string | null;
  telegramId: string | null;
  invitedBy: string | null;
  invitedAt: string | null;
  createdAt: string;
  authMethods: string[];
  projects: ClientProject[];
}

const ROLE_STYLES: Record<string, string> = {
  CLIENT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  VIEWER: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const AUTH_METHOD_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  credentials: "Password",
  passkey: "Passkey",
};

function AuthBadge({ provider }: { provider: string }) {
  const label = AUTH_METHOD_LABELS[provider] ?? provider;
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-card-border text-muted font-mono">
      {label}
    </span>
  );
}

export default function ClientsPage() {
  const t = useTranslations("admin");

  const [clients, setClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"CLIENT" | "VIEWER">("CLIENT");
  const [inviteProjectId, setInviteProjectId] = useState("");
  const [inviteProjectRole, setInviteProjectRole] = useState<"CLIENT" | "VIEWER">("CLIENT");
  const [inviteTelegram, setInviteTelegram] = useState("");
  const [inviting, setInviting] = useState(false);

  // Per-project role editing state
  const [editingAccess, setEditingAccess] = useState<{
    userId: string;
    projectId: string;
    role: "CLIENT" | "VIEWER";
  } | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [revokingAccess, setRevokingAccess] = useState<string | null>(null);

  // Add project to existing client
  const [addingProjectFor, setAddingProjectFor] = useState<string | null>(null);
  const [addProjectId, setAddProjectId] = useState("");
  const [addProjectRole, setAddProjectRole] = useState<"CLIENT" | "VIEWER">("CLIENT");
  const [addingProject, setAddingProject] = useState(false);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      const data = await res.json();
      if (Array.isArray(data)) setClients(data);
    } catch {
      showMessage("Failed to load clients", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setAllProjects(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchProjects();
  }, [fetchClients, fetchProjects]);

  // Invite new client
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          projectId: inviteProjectId || undefined,
          projectRole: inviteProjectRole,
          telegramUsername: inviteTelegram.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      showMessage(data.message ?? t("client_invited"), "success");
      setInviteEmail("");
      setInviteTelegram("");
      setInviteProjectId("");
      await fetchClients();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : t("invite_failed"), "error");
    } finally {
      setInviting(false);
    }
  };

  // Change project-level role
  const handleChangeProjectRole = async () => {
    if (!editingAccess) return;
    setSavingRole(true);
    try {
      const { userId, projectId, role } = editingAccess;
      const res = await fetch(`/api/admin/clients/${userId}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      showMessage(data.message ?? t("role_updated"), "success");
      setEditingAccess(null);
      await fetchClients();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : t("update_failed"), "error");
    } finally {
      setSavingRole(false);
    }
  };

  // Revoke project access
  const handleRevokeAccess = async (userId: string, projectId: string, projectName: string) => {
    const key = `${userId}:${projectId}`;
    setRevokingAccess(key);
    try {
      const res = await fetch(`/api/admin/clients/${userId}/projects/${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Revoke failed");
      showMessage(`${t("access_revoked")}: ${projectName}`, "success");
      await fetchClients();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : t("revoke_failed"), "error");
    } finally {
      setRevokingAccess(null);
    }
  };

  // Add project access to existing client
  const handleAddProject = async (userId: string) => {
    if (!addProjectId) return;
    setAddingProject(true);
    try {
      const clientEmail = clients.find((c) => c.id === userId)?.email;
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: clientEmail,
          projectId: addProjectId,
          projectRole: addProjectRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      showMessage(t("project_assigned"), "success");
      setAddingProjectFor(null);
      setAddProjectId("");
      await fetchClients();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : t("assign_failed"), "error");
    } finally {
      setAddingProject(false);
    }
  };

  const availableProjects = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    const assignedIds = new Set(client?.projects.map((p) => p.projectId) ?? []);
    return allProjects.filter((p) => !assignedIds.has(p.id));
  };

  return (
    <main className="flex flex-col min-h-screen pt-20">
      {/* Toast */}
      {message && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg border text-sm shadow-lg transition-all ${
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
              {t("clients_title")}
            </span>
          </h1>
          <p className="text-muted text-center mb-12 max-w-2xl mx-auto">
            {t("clients_subtitle")}
          </p>

          {/* Invite form */}
          <div className="bg-card-bg border border-card-border rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">{t("invite_client")}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="client@example.com"
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    {t("user_role")}
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "CLIENT" | "VIEWER")}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    <option value="CLIENT">Client</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    {t("assign_project")}
                  </label>
                  <select
                    value={inviteProjectId}
                    onChange={(e) => setInviteProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  >
                    <option value="">{t("no_project")}</option>
                    {allProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    {t("project_role")}
                  </label>
                  <select
                    value={inviteProjectRole}
                    onChange={(e) => setInviteProjectRole(e.target.value as "CLIENT" | "VIEWER")}
                    disabled={!inviteProjectId}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50 disabled:opacity-40"
                  >
                    <option value="CLIENT">Client</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted/70 uppercase tracking-wider mb-1">
                    Telegram
                  </label>
                  <input
                    type="text"
                    value={inviteTelegram}
                    onChange={(e) => setInviteTelegram(e.target.value)}
                    placeholder="@username"
                    className="px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-6 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? t("inviting") : t("invite")}
                </button>
              </div>
            </div>
          </div>

          {/* Clients list */}
          {loading ? (
            <div className="text-center text-muted py-12">{t("loading")}</div>
          ) : clients.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">{t("no_clients")}</p>
          ) : (
            <div className="space-y-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-card-bg border border-card-border rounded-xl p-5 hover:border-accent/30 transition-colors"
                >
                  {/* Client header row */}
                  <div className="flex items-start gap-4">
                    {client.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.image}
                        alt=""
                        className="w-10 h-10 rounded-full border border-card-border shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-card-border flex items-center justify-center text-sm font-medium text-muted shrink-0">
                        {(client.name ?? client.email ?? "?")[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {client.name ?? client.email ?? "Unknown"}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${ROLE_STYLES[client.role]}`}
                        >
                          {client.role}
                        </span>
                        {client.authMethods.length > 0 ? (
                          <div className="flex gap-1">
                            {client.authMethods.map((m) => (
                              <AuthBadge key={m} provider={m} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted/40 italic">
                            {t("no_auth_yet")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {client.email}
                        {client.telegramUsername && (
                          <span className="ml-2 text-blue-400">{client.telegramUsername}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted/50 mt-0.5">
                        {client.invitedAt ? (
                          <>
                            {t("invited")}{" "}
                            {new Date(client.invitedAt).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {client.invitedBy && (
                              <span className="ml-1 text-muted/40">
                                {t("by")} {client.invitedBy}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {t("joined")}{" "}
                            {new Date(client.createdAt).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Projects assigned to client */}
                  <div className="mt-4 pl-14 space-y-2">
                    {client.projects.map((pa) => {
                      const isEditingThis =
                        editingAccess?.userId === client.id &&
                        editingAccess?.projectId === pa.projectId;
                      const revokeKey = `${client.id}:${pa.projectId}`;
                      const isRevoking = revokingAccess === revokeKey;

                      return (
                        <div
                          key={pa.projectId}
                          className="flex flex-wrap items-center gap-2 bg-background/50 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm text-foreground/80 flex-1 min-w-0 truncate">
                            {pa.projectName}
                          </span>

                          {isEditingThis ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editingAccess.role}
                                onChange={(e) =>
                                  setEditingAccess({
                                    ...editingAccess,
                                    role: e.target.value as "CLIENT" | "VIEWER",
                                  })
                                }
                                className="text-xs px-2 py-1 rounded bg-background border border-card-border text-foreground focus:outline-none focus:border-accent/50"
                              >
                                <option value="CLIENT">Client</option>
                                <option value="VIEWER">Viewer</option>
                              </select>
                              <button
                                onClick={handleChangeProjectRole}
                                disabled={savingRole}
                                className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                              >
                                {savingRole ? t("saving") : t("save")}
                              </button>
                              <button
                                onClick={() => setEditingAccess(null)}
                                className="text-xs px-2 py-1 rounded border border-card-border text-muted hover:text-foreground transition-colors"
                              >
                                {t("cancel")}
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  setEditingAccess({
                                    userId: client.id,
                                    projectId: pa.projectId,
                                    role: pa.accessRole,
                                  })
                                }
                                className={`text-xs px-2 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${ROLE_STYLES[pa.accessRole]}`}
                                title={t("change_role")}
                              >
                                {pa.accessRole}
                              </button>
                              <button
                                onClick={() =>
                                  handleRevokeAccess(client.id, pa.projectId, pa.projectName)
                                }
                                disabled={isRevoking}
                                className="text-xs px-2 py-0.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              >
                                {isRevoking ? t("revoking") : t("revoke")}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add project button / form */}
                    {addingProjectFor === client.id ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          value={addProjectId}
                          onChange={(e) => setAddProjectId(e.target.value)}
                          className="text-xs px-2 py-1.5 rounded bg-background border border-card-border text-foreground focus:outline-none focus:border-accent/50"
                        >
                          <option value="">{t("select_project")}</option>
                          {availableProjects(client.id).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={addProjectRole}
                          onChange={(e) =>
                            setAddProjectRole(e.target.value as "CLIENT" | "VIEWER")
                          }
                          className="text-xs px-2 py-1.5 rounded bg-background border border-card-border text-foreground focus:outline-none focus:border-accent/50"
                        >
                          <option value="CLIENT">Client</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          onClick={() => handleAddProject(client.id)}
                          disabled={addingProject || !addProjectId}
                          className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                        >
                          {addingProject ? t("adding") : t("add")}
                        </button>
                        <button
                          onClick={() => {
                            setAddingProjectFor(null);
                            setAddProjectId("");
                          }}
                          className="text-xs px-2 py-1.5 rounded border border-card-border text-muted hover:text-foreground transition-colors"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    ) : (
                      availableProjects(client.id).length > 0 && (
                        <button
                          onClick={() => {
                            setAddingProjectFor(client.id);
                            setAddProjectId("");
                          }}
                          className="text-xs text-accent/70 hover:text-accent transition-colors border border-dashed border-accent/20 hover:border-accent/40 px-3 py-1 rounded-lg"
                        >
                          + {t("add_project_access")}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
