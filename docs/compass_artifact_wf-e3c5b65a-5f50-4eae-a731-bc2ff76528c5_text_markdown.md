# AI-driven procedural world generation: a practical toolkit

**Wave Function Collapse dominates the JavaScript/Phaser.js ecosystem for 2D world generation, with at least two npm-ready libraries built specifically for tilemaps, while LLM-based and neural network approaches are maturing rapidly in Python with emerging web bridges.** For a capable developer building a Phaser.js game, the most immediately actionable path combines a JS-native WFC library like `blazinwfc` (designed for Phaser tilemaps) with an LLM pipeline for higher-level world structure. Below is a curated, practitioner-focused guide across all four AI-driven procedural generation approaches, with direct links to repos, tutorials, and implementations.

---

## Wave Function Collapse is your fastest path to 2D tile worlds

WFC is the most mature, best-documented, and most JavaScript-friendly approach for 2D procedural generation. The algorithm treats tile placement as a constraint satisfaction problem — each cell in your grid starts with all possible tiles, then collapses one at a time, propagating constraints to neighbors until the entire map is filled.

**The essential JS libraries for Phaser developers:**

- **blazinwfc** (https://github.com/Arkyris/blazinwfc) — Built specifically for Phaser tilemaps. Returns tile index arrays directly compatible with Phaser's tilemap system. Includes built-in backtracking (no restart on contradictions) and benchmarks faster than alternatives for tile-based use cases. Usage is minimal: `const wfc = new WFC(definition); const map = wfc.collapse(50);`
- **wavefunctioncollapse** (https://github.com/kchapelier/wavefunctioncollapse, `npm install wavefunctioncollapse`) — The canonical JS port of mxgmn's original, supporting both OverlappingModel and SimpleTiledModel. Works in Node.js and browser. Mature, frozen API.
- **ndwfc** (https://github.com/LingDong-/ndwfc) — N-dimensional WFC with **infinite canvas** support, ideal for expanding/streaming world generation in a Phaser game.

**The original reference implementation** by mxgmn (https://github.com/mxgmn/WaveFunctionCollapse, **~24,700 stars**) remains the canonical starting point. Written in C#, its README links to every major port and spinoff. The algorithm supports two models: the Overlapping Model (extracts NxN patterns from a source image) and the Simple Tiled Model (uses predefined tiles with adjacency rules). For 2D game worlds, the Simple Tiled Model is almost always what you want.

**Best learning sequence for a developer:** Start with Robert Heaton's brilliant wedding-seating-plan analogy (https://robertheaton.com/2018/12/17/wavefunction-collapse-algorithm/) for intuition, then read Boris the Brave's deeper technical explanation (https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/), then watch Daniel Shiffman's Coding Train Challenge #171 (https://thecodingtrain.com/challenges/171-wave-function-collapse/) which live-codes WFC in JavaScript with p5.js. The companion GitHub repo (https://github.com/CodingTrain/Wave-Function-Collapse) includes backtracking extensions.

For production-grade architecture reference, study **DeBroglie** (https://github.com/BorisTheBrave/DeBroglie), the most feature-rich WFC library in any language. It supports backtracking, path connectivity constraints, hex grids, 3D, and multiple constraint algorithms. Boris the Brave's "WFC Tips and Tricks" post (https://www.boristhebrave.com/2020/02/08/wave-function-collapse-tips-and-tricks/) is essential reading on WFC's main weakness — **lack of global structure** — and how to mitigate it by combining WFC with Binary Space Partitioning or biome pre-assignment. Games like **Townscaper**, **Bad North**, and **Caves of Qud** all ship with WFC in production. Oskar Stålberg's interactive browser demo (http://oskarstalberg.com/game/wave/wave.html) lets you feel the algorithm in action.

---

## LLM-driven world building generates structure, not just tiles

LLMs excel at generating the *high-level architecture* of game worlds — biome layouts, narrative contexts, quest structures, NPC placements — which can then feed into tile-level generators like WFC. The key pattern is **structured output pipelines**: force the LLM to output valid JSON tile maps or world definitions using schemas, then render those in your game engine.

**The most Phaser-relevant resource** is **PhiloAgents** (https://www.decodingai.com/p/build-your-gaming-simulation-ai-agent), a free 6-lesson open-source course that builds a Phaser 3 game with LLM-powered AI agents. The architecture uses **Phaser.js** for rendering, **FastAPI + WebSockets** for real-time LLM communication, **LangGraph** for agent reasoning, and **Groq** (Llama 3.3 70B) as the LLM provider. This is the exact tech stack pattern for integrating LLMs with a Phaser game.

**Standout implementations:**

- **MarioGPT** (https://github.com/shyamsn97/mario-gpt) — A fine-tuned GPT-2 that generates playable Super Mario Bros levels from text prompts like "many pipes, many enemies, high elevation." Install via `pip install mario-gpt` and generate levels in **5 lines of code**. Published at NeurIPS 2023. Includes a Hugging Face browser demo. This is the clearest proof that small LLMs can learn spatial tile constraints.
- **Word2World** (https://github.com/umair-nasir14/Word2World) — A full pipeline where GPT-4 generates a story, extracts narrative elements, then produces tile maps for playable 2D RPG worlds with a **90% success rate** for playable output. Outputs `game_data.json` with complete world state. Published at AAAI 2024.
- **dream-jrpg** (https://github.com/awjuliani/dream-jrpg) — Generates entire browser-based JRPGs from seed prompts. The LLM creates story synopses, chapter breakdowns, world locations, characters, items, and enemies. Players answer a few questions and get a complete, playable game. MIT licensed.
- **Everchanging Quest** (https://github.com/Jofthomas/Everchanging-Quest) — A Zelda-style Pygame game where GPT-4 function calls generate tile placements (as CSV maps), NPC dialogues, quests, and item stats in real-time. The accompanying Medium tutorial (https://medium.com/@jofthomas/i-made-a-game-with-llm-the-hugging-face-open-source-game-jam-1cf0af8a0bf9) is an excellent walkthrough of the structured output pattern.

**The most practical tutorial for adapting LLM level generation to a custom game** is the Bloxorz/GPT-2 tutorial (https://sublevelgames.github.io/blogs/2025-10-20-generate-bloxorz-map-with-gpt-2/) which walks through preparing training maps as JSON, fine-tuning GPT-2 with LoRA, and evaluating output quality. The Sokoban LLM-PCG codebase it builds on (https://github.com/gdrtodd/lm-pcg) from NYU demonstrates that even GPT-2 can learn spatial puzzle constraints when levels are represented as ASCII token sequences.

For your Phaser.js game specifically, the recommended architecture is: **Phaser.js frontend → WebSocket connection → Python FastAPI backend → LLM API call → structured JSON world definition → parse and render in Phaser.** The PhiloAgents course demonstrates this exact pattern end-to-end.

---

## Neural networks generate terrain that noise functions cannot

GANs and diffusion models produce terrain with realistic geological features — erosion patterns, river networks, cliff formations — that Perlin noise alone cannot replicate. The tradeoff is that these approaches are almost exclusively Python-based and require GPU resources for training, though inference can be fast.

**For heightmap and 3D terrain:**

- **TerrainGAN** (https://github.com/jayin92/TerrainGAN) combines a VAE with pix2pix to generate realistic 3D terrain from NASA elevation data, with a Unity client for rendering. It allows style manipulation via latent code — the most game-ready neural terrain pipeline available.
- **gan-heightmaps** (https://github.com/christopher-beckham/gan-heightmaps) is the classic DCGAN-to-heightmap pipeline with an excellent companion tutorial on Medium (https://medium.com/@christopher.j.beckham/a-step-toward-procedural-terrain-generation-with-gans-691f5e91d634).
- **terrain-erosion-3-ways** (https://github.com/dandrino/terrain-erosion-3-ways, **900+ stars**) compares GAN-generated terrain against hydraulic erosion and river-based methods. The author notes GAN terrain is "basically indistinguishable from real-world elevation data" but warns training is expensive (~1 week on a Tesla GPU) with limited output control.
- **ML Terraform** (https://apseren.com/mlterraform/) is the most accessible option — a **browser-based** DCGAN terrain generator supporting 5 biomes with no coding required. Also available as a Unity asset.

**For 2D game levels, Neural Cellular Automata (NCA) are more relevant** than terrain GANs. **control-pcgrl** (https://github.com/smearle/control-pcgrl) trains NCAs using reinforcement learning to generate Zelda-like dungeons, platformer levels, and Sokoban puzzles. It's the definitive NCA-for-games codebase with quality-diversity evolution, multiple game environments, and Minecraft rendering support.

**Diffusion models as game engines** represent a fascinating frontier. **DIAMOND** (https://github.com/eloialonso/diamond), a NeurIPS 2024 Spotlight paper, trains an RL agent entirely inside a diffusion world model and achieves playable Counter-Strike: GO simulation at ~10 FPS. **Diffusion-Model-Game-Engine** (https://github.com/ProfessorNova/Diffusion-Model-Game-Engine) implements the GameNGen concept for Super Mario Kart with a pretrained model you can play immediately. These aren't directly useful for *generating* game worlds yet, but they signal where the field is heading.

The best introductory tutorial for neural PCG is Matthew MacFarquhar's step-by-step walkthrough (https://matthewmacfarquhar.medium.com/procedural-content-generation-with-neural-networks-104e39e41982) building DNN regression, classification, and autoencoder models for level generation in TensorFlow. For the JavaScript ecosystem specifically, **kchapelier's procedural-generation** list (https://github.com/kchapelier/procedural-generation) is the best JS-centric PCG resource hub, covering noise functions, cellular automata, WFC ports, and more.

---

## Reinforcement learning agents that learn to design levels

RL-based PCG flips the script: instead of hand-coding generation rules, you train an agent to iteratively edit a tile grid, rewarding it for producing playable, interesting levels. After training, the agent generates levels near-instantly. The key advantage is **no training dataset required** — just a reward function defining what makes a good level.

**The PCGRL framework** (https://github.com/amidos2006/gym-pcgrl, **660+ stars**) is the foundational tool. Developed at NYU, it provides OpenAI Gym environments where RL agents learn to design 2D tile-based levels for Sokoban, Zelda-like dungeons, mazes, and Mario. It supports three agent representations — narrow (edit one tile at a time), wide (edit any tile), and turtle (navigate and edit) — and uses Stable Baselines for training. The accompanying blog post by Chintan Trivedi (https://medium.com/deepgamingai/game-level-design-with-reinforcement-learning-52b02bb94954) is the best non-technical introduction.

**Control-PCGRL** (https://github.com/smearle/control-pcgrl) extends this with controllability — specify target path lengths, enemy counts, or difficulty, and the agent generates levels matching those constraints. It uses a more modern PyTorch/JAX stack and supports quality-diversity evolution. **G-PCGRL** (https://github.com/FlorianRupp/g-pcgrl) further extends to graph structures for game economies, skill trees, and quest lines. **IPCGRL** (https://github.com/bic4907/instructed_pcgrl) adds natural language instructions via BERT embeddings, letting designers describe levels in text.

A particularly promising hybrid direction combines **RL with WFC**: a 2021 paper (https://dl.acm.org/doi/fullHtml/10.1145/3472538.3472541) replaces WFC's default minimum-entropy heuristic with an RL-trained neural network, producing more playable Super Mario Bros levels. This suggests that for your Phaser game, you could use WFC for local tile coherence while an RL agent guides global structure decisions.

One experimental JavaScript attempt exists: a blog series on adversarial RL-based procedural generation in Three.js (https://github.com/JerryJohnThomas/ProceduralGeneration_RL), though it's early-stage. PCGRL itself is Python-only, so the practical path for a Phaser game would be training in Python and serving the model via an API, similar to the LLM architecture pattern.

---

## Choosing the right approach for your Phaser.js game

The 2024 survey "PCG in Games: A Survey with Insights on Emerging LLM Integration" (https://arxiv.org/html/2410.15644v1), analyzing **207 papers** from 2019–2023, identifies hybrid approaches as the dominant emerging trend. Here's a decision framework based on that research and the practical resources above:

| Approach | Best for | JS-ready? | Setup time | Control level |
|----------|----------|-----------|------------|--------------|
| **WFC** | Tile-based 2D worlds with local visual coherence | ✅ npm packages | Hours | Medium (tile rules) |
| **LLMs** | High-level world structure, narratives, biome layouts | ⚠️ Via API + WebSocket | Days | High (natural language) |
| **GANs/Neural nets** | Realistic terrain heightmaps, style transfer | ❌ Python only | Weeks | Low (latent space) |
| **RL (PCGRL)** | Optimizing level quality metrics without training data | ❌ Python only | Weeks | High (reward function) |

**For a 2D Phaser.js game, the recommended hybrid stack is:**

1. Use an **LLM** (via API) to generate high-level world structure — biome placement, region types, narrative context, quest locations — as structured JSON
2. Feed that structure into **WFC** (via `blazinwfc` or `kchapelier/wavefunctioncollapse`) to fill each region with coherent tiles
3. Apply traditional noise functions (Perlin/Simplex via the `noisejs` npm package) for terrain variation within biomes

**Essential Phaser-specific tutorials** to ground your implementation: Michael Hadley's "Modular Game Worlds in Phaser 3: Procedural Dungeon" (https://itnext.io/modular-game-worlds-in-phaser-3-tilemaps-3-procedural-dungeon-3bc19b841cd), written by the Phaser tilemap API creator himself, and the "Top-Down Infinite Terrain Generation with Phaser 3" tutorial (https://learn.yorkcs.com/2019/02/25/top-down-infinite-terrain-generation-with-phaser-3/) demonstrating chunk-based infinite world generation with noise.

The free PCG textbook by Shaker, Togelius, and Nelson (https://www.pcgbook.com/) covers the theoretical foundations of every approach. For curated links across the entire field, **awesome-game-generation** (https://github.com/JingyeChen/awesome-game-generation) tracks cutting-edge projects and **kchapelier/procedural-generation** (https://github.com/kchapelier/procedural-generation) maintains the definitive JavaScript-centric PCG resource list.

## Conclusion

The practical landscape for AI-driven procedural generation in 2025 strongly favors **hybrid approaches** over any single technique. WFC gives you the most immediate, JS-native path to coherent 2D tile worlds — `blazinwfc` was literally built for Phaser tilemaps. LLMs add a layer of semantic intelligence that WFC lacks: global structure, narrative coherence, and natural-language controllability. Neural networks and RL remain Python-first but are increasingly accessible through API-served architectures. The most novel insight from recent research is that **combining methods compounds their strengths**: RL can guide WFC's collapse decisions, LLMs can define the constraints WFC solves, and GANs can generate the tile assets WFC arranges. Start with WFC for your tile generation, layer in an LLM for world structure, and you'll have a system more capable than any single approach alone.