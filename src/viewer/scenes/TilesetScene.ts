declare const Phaser: any;

const TILE_SIZE = 16;
const TILESET_COLS = 16; // 256px / 16px

// Map our biome tile names to [col, row] positions in overworld.png
// Each biome gets a primary tile and optional variants
const TILE_MAP: Record<string, { col: number; row: number }[]> = {
  // Ocean — water tiles
  ocean: [
    { col: 0, row: 5 }, { col: 1, row: 5 }, { col: 2, row: 5 },
    { col: 3, row: 5 }, { col: 4, row: 5 }, { col: 5, row: 5 },
    { col: 0, row: 6 }, { col: 1, row: 6 },
  ],
  // Beach — sand tiles
  beach: [
    { col: 6, row: 11 }, { col: 7, row: 11 }, { col: 8, row: 11 },
    { col: 6, row: 12 }, { col: 7, row: 12 }, { col: 8, row: 12 },
  ],
  // Grassland — light green grass
  grassland: [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
    { col: 3, row: 0 }, { col: 4, row: 0 }, { col: 0, row: 1 },
    { col: 1, row: 1 }, { col: 2, row: 1 },
  ],
  // Forest — dark green tree tiles
  forest: [
    { col: 6, row: 1 }, { col: 7, row: 1 }, { col: 10, row: 0 },
    { col: 11, row: 0 }, { col: 10, row: 1 }, { col: 11, row: 1 },
    { col: 10, row: 2 }, { col: 11, row: 2 },
  ],
  // Desert — sand/path tiles (warm toned)
  desert: [
    { col: 14, row: 1 }, { col: 15, row: 1 }, { col: 14, row: 2 },
    { col: 15, row: 2 }, { col: 11, row: 7 }, { col: 12, row: 7 },
  ],
  // Mountain — stone/rock tiles
  mountain: [
    { col: 7, row: 3 }, { col: 8, row: 3 }, { col: 9, row: 3 },
    { col: 8, row: 0 }, { col: 9, row: 0 },
  ],
  // Tundra — reuse lighter grey/stone + grass edges
  tundra: [
    { col: 14, row: 5 }, { col: 15, row: 5 }, { col: 14, row: 6 },
    { col: 15, row: 6 }, { col: 13, row: 7 },
  ],
  // Swamp — dark green mixed tiles
  swamp: [
    { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 },
    { col: 5, row: 2 }, { col: 6, row: 2 }, { col: 7, row: 2 },
  ],
};

interface TileDef {
  id: number;
  name: string;
  biome: string;
  walkable: boolean;
  variant?: number;
}

interface Region {
  id: string;
  name: string;
  description: string;
  biome: string;
  gridX: number;
  gridY: number;
}

interface WorldData {
  width: number;
  height: number;
  regionSize: number;
  terrain: number[];
  decorations: number[];
  regionGrid: number[];
  tileDefs: TileDef[];
  blueprint: {
    seed: string;
    name: string;
    description: string;
    width: number;
    height: number;
    regions: Region[];
  };
}

export class TilesetScene extends Phaser.Scene {
  private worldData!: WorldData;
  private panSpeed = 400;
  private cursors!: any;
  private wasd!: Record<string, any>;
  private hoverInfo!: any;
  private tileDefMap!: Map<number, TileDef>;
  private regionMap!: Map<string, Region>;

  constructor() {
    super({ key: 'TilesetScene' });
  }

  preload(): void {
    const worldPath = this.game.registry.get('worldPath') as string;
    this.load.json('world', worldPath);
    this.load.image('overworld', '/tilesets/overworld.png');
  }

