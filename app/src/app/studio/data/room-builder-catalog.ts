/**
 * Room Builder Office 32x32 tileset catalog
 * Spritesheet: /assets/office/Room_Builder_Office_32x32.png
 * Size: 512x448px — 16 columns × 14 rows of 32x32 tiles
 *
 * Tile index: row * 16 + col (0-based)
 */

export interface RoomTileInfo {
  id: number;
  name: string;
  category: 'wall-structure' | 'wall-fill' | 'floor';
  /** 1–6 for floor tile sets */
  floorSet?: number;
  row: number;
  col: number;
}

/** Returns the pixel rect of a tile in the spritesheet */
export function getRoomTileRect(tileId: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const col = tileId % 16;
  const row = Math.floor(tileId / 16);
  return { x: col * 32, y: row * 32, w: 32, h: 32 };
}

// ---------------------------------------------------------------------------
// Wall structure — Rows 0-2 (tiles 0–47)
// Line-art style. The layout within these rows:
//   Cols 0-7:  core wall geometry (corners, straights, T/X junctions)
//   Cols 8-11: door / window unit
//   Cols 12-15: sparse wall pieces (angled corners, transitions)
// ---------------------------------------------------------------------------

// Row 0 — top wall pieces
//   col 0: top-left outer corner
//   col 1: top edge (horizontal)
//   col 2: top-right outer corner
//   col 3: top T-junction (wall going down)
//   col 4: left T-junction (wall going right)
//   col 5: right T-junction (wall going left)
//   col 6: bottom T-junction (wall going up)
//   col 7: cross / X junction
//   col 8: door top-left
//   col 9: door top-right
//   col 10: window top-left
//   col 11: window top-right
//   col 12: top-left inner corner
//   col 13: top-right inner corner
//   col 14: (empty/transparent)
//   col 15: (empty/transparent)

// Row 1 — mid wall pieces
//   col 0: left edge (vertical)
//   col 1: wall fill (interior)
//   col 2: right edge (vertical)
//   col 3: left-right horizontal wall
//   col 4: top-bottom vertical wall
//   col 5: (empty/transparent)
//   col 6: (empty/transparent)
//   col 7: (empty/transparent)
//   col 8: door bottom-left (open)
//   col 9: door bottom-right (open)
//   col 10: window bottom-left
//   col 11: window bottom-right
//   col 12: bottom-left inner corner
//   col 13: bottom-right inner corner
//   col 14: (empty/transparent)
//   col 15: (empty/transparent)

// Row 2 — bottom wall pieces
//   col 0: bottom-left outer corner
//   col 1: bottom edge (horizontal)
//   col 2: bottom-right outer corner
//   col 3-7: (empty/transparent)
//   col 8-11: (empty/transparent)
//   col 12-15: (empty/transparent)

