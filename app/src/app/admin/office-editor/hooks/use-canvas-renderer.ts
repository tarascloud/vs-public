"use client";

import { useRef, useState, useEffect, useCallback, type RefObject } from "react";
import type { OfficeLayout } from "@/app/studio/data/office-layout";
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from "@/app/studio/data/office-layout";

const SPRITESHEET_COLS = 16;
const CANVAS_W = 512;
const CANVAS_H = 544;
const CANVAS_SCALE = 2;
const SNAP_GRID = 8;
const FURNITURE_SPRITE_W = 64;
const FURNITURE_SPRITE_H = 96;

export type ToolMode = "tile" | "furniture" | "eraser" | "anchor-desk" | "anchor-lounge";

interface RendererState {
  showFloor: boolean;
  showFurniture: boolean;
  showGrid: boolean;
  showAnchors: boolean;
  hoverCell: { col: number; row: number } | null;
  hoverFurnitureIdx: number | null;
  selectedFurnitureIdx: number | null;
  selectedSingleId: number | null;
  toolMode: ToolMode;
  cursorPos: { x: number; y: number } | null;
  selectedAnchorIdx: { type: "desk" | "lounge"; idx: number } | null;
  hoverAnchorIdx: { type: "desk" | "lounge"; idx: number } | null;
}

