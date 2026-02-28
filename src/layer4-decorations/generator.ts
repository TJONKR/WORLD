import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import type { TileGrid, TileDefinition, BiomeType } from '../types/index.js';

/**
 * Decoration types — each gets a unique tile ID in the decoration layer.
 * The viewer renders these as simple shapes on top of terrain.
 */
export type DecoType =
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_palm'
  | 'rock_small'
  | 'rock_large'
  | 'flower'
  | 'cactus'
  | 'mushroom'
  | 'reed'
  | 'snowdrift'
  | 'seaweed';

interface DecoRule {
  biome: BiomeType;
  deco: DecoType;
  /** Base probability per tile (0-1) */
  density: number;
  /** Noise frequency for clustering */
  clusterFreq: number;
  /** Noise threshold — only place where noise > this value */
  clusterThreshold: number;
  /** Min elevation (0-1), optional */
  minElev?: number;
  /** Max elevation (0-1), optional */
  maxElev?: number;
}

const DECO_RULES: DecoRule[] = [
  // Forest: dense trees
  { biome: 'forest',    deco: 'tree_pine',   density: 0.35, clusterFreq: 0.08, clusterThreshold: 0.3 },
  { biome: 'forest',    deco: 'tree_oak',    density: 0.15, clusterFreq: 0.06, clusterThreshold: 0.5 },
  { biome: 'forest',    deco: 'mushroom',    density: 0.03, clusterFreq: 0.12, clusterThreshold: 0.7 },
  { biome: 'forest',    deco: 'rock_small',  density: 0.02, clusterFreq: 0.10, clusterThreshold: 0.7 },

  // Grassland: scattered trees and flowers
  { biome: 'grassland', deco: 'tree_oak',    density: 0.06, clusterFreq: 0.04, clusterThreshold: 0.55 },
  { biome: 'grassland', deco: 'flower',      density: 0.08, clusterFreq: 0.10, clusterThreshold: 0.4 },
  { biome: 'grassland', deco: 'rock_small',  density: 0.02, clusterFreq: 0.08, clusterThreshold: 0.7 },

  // Desert: cacti and rocks
  { biome: 'desert',    deco: 'cactus',      density: 0.05, clusterFreq: 0.06, clusterThreshold: 0.5 },
  { biome: 'desert',    deco: 'rock_large',  density: 0.03, clusterFreq: 0.05, clusterThreshold: 0.6 },
  { biome: 'desert',    deco: 'rock_small',  density: 0.02, clusterFreq: 0.08, clusterThreshold: 0.65 },

  // Mountain: rocks and snow
  { biome: 'mountain',  deco: 'rock_large',  density: 0.10, clusterFreq: 0.07, clusterThreshold: 0.35 },
  { biome: 'mountain',  deco: 'rock_small',  density: 0.08, clusterFreq: 0.09, clusterThreshold: 0.4 },
  { biome: 'mountain',  deco: 'tree_pine',   density: 0.04, clusterFreq: 0.05, clusterThreshold: 0.6, maxElev: 0.7 },
  { biome: 'mountain',  deco: 'snowdrift',   density: 0.06, clusterFreq: 0.06, clusterThreshold: 0.5, minElev: 0.7 },

  // Beach: sparse
  { biome: 'beach',     deco: 'tree_palm',   density: 0.04, clusterFreq: 0.06, clusterThreshold: 0.6 },
  { biome: 'beach',     deco: 'rock_small',  density: 0.02, clusterFreq: 0.10, clusterThreshold: 0.7 },

  // Swamp: reeds and mushrooms
  { biome: 'swamp',     deco: 'reed',        density: 0.15, clusterFreq: 0.10, clusterThreshold: 0.3 },
  { biome: 'swamp',     deco: 'mushroom',    density: 0.05, clusterFreq: 0.08, clusterThreshold: 0.5 },
  { biome: 'swamp',     deco: 'tree_oak',    density: 0.04, clusterFreq: 0.05, clusterThreshold: 0.6 },

  // Tundra: snowdrifts and sparse rocks
  { biome: 'tundra',    deco: 'snowdrift',   density: 0.08, clusterFreq: 0.07, clusterThreshold: 0.4 },
  { biome: 'tundra',    deco: 'rock_small',  density: 0.03, clusterFreq: 0.09, clusterThreshold: 0.6 },
  { biome: 'tundra',    deco: 'tree_pine',   density: 0.02, clusterFreq: 0.04, clusterThreshold: 0.7 },

  // Ocean: seaweed
  { biome: 'ocean',     deco: 'seaweed',     density: 0.03, clusterFreq: 0.06, clusterThreshold: 0.6 },
];

