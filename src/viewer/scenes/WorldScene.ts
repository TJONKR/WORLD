declare const Phaser: any;

const TILE_SIZE = 8;

/** Decoration rendering config: shape, color, size (relative to TILE_SIZE) */
interface DecoStyle {
  shape: 'triangle' | 'circle' | 'diamond' | 'line';
  color: number;
  size: number; // 0-1 relative to tile
}

const DECO_STYLES: Record<string, DecoStyle> = {
  deco_tree_pine:   { shape: 'triangle', color: 0x1b5e20, size: 0.8 },
  deco_tree_oak:    { shape: 'circle',   color: 0x388e3c, size: 0.7 },
  deco_tree_palm:   { shape: 'triangle', color: 0x66bb6a, size: 0.7 },
  deco_rock_small:  { shape: 'circle',   color: 0x757575, size: 0.35 },
  deco_rock_large:  { shape: 'circle',   color: 0x616161, size: 0.6 },
  deco_flower:      { shape: 'diamond',  color: 0xe91e63, size: 0.35 },
  deco_cactus:      { shape: 'line',     color: 0x2e7d32, size: 0.7 },
  deco_mushroom:    { shape: 'circle',   color: 0xd32f2f, size: 0.3 },
  deco_reed:        { shape: 'line',     color: 0x8bc34a, size: 0.6 },
  deco_snowdrift:   { shape: 'diamond',  color: 0xffffff, size: 0.5 },
  deco_seaweed:     { shape: 'line',     color: 0x00695c, size: 0.5 },
};

const BIOME_COLORS: Record<string, number> = {
  ocean:     0x2266aa,
  beach:     0xe8d88c,
  grassland: 0x5daa40,
  forest:    0x2e7d32,
  desert:    0xdbb85c,
  mountain:  0x9e9e9e,
  tundra:    0xe0e8f0,
  swamp:     0x4a6e48,
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
  elevation: number;
  moisture: number;
  pointsOfInterest: Array<{ name: string; description: string; type: string }>;
}

interface WorldData {
  width: number;
  height: number;
  regionSize: number;
  terrain: number[];
  decorations: number[];
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

export class WorldScene extends Phaser.Scene {
  private worldData!: WorldData;
  private panSpeed = 400;
  private cursors!: any;
  private wasd!: Record<string, any>;
  private overlay!: any;
  private hoverInfo!: any;
  private legendContainer!: any;
  private tileDefMap!: Map<number, TileDef>;
  private regionMap!: Map<string, Region>; // "gx,gy" → Region

  constructor() {
    super({ key: 'WorldScene' });
  }

  preload(): void {
    const worldPath = this.game.registry.get('worldPath') as string;
    this.load.json('world', worldPath);
  }

  create(): void {
    this.worldData = this.cache.json.get('world') as WorldData;
    if (!this.worldData) {
      this.addErrorText('Failed to load world data');
      return;
    }

    const { width, height, tileDefs } = this.worldData;

    // Build lookup maps
    this.tileDefMap = new Map();
    for (const def of tileDefs) this.tileDefMap.set(def.id, def);
    this.regionMap = new Map();
    for (const r of this.worldData.blueprint.regions) {
      this.regionMap.set(`${r.gridX},${r.gridY}`, r);
    }

    // Build tileset texture from biome colors
    const tilesetKey = this.generateTileset(tileDefs);

    // Create tilemap data
    const mapData = this.buildTilemapData(width, height);

    // Create the tilemap and layers
    const map = this.make.tilemap({ data: mapData.terrain, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('generated-tileset', tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0);
    map.createLayer(0, tileset, 0, 0);

    // Decoration layer — draw shapes on a render texture
    if (this.worldData.decorations.some((d: number) => d !== 0)) {
      this.renderDecorations(width, height);
    }

    // Camera setup
    const cam = this.cameras.main;
    cam.setBounds(0, 0, width * TILE_SIZE, height * TILE_SIZE);
    cam.centerOn((width * TILE_SIZE) / 2, (height * TILE_SIZE) / 2);
    cam.setZoom(1);

    // Zoom with mouse wheel
    this.input.on('wheel', (_pointer: any, _over: any, _dx: number, _dy: number, dz: number) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - dz * 0.001, 0.25, 4);
      cam.setZoom(newZoom);
    });

    // Keyboard controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, any>;

    // HUD overlay (top-left)
    this.overlay = this.add.text(8, 8, this.getOverlayText(), {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(100);

    // Hover info (bottom-left)
    this.hoverInfo = this.add.text(8, this.scale.height - 8, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(100).setOrigin(0, 1);

    // Biome legend (top-right)
    this.buildLegend();

    // Track mouse for hover info
    this.input.on('pointermove', (pointer: any) => {
      this.updateHoverInfo(pointer);
    });
  }

  update(_time: number, delta: number): void {
    if (!this.cursors) return;
    const cam = this.cameras.main;
    const speed = (this.panSpeed / cam.zoom) * (delta / 1000);

    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      cam.scrollX -= speed;
    }
    if (this.cursors.right.isDown || this.wasd.right.isDown) {
      cam.scrollX += speed;
    }
    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      cam.scrollY -= speed;
    }
    if (this.cursors.down.isDown || this.wasd.down.isDown) {
      cam.scrollY += speed;
    }
  }

  private generateTileset(tileDefs: TileDef[]): string {
    const count = tileDefs.length;
    const texWidth = count * TILE_SIZE;
    const texHeight = TILE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = texWidth;
    canvas.height = texHeight;
    const ctx = canvas.getContext('2d')!;

    for (let i = 0; i < count; i++) {
      const def = tileDefs[i];
      const baseColor = BIOME_COLORS[def.biome] ?? 0xff00ff;
      // Apply small variant offset to each color channel
      const variant = def.variant ?? 0;
      const offset = (variant % 5) * 8 - 16; // -16 to +16 range
      const r = Phaser.Math.Clamp(((baseColor >> 16) & 0xff) + offset, 0, 255);
      const g = Phaser.Math.Clamp(((baseColor >> 8) & 0xff) + offset, 0, 255);
      const b = Phaser.Math.Clamp((baseColor & 0xff) + offset, 0, 255);

      const x = i * TILE_SIZE;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, TILE_SIZE, TILE_SIZE);

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(x, 0, TILE_SIZE, TILE_SIZE);
    }

    const key = 'generated-tileset';
    this.textures.addCanvas(key, canvas);
    return key;
  }

