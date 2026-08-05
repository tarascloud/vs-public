"use client";

import { useState, useCallback } from "react";
import type { OfficeLayout } from "@/app/studio/data/office-layout";
import { GRID_COLS, GRID_ROWS } from "@/app/studio/data/office-layout";

const MAX_HISTORY = 50;

export function cloneLayout(l: OfficeLayout): OfficeLayout {
  return {
    name: l.name,
    floor: l.floor.map((r) => [...r]),
    walls: l.walls.map((r) => [...r]),
    furniture: l.furniture.map((f) => ({ ...f })),
    deskAnchors: (l.deskAnchors ?? []).map((a) => ({ ...a })),
    loungeAnchors: (l.loungeAnchors ?? []).map((a) => ({ ...a })),
  };
}

export function emptyLayout(): OfficeLayout {
  return {
    name: "New Layout",
    floor: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(-1)),
    walls: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(-1)),
    furniture: [],
    deskAnchors: [],
    loungeAnchors: [],
  };
}

export function useEditorLayout(initialLayout: OfficeLayout) {
  const [layout, setLayout] = useState<OfficeLayout>(() => cloneLayout(initialLayout));
  const [history, setHistory] = useState<OfficeLayout[]>([]);
  const [future, setFuture] = useState<OfficeLayout[]>([]);

  const pushHistory = useCallback(
    (prev: OfficeLayout) => {
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), prev]);
      setFuture([]);
    },
    []
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      const rest = h.slice(0, -1);
      setFuture((f) => [layout, ...f]);
      setLayout(cloneLayout(prev));
      return rest;
    });
  }, [layout]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      const rest = f.slice(1);
      setHistory((h) => [...h, layout]);
      setLayout(cloneLayout(next));
      return rest;
    });
  }, [layout]);

  return {
    layout,
    setLayout,
    history,
    future,
    pushHistory,
    undo,
    redo,
  };
}
