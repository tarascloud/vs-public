import * as PIXI from "pixi.js";
import type {
  InfraData,
  OfficeAgent,
  AgentState,
  AgentDirection,
  AgentSprite,
} from "./office-canvas.types";

// ---------- Constants ----------

export const CANVAS_WIDTH = 512;
export const CANVAS_HEIGHT = 624;
export const AGENT_RADIUS = 12;
export const AGENT_SCALE = 1.0;

// Server room bounds
export const SERVER_Y = 544;
export const SERVER_H = 80;

// Idle agent positions -- lounge area
export const DEFAULT_LOUNGE_POSITIONS = [
  { x: 100, y: 410 },
  { x: 160, y: 440 },
  { x:  80, y: 460 },
  { x: 200, y: 415 },
  { x: 370, y: 400 },
  { x: 430, y: 430 },
  { x: 460, y: 400 },
  { x: 400, y: 460 },
];

// Desk positions -- mapped to workstations on office-bg.png (512x544)
export const DEFAULT_DESK_POSITIONS = [
  { x:  82, y: 130 },
  { x: 178, y: 130 },
  { x: 274, y: 130 },
  { x: 382, y: 130 },
  { x:  65, y: 255 },
  { x: 158, y: 255 },
  { x: 248, y: 255 },
  { x: 338, y: 255 },
];

// Passage center between workspace and lounge (row 10, cols 6-9)
const PASSAGE_X = 256;
const PASSAGE_Y = 340;

export const RACK_LED_COUNT = 6;

// ---------- Walk path builder ----------

/** Build waypoints for walking between lounge and desk areas via the passage */
export function buildWalkPath(
  fromX: number, fromY: number,
  toX: number, toY: number,
): [number, number][] {
  const DIVIDER_Y = 320;
  const crossesDivider =
    (fromY < DIVIDER_Y && toY > DIVIDER_Y) ||
    (fromY > DIVIDER_Y && toY < DIVIDER_Y);

  if (!crossesDivider) {
    return [[fromX, fromY], [toX, toY]];
  }

  if (fromY > DIVIDER_Y) {
    return [
      [fromX, fromY],
      [PASSAGE_X, PASSAGE_Y],
      [PASSAGE_X, DIVIDER_Y - 20],
      [toX, toY],
    ];
  } else {
    return [
      [fromX, fromY],
      [PASSAGE_X, DIVIDER_Y - 20],
      [PASSAGE_X, PASSAGE_Y],
      [toX, toY],
    ];
  }
}

// ---------- Agent colors ----------

const AGENT_COLORS: Record<string, number> = {
  developer:          0x3b82f6,
  architect:          0x8b5cf6,
  tester:             0x22c55e,
  devsecops:          0xf97316,
  devops:             0xf97316,
  security:           0xef4444,
  smm:                0xec4899,
  trader:             0xeab308,
  coo:                0xf59e0b,
  accountant:         0x14b8a6,
  ceo:                0xf59e0b,
  "product-owner":    0x06b6d4,
  "network-engineer": 0x84cc16,
  "release-manager":  0xa78bfa,
  cat:                0xfb923c,
};

export function getAgentColor(agent: OfficeAgent): number {
  if (agent.color) {
    const hex = agent.color.replace("#", "");
    return parseInt(hex, 16);
  }
  const key = Object.keys(AGENT_COLORS).find(
    (k) => agent.name.toLowerCase().includes(k) || agent.role.toLowerCase().includes(k)
  );
  return key ? AGENT_COLORS[key] : 0x64748b;
}

// ---------- Pixel art drawing helpers ----------

export function px(g: PIXI.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.rect(x, y, w, h).fill({ color, alpha });
}

// ---------- Server room static pixel art ----------

function drawServerRack(g: PIXI.Graphics, x: number, y: number, w: number, h: number) {
  px(g, x, y, w, h, 0x1E293B);
  px(g, x + 1, y + 1, w - 2, h - 2, 0x0F172A);
  px(g, x, y, w, 2, 0x334155);
  px(g, x, y + h - 2, w, 2, 0x334155);
  px(g, x, y, 2, h, 0x334155);
  px(g, x + w - 2, y, 2, h, 0x334155);
  for (let ry = y + 8; ry < y + h - 4; ry += 10) {
    px(g, x + 2, ry, w - 4, 1, 0x1E3A5C, 0.8);
  }
  px(g, x + 3, y + 2, 4, h - 4, 0x1E3A5C);
  px(g, x + w - 7, y + 2, 4, h - 4, 0x1E3A5C);
  for (let vy = y + 5; vy < y + h - 5; vy += 7) {
    px(g, x + w - 6, vy, 4, 4, 0x0F172A);
    px(g, x + w - 5, vy + 1, 2, 2, 0x334155, 0.4);
  }
}