export const ROOM_TILES: Record<number, RoomTileInfo> = {
  // ── Row 0 — Wall structure top ────────────────────────────────────────────
  0: { id: 0, name: 'wall-corner-top-left', category: 'wall-structure', row: 0, col: 0 },
  1: { id: 1, name: 'wall-edge-top', category: 'wall-structure', row: 0, col: 1 },
  2: { id: 2, name: 'wall-corner-top-right', category: 'wall-structure', row: 0, col: 2 },
  3: { id: 3, name: 'wall-t-top', category: 'wall-structure', row: 0, col: 3 },
  4: { id: 4, name: 'wall-t-left', category: 'wall-structure', row: 0, col: 4 },
  5: { id: 5, name: 'wall-t-right', category: 'wall-structure', row: 0, col: 5 },
  6: { id: 6, name: 'wall-t-bottom', category: 'wall-structure', row: 0, col: 6 },
  7: { id: 7, name: 'wall-cross', category: 'wall-structure', row: 0, col: 7 },
  8: { id: 8, name: 'door-top-left', category: 'wall-structure', row: 0, col: 8 },
  9: { id: 9, name: 'door-top-right', category: 'wall-structure', row: 0, col: 9 },
  10: { id: 10, name: 'window-top-left', category: 'wall-structure', row: 0, col: 10 },
  11: { id: 11, name: 'window-top-right', category: 'wall-structure', row: 0, col: 11 },
  12: { id: 12, name: 'wall-inner-corner-top-left', category: 'wall-structure', row: 0, col: 12 },
  13: { id: 13, name: 'wall-inner-corner-top-right', category: 'wall-structure', row: 0, col: 13 },

  // ── Row 1 — Wall structure mid ────────────────────────────────────────────
  16: { id: 16, name: 'wall-edge-left', category: 'wall-structure', row: 1, col: 0 },
  17: { id: 17, name: 'wall-fill', category: 'wall-structure', row: 1, col: 1 },
  18: { id: 18, name: 'wall-edge-right', category: 'wall-structure', row: 1, col: 2 },
  19: { id: 19, name: 'wall-horizontal', category: 'wall-structure', row: 1, col: 3 },
  20: { id: 20, name: 'wall-vertical', category: 'wall-structure', row: 1, col: 4 },
  24: { id: 24, name: 'door-bottom-left', category: 'wall-structure', row: 1, col: 8 },
  25: { id: 25, name: 'door-bottom-right', category: 'wall-structure', row: 1, col: 9 },
  26: { id: 26, name: 'window-bottom-left', category: 'wall-structure', row: 1, col: 10 },
  27: { id: 27, name: 'window-bottom-right', category: 'wall-structure', row: 1, col: 11 },
  28: { id: 28, name: 'wall-inner-corner-bottom-left', category: 'wall-structure', row: 1, col: 12 },
  29: { id: 29, name: 'wall-inner-corner-bottom-right', category: 'wall-structure', row: 1, col: 13 },

  // ── Row 2 — Wall structure bottom ─────────────────────────────────────────
  32: { id: 32, name: 'wall-corner-bottom-left', category: 'wall-structure', row: 2, col: 0 },
  33: { id: 33, name: 'wall-edge-bottom', category: 'wall-structure', row: 2, col: 1 },
  34: { id: 34, name: 'wall-corner-bottom-right', category: 'wall-structure', row: 2, col: 2 },

  // ── Rows 3-4 — Floor set 1: light purple / lavender ──────────────────────
  // Row 3 top half, Row 4 bottom half — each column is a variant
  48: { id: 48, name: 'floor-lavender-top-left', category: 'floor', floorSet: 1, row: 3, col: 0 },
  49: { id: 49, name: 'floor-lavender-top-mid', category: 'floor', floorSet: 1, row: 3, col: 1 },
  50: { id: 50, name: 'floor-lavender-top-right', category: 'floor', floorSet: 1, row: 3, col: 2 },
  51: { id: 51, name: 'floor-lavender-top-col3', category: 'floor', floorSet: 1, row: 3, col: 3 },
  52: { id: 52, name: 'floor-lavender-top-col4', category: 'floor', floorSet: 1, row: 3, col: 4 },
  53: { id: 53, name: 'floor-lavender-top-col5', category: 'floor', floorSet: 1, row: 3, col: 5 },
  54: { id: 54, name: 'floor-lavender-top-col6', category: 'floor', floorSet: 1, row: 3, col: 6 },
  55: { id: 55, name: 'floor-lavender-top-col7', category: 'floor', floorSet: 1, row: 3, col: 7 },

  64: { id: 64, name: 'floor-lavender-bot-left', category: 'floor', floorSet: 1, row: 4, col: 0 },
  65: { id: 65, name: 'floor-lavender-bot-mid', category: 'floor', floorSet: 1, row: 4, col: 1 },
  66: { id: 66, name: 'floor-lavender-bot-right', category: 'floor', floorSet: 1, row: 4, col: 2 },
  67: { id: 67, name: 'floor-lavender-bot-col3', category: 'floor', floorSet: 1, row: 4, col: 3 },
  68: { id: 68, name: 'floor-lavender-bot-col4', category: 'floor', floorSet: 1, row: 4, col: 4 },
  69: { id: 69, name: 'floor-lavender-bot-col5', category: 'floor', floorSet: 1, row: 4, col: 5 },
  70: { id: 70, name: 'floor-lavender-bot-col6', category: 'floor', floorSet: 1, row: 4, col: 6 },
  71: { id: 71, name: 'floor-lavender-bot-col7', category: 'floor', floorSet: 1, row: 4, col: 7 },

  // ── Rows 5-6 — Floor set 2: grey stone ───────────────────────────────────
  80: { id: 80, name: 'floor-stone-top-left', category: 'floor', floorSet: 2, row: 5, col: 0 },
  81: { id: 81, name: 'floor-stone-top-mid', category: 'floor', floorSet: 2, row: 5, col: 1 },
  82: { id: 82, name: 'floor-stone-top-right', category: 'floor', floorSet: 2, row: 5, col: 2 },
  83: { id: 83, name: 'floor-stone-top-col3', category: 'floor', floorSet: 2, row: 5, col: 3 },
  84: { id: 84, name: 'floor-stone-top-col4', category: 'floor', floorSet: 2, row: 5, col: 4 },
  85: { id: 85, name: 'floor-stone-top-col5', category: 'floor', floorSet: 2, row: 5, col: 5 },
  86: { id: 86, name: 'floor-stone-top-col6', category: 'floor', floorSet: 2, row: 5, col: 6 },
  87: { id: 87, name: 'floor-stone-top-col7', category: 'floor', floorSet: 2, row: 5, col: 7 },

  96: { id: 96, name: 'floor-stone-bot-left', category: 'floor', floorSet: 2, row: 6, col: 0 },
  97: { id: 97, name: 'floor-stone-bot-mid', category: 'floor', floorSet: 2, row: 6, col: 1 },
  98: { id: 98, name: 'floor-stone-bot-right', category: 'floor', floorSet: 2, row: 6, col: 2 },
  99: { id: 99, name: 'floor-stone-bot-col3', category: 'floor', floorSet: 2, row: 6, col: 3 },
  100: { id: 100, name: 'floor-stone-bot-col4', category: 'floor', floorSet: 2, row: 6, col: 4 },
  101: { id: 101, name: 'floor-stone-bot-col5', category: 'floor', floorSet: 2, row: 6, col: 5 },
  102: { id: 102, name: 'floor-stone-bot-col6', category: 'floor', floorSet: 2, row: 6, col: 6 },
  103: { id: 103, name: 'floor-stone-bot-col7', category: 'floor', floorSet: 2, row: 6, col: 7 },

  // ── Rows 7-8 — Floor set 3: tan / beige brick ────────────────────────────
  112: { id: 112, name: 'floor-brick-top-left', category: 'floor', floorSet: 3, row: 7, col: 0 },
  113: { id: 113, name: 'floor-brick-top-mid', category: 'floor', floorSet: 3, row: 7, col: 1 },
  114: { id: 114, name: 'floor-brick-top-right', category: 'floor', floorSet: 3, row: 7, col: 2 },
  115: { id: 115, name: 'floor-brick-top-col3', category: 'floor', floorSet: 3, row: 7, col: 3 },
  116: { id: 116, name: 'floor-brick-top-col4', category: 'floor', floorSet: 3, row: 7, col: 4 },
  117: { id: 117, name: 'floor-brick-top-col5', category: 'floor', floorSet: 3, row: 7, col: 5 },
  118: { id: 118, name: 'floor-brick-top-col6', category: 'floor', floorSet: 3, row: 7, col: 6 },
  119: { id: 119, name: 'floor-brick-top-col7', category: 'floor', floorSet: 3, row: 7, col: 7 },

  128: { id: 128, name: 'floor-brick-bot-left', category: 'floor', floorSet: 3, row: 8, col: 0 },
  129: { id: 129, name: 'floor-brick-bot-mid', category: 'floor', floorSet: 3, row: 8, col: 1 },
  130: { id: 130, name: 'floor-brick-bot-right', category: 'floor', floorSet: 3, row: 8, col: 2 },
  131: { id: 131, name: 'floor-brick-bot-col3', category: 'floor', floorSet: 3, row: 8, col: 3 },
  132: { id: 132, name: 'floor-brick-bot-col4', category: 'floor', floorSet: 3, row: 8, col: 4 },
  133: { id: 133, name: 'floor-brick-bot-col5', category: 'floor', floorSet: 3, row: 8, col: 5 },
  134: { id: 134, name: 'floor-brick-bot-col6', category: 'floor', floorSet: 3, row: 8, col: 6 },
  135: { id: 135, name: 'floor-brick-bot-col7', category: 'floor', floorSet: 3, row: 8, col: 7 },

  // ── Rows 9-10 — Floor set 4: dark checkered / brown ──────────────────────
  144: { id: 144, name: 'floor-dark-top-left', category: 'floor', floorSet: 4, row: 9, col: 0 },
  145: { id: 145, name: 'floor-dark-top-mid', category: 'floor', floorSet: 4, row: 9, col: 1 },
  146: { id: 146, name: 'floor-dark-top-right', category: 'floor', floorSet: 4, row: 9, col: 2 },
  147: { id: 147, name: 'floor-dark-top-col3', category: 'floor', floorSet: 4, row: 9, col: 3 },
  148: { id: 148, name: 'floor-dark-top-col4', category: 'floor', floorSet: 4, row: 9, col: 4 },
  149: { id: 149, name: 'floor-dark-top-col5', category: 'floor', floorSet: 4, row: 9, col: 5 },
  150: { id: 150, name: 'floor-dark-top-col6', category: 'floor', floorSet: 4, row: 9, col: 6 },
  151: { id: 151, name: 'floor-dark-top-col7', category: 'floor', floorSet: 4, row: 9, col: 7 },

  160: { id: 160, name: 'floor-dark-bot-left', category: 'floor', floorSet: 4, row: 10, col: 0 },
  161: { id: 161, name: 'floor-dark-bot-mid', category: 'floor', floorSet: 4, row: 10, col: 1 },
  162: { id: 162, name: 'floor-dark-bot-right', category: 'floor', floorSet: 4, row: 10, col: 2 },
  163: { id: 163, name: 'floor-dark-bot-col3', category: 'floor', floorSet: 4, row: 10, col: 3 },
  164: { id: 164, name: 'floor-dark-bot-col4', category: 'floor', floorSet: 4, row: 10, col: 4 },
  165: { id: 165, name: 'floor-dark-bot-col5', category: 'floor', floorSet: 4, row: 10, col: 5 },
  166: { id: 166, name: 'floor-dark-bot-col6', category: 'floor', floorSet: 4, row: 10, col: 6 },
  167: { id: 167, name: 'floor-dark-bot-col7', category: 'floor', floorSet: 4, row: 10, col: 7 },

  // ── Rows 11-12 — Floor set 5: light lavender / near-white ────────────────
  176: { id: 176, name: 'floor-light-top-left', category: 'floor', floorSet: 5, row: 11, col: 0 },
  177: { id: 177, name: 'floor-light-top-mid', category: 'floor', floorSet: 5, row: 11, col: 1 },
  178: { id: 178, name: 'floor-light-top-right', category: 'floor', floorSet: 5, row: 11, col: 2 },
  179: { id: 179, name: 'floor-light-top-col3', category: 'floor', floorSet: 5, row: 11, col: 3 },
  180: { id: 180, name: 'floor-light-top-col4', category: 'floor', floorSet: 5, row: 11, col: 4 },
  181: { id: 181, name: 'floor-light-top-col5', category: 'floor', floorSet: 5, row: 11, col: 5 },
  182: { id: 182, name: 'floor-light-top-col6', category: 'floor', floorSet: 5, row: 11, col: 6 },
  183: { id: 183, name: 'floor-light-top-col7', category: 'floor', floorSet: 5, row: 11, col: 7 },

  192: { id: 192, name: 'floor-light-bot-left', category: 'floor', floorSet: 5, row: 12, col: 0 },
  193: { id: 193, name: 'floor-light-bot-mid', category: 'floor', floorSet: 5, row: 12, col: 1 },
  194: { id: 194, name: 'floor-light-bot-right', category: 'floor', floorSet: 5, row: 12, col: 2 },
  195: { id: 195, name: 'floor-light-bot-col3', category: 'floor', floorSet: 5, row: 12, col: 3 },
  196: { id: 196, name: 'floor-light-bot-col4', category: 'floor', floorSet: 5, row: 12, col: 4 },
  197: { id: 197, name: 'floor-light-bot-col5', category: 'floor', floorSet: 5, row: 12, col: 5 },
  198: { id: 198, name: 'floor-light-bot-col6', category: 'floor', floorSet: 5, row: 12, col: 6 },
  199: { id: 199, name: 'floor-light-bot-col7', category: 'floor', floorSet: 5, row: 12, col: 7 },

  // ── Row 13 — Floor set 6: dark red / maroon ───────────────────────────────
  208: { id: 208, name: 'floor-red-col0', category: 'floor', floorSet: 6, row: 13, col: 0 },
  209: { id: 209, name: 'floor-red-col1', category: 'floor', floorSet: 6, row: 13, col: 1 },
  210: { id: 210, name: 'floor-red-col2', category: 'floor', floorSet: 6, row: 13, col: 2 },
  211: { id: 211, name: 'floor-red-col3', category: 'floor', floorSet: 6, row: 13, col: 3 },
  212: { id: 212, name: 'floor-red-col4', category: 'floor', floorSet: 6, row: 13, col: 4 },
  213: { id: 213, name: 'floor-red-col5', category: 'floor', floorSet: 6, row: 13, col: 5 },
  214: { id: 214, name: 'floor-red-col6', category: 'floor', floorSet: 6, row: 13, col: 6 },
  215: { id: 215, name: 'floor-red-col7', category: 'floor', floorSet: 6, row: 13, col: 7 },
};

