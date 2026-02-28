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

/** A multi-tile structure placed on the map */
export interface Structure {
  type: string;             // e.g. 'house', 'castle', 'tower'
  x: number;                // top-left tile X
  y: number;                // top-left tile Y
  w: number;                // width in tiles
  h: number;                // height in tiles
  /** Row-major pixel data for rendering (w*tileSize × h*tileSize, RGB) */
  pixels?: number[];
  variant?: number;         // color/style variant
}

export interface TileGrid {
  width: number;            // total tiles horizontally
  height: number;           // total tiles vertically
  regionSize: number;       // tiles per region side (e.g. 16)
  terrain: number[];        // flat 2D array, row-major, tile IDs
  decorations: number[];    // flat 2D array, row-major, tile IDs (0 = none)
  decoTints?: number[];     // flat 2D array, per-tile tint index (0-7)
  structures?: Structure[]; // multi-tile structures placed on top
  regionGrid: number[];     // flat 2D array, row-major, region index into blueprint.regions
  edges: RegionEdge[];      // all borders between adjacent regions
  tileDefs: TileDefinition[];
  blueprint: WorldBlueprint;
}
