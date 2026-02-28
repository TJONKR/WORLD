import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { TileGrid, WorldBlueprint } from '../types/index.js';
import { generateBlueprint } from '../layer1-llm/generator.js';
import { generateTileGrid } from '../layer2-wfc/generator.js';
import { applyNoise } from '../layer3-noise/generator.js';
import { applyDecorations } from '../layer4-decorations/generator.js';
import { placeStructures } from '../layer5-structures/generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WorldConfig {
  seed: string;
  width: number;
  height: number;
  regionSize?: number;
  skipLLM?: boolean;
  blueprintPath?: string;
}

export async function generateWorld(config: WorldConfig): Promise<TileGrid> {
  const { seed, width, height, regionSize = 16, skipLLM = false } = config;

  // Layer 1: Generate or load blueprint
  let blueprint: WorldBlueprint;

  if (skipLLM) {
    console.log('[Layer 1] Skipping LLM — loading blueprint from file...');
    if (config.blueprintPath) {
      blueprint = JSON.parse(readFileSync(config.blueprintPath, 'utf-8'));
    } else {
      const fixturePath = resolve(__dirname, '../../fixtures/sample-blueprint.json');
      blueprint = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    }
    console.log(`[Layer 1] Loaded blueprint: "${blueprint.name}" (${blueprint.width}x${blueprint.height})`);
  } else {
    console.log(`[Layer 1] Generating blueprint via Claude API (${width}x${height}, seed: "${seed}")...`);
    blueprint = await generateBlueprint({ seed, width, height });
    console.log(`[Layer 1] Generated blueprint: "${blueprint.name}" (${blueprint.regions.length} regions)`);
  }

  // Layer 2: WFC tile generation
  console.log(`[Layer 2] Running WFC tile generation (region size: ${regionSize})...`);
  const rawGrid = generateTileGrid(blueprint, seed, regionSize);
  console.log(`[Layer 2] Generated tile grid: ${rawGrid.width}x${rawGrid.height} (${rawGrid.tileDefs.length} tile types)`);

  // Layer 3: Noise-based variation
  console.log('[Layer 3] Applying noise-based tile variations...');
  const finalGrid = applyNoise(rawGrid, seed);
  console.log(`[Layer 3] Applied noise: ${finalGrid.tileDefs.length} tile types (including variants)`);

  // Layer 4: Decoration overlay
  console.log('[Layer 4] Generating decoration overlay...');
  const decoratedGrid = applyDecorations(finalGrid, seed);
  const decoCount = decoratedGrid.decorations.filter(d => d !== 0).length;
  console.log(`[Layer 4] Placed ${decoCount} decorations`);

  // Layer 5: Structures (disabled for now)
  // const structuredGrid = placeStructures(decoratedGrid, seed);

  return decoratedGrid;
}
