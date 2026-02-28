import 'dotenv/config';
import { generateWorld } from './pipeline.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

function parseArgs(argv: string[]): {
  seed: string;
  width: number;
  height: number;
  output: string;
  skipLLM: boolean;
  blueprintPath?: string;
} {
  const args = argv.slice(2);
  let seed = `world-${Date.now()}`;
  let width = 2;
  let height = 2;
  let output = 'output/world.json';
  let skipLLM = false;
  let blueprintPath: string | undefined;
  let regionSize = 16;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--seed':
        seed = args[++i];
        break;
      case '--width':
        width = parseInt(args[++i], 10);
        break;
      case '--height':
        height = parseInt(args[++i], 10);
        break;
      case '--output':
        output = args[++i];
        break;
      case '--skip-llm':
        skipLLM = true;
        break;
      case '--blueprint':
        blueprintPath = args[++i];
        break;
      case '--region-size':
        regionSize = parseInt(args[++i], 10);
        break;
    }
  }

  return { seed, width, height, output, skipLLM, blueprintPath, regionSize };
}

async function main() {
  const config = parseArgs(process.argv);
  const startTime = Date.now();

  console.log('=== World Generation Toolkit ===');
  console.log(`Seed: "${config.seed}"`);
  console.log(`Grid: ${config.width}x${config.height} regions`);
  console.log(`Output: ${config.output}`);
  console.log();

  const grid = await generateWorld({
    seed: config.seed,
    width: config.width,
    height: config.height,
    regionSize: config.regionSize,
    skipLLM: config.skipLLM,
    blueprintPath: config.blueprintPath,
  });

  // Ensure output directory exists
  const outputPath = resolve(config.output);
  mkdirSync(dirname(outputPath), { recursive: true });

  writeFileSync(outputPath, JSON.stringify(grid, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log('=== Generation Complete ===');
  console.log(`World: "${grid.blueprint.name}"`);
  console.log(`Dimensions: ${grid.width}x${grid.height} tiles`);
  console.log(`Regions: ${grid.blueprint.regions.length}`);
  console.log(`Tile types: ${grid.tileDefs.length}`);
  console.log(`Total tiles: ${grid.terrain.length}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('Generation failed:', err?.message ?? String(err));
  if (err?.status) console.error('Status:', err.status);
  process.exit(1);
});
