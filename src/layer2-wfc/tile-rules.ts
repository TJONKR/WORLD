import type { BiomeType } from '../types/index.js';

export interface TileRule {
  id: number;
  name: string;
  biome: BiomeType;
  walkable: boolean;
  weight: number;
  color: [number, number, number, number]; // RGBA
}

export interface NeighborRule {
  left: string;
  right: string;
}

export interface BiomeTileSet {
  tiles: TileRule[];
  neighbors: NeighborRule[];
}

// --- Ocean tiles ---
const oceanTiles: TileRule[] = [
  { id: 0, name: 'deep_water', biome: 'ocean', walkable: false, weight: 10, color: [20, 60, 140, 255] },
  { id: 1, name: 'shallow_water', biome: 'ocean', walkable: false, weight: 4, color: [40, 100, 190, 255] },
];

const oceanNeighbors: NeighborRule[] = [
  { left: 'deep_water', right: 'deep_water' },
  { left: 'deep_water', right: 'shallow_water' },
  { left: 'shallow_water', right: 'shallow_water' },
];

// --- Beach tiles ---
const beachTiles: TileRule[] = [
  { id: 10, name: 'sand', biome: 'beach', walkable: true, weight: 10, color: [225, 210, 140, 255] },
  { id: 11, name: 'wet_sand', biome: 'beach', walkable: true, weight: 3, color: [190, 180, 120, 255] },
  { id: 12, name: 'dune', biome: 'beach', walkable: true, weight: 2, color: [235, 220, 155, 255] },
];

const beachNeighbors: NeighborRule[] = [
  { left: 'sand', right: 'sand' },
  { left: 'sand', right: 'wet_sand' },
  { left: 'sand', right: 'dune' },
  { left: 'wet_sand', right: 'wet_sand' },
  { left: 'wet_sand', right: 'sand' },
  { left: 'dune', right: 'sand' },
  { left: 'dune', right: 'dune' },
];

// --- Grassland tiles ---
const grasslandTiles: TileRule[] = [
  { id: 20, name: 'grass', biome: 'grassland', walkable: true, weight: 12, color: [90, 170, 60, 255] },
  { id: 21, name: 'tall_grass', biome: 'grassland', walkable: true, weight: 3, color: [70, 150, 45, 255] },
  { id: 22, name: 'flowers', biome: 'grassland', walkable: true, weight: 1, color: [120, 185, 80, 255] },
  { id: 23, name: 'dirt_path', biome: 'grassland', walkable: true, weight: 1, color: [155, 125, 75, 255] },
];

const grasslandNeighbors: NeighborRule[] = [
  { left: 'grass', right: 'grass' },
  { left: 'grass', right: 'tall_grass' },
  { left: 'grass', right: 'flowers' },
  { left: 'grass', right: 'dirt_path' },
  { left: 'tall_grass', right: 'grass' },
  { left: 'tall_grass', right: 'tall_grass' },
  { left: 'tall_grass', right: 'flowers' },
  { left: 'flowers', right: 'grass' },
  { left: 'flowers', right: 'tall_grass' },
  { left: 'dirt_path', right: 'grass' },
  { left: 'dirt_path', right: 'dirt_path' },
];

// --- Forest tiles ---
const forestTiles: TileRule[] = [
  { id: 30, name: 'trees', biome: 'forest', walkable: false, weight: 12, color: [30, 90, 25, 255] },
  { id: 31, name: 'dense_trees', biome: 'forest', walkable: false, weight: 4, color: [20, 65, 18, 255] },
  { id: 32, name: 'forest_clearing', biome: 'forest', walkable: true, weight: 1, color: [55, 120, 40, 255] },
  { id: 33, name: 'forest_path', biome: 'forest', walkable: true, weight: 1, color: [100, 85, 50, 255] },
];

const forestNeighbors: NeighborRule[] = [
  { left: 'trees', right: 'trees' },
  { left: 'trees', right: 'dense_trees' },
  { left: 'trees', right: 'forest_clearing' },
  { left: 'trees', right: 'forest_path' },
  { left: 'dense_trees', right: 'trees' },
  { left: 'dense_trees', right: 'dense_trees' },
  { left: 'forest_clearing', right: 'trees' },
  { left: 'forest_clearing', right: 'forest_clearing' },
  { left: 'forest_path', right: 'trees' },
  { left: 'forest_path', right: 'forest_path' },
  { left: 'forest_path', right: 'forest_clearing' },
];

