/**
 * Office tilemap layout types and constants.
 *
 * The office is rendered as a layered tilemap:
 *   1. Floor  — 16×17 grid of 32px tiles from Room_Builder spritesheet
 *   2. Walls  — same grid, overlay with transparency
 *   3. Furniture — singles sprites placed at pixel coordinates
 */

export const TILE_SIZE = 32;
export const GRID_COLS = 16; // 512 / 32
export const GRID_ROWS = 17; // 544 / 32

/** A placed furniture sprite */
export interface FurniturePlacement {
  /** Singles sprite number (1–339), maps to Modern_Office_Singles_32x32_{N}.png */
  singleId: number;
  /** Pixel X of the sprite top-left corner */
  x: number;
  /** Pixel Y of the sprite top-left corner */
  y: number;
  /** Mirror horizontally */
  flipX?: boolean;
}

/** A pixel-coordinate anchor point (e.g. desk or lounge seat) */
export interface AnchorPoint {
  x: number; // pixel x
  y: number; // pixel y
}

/** Complete office layout definition */
export interface OfficeLayout {
  name: string;
  /** Floor layer: GRID_ROWS × GRID_COLS. Values are Room_Builder tile IDs; -1 = void */
  floor: number[][];
  /** Wall layer: same grid. Values are Room_Builder tile IDs; -1 = no wall */
  walls: number[][];
  /** Furniture objects placed on top */
  furniture: FurniturePlacement[];
  /** Where agents sit when working (desk positions) */
  deskAnchors: AnchorPoint[];
  /** Where agents sit when idle (lounge positions) */
  loungeAnchors: AnchorPoint[];
}