  private buildTilemapData(width: number, height: number): { terrain: number[][]; decorations: number[][] } {
    const { terrain, decorations, tileDefs } = this.worldData;

    // Map tile IDs to tileset frame indices (0-based sequential)
    const idToFrame = new Map<number, number>();
    for (let i = 0; i < tileDefs.length; i++) {
      idToFrame.set(tileDefs[i].id, i);
    }

    const terrainGrid: number[][] = [];
    const decoGrid: number[][] = [];

    for (let row = 0; row < height; row++) {
      const tRow: number[] = [];
      const dRow: number[] = [];
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        tRow.push(idToFrame.get(terrain[idx]) ?? 0);
        dRow.push(decorations[idx] === 0 ? -1 : (idToFrame.get(decorations[idx]) ?? -1));
      }
      terrainGrid.push(tRow);
      decoGrid.push(dRow);
    }

    return { terrain: terrainGrid, decorations: decoGrid };
  }

  private getOverlayText(): string {
    const bp = this.worldData.blueprint;
    return [
      bp.name,
      `Seed: ${bp.seed}`,
      `Size: ${this.worldData.width}x${this.worldData.height}`,
      '',
      'WASD / Arrows: Pan',
      'Mouse wheel: Zoom',
    ].join('\n');
  }

  private buildLegend(): void {
    const x = this.scale.width - 8;
    let y = 8;
    const lineH = 18;
    const swatchSize = 12;

    // Background
    const biomes = Object.keys(BIOME_COLORS);
    const bgH = lineH * (biomes.length + 1) + 12;
    const bgW = 140;
    const bg = this.add.rectangle(x - bgW / 2, y + bgH / 2 - 2, bgW, bgH, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(99).setOrigin(0.5, 0.5);

    // Title
    const title = this.add.text(x - bgW + 8, y, 'Biomes', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaaaaa',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100);
    y += lineH + 2;

    // Biome entries
    for (const biome of biomes) {
      const color = BIOME_COLORS[biome];
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;

      // Color swatch
      const swatch = this.add.rectangle(x - bgW + 14, y + swatchSize / 2, swatchSize, swatchSize, color)
        .setScrollFactor(0).setDepth(100);

      // Label
      this.add.text(x - bgW + 14 + swatchSize + 6, y, biome, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
      }).setScrollFactor(0).setDepth(100);

      y += lineH;
    }
  }

  private updateHoverInfo(pointer: any): void {
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(pointer.x, pointer.y);
    const worldX = Math.floor(wp.x / TILE_SIZE);
    const worldY = Math.floor(wp.y / TILE_SIZE);

    const { width, height, regionSize, terrain } = this.worldData;
    if (worldX < 0 || worldX >= width || worldY < 0 || worldY >= height) {
      this.hoverInfo.setText('');
      return;
    }

    const tileId = terrain[worldY * width + worldX];
    const tileDef = this.tileDefMap.get(tileId);

    const gx = Math.floor(worldX / regionSize);
    const gy = Math.floor(worldY / regionSize);
    const region = this.regionMap.get(`${gx},${gy}`);

    const lines: string[] = [];
    if (region) {
      lines.push(`Region: ${region.name} [${gx},${gy}]`);
    }
    if (tileDef) {
      lines.push(`Tile: ${tileDef.name} (${tileDef.biome})${tileDef.walkable ? '' : ' [blocked]'}`);
    }
    lines.push(`Pos: ${worldX}, ${worldY}`);

    this.hoverInfo.setText(lines.join('\n'));
  }

  private renderDecorations(width: number, height: number): void {
    const { decorations } = this.worldData;
    const gfx = this.add.graphics();
    const half = TILE_SIZE / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const decoId = decorations[y * width + x];
        if (decoId === 0) continue;

        const def = this.tileDefMap.get(decoId);
        if (!def) continue;

        const style = DECO_STYLES[def.name];
        if (!style) continue;

        const cx = x * TILE_SIZE + half;
        const cy = y * TILE_SIZE + half;
        const r = (TILE_SIZE * style.size) / 2;

        gfx.fillStyle(style.color, 0.9);

        switch (style.shape) {
          case 'circle':
            gfx.fillCircle(cx, cy, r);
            break;
          case 'triangle':
            gfx.fillTriangle(cx, cy - r, cx - r, cy + r, cx + r, cy + r);
            break;
          case 'diamond':
            gfx.fillTriangle(cx, cy - r, cx - r, cy, cx + r, cy);
            gfx.fillTriangle(cx, cy + r, cx - r, cy, cx + r, cy);
            break;
          case 'line':
            gfx.fillRect(cx - 1, cy - r, 2, r * 2);
            break;
        }
      }
    }
  }

  private addErrorText(msg: string): void {
    this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      msg,
      { fontFamily: 'monospace', fontSize: '18px', color: '#ff4444' },
    ).setOrigin(0.5);
  }
}
