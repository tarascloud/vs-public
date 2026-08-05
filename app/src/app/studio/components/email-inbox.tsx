"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { sanitizeHtml } from "@/lib/sanitize-html";

// ---------- Types ----------

interface Email {
  id: string;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  read: boolean;
  deleted: boolean;
  receivedAt: string;
  createdAt: string;
}

type ComposeMode = "new" | "reply" | "forward" | null;

interface ComposeState {
  mode: ComposeMode;
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
}

// ---------- Icons ----------

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 10H11a8 8 0 00-8 8v2m18-10l-6-6m6 6l-6 6"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ---------- Helpers ----------

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ---------- Component ----------

export default function EmailInbox() {
  const t = useTranslations("communication");

  const [emails, setEmails] = useState<Email[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState>({
    mode: null,
    to: "",
    subject: "",
    body: "",
    inReplyTo: null,
  });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setEmails(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleExpand = async (email: Email) => {
    if (expandedId === email.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(email.id);
    // Mark as read
    if (!email.read) {
      try {
        await fetch(`/api/emails/${email.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        });
        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
        );
      } catch {
        // ignore
      }
    }
  };

  const handleDelete = async (emailId: string) => {
    try {
      await fetch(`/api/emails/${emailId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted: true }),
      });
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      if (expandedId === emailId) setExpandedId(null);
    } catch {
      // ignore
    }
  };

  const openCompose = (mode: "new" | "reply" | "forward", email?: Email) => {
    if (mode === "new") {
      setCompose({ mode: "new", to: "", subject: "", body: "", inReplyTo: null });
    } else if (mode === "reply" && email) {
      setCompose({
        mode: "reply",
        to: email.fromEmail,
        subject: `Re: ${email.subject || ""}`,
        body: "",
        inReplyTo: email.messageId,
      });
    } else if (mode === "forward" && email) {
      setCompose({
        mode: "forward",
        to: "",
        subject: `Fwd: ${email.subject || ""}`,
        body: "",
        inReplyTo: null,
      });
    }
  };

  const handleSend = async () => {
    if (!compose.to.trim() || !compose.body.trim()) return;
    setSending(true);
    try {
      await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: compose.to,
          subject: compose.subject,
          body: compose.body,
          inReplyTo: compose.inReplyTo,
        }),
      });
      setCompose({ mode: null, to: "", subject: "", body: "", inReplyTo: null });
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const visibleEmails = emails.filter((e) => !e.deleted);
  const unreadCount = visibleEmails.filter((e) => !e.read).length;
  const expandedEmail = visibleEmails.find((e) => e.id === expandedId) ?? null;

  return (
    <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{t("inbox")}</h2>
          {unreadCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-card-border/30"
          >
            <RefreshIcon spinning={loading} />
          </button>
          <button
            onClick={() => openCompose("new")}
            className="flex items-center gap-1.5 text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <ComposeIcon />
            {t("newEmail")}
          </button>
        </div>
      </div>

      {/* Email list */}
      <div className="divide-y divide-card-border">
        {visibleEmails.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted text-sm">{t("noEmails")}</div>
        ) : (
          visibleEmails.map((email) => (
            <div key={email.id}>
              {/* Row */}
              <button
                onClick={() => handleExpand(email)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-card-border/20 transition-colors ${
                  expandedId === email.id ? "bg-card-border/20" : ""
                }`}
              >
                {/* Unread dot */}
                <div className="mt-1.5 flex-shrink-0">
                  {!email.read ? (
                    <div className="w-2 h-2 rounded-full bg-accent" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-transparent" />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${
                        !email.read ? "font-semibold text-foreground" : "text-muted"
                      }`}
                    >
                      {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                    </span>
                    <span className="text-xs text-muted flex-shrink-0">
                      {formatDate(email.receivedAt || email.createdAt)}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate mt-0.5 ${
                      !email.read ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {email.subject || "(no subject)"}
                  </p>
                </div>
              </button>

              {/* Expanded view */}
              {expandedId === email.id && (
                <div className="px-4 pb-4 border-t border-card-border/50 bg-card-border/10">
                  {/* Header */}
                  <div className="pt-3 pb-2 space-y-1">
                    <div className="text-xs text-muted">
                      <span className="font-medium text-foreground">{t("from")}:</span>{" "}
                      {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                    </div>
                    <div className="text-xs text-muted">
                      <span className="font-medium text-foreground">{t("subject")}:</span>{" "}
                      {email.subject || "(no subject)"}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="mt-2 mb-3 text-sm text-foreground">
                    {email.bodyHtml ? (
                      <div
                        className="prose prose-sm prose-invert max-w-none overflow-auto"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.bodyHtml) }}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-muted">
                        {email.bodyText || ""}
                      </pre>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openCompose("reply", email)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground px-3 py-1.5 rounded-lg border border-card-border hover:bg-card-border/30 transition-colors"
                    >
                      <ReplyIcon />
                      {t("reply")}
                    </button>
                    <button
                      onClick={() => openCompose("forward", email)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground px-3 py-1.5 rounded-lg border border-card-border hover:bg-card-border/30 transition-colors"
                    >
                      <ForwardIcon />
                      {t("forward")}
                    </button>
                    <button
                      onClick={() => handleDelete(email.id)}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors ml-auto"
                    >
                      <TrashIcon />
                      {t("delete")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Compose overlay */}
      {compose.mode && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
          <div className="bg-card-bg border border-card-border rounded-xl shadow-2xl w-full max-w-md pointer-events-auto">
            {/* Compose header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
              <span className="text-sm font-semibold">
                {compose.mode === "reply"
                  ? t("reply")
                  : compose.mode === "forward"
                  ? t("forward")
                  : t("newEmail")}
              </span>
              <button
                onClick={() => setCompose({ mode: null, to: "", subject: "", body: "", inReplyTo: null })}
                className="text-muted hover:text-foreground transition-colors"
              >
                <XIcon />
              </button>
            </div>

            {/* Compose fields */}
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">{t("to")}</label>
                <input
                  type="email"
                  value={compose.to}
                  onChange={(e) => setCompose((prev) => ({ ...prev, to: e.target.value }))}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors"
                  placeholder="recipient@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">{t("subject")}</label>
                <input
                  type="text"
                  value={compose.subject}
                  onChange={(e) => setCompose((prev) => ({ ...prev, subject: e.target.value }))}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors"
                  placeholder="Subject..."
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Message</label>
                <textarea
                  value={compose.body}
                  onChange={(e) => setCompose((prev) => ({ ...prev, body: e.target.value }))}
                  rows={6}
                  className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none"
                  placeholder="Type your message..."
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSend}
                  disabled={sending || !compose.to.trim() || !compose.body.trim()}
                  className="flex items-center gap-1.5 text-sm bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {sending ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : null}
                  {t("send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