// --- Desert tiles ---
const desertTiles: TileRule[] = [
  { id: 40, name: 'sand_flat', biome: 'desert', walkable: true, weight: 10, color: [215, 185, 95, 255] },
  { id: 41, name: 'sand_dunes', biome: 'desert', walkable: true, weight: 3, color: [200, 170, 80, 255] },
  { id: 42, name: 'cracked_earth', biome: 'desert', walkable: true, weight: 1, color: [175, 150, 90, 255] },
];

const desertNeighbors: NeighborRule[] = [
  { left: 'sand_flat', right: 'sand_flat' },
  { left: 'sand_flat', right: 'sand_dunes' },
  { left: 'sand_flat', right: 'cracked_earth' },
  { left: 'sand_dunes', right: 'sand_flat' },
  { left: 'sand_dunes', right: 'sand_dunes' },
  { left: 'cracked_earth', right: 'sand_flat' },
  { left: 'cracked_earth', right: 'cracked_earth' },
];

// --- Mountain tiles ---
const mountainTiles: TileRule[] = [
  { id: 50, name: 'rock', biome: 'mountain', walkable: true, weight: 10, color: [130, 130, 130, 255] },
  { id: 51, name: 'cliff', biome: 'mountain', walkable: false, weight: 3, color: [100, 100, 100, 255] },
  { id: 52, name: 'peak', biome: 'mountain', walkable: false, weight: 1, color: [180, 180, 185, 255] },
];

const mountainNeighbors: NeighborRule[] = [
  { left: 'rock', right: 'rock' },
  { left: 'rock', right: 'cliff' },
  { left: 'rock', right: 'peak' },
  { left: 'cliff', right: 'rock' },
  { left: 'cliff', right: 'cliff' },
  { left: 'peak', right: 'rock' },
  { left: 'peak', right: 'peak' },
];

// --- Tundra tiles ---
const tundraTiles: TileRule[] = [
  { id: 60, name: 'snow', biome: 'tundra', walkable: true, weight: 10, color: [220, 225, 235, 255] },
  { id: 61, name: 'ice', biome: 'tundra', walkable: true, weight: 3, color: [195, 210, 230, 255] },
  { id: 62, name: 'frozen_ground', biome: 'tundra', walkable: true, weight: 1, color: [175, 185, 195, 255] },
];

const tundraNeighbors: NeighborRule[] = [
  { left: 'snow', right: 'snow' },
  { left: 'snow', right: 'ice' },
  { left: 'snow', right: 'frozen_ground' },
  { left: 'ice', right: 'snow' },
  { left: 'ice', right: 'ice' },
  { left: 'frozen_ground', right: 'snow' },
  { left: 'frozen_ground', right: 'frozen_ground' },
];

// --- Swamp tiles ---
const swampTiles: TileRule[] = [
  { id: 70, name: 'mud', biome: 'swamp', walkable: true, weight: 3, color: [70, 85, 50, 255] },
  { id: 71, name: 'bog_water', biome: 'swamp', walkable: false, weight: 2, color: [50, 75, 55, 255] },
  { id: 72, name: 'reeds', biome: 'swamp', walkable: true, weight: 2, color: [80, 100, 55, 255] },
];

const swampNeighbors: NeighborRule[] = [
  { left: 'mud', right: 'mud' },
  { left: 'mud', right: 'bog_water' },
  { left: 'mud', right: 'reeds' },
  { left: 'bog_water', right: 'mud' },
  { left: 'bog_water', right: 'bog_water' },
  { left: 'bog_water', right: 'reeds' },
  { left: 'reeds', right: 'mud' },
  { left: 'reeds', right: 'reeds' },
];

