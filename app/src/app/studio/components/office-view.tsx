"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import type { OfficeAgent, InfraData } from "./office-canvas";
import { useStudioEvents } from "../hooks/use-studio-events";
import type { ApiAgent } from "../hooks/use-studio-events";

// ---------- Terminal Panel ----------
function TerminalPanel() {
  const [connected, setConnected] = useState(false);
  const [height, setHeight] = useState(500);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    if (!connected) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientY - dragRef.current.startY;
      setHeight(Math.max(200, Math.min(900, dragRef.current.startH + delta)));
    };
    const onMouseUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [connected]);

  return (
    <div className="rounded-xl border border-card-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-card-bg border-b border-card-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-slate-500"}`} />
          Claude Code — VPS
        </h3>
        <div className="flex items-center gap-3">
          {connected && (
            <button onClick={() => setConnected(false)} className="text-xs text-muted hover:text-red-400 transition-colors">
              Disconnect
            </button>
          )}
          <a href="http://10.0.0.10:7681" target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-accent transition-colors">
            Open in new tab ↗
          </a>
        </div>
      </div>
      {connected ? (
        <>
          <iframe
            src="http://10.0.0.10:7681"
            className="w-full bg-black"
            style={{ height }}
            allow="clipboard-read; clipboard-write"
          />
          <div
            onMouseDown={(e) => { dragRef.current = { startY: e.clientY, startH: height }; }}
            className="h-1.5 bg-card-bg hover:bg-accent/30 cursor-row-resize transition-colors"
          />
        </>
      ) : (
        <button
          onClick={() => setConnected(true)}
          className="w-full py-8 bg-black/50 text-muted hover:text-foreground hover:bg-black/70 transition-colors flex flex-col items-center gap-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
          <span className="text-sm">Connect to terminal</span>
        </button>
      )}
    </div>
  );
}

// Load PixiJS canvas only on client (no SSR)
const OfficeCanvas = dynamic(() => import("./office-canvas"), { ssr: false });

// ---------- Constants (mirrors office-canvas.tsx) ----------

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 624;

const DESK_POSITIONS = [
  // Row 1 — upper workspace row
  { x: 82,  y: 130 },
  { x: 178, y: 130 },
  { x: 274, y: 130 },
  { x: 382, y: 130 },
  // Row 2 — lower workspace row
  { x: 65,  y: 255 },
  { x: 158, y: 255 },
  { x: 248, y: 255 },
  { x: 338, y: 255 },
];

// ---------- Types ----------

interface Tooltip {
  agent: OfficeAgent;
  x: number;
  y: number;
}

interface HoverTooltip {
  agent: OfficeAgent;
  x: number;
  y: number;
}

// ---------- Helpers ----------

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

// ---------- AgentOverlay Component ----------

interface AgentOverlayProps {
  agents: OfficeAgent[];
}

function AgentOverlay({ agents }: AgentOverlayProps) {
  const workingAgents = agents
    .map((agent, idx) => ({ agent, idx }))
    .filter(({ agent }) => agent.currentTask !== null);

  return (
    <>
      {workingAgents.map(({ agent, idx }) => {
        const deskIdx = idx % DESK_POSITIONS.length;
        const pos = DESK_POSITIONS[deskIdx];

        // Convert canvas coordinates to percentage-based CSS
        const leftPct = (pos.x / CANVAS_WIDTH) * 100;
        // Place overlay above the agent circle (agent is at pos.y, circle radius ~18*1.4=25px)
        // Offset upward by ~60px in canvas-space to clear the agent
        const topPct = ((pos.y - 60) / CANVAS_HEIGHT) * 100;

        const taskLabel = truncate(agent.currentTask!.title, 20);

        return (
          <div
            key={agent.id}
            className="absolute pointer-events-none"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: "translateX(-50%)",
            }}
          >
            {/* Task title badge + pulsing dot */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="bg-black/60 text-white text-[10px] leading-tight rounded px-1.5 py-0.5 max-w-[100px] truncate whitespace-nowrap">
                {taskLabel}
              </div>
              {/* Pulsing activity dot */}
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------- InfraOverlay Component ----------

interface InfraOverlayProps {
  infra: InfraData;
}

function cpuColor(pct: number): string {
  if (pct < 60) return "#22c55e";
  if (pct < 85) return "#eab308";
  return "#ef4444";
}

function ramColor(pct: number): string {
  if (pct < 70) return "#22c55e";
  if (pct < 88) return "#eab308";
  return "#ef4444";
}

function diskColor(pct: number): string {
  if (pct < 75) return "#22c55e";
  if (pct < 90) return "#eab308";
  return "#ef4444";
}

function fmtUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function InfraOverlay({ infra }: InfraOverlayProps) {
  const { system, database, nasOnline } = infra;

  const ramPct = system.memTotalMb > 0 ? (system.memUsedMb / system.memTotalMb) * 100 : 0;
  const diskPct = system.diskTotalGb > 0 ? (system.diskUsedGb / system.diskTotalGb) * 100 : 0;

  const ramUsed =
    system.memUsedMb >= 1024
      ? `${(system.memUsedMb / 1024).toFixed(1)}G`
      : `${system.memUsedMb}M`;
  const ramTotal =
    system.memTotalMb >= 1024
      ? `${(system.memTotalMb / 1024).toFixed(0)}G`
      : `${system.memTotalMb}M`;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ bottom: "3px", left: "4px", right: "4px" }}
    >
      <div className="bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1.5 flex flex-row items-center gap-3 flex-wrap">
        {/* CPU gauge */}
        <div className="flex flex-col gap-0.5 min-w-[52px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] text-white/60 uppercase tracking-wide leading-none">CPU</span>
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: cpuColor(system.cpuPercent) }}
            >
              {system.cpuPercent.toFixed(0)}%
            </span>
          </div>
          <MiniBar value={system.cpuPercent} color={cpuColor(system.cpuPercent)} />
        </div>

        {/* RAM gauge */}
        <div className="flex flex-col gap-0.5 min-w-[60px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] text-white/60 uppercase tracking-wide leading-none">RAM</span>
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: ramColor(ramPct) }}
            >
              {ramUsed}/{ramTotal}
            </span>
          </div>
          <MiniBar value={ramPct} color={ramColor(ramPct)} />
        </div>

        {/* Disk gauge */}
        <div className="flex flex-col gap-0.5 min-w-[60px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] text-white/60 uppercase tracking-wide leading-none">Disk</span>
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: diskColor(diskPct) }}
            >
              {system.diskUsedGb.toFixed(0)}/{system.diskTotalGb.toFixed(0)}G
            </span>
          </div>
          <MiniBar value={diskPct} color={diskColor(diskPct)} />
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-white/15 hidden sm:block" />

        {/* DB status */}
        <div className="flex items-center gap-1.5">
          {(["postgres", "pgbouncer", "redis"] as const).map((key) => (
            <span key={key} className="flex items-center gap-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ backgroundColor: database[key] ? "#22c55e" : "#ef4444" }}
              />
              <span className="text-[9px] text-white/50 leading-none">
                {key === "pgbouncer" ? "pgb" : key}
              </span>
            </span>
          ))}
        </div>

        {/* NAS */}
        <span className="flex items-center gap-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ backgroundColor: nasOnline ? "#22c55e" : "#ef4444" }}
          />
          <span className="text-[9px] text-white/50 leading-none">nas</span>
        </span>

        {/* Uptime */}
        <span className="text-[9px] text-white/40 leading-none ml-auto">
          up {fmtUptime(system.uptimeSecs)}
        </span>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function mapApiAgent(a: ApiAgent): OfficeAgent {
  const activeTask = a.tasks.find((t) => t.status === "IN_PROGRESS") ?? null;
  const workingCount = a.tasks.filter((t) => t.status === "IN_PROGRESS").length;
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    description: a.description,
    role: a.role,
    color: a.color,
    avatarUrl: a.avatarUrl ?? null,
    isActive: a.isActive,
    workingCount: workingCount > 0 ? workingCount : 0,
    currentTask: activeTask
      ? { id: activeTask.id, title: activeTask.title, status: activeTask.status }
      : null,
  };
}

// ---------- Component ----------

export default function OfficeView() {
  const { agents: rawAgents, activities, connected, lastUpdated } = useStudioEvents();

  const agents = rawAgents.map(mapApiAgent);

  const [infra, setInfra] = useState<InfraData | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const [loading, setLoading] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInfra = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/infra");
      if (res.ok) {
        const data: InfraData = await res.json();
        setInfra(data);
      }
    } catch {
      // ignore network errors
    }
  }, []);

  // Infra still uses polling (less critical, 30s interval)
  useEffect(() => {
    fetchInfra();
    const interval = setInterval(fetchInfra, 30_000);
    return () => clearInterval(interval);
  }, [fetchInfra]);

  // Remove loading state once we have agents from SSE/polling
  useEffect(() => {
    if (rawAgents.length > 0) {
      setLoading(false);
    }
  }, [rawAgents]);

  // Fallback: clear loading after 5s even with no agents
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5_000);
    return () => clearTimeout(t);
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAgentClick = useCallback((agent: OfficeAgent, x: number, y: number) => {
    setTooltip((prev) => (prev?.agent.id === agent.id ? null : { agent, x, y }));
  }, []);

  const handleAgentHover = useCallback((agent: OfficeAgent | null, x: number, y: number) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!agent) {
      setHoverTooltip(null);
      return;
    }
    hoverTimerRef.current = setTimeout(() => {
      setHoverTooltip({ agent, x, y });
    }, 300);
  }, []);

  const workingCount = agents.filter((a) => a.currentTask).length;
  const idleCount = agents.length - workingCount;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Virtual Office</h2>
            {/* SSE connection indicator */}
            <span
              title={connected ? "Live updates active" : "Reconnecting..."}
              className="flex items-center"
            >
              <span
                className={`w-2 h-2 rounded-full inline-block transition-colors ${
                  connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              <span className="text-muted">{workingCount} working</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
              <span className="text-muted">{idleCount} idle</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Main layout: canvas left + agents right on wide screens, stacked on smaller */}
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Canvas container */}
        <div
          ref={containerRef}
          className="relative w-full max-w-[512px] flex-shrink-0 rounded-xl border border-card-border overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center h-64 bg-card-bg">
              <div className="flex flex-col items-center gap-3 text-muted">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <span className="text-sm">Loading office...</span>
              </div>
            </div>
          ) : (
            <div className="relative w-full" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}>
              <OfficeCanvas agents={agents} infra={infra} onAgentClick={handleAgentClick} onAgentHover={handleAgentHover} />
              <AgentOverlay agents={agents} />
              {infra && <InfraOverlay infra={infra} />}
            </div>
          )}

          {/* Click tooltip — detailed info */}
          {tooltip && (
            <div
              ref={tooltipRef}
              className="fixed z-50 bg-card-bg border border-card-border rounded-xl shadow-xl p-4 w-72 text-sm pointer-events-auto"
              style={{
                left: Math.min(tooltip.x + 12, window.innerWidth - 300),
                top: Math.min(tooltip.y + 12, window.innerHeight - 200),
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-foreground">{tooltip.agent.displayName}</div>
                  <div className="text-xs text-muted mt-0.5 capitalize">{tooltip.agent.role}</div>
                </div>
                <button
                  onClick={() => setTooltip(null)}
                  className="text-muted hover:text-foreground transition-colors text-lg leading-none"
                >
                  &times;
                </button>
              </div>
              <div className="border-t border-card-border pt-3">
                {tooltip.agent.currentTask ? (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
                      <span className="text-xs font-medium text-green-400">Working</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{tooltip.agent.currentTask.title}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                    <span className="text-xs text-muted">Idle</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hover tooltip */}
          {hoverTooltip && !tooltip && (
            <div
              className="fixed z-40 bg-card-bg/90 backdrop-blur-sm border border-card-border rounded-lg shadow-lg px-3 py-2 text-sm pointer-events-none"
              style={{
                left: Math.min(hoverTooltip.x + 14, window.innerWidth - 220),
                top: Math.min(hoverTooltip.y + 14, window.innerHeight - 80),
              }}
            >
              <div className="font-semibold text-foreground text-xs">{hoverTooltip.agent.displayName}</div>
              <div className="text-xs text-muted capitalize">{hoverTooltip.agent.role}</div>
              <div className="flex items-center gap-1.5 mt-1">
                {hoverTooltip.agent.currentTask ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse flex-shrink-0" />
                    <span className="text-xs text-muted truncate max-w-[160px]">
                      Working: {hoverTooltip.agent.currentTask.title}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block flex-shrink-0" />
                    <span className="text-xs text-muted">Idle</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Agent list — beside canvas on xl, below on smaller */}
        <div className="w-full xl:flex-1 xl:min-w-0">
          <div className="rounded-xl border border-card-border bg-card-bg p-4 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Agents</h3>
              <a
                href="/admin/agents"
                className="text-xs text-muted hover:text-accent transition-colors"
                title="Configure agents"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1">
              {agents.map((agent) => {
                const avatarId = agent.avatarUrl && /^\d{2}$/.test(agent.avatarUrl) ? agent.avatarUrl : null;
                return (
                  <div
                    key={agent.id}
                    onClick={() => {
                      setTooltip((prev) =>
                        prev?.agent.id === agent.id
                          ? null
                          : { agent, x: window.innerWidth / 2 - 144, y: window.innerHeight / 2 - 80 }
                      );
                    }}
                    className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-card-bg-hover border border-transparent hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    {avatarId ? (
                      <img
                        src={`/assets/office/characters/previews/preview_${avatarId}_front.png`}
                        alt={agent.displayName}
                        className="w-8 h-12 flex-shrink-0 image-rendering-pixelated"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="w-8 h-8 flex-shrink-0 rounded bg-card-bg-hover flex items-center justify-center text-lg">
                        {agent.avatarUrl || "🤖"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground">{agent.displayName}</span>
                      {" "}
                      <span className="text-xs text-muted leading-relaxed">{agent.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Terminal — Claude Code on VPS */}
      <TerminalPanel />

    </div>
  );
}
