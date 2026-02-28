import type { TileGrid, TileDefinition, BiomeType } from '../types/index.js';

interface VariantRule {
  biome: BiomeType;
  minElevation?: number;
  maxElevation?: number;
  minMoisture?: number;
  maxMoisture?: number;
  variant: number;
}

const variantRules: VariantRule[] = [
  // Grassland variants based on moisture
  { biome: 'grassland', minMoisture: 0.7, variant: 1 },   // lush / wet grass
  { biome: 'grassland', maxMoisture: 0.25, variant: 2 },   // dry / sparse grass

  // Forest variants based on elevation and moisture
  { biome: 'forest', minElevation: 0.65, variant: 1 },     // highland forest
  { biome: 'forest', minMoisture: 0.75, variant: 2 },      // dense / wet forest

  // Desert variants based on elevation
  { biome: 'desert', minElevation: 0.55, variant: 1 },     // rocky desert
  { biome: 'desert', maxElevation: 0.3, minMoisture: 0.4, variant: 2 }, // oasis-adjacent

  // Mountain variants based on elevation
  { biome: 'mountain', minElevation: 0.8, variant: 1 },    // snow-capped peak

  // Swamp variants based on moisture
  { biome: 'swamp', minMoisture: 0.8, variant: 1 },        // deep swamp

  // Beach variants based on moisture
  { biome: 'beach', minMoisture: 0.6, variant: 1 },        // wet / tidal beach

  // Tundra variants
  { biome: 'tundra', minMoisture: 0.6, variant: 1 },       // icy tundra
];

function matchesRule(
  rule: VariantRule,
  elevation: number,
  moisture: number,
): boolean {
  if (rule.minElevation !== undefined && elevation < rule.minElevation) return false;
  if (rule.maxElevation !== undefined && elevation > rule.maxElevation) return false;
  if (rule.minMoisture !== undefined && moisture < rule.minMoisture) return false;
  if (rule.maxMoisture !== undefined && moisture > rule.maxMoisture) return false;
  return true;
}

/**
 * Apply noise-based variant swaps to a tile grid.
 * Returns a new grid; does not mutate the input.
 */
export function applyTileVariants(
  grid: TileGrid,
  elevationMap: number[],
  moistureMap: number[],
): TileGrid {
  const newTerrain = new Array<number>(grid.terrain.length);
  const newTileDefs = [...grid.tileDefs];

  // Build a lookup: id → TileDefinition
  const defById = new Map<number, TileDefinition>();
  for (const def of grid.tileDefs) {
    defById.set(def.id, def);
  }

  // Find the max existing tile ID to avoid conflicts
  let nextId = Math.max(...grid.tileDefs.map(d => d.id)) + 1;

  // Track variant defs we've already created so we don't duplicate
  const variantKey = (baseId: number, variant: number) => `${baseId}:${variant}`;
  const variantDefs = new Map<string, number>();

  for (let i = 0; i < grid.terrain.length; i++) {
    const tileId = grid.terrain[i];
    const def = defById.get(tileId);

    if (!def) {
      newTerrain[i] = tileId;
      continue;
    }

    const elevation = elevationMap[i];
    const moisture = moistureMap[i];

    // Find the first matching variant rule for this biome
    let appliedVariant: number | undefined;
    for (const rule of variantRules) {
      if (rule.biome === def.biome && matchesRule(rule, elevation, moisture)) {
        appliedVariant = rule.variant;
        break;
      }
    }

    if (appliedVariant === undefined || def.variant === appliedVariant) {
      newTerrain[i] = tileId;
      continue;
    }

    // Check if we already created a TileDefinition for this variant
    const key = variantKey(tileId, appliedVariant);
    let variantId = variantDefs.get(key);

    if (variantId === undefined) {
      variantId = nextId++;
      newTileDefs.push({
        id: variantId,
        name: `${def.name}_v${appliedVariant}`,
        biome: def.biome,
        walkable: def.walkable,
        variant: appliedVariant,
      });
      variantDefs.set(key, variantId);
    }

    newTerrain[i] = variantId;
  }

  return {
    ...grid,
    terrain: newTerrain,
    tileDefs: newTileDefs,
  };
}
