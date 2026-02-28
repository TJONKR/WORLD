# Rendering Notes

## Render Versions

Each version is a standalone script in `scripts/`. All use the same world JSON as input.

| Version | Script | Key Features |
|---------|--------|-------------|
| v3 | `render-pretty.mjs` | Multi-shade palettes, hillshading, ocean depth, foam, biome blending |
| v4 | `render-v4.mjs` | + Rivers, lakes, snow caps, cloud shadows, grass tufts |
| v5 | `render-v5.mjs` | + Paths, cliff edges, lake basins, size-varied trees |
| v6 | `render-v6.mjs` | Pure polish: richer palettes, organic shapes, irregular rocks, multiple flower colors, softer shadows, micro-texture |
| v7 | `render-v7.mjs` | + Sub-tile bilinear interpolation, forest canopy underlay, caustics, warm color grading, vignette, atmospheric haze |

## How to render

```bash
# Generate world (if needed)
npx tsx src/pipeline/cli.ts --skip-llm --blueprint fixtures/epic-blueprint.json --region-size 200 --width 10 --height 10 --output output/world-2k-v3.json

# Render with any version
node --max-old-space-size=1024 scripts/render-v6.mjs output/world-2k-v3.json

# Output goes to output/world-v6-closeup.png + output/world-v6-overview.png
```

## Going back to v6

v7 adds sub-tile interpolation and post-processing (vignette, color grading) on top of v6. If v7's smoothing or effects feel too much, just render with v6 instead:

```bash
node --max-old-space-size=1024 scripts/render-v6.mjs output/world-2k-v3.json
```

v6 has sharper per-tile colors (no interpolation blur), no vignette, no color grading — cleaner pixel-art feel. Both scripts are independent and can be run on the same world data.
