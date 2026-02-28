import WFC from 'wavefunctioncollapse';
import Alea from 'alea';
import type { WFCConfig } from './biome-to-wfc.js';

const MAX_RETRIES = 3;

/**
 * Run WFC with the given config, retrying on contradiction.
 * Returns the flat array of observed tile indices (into config.tileIndexMap),
 * or null if all retries fail.
 */
export function runWFC(
  config: WFCConfig,
  width: number,
  height: number,
  seed: string
): number[] | null {
  const data = {
    tilesize: config.tilesize,
    tiles: config.tiles,
    neighbors: config.neighbors,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const rng = Alea(`${seed}-${attempt}`);
    const model = new WFC.SimpleTiledModel(data, null, width, height, false);
    const success = model.generate(rng);

    if (success && model.observed) {
      return Array.from(model.observed as number[]);
    }
  }

  return null;
}
