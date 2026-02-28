import type { WorldBlueprint, BiomeType, TransitionType } from './world-blueprint.js';

export interface TileDefinition {
  id: number;
  name: string;
  biome: BiomeType;
  walkable: boolean;
  variant?: number;
}

/** Describes a border between two adjacent regions */
export interface RegionEdge {
  fromRegion: number;       // index into blueprint.regions
  toRegion: number;         // index into blueprint.regions
  direction: 'north' | 'south' | 'east' | 'west';
  fromBiome: BiomeType;
  toBiome: BiomeType;
  transition: TransitionType | 'none';
}

export interface TileGrid {
  width: number;            // total tiles horizontally
  height: number;           // total tiles vertically
  regionSize: number;       // tiles per region side (e.g. 16)
  terrain: number[];        // flat 2D array, row-major, tile IDs
  decorations: number[];    // flat 2D array, row-major, tile IDs (0 = none)
  regionGrid: number[];     // flat 2D array, row-major, region index into blueprint.regions
  edges: RegionEdge[];      // all borders between adjacent regions
  tileDefs: TileDefinition[];
  blueprint: WorldBlueprint;
}