// --- Transition tiles ---
const transitionTiles: TileRule[] = [
  { id: 100, name: 'water_sand', biome: 'beach', walkable: true, weight: 2, color: [110, 155, 170, 255] },
  { id: 101, name: 'sand_grass', biome: 'grassland', walkable: true, weight: 2, color: [155, 185, 105, 255] },
  { id: 102, name: 'grass_trees', biome: 'forest', walkable: true, weight: 2, color: [60, 130, 45, 255] },
  { id: 103, name: 'grass_sand_flat', biome: 'desert', walkable: true, weight: 2, color: [150, 175, 80, 255] },
  { id: 104, name: 'trees_rock', biome: 'mountain', walkable: true, weight: 2, color: [80, 105, 75, 255] },
  { id: 105, name: 'rock_snow', biome: 'tundra', walkable: true, weight: 2, color: [160, 165, 170, 255] },
  { id: 106, name: 'grass_mud', biome: 'swamp', walkable: true, weight: 2, color: [80, 125, 55, 255] },
  { id: 107, name: 'sand_mud', biome: 'swamp', walkable: true, weight: 2, color: [130, 140, 85, 255] },
  { id: 108, name: 'desert_rock', biome: 'mountain', walkable: true, weight: 2, color: [165, 155, 110, 255] },
];

const allTransitions: Array<{
  biomes: [BiomeType, BiomeType];
  tiles: TileRule[];
  neighborRules: NeighborRule[];
}> = [
  {
    biomes: ['ocean', 'beach'],
    tiles: [transitionTiles[0]],
    neighborRules: [
      { left: 'shallow_water', right: 'water_sand' },
      { left: 'water_sand', right: 'wet_sand' },
      { left: 'water_sand', right: 'sand' },
      { left: 'water_sand', right: 'water_sand' },
    ],
  },
  {
    biomes: ['beach', 'grassland'],
    tiles: [transitionTiles[1]],
    neighborRules: [
      { left: 'sand', right: 'sand_grass' },
      { left: 'dune', right: 'sand_grass' },
      { left: 'sand_grass', right: 'grass' },
      { left: 'sand_grass', right: 'tall_grass' },
      { left: 'sand_grass', right: 'sand_grass' },
    ],
  },
  {
    biomes: ['grassland', 'forest'],
    tiles: [transitionTiles[2]],
    neighborRules: [
      { left: 'grass', right: 'grass_trees' },
      { left: 'tall_grass', right: 'grass_trees' },
      { left: 'grass_trees', right: 'trees' },
      { left: 'grass_trees', right: 'forest_clearing' },
      { left: 'grass_trees', right: 'grass_trees' },
    ],
  },
  {
    biomes: ['grassland', 'desert'],
    tiles: [transitionTiles[3]],
    neighborRules: [
      { left: 'grass', right: 'grass_sand_flat' },
      { left: 'dirt_path', right: 'grass_sand_flat' },
      { left: 'grass_sand_flat', right: 'sand_flat' },
      { left: 'grass_sand_flat', right: 'cracked_earth' },
      { left: 'grass_sand_flat', right: 'grass_sand_flat' },
    ],
  },
  {
    biomes: ['forest', 'mountain'],
    tiles: [transitionTiles[4]],
    neighborRules: [
      { left: 'trees', right: 'trees_rock' },
      { left: 'forest_clearing', right: 'trees_rock' },
      { left: 'trees_rock', right: 'rock' },
      { left: 'trees_rock', right: 'cliff' },
      { left: 'trees_rock', right: 'trees_rock' },
    ],
  },
  {
    biomes: ['mountain', 'tundra'],
    tiles: [transitionTiles[5]],
    neighborRules: [
      { left: 'rock', right: 'rock_snow' },
      { left: 'peak', right: 'rock_snow' },
      { left: 'rock_snow', right: 'snow' },
      { left: 'rock_snow', right: 'frozen_ground' },
      { left: 'rock_snow', right: 'rock_snow' },
    ],
  },
  {
    biomes: ['grassland', 'swamp'],
    tiles: [transitionTiles[6]],
    neighborRules: [
      { left: 'grass', right: 'grass_mud' },
      { left: 'tall_grass', right: 'grass_mud' },
      { left: 'grass_mud', right: 'mud' },
      { left: 'grass_mud', right: 'reeds' },
      { left: 'grass_mud', right: 'grass_mud' },
    ],
  },
  {
    biomes: ['beach', 'swamp'],
    tiles: [transitionTiles[7]],
    neighborRules: [
      { left: 'sand', right: 'sand_mud' },
      { left: 'wet_sand', right: 'sand_mud' },
      { left: 'sand_mud', right: 'mud' },
      { left: 'sand_mud', right: 'reeds' },
      { left: 'sand_mud', right: 'sand_mud' },
    ],
  },
  {
    biomes: ['desert', 'mountain'],
    tiles: [transitionTiles[8]],
    neighborRules: [
      { left: 'sand_flat', right: 'desert_rock' },
      { left: 'cracked_earth', right: 'desert_rock' },
      { left: 'desert_rock', right: 'rock' },
      { left: 'desert_rock', right: 'cliff' },
      { left: 'desert_rock', right: 'desert_rock' },
    ],
  },
];

const biomeTileSets: Record<BiomeType, { tiles: TileRule[]; neighbors: NeighborRule[] }> = {
  ocean: { tiles: oceanTiles, neighbors: oceanNeighbors },
  beach: { tiles: beachTiles, neighbors: beachNeighbors },
  grassland: { tiles: grasslandTiles, neighbors: grasslandNeighbors },
  forest: { tiles: forestTiles, neighbors: forestNeighbors },
  desert: { tiles: desertTiles, neighbors: desertNeighbors },
  mountain: { tiles: mountainTiles, neighbors: mountainNeighbors },
  tundra: { tiles: tundraTiles, neighbors: tundraNeighbors },
  swamp: { tiles: swampTiles, neighbors: swampNeighbors },
};

/**
 * Get tile rules for a biome and its neighboring biomes.
 * Only includes the primary biome's tiles and transition tiles — NOT full neighbor biome sets.
 */
export function getTileRulesForRegion(
  biome: BiomeType,
  neighborBiomes: BiomeType[]
): BiomeTileSet {
  const tileMap = new Map<string, TileRule>();
  const neighborSet = new Set<string>();

  // Add the primary biome's tiles and rules
  const primary = biomeTileSets[biome];
  for (const tile of primary.tiles) {
    tileMap.set(tile.name, tile);
  }
  for (const n of primary.neighbors) {
    neighborSet.add(`${n.left}|${n.right}`);
  }

  // For each unique neighbor biome, add ONLY transition tiles (not the full neighbor set)
  const uniqueNeighbors = [...new Set(neighborBiomes)];
  for (const nBiome of uniqueNeighbors) {
    if (nBiome === biome) continue;

    for (const tp of allTransitions) {
      const [a, b] = tp.biomes;
      if ((a === biome && b === nBiome) || (a === nBiome && b === biome)) {
        for (const tile of tp.tiles) {
          tileMap.set(tile.name, tile);
        }
        for (const n of tp.neighborRules) {
          // Only add rules where at least one side is a tile we have
          neighborSet.add(`${n.left}|${n.right}`);
        }
        // Also add the specific neighbor biome border tiles that the transition connects to
        const nSet = biomeTileSets[nBiome];
        for (const tile of nSet.tiles) {
          tileMap.set(tile.name, tile);
        }
        for (const n of nSet.neighbors) {
          neighborSet.add(`${n.left}|${n.right}`);
        }
      }
    }
  }

  const tiles = [...tileMap.values()];
  const neighbors = [...neighborSet].map(key => {
    const [left, right] = key.split('|');
    return { left, right };
  });

  return { tiles, neighbors };
}

/**
 * Get the primary tile for a biome (used as fallback fill).
 */
export function getPrimaryTile(biome: BiomeType): TileRule {
  const set = biomeTileSets[biome];
  return set.tiles[0];
}

/**
 * Get a suitable border tile for a biome (the one that transitions connect to).
 */
export function getBorderTile(biome: BiomeType): TileRule {
  const set = biomeTileSets[biome];
  return set.tiles[0];
}

/**
 * Get all tiles for a biome, for noise-based variant selection.
 */
export function getBiomeTiles(biome: BiomeType): TileRule[] {
  return biomeTileSets[biome].tiles;
}
