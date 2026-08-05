"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import type { OfficeLayout } from "@/app/studio/data/office-layout";
import { GRID_COLS, GRID_ROWS } from "@/app/studio/data/office-layout";
import { DEFAULT_OFFICE_LAYOUT } from "@/app/studio/data/default-office-layout";
import { useEditorLayout, cloneLayout, emptyLayout } from "./hooks/use-editor-layout";
import { useCanvasRenderer } from "./hooks/use-canvas-renderer";
import { useCanvasInteraction } from "./hooks/use-canvas-interaction";
import TilePalette from "./components/tile-palette";
import FurniturePalette from "./components/furniture-palette";

type ToolMode = "tile" | "furniture" | "eraser" | "anchor-desk" | "anchor-lounge";
type PaletteTab = "tiles" | "furniture";

const SPRITESHEET_COLS = 16;
const SPRITESHEET_ROWS = 14;
const CANVAS_W = 512;
const CANVAS_H = 544;
const CANVAS_SCALE = 2;

export default function OfficeEditorPage() {
  const t = useTranslations("admin");

  const { layout, setLayout, history, future, pushHistory, undo, redo } = useEditorLayout(DEFAULT_OFFICE_LAYOUT);

  // Auto-load saved layout on mount
  useEffect(() => {
    fetch("/api/office-layout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (saved && saved.floor && saved.furniture) {
          setLayout({
            name: saved.name ?? "Saved Layout",
            floor: saved.floor,
            walls: saved.walls ?? Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(-1)),
            furniture: saved.furniture,
            deskAnchors: saved.deskAnchors ?? [],
            loungeAnchors: saved.loungeAnchors ?? [],
          });
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tool state
  const [paletteTab, setPaletteTab] = useState<PaletteTab>("tiles");
  const [toolMode, setToolMode] = useState<ToolMode>("tile");
  const [selectedTileId, setSelectedTileId] = useState<number>(107);
  const [selectedSingleId, setSelectedSingleId] = useState<number | null>(null);
  const [selectedFurnitureIdx, setSelectedFurnitureIdx] = useState<number | null>(null);
  const [selectedAnchorIdx, setSelectedAnchorIdx] = useState<{ type: "desk" | "lounge"; idx: number } | null>(null);

  // Layer visibility
  const [showFloor, setShowFloor] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);

  // Message / import
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Shared canvas ref (renderer writes to it, interaction reads from it)
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas interaction
  const interaction = useCanvasInteraction(
    canvasRef,
    layout, setLayout, pushHistory,
    toolMode, selectedTileId, selectedSingleId, setSelectedSingleId,
    selectedFurnitureIdx, setSelectedFurnitureIdx,
    selectedAnchorIdx, setSelectedAnchorIdx,
  );

  // Canvas renderer (read-only rendering, uses same canvasRef)
  const rendererState = {
    showFloor, showFurniture, showGrid, showAnchors,
    hoverCell: interaction.hoverCell,
    hoverFurnitureIdx: interaction.hoverFurnitureIdx,
    selectedFurnitureIdx,
    selectedSingleId,
    toolMode,
    cursorPos: interaction.cursorPos,
    selectedAnchorIdx,
    hoverAnchorIdx: interaction.hoverAnchorIdx,
  };
  const { spritesheetRef, loadFurnitureImage } = useCanvasRenderer(layout, rendererState, canvasRef);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFurnitureIdx !== null) {
        e.preventDefault();
        pushHistory(layout);
        setLayout((prev) => { const next = cloneLayout(prev); next.furniture.splice(selectedFurnitureIdx, 1); return next; });
        setSelectedFurnitureIdx(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnchorIdx !== null) {
        e.preventDefault();
        pushHistory(layout);
        if (selectedAnchorIdx.type === "desk") {
          setLayout((prev) => { const next = cloneLayout(prev); next.deskAnchors.splice(selectedAnchorIdx.idx, 1); return next; });
        } else {
          setLayout((prev) => { const next = cloneLayout(prev); next.loungeAnchors.splice(selectedAnchorIdx.idx, 1); return next; });
        }
        setSelectedAnchorIdx(null);
      }
      if (e.key === "Escape") {
        setSelectedFurnitureIdx(null); setSelectedSingleId(null); setSelectedAnchorIdx(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo, selectedFurnitureIdx, selectedAnchorIdx, layout, pushHistory, setLayout]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showMsg = useCallback((text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // ── Toolbar actions ────────────────────────────────────────────────────────

  const handleExportJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(layout, null, 2)).then(
      () => showMsg("Layout JSON copied to clipboard!"),
      () => showMsg("Clipboard write failed", "error")
    );
  };

  const handleImportJSON = () => {
    try {
      const parsed = JSON.parse(importText) as OfficeLayout;
      if (!parsed.floor || !parsed.walls || !Array.isArray(parsed.furniture)) throw new Error("Invalid layout format");
      pushHistory(layout); setLayout(parsed); setImportText(""); setShowImport(false);
      showMsg("Layout imported successfully!");
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Invalid JSON", "error");
    }
  };

  const handleLoadCurrent = async () => {
    try {
      const res = await fetch("/api/office-layout", { cache: "no-store" });
      if (!res.ok) { showMsg("Failed to fetch layout from server", "error"); return; }
      const saved = await res.json();
      if (!saved || !saved.floor || !saved.furniture) {
        pushHistory(layout); setLayout(cloneLayout(DEFAULT_OFFICE_LAYOUT));
        showMsg("No saved layout — loaded default from file"); return;
      }
      pushHistory(layout);
      setLayout({
        name: saved.name ?? "Saved Layout", floor: saved.floor,
        walls: saved.walls ?? Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(-1)),
        furniture: saved.furniture, deskAnchors: saved.deskAnchors ?? [], loungeAnchors: saved.loungeAnchors ?? [],
      });
      showMsg("Current layout loaded from /studio");
    } catch { showMsg("Network error loading layout", "error"); }
  };

  const handleLoadDefault = () => {
    pushHistory(layout); setLayout(cloneLayout(DEFAULT_OFFICE_LAYOUT)); showMsg("Default layout loaded from file");
  };

  const handleReset = () => {
    pushHistory(layout); setLayout(emptyLayout()); setSelectedFurnitureIdx(null); showMsg("Layout cleared");
  };

  const handleFlipSelected = () => {
    if (selectedFurnitureIdx === null) return;
    setLayout((prev) => {
      const next = cloneLayout(prev);
      next.furniture[selectedFurnitureIdx].flipX = !next.furniture[selectedFurnitureIdx].flipX;
      return next;
    });
  };

  const handleBringToFront = () => {
    if (selectedFurnitureIdx === null) return;
    pushHistory(layout);
    setLayout((prev) => {
      const next = cloneLayout(prev);
      const [item] = next.furniture.splice(selectedFurnitureIdx, 1);
      next.furniture.push(item);
      return next;
    });
    setSelectedFurnitureIdx(layout.furniture.length - 1);
  };

  const handleSaveLayout = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/office-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: layout.name, floor: layout.floor, walls: layout.walls,
          furniture: layout.furniture, deskAnchors: layout.deskAnchors ?? [],
          loungeAnchors: layout.loungeAnchors ?? [],
        }),
      });
      if (res.ok) {
        showMsg("Layout saved! It will appear on /studio?tab=office");
      } else {
        const err = await res.json().catch(() => ({}));
        showMsg(err.error ?? "Failed to save layout", "error");
      }
    } catch { showMsg("Network error saving layout", "error"); }
    finally { setIsSaving(false); }
  };

  // ── Cursor ─────────────────────────────────────────────────────────────────

  const canvasCursor =
    toolMode === "eraser" ? "crosshair"
    : (toolMode === "anchor-desk" || toolMode === "anchor-lounge")
      ? interaction.isDraggingAnchor ? "grabbing" : interaction.hoverAnchorIdx !== null ? "grab" : "crosshair"
    : toolMode === "furniture" && selectedSingleId !== null ? "copy"
    : interaction.isDraggingFurniture ? "grabbing"
    : interaction.hoverFurnitureIdx !== null ? "grab"
    : "default";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col min-h-screen pt-20">
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
                  {t("officeEditor")}
                </span>
              </h1>
              <p className="text-muted text-sm mt-1">Visual tile &amp; furniture editor for the VS office layout</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="px-2 py-1 rounded bg-card-bg border border-card-border">{GRID_COLS}×{GRID_ROWS} grid</span>
              <span className="px-2 py-1 rounded bg-card-bg border border-card-border">{layout.furniture.length} furniture items</span>
            </div>
          </div>

          {/* Toast */}
          {message && (
            <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg border text-sm transition-all ${
              message.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {message.text}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-card-bg border border-card-border rounded-xl">
            {/* Tool mode */}
            <div className="flex items-center gap-1 border-r border-card-border pr-3 mr-1">
              <span className="text-xs text-muted mr-1">Tool:</span>
              {(["tile", "eraser", "furniture"] as ToolMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setToolMode(mode);
                    if (mode !== "furniture") setSelectedSingleId(null);
                    if (mode === "furniture") setPaletteTab("furniture");
                    if (mode === "tile" || mode === "eraser") setPaletteTab("tiles");
                    setSelectedAnchorIdx(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    toolMode === mode ? "bg-accent text-white" : "bg-background border border-card-border text-muted hover:text-foreground"
                  }`}
                >
                  {mode === "tile" ? "Tile Brush" : mode === "eraser" ? "Eraser" : "Furniture"}
                </button>
              ))}
              <button
                onClick={() => { setToolMode("anchor-desk"); setSelectedSingleId(null); setSelectedFurnitureIdx(null); setSelectedAnchorIdx(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  toolMode === "anchor-desk" ? "bg-blue-600 text-white" : "bg-background border border-card-border text-muted hover:text-foreground"
                }`}
                title="Place desk anchors (where agents sit when working)"
              >
                Desk Anchor
              </button>
              <button
                onClick={() => { setToolMode("anchor-lounge"); setSelectedSingleId(null); setSelectedFurnitureIdx(null); setSelectedAnchorIdx(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  toolMode === "anchor-lounge" ? "bg-green-600 text-white" : "bg-background border border-card-border text-muted hover:text-foreground"
                }`}
                title="Place lounge anchors (where agents sit when idle)"
              >
                Lounge Anchor
              </button>
            </div>

            {/* Undo/Redo */}
            <div className="flex items-center gap-1 border-r border-card-border pr-3 mr-1">
              <button onClick={undo} disabled={history.length === 0} title="Undo (Ctrl+Z)"
                className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Undo ({history.length})
              </button>
              <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)"
                className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Redo ({future.length})
              </button>
            </div>

            {/* Selected furniture actions */}
            {selectedFurnitureIdx !== null && (
              <div className="flex items-center gap-1 border-r border-card-border pr-3 mr-1">
                <button onClick={handleFlipSelected}
                  className="px-3 py-1.5 rounded-lg text-xs border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                  Flip X
                </button>
                <button onClick={handleBringToFront}
                  className="px-3 py-1.5 rounded-lg text-xs border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                  title="Move to end of array — renders on top of all other furniture">
                  Bring to Front
                </button>
                <button
                  onClick={() => {
                    pushHistory(layout);
                    setLayout((prev) => { const next = cloneLayout(prev); next.furniture.splice(selectedFurnitureIdx, 1); return next; });
                    setSelectedFurnitureIdx(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                  Delete
                </button>
                <span className="text-xs text-muted">
                  #{layout.furniture[selectedFurnitureIdx]?.singleId} at ({layout.furniture[selectedFurnitureIdx]?.x},{layout.furniture[selectedFurnitureIdx]?.y})
                </span>
              </div>
            )}

            {/* Layout actions */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => {
                  if (!window.confirm(`Delete all ${layout.furniture.length} furniture items?`)) return;
                  pushHistory(layout);
                  setLayout((prev) => ({ ...prev, furniture: [] }));
                  setSelectedFurnitureIdx(null);
                  showMsg("All furniture removed");
                }}
                disabled={layout.furniture.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Delete All
              </button>
              <button onClick={handleLoadCurrent} className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground transition-colors">Load Current</button>
              <button onClick={handleLoadDefault} className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground transition-colors">Load Default</button>
              <button onClick={handleReset} className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground transition-colors">Reset</button>
              <button onClick={() => setShowImport((v) => !v)} className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground transition-colors">Import JSON</button>
              <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg text-xs border border-card-border text-muted hover:text-foreground transition-colors">Export JSON</button>
              <button onClick={handleSaveLayout} disabled={isSaving}
                className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Import panel */}
          {showImport && (
            <div className="mb-4 p-4 bg-card-bg border border-card-border rounded-xl">
              <p className="text-xs text-muted mb-2">Paste OfficeLayout JSON:</p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-xs font-mono focus:outline-none focus:border-accent/50 resize-y"
                placeholder='{ "name": "...", "floor": [...], "walls": [...], "furniture": [...] }'
              />
              <div className="flex gap-2 mt-2">
                <button onClick={handleImportJSON} className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent/80 transition-colors">Import</button>
                <button onClick={() => { setShowImport(false); setImportText(""); }}
                  className="px-4 py-1.5 rounded-lg border border-card-border text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Main editor area */}
          <div className="flex gap-4">
            {/* Left: Canvas */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-muted">Layers:</span>
                {[
                  { label: "Floor", val: showFloor, set: setShowFloor },
                  { label: "Furniture", val: showFurniture, set: setShowFurniture },
                  { label: "Grid", val: showGrid, set: setShowGrid },
                  { label: "Anchors", val: showAnchors, set: setShowAnchors },
                ].map(({ label, val, set }) => (
                  <button key={label} onClick={() => set((v) => !v)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      val ? "bg-accent/20 text-accent border border-accent/30" : "bg-card-bg border border-card-border text-muted"
                    }`}>
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-xs text-muted">
                  {interaction.hoverCell
                    ? `Cell (${interaction.hoverCell.col}, ${interaction.hoverCell.row}) — tile ID ${interaction.hoverCell.col + interaction.hoverCell.row * GRID_COLS}`
                    : interaction.cursorPos
                    ? `Pixel (${Math.round(interaction.cursorPos.x)}, ${Math.round(interaction.cursorPos.y)})`
                    : ""}
                </span>
              </div>

              <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden p-1">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W * CANVAS_SCALE}
                  height={CANVAS_H * CANVAS_SCALE}
                  style={{ width: CANVAS_W, height: CANVAS_H, imageRendering: "pixelated", cursor: canvasCursor, display: "block" }}
                  onMouseDown={interaction.handleMouseDown}
                  onMouseMove={interaction.handleMouseMove}
                  onMouseUp={interaction.handleMouseUp}
                  onMouseLeave={interaction.handleMouseLeave}
                  onContextMenu={interaction.handleContextMenu}
                />
              </div>

              <div className="mt-2 text-xs text-muted flex gap-4">
                <span>Ctrl+Z undo</span>
                <span>Ctrl+Y redo</span>
                <span>Delete — remove selection</span>
                <span>Shift — free placement</span>
                <span>Esc — deselect</span>
              </div>
              {(toolMode === "anchor-desk" || toolMode === "anchor-lounge") && (
                <div className="mt-1 text-xs flex gap-4">
                  <span className={toolMode === "anchor-desk" ? "text-blue-400" : "text-green-400"}>
                    {toolMode === "anchor-desk" ? "Desk Anchor mode" : "Lounge Anchor mode"}
                    {" — "}
                    {(toolMode === "anchor-desk" ? (layout.deskAnchors ?? []) : (layout.loungeAnchors ?? [])).length} points
                  </span>
                  <span className="text-muted">click to add · drag to move · right-click to delete</span>
                </div>
              )}
            </div>

            {/* Right: Palette */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-1 mb-3">
                {(["tiles", "furniture"] as PaletteTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setPaletteTab(tab);
                      if (tab === "tiles") setToolMode("tile");
                      if (tab === "furniture") setToolMode("furniture");
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                      paletteTab === tab ? "bg-accent text-white" : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                    }`}
                  >
                    {tab === "tiles" ? "Tiles" : "Furniture"}
                    <span className="ml-1.5 text-xs opacity-60">
                      {tab === "tiles" ? `${SPRITESHEET_COLS * SPRITESHEET_ROWS}` : "339"}
                    </span>
                  </button>
                ))}
              </div>

              {paletteTab === "tiles" && (
                <TilePalette
                  spritesheet={spritesheetRef.current}
                  selectedTileId={selectedTileId}
                  toolMode={toolMode}
                  onSelectTile={(id) => { setSelectedTileId(id); setToolMode("tile"); }}
                  onSelectEraser={() => setToolMode("eraser")}
                />
              )}

              {paletteTab === "furniture" && (
                <FurniturePalette
                  selectedSingleId={selectedSingleId}
                  onSelect={(id) => { setSelectedSingleId(id === selectedSingleId ? null : id); setSelectedFurnitureIdx(null); }}
                  onClearSelection={() => setSelectedSingleId(null)}
                  loadImage={loadFurnitureImage}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