/**
 * Generate decoration overlay for a tile grid.
 * Uses simplex noise for natural clustering + RNG for individual placement.
 */
export function applyDecorations(grid: TileGrid, seed: string): TileGrid {
  const { width, height, terrain, tileDefs } = grid;
  const decorations = new Array<number>(width * height).fill(0);

  // Build biome lookup from terrain
  const defById = new Map<number, TileDefinition>();
  for (const def of tileDefs) defById.set(def.id, def);

  // Generate elevation noise for elevation-gated decos
  const elevPrng = Alea(`${seed}-deco-elev`);
  const elevNoise = createNoise2D(elevPrng);

  // Create decoration tile defs
  const decoTileDefs: TileDefinition[] = [];
  const decoTypeToId = new Map<DecoType, number>();
  let nextId = Math.max(...tileDefs.map(d => d.id)) + 1;

  const allDecoTypes: DecoType[] = [
    'tree_pine', 'tree_oak', 'tree_palm', 'rock_small', 'rock_large',
    'flower', 'cactus', 'mushroom', 'reed', 'snowdrift', 'seaweed',
  ];

  for (const dt of allDecoTypes) {
    const id = nextId++;
    decoTypeToId.set(dt, id);
    decoTileDefs.push({
      id,
      name: `deco_${dt}`,
      biome: 'grassland', // placeholder — viewer uses deco type for rendering
      walkable: true,
      variant: 0,
    });
  }

  // Group rules by biome for fast lookup
  const rulesByBiome = new Map<BiomeType, DecoRule[]>();
  for (const rule of DECO_RULES) {
    const arr = rulesByBiome.get(rule.biome) || [];
    arr.push(rule);
    rulesByBiome.set(rule.biome, arr);
  }

  // Per-rule noise functions (each gets unique seed for independent clustering)
  const ruleNoiseCache = new Map<DecoRule, ReturnType<typeof createNoise2D>>();
  for (const rule of DECO_RULES) {
    const prng = Alea(`${seed}-deco-${rule.biome}-${rule.deco}`);
    ruleNoiseCache.set(rule, createNoise2D(prng));
  }

  // Placement RNG
  const placePrng = Alea(`${seed}-deco-place`);
  // Color variation RNG (0-7 tint index per decoration)
  const tintPrng = Alea(`${seed}-deco-tint`);

  // We store tint per-tile in a parallel array (0-7)
  const decoTints = new Array<number>(width * height).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const tileDef = defById.get(terrain[idx]);
      if (!tileDef) continue;

      const rules = rulesByBiome.get(tileDef.biome as BiomeType);
      if (!rules) continue;

      // Get elevation at this point
      const elev = (elevNoise(x * 0.02, y * 0.02) + 1) / 2;

      for (const rule of rules) {
        // Elevation gate
        if (rule.minElev !== undefined && elev < rule.minElev) continue;
        if (rule.maxElev !== undefined && elev > rule.maxElev) continue;

        // Cluster noise
        const noiseFn = ruleNoiseCache.get(rule)!;
        const clusterVal = (noiseFn(x * rule.clusterFreq, y * rule.clusterFreq) + 1) / 2;
        if (clusterVal < rule.clusterThreshold) continue;

        // Density roll
        if (placePrng() > rule.density) continue;

        // Place it with random tint
        decorations[idx] = decoTypeToId.get(rule.deco)!;
        decoTints[idx] = (tintPrng() * 8) | 0;
        break; // one decoration per tile
      }
    }
  }

  return {
    ...grid,
    decorations,
    decoTints,
    tileDefs: [...tileDefs, ...decoTileDefs],
  };
}