export function useCanvasRenderer(
  layout: OfficeLayout,
  state: RendererState,
  externalCanvasRef?: RefObject<HTMLCanvasElement | null>
) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef ?? internalCanvasRef;
  const spritesheetRef = useRef<HTMLImageElement | null>(null);
  const [spritesheetLoaded, setSpritesheetLoaded] = useState(false);
  const furnitureImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());

  // Load spritesheet
  useEffect(() => {
    const img = new Image();
    img.src = "/assets/office/Room_Builder_Office_32x32.png";
    img.onload = () => {
      spritesheetRef.current = img;
      setSpritesheetLoaded(true);
    };
  }, []);

  const loadFurnitureImage = useCallback((singleId: number): Promise<HTMLImageElement> => {
    if (furnitureImagesRef.current.has(singleId)) {
      return Promise.resolve(furnitureImagesRef.current.get(singleId)!);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.src = `/assets/office/singles-32x32/Modern_Office_Singles_32x32_${singleId}.png`;
      img.onload = () => {
        furnitureImagesRef.current.set(singleId, img);
        resolve(img);
      };
      img.onerror = () => {
        furnitureImagesRef.current.set(singleId, img);
        resolve(img);
      };
    });
  }, []);

  // Preload visible furniture images
  useEffect(() => {
    const ids = new Set<number>(layout.furniture.map((f) => f.singleId));
    if (state.selectedSingleId) ids.add(state.selectedSingleId);
    ids.forEach((id) => loadFurnitureImage(id));
  }, [layout.furniture, state.selectedSingleId, loadFurnitureImage]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = CANVAS_SCALE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor layer
    if (state.showFloor && spritesheetRef.current) {
      const ss = spritesheetRef.current;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const tileId = layout.floor[row]?.[col] ?? -1;
          if (tileId < 0) continue;
          const srcCol = tileId % SPRITESHEET_COLS;
          const srcRow = Math.floor(tileId / SPRITESHEET_COLS);
          ctx.drawImage(ss, srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
            col * TILE_SIZE * scale, row * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        }
      }
    }

    // Wall layer
    if (spritesheetRef.current) {
      const ss = spritesheetRef.current;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const tileId = layout.walls[row]?.[col] ?? -1;
          if (tileId < 0) continue;
          const srcCol = tileId % SPRITESHEET_COLS;
          const srcRow = Math.floor(tileId / SPRITESHEET_COLS);
          ctx.drawImage(ss, srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
            col * TILE_SIZE * scale, row * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        }
      }
    }

    // Furniture layer
    if (state.showFurniture) {
      layout.furniture.forEach((f, idx) => {
        const img = furnitureImagesRef.current.get(f.singleId);
        if (!img || !img.complete || img.naturalWidth === 0) return;

        ctx.save();
        const dx = f.x * scale;
        const dy = f.y * scale;
        const dw = FURNITURE_SPRITE_W * scale;
        const dh = FURNITURE_SPRITE_H * scale;

        if (f.flipX) {
          ctx.translate(dx + dw, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, dw, dh);
        } else {
          ctx.drawImage(img, dx, dy, dw, dh);
        }

        if (idx === state.selectedFurnitureIdx) {
          ctx.strokeStyle = "rgba(99, 102, 241, 0.9)";
          ctx.lineWidth = 2 * scale;
          ctx.strokeRect(dx, dy, dw, dh);
        }
        if (idx === state.hoverFurnitureIdx && idx !== state.selectedFurnitureIdx) {
          ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
          ctx.lineWidth = 1 * scale;
          ctx.strokeRect(dx, dy, dw, dh);
        }
        // Red X delete icon on hover (top-right corner)
        if (idx === state.hoverFurnitureIdx) {
          const xSize = 10 * scale;
          const xPad = 3 * scale;
          const xX = dx + dw - xSize - xPad;
          const xY = dy + xPad;
          ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
          ctx.beginPath();
          ctx.roundRect(xX, xY, xSize, xSize, 2 * scale);
          ctx.fill();
          ctx.strokeStyle = "white";
          ctx.lineWidth = 1.5 * scale;
          const inset = 2.5 * scale;
          ctx.beginPath();
          ctx.moveTo(xX + inset, xY + inset);
          ctx.lineTo(xX + xSize - inset, xY + xSize - inset);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(xX + xSize - inset, xY + inset);
          ctx.lineTo(xX + inset, xY + xSize - inset);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // Cursor furniture preview
    if (state.toolMode === "furniture" && state.selectedSingleId && state.cursorPos) {
      const img = furnitureImagesRef.current.get(state.selectedSingleId);
      if (img && img.complete && img.naturalWidth > 0) {
        const snapX = Math.round(state.cursorPos.x / SNAP_GRID) * SNAP_GRID;
        const snapY = Math.round(state.cursorPos.y / SNAP_GRID) * SNAP_GRID;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, snapX * scale, snapY * scale, FURNITURE_SPRITE_W * scale, FURNITURE_SPRITE_H * scale);
        ctx.restore();
      }
    }

    // Grid overlay
    if (state.showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let col = 0; col <= GRID_COLS; col++) {
        ctx.beginPath();
        ctx.moveTo(col * TILE_SIZE * scale, 0);
        ctx.lineTo(col * TILE_SIZE * scale, CANVAS_H * scale);
        ctx.stroke();
      }
      for (let row = 0; row <= GRID_ROWS; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * TILE_SIZE * scale);
        ctx.lineTo(CANVAS_W * scale, row * TILE_SIZE * scale);
        ctx.stroke();
      }
    }

    // Anchor layer
    if (state.showAnchors) {
      const drawAnchor = (
        ax: number, ay: number,
        label: string, index: number,
        fillColor: string,
        isSelected: boolean,
        isHovered: boolean
      ) => {
        const r = 8 * scale;
        const cx = ax * scale;
        const cy = ay * scale;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? (fillColor === "#3b82f6" ? "#60a5fa" : "#4ade80") : fillColor;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2.5 * scale;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 1.5 * scale;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${6 * scale}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${label}${index}`, cx, cy);
        ctx.restore();
      };

      (layout.deskAnchors ?? []).forEach((a, i) => {
        const isSelected = state.selectedAnchorIdx?.type === "desk" && state.selectedAnchorIdx.idx === i;
        const isHovered = state.hoverAnchorIdx?.type === "desk" && state.hoverAnchorIdx.idx === i;
        drawAnchor(a.x, a.y, "D", i, "#3b82f6", isSelected, isHovered);
      });
      (layout.loungeAnchors ?? []).forEach((a, i) => {
        const isSelected = state.selectedAnchorIdx?.type === "lounge" && state.selectedAnchorIdx.idx === i;
        const isHovered = state.hoverAnchorIdx?.type === "lounge" && state.hoverAnchorIdx.idx === i;
        drawAnchor(a.x, a.y, "L", i, "#22c55e", isSelected, isHovered);
      });
    }

    // Hover cell highlight
    if (state.hoverCell && (state.toolMode === "tile" || state.toolMode === "eraser")) {
      ctx.fillStyle = "rgba(99, 102, 241, 0.25)";
      ctx.fillRect(
        state.hoverCell.col * TILE_SIZE * scale,
        state.hoverCell.row * TILE_SIZE * scale,
        TILE_SIZE * scale,
        TILE_SIZE * scale
      );
      ctx.strokeStyle = "rgba(99, 102, 241, 0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.hoverCell.col * TILE_SIZE * scale,
        state.hoverCell.row * TILE_SIZE * scale,
        TILE_SIZE * scale,
        TILE_SIZE * scale
      );
    }
  }, [
    layout,
    state.showFloor,
    state.showFurniture,
    state.showGrid,
    state.showAnchors,
    state.hoverCell,
    state.hoverFurnitureIdx,
    state.selectedFurnitureIdx,
    state.selectedSingleId,
    state.toolMode,
    state.cursorPos,
    spritesheetLoaded,
    state.selectedAnchorIdx,
    state.hoverAnchorIdx,
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Re-render when furniture images load
  useEffect(() => {
    const ids = layout.furniture.map((f) => f.singleId);
    if (state.selectedSingleId) ids.push(state.selectedSingleId);
    const promises = ids.map((id) => loadFurnitureImage(id));
    Promise.all(promises).then(() => renderCanvas());
  }, [layout.furniture, state.selectedSingleId, loadFurnitureImage, renderCanvas]);

  return {
    spritesheetRef,
    loadFurnitureImage,
  };
}
