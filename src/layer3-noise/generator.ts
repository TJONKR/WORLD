import type { TileGrid } from '../types/index.js';
import { generateNoiseMap, defaultElevationConfig, defaultMoistureConfig } from './noise-map.js';
import { applyTileVariants } from './tile-modifier.js';

/**
 * Apply noise-based tile variant modifications to a grid.
 * Generates elevation and moisture noise maps, then swaps tile variants
 * based on noise thresholds. Returns a new grid; does NOT mutate the input.
 */
export function applyNoise(grid: TileGrid, seed: string): TileGrid {
  const elevationMap = generateNoiseMap(
    `${seed}-elevation`,
    grid.width,
    grid.height,
    defaultElevationConfig,
  );

  const moistureMap = generateNoiseMap(
    `${seed}-moisture`,
    grid.width,
    grid.height,
    defaultMoistureConfig,
  );

  return applyTileVariants(grid, elevationMap, moistureMap);
}
