import Alea from 'alea';
import type { TileGrid, TileDefinition, Structure } from '../types/index.js';

/**
 * House sprite definition — 4x3 tiles.
 * Drawn procedurally at render time using this layout:
 *
 *   Row 0 (roof):     /‾‾‾‾‾‾\
 *   Row 1 (roof):    /________\
 *   Row 2 (walls):   |  [D]   |
 *
 * The actual pixel art is generated in the renderer.
 * Here we just place structure markers.
 */

const HOUSE_W = 4;
const HOUSE_H = 3;

/** Biomes where houses can spawn */
const HABITABLE_BIOMES = new Set(['grassland', 'forest', 'beach', 'desert', 'swamp']);

/** Min distance between structures (in tiles) */
const MIN_SPACING = 40;

/** Max houses per region */
const MAX_PER_REGION = 3;

/**
 * Place house structures on suitable terrain.
 * Avoids water, mountains, and other structures.
 */
export function placeStructures(grid: TileGrid, seed: string): TileGrid {
  const { width, height, terrain, decorations, tileDefs } = grid;
  const rng = Alea(`${seed}-structures`);

  const defById = new Map<number, TileDefinition>();
  for (const def of tileDefs) defById.set(def.id, def);

  const structures: Structure[] = [];
  const occupied = new Set<string>(); // "x,y" of tiles claimed by structures

  // Try placing houses across the map
  const attempts = 500;

  for (let i = 0; i < attempts; i++) {
    const x = (rng() * (width - HOUSE_W)) | 0;
    const y = (rng() * (height - HOUSE_H)) | 0;

    // Check all tiles under the house footprint
    let valid = true;
    for (let dy = 0; dy < HOUSE_H && valid; dy++) {
      for (let dx = 0; dx < HOUSE_W && valid; dx++) {
        const tx = x + dx, ty = y + dy;
        const idx = ty * width + tx;
        const def = defById.get(terrain[idx]);
        if (!def || !HABITABLE_BIOMES.has(def.biome)) {
          valid = false;
        }
        if (occupied.has(`${tx},${ty}`)) {
          valid = false;
        }
      }
    }
    if (!valid) continue;

    // Check min spacing from existing structures
    let tooClose = false;
    for (const s of structures) {
      const dx = (x + HOUSE_W / 2) - (s.x + s.w / 2);
      const dy2 = (y + HOUSE_H / 2) - (s.y + s.h / 2);
      if (Math.sqrt(dx * dx + dy2 * dy2) < MIN_SPACING) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Place it
    const variant = (rng() * 4) | 0;
    structures.push({ type: 'house', x, y, w: HOUSE_W, h: HOUSE_H, variant });

    // Mark tiles as occupied
    for (let dy = 0; dy < HOUSE_H; dy++) {
      for (let dx = 0; dx < HOUSE_W; dx++) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }

    // Clear decorations under the house
    for (let dy = 0; dy < HOUSE_H; dy++) {
      for (let dx = 0; dx < HOUSE_W; dx++) {
        decorations[(y + dy) * width + (x + dx)] = 0;
      }
    }
  }

  console.log(`[Layer 5] Placed ${structures.length} houses`);

  return {
    ...grid,
    structures,
    decorations, // modified in-place (cleared under houses)
  };
}
