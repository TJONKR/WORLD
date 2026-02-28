import type { WorldBlueprint, Region } from '../types/index.js';
import { validateBlueprint } from './schema.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { callForBlueprint } from './client.js';

// Max regions the LLM can reliably generate in one call (~16K output tokens)
const MAX_LLM_REGIONS = 80;

export interface GenerateConfig {
  seed: string;
  width: number;
  height: number;
}

export async function generateBlueprint(config: GenerateConfig): Promise<WorldBlueprint> {
  const { seed, width, height } = config;

  // If the grid is small enough, generate directly
  if (width * height <= MAX_LLM_REGIONS) {
    return generateDirect(seed, width, height);
  }

  // For large worlds: generate a smaller blueprint and upscale
  // Find the largest scale that fits within the LLM limit
  let scale = 2;
  while ((width / scale) * (height / scale) > MAX_LLM_REGIONS && scale < 8) {
    scale *= 2;
  }
  const smallW = Math.ceil(width / scale);
  const smallH = Math.ceil(height / scale);

  console.log(`[Layer 1] World too large for single LLM call — generating ${smallW}x${smallH} and upscaling ${scale}x`);

  const smallBlueprint = await generateDirect(seed, smallW, smallH);
  return upscaleBlueprint(smallBlueprint, width, height, scale);
}

async function generateDirect(seed: string, width: number, height: number): Promise<WorldBlueprint> {
  const userPrompt = buildUserPrompt(seed, width, height);

  const raw = await callForBlueprint({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });

  try {
    return validateBlueprint(raw);
  } catch (firstError) {
    const errorMessage =
      firstError instanceof Error ? firstError.message : String(firstError);

    const retryPrompt = `${userPrompt}

IMPORTANT: Your previous attempt failed validation with the following error:
${errorMessage}

Please fix the issues and try again. Make sure all regions follow the adjacency rules and all fields are present.`;

    const retryRaw = await callForBlueprint({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: retryPrompt,
    });

    return validateBlueprint(retryRaw);
  }
}

/**
 * Upscale a small blueprint to a larger grid.
 * Each source region becomes a scale×scale block of sub-regions
 * with the same biome but unique names/descriptions.
 */
function upscaleBlueprint(
  source: WorldBlueprint,
  targetWidth: number,
  targetHeight: number,
  scale: number,
): WorldBlueprint {
  const regions: Region[] = [];

  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      // Map to source region
      const sx = Math.min(Math.floor(tx / scale), source.width - 1);
      const sy = Math.min(Math.floor(ty / scale), source.height - 1);
      const srcRegion = source.regions[sy * source.width + sx];

      // Sub-position within the upscaled block
      const subX = tx % scale;
      const subY = ty % scale;
      const subLabel = scale > 1 ? ` (${['North', 'South'][Math.min(subY, 1)] ?? ''}${['West', 'East'][Math.min(subX, 1)] ?? ''})`.replace('()', '') : '';

      // Determine transitions by looking at neighbors in the target grid
      const getSourceBiome = (gx: number, gy: number) => {
        if (gx < 0 || gy < 0 || gx >= targetWidth || gy >= targetHeight) return undefined;
        const bx = Math.min(Math.floor(gx / scale), source.width - 1);
        const by = Math.min(Math.floor(gy / scale), source.height - 1);
        return source.regions[by * source.width + bx];
      };

      const northRegion = getSourceBiome(tx, ty - 1);
      const southRegion = getSourceBiome(tx, ty + 1);
      const eastRegion = getSourceBiome(tx + 1, ty);
      const westRegion = getSourceBiome(tx - 1, ty);

      regions.push({
        id: `r${tx}_${ty}`,
        name: `${srcRegion.name}${subLabel}`,
        description: srcRegion.description,
        biome: srcRegion.biome,
        elevation: srcRegion.elevation,
        moisture: srcRegion.moisture,
        gridX: tx,
        gridY: ty,
        pointsOfInterest: subX === 0 && subY === 0 ? srcRegion.pointsOfInterest : [],
        transitions: {
          north: northRegion && northRegion.biome !== srcRegion.biome ? srcRegion.transitions.north ?? 'gradual' : undefined,
          south: southRegion && southRegion.biome !== srcRegion.biome ? srcRegion.transitions.south ?? 'gradual' : undefined,
          east: eastRegion && eastRegion.biome !== srcRegion.biome ? srcRegion.transitions.east ?? 'gradual' : undefined,
          west: westRegion && westRegion.biome !== srcRegion.biome ? srcRegion.transitions.west ?? 'gradual' : undefined,
        },
      });
    }
  }

  return {
    seed: source.seed,
    width: targetWidth,
    height: targetHeight,
    name: source.name,
    description: source.description,
    regions,
  };
}
