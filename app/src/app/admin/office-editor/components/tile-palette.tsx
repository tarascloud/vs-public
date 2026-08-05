"use client";

import { useState, useRef, useEffect } from "react";
import type { ToolMode } from "../hooks/use-canvas-renderer";

const SPRITESHEET_COLS = 16;
const SPRITESHEET_ROWS = 14;
const TILE_SIZE = 32;

function getTileCategory(tileId: number): string {
  const row = Math.floor(tileId / SPRITESHEET_COLS);
  if (row <= 2) return "Wall Structure";
  if (row === 3) return "Floor Set 1";
  if (row === 4) return "Floor Set 2";
  if (row === 5) return "Floor Set 3";
  if (row === 6) return "Floor Set 4";
  if (row === 7) return "Floor Set 5";
  return "Floor Set 6+";
}

export interface TilePaletteProps {
  spritesheet: HTMLImageElement | null;
  selectedTileId: number;
  toolMode: ToolMode;
  onSelectTile: (id: number) => void;
  onSelectEraser: () => void;
}

export default function TilePalette({ spritesheet, selectedTileId, toolMode, onSelectTile, onSelectEraser }: TilePaletteProps) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!spritesheet) return;
    canvasRefs.current.forEach((canvas, tileId) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 32, 32);
      const srcCol = tileId % SPRITESHEET_COLS;
      const srcRow = Math.floor(tileId / SPRITESHEET_COLS);
      ctx.drawImage(spritesheet, srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, 32, 32);
    });
  }, [spritesheet]);

  const categories = ["Wall Structure", "Floor Set 1", "Floor Set 2", "Floor Set 3", "Floor Set 4", "Floor Set 5", "Floor Set 6+"];
  const tilesByCategory = new Map<string, number[]>();
  categories.forEach((c) => tilesByCategory.set(c, []));

  for (let id = 0; id < SPRITESHEET_COLS * SPRITESHEET_ROWS; id++) {
    const cat = getTileCategory(id);
    tilesByCategory.get(cat)?.push(id);
  }

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-4 overflow-y-auto max-h-[520px]">
      <div className="mb-4">
        <button
          onClick={onSelectEraser}
          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
            toolMode === "eraser"
              ? "border-red-400/50 bg-red-500/10 text-red-400"
              : "border-card-border text-muted hover:text-foreground"
          }`}
        >
          Eraser (sets tile to -1)
        </button>
      </div>

      {categories.map((cat) => {
        const ids = tilesByCategory.get(cat) ?? [];
        return (
          <div key={cat} className="mb-4">
            <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-2">{cat}</h3>
            <div
              className="grid gap-0.5"
              style={{ gridTemplateColumns: `repeat(${SPRITESHEET_COLS}, 32px)` }}
            >
              {ids.map((id) => {
                const isSelected = selectedTileId === id && toolMode === "tile";
                return (
                  <div
                    key={id}
                    title={`Tile ${id} (row ${Math.floor(id / SPRITESHEET_COLS)}, col ${id % SPRITESHEET_COLS}) — ${cat}`}
                    className="relative cursor-pointer"
                    onMouseEnter={() => setHoverId(id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => onSelectTile(id)}
                  >
                    <canvas
                      ref={(el) => {
                        if (el) {
                          canvasRefs.current.set(id, el);
                          if (spritesheet) {
                            const ctx = el.getContext("2d");
                            if (ctx) {
                              ctx.imageSmoothingEnabled = false;
                              const srcCol = id % SPRITESHEET_COLS;
                              const srcRow = Math.floor(id / SPRITESHEET_COLS);
                              ctx.drawImage(spritesheet, srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, 32, 32);
                            }
                          }
                        }
                      }}
                      width={32}
                      height={32}
                      style={{ imageRendering: "pixelated", display: "block" }}
                    />
                    {isSelected && <div className="absolute inset-0 ring-2 ring-accent pointer-events-none" />}
                    {hoverId === id && !isSelected && <div className="absolute inset-0 ring-1 ring-accent/50 bg-accent/10 pointer-events-none" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {hoverId !== null && (
        <div className="mt-2 text-xs text-muted">
          Tile ID: {hoverId} — row {Math.floor(hoverId / SPRITESHEET_COLS)}, col {hoverId % SPRITESHEET_COLS} — {getTileCategory(hoverId)}
        </div>
      )}
    </div>
  );
}
