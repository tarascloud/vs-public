import type { OfficeLayout } from './office-layout';

// Auto-matched tile grid from office-bg.png → Room_Builder_Office_32x32.png
// Tile ID = row * 16 + col in the Room_Builder spritesheet
// Wall structure tiles are included in the floor layer (no separate walls needed)
//
// Key floor fill tiles (right half of Room_Builder):
//   107 (row 6, col 11) = grey stone fill — main workspace
//   110 (row 6, col 14) = grey stone variant — bottom rooms
//
// Furniture singleIds → Modern_Office_Singles_32x32_{N}.png (each 64×96px)

export const DEFAULT_OFFICE_LAYOUT: OfficeLayout = {
  name: 'Vibe Studio HQ',

  // ── Floor layer (auto-matched from office-bg.png) ──────────────────────────
  // Combined floor + wall tiles in a single grid.
  // Interior cells use uniform fill (107/110), edge cells use matched wall tiles.
  floor: [
    //  c0   c1   c2   c3   c4   c5   c6   c7   c8   c9  c10  c11  c12  c13  c14  c15
    [  23, 177, 177, 177, 177, 177, 177, 177, 113, 177, 177, 177, 177, 177, 177,  25], // row 0  — top wall
    [  39, 193, 107, 193, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 1
    [ 178,  91, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  91,   4], // row 2
    [ 194, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 3
    [  91, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 4
    [ 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 5  — chairs row
    [  49, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 6
    [  39, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 7
    [  39, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 8
    [  39, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,   4], // row 9  — chairs row
    [   4,  24,  24,  24,  24,  24, 107, 107, 107, 107,  24,  24,  24,  24,   5,   4], // row 10 — divider wall with central passage
    [  16, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  18,   4], // row 11 — lounge
    [  16, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  18,   4], // row 12
    [  16, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  18,   4], // row 13
    [  16, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  18,   4], // row 14
    [  16, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107, 107,  18,   4], // row 15
    [  32,  33,  33,  33,  33,  33,  33,  33,  33,  33,  33,  33,  33,  33,  34,   4], // row 16 — bottom wall
  ],

  // ── Wall layer (not used — walls are baked into floor grid) ────────────────
  walls: [
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
  ],

  // ── Furniture layer ────────────────────────────────────────────────────────
  // Auto-detected via template matching (4px step, score<8) against office-bg.png.
  // 62 unique placements. Each single is 64×96px.
  furniture: [
    // ═══════════════════════════════════════════════════════════════════════
    // TOP WALL (y < 32)
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 170, x:  160, y:  -32 },  // wall whiteboard left
    { singleId: 114, x:  224, y:  -32 },  // wall item center
    { singleId: 171, x:  320, y:  -32 },  // wall whiteboard right
    { singleId: 333, x:   64, y:    0 },  // plant top-left
    { singleId: 237, x:   96, y:    0 },  // shelf accessory
    { singleId: 240, x:  128, y:    0 },  // computer case + items
    { singleId:  99, x:  384, y:    0 },  // plant top-right
    { singleId: 167, x:  416, y:    0 },  // cabinet top-right

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 1 DESK SURFACES (beige tables — rendered first, tech goes on top)
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 183, x:   64, y:   16 },  // desk surface 1a
    { singleId: 183, x:  128, y:   16 },  // desk surface 1b
    { singleId: 183, x:  192, y:   16 },  // desk surface 2a
    { singleId: 183, x:  256, y:   16 },  // desk surface 2b
    { singleId: 183, x:  320, y:   16 },  // desk surface 3
    { singleId: 183, x:  384, y:   16 },  // desk surface 4

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 1 TECH ON DESKS (y 32-96) — pixel-perfect from template matching
    // ═══════════════════════════════════════════════════════════════════════
    { singleId:  92, x:   32, y:   32 },  // AC / wall device left
    { singleId: 133, x:  320, y:   32 },  // monitor desk4
    { singleId:  92, x:  384, y:   32 },  // AC / wall device right
    { singleId: 156, x:  104, y:   40 },  // desk device row1
    { singleId: 119, x:  196, y:   42 },  // desk item between desk2-3
    { singleId: 242, x:  204, y:   42 },  // desk item between desk2-3
    { singleId: 177, x:  416, y:   46 },  // printer/shelf right wall
    { singleId: 119, x:  150, y:   48 },  // desk item desk1-2
    { singleId: 242, x:  158, y:   48 },  // desk item desk1-2
    { singleId: 119, x:  290, y:   48 },  // desk item desk3
    { singleId: 242, x:  298, y:   48 },  // desk item desk3
    { singleId: 157, x:  346, y:   50 },  // book on desk4
    { singleId: 308, x:  198, y:   58 },  // desk segment
    { singleId: 226, x:  256, y:   62 },  // desk combo desk3
    { singleId: 207, x:   64, y:   64 },  // partition left
    { singleId: 235, x:   96, y:   64 },  // desk+tech combo 1
    { singleId: 136, x:  128, y:   64 },  // monitor desk1
    { singleId: 308, x:  152, y:   64 },  // desk segment
    { singleId: 207, x:  160, y:   64 },  // partition desk1-2
    { singleId: 236, x:  160, y:   64 },  // desk+tech combo 2a
    { singleId: 229, x:  192, y:   64 },  // desk+tech combo 2b
    { singleId: 139, x:  224, y:   64 },  // monitor desk2
    { singleId: 207, x:  256, y:   64 },  // partition desk2-3
    { singleId: 230, x:  256, y:   64 },  // desk+tech combo 3a
    { singleId: 231, x:  288, y:   64 },  // desk+tech combo 3b
    { singleId: 308, x:  292, y:   64 },  // desk segment
    { singleId: 128, x:  320, y:   64 },  // desk item 4
    { singleId: 207, x:  352, y:   64 },  // partition desk3-4
    { singleId: 232, x:  352, y:   64 },  // desk+tech combo 4
    { singleId: 149, x:  442, y:   64 },  // printer right wall
    { singleId: 325, x:  416, y:   74 },  // printer station right

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 1 CHAIRS + UNDER-DESK (y 96-160)
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 106, x:  128, y:   96 },  // chair desk1
    { singleId: 106, x:  224, y:   96 },  // chair desk2
    { singleId: 106, x:  320, y:   96 },  // chair desk3/4
    { singleId: 239, x:   64, y:  128 },  // under-desk item
    { singleId: 243, x:   96, y:  128 },  // item
    { singleId: 244, x:  128, y:  128 },  // item
    { singleId:  80, x:  176, y:  128 },  // floor mat
    { singleId:  80, x:  196, y:  128 },  // floor mat
    { singleId: 238, x:  256, y:  128 },  // item
    { singleId: 241, x:  288, y:  128 },  // item
    { singleId: 119, x:  312, y:  128 },  // item
    { singleId: 242, x:  320, y:  128 },  // item
    { singleId:  80, x:  368, y:  128 },  // floor mat
    { singleId:  80, x:  388, y:  128 },  // floor mat

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 2 DESK SURFACES (beige tables)
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 183, x:   32, y:  144 },  // desk surface 5a
    { singleId: 183, x:   96, y:  144 },  // desk surface 5b
    { singleId: 308, x:  314, y:  144 },  // desk segment
    { singleId: 183, x:  160, y:  144 },  // desk surface 6a
    { singleId: 183, x:  224, y:  144 },  // desk surface 6b
    { singleId: 183, x:  288, y:  144 },  // desk surface 7
    { singleId: 183, x:  352, y:  144 },  // desk surface 8

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 2 TECH ON DESKS — pixel-perfect from template matching
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 129, x:  160, y:  160 },  // monitor desk6
    { singleId: 130, x:  192, y:  160 },  // monitor desk6
    { singleId: 156, x:  264, y:  168 },  // desk device
    { singleId: 119, x:   68, y:  170 },  // desk item desk5
    { singleId: 242, x:   76, y:  170 },  // desk item desk5
    { singleId: 119, x:  356, y:  170 },  // desk item desk8
    { singleId: 242, x:  364, y:  170 },  // desk item desk8
    { singleId: 119, x:  162, y:  176 },  // desk item desk6
    { singleId: 242, x:  170, y:  176 },  // desk item desk6
    { singleId: 158, x:  218, y:  176 },  // book on desk6-7
    { singleId: 119, x:  310, y:  176 },  // desk item desk7-8
    { singleId: 242, x:  318, y:  176 },  // desk item desk7-8
    { singleId: 308, x:   70, y:  186 },  // desk segment left
    { singleId: 308, x:  358, y:  186 },  // desk segment right
    { singleId: 225, x:   64, y:  190 },  // desk+tech combo 5
    { singleId: 226, x:  128, y:  190 },  // desk+tech combo 5b
    { singleId: 227, x:  160, y:  190 },  // desk+monitor combo 6
    { singleId: 228, x:  224, y:  190 },  // book desk6-7
    { singleId: 225, x:  352, y:  190 },  // desk+tech combo 8
    { singleId: 226, x:  416, y:  190 },  // desk+tech combo 8b
    { singleId: 207, x:   32, y:  192 },  // partition left wall
    { singleId: 136, x:   96, y:  192 },  // monitor desk5
    { singleId: 207, x:  128, y:  192 },  // partition desk5-6
    { singleId: 230, x:  128, y:  192 },  // desk combo 5
    { singleId: 308, x:  164, y:  192 },  // desk segment 6
    { singleId: 128, x:  192, y:  192 },  // desk item 6
    { singleId: 207, x:  224, y:  192 },  // partition desk6-7
    { singleId: 308, x:  312, y:  192 },  // desk segment 7-8
    { singleId: 207, x:  320, y:  192 },  // partition desk7-8
    { singleId: 234, x:  320, y:  192 },  // desk combo 8
    { singleId: 136, x:  384, y:  192 },  // monitor desk8
    { singleId: 207, x:  416, y:  192 },  // partition right
    { singleId: 230, x:  416, y:  192 },  // desk combo 8 right

    // ═══════════════════════════════════════════════════════════════════════
    // ROW 2 CHAIRS + MID ITEMS (y 224-320)
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 106, x:   96, y:  224 },  // chair desk5
    { singleId: 106, x:  192, y:  224 },  // chair desk6
    { singleId: 106, x:  288, y:  224 },  // chair desk7
    { singleId: 106, x:  384, y:  224 },  // chair desk8
    { singleId: 165, x:  128, y:  256 },  // shelf/console
    { singleId: 278, x:  256, y:  288 },  // chair back
    { singleId:  97, x:  384, y:  288 },  // wall painting right
    { singleId: 116, x:  416, y:  288 },  // equipment right wall

    // ═══════════════════════════════════════════════════════════════════════
    // BOTTOM — LOUNGE (full width, cols 0-14, rows 11-16)
    // No desks — sofas, coffee tables, plants only
    // ═══════════════════════════════════════════════════════════════════════
    { singleId: 205, x:   32, y:  368 },  // sofa front-facing left
    { singleId: 205, x:  192, y:  368 },  // sofa front-facing center
    { singleId: 206, x:    0, y:  384 },  // sofa side (left wall)
    { singleId: 190, x:   96, y:  432 },  // coffee table left
    { singleId: 190, x:  256, y:  432 },  // coffee table right
    { singleId:  98, x:  128, y:  352 },  // plant
    { singleId:  99, x:    0, y:  448 },  // small plant left
    { singleId:  98, x:  320, y:  352 },  // plant right
    { singleId: 334, x:  448, y:  320 },  // plant corner far-right
    { singleId: 335, x:  256, y:  416 },  // plant
    { singleId: 110, x:  352, y:  400 },  // wooden chair
    { singleId: 110, x:  160, y:  400 },  // wooden chair
  ],

  // ── Anchor points ──────────────────────────────────────────────────────────
  // Desk anchors — where agents sit when working (mapped to workstations)
  deskAnchors: [
    // Row 1 — upper workspace row
    { x:  82, y: 130 }, { x: 178, y: 130 }, { x: 274, y: 130 }, { x: 382, y: 130 },
    // Row 2 — lower workspace row
    { x:  65, y: 255 }, { x: 158, y: 255 }, { x: 248, y: 255 }, { x: 338, y: 255 },
  ],

  // Lounge anchors — where agents sit when idle (bottom lounge area)
  loungeAnchors: [
    // Left lounge room
    { x: 100, y: 410 }, { x: 160, y: 440 }, { x:  80, y: 460 }, { x: 200, y: 415 },
    // Right lounge room
    { x: 370, y: 400 }, { x: 430, y: 430 }, { x: 460, y: 400 }, { x: 400, y: 460 },
  ],
};
