import { describe, it, expect } from 'vitest';
import { generateNoiseMap, defaultElevationConfig } from './noise-map.js';

describe('generateNoiseMap', () => {
  const width = 64;
  const height = 64;
  const seed = 'test-seed-42';

  it('produces deterministic output for the same seed', () => {
    const a = generateNoiseMap(seed, width, height, defaultElevationConfig);
    const b = generateNoiseMap(seed, width, height, defaultElevationConfig);
    expect(a).toEqual(b);
  });

  it('returns values in the [0, 1] range', () => {
    const map = generateNoiseMap(seed, width, height, defaultElevationConfig);
    for (const v of map) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('returns an array with length equal to width * height', () => {
    const map = generateNoiseMap(seed, width, height, defaultElevationConfig);
    expect(map).toHaveLength(width * height);
  });

  it('produces different output for different seeds', () => {
    const a = generateNoiseMap('seed-alpha', width, height, defaultElevationConfig);
    const b = generateNoiseMap('seed-beta', width, height, defaultElevationConfig);
    // At least some values should differ
    const differences = a.filter((v, i) => v !== b[i]);
    expect(differences.length).toBeGreaterThan(0);
  });

  it('respects custom config parameters', () => {
    const lowFreq = generateNoiseMap(seed, width, height, {
      ...defaultElevationConfig,
      frequency: 0.001,
    });
    const highFreq = generateNoiseMap(seed, width, height, {
      ...defaultElevationConfig,
      frequency: 0.1,
    });
    // Different frequency should produce different maps
    const differences = lowFreq.filter((v, i) => v !== highFreq[i]);
    expect(differences.length).toBeGreaterThan(0);
  });
});
