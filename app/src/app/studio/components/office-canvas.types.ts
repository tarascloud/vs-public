import type * as PIXI from "pixi.js";

// ---------- Public types (used by parent components) ----------

export interface InfraData {
  system: {
    cpuPercent: number;
    memUsedMb: number;
    memTotalMb: number;
    diskUsedGb: number;
    diskTotalGb: number;
    uptimeSecs: number;
  };
  services: Array<{ name: string; ok: boolean; responseMs: number }>;
  containers: Array<{ name: string; state: string; health: string }>;
  nasOnline: boolean;
  database: { postgres: boolean; pgbouncer: boolean; redis: boolean };
}

export interface OfficeAgent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  color: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  /** Number of concurrent IN_PROGRESS tasks for this agent (1 = single instance, N = N sprites) */
  workingCount?: number;
  currentTask: {
    id: string;
    title: string;
    status: string;
    initiativeId?: string | null;
    blockedByAgentIds?: string[];
  } | null;
}

// ---------- Internal types (used by canvas internals) ----------

export type AgentState = "idle" | "walking" | "working";
export type AgentDirection = "front" | "back" | "left" | "right";

export interface AgentSprite {
  container: PIXI.Container;
  circle: PIXI.Graphics;
  label: PIXI.Text;
  statusDot: PIXI.Graphics;
  bubble?: PIXI.Container;
  bubbleFadeProgress: number;
  state: AgentState;
  targetX: number;
  targetY: number;
  deskIndex: number;
  walkProgress: number;
  startX: number;
  startY: number;
  /** Multi-segment walk path: [[x,y], [x,y], ...] */
  waypoints: [number, number][];
  /** Index of current segment in waypoints (walking from waypoints[wpIdx] to waypoints[wpIdx+1]) */
  wpIdx: number;
  bobOffset: number;
  bobSpeed: number;
  typingSparks: PIXI.Graphics;
  blockedBang: PIXI.Text;
  chatBubble: PIXI.Container;
  chatBubbleVisible: boolean;
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  /** Reference to the PIXI.Sprite for directional texture swapping */
  characterSprite: PIXI.Sprite | null;
  /** Two-digit avatar ID (e.g. "01") for loading directional previews */
  avatarId: string | null;
}

export interface OfficeCanvasProps {
  agents: OfficeAgent[];
  infra: InfraData | null;
  onAgentClick: (agent: OfficeAgent, x: number, y: number) => void;
  onAgentHover?: (agent: OfficeAgent | null, x: number, y: number) => void;
}

export interface LedState {
  color: number;
  nextFlip: number;
}
