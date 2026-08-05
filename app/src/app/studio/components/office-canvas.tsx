"use client";

import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

export type { InfraData, OfficeAgent } from "./office-canvas.types";
import type { AgentSprite, AgentState, AgentDirection, LedState, OfficeCanvasProps } from "./office-canvas.types";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AGENT_RADIUS,
  AGENT_SCALE,
  SERVER_Y,
  DEFAULT_DESK_POSITIONS,
  DEFAULT_LOUNGE_POSITIONS,
  RACK_LED_COUNT,
  buildWalkPath,
  drawServerRoom,
  drawServerStatus,
  createThoughtBubble,
  getDeskDirection,
  applyAgentDirection,
  createAgentSprite,
} from "./office-canvas.utils";

// ---------- Component ----------

export default function OfficeCanvas({ agents, infra, onAgentClick, onAgentHover }: OfficeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spritesRef = useRef<Map<string, AgentSprite>>(new Map());
  const agentsRef = useRef(agents);
  const serverStatusContainerRef = useRef<PIXI.Container | null>(null);
  const infraRef = useRef(infra);
  const [canvasReady, setCanvasReady] = useState(false);

  const deskPositionsRef = useRef<Array<{ x: number; y: number }>>(DEFAULT_DESK_POSITIONS);
  const loungePositionsRef = useRef<Array<{ x: number; y: number }>>(DEFAULT_LOUNGE_POSITIONS);

  const fanGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const fanAngleRef = useRef<number>(0);
  const blueGlowRef = useRef<PIXI.Graphics | null>(null);
  const depLinesRef = useRef<PIXI.Graphics | null>(null);
  const rackLedsRef = useRef<LedState[][]>([
    Array.from({ length: RACK_LED_COUNT }, () => ({ color: 0x22C55E, nextFlip: Math.random() * 2 })),
    Array.from({ length: RACK_LED_COUNT }, () => ({ color: 0x3B82F6, nextFlip: Math.random() * 2 })),
  ]);
  const rackLedContainerRef = useRef<PIXI.Container | null>(null);

  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { infraRef.current = infra; }, [infra]);

  // Init PixiJS once
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const app = new PIXI.Application();

    (async () => {
      await app.init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 0x1E1B2E,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (!containerRef.current) return;
      containerRef.current.appendChild(app.canvas);
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      appRef.current = app;

      // --- Load office background (tilemap) ---
      const { renderOfficeTilemap } = await import("./office-tilemap");
      const { DEFAULT_OFFICE_LAYOUT } = await import("../data/default-office-layout");
      let layout = DEFAULT_OFFICE_LAYOUT;
      try {
        const r = await fetch("/api/office-layout");
        if (r.ok) {
          const saved = await r.json();
          if (saved && saved.floor && saved.furniture) layout = saved;
        }
      } catch { /* use default */ }
      if (Array.isArray(layout.deskAnchors) && layout.deskAnchors.length > 0) {
        deskPositionsRef.current = layout.deskAnchors;
      }
      if (Array.isArray(layout.loungeAnchors) && layout.loungeAnchors.length > 0) {
        loungePositionsRef.current = layout.loungeAnchors;
      }
      await renderOfficeTilemap(app, layout);

      // --- Server room (Graphics) ---
      const serverGfx = new PIXI.Graphics();
      drawServerRoom(serverGfx);
      app.stage.addChild(serverGfx);

      // Blue glow overlay at server room border
      const blueGlow = new PIXI.Graphics();
      blueGlow.rect(0, SERVER_Y, CANVAS_WIDTH, 10).fill({ color: 0x3B82F6, alpha: 0.08 });
      app.stage.addChild(blueGlow);
      blueGlowRef.current = blueGlow;

      // Rack LED container
      const rackLedContainer = new PIXI.Container();
      app.stage.addChild(rackLedContainer);
      rackLedContainerRef.current = rackLedContainer;

      // Fan graphics
      const rackW_init = 110;
      const rackGap_init = 60;
      const totalRackW_init = rackW_init * 2 + rackGap_init;
      const rackStartX_init = (CANVAS_WIDTH - totalRackW_init - 80) / 2 + 20;
      const coolingX_init = rackStartX_init + totalRackW_init + 30;
      const fanGfx = new PIXI.Graphics();
      const fanCX = coolingX_init + 6 + 11;
      const fanCY = SERVER_Y + 18 + 6 + 11;
      fanGfx.pivot.set(fanCX, fanCY);
      fanGfx.position.set(fanCX, fanCY);
      const fanBladeColor = 0x93C5FD;
      fanGfx.rect(fanCX - 1, fanCY - 9, 2, 9).fill({ color: fanBladeColor, alpha: 0.75 });
      fanGfx.rect(fanCX - 1, fanCY + 1, 2, 9).fill({ color: fanBladeColor, alpha: 0.75 });
      fanGfx.rect(fanCX - 9, fanCY - 1, 9, 2).fill({ color: fanBladeColor, alpha: 0.75 });
      fanGfx.rect(fanCX + 1, fanCY - 1, 9, 2).fill({ color: fanBladeColor, alpha: 0.75 });
      fanGfx.rect(fanCX - 7, fanCY - 7, 3, 3).fill({ color: fanBladeColor, alpha: 0.5 });
      fanGfx.rect(fanCX + 4, fanCY - 7, 3, 3).fill({ color: fanBladeColor, alpha: 0.5 });
      fanGfx.rect(fanCX - 7, fanCY + 4, 3, 3).fill({ color: fanBladeColor, alpha: 0.5 });
      fanGfx.rect(fanCX + 4, fanCY + 4, 3, 3).fill({ color: fanBladeColor, alpha: 0.5 });
      fanGfx.circle(fanCX, fanCY, 2.5).fill({ color: 0x475569 });
      app.stage.addChild(fanGfx);
      fanGraphicsRef.current = fanGfx;

      // Dependency lines layer
      const depLinesGfx = new PIXI.Graphics();
      app.stage.addChild(depLinesGfx);
      depLinesRef.current = depLinesGfx;

      // Server status dynamic container
      const serverStatusContainer = new PIXI.Container();
      app.stage.addChild(serverStatusContainer);
      serverStatusContainerRef.current = serverStatusContainer;

      setCanvasReady(true);
    })();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
        spritesRef.current.clear();
        fanGraphicsRef.current = null;
        blueGlowRef.current = null;
        rackLedContainerRef.current = null;
        depLinesRef.current = null;
        setCanvasReady(false);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync agents -> sprites
  useEffect(() => {
    const app = appRef.current;
    if (!app || !canvasReady) return;

    const currentAgents = agents;
    const sprites = spritesRef.current;

    // Build set of all valid sprite keys
    const validKeys = new Set<string>();
    currentAgents.forEach((agent) => {
      const workingCount = Math.max(1, agent.workingCount ?? (agent.currentTask ? 1 : 0));
      const instanceCount = agent.currentTask ? workingCount : 1;
      for (let i = 0; i < instanceCount; i++) {
        validKeys.add(i === 0 ? agent.id : `${agent.id}-${i}`);
      }
    });

    sprites.forEach((sprite, key) => {
      if (!validKeys.has(key)) {
        app.stage.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        sprites.delete(key);
      }
    });

    let deskSlotCursor = 0;
    let loungeSlotCursor = 0;

    currentAgents.forEach((agent) => {
      const isWorking = !!agent.currentTask;
      const newState: AgentState = isWorking ? "working" : "idle";

      const rawWorkingCount = agent.workingCount ?? (isWorking ? 1 : 0);
      const instanceCount = isWorking ? Math.max(1, rawWorkingCount) : 1;
      const availableDesks = deskPositionsRef.current.length;

      for (let instanceIdx = 0; instanceIdx < instanceCount; instanceIdx++) {
        const spriteKey = instanceIdx === 0 ? agent.id : `${agent.id}-${instanceIdx}`;
        const deskIdx = isWorking
          ? deskSlotCursor % availableDesks
          : loungeSlotCursor % loungePositionsRef.current.length;

        if (instanceIdx === 0) {
          if (!sprites.has(spriteKey)) {
            const sprite = createAgentSprite(agent, deskIdx, newState, app, deskPositionsRef.current, loungePositionsRef.current);

            let dragStarted = false;
            let pointerDownX = 0;
            let pointerDownY = 0;

            sprite.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
              dragStarted = false;
              pointerDownX = e.global.x;
              pointerDownY = e.global.y;
              const currentSprite = spritesRef.current.get(spriteKey);
              if (currentSprite && currentSprite.state === "working") {
                currentSprite.isDragging = true;
                currentSprite.dragOffsetX = e.global.x / AGENT_SCALE - currentSprite.container.x;
                currentSprite.dragOffsetY = e.global.y / AGENT_SCALE - currentSprite.container.y;
                app.stage.setChildIndex(currentSprite.container, app.stage.children.length - 1);
              }
            });

            sprite.container.on("pointermove", (e: PIXI.FederatedPointerEvent) => {
              const currentSprite = spritesRef.current.get(spriteKey);
              if (!currentSprite?.isDragging) return;
              dragStarted = true;
              currentSprite.container.x = e.global.x / AGENT_SCALE - currentSprite.dragOffsetX;
              currentSprite.container.y = e.global.y / AGENT_SCALE - currentSprite.dragOffsetY;
            });

            sprite.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => {
              const currentSprite = spritesRef.current.get(spriteKey);
              if (currentSprite?.isDragging) {
                currentSprite.isDragging = false;
                const cx = currentSprite.container.x;
                const cy = currentSprite.container.y;
                let nearest: { x: number; y: number } | null = null;
                let nearestDist = 60;
                deskPositionsRef.current.forEach((dp) => {
                  const dist = Math.sqrt((dp.x - cx) ** 2 + (dp.y - cy) ** 2);
                  if (dist < nearestDist) { nearestDist = dist; nearest = dp; }
                });
                if (nearest) {
                  currentSprite.targetX = (nearest as { x: number; y: number }).x;
                  currentSprite.targetY = (nearest as { x: number; y: number }).y;
                  currentSprite.container.x = currentSprite.targetX;
                  currentSprite.container.y = currentSprite.targetY;
                } else {
                  currentSprite.container.x = currentSprite.targetX;
                  currentSprite.container.y = currentSprite.targetY;
                }
              }
              if (!dragStarted) {
                const bounds = containerRef.current?.getBoundingClientRect();
                if (!bounds) return;
                const currentAgent = agentsRef.current.find((a) => a.id === agent.id) || agent;
                onAgentClick(currentAgent, pointerDownX + bounds.left, pointerDownY + bounds.top);
              }
            });

            sprite.container.on("pointerupoutside", () => {
              const currentSprite = spritesRef.current.get(spriteKey);
              if (currentSprite?.isDragging) {
                currentSprite.isDragging = false;
                currentSprite.container.x = currentSprite.targetX;
                currentSprite.container.y = currentSprite.targetY;
              }
            });

            sprite.container.on("pointerover", (e: PIXI.FederatedPointerEvent) => {
              if (!onAgentHover) return;
              const bounds = containerRef.current?.getBoundingClientRect();
              if (!bounds) return;
              const currentAgent = agentsRef.current.find((a) => a.id === agent.id) || agent;
              onAgentHover(currentAgent, e.clientX + bounds.left, e.clientY + bounds.top);
            });

            sprite.container.on("pointerout", () => {
              if (!onAgentHover) return;
              onAgentHover(null, 0, 0);
            });

            sprite.blockedBang.visible = agent.currentTask?.status === "BLOCKED";
            sprites.set(spriteKey, sprite);
          } else {
            const sprite = sprites.get(spriteKey)!;
            if (sprite.state !== newState) {
              const targetPos = newState === "working"
                ? deskPositionsRef.current[deskIdx]
                : loungePositionsRef.current[deskIdx % loungePositionsRef.current.length];

              sprite.targetX = targetPos.x;
              sprite.targetY = targetPos.y;
              sprite.waypoints = buildWalkPath(
                sprite.container.x, sprite.container.y,
                targetPos.x, targetPos.y,
              );
              sprite.wpIdx = 0;
              sprite.startX = sprite.waypoints[0][0];
              sprite.startY = sprite.waypoints[0][1];
              sprite.state = "walking";
              sprite.walkProgress = 0;
              sprite.deskIndex = deskIdx;

              sprite.statusDot.clear();
              sprite.statusDot
                .circle(AGENT_RADIUS - 4, -AGENT_RADIUS + 4, 5)
                .fill({ color: 0xeab308 })
                .stroke({ color: 0x0f172a, width: 1.5 });
              sprite.statusDot.visible = true;

              applyAgentDirection(sprite, "front");

              if (newState !== "working" && sprite.bubble) {
                sprite.container.removeChild(sprite.bubble);
                sprite.bubble.destroy({ children: true });
                sprite.bubble = undefined;
              }
            }

            if (newState === "working" && agent.currentTask) {
              if (!sprite.bubble) {
                sprite.bubble = createThoughtBubble(agent.currentTask.title);
                sprite.bubble.alpha = 0;
                sprite.bubbleFadeProgress = 0;
                sprite.container.addChild(sprite.bubble);
              } else {
                const textChild = sprite.bubble.children[1] as PIXI.Text | undefined;
                if (textChild && textChild instanceof PIXI.Text) {
                  const maxLen = 24;
                  const rawText = agent.currentTask.title || "...";
                  textChild.text = rawText.length > maxLen ? rawText.slice(0, maxLen) + "..." : rawText;
                }
              }
            }

            if (!agent.currentTask && sprite.bubble) {
              sprite.container.removeChild(sprite.bubble);
              sprite.bubble.destroy({ children: true });
              sprite.bubble = undefined;
            }

            sprite.label.text = agent.displayName;
            sprite.blockedBang.visible = agent.currentTask?.status === "BLOCKED";
            sprite.typingSparks.visible = newState === "working";
          }
        } else {
          // Extra instance sprite (clone)
          if (!sprites.has(spriteKey)) {
            if (deskSlotCursor >= availableDesks) {
              console.warn(`[OfficeCanvas] workingCount overflow for agent ${agent.name}: no free desks for instance ${instanceIdx}`);
            } else {
              const cloneSprite = createAgentSprite(agent, deskIdx, "working", app, deskPositionsRef.current, loungePositionsRef.current);
              cloneSprite.container.on("pointerup", () => {
                const bounds = containerRef.current?.getBoundingClientRect();
                if (!bounds) return;
                const currentAgent = agentsRef.current.find((a) => a.id === agent.id) || agent;
                onAgentClick(currentAgent, 0, 0);
              });
              cloneSprite.blockedBang.visible = false;
              sprites.set(spriteKey, cloneSprite);
            }
          }
        }

        if (isWorking) {
          deskSlotCursor++;
        } else {
          loungeSlotCursor++;
        }
      }
    });
  }, [agents, canvasReady, onAgentClick]);

  // Redraw server status when infra changes
  useEffect(() => {
    const serverStatusContainer = serverStatusContainerRef.current;
    if (!serverStatusContainer || !canvasReady) return;
    if (!infra) return;
    drawServerStatus(serverStatusContainer, infra, performance.now() / 1000);
  }, [infra, canvasReady]);

  // Animation loop
  useEffect(() => {
    const app = appRef.current;
    if (!app || !canvasReady) return;

    const ticker = app.ticker;
    let lastServerRedraw = 0;
    let lastLedRedraw = 0;

    const LED_COLORS_OK = [0x22C55E, 0x22C55E, 0x22C55E, 0x3B82F6];
    const LED_COLORS_WARN = [0xF59E0B, 0x22C55E, 0xF59E0B];

    function redrawRackLeds(time: number) {
      const container = rackLedContainerRef.current;
      if (!container) return;
      container.removeChildren();
      const rackW_led = 110, rackGap_led = 60;
      const totalRackW_led = rackW_led * 2 + rackGap_led;
      const rackStartX_led = (CANVAS_WIDTH - totalRackW_led - 80) / 2 + 20;
      const sy = SERVER_Y;
      const rackOffsets = [0, rackW_led + rackGap_led];

      rackLedsRef.current.forEach((rack, ri) => {
        const rx = rackStartX_led + rackOffsets[ri];
        rack.forEach((led, li) => {
          if (time >= led.nextFlip) {
            const roll = Math.random();
            led.color = roll < 0.15 ? 0x1E293B : roll < 0.25
              ? LED_COLORS_WARN[Math.floor(Math.random() * LED_COLORS_WARN.length)]
              : LED_COLORS_OK[Math.floor(Math.random() * LED_COLORS_OK.length)];
            led.nextFlip = time + 0.4 + Math.random() * 2.1;
          }
          const dot = new PIXI.Graphics();
          const isOff = led.color === 0x1E293B;
          const alpha = isOff ? 0.3 : (0.7 + 0.3 * Math.sin(time * 1.6 + li * 0.8 + ri * 1.2));
          dot.rect(rx + 82, sy + 18 + li * 9, 3, 3).fill({ color: led.color, alpha });
          container.addChild(dot);
        });
      });
    }

    const onTick = () => {
      const sprites = spritesRef.current;
      const time = performance.now() / 1000;

      // Fan rotation
      const fanGfx = fanGraphicsRef.current;
      if (fanGfx) {
        fanAngleRef.current += ticker.deltaMS / 1000 * (Math.PI * 2 / 2.5);
        fanGfx.rotation = fanAngleRef.current;
      }

      // Blue glow pulse
      const glowGfx = blueGlowRef.current;
      if (glowGfx) {
        const pulseAlpha = 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 4)));
        glowGfx.clear();
        glowGfx.rect(0, SERVER_Y, CANVAS_WIDTH, 10).fill({ color: 0x3B82F6, alpha: pulseAlpha });
        glowGfx.rect(0, SERVER_Y, CANVAS_WIDTH, 4).fill({ color: 0x93C5FD, alpha: pulseAlpha * 0.4 });
      }

      // Rack LED blink
      if (time - lastLedRedraw > 0.5) {
        lastLedRedraw = time;
        redrawRackLeds(time);
      }

      // Dependency lines between agents
      const depLines = depLinesRef.current;
      if (depLines) {
        depLines.clear();
        const currentAgents = agentsRef.current;

        const agentPositions = new Map<string, { x: number; y: number }>();
        sprites.forEach((sprite, spriteKey) => {
          const baseId = spriteKey.includes("-") && /-.+$/.test(spriteKey)
            ? spriteKey.replace(/-\d+$/, "")
            : spriteKey;
          if (!agentPositions.has(baseId)) {
            agentPositions.set(baseId, { x: sprite.container.x, y: sprite.container.y });
          }
        });

        const drawnPairs = new Set<string>();

        // Blocked dependency lines (red dashed)
        currentAgents.forEach((agent) => {
          if (!agent.currentTask) return;
          if (agent.currentTask.status !== "BLOCKED") return;
          const blockedIds = agent.currentTask.blockedByAgentIds ?? [];
          const posA = agentPositions.get(agent.id);
          if (!posA) return;

          blockedIds.forEach((blockerId) => {
            const posB = agentPositions.get(blockerId);
            if (!posB) return;

            const pairKey = [agent.id, blockerId].sort().join("|");
            if (drawnPairs.has(pairKey)) return;
            drawnPairs.add(pairKey);

            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return;
            const dashLen = 8;
            const gapLen = 5;
            const stepLen = dashLen + gapLen;
            const ux = dx / dist;
            const uy = dy / dist;
            let drawn = 0;
            while (drawn < dist) {
              const segEnd = Math.min(drawn + dashLen, dist);
              depLines
                .moveTo(posA.x + ux * drawn, posA.y + uy * drawn)
                .lineTo(posA.x + ux * segEnd, posA.y + uy * segEnd)
                .stroke({ color: 0xEF4444, width: 1.5, alpha: 0.4 });
              drawn += stepLen;
            }
          });
        });

        // Collaboration lines (blue thin)
        const initiativeMap = new Map<string, string[]>();
        currentAgents.forEach((agent) => {
          const initId = agent.currentTask?.initiativeId;
          if (!initId) return;
          if (!initiativeMap.has(initId)) initiativeMap.set(initId, []);
          initiativeMap.get(initId)!.push(agent.id);
        });

        initiativeMap.forEach((agentIds) => {
          if (agentIds.length < 2) return;
          for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
              const idA = agentIds[i];
              const idB = agentIds[j];
              const pairKey = [idA, idB].sort().join("|");
              if (drawnPairs.has(pairKey)) return;
              drawnPairs.add(pairKey);

              const posA = agentPositions.get(idA);
              const posB = agentPositions.get(idB);
              if (!posA || !posB) continue;

              depLines
                .moveTo(posA.x, posA.y)
                .lineTo(posB.x, posB.y)
                .stroke({ color: 0x3B82F6, width: 1, alpha: 0.4 });
            }
          }
        });
      }

      // Server status update
      if (time - lastServerRedraw > 0.5) {
        lastServerRedraw = time;
        const serverStatusContainer = serverStatusContainerRef.current;
        const currentInfra = infraRef.current;
        if (serverStatusContainer && currentInfra) {
          drawServerStatus(serverStatusContainer, currentInfra, time);
        }
      }

      // Collect idle positions for chat proximity
      const idlePositions: Array<{ x: number; y: number }> = [];
      sprites.forEach((sprite) => {
        if (sprite.state === "idle") idlePositions.push({ x: sprite.container.x, y: sprite.targetY });
      });

      sprites.forEach((sprite) => {
        if (sprite.state === "walking") {
          sprite.walkProgress = Math.min(1, sprite.walkProgress + ticker.deltaTime * 0.015);
          const t = sprite.walkProgress < 0.5
            ? 2 * sprite.walkProgress * sprite.walkProgress
            : -1 + (4 - 2 * sprite.walkProgress) * sprite.walkProgress;

          const wp = sprite.waypoints;
          const segCount = wp.length - 1;
          if (segCount > 1) {
            const totalT = t * segCount;
            const segIdx = Math.min(Math.floor(totalT), segCount - 1);
            const segT = totalT - segIdx;
            const [sx, sy] = wp[segIdx];
            const [ex, ey] = wp[segIdx + 1];
            sprite.container.x = sx + (ex - sx) * segT;
            sprite.container.y = sy + (ey - sy) * segT;
          } else {
            sprite.container.x = sprite.startX + (sprite.targetX - sprite.startX) * t;
            sprite.container.y = sprite.startY + (sprite.targetY - sprite.startY) * t;
          }
          sprite.container.y += Math.sin(time * 8 + sprite.bobOffset) * 2;

          if (sprite.walkProgress >= 1) {
            sprite.container.x = sprite.targetX;
            sprite.container.y = sprite.targetY;
            const agent = agentsRef.current.find((a) => {
              const sp = spritesRef.current.get(a.id);
              return sp === sprite;
            });
            const finalState: AgentState = agent?.currentTask ? "working" : "idle";
            sprite.state = finalState;
            const dotColor = finalState === "working" ? 0x22c55e : 0x64748b;
            sprite.statusDot.clear();
            sprite.statusDot
              .circle(AGENT_RADIUS - 4, -AGENT_RADIUS + 4, 5)
              .fill({ color: dotColor })
              .stroke({ color: 0x0f172a, width: 1.5 });
            sprite.statusDot.visible = finalState !== "idle";
            if (finalState === "working" && sprite.bubble) {
              sprite.bubbleFadeProgress = 0;
              sprite.bubble.alpha = 0;
            }
            const arrivalDirection: AgentDirection = finalState === "working"
              ? getDeskDirection({ x: sprite.targetX, y: sprite.targetY }, deskPositionsRef.current)
              : "front";
            applyAgentDirection(sprite, arrivalDirection);
          }
        } else if (sprite.state === "idle") {
          sprite.container.y = sprite.targetY + Math.sin(time * sprite.bobSpeed * 0.5 + sprite.bobOffset) * 1.5;
          sprite.container.rotation = Math.sin(time * 0.3 + sprite.bobOffset) * 0.04;

          const nearbyIdle = idlePositions.some((p) => {
            const dx = p.x - sprite.container.x;
            const dy = p.y - sprite.targetY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist > 1 && dist < 100;
          });
          if (nearbyIdle) {
            const cycle = 6.0;
            const phase = ((time + sprite.bobOffset) % cycle) / cycle;
            const chatAlpha = phase < 0.42 ? Math.min(1, phase / 0.08) * 0.85 : 0;
            sprite.chatBubble.alpha = Math.max(0, chatAlpha);
          } else {
            sprite.chatBubble.alpha = Math.max(0, sprite.chatBubble.alpha - ticker.deltaMS / 1000 * 2);
          }
        } else if (sprite.state === "working") {
          const oscillation = Math.sin(time * 3 + sprite.bobOffset);
          sprite.container.y = sprite.targetY + oscillation * 1.5;
          sprite.container.rotation = Math.sin(time * 2.5 + sprite.bobOffset) * 0.03;

          if (sprite.bubble && sprite.bubbleFadeProgress < 1) {
            sprite.bubbleFadeProgress = Math.min(1, sprite.bubbleFadeProgress + ticker.deltaMS / 1000 / 0.5);
            sprite.bubble.alpha = sprite.bubbleFadeProgress * 0.9;
          }

          if (sprite.typingSparks.visible) {
            sprite.typingSparks.clear();
            const sparkPositions = [{ x: -8, y: 10 }, { x: 0, y: 12 }, { x: 8, y: 10 }];
            sparkPositions.forEach((sp, si) => {
              const sparkAlpha = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(time * 6 + sprite.bobOffset + si * 1.3));
              sprite.typingSparks.rect(sp.x - 0.5, sp.y - 0.5, 2, 2).fill({ color: 0x93C5FD, alpha: sparkAlpha });
            });
          }
        }

        if (sprite.blockedBang.visible) {
          sprite.blockedBang.alpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(time * 2.5 + sprite.bobOffset));
        }
      });
    };

    ticker.add(onTick);
    return () => { ticker.remove(onTick); };
  }, [canvasReady]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-card-border"
      style={{
        width: "100%",
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
      }}
    />
  );
}