function drawCoolingUnit(g: PIXI.Graphics, x: number, y: number) {
  px(g, x, y, 34, 44, 0x1E3A5C);
  px(g, x + 1, y + 1, 32, 42, 0x0F2A4C);
  px(g, x + 6, y + 6, 22, 22, 0x0F172A);
  px(g, x + 16, y + 8, 3, 18, 0x1E3A8A, 0.6);
  px(g, x + 8,  y + 17, 18, 3, 0x1E3A8A, 0.6);
  px(g, x + 15, y + 16, 4, 4, 0x334155);
  px(g, x + 3, y + 32, 6, 4, 0x22C55E);
  px(g, x + 12, y + 32, 6, 4, 0x3B82F6);
  for (let i = 0; i < 3; i++) {
    px(g, x + 3 + i * 9, y + 39, 6, 3, 0x0F172A);
  }
  px(g, x, y, 34, 2, 0x334155);
  px(g, x, y, 2, 44, 0x334155);
}

export function drawServerRoom(g: PIXI.Graphics) {
  const sx = 0;
  const sy = SERVER_Y;
  const sw = CANVAS_WIDTH;
  const sh = SERVER_H;

  px(g, sx, sy, sw, sh, 0x0F172A);

  const tileSize = 18;
  for (let tx = sx; tx < sx + sw; tx += tileSize) {
    for (let ty = sy; ty < sy + sh; ty += tileSize) {
      px(g, tx, ty, tileSize - 1, tileSize - 1, 0x1A2744, 0.6);
      px(g, tx + 1, ty + 1, 4, 1, 0x2A3A5A, 0.4);
      px(g, tx + 1, ty + 1, 1, 4, 0x2A3A5A, 0.4);
    }
  }

  px(g, sx, sy, sw, 6, 0x1E3A8A, 0.15);
  px(g, sx, sy, sw, 2, 0x3B82F6, 0.1);

  const rackW = 110;
  const rackGap = 60;
  const totalRackWidth = rackW * 2 + rackGap;
  const rackStartX = (sw - totalRackWidth - 80) / 2 + 20;
  drawServerRack(g, rackStartX, sy + 10, rackW, sh - 16);
  drawServerRack(g, rackStartX + rackW + rackGap, sy + 10, rackW, sh - 16);
  drawCoolingUnit(g, rackStartX + totalRackWidth + 30, sy + 18);

  px(g, rackStartX - 2, sy + 8, totalRackWidth + 80, 3, 0x334155);
  px(g, rackStartX + rackW, sy + 10, rackGap, 2, 0x22C55E, 0.7);
  px(g, rackStartX + rackW, sy + 12, rackGap, 2, 0x3B82F6, 0.7);
  px(g, rackStartX + totalRackWidth, sy + 10, 30, 2, 0x22C55E, 0.7);
  px(g, rackStartX - 2, sy + sh - 10, totalRackWidth + 80, 5, 0x1E2A3E);
  px(g, rackStartX - 2, sy + sh - 9,  totalRackWidth + 80, 2, 0x334155, 0.3);
}

// ---------- Dynamic server status overlay ----------

const RACK1_SERVICES = ["pd-prod", "pd-dev", "website", "jobfinder", "ollama", "status"];
const RACK2_INFRA    = ["pg", "pgbouncer", "redis", "cloudflared", "freqtrade", "stalwart"];

function ledColor(ok: boolean | undefined, running: boolean, hasHealth: boolean): number {
  if (!running) return 0xEF4444;
  if (!ok && ok !== undefined) return 0xEF4444;
  if (!hasHealth) return 0x3B82F6;
  return 0x22C55E;
}

export function drawServerStatus(container: PIXI.Container, infra: InfraData, time: number) {
  container.removeChildren();

  const rackW = 110;
  const rackGap = 60;
  const totalRackWidth = rackW * 2 + rackGap;
  const sx = (CANVAS_WIDTH - totalRackWidth - 80) / 2 + 20;
  const sy = SERVER_Y;

  const findContainer = (name: string) =>
    infra.containers.find((c) => c.name === name || c.name.includes(name));
  const findService = (name: string) =>
    infra.services.find((s) => s.name === name || s.name.includes(name));

  const r1x = sx + 3;
  const r1y = sy + 13;
  RACK1_SERVICES.forEach((svcName, i) => {
    const svc = findService(svcName);
    const ctr = findContainer(svcName);
    const running = ctr ? ctr.state === "running" : false;
    const hasHealth = ctr ? ctr.health === "healthy" : false;
    const ok = svc ? svc.ok : (running ? true : false);
    const slotY = r1y + i * 10;
    const baseAlpha = ok && running ? (0.7 + 0.3 * Math.sin(time * 1.8 + i * 0.7)) : 1;
    const blinkAlpha = (!running || !ok) ? (0.4 + 0.6 * Math.abs(Math.sin(time * 4 + i))) : baseAlpha;
    const led = new PIXI.Graphics();
    led.circle(r1x + 6, slotY + 5, 2.5).fill({ color: ledColor(ok, running, hasHealth), alpha: blinkAlpha });
    container.addChild(led);
    const nameLabel = new PIXI.Text({
      text: svcName,
      style: { fontSize: 7, fill: running ? 0xBFDBFE : 0x475569, fontFamily: "monospace", fontWeight: "bold" },
    });
    nameLabel.position.set(r1x + 12, slotY + 1);
    container.addChild(nameLabel);
  });

  const r2x = sx + rackW + rackGap + 3;
  const r2y = sy + 13;
  RACK2_INFRA.forEach((infraName, i) => {
    const ctr = findContainer(infraName);
    const running = ctr ? ctr.state === "running" : (infraName === "pg" ? infra.database.postgres : infraName === "pgbouncer" ? infra.database.pgbouncer : infraName === "redis" ? infra.database.redis : false);
    const hasHealth = ctr ? ctr.health === "healthy" : running;
    const ok = infraName === "pg" ? infra.database.postgres : infraName === "pgbouncer" ? infra.database.pgbouncer : infraName === "redis" ? infra.database.redis : running;
    const slotY = r2y + i * 10;
    const baseAlpha = running ? (0.7 + 0.3 * Math.sin(time * 1.5 + i * 0.9 + 1)) : 1;
    const blinkAlpha = !running ? (0.4 + 0.6 * Math.abs(Math.sin(time * 4 + i + 1))) : baseAlpha;
    const led = new PIXI.Graphics();
    led.circle(r2x + 6, slotY + 5, 2.5).fill({ color: ledColor(ok, running, hasHealth), alpha: blinkAlpha });
    container.addChild(led);
    const nameLabel = new PIXI.Text({
      text: infraName,
      style: { fontSize: 7, fill: running ? 0xBFDBFE : 0x475569, fontFamily: "monospace", fontWeight: "bold" },
    });
    nameLabel.position.set(r2x + 12, slotY + 1);
    container.addChild(nameLabel);
  });

  const panelX = sx + totalRackWidth + 30 + 38;
  const panelY = sy + 10;
  const barW = 46;
  const metricColor = (pct: number) => pct < 0.6 ? 0x22C55E : pct < 0.85 ? 0xF59E0B : 0xEF4444;

  function drawBar(label: string, value: number, max: number, py: number, barColor: (v: number) => number) {
    const pct = max > 0 ? Math.min(1, value / max) : 0;
    const bc = barColor(pct);
    const lbl = new PIXI.Text({ text: label, style: { fontSize: 7, fill: 0xBFDBFE, fontFamily: "monospace", fontWeight: "bold" } });
    lbl.position.set(panelX, py);
    container.addChild(lbl);
    const valLbl = new PIXI.Text({ text: max > 0 ? `${Math.round(pct * 100)}%` : "--", style: { fontSize: 7, fill: bc, fontFamily: "monospace", fontWeight: "bold" } });
    valLbl.position.set(panelX + 22, py);
    container.addChild(valLbl);
    const bgBar = new PIXI.Graphics();
    bgBar.rect(panelX, py + 7, barW, 4).fill({ color: 0x1E2A3E });
    container.addChild(bgBar);
    const fgBar = new PIXI.Graphics();
    fgBar.rect(panelX, py + 7, Math.max(1, Math.round(barW * pct)), 4).fill({ color: bc, alpha: 0.9 });
    container.addChild(fgBar);
  }

  drawBar("CPU", infra.system.cpuPercent, 100, panelY, metricColor);
  drawBar("RAM", infra.system.memUsedMb, infra.system.memTotalMb || 1, panelY + 14, metricColor);
  drawBar("DSK", infra.system.diskUsedGb, infra.system.diskTotalGb || 1, panelY + 28, metricColor);

  const dbY = panelY + 44;
  const dbItems: Array<{ ok: boolean; label: string }> = [
    { ok: infra.database.postgres,  label: "pg" },
    { ok: infra.database.pgbouncer, label: "pb" },
    { ok: infra.database.redis,     label: "rd" },
  ];
  dbItems.forEach(({ ok, label }, i) => {
    const dbColor = ok ? 0x22C55E : 0xEF4444;
    const dbAlpha = ok ? (0.65 + 0.35 * Math.sin(time * 1.4 + i * 1.1)) : (0.35 + 0.65 * Math.abs(Math.sin(time * 3.5 + i)));
    const led = new PIXI.Graphics();
    led.circle(panelX + i * 16 + 3, dbY + 4, 2.5).fill({ color: dbColor, alpha: dbAlpha });
    container.addChild(led);
    const lbl = new PIXI.Text({ text: label, style: { fontSize: 6, fill: ok ? 0x22C55E : 0xEF4444, fontFamily: "monospace" } });
    lbl.position.set(panelX + i * 16 - 1, dbY + 8);
    container.addChild(lbl);
  });

  const nasY = dbY + 20;
  const nasColor = infra.nasOnline ? 0x22C55E : 0xEF4444;
  const nasAlpha = infra.nasOnline ? (0.65 + 0.35 * Math.sin(time * 1.2)) : (0.35 + 0.65 * Math.abs(Math.sin(time * 4.0)));
  const nasLed = new PIXI.Graphics();
  nasLed.circle(panelX + 3, nasY + 4, 2.5).fill({ color: nasColor, alpha: nasAlpha });
  container.addChild(nasLed);
  const nasLbl = new PIXI.Text({ text: infra.nasOnline ? "NAS ok" : "NAS off", style: { fontSize: 7, fill: nasColor, fontFamily: "monospace", fontWeight: "bold" } });
  nasLbl.position.set(panelX + 9, nasY);
  container.addChild(nasLbl);

  if (!infra.nasOnline) {
    const flashBg = new PIXI.Graphics();
    flashBg.rect(panelX, nasY + 10, 48, 6).fill({ color: 0xEF4444, alpha: 0.15 + 0.25 * Math.abs(Math.sin(time * 4.0)) });
    container.addChild(flashBg);
  }

  const uptimeSecs = infra.system.uptimeSecs;
  const uptimeDays = Math.floor(uptimeSecs / 86400);
  const uptimeHrs = Math.floor((uptimeSecs % 86400) / 3600);
  const uptimeLbl = new PIXI.Text({ text: `up ${uptimeSecs > 0 ? `${uptimeDays}d ${uptimeHrs}h` : "--"}`, style: { fontSize: 6, fill: 0x475569, fontFamily: "monospace" } });
  uptimeLbl.position.set(panelX, nasY + 18);
  container.addChild(uptimeLbl);

  const srLabel = new PIXI.Text({ text: "SERVER ROOM", style: { fontSize: 8, fill: 0x334155, fontFamily: "monospace", letterSpacing: 2 } });
  srLabel.position.set(CANVAS_WIDTH / 2 - 40, SERVER_Y + 2);
  container.addChild(srLabel);
}

