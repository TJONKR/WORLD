import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import type { WorldBlueprint, TileGrid, TileDefinition, BiomeType, RegionEdge } from '../types/index.js';
import { regionToWFCConfig } from './biome-to-wfc.js';
import { runWFC } from './wfc-runner.js';
import { getPrimaryTile, getBorderTile, getBiomeTiles, type TileRule } from './tile-rules.js';

const DEFAULT_REGION_SIZE = 16;

function getNeighborBiomes(
  blueprint: WorldBlueprint,
  gridX: number,
  gridY: number
): BiomeType[] {
  const biomes: BiomeType[] = [];
  const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]];
  for (const [dx, dy] of dirs) {
    const nx = gridX + dx;
    const ny = gridY + dy;
    if (nx >= 0 && nx < blueprint.width && ny >= 0 && ny < blueprint.height) {
      const region = blueprint.regions[ny * blueprint.width + nx];
      if (region) biomes.push(region.biome);
    }
  }
  return biomes;
}

function tileRuleToDefinition(rule: TileRule): TileDefinition {
  return { id: rule.id, name: rule.name, biome: rule.biome, walkable: rule.walkable };
}

/**
 * Pick a tile from a biome's tileset using noise value for weighted selection.
 * Noise value [0,1] maps to the tile's weight distribution.
 */
function pickTileByNoise(biome: BiomeType, noiseVal: number): TileRule {
  const tiles = getBiomeTiles(biome);
  const totalWeight = tiles.reduce((s, t) => s + t.weight, 0);
  const target = noiseVal * totalWeight;
  let cumulative = 0;
  for (const tile of tiles) {
    cumulative += tile.weight;
    if (target <= cumulative) return tile;
  }
  return tiles[0];
}

export function generateTileGrid(
  blueprint: WorldBlueprint,
  seed: string,
  regionSize: number = DEFAULT_REGION_SIZE
): TileGrid {
  // WFC runs at a small internal size, then tiles up to fill the region
  const WFC_SIZE = Math.min(regionSize, 32);
  const totalWidth = blueprint.width * regionSize;
  const totalHeight = blueprint.height * regionSize;
  const terrain = new Array<number>(totalWidth * totalHeight).fill(0);
  const decorations = new Array<number>(totalWidth * totalHeight).fill(0);
  const regionGrid = new Array<number>(totalWidth * totalHeight).fill(0);
  const tileDefMap = new Map<number, TileDefinition>();

  // Build regionGrid — maps every tile to its region index
  for (let ry = 0; ry < blueprint.height; ry++) {
    for (let rx = 0; rx < blueprint.width; rx++) {
      const regionIdx = ry * blueprint.width + rx;
      const baseX = rx * regionSize;
      const baseY = ry * regionSize;
      for (let ly = 0; ly < regionSize; ly++) {
        for (let lx = 0; lx < regionSize; lx++) {
          regionGrid[(baseY + ly) * totalWidth + (baseX + lx)] = regionIdx;
        }
      }
    }
  }

  // Build edges — every border between adjacent regions
  const edges: RegionEdge[] = [];
  for (let ry = 0; ry < blueprint.height; ry++) {
    for (let rx = 0; rx < blueprint.width; rx++) {
      const idx = ry * blueprint.width + rx;
      const region = blueprint.regions[idx];
      // East neighbor
      if (rx + 1 < blueprint.width) {
        const nIdx = ry * blueprint.width + (rx + 1);
        const neighbor = blueprint.regions[nIdx];
        edges.push({
          fromRegion: idx,
          toRegion: nIdx,
          direction: 'east',
          fromBiome: region.biome,
          toBiome: neighbor.biome,
          transition: region.transitions.east ?? 'none',
        });
      }
      // South neighbor
      if (ry + 1 < blueprint.height) {
        const nIdx = (ry + 1) * blueprint.width + rx;
        const neighbor = blueprint.regions[nIdx];
        edges.push({
          fromRegion: idx,
          toRegion: nIdx,
          direction: 'south',
          fromBiome: region.biome,
          toBiome: neighbor.biome,
          transition: region.transitions.south ?? 'none',
        });
      }
    }
  }

  // Register all biome tiles upfront so blending can use them
  for (const region of blueprint.regions) {
    const tiles = getBiomeTiles(region.biome);
    for (const rule of tiles) {
      if (!tileDefMap.has(rule.id)) {
        tileDefMap.set(rule.id, tileRuleToDefinition(rule));
      }
    }
  }

  // Phase 1: Run WFC per region
  for (const region of blueprint.regions) {
    const neighborBiomes = getNeighborBiomes(blueprint, region.gridX, region.gridY);
    const config = regionToWFCConfig(region, neighborBiomes);

    for (const rule of config.tileIndexMap) {
      if (!tileDefMap.has(rule.id)) {
        tileDefMap.set(rule.id, tileRuleToDefinition(rule));
      }
    }

    const regionSeed = `${seed}-r${region.gridX},${region.gridY}`;
    const observed = runWFC(config, WFC_SIZE, WFC_SIZE, regionSeed);

    // Build a small WFC tile patch
    let wfcPatch: number[];
    if (observed) {
      wfcPatch = observed.map(idx => {
        const rule = config.tileIndexMap[idx];
        return rule ? rule.id : getPrimaryTile(region.biome).id;
      });
    } else {
      const primary = getPrimaryTile(region.biome);
      wfcPatch = new Array(WFC_SIZE * WFC_SIZE).fill(primary.id);
    }

    // Tile the small WFC patch across the full region
    const baseX = region.gridX * regionSize;
    const baseY = region.gridY * regionSize;
    for (let ly = 0; ly < regionSize; ly++) {
      for (let lx = 0; lx < regionSize; lx++) {
        const srcY = ly % WFC_SIZE;
        const srcX = lx % WFC_SIZE;
        terrain[(baseY + ly) * totalWidth + (baseX + lx)] = wfcPatch[srcY * WFC_SIZE + srcX];
      }
    }
  }

  // Phase 2: Noise-based blending across ALL borders (same-biome + cross-biome)
  blendAllBorders(terrain, totalWidth, totalHeight, regionSize, blueprint, tileDefMap, seed);

  const tileDefs = [...tileDefMap.values()].sort((a, b) => a.id - b.id);
  return { width: totalWidth, height: totalHeight, regionSize, terrain, decorations, regionGrid, edges, tileDefs, blueprint };
}

