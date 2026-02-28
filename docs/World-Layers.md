Layer 1 — The Foundation: Noise
Technology: Simplex Noise / Perlin Noise
This is the bedrock of everything. Raw math that produces natural-looking random numbers. You feed it an x,y coordinate and get back a value between 0 and 1. No libraries needed beyond simplex-noise npm. Everything else reads from this layer.
What it generates: elevation, moisture, temperature maps.

Layer 2 — Biomes
Technology: Whittaker Biome Classification
You take the elevation + moisture + temperature values from Layer 1 and classify each tile into a biome. This is pure logic — no library needed. The Whittaker diagram (a classic ecology chart) tells you exactly which combination of moisture and temperature produces which biome. Grassland, desert, tundra, rainforest — all determined here.
What it generates: the biome identity of every tile in the world.

Layer 3 — Macro Structure
Technology: Voronoi Diagrams
Scatter random seed points across the world, then assign every tile to its nearest seed point. This creates natural-looking regions — like how countries or continents are shaped. Each Voronoi region gets a dominant biome from Layer 2, so you get large coherent areas instead of noisy chaos. Library: d3-voronoi or voronoi-diagram npm.
What it generates: regions, continents, political zones, biome territories.

Layer 4 — Terrain Detail
Technology: Wave Function Collapse (WFC)
Now that you know what biome each region is, WFC fills in the actual tiles. It ensures grass borders sand before water, trees cluster naturally, paths connect logically. WFC reads the biome from Layer 2 and the region from Layer 3, then produces locally coherent tile placement. Library: kchapelier/wavefunctioncollapse or write your own.
What it generates: actual tile indices that go into your Phaser tilemap.

Layer 5 — Hydraulics
Technology: Flow Simulation / Erosion
Rivers and coastlines. Rivers start at high elevation from Layer 1 and flow downhill using a simple steepest-descent algorithm. Erosion slightly modifies the elevation map to make terrain look geologically believable — valleys where rivers ran, flatter deltas near the sea. No library needed, pure math.
What it generates: river paths, lakes, coastal shapes, eroded valleys.

Layer 6 — Structures
Technology: BSP Trees + Template Stamping
Binary Space Partitioning splits regions into subregions, then stamps pre-designed structure templates (villages, ruins, dungeons) into valid locations. BSP guarantees structures don't overlap and are distributed naturally across the world. Templates are just 2D arrays of tile indices you define once and reuse.
What it generates: villages, dungeons, ruins, shrines, towers.

Layer 7 — Semantic Layer
Technology: LLM (Claude API)
This is where AI gives the world meaning. You feed the output of all previous layers — biome distribution, region count, river paths, structure locations — to an LLM and ask it to generate: region names, world lore, faction territories, quest hooks, NPC backstories. The LLM doesn't touch tiles, it just adds narrative on top of the physical world.
What it generates: names, lore, factions, quests, dialogue seeds.

Layer 8 — Visual Polish
Technology: Shader / Post-processing
The rendering layer. Takes the tile output from Layer 4 and makes it look stunning. Includes: normal maps for depth illusion on flat tiles, ambient occlusion between tiles, a day/night color grading shader, water animation via UV scrolling, and fog of war. In Phaser you do this with pipeline shaders or a WebGL post-process pass.
What it generates: visual atmosphere, lighting, shadows, animated effects.

Layer 9 — Infinite Streaming
Technology: Chunk Manager + Spatial Hashing
Wraps everything above into an infinite system. The world is divided into chunks (e.g. 16x16 tiles). Only chunks near the camera are generated and kept in memory. Each chunk is generated deterministically from its coordinates + the world seed, so the same chunk always looks identical. Spatial hashing maps chunk coordinates to memory slots for O(1) lookup.
What it generates: infinite explorable world with no loading screens.

The full stack visualized:
Layer 9 │ Chunk Manager          → infinite streaming
Layer 8 │ Shaders / Post-FX      → visual beauty
Layer 7 │ LLM (Claude API)       → meaning & lore  
Layer 6 │ BSP + Templates        → structures
Layer 5 │ Flow Simulation        → rivers & erosion
Layer 4 │ Wave Function Collapse → tile placement
Layer 3 │ Voronoi Diagrams       → macro regions
Layer 2 │ Whittaker Biomes       → biome identity
Layer 1 │ Simplex Noise          → raw terrain data
Each layer only reads from the layers below it. That's the key — it keeps everything modular and lets you swap out any single layer without breaking the rest. Want to replace WFC with a neural network? Swap Layer 4. Want a different biome system? Swap Layer 2. The architecture stays the same.
Want me to update the PRD to reflect this full 9-layer stack?