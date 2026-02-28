import type { Region, BiomeType } from '../types/index.js';
import { getTileRulesForRegion, type TileRule, type BiomeTileSet } from './tile-rules.js';

export interface WFCConfig {
  tilesize: number;
  tiles: Array<{
    name: string;
    symmetry: string;
    weight: number;
    bitmap: Uint8Array;
  }>;
  neighbors: Array<{
    left: string;
    right: string;
  }>;
  /** Maps WFC tile index to our TileRule */
  tileIndexMap: TileRule[];
}

/**
 * Convert a Region (with context about its neighbors) into a WFC config
 * that the wavefunctioncollapse SimpleTiledModel can consume.
 */
export function regionToWFCConfig(
  region: Region,
  neighborBiomes: BiomeType[]
): WFCConfig {
  const tileSet: BiomeTileSet = getTileRulesForRegion(region.biome, neighborBiomes);

  const wfcTiles = tileSet.tiles.map((tile) => ({
    name: tile.name,
    symmetry: 'X' as const,
    weight: tile.weight,
    bitmap: new Uint8Array(tile.color),
  }));

  // Only include neighbor rules where both tiles exist in our set
  const tileNames = new Set(tileSet.tiles.map(t => t.name));
  const validNeighbors = tileSet.neighbors.filter(
    n => tileNames.has(n.left) && tileNames.has(n.right)
  );

  return {
    tilesize: 1,
    tiles: wfcTiles,
    neighbors: validNeighbors,
    tileIndexMap: tileSet.tiles,
  };
}
