/**
 * Office tilemap renderer.
 *
 * Loads Room_Builder spritesheet + individual furniture singles,
 * then renders them as layered PixiJS containers.
 */
import * as PIXI from "pixi.js";
import type { OfficeLayout } from "../data/office-layout";
import { TILE_SIZE, GRID_ROWS, GRID_COLS } from "../data/office-layout";

interface TilemapAssets {
  tileTextures: Map<number, PIXI.Texture>;
  furnitureTextures: Map<number, PIXI.Texture>;
}

/** Load only the tile and furniture textures actually referenced by the layout */
async function loadTilemapAssets(layout: OfficeLayout): Promise<TilemapAssets> {
  // --- Room Builder spritesheet (single image, sliced into sub-textures) ---
  const rbTexture = await PIXI.Assets.load<PIXI.Texture>(
    "/assets/office/Room_Builder_Office_32x32.png"
  );

  const usedTileIds = new Set<number>();
  for (const row of layout.floor)
    for (const id of row) if (id >= 0) usedTileIds.add(id);
  for (const row of layout.walls)
    for (const id of row) if (id >= 0) usedTileIds.add(id);

  const tileTextures = new Map<number, PIXI.Texture>();
  for (const id of usedTileIds) {
    const col = id % 16;
    const row = Math.floor(id / 16);
    const frame = new PIXI.Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    tileTextures.set(id, new PIXI.Texture({ source: rbTexture.source, frame }));
  }

  // --- Furniture singles (load only used ones in parallel) ---
  const usedSingles = new Set(layout.furniture.map((f) => f.singleId));
  const furnitureTextures = new Map<number, PIXI.Texture>();

  await Promise.all(
    [...usedSingles].map(async (id) => {
      const tex = await PIXI.Assets.load<PIXI.Texture>(
        `/assets/office/singles-32x32/Modern_Office_Singles_32x32_${id}.png`
      );
      furnitureTextures.set(id, tex);
    })
  );

  return { tileTextures, furnitureTextures };
}

/**
 * Render the office tilemap into the PixiJS app stage at index 0.
 * Returns the root container for later cleanup.
 */
export async function renderOfficeTilemap(
  app: PIXI.Application,
  layout: OfficeLayout
): Promise<PIXI.Container> {
  const assets = await loadTilemapAssets(layout);
  const root = new PIXI.Container();
  root.label = "office-tilemap";

  // Layer 1: Floor
  const floorContainer = new PIXI.Container();
  floorContainer.label = "floor";
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tileId = layout.floor[r]?.[c] ?? -1;
      if (tileId < 0) continue;
      const tex = assets.tileTextures.get(tileId);
      if (!tex) continue;
      const sprite = new PIXI.Sprite(tex);
      sprite.position.set(c * TILE_SIZE, r * TILE_SIZE);
      floorContainer.addChild(sprite);
    }
  }
  root.addChild(floorContainer);

  // Layer 2: Walls (overlay on floor — wall tiles have transparent areas)
  const wallContainer = new PIXI.Container();
  wallContainer.label = "walls";
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tileId = layout.walls[r]?.[c] ?? -1;
      if (tileId < 0) continue;
      const tex = assets.tileTextures.get(tileId);
      if (!tex) continue;
      const sprite = new PIXI.Sprite(tex);
      sprite.position.set(c * TILE_SIZE, r * TILE_SIZE);
      wallContainer.addChild(sprite);
    }
  }
  root.addChild(wallContainer);

  // Layer 3: Furniture (rendered in array order — same as admin editor)
  // Array order determines z-depth: last item is on top.
  // Use "Bring to Front" in the admin editor to put monitors/computers above chairs.
  const furnitureContainer = new PIXI.Container();
  furnitureContainer.label = "furniture";
  for (const item of layout.furniture) {
    const tex = assets.furnitureTextures.get(item.singleId);
    if (!tex) continue;
    const sprite = new PIXI.Sprite(tex);
    sprite.position.set(item.x, item.y);
    if (item.flipX) {
      sprite.anchor.set(1, 0);
      sprite.scale.x = -1;
    }
    furnitureContainer.addChild(sprite);
  }
  root.addChild(furnitureContainer);

  app.stage.addChildAt(root, 0);
  return root;
}
