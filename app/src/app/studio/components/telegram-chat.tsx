"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";

// ---------- Types ----------

interface TelegramConversation {
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface TelegramMessage {
  id: string;
  chatId: string;
  direction: "INCOMING" | "OUTGOING";
  text: string;
  sentAt: string;
  createdAt: string;
}

// ---------- Helpers ----------

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function displayName(conv: TelegramConversation): string {
  if (conv.firstName || conv.lastName) {
    return [conv.firstName, conv.lastName].filter(Boolean).join(" ");
  }
  return conv.username ? `@${conv.username}` : conv.chatId;
}

// ---------- Component ----------

export default function TelegramChat() {
  const t = useTranslations("communication");

  const [conversations, setConversations] = useState<TelegramConversation[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/telegram/messages");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setConversations(data);
    } catch {
      // ignore
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const fetchMessages = useCallback(async (chatId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/telegram/messages/${chatId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch {
      // ignore
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedChatId) {
        fetchMessages(selectedChatId);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchMessages, selectedChatId]);

  const handleSelectConversation = (chatId: string) => {
    setSelectedChatId(chatId);
    setMessages([]);
    fetchMessages(chatId);
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedChatId || sending) return;
    const text = newMessage.trim();
    setSending(true);
    try {
      const res = await fetch(`/api/telegram/messages/${selectedChatId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setNewMessage("");
        await fetchMessages(selectedChatId);
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedConv = conversations.find((c) => c.chatId === selectedChatId) ?? null;

  return (
    <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden flex h-[600px]">
      {/* Left panel: Conversation list */}
      <div className="w-1/3 border-r border-card-border flex flex-col">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("conversations")}</h2>
          {loadingConvs && (
            <svg className="w-3.5 h-3.5 animate-spin text-muted" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-card-border">
          {conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted text-sm">{t("noConversations")}</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.chatId}
                onClick={() => handleSelectConversation(conv.chatId)}
                className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors hover:bg-card-border/20 ${
                  selectedChatId === conv.chatId ? "bg-accent/10 border-l-2 border-l-accent" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-medium truncate ${
                      selectedChatId === conv.chatId ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {displayName(conv)}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conv.unreadCount > 0 && (
                      <span className="text-xs w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center leading-none">
                        {conv.unreadCount}
                      </span>
                    )}
                    {conv.lastMessageAt && (
                      <span className="text-xs text-muted">{formatDate(conv.lastMessageAt)}</span>
                    )}
                  </div>
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-muted truncate">{conv.lastMessage}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Messages */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConv ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-card-border">
              <h3 className="text-sm font-semibold">{displayName(selectedConv)}</h3>
              {selectedConv.username && (
                <p className="text-xs text-muted">@{selectedConv.username}</p>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <svg className="w-5 h-5 animate-spin text-muted" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "OUTGOING" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                        msg.direction === "OUTGOING"
                          ? "bg-accent/15 text-foreground rounded-br-sm"
                          : "bg-card-border/30 text-foreground rounded-bl-sm"
                      }`}
                    >
                      <p className="break-words">{msg.text}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.direction === "OUTGOING" ? "text-accent/60 text-right" : "text-muted"
                        }`}
                      >
                        {formatTime(msg.sentAt || msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-card-border flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={t("typeMessage")}
                className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none"
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
                className="flex-shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
              >
                {sending ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-sm">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
