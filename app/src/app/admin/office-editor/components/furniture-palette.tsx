"use client";

import { useState, useRef, useEffect } from "react";

const FURNITURE_SPRITE_W = 64;
const FURNITURE_SPRITE_H = 96;
const FURNITURE_PAGE_SIZE = 40;
const FURNITURE_TOTAL = 339;

export interface FurniturePaletteProps {
  selectedSingleId: number | null;
  onSelect: (id: number) => void;
  onClearSelection: () => void;
  loadImage: (id: number) => Promise<HTMLImageElement>;
}

export default function FurniturePalette({ selectedSingleId, onSelect, onClearSelection, loadImage }: FurniturePaletteProps) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [loadedIds, setLoadedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const THUMB_W = FURNITURE_SPRITE_W;
  const THUMB_H = FURNITURE_SPRITE_H;
  const totalPages = Math.ceil(FURNITURE_TOTAL / FURNITURE_PAGE_SIZE);
  const pageStart = page * FURNITURE_PAGE_SIZE + 1;
  const pageEnd = Math.min(pageStart + FURNITURE_PAGE_SIZE - 1, FURNITURE_TOTAL);
  const visibleIds = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);

  useEffect(() => {
    visibleIds.forEach((id) => {
      loadImage(id).then((img) => {
        const canvas = canvasRefs.current.get(id);
        if (canvas && img.naturalWidth > 0) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, THUMB_W, THUMB_H);
            ctx.drawImage(img, 0, 0, THUMB_W, THUMB_H);
          }
          setLoadedIds((prev) => new Set(prev).add(id));
        }
      });
    });
  }, [visibleIds.join(","), loadImage]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-4 overflow-y-auto max-h-[520px]">
      <p className="text-xs text-muted mb-2">
        Click to select, then click canvas to place. Right-click canvas item to delete.
      </p>

      {selectedSingleId !== null && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
          <span className="text-xs text-accent">Placing: Single #{selectedSingleId}</span>
          <button
            onClick={onClearSelection}
            className="ml-auto text-xs px-2 py-0.5 rounded border border-card-border text-muted hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-2 py-1 rounded text-xs border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        <span className="text-xs text-muted flex-1 text-center">
          #{pageStart}–{pageEnd} of {FURNITURE_TOTAL} (page {page + 1}/{totalPages})
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded text-xs border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              page === i
                ? "bg-accent text-white"
                : "bg-background border border-card-border text-muted hover:text-foreground"
            }`}
          >
            {i * FURNITURE_PAGE_SIZE + 1}–{Math.min((i + 1) * FURNITURE_PAGE_SIZE, FURNITURE_TOTAL)}
          </button>
        ))}
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${THUMB_W}px)` }}
      >
        {visibleIds.map((id) => {
          const isSelected = selectedSingleId === id;
          const isLoaded = loadedIds.has(id);
          return (
            <div
              key={id}
              title={`Single #${id}`}
              className="relative cursor-pointer rounded overflow-hidden"
              style={{ width: THUMB_W, height: THUMB_H }}
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(id)}
            >
              <div
                className="absolute inset-0"
                style={{ background: "repeating-conic-gradient(#1a1a1a 0% 25%, #222 0% 50%) 0 0 / 8px 8px" }}
              />
              <canvas
                ref={(el) => { if (el) canvasRefs.current.set(id, el); }}
                width={THUMB_W}
                height={THUMB_H}
                style={{ imageRendering: "pixelated", display: "block", position: "relative", zIndex: 1 }}
              />
              {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <span className="text-[8px] text-muted">{id}</span>
                </div>
              )}
              {isSelected && <div className="absolute inset-0 ring-2 ring-accent z-20 pointer-events-none" />}
              {hoverId === id && !isSelected && <div className="absolute inset-0 ring-1 ring-accent/50 bg-accent/10 z-20 pointer-events-none" />}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white text-center z-30 leading-tight py-0.5">
                #{id}
              </div>
            </div>
          );
        })}
      </div>

      {hoverId !== null && (
        <div className="mt-2 text-xs text-muted">
          Single #{hoverId} — {FURNITURE_SPRITE_W}×{FURNITURE_SPRITE_H}px
        </div>
      )}
    </div>
  );
}
