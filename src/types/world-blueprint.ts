export type BiomeType =
  | 'ocean'
  | 'beach'
  | 'grassland'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'tundra'
  | 'swamp';

export type TransitionType = 'gradual' | 'sharp' | 'river' | 'cliff';

export interface PointOfInterest {
  name: string;
  description: string;
  x: number;
  y: number;
  type: string;
}

export interface Region {
  id: string;
  name: string;
  description: string;
  biome: BiomeType;
  elevation: number;   // 0-1
  moisture: number;     // 0-1
  gridX: number;
  gridY: number;
  pointsOfInterest: PointOfInterest[];
  transitions: {
    north?: TransitionType;
    south?: TransitionType;
    east?: TransitionType;
    west?: TransitionType;
  };
}

export interface WorldBlueprint {
  seed: string;
  width: number;       // number of regions horizontally
  height: number;      // number of regions vertically
  name: string;
  description: string;
  regions: Region[];   // row-major order
}