// ---------------------------------------------------------------------------
// Convenience lookups
// ---------------------------------------------------------------------------

/** All wall-structure tile IDs */
export const WALL_STRUCTURE_IDS = Object.values(ROOM_TILES)
  .filter((t) => t.category === 'wall-structure')
  .map((t) => t.id);

/** Floor tile IDs grouped by set number */
export const FLOOR_SET_IDS: Record<number, number[]> = {};
for (const tile of Object.values(ROOM_TILES)) {
  if (tile.category === 'floor' && tile.floorSet != null) {
    if (!FLOOR_SET_IDS[tile.floorSet]) FLOOR_SET_IDS[tile.floorSet] = [];
    FLOOR_SET_IDS[tile.floorSet].push(tile.id);
  }
}

/**
 * Named aliases for the most commonly used tiles.
 * These are the canonical IDs to use when building rooms programmatically.
 */
export const WALL = {
  CORNER_TL: 0,
  CORNER_TR: 2,
  CORNER_BL: 32,
  CORNER_BR: 34,
  EDGE_TOP: 1,
  EDGE_BOTTOM: 33,
  EDGE_LEFT: 16,
  EDGE_RIGHT: 18,
  FILL: 17,
  T_TOP: 3,
  T_LEFT: 4,
  T_RIGHT: 5,
  T_BOTTOM: 6,
  CROSS: 7,
  INNER_CORNER_TL: 12,
  INNER_CORNER_TR: 13,
  INNER_CORNER_BL: 28,
  INNER_CORNER_BR: 29,
  HORIZONTAL: 19,
  VERTICAL: 20,
  DOOR_TL: 8,
  DOOR_TR: 9,
  DOOR_BL: 24,
  DOOR_BR: 25,
  WINDOW_TL: 10,
  WINDOW_TR: 11,
  WINDOW_BL: 26,
  WINDOW_BR: 27,
} as const;

/** Default floor fill tile per set (the plain centre tile) */
export const FLOOR_FILL: Record<number, number> = {
  1: 49,  // floor-lavender-top-mid
  2: 81,  // floor-stone-top-mid
  3: 113, // floor-brick-top-mid
  4: 145, // floor-dark-top-mid
  5: 177, // floor-light-top-mid
  6: 209, // floor-red-col1
};
