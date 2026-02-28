#!/usr/bin/env node
/**
 * Render world JSON to PNG with decoration overlay.
 * Uses Node's Buffer for efficient memory; pure PNG encoder (no deps).
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const BIOME_COLORS = {
  ocean:     [0x22,0x66,0xaa], beach:     [0xe8,0xd8,0x8c],
  grassland: [0x5d,0xaa,0x40], forest:    [0x2e,0x7d,0x32],
  desert:    [0xdb,0xb8,0x5c], mountain:  [0x9e,0x9e,0x9e],
  tundra:    [0xe0,0xe8,0xf0], swamp:     [0x4a,0x6e,0x48],
};
const VARIANT_OFF = [0, 12, -12, 8, -8];
const DECO_COLORS = {
  deco_tree_pine:[0x1b,0x5e,0x20], deco_tree_oak:[0x38,0x8e,0x3c],
  deco_tree_palm:[0x66,0xbb,0x6a], deco_rock_small:[0x75,0x75,0x75],
  deco_rock_large:[0x61,0x61,0x61], deco_flower:[0xe9,0x1e,0x63],
  deco_cactus:[0x2e,0x7d,0x32], deco_mushroom:[0xd3,0x2f,0x2f],
  deco_reed:[0x8b,0xc3,0x4a], deco_snowdrift:[0xff,0xff,0xff],
  deco_seaweed:[0x00,0x69,0x5c],
};

const clamp = v => Math.max(0, Math.min(255, v));

function makePNG(buf, w, h) {
  // buf is a Buffer of w*h*3 RGB bytes
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 3);
    raw[rowOff] = 0; // filter none
    buf.copy(raw, rowOff + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = deflateSync(raw, { level: 6 });
  
  function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }
  
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=2; // 8bit RGB
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}

// --- Main ---
const worldPath = process.argv[2] || 'output/world-2k-deco.json';
const prefix = process.argv[3] || 'output/world-deco';

console.log('Loading world...');
const w = JSON.parse(readFileSync(worldPath, 'utf-8'));
const { width, height, terrain, decorations, tileDefs } = w;
console.log(`World: ${width}x${height}, ${tileDefs.length} defs, ${decorations.filter(d=>d).length} decos`);

// Build lookups
const defById = new Map();
for (const d of tileDefs) defById.set(d.id, d);

function getTileColor(tileId) {
  const d = defById.get(tileId);
  if (!d) return [255,0,255];
  const bc = BIOME_COLORS[d.biome] || [255,0,255];
  const off = VARIANT_OFF[d.variant || 0] || 0;
  return [clamp(bc[0]+off), clamp(bc[1]+off), clamp(bc[2]+off)];
}

// --- Overview (1:4 scale) ---
const scale = 4;
const ow = width / scale | 0, oh = height / scale | 0;
console.log(`Overview: ${ow}x${oh}...`);
const oBuf = Buffer.alloc(ow * oh * 3);

for (let oy = 0; oy < oh; oy++) {
  for (let ox = 0; ox < ow; ox++) {
    const idx = (oy * scale) * width + (ox * scale);
    let [r,g,b] = getTileColor(terrain[idx]);
    const did = decorations[idx];
    if (did) {
      const dd = defById.get(did);
      if (dd) {
        const dc = DECO_COLORS[dd.name];
        if (dc) {
          r = clamp((dc[0]*0.6 + r*0.4)|0);
          g = clamp((dc[1]*0.6 + g*0.4)|0);
          b = clamp((dc[2]*0.6 + b*0.4)|0);
        }
      }
    }
    const pi = (oy * ow + ox) * 3;
    oBuf[pi]=r; oBuf[pi+1]=g; oBuf[pi+2]=b;
  }
}
writeFileSync(`${prefix}-overview.png`, makePNG(oBuf, ow, oh));
console.log(`Saved ${prefix}-overview.png`);

// --- Zoom (center 250x250 tiles, 6px/tile) ---
const ZPIX = 6, CROP = 250;
const cx = (width/2 - CROP/2)|0, cy = (height/2 - CROP/2)|0;
const zw = CROP * ZPIX, zh = CROP * ZPIX;
console.log(`Zoom: ${zw}x${zh} (tiles ${cx},${cy} to ${cx+CROP},${cy+CROP})...`);
const zBuf = Buffer.alloc(zw * zh * 3);

for (let ty = 0; ty < CROP; ty++) {
  for (let tx = 0; tx < CROP; tx++) {
    const idx = (cy+ty)*width + (cx+tx);
    const [r,g,b] = getTileColor(terrain[idx]);
    // Fill tile rect
    for (let py = 0; py < ZPIX; py++) {
      for (let px = 0; px < ZPIX; px++) {
        const pi = ((ty*ZPIX+py)*zw + (tx*ZPIX+px))*3;
        zBuf[pi]=r; zBuf[pi+1]=g; zBuf[pi+2]=b;
      }
    }
    // Draw deco
    const did = decorations[idx];
    if (!did) continue;
    const dd = defById.get(did);
    if (!dd) continue;
    const dc = DECO_COLORS[dd.name];
    if (!dc) continue;
    
    const pcx = tx*ZPIX + ZPIX/2|0, pcy = ty*ZPIX + ZPIX/2|0;
    const setpx = (x,y) => {
      if (x>=0 && x<zw && y>=0 && y<zh) {
        const i=(y*zw+x)*3; zBuf[i]=dc[0]; zBuf[i+1]=dc[1]; zBuf[i+2]=dc[2];
      }
    };
    
    if (dd.name.includes('tree')) {
      // Triangle
      for (let dy=-2;dy<=2;dy++) {
        const w2=2-Math.abs(dy);
        for (let dx=-w2;dx<=w2;dx++) setpx(pcx+dx,pcy+dy);
      }
    } else if (dd.name.includes('rock')) {
      const rad = dd.name.includes('large') ? 2 : 1;
      for (let dy=-rad;dy<=rad;dy++)
        for (let dx=-rad;dx<=rad;dx++)
          if (dx*dx+dy*dy<=rad*rad) setpx(pcx+dx,pcy+dy);
    } else if (dd.name.includes('flower')||dd.name.includes('snow')) {
      for (let dy=-1;dy<=1;dy++) {
        const w2=1-Math.abs(dy);
        for (let dx=-w2;dx<=w2;dx++) setpx(pcx+dx,pcy+dy);
      }
    } else {
      // Line (cactus, reed, seaweed)
      for (let dy=-2;dy<=2;dy++) setpx(pcx,pcy+dy);
    }
  }
}
writeFileSync(`${prefix}-zoom.png`, makePNG(zBuf, zw, zh));
console.log(`Saved ${prefix}-zoom.png`);
console.log('Done!');
