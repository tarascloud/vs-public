"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ActivityItem } from "../components/activity-feed";

// ---------- Types ----------

export interface ApiAgent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  color: string | null;
  avatarUrl: string | null;
  isActive: boolean;
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

export interface TaskStats {
  TODO: number;
  IN_PROGRESS: number;
  BLOCKED: number;
  TESTING: number;
  DONE: number;
}

export interface StudioEventsState {
  agents: ApiAgent[];
  activities: ActivityItem[];
  taskStats: TaskStats | null;
  connected: boolean;
  lastUpdated: Date | null;
}

// ---------- Constants ----------

const FALLBACK_POLL_INTERVAL = 10_000;
const BASE_RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_DELAY = 30_000;

function isSseSupported(): boolean {
  return typeof window !== "undefined" && "EventSource" in window;
}

// ---------- Hook ----------

export function useStudioEvents(): StudioEventsState {
  const [state, setState] = useState<StudioEventsState>({
    agents: [],
    activities: [],
    taskStats: null,
    connected: false,
    lastUpdated: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

  // ---------- Fetch data from REST APIs ----------
  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const [statusRes, activityRes] = await Promise.all([
        fetch("/api/studio/status"),
        fetch("/api/studio/activity"),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (Array.isArray(data.agents)) {
          setState((prev) => ({
            ...prev,
            agents: data.agents as ApiAgent[],
            taskStats: data.taskStats ?? prev.taskStats,
            lastUpdated: new Date(),
          }));
        }
      }
      if (activityRes.ok) {
        const activities: ActivityItem[] = await activityRes.json();
        if (Array.isArray(activities)) {
          setState((prev) => ({ ...prev, activities, lastUpdated: new Date() }));
        }
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, []);

  // ---------- Polling fallback ----------
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    fetchData(); // Immediate first call
    pollTimerRef.current = setInterval(fetchData, FALLBACK_POLL_INTERVAL);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ---------- SSE connection ----------
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource("/api/studio/events");
    esRef.current = es;

    // SSE now sends lightweight "refresh" signals — fetch full data via REST
    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const payload = JSON.parse(e.data) as { type: string };
        if (payload.type === "refresh") {
          fetchData();
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttempts.current = 0;
      stopPolling();
      // Fetch initial data when SSE connects
      fetchData();
      setState((prev) => ({ ...prev, connected: true }));
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, connected: false }));
      es.close();
      esRef.current = null;

      // Exponential backoff reconnect
      reconnectAttempts.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY * 2 ** (reconnectAttempts.current - 1),
        MAX_RECONNECT_DELAY,
      );

      // Start polling as fallback while SSE is reconnecting
      startPolling();

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectSSE();
        }
      }, delay);
    };
  }, [fetchData, startPolling, stopPolling]);

  // ---------- Mount / Unmount ----------
  useEffect(() => {
    mountedRef.current = true;

    if (isSseSupported()) {
      connectSSE();
    } else {
      // Browser doesn't support SSE — fall back to polling permanently
      startPolling();
    }

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      stopPolling();
    };
  }, [connectSSE, startPolling, stopPolling]);

  return state;
}