function blendAllBorders(
  terrain: number[],
  totalWidth: number,
  totalHeight: number,
  regionSize: number,
  blueprint: WorldBlueprint,
  tileDefMap: Map<number, TileDefinition>,
  seed: string
): void {
  // Noise layers for displacing Voronoi boundaries
  const rng1 = Alea(`${seed}-warp1`);
  const rng2 = Alea(`${seed}-warp2`);
  const rng3 = Alea(`${seed}-pick`);
  const noiseX = createNoise2D(rng1);  // X displacement
  const noiseY = createNoise2D(rng2);  // Y displacement
  const noisePick = createNoise2D(rng3); // tile variant selection

  // How many tiles the noise can push a point sideways.
  // Higher = more organic borders but biomes can drift further from blueprint layout.
  const WARP_STRENGTH = regionSize * 0.6;
  const WARP_FREQ = 0.04;  // low frequency = large smooth curves

  // Precompute region centers (in tile coordinates)
  const centers: Array<{ cx: number; cy: number; biome: BiomeType; regionIdx: number }> = [];
  for (let ry = 0; ry < blueprint.height; ry++) {
    for (let rx = 0; rx < blueprint.width; rx++) {
      const idx = ry * blueprint.width + rx;
      centers.push({
        cx: (rx + 0.5) * regionSize,
        cy: (ry + 0.5) * regionSize,
        biome: blueprint.regions[idx].biome,
        regionIdx: idx,
      });
    }
  }

  // Blend range: only process tiles within this distance of a region border
  const BLEND_RANGE = Math.ceil(regionSize * 0.7);

  for (let ty = 0; ty < totalHeight; ty++) {
    const gy = Math.floor(ty / regionSize);
    const ly = ty % regionSize;
    const distToBorderY = Math.min(ly, regionSize - 1 - ly);

    for (let tx = 0; tx < totalWidth; tx++) {
      const gx = Math.floor(tx / regionSize);
      const lx = tx % regionSize;
      const distToBorderX = Math.min(lx, regionSize - 1 - lx);
      const distToBorder = Math.min(distToBorderX, distToBorderY);

      // Skip tiles far from any border — they don't need blending
      if (distToBorder >= BLEND_RANGE) continue;

      const myIdx = gy * blueprint.width + gx;
      const myBiome = blueprint.regions[myIdx]?.biome;
      if (!myBiome) continue;

      // Tile variant noise (0..1) — continuous across regions
      const variantNoise = (noisePick(tx * 0.18, ty * 0.18) + 1) / 2;

      // Same-biome smoothing: re-pick with noise to hide WFC seams
      const hasSameBiomeNeighbor =
        (gx > 0 && blueprint.regions[myIdx - 1]?.biome === myBiome) ||
        (gx < blueprint.width - 1 && blueprint.regions[myIdx + 1]?.biome === myBiome) ||
        (gy > 0 && blueprint.regions[myIdx - blueprint.width]?.biome === myBiome) ||
        (gy < blueprint.height - 1 && blueprint.regions[myIdx + blueprint.width]?.biome === myBiome);

      if (hasSameBiomeNeighbor && distToBorder < regionSize / 2) {
        const tile = pickTileByNoise(myBiome, variantNoise);
        terrain[ty * totalWidth + tx] = tile.id;
      }

      // Cross-biome: use noise-warped Voronoi to determine which biome "owns" this tile
      const dx = noiseX(tx * WARP_FREQ + 31.7, ty * WARP_FREQ + 47.3) * WARP_STRENGTH;
      const dy = noiseY(tx * WARP_FREQ + 73.1, ty * WARP_FREQ + 19.8) * WARP_STRENGTH;
      const warpedX = tx + dx;
      const warpedY = ty + dy;

      // Only check nearby region centers (3x3 around current region)
      let closestDist = Infinity;
      let closestBiome = myBiome;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          const ny = gy + oy;
          if (nx < 0 || ny < 0 || nx >= blueprint.width || ny >= blueprint.height) continue;
          const c = centers[ny * blueprint.width + nx];
          const ddx = warpedX - c.cx;
          const ddy = warpedY - c.cy;
          const dist = ddx * ddx + ddy * ddy;
          if (dist < closestDist) {
            closestDist = dist;
            closestBiome = c.biome;
          }
        }
      }

      if (closestBiome !== myBiome) {
        const tile = pickTileByNoise(closestBiome, variantNoise);
        terrain[ty * totalWidth + tx] = tile.id;
        if (!tileDefMap.has(tile.id)) {
          tileDefMap.set(tile.id, tileRuleToDefinition(tile));
        }
      }
    }
  }
}