  create(): void {
    this.worldData = this.cache.json.get('world') as WorldData;
    if (!this.worldData) {
      this.addText(this.scale.width / 2, this.scale.height / 2, 'Failed to load world data', '#ff4444');
      return;
    }

    const { width, height, tileDefs } = this.worldData;

    // Build lookups
    this.tileDefMap = new Map();
    for (const def of tileDefs) this.tileDefMap.set(def.id, def);
    this.regionMap = new Map();
    for (const r of this.worldData.blueprint.regions) {
      this.regionMap.set(`${r.gridX},${r.gridY}`, r);
    }

    // Build a mapping: for each tile def, pick a frame from the tileset
    const biomeFrameMap = this.buildBiomeFrameMap(tileDefs);

    // Create a canvas-based tileset that remaps our tile IDs to tileset sprites
    const tilesetKey = this.buildRemappedTileset(tileDefs, biomeFrameMap);

    // Build tilemap data
    const mapData = this.buildTilemapData(width, height, tileDefs);

    const map = this.make.tilemap({ data: mapData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('remapped-tileset', tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0);
    map.createLayer(0, tileset, 0, 0);

    // Camera — auto-fit the full map or use ?zoom= param
    const cam = this.cameras.main;
    cam.setBounds(0, 0, width * TILE_SIZE, height * TILE_SIZE);
    cam.centerOn((width * TILE_SIZE) / 2, (height * TILE_SIZE) / 2);

    const params = new URLSearchParams(window.location.search);
    const zoomParam = params.get('zoom');
    if (zoomParam) {
      cam.setZoom(parseFloat(zoomParam));
    } else {
      // Auto-fit: zoom to show the full map
      const zoomX = this.scale.width / (width * TILE_SIZE);
      const zoomY = this.scale.height / (height * TILE_SIZE);
      cam.setZoom(Math.min(zoomX, zoomY, 1));
    }

    this.input.on('wheel', (_p: any, _o: any, _dx: number, _dy: number, dz: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * 0.001, 0.25, 4));
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, any>;

    // HUD
    this.add.text(8, 8, [
      this.worldData.blueprint.name,
      `Seed: ${this.worldData.blueprint.seed}`,
      `Size: ${width}x${height}`,
      '', 'WASD/Arrows: Pan', 'Scroll: Zoom',
    ].join('\n'), {
      fontFamily: 'monospace', fontSize: '13px', color: '#fff',
      backgroundColor: '#000000cc', padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(100);

    // Hover info
    this.hoverInfo = this.add.text(8, this.scale.height - 8, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#fff',
      backgroundColor: '#000000cc', padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(100).setOrigin(0, 1);

    this.input.on('pointermove', (pointer: any) => {
      const wp = cam.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(wp.x / TILE_SIZE);
      const ty = Math.floor(wp.y / TILE_SIZE);
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
        this.hoverInfo.setText('');
        return;
      }
      const tileId = this.worldData.terrain[ty * width + tx];
      const def = this.tileDefMap.get(tileId);
      const gx = Math.floor(tx / this.worldData.regionSize);
      const gy = Math.floor(ty / this.worldData.regionSize);
      const region = this.regionMap.get(`${gx},${gy}`);
      const lines: string[] = [];
      if (region) lines.push(`Region: ${region.name}`);
      if (def) lines.push(`Tile: ${def.name} (${def.biome})`);
      lines.push(`Pos: ${tx}, ${ty}`);
      this.hoverInfo.setText(lines.join('\n'));
    });
  }

  update(_time: number, delta: number): void {
    if (!this.cursors) return;
    const cam = this.cameras.main;
    const speed = (this.panSpeed / cam.zoom) * (delta / 1000);
    if (this.cursors.left.isDown || this.wasd.left.isDown) cam.scrollX -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown) cam.scrollX += speed;
    if (this.cursors.up.isDown || this.wasd.up.isDown) cam.scrollY -= speed;
    if (this.cursors.down.isDown || this.wasd.down.isDown) cam.scrollY += speed;
  }

  /**
   * For each tile definition, deterministically pick a frame from the tileset
   * based on its biome and a hash of its ID.
   * Returns: tileDefIndex → { col, row } in the source tileset.
   */
  private buildBiomeFrameMap(tileDefs: TileDef[]): Map<number, { col: number; row: number }> {
    const map = new Map<number, { col: number; row: number }>();
    for (let i = 0; i < tileDefs.length; i++) {
      const def = tileDefs[i];
      const frames = TILE_MAP[def.biome] ?? TILE_MAP['grassland'];
      // Pick a frame based on the tile ID so it's deterministic
      const frameIdx = def.id % frames.length;
      map.set(i, frames[frameIdx]);
    }
    return map;
  }

  /**
   * Build a new tileset texture where frame i contains the appropriate
   * sprite from the overworld tileset for tileDef[i].
   */
  private buildRemappedTileset(
    tileDefs: TileDef[],
    frameMap: Map<number, { col: number; row: number }>,
  ): string {
    const count = tileDefs.length;
    const srcImage = this.textures.get('overworld').getSourceImage() as HTMLImageElement;

    const canvas = document.createElement('canvas');
    canvas.width = count * TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d')!;

    for (let i = 0; i < count; i++) {
      const frame = frameMap.get(i);
      if (frame) {
        ctx.drawImage(
          srcImage,
          frame.col * TILE_SIZE, frame.row * TILE_SIZE, TILE_SIZE, TILE_SIZE,
          i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
        );
      }
    }

    const key = 'remapped-tileset';
    this.textures.addCanvas(key, canvas);
    return key;
  }

  private buildTilemapData(width: number, height: number, tileDefs: TileDef[]): number[][] {
    const { terrain } = this.worldData;
    const idToFrame = new Map<number, number>();
    for (let i = 0; i < tileDefs.length; i++) {
      idToFrame.set(tileDefs[i].id, i);
    }

    const grid: number[][] = [];
    for (let row = 0; row < height; row++) {
      const r: number[] = [];
      for (let col = 0; col < width; col++) {
        r.push(idToFrame.get(terrain[row * width + col]) ?? 0);
      }
      grid.push(r);
    }
    return grid;
  }

  private addText(x: number, y: number, msg: string, color: string): void {
    this.add.text(x, y, msg, {
      fontFamily: 'monospace', fontSize: '18px', color,
    }).setOrigin(0.5);
  }
}