// ---------- Pixel art character sprites ----------

const SKIN = 0xFFDBA4;
const HAIR_DARK = 0x2C1810;
const HAIR_BROWN = 0x5C3317;
const HAIR_BLONDE = 0xD4A017;
const HAIR_PINK = 0xEC4899;
const PANTS_DARK = 0x1E293B;
const PANTS_CARGO = 0x2D3B2D;

export function drawCharacterPixels(g: PIXI.Graphics, role: string, accentColor: number) {
  const r = role.toLowerCase();

  if (r.includes("cat")) {
    px(g, -7,  2, 14, 10, accentColor);
    px(g, -9,  4, 18,  6, accentColor);
    px(g, -5,  0, 10,  4, accentColor);
    px(g, -5, 12,  4,  4, accentColor);
    px(g,  1, 12,  4,  4, accentColor);
    px(g, -5, -10, 10, 10, accentColor);
    px(g, -3, -12,  6,  4, 0xFFA050);
    px(g, -6, -14,  4,  4, accentColor);
    px(g,  2, -14,  4,  4, accentColor);
    px(g, -5, -15,  2,  2, 0xFFB0B0);
    px(g,  3, -15,  2,  2, 0xFFB0B0);
    px(g, -4,  -8,  2,  2, 0x1A1A1A);
    px(g,  2,  -8,  2,  2, 0x1A1A1A);
    px(g, -5,  -9,  4,  4, 0x888888, 0.6);
    px(g,  1,  -9,  4,  4, 0x888888, 0.6);
    px(g,  0,  -8,  2,  1, 0x888888);
    px(g, -9,  -7,  4,  1, 0xDDDDDD, 0.8);
    px(g, -9,  -5,  4,  1, 0xDDDDDD, 0.8);
    px(g,  5,  -7,  4,  1, 0xDDDDDD, 0.8);
    px(g,  5,  -5,  4,  1, 0xDDDDDD, 0.8);
    px(g, -1,  -6,  2,  2, 0xFF8080);
    px(g,  7,   4,  4,  2, accentColor);
    px(g,  9,   2,  4,  2, accentColor);
    px(g, 11,  -1,  2,  4, accentColor);
    return;
  }

  if (r.includes("architect")) {
    px(g, -5, -18, 10,  4, HAIR_DARK);
    px(g, -6, -16,  2,  6, HAIR_DARK);
    px(g,  4, -16,  2,  6, HAIR_DARK);
    px(g, -5, -14, 10, 10, SKIN);
    px(g, -5,  -9,  4,  3, 0x666666, 0.7);
    px(g,  1,  -9,  4,  3, 0x666666, 0.7);
    px(g,  0,  -9,  2,  1, 0x888888);
    px(g, -4,  -8,  2,  1, 0x87CEEB, 0.5);
    px(g,  2,  -8,  2,  1, 0x87CEEB, 0.5);
    px(g, -4,  -9,  2,  2, 0x2C1810);
    px(g,  2,  -9,  2,  2, 0x2C1810);
    px(g, -5,  -4, 10, 12, 0xEEEEEE);
    px(g, -5,  -4,  3, 12, accentColor);
    px(g,  2,  -4,  3, 12, accentColor);
    px(g, -2,  -4,  4,  3, 0xEEEEEE);
    px(g, -7,  -4,  2, 10, SKIN);
    px(g,  5,  -4,  2, 10, SKIN);
    px(g,  7,  -2,  4,  8, 0x93C5FD);
    px(g,  7,  -2,  1,  8, 0x3B82F6, 0.6);
    px(g,  7,  -2,  4,  1, 0x1D4ED8, 0.5);
    px(g,  7,   6,  4,  1, 0x1D4ED8, 0.5);
    px(g, -5,   8,  4,  8, PANTS_DARK);
    px(g,  1,   8,  4,  8, PANTS_DARK);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("developer") || r.includes("dev")) {
    px(g, -5, -18, 10,  4, HAIR_DARK);
    px(g, -7, -20,  3,  4, HAIR_DARK);
    px(g, -2, -21,  3,  5, HAIR_DARK);
    px(g,  3, -19,  3,  4, HAIR_DARK);
    px(g, -6, -16,  2,  6, HAIR_DARK);
    px(g,  4, -16,  2,  5, HAIR_DARK);
    px(g, -5, -14, 10, 10, SKIN);
    px(g, -4,  -9,  2,  2, 0x2C1810);
    px(g,  2,  -9,  2,  2, 0x2C1810);
    px(g, -6,  -4, 12, 12, accentColor);
    px(g, -5,  -5,  3,  4, 0x1D4ED8);
    px(g,  2,  -5,  3,  4, 0x1D4ED8);
    px(g, -1,  -5,  2,  2, SKIN);
    px(g, -3,   2,  6,  5, 0x1D4ED8);
    px(g, -6,  -5,  2,  4, 0x888888);
    px(g,  4,  -5,  2,  4, 0x888888);
    px(g, -5,  -6, 10,  2, 0x666666);
    px(g, -8,  -4,  2, 10, accentColor);
    px(g,  6,  -4,  2, 10, accentColor);
    px(g, -5,   8,  4,  8, PANTS_DARK);
    px(g,  1,   8,  4,  8, PANTS_DARK);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("tester")) {
    px(g, -5, -18, 10,  4, HAIR_BROWN);
    px(g, -6, -16,  2,  8, HAIR_BROWN);
    px(g,  4, -18,  4, 10, HAIR_BROWN);
    px(g,  7, -14,  2,  6, HAIR_BROWN);
    px(g, -4, -14,  8, 10, SKIN);
    px(g, -3,  -9,  2,  2, 0x2C1810);
    px(g,  1,  -9,  2,  2, 0x2C1810);
    px(g, -2,  -5,  4,  1, 0xC07050, 0.7);
    px(g, -4,  -4,  8, 12, accentColor);
    px(g, -1,  -4,  2,  3, 0x16A34A);
    px(g, -6,  -4,  2, 10, SKIN);
    px(g,  4,  -4,  2, 10, SKIN);
    px(g,  6,   2,  6,  6, 0x888888, 0.4);
    px(g,  7,   3,  4,  4, 0x87CEEB, 0.3);
    px(g,  9,   8,  2,  4, 0x888888);
    px(g, -4,   8,  3,  8, PANTS_DARK);
    px(g,  1,   8,  3,  8, PANTS_DARK);
    px(g, -4,   8,  8,  4, 0x374151);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("devsecops") || r.includes("devops") || r.includes("security")) {
    px(g, -6, -18, 12,  3, 0x1A1A1A);
    px(g, -5, -20, 10,  4, 0x222222);
    px(g, -7, -17,  2,  3, 0x1A1A1A);
    px(g,  5, -17,  2,  3, 0x1A1A1A);
    px(g, -5, -14, 10, 10, SKIN);
    px(g, -4,  -9,  2,  2, 0x2C1810);
    px(g,  2,  -9,  2,  2, 0x2C1810);
    px(g, -6,  -4, 12, 12, accentColor);
    px(g, -2,  -1,  4,  4, 0xFFFFFF, 0.8);
    px(g, -1,   0,  2,  3, 0x1E40AF, 0.9);
    px(g, -1,   3,  2,  1, 0x1E40AF, 0.7);
    px(g, -8,  -4,  2, 10, accentColor);
    px(g,  6,  -4,  2, 10, accentColor);
    px(g, -5,   8,  4,  8, PANTS_CARGO);
    px(g,  1,   8,  4,  8, PANTS_CARGO);
    px(g, -5,  10,  3,  3, 0x3D4B3D);
    px(g,  2,  10,  3,  3, 0x3D4B3D);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("coo") || r.includes("product") || r.includes("ceo")) {
    px(g, -5, -18, 10,  4, HAIR_BLONDE);
    px(g, -6, -16,  2, 10, HAIR_BLONDE);
    px(g,  4, -16,  2, 10, HAIR_BLONDE);
    px(g, -6, -14,  1,  2, HAIR_BLONDE, 0.7);
    px(g, -4, -14,  8, 10, SKIN);
    px(g, -3,  -9,  2,  2, 0x2C1810);
    px(g,  1,  -9,  2,  2, 0x2C1810);
    px(g, -2,  -5,  4,  2, 0xC05050, 0.7);
    px(g, -5,  -4, 10, 12, accentColor);
    px(g, -2,  -4,  4,  5, 0x0891B2);
    px(g, -5,  -4,  2,  6, 0x0891B2);
    px(g,  3,  -4,  2,  6, 0x0891B2);
    px(g, -1,  -4,  2,  6, 0xF8F8F8);
    px(g, -7,  -4,  2, 10, accentColor);
    px(g,  5,  -4,  2, 10, accentColor);
    px(g,  7,   0,  6,  8, 0x1A1A2E);
    px(g,  8,   1,  4,  6, 0x3B82F6);
    px(g,  8,   1,  4,  2, 0x93C5FD, 0.4);
    px(g, -4,   8,  8,  4, 0x374151);
    px(g, -4,  12,  3,  4, PANTS_DARK);
    px(g,  1,  12,  3,  4, PANTS_DARK);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("trader")) {
    px(g, -5, -18, 10,  4, HAIR_DARK);
    px(g, -6, -16,  2,  4, HAIR_DARK);
    px(g,  4, -16,  2,  4, HAIR_DARK);
    px(g, -5, -14, 10, 10, SKIN);
    px(g, -4,  -9,  2,  2, 0x2C1810);
    px(g,  2,  -9,  2,  2, 0x2C1810);
    px(g, -2,  -5,  4,  1, 0xC07050, 0.8);
    px(g, -5,  -4, 10, 12, 0xF0F0F0);
    px(g, -2,  -4,  4,  3, 0xE0E0E0);
    px(g, -1,  -3,  2,  8, accentColor);
    px(g, -2,   5,  4,  3, accentColor);
    px(g, -7,  -4,  2,  6, 0xF0F0F0);
    px(g, -7,   2,  2,  4, SKIN);
    px(g,  5,  -4,  2,  6, 0xF0F0F0);
    px(g,  5,   2,  2,  4, SKIN);
    px(g, -5,   8,  4,  8, PANTS_DARK);
    px(g,  1,   8,  4,  8, PANTS_DARK);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  if (r.includes("smm")) {
    px(g, -5, -18, 10,  4, HAIR_DARK);
    px(g, -6, -20,  4,  4, HAIR_PINK);
    px(g,  2, -19,  4,  3, HAIR_PINK);
    px(g, -6, -16,  2,  8, HAIR_DARK);
    px(g,  4, -16,  2,  8, HAIR_DARK);
    px(g, -4, -14,  8, 10, SKIN);
    px(g, -4,  -9,  3,  2, 0x2C1810);
    px(g,  1,  -9,  3,  2, 0x2C1810);
    px(g, -5,  -4, 10, 12, accentColor);
    px(g, -2,  -4,  4,  3, 0xDB2777);
    px(g, -7,  -4,  2,  8, SKIN);
    px(g,  5,  -2,  2,  8, SKIN);
    px(g,  7,   2,  4,  6, 0x1A1A2E);
    px(g,  8,   3,  2,  4, 0x7C3AED, 0.8);
    px(g, -4,   8,  3,  8, PANTS_DARK);
    px(g,  1,   8,  3,  8, PANTS_DARK);
    px(g, -1,   8,  2,  2, 0x0F172A);
    return;
  }

  // --- Generic / fallback ---
  px(g, -5, -18, 10,  4, HAIR_DARK);
  px(g, -6, -16,  2,  6, HAIR_DARK);
  px(g,  4, -16,  2,  6, HAIR_DARK);
  px(g, -5, -14, 10, 10, SKIN);
  px(g, -4,  -9,  2,  2, 0x2C1810);
  px(g,  2,  -9,  2,  2, 0x2C1810);
  px(g, -5,  -4, 10, 12, accentColor);
  px(g, -7,  -4,  2, 10, accentColor);
  px(g,  5,  -4,  2, 10, accentColor);
  px(g, -5,   8,  4,  8, PANTS_DARK);
  px(g,  1,   8,  4,  8, PANTS_DARK);
  px(g, -1,   8,  2,  2, 0x0F172A);
}

export const CHAR_BOTTOM = 16;

// ---------- Thought bubble ----------

const BUBBLE_Y_OFFSET = -52;
const BUBBLE_W = 100;
const BUBBLE_H = 22;
const BUBBLE_RADIUS = 5;

export function createThoughtBubble(taskTitle: string): PIXI.Container {
  const bubbleContainer = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const bx = -BUBBLE_W / 2;
  const by = BUBBLE_Y_OFFSET - BUBBLE_H;

  bg.roundRect(bx + 2, by + 2, BUBBLE_W, BUBBLE_H, BUBBLE_RADIUS).fill({ color: 0x000000, alpha: 0.18 });
  bg.roundRect(bx, by, BUBBLE_W, BUBBLE_H, BUBBLE_RADIUS).fill({ color: 0xF1F5F9, alpha: 1 });
  bg.roundRect(bx, by, BUBBLE_W, BUBBLE_H, BUBBLE_RADIUS).stroke({ color: 0xCBD5E1, width: 1 });

  const dotSizes = [3, 2.5, 2];
  const dotYOffsets = [BUBBLE_Y_OFFSET + 2, BUBBLE_Y_OFFSET + 7, BUBBLE_Y_OFFSET + 11];
  dotSizes.forEach((r, i) => {
    bg.circle(0, dotYOffsets[i], r).fill({ color: 0xF1F5F9, alpha: 1 });
    bg.circle(0, dotYOffsets[i], r).stroke({ color: 0xCBD5E1, width: 1 });
  });
  bubbleContainer.addChild(bg);

  const maxLen = 24;
  const rawText = taskTitle || "...";
  const displayText = rawText.length > maxLen ? rawText.slice(0, maxLen) + "..." : rawText;
  const text = new PIXI.Text({
    text: displayText,
    style: { fontSize: 8, fill: 0x1E293B, fontFamily: "monospace", wordWrap: false },
  });
  text.anchor.set(0.5, 0.5);
  text.position.set(0, by + BUBBLE_H / 2);
  bubbleContainer.addChild(text);
  bubbleContainer.alpha = 0;
  return bubbleContainer;
}

// ---------- Agent direction helpers ----------

/**
 * Determine which direction an agent should face based on their desk position.
 */
export function getDeskDirection(
  deskPos: { x: number; y: number },
  allDesks?: Array<{ x: number; y: number }>,
): AgentDirection {
  const desks = allDesks && allDesks.length > 0 ? allDesks : DEFAULT_DESK_POSITIONS;
  const xs = desks.map((d) => d.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const range = maxX - minX;
  if (range > 0 && deskPos.x - minX < range * 0.2) return "left";
  if (range > 0 && maxX - deskPos.x < range * 0.2) return "right";
  return "back";
}

/**
 * Load and apply a directional preview texture to an agent's character sprite.
 */
export function applyAgentDirection(sprite: AgentSprite, direction: AgentDirection): void {
  if (!sprite.characterSprite || !sprite.avatarId) return;
  const suffix = direction === "front" ? "" : `_${direction}`;
  const url = `/assets/office/characters/previews/preview_${sprite.avatarId}${suffix}.png`;
  PIXI.Assets.load(url)
    .then((tex: PIXI.Texture) => {
      if (sprite.characterSprite) {
        sprite.characterSprite.texture = tex;
      }
    })
    .catch(() => {
      // Fallback: keep existing texture
    });
}

// ---------- Agent sprite factory ----------

export function createAgentSprite(
  agent: OfficeAgent,
  idx: number,
  state: AgentState,
  app: PIXI.Application,
  deskPositions: Array<{ x: number; y: number }>,
  loungePositions: Array<{ x: number; y: number }>
): AgentSprite {
  const container = new PIXI.Container();
  const color = getAgentColor(agent);

  const circle = new PIXI.Graphics();
  const avatarId = agent.avatarUrl && /^\d{2}$/.test(agent.avatarUrl) ? agent.avatarUrl : null;

  if (!avatarId) {
    drawCharacterPixels(circle, agent.role || agent.name, color);
    container.addChild(circle);
  }

  const label = new PIXI.Text({
    text: agent.displayName,
    style: {
      fontSize: 10, fill: 0xffffff, align: "center", fontFamily: "monospace", fontWeight: "bold",
      dropShadow: { alpha: 0.8, blur: 2, color: 0x000000, distance: 1 },
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, CHAR_BOTTOM + 10);
  container.addChild(label);

  const statusDot = new PIXI.Graphics();
  const dotColor = state === "working" ? 0x22c55e : state === "walking" ? 0xeab308 : 0x64748b;
  statusDot.circle(AGENT_RADIUS - 4, -AGENT_RADIUS + 4, 5).fill({ color: dotColor });
  statusDot.circle(AGENT_RADIUS - 4, -AGENT_RADIUS + 4, 5).stroke({ color: 0x0f172a, width: 1.5 });
  statusDot.visible = state !== "idle";
  container.addChild(statusDot);

  const typingSparks = new PIXI.Graphics();
  typingSparks.visible = state === "working";
  container.addChild(typingSparks);

  const blockedBang = new PIXI.Text({
    text: "!",
    style: { fontSize: 14, fill: 0xEF4444, fontFamily: "monospace", fontWeight: "bold" },
  });
  blockedBang.anchor.set(0.5, 1);
  blockedBang.position.set(0, -30);
  blockedBang.visible = false;
  container.addChild(blockedBang);

  const pos = state === "working"
    ? deskPositions[idx % deskPositions.length]
    : loungePositions[idx % loungePositions.length];

  container.position.set(pos.x, pos.y);
  container.scale.set(AGENT_SCALE);
  container.eventMode = "static";
  container.cursor = "pointer";
  app.stage.addChild(container);

  let bubble: PIXI.Container | undefined;
  if (state === "working" && agent.currentTask) {
    bubble = createThoughtBubble(agent.currentTask.title);
    container.addChild(bubble);
  }

  const chatBubble = new PIXI.Container();
  const chatBg = new PIXI.Graphics();
  const cbx = -18;
  const cby = -50;
  chatBg.roundRect(cbx, cby, 36, 16, 4).fill({ color: 0xF1F5F9, alpha: 1 });
  chatBg.roundRect(cbx, cby, 36, 16, 4).stroke({ color: 0xCBD5E1, width: 1 });
  chatBg.circle(0, cby + 18, 2).fill({ color: 0xF1F5F9 });
  chatBg.circle(0, cby + 18, 2).stroke({ color: 0xCBD5E1, width: 1 });
  chatBg.circle(2, cby + 22, 1.5).fill({ color: 0xCBD5E1 });
  chatBubble.addChild(chatBg);
  const chatText = new PIXI.Text({
    text: "...",
    style: { fontSize: 9, fill: 0x475569, fontFamily: "monospace", fontWeight: "bold" },
  });
  chatText.anchor.set(0.5, 0.5);
  chatText.position.set(0, cby + 8);
  chatBubble.addChild(chatText);
  chatBubble.alpha = 0;
  container.addChild(chatBubble);

  const agentSpriteResult: AgentSprite = {
    container, circle, label, statusDot, bubble,
    bubbleFadeProgress: state === "working" ? 0 : 1,
    state, targetX: pos.x, targetY: pos.y,
    deskIndex: idx % deskPositions.length,
    walkProgress: 1, startX: pos.x, startY: pos.y,
    waypoints: [[pos.x, pos.y]], wpIdx: 0,
    bobOffset: Math.random() * Math.PI * 2,
    bobSpeed: 0.8 + Math.random() * 0.4,
    typingSparks, blockedBang, chatBubble, chatBubbleVisible: false,
    isDragging: false, dragOffsetX: 0, dragOffsetY: 0,
    characterSprite: null,
    avatarId,
  };

  // Start async sprite load
  if (avatarId) {
    const deskPos = deskPositions[idx % deskPositions.length];
    const initialDirection: AgentDirection = state === "working" ? getDeskDirection(deskPos, deskPositions) : "front";
    const dirSuffix = initialDirection === "front" ? "" : `_${initialDirection}`;
    const spriteUrl = `/assets/office/characters/previews/preview_${avatarId}${dirSuffix}.png`;
    PIXI.Assets.load(spriteUrl).then((tex: PIXI.Texture) => {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5, 1);
      s.position.set(0, CHAR_BOTTOM);
      s.width = 24;
      s.height = 48;
      container.addChildAt(s, 0);
      agentSpriteResult.characterSprite = s;
    }).catch(() => {
      drawCharacterPixels(circle, agent.role || agent.name, color);
      container.addChildAt(circle, 1);
    });
  }

  return agentSpriteResult;
}
