# WorldBox Visual Style Guide

Reference screenshots saved in this folder (wb-ss-01 through wb-ss-08).

## Key Visual Traits

### Terrain Rendering
- **Checkerboard dither**: every tile uses 2-color alternating pixels `(x+y)%2`
- Primary + secondary shade differ by ~10-15 RGB units
- 5-10% of tiles get a 3rd color noise pixel (wildflower, soil speck)

### Biome Palettes (exact hex from analysis)
| Biome | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| Grass | #5FA843 | #4E9235 | #6DB851 |
| Forest canopy | #3D8C28 | #2D6E1E | #4EA832 |
| Deep ocean | #1040A0 | #2868B0 | — |
| Shallow water | #70B8D8 | #88CCE4 | — |
| Beach | #D4C080 | #C8B870 | #E0D8B0 |
| Desert | #D4C090 | #C0A878 | #E0D0A0 |
| Mountain | #707070 | #585858 | #989898 |
| Snow | #E8E8E8 | #D0D0D0 | #F8F8FF |
| Swamp | #4A6830 | #3D5A28 | #5A7838 |

### Ocean Depth Bands (8 levels)
```
Shore → #A0D0F8 (1-2 tiles)
     → #88CCE4 (2-3 tiles)
     → #70B8D8 (3-5 tiles)
     → #5C94DC (4-6 tiles)
     → #4898C8 (variable)
     → #3468C8 (fills most)
     → #2248A0 (deep)
     → #1A3A7C (abyss)
```

### Biome Edge Dithering
- 3-6 pixel transition zone
- Density gradient: 75%A/25%B → 50/50 → 25%A/75%B
- Noise-seeded threshold, not strict checkerboard
- Coast edge is sharpest (1-2px), corruption widest (5-6px)

### Trees
- **Deciduous**: flattened ellipse canopy 7×5px, 2-3 green shades
  - Highlight top-left, shadow bottom-right
  - Trunk: 1px wide, 2-3px tall, dark brown #4A3000
- **Pine**: triangular/tiered, 5×7-9px, darker cooler greens
- **Palm**: splayed fan fronds, curved trunk

### Shadows
- Light source: **top-left (NW)**
- All shadows cast bottom-right (SE), offset (1-2, 2-3) pixels
- Color: black at 20-30% opacity
- Terrain elevation: 1-2px dark edge on south/east sides

### Other Details
- NO anti-aliasing anywhere
- NO smooth gradients — all discrete bands/steps
- Nearest-neighbor zoom scaling
- Clouds: white blobs with stepped edges, cast ground shadows
- Foam: sparse white pixels at shoreline, every 3-5px
