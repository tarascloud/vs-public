"use client";

import { useState, useCallback } from "react";
import type { OfficeLayout, FurniturePlacement } from "@/app/studio/data/office-layout";
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from "@/app/studio/data/office-layout";
import type { ToolMode } from "./use-canvas-renderer";
import { cloneLayout } from "./use-editor-layout";

const CANVAS_W = 512;
const CANVAS_H = 544;
const SNAP_GRID = 8;
const FURNITURE_SPRITE_W = 64;
const FURNITURE_SPRITE_H = 96;
const ANCHOR_HIT_RADIUS = 12;

export function useCanvasInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  layout: OfficeLayout,
  setLayout: React.Dispatch<React.SetStateAction<OfficeLayout>>,
  pushHistory: (prev: OfficeLayout) => void,
  toolMode: ToolMode,
  selectedTileId: number,
  selectedSingleId: number | null,
  setSelectedSingleId: (id: number | null) => void,
  selectedFurnitureIdx: number | null,
  setSelectedFurnitureIdx: (idx: number | null) => void,
  selectedAnchorIdx: { type: "desk" | "lounge"; idx: number } | null,
  setSelectedAnchorIdx: (idx: { type: "desk" | "lounge"; idx: number } | null) => void,
) {
  const [isPainting, setIsPainting] = useState(false);
  const [isDraggingFurniture, setIsDraggingFurniture] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const [hoverFurnitureIdx, setHoverFurnitureIdx] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverAnchorIdx, setHoverAnchorIdx] = useState<{ type: "desk" | "lounge"; idx: number } | null>(null);
  const [isDraggingAnchor, setIsDraggingAnchor] = useState(false);
  const [anchorDragOffset, setAnchorDragOffset] = useState({ x: 0, y: 0 });

  const canvasToWorld = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [canvasRef]);

  const worldToCell = (x: number, y: number) => ({
    col: Math.floor(x / TILE_SIZE),
    row: Math.floor(y / TILE_SIZE),
  });

  const furnitureAtPoint = useCallback(
    (x: number, y: number): number | null => {
      for (let i = layout.furniture.length - 1; i >= 0; i--) {
        const f = layout.furniture[i];
        if (x >= f.x && x < f.x + FURNITURE_SPRITE_W && y >= f.y && y < f.y + FURNITURE_SPRITE_H) {
          return i;
        }
      }
      return null;
    },
    [layout.furniture]
  );

  const anchorAtPoint = useCallback(
    (x: number, y: number): { type: "desk" | "lounge"; idx: number } | null => {
      const deskAnchors = layout.deskAnchors ?? [];
      const loungeAnchors = layout.loungeAnchors ?? [];
      for (let i = deskAnchors.length - 1; i >= 0; i--) {
        const a = deskAnchors[i];
        if (Math.sqrt((a.x - x) ** 2 + (a.y - y) ** 2) <= ANCHOR_HIT_RADIUS) {
          return { type: "desk", idx: i };
        }
      }
      for (let i = loungeAnchors.length - 1; i >= 0; i--) {
        const a = loungeAnchors[i];
        if (Math.sqrt((a.x - x) ** 2 + (a.y - y) ** 2) <= ANCHOR_HIT_RADIUS) {
          return { type: "lounge", idx: i };
        }
      }
      return null;
    },
    [layout.deskAnchors, layout.loungeAnchors]
  );

  const paintTile = useCallback(
    (col: number, row: number) => {
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
      const tileId = toolMode === "eraser" ? -1 : selectedTileId;
      if (layout.floor[row][col] === tileId) return;
      setLayout((prev) => {
        const next = cloneLayout(prev);
        next.floor[row][col] = tileId;
        return next;
      });
    },
    [toolMode, selectedTileId, layout, setLayout]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = canvasToWorld(e);

      if (toolMode === "tile" || toolMode === "eraser") {
        const { col, row } = worldToCell(x, y);
        pushHistory(layout);
        paintTile(col, row);
        setIsPainting(true);
      } else if (toolMode === "furniture") {
        const hitIdx = furnitureAtPoint(x, y);
        if (hitIdx !== null) {
          setSelectedFurnitureIdx(hitIdx);
          const f = layout.furniture[hitIdx];
          setDragOffset({ x: x - f.x, y: y - f.y });
          setIsDraggingFurniture(true);
          pushHistory(layout);
        } else if (selectedSingleId !== null) {
          const shiftHeld = e.shiftKey;
          const px = shiftHeld ? x - FURNITURE_SPRITE_W / 2 : Math.round((x - FURNITURE_SPRITE_W / 2) / SNAP_GRID) * SNAP_GRID;
          const py = shiftHeld ? y - FURNITURE_SPRITE_H / 2 : Math.round((y - FURNITURE_SPRITE_H / 2) / SNAP_GRID) * SNAP_GRID;
          pushHistory(layout);
          setLayout((prev) => ({
            ...prev,
            furniture: [...prev.furniture, { singleId: selectedSingleId, x: Math.round(px), y: Math.round(py) } as FurniturePlacement],
          }));
        } else {
          setSelectedFurnitureIdx(null);
        }
      } else if (toolMode === "anchor-desk" || toolMode === "anchor-lounge") {
        const anchorType = toolMode === "anchor-desk" ? "desk" : "lounge";
        const hit = anchorAtPoint(x, y);
        if (hit !== null && hit.type === anchorType) {
          setSelectedAnchorIdx(hit);
          const anchors = anchorType === "desk" ? (layout.deskAnchors ?? []) : (layout.loungeAnchors ?? []);
          const a = anchors[hit.idx];
          setAnchorDragOffset({ x: x - a.x, y: y - a.y });
          setIsDraggingAnchor(true);
          pushHistory(layout);
        } else {
          pushHistory(layout);
          const newAnchor = { x: Math.round(x), y: Math.round(y) };
          if (anchorType === "desk") {
            setLayout((prev) => ({ ...prev, deskAnchors: [...(prev.deskAnchors ?? []), newAnchor] }));
            setSelectedAnchorIdx({ type: "desk", idx: (layout.deskAnchors ?? []).length });
          } else {
            setLayout((prev) => ({ ...prev, loungeAnchors: [...(prev.loungeAnchors ?? []), newAnchor] }));
            setSelectedAnchorIdx({ type: "lounge", idx: (layout.loungeAnchors ?? []).length });
          }
        }
      }
    },
    [canvasToWorld, toolMode, selectedSingleId, furnitureAtPoint, anchorAtPoint, layout, pushHistory, paintTile, setLayout, setSelectedFurnitureIdx, setSelectedAnchorIdx]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = canvasToWorld(e);
      setCursorPos({ x, y });

      if (toolMode === "tile" || toolMode === "eraser") {
        const { col, row } = worldToCell(x, y);
        setHoverCell({ col, row });
        setHoverFurnitureIdx(null);
        if (isPainting) paintTile(col, row);
      } else if (toolMode === "furniture") {
        setHoverCell(null);
        if (isDraggingFurniture && selectedFurnitureIdx !== null) {
          const nx = x - dragOffset.x;
          const ny = y - dragOffset.y;
          const shiftHeld = e.shiftKey;
          const sx = shiftHeld ? nx : Math.round(nx / SNAP_GRID) * SNAP_GRID;
          const sy = shiftHeld ? ny : Math.round(ny / SNAP_GRID) * SNAP_GRID;
          setLayout((prev) => {
            const next = cloneLayout(prev);
            next.furniture[selectedFurnitureIdx] = { ...next.furniture[selectedFurnitureIdx], x: Math.round(sx), y: Math.round(sy) };
            return next;
          });
        } else {
          setHoverFurnitureIdx(furnitureAtPoint(x, y));
        }
      } else if (toolMode === "anchor-desk" || toolMode === "anchor-lounge") {
        setHoverCell(null);
        setHoverFurnitureIdx(null);
        if (isDraggingAnchor && selectedAnchorIdx !== null) {
          const nx = Math.round(x - anchorDragOffset.x);
          const ny = Math.round(y - anchorDragOffset.y);
          if (selectedAnchorIdx.type === "desk") {
            setLayout((prev) => {
              const next = cloneLayout(prev);
              next.deskAnchors[selectedAnchorIdx.idx] = { x: nx, y: ny };
              return next;
            });
          } else {
            setLayout((prev) => {
              const next = cloneLayout(prev);
              next.loungeAnchors[selectedAnchorIdx.idx] = { x: nx, y: ny };
              return next;
            });
          }
        } else {
          const anchorType = toolMode === "anchor-desk" ? "desk" : "lounge";
          const hit = anchorAtPoint(x, y);
          setHoverAnchorIdx(hit?.type === anchorType ? hit : null);
        }
      }
    },
    [
      canvasToWorld, toolMode, isPainting, isDraggingFurniture, selectedFurnitureIdx, dragOffset,
      furnitureAtPoint, paintTile, isDraggingAnchor, selectedAnchorIdx, anchorDragOffset,
      anchorAtPoint, setLayout,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setIsPainting(false);
    setIsDraggingFurniture(false);
    setIsDraggingAnchor(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverCell(null);
    setHoverFurnitureIdx(null);
    setHoverAnchorIdx(null);
    setCursorPos(null);
    setIsPainting(false);
    setIsDraggingFurniture(false);
    setIsDraggingAnchor(false);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { x, y } = canvasToWorld(e);
      if (toolMode === "furniture") {
        const idx = furnitureAtPoint(x, y);
        if (idx !== null) {
          pushHistory(layout);
          setLayout((prev) => {
            const next = cloneLayout(prev);
            next.furniture.splice(idx, 1);
            return next;
          });
          setSelectedFurnitureIdx(null);
        }
      } else if (toolMode === "anchor-desk" || toolMode === "anchor-lounge") {
        const anchorType = toolMode === "anchor-desk" ? "desk" : "lounge";
        const hit = anchorAtPoint(x, y);
        if (hit !== null && hit.type === anchorType) {
          pushHistory(layout);
          if (anchorType === "desk") {
            setLayout((prev) => {
              const next = cloneLayout(prev);
              next.deskAnchors.splice(hit.idx, 1);
              return next;
            });
          } else {
            setLayout((prev) => {
              const next = cloneLayout(prev);
              next.loungeAnchors.splice(hit.idx, 1);
              return next;
            });
          }
          setSelectedAnchorIdx(null);
        }
      }
    },
    [toolMode, canvasToWorld, furnitureAtPoint, anchorAtPoint, layout, pushHistory, setLayout, setSelectedFurnitureIdx, setSelectedAnchorIdx]
  );

  return {
    isPainting,
    isDraggingFurniture,
    isDraggingAnchor,
    hoverCell,
    hoverFurnitureIdx,
    cursorPos,
    hoverAnchorIdx,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  };
}
