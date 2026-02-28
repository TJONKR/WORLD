import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

export interface NoiseConfig {
  octaves: number;
  frequency: number;
  amplitude: number;
  persistence: number;
  lacunarity: number;
}

export const defaultElevationConfig: NoiseConfig = {
  octaves: 6,
  frequency: 0.02,
  amplitude: 1.0,
  persistence: 0.5,
  lacunarity: 2.0,
};

export const defaultMoistureConfig: NoiseConfig = {
  octaves: 4,
  frequency: 0.03,
  amplitude: 1.0,
  persistence: 0.5,
  lacunarity: 2.0,
};

/**
 * Generate a 2D noise map as a flat row-major array of values in [0, 1].
 */
export function generateNoiseMap(
  seed: string,
  width: number,
  height: number,
  config: NoiseConfig,
): number[] {
  const prng = Alea(seed);
  const noise2D = createNoise2D(prng);

  const map = new Array<number>(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let freq = config.frequency;
      let amp = config.amplitude;
      let maxAmp = 0;

      for (let o = 0; o < config.octaves; o++) {
        value += noise2D(x * freq, y * freq) * amp;
        maxAmp += amp;
        freq *= config.lacunarity;
        amp *= config.persistence;
      }

      // Normalize to [-1, 1] then remap to [0, 1]
      value /= maxAmp;
      value = (value + 1) / 2;

      // Clamp to [0, 1] for safety
      map[y * width + x] = Math.max(0, Math.min(1, value));
    }
  }

  return map;
}
