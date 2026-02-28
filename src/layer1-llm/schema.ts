import z from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { WorldBlueprint } from '../types/index.js';

export const BiomeTypeSchema = z.enum([
  'ocean',
  'beach',
  'grassland',
  'forest',
  'desert',
  'mountain',
  'tundra',
  'swamp',
]);

export const TransitionTypeSchema = z.enum([
  'gradual',
  'sharp',
  'river',
  'cliff',
]);

export const PointOfInterestSchema = z.object({
  name: z.string(),
  description: z.string(),
  x: z.number(),
  y: z.number(),
  type: z.string(),
});

export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  biome: BiomeTypeSchema,
  elevation: z.number().min(0).max(1),
  moisture: z.number().min(0).max(1),
  gridX: z.number().int().min(0),
  gridY: z.number().int().min(0),
  pointsOfInterest: z.array(PointOfInterestSchema),
  transitions: z.object({
    north: TransitionTypeSchema.optional(),
    south: TransitionTypeSchema.optional(),
    east: TransitionTypeSchema.optional(),
    west: TransitionTypeSchema.optional(),
  }),
});

export const WorldBlueprintSchema = z.object({
  seed: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  name: z.string(),
  description: z.string(),
  regions: z.array(RegionSchema),
});

export const blueprintJsonSchema = zodToJsonSchema(WorldBlueprintSchema, {
  $refStrategy: 'none',
  target: 'openApi3',
});

export function validateBlueprint(data: unknown): WorldBlueprint {
  return WorldBlueprintSchema.parse(data) as WorldBlueprint;
}
