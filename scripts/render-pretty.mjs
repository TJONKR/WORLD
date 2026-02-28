#!/usr/bin/env node
/**
 * Pretty renderer — noise-blended terrain + elevation shading + biome edge blending.
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

// ═══════════════════════════════════════
// BIOME COLOR PALETTES (3-4 shades each)
// ═══════════════════════════════════════
// Each biome has shades from dark→light, picked by noise
const BIOME_PALETTES = {
  ocean:     [[0x0D,0x47,0x80],[0x15,0x55,0x8E],[0x1E,0x66,0xA0],[0x2B,0x7A,0xB8]],
  beach:     [[0xC4,0xB0,0x6D],[0xD4,0xC4,0x7D],[0xE8,0xD8,0x8C],[0xF2,0xE8,0xA8]],
  grassland: [[0x3D,0x7A,0x28],[0x4C,0x8C,0x34],[0x5D,0xAA,0x40],[0x76,0xBB,0x58],[0x8E,0xC9,0x6E]],
  forest:    [[0x1A,0x4D,0x1E],[0x22,0x60,0x26],[0x2E,0x7D,0x32],[0x38,0x8E,0x3C]],
  desert:    [[0xB8,0x96,0x48],[0xC8,0xA6,0x50],[0xDB,0xB8,0x5C],[0xE8,0xCA,0x70],[0xF0,0xDA,0x82]],
  mountain:  [[0x6E,0x6E,0x6E],[0x82,0x82,0x82],[0x9E,0x9E,0x9E],[0xB0,0xB0,0xB0]],
  tundra:    [[0xC0,0xCC,0xD8],[0xD0,0xD8,0xE4],[0xE0,0xE8,0xF0],[0xEE,0xF2,0xF8]],
  swamp:     [[0x33,0x50,0x33],[0x3E,0x5E,0x3E],[0x4A,0x6E,0x48],[0x56,0x7D,0x54]],
};

const DECO_COLORS = {
  deco_tree_pine:[0x1b,0x5e,0x20], deco_tree_oak:[0x38,0x8e,0x3c],
  deco_tree_palm:[0x66,0xbb,0x6a], deco_rock_small:[0x75,0x75,0x75],
  deco_rock_large:[0x61,0x61,0x61], deco_flower:[0xe9,0x1e,0x63],
  deco_cactus:[0x2e,0x7d,0x32], deco_mushroom:[0xd3,0x2f,0x2f],
  deco_reed:[0x8b,0xc3,0x4a], deco_snowdrift:[0xff,0xff,0xff],
  deco_seaweed:[0x00,0x69,0x5c],
};

const HOUSE_PALETTES = [
  { roof:[0x8B,0x45,0x13], wall:[0xF5,0xE6,0xCC], door:[0x5D,0x34,0x0F] },
  { roof:[0xB7,0x41,0x0E], wall:[0xFA,0xEB,0xD7], door:[0x6B,0x3A,0x2E] },
  { roof:[0x2E,0x4A,0x62], wall:[0xEC,0xE5,0xD8], door:[0x4A,0x35,0x28] },
  { roof:[0x6B,0x8E,0x23], wall:[0xF0,0xE6,0xD2], door:[0x5C,0x40,0x33] },
];

const clamp = v => Math.max(0, Math.min(255, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c1, c2, t) => [
  clamp(lerp(c1[0], c2[0], t) | 0),
  clamp(lerp(c1[1], c2[1], t) | 0),
  clamp(lerp(c1[2], c2[2], t) | 0),
];

// ═══════════════════════════════
// PNG ENCODER
// ═══════════════════════════════
function makePNG(buf, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y*(1+w*3)]=0; buf.copy(raw,y*(1+w*3)+1,y*w*3,(y+1)*w*3); }
  const idat = deflateSync(raw, { level: 6 });
  function crc32(d){let c=0xffffffff;for(let i=0;i<d.length;i++){c^=d[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}

// ═══════════════════════════════
// LOAD WORLD
// ═══════════════════════════════
const worldPath = process.argv[2] || 'output/world-2k-struct.json';
console.log('Loading world...');
const world = JSON.parse(readFileSync(worldPath, 'utf-8'));
const { width, height, terrain, decorations, tileDefs, structures, decoTints } = world;
const defById = new Map();
for (const d of tileDefs) defById.set(d.id, d);
console.log(`World: ${width}x${height}, ${structures?.length||0} structures`);

// ═══════════════════════════════════════
// GENERATE NOISE MAPS FOR COLOR BLENDING
// ═══════════════════════════════════════
console.log('Generating noise maps...');
function makeNoise(seed, freq, octaves = 4) {
  const prng = Alea(seed);
  const n = createNoise2D(prng);
  return (x, y) => {
    let v = 0, f = freq, a = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      v += n(x * f, y * f) * a;
      max += a; f *= 2; a *= 0.5;
    }
    return (v / max + 1) / 2; // [0,1]
  };
}

const colorNoise = makeNoise('color-variation', 0.04, 5);
const elevNoise = makeNoise('elevation-shade', 0.015, 6);
const detailNoise = makeNoise('detail-texture', 0.15, 3);
const blendNoise = makeNoise('biome-blend', 0.08, 3);

// ═══════════════════════════════════════
// BUILD BIOME MAP (per tile)
// ═══════════════════════════════════════
const biomeMap = new Array(width * height);
for (let i = 0; i < terrain.length; i++) {
  const d = defById.get(terrain[i]);
  biomeMap[i] = d ? d.biome : 'ocean';
}

// ═══════════════════════════════════════
// CORE: Get blended terrain color for a pixel
// ═══════════════════════════════════════
function getTerrainColorAt(tx, ty) {
  const biome = biomeMap[ty * width + tx];
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.ocean;

  // 1) Noise-based shade selection within biome
  const cn = colorNoise(tx, ty);
  const shadeIdx = Math.min(palette.length - 1, (cn * palette.length) | 0);
  let baseColor = [...palette[shadeIdx]];

  // 2) Fine detail noise — subtle per-pixel variation
  const detail = (detailNoise(tx, ty) - 0.5) * 16;
  baseColor = [clamp(baseColor[0]+detail), clamp(baseColor[1]+detail), clamp(baseColor[2]+detail)];

  // 3) Elevation shading — darken lows, brighten highs
  const elev = elevNoise(tx, ty); // 0=low, 1=high
  const elevFactor = 0.7 + elev * 0.6; // range 0.7 to 1.3
  baseColor = [
    clamp((baseColor[0] * elevFactor) | 0),
    clamp((baseColor[1] * elevFactor) | 0),
    clamp((baseColor[2] * elevFactor) | 0),
  ];

  // 4) Biome edge blending — sample neighbors and blend if different biome
  const BLEND_R = 5;
  let blendCount = 0;
  let blendR = 0, blendG = 0, blendB = 0;

  // Only check 4 sample directions for performance
  for (const [dx, dy] of [[-BLEND_R,0],[BLEND_R,0],[0,-BLEND_R],[0,BLEND_R],[-BLEND_R,-BLEND_R],[BLEND_R,BLEND_R]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const nBiome = biomeMap[ny * width + nx];
    if (nBiome !== biome) {
      const nPalette = BIOME_PALETTES[nBiome] || BIOME_PALETTES.ocean;
      const nShade = Math.min(nPalette.length - 1, (cn * nPalette.length) | 0);
      const nColor = nPalette[nShade];
      blendR += nColor[0]; blendG += nColor[1]; blendB += nColor[2];
      blendCount++;
    }
  }

  if (blendCount > 0) {
    // Use noise to make the blend edge irregular (not a straight line)
    const bn = blendNoise(tx, ty);
    const blendStrength = Math.min(0.45, (blendCount / 6) * 0.5) * (0.5 + bn * 0.5);
    const avgR = blendR / blendCount, avgG = blendG / blendCount, avgB = blendB / blendCount;
    baseColor = lerpColor(baseColor, [avgR, avgG, avgB], blendStrength);
  }

  // 5) Special: ocean depth gradient
  if (biome === 'ocean') {
    // Find distance to nearest non-ocean tile (approximate)
    let minDist = 99;
    for (let r = 1; r <= 8; r++) {
      for (const [dx,dy] of [[r,0],[-r,0],[0,r],[0,-r]]) {
        const nx = tx+dx, ny = ty+dy;
        if (nx>=0 && nx<width && ny>=0 && ny<height && biomeMap[ny*width+nx] !== 'ocean') {
          minDist = Math.min(minDist, r);
        }
      }
    }
    if (minDist < 99) {
      // Shallow water: lighter blue near coast
      const shallowFactor = 1 - (minDist / 10);
      if (shallowFactor > 0) {
        baseColor = lerpColor(baseColor, [0x4A, 0x99, 0xC8], shallowFactor * 0.4);
      }
    }
  }

  return baseColor;
}

// ═══════════════════════════════
// PIXEL HELPERS
// ═══════════════════════════════
function setpx(buf, bw, bh, x, y, r, g, b) {
  if (x < 0 || x >= bw || y < 0 || y >= bh) return;
  const i = (y * bw + x) * 3;
  buf[i] = r; buf[i+1] = g; buf[i+2] = b;
}

function drawOutline(buf, bw, bh, points, color, outline) {
  const set = new Set(points.map(([x,y])=>`${x},${y}`));
  for (const [x,y] of points) setpx(buf,bw,bh,x,y,...color);
  for (const [x,y] of points) {
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (!set.has(`${x+dx},${y+dy}`)) setpx(buf,bw,bh,x+dx,y+dy,...outline);
    }
  }
}

function drawDeco(buf, bw, bh, pcx, pcy, name, tint) {
  const bc = DECO_COLORS[name]; if (!bc) return;
  const t = ((tint||4)-4)*5;
  const c = [clamp(bc[0]+t),clamp(bc[1]+t),clamp(bc[2]+t)];
  const dk = [clamp(c[0]-45),clamp(c[1]-45),clamp(c[2]-45)];

  if (name.includes('tree')) {
    const pts = [];
    const sz = name.includes('palm') ? 4 : (name.includes('oak') ? 5 : 6);
    for(let dy=-sz;dy<=sz-1;dy++){const w2=sz-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy-1]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    // Trunk
    const trunkC = name.includes('palm') ? [0x8B,0x6B,0x3D] : [0x5D,0x34,0x0F];
    for(let dy=sz-1;dy<=sz+2;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...trunkC);setpx(buf,bw,bh,pcx-1,pcy+dy,...trunkC);}
  } else if (name.includes('rock')) {
    const rad=name.includes('large')?4:2;
    const pts=[];
    for(let dy=-rad;dy<=rad;dy++) for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=rad*rad+1) pts.push([pcx+dx,pcy+dy]);
    drawOutline(buf,bw,bh,pts,c,dk);
    // Highlight
    setpx(buf,bw,bh,pcx-1,pcy-1,clamp(c[0]+30),clamp(c[1]+30),clamp(c[2]+30));
  } else if (name.includes('flower')) {
    const pts=[];
    for(let dy=-2;dy<=2;dy++){const w2=2-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx,pcy,0xFF,0xEB,0x3B);
  } else if (name.includes('mushroom')) {
    const pts=[];
    for(let dy=-3;dy<=0;dy++){const w2=3-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx-1,pcy-2,255,255,255);setpx(buf,bw,bh,pcx+1,pcy-1,255,255,255);
    for(let dy=1;dy<=3;dy++){setpx(buf,bw,bh,pcx,pcy+dy,0xE8,0xD8,0xB0);setpx(buf,bw,bh,pcx-1,pcy+dy,0xE8,0xD8,0xB0);}
  } else if (name.includes('snow')) {
    const pts=[];
    for(let dy=-3;dy<=3;dy++){const w2=3-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,[0xF0,0xF8,0xFF],[0xC0,0xD0,0xE0]);
  } else if (name.includes('cactus')) {
    for(let dy=-5;dy<=5;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...c);setpx(buf,bw,bh,pcx+1,pcy+dy,...c);}
    for(let dx=1;dx<=3;dx++){setpx(buf,bw,bh,pcx+1+dx,pcy-2,...c);setpx(buf,bw,bh,pcx-dx,pcy+1,...c);}
    setpx(buf,bw,bh,pcx+4,pcy-3,...c);setpx(buf,bw,bh,pcx+4,pcy-4,...c);
    setpx(buf,bw,bh,pcx-3,pcy,...c);setpx(buf,bw,bh,pcx-3,pcy-1,...c);
  } else {
    for(let dy=-4;dy<=4;dy++) setpx(buf,bw,bh,pcx,pcy+dy,...c);
    setpx(buf,bw,bh,pcx-1,pcy-2,...c);setpx(buf,bw,bh,pcx+1,pcy+1,...c);
  }
}

function drawHouse(buf, bw, bh, sx, sy, variant) {
  const T = 16;
  const pal = HOUSE_PALETTES[variant % HOUSE_PALETTES.length];
  const HW = 4*T, HH = 3*T;
  const cx = sx+HW/2, roofTop = sy+4;
  const wallTop = sy+T+8, wallBot = sy+HH-2;
  const wallL = sx+4, wallR = sx+HW-5;

  // Shadow
  for(let y=wallTop;y<=wallBot+3;y++) for(let x=wallL+3;x<=wallR+3;x++) {
    const i=((y)*bw+(x))*3;
    if(x>=0&&x<bw&&y>=0&&y<bh){buf[i]=clamp(buf[i]*0.4);buf[i+1]=clamp(buf[i+1]*0.4);buf[i+2]=clamp(buf[i+2]*0.4);}
  }

  // Walls
  for(let y=wallTop;y<=wallBot;y++) for(let x=wallL;x<=wallR;x++) setpx(buf,bw,bh,x,y,...pal.wall);
  // Wall outline
  for(let x=wallL;x<=wallR;x++){setpx(buf,bw,bh,x,wallTop,40,30,20);setpx(buf,bw,bh,x,wallBot,40,30,20);}
  for(let y=wallTop;y<=wallBot;y++){setpx(buf,bw,bh,wallL,y,40,30,20);setpx(buf,bw,bh,wallR,y,40,30,20);}

  // Roof
  const roofBot=wallTop;
  const roofH=roofBot-roofTop;
  for(let dy=0;dy<=roofH;dy++){
    const w2=((HW/2+4)*dy/roofH)|0;
    for(let dx=-w2;dx<=w2;dx++){
      // Roof shading — lighter at top
      const shade = 1.0 + (1 - dy/roofH) * 0.2;
      setpx(buf,bw,bh,cx+dx,roofTop+dy,clamp(pal.roof[0]*shade),clamp(pal.roof[1]*shade),clamp(pal.roof[2]*shade));
    }
    setpx(buf,bw,bh,cx-w2,roofTop+dy,40,30,20);
    setpx(buf,bw,bh,cx+w2,roofTop+dy,40,30,20);
  }
  for(let dx=-2;dx<=2;dx++) setpx(buf,bw,bh,cx+dx,roofTop,40,30,20);

  // Door
  const doorL=cx-3,doorR=cx+3,doorTop=wallBot-14;
  for(let y=doorTop;y<=wallBot;y++) for(let x=doorL;x<=doorR;x++) setpx(buf,bw,bh,x,y,...pal.door);
  for(let x=doorL-1;x<=doorR+1;x++) setpx(buf,bw,bh,x,doorTop-1,40,30,20);
  for(let y=doorTop;y<=wallBot;y++){setpx(buf,bw,bh,doorL-1,y,40,30,20);setpx(buf,bw,bh,doorR+1,y,40,30,20);}
  setpx(buf,bw,bh,doorR-1,(doorTop+wallBot)/2|0,0xDD,0xAA,0x00);

  // Windows
  const winSize=5,winY=wallTop+6;
  for(const winCx of [cx-12,cx+12]){
    for(let dy=0;dy<winSize;dy++) for(let dx=0;dx<winSize;dx++) setpx(buf,bw,bh,winCx+dx,winY+dy,0x87,0xCE,0xEB);
    for(let dx=-1;dx<=winSize;dx++){setpx(buf,bw,bh,winCx+dx,winY-1,40,30,20);setpx(buf,bw,bh,winCx+dx,winY+winSize,40,30,20);}
    for(let dy=-1;dy<=winSize;dy++){setpx(buf,bw,bh,winCx-1,winY+dy,40,30,20);setpx(buf,bw,bh,winCx+winSize,winY+dy,40,30,20);}
    setpx(buf,bw,bh,winCx+2,winY+1,40,30,20);setpx(buf,bw,bh,winCx+2,winY+2,40,30,20);setpx(buf,bw,bh,winCx+2,winY+3,40,30,20);
    setpx(buf,bw,bh,winCx+1,winY+2,40,30,20);setpx(buf,bw,bh,winCx+3,winY+2,40,30,20);
  }
}

// ═══════════════════════════════════════
// RENDER CLOSE-UP (80x50 tiles @ 16px)
// ═══════════════════════════════════════
const T = 16;
const strs = structures || [];

// Find house near an interesting biome transition
let bestStr = strs[0];
let bestScore = -1;
for (const s of strs) {
  // Score by number of different biomes in neighborhood
  const biomes = new Set();
  for (let dy = -10; dy <= 10; dy += 5) {
    for (let dx = -10; dx <= 10; dx += 5) {
      const nx = s.x + dx, ny = s.y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) biomes.add(biomeMap[ny*width+nx]);
    }
  }
  if (biomes.size > bestScore) { bestScore = biomes.size; bestStr = s; }
}

const CROP_W = 80, CROP_H = 50;
const cropX = bestStr ? Math.max(0, Math.min(width-CROP_W, bestStr.x - CROP_W/2+2)) : 400;
const cropY = bestStr ? Math.max(0, Math.min(height-CROP_H, bestStr.y - CROP_H/2+1)) : 400;
const imgW = CROP_W * T, imgH = CROP_H * T;
console.log(`Close-up: ${imgW}x${imgH}, crop at (${cropX},${cropY}), house at (${bestStr?.x},${bestStr?.y})`);

const buf = Buffer.alloc(imgW * imgH * 3);

// Terrain — per PIXEL blending (sub-tile resolution!)
console.log('Rendering terrain with per-pixel blending...');
for (let py = 0; py < imgH; py++) {
  for (let px = 0; px < imgW; px++) {
    // Map pixel to fractional tile coordinate
    const ftx = cropX + px / T;
    const fty = cropY + py / T;
    const tx = ftx | 0;
    const ty = fty | 0;

    if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
    const color = getTerrainColorAt(tx, ty);
    const i = (py * imgW + px) * 3;
    buf[i] = color[0]; buf[i+1] = color[1]; buf[i+2] = color[2];
  }
}

// Decorations
console.log('Drawing decorations...');
for (let ty = 0; ty < CROP_H; ty++) {
  for (let tx = 0; tx < CROP_W; tx++) {
    const idx = (cropY+ty)*width + (cropX+tx);
    const did = decorations[idx];
    if (!did) continue;
    const dd = defById.get(did);
    if (!dd) continue;
    const tint = decoTints ? decoTints[idx] : 4;
    drawDeco(buf, imgW, imgH, tx*T+T/2, ty*T+T/2, dd.name, tint);
  }
}

// Structures
console.log('Drawing structures...');
for (const s of strs) {
  if (s.type !== 'house') continue;
  const rx = s.x - cropX, ry = s.y - cropY;
  if (rx < -s.w || rx >= CROP_W || ry < -s.h || ry >= CROP_H) continue;
  drawHouse(buf, imgW, imgH, rx*T, ry*T, s.variant||0);
}

writeFileSync('output/world-pretty-closeup.png', makePNG(buf, imgW, imgH));
console.log('Saved output/world-pretty-closeup.png');

// ═══════════════════════════════════════
// RENDER OVERVIEW (1:2 scale, per-tile color)
// ═══════════════════════════════════════
const scale = 2;
const ow = width/scale|0, oh = height/scale|0;
console.log(`Overview: ${ow}x${oh}...`);
const obuf = Buffer.alloc(ow*oh*3);

for (let oy = 0; oy < oh; oy++) {
  for (let ox = 0; ox < ow; ox++) {
    const tx = ox * scale, ty = oy * scale;
    let color = getTerrainColorAt(tx, ty);

    // Blend in deco color subtly
    const did = decorations[ty*width+tx];
    if (did) {
      const dd = defById.get(did);
      if (dd) {
        const dc = DECO_COLORS[dd.name];
        if (dc) color = lerpColor(color, dc, 0.3);
      }
    }

    const i = (oy*ow+ox)*3;
    obuf[i]=color[0]; obuf[i+1]=color[1]; obuf[i+2]=color[2];
  }
}

// Mark houses
for (const s of strs) {
  const ox=(s.x/scale)|0, oy=(s.y/scale)|0;
  for(let dy=-1;dy<=2;dy++) for(let dx=-1;dx<=2;dx++){
    const px=ox+dx,py=oy+dy;
    if(px>=0&&px<ow&&py>=0&&py<oh){const i=(py*ow+px)*3;obuf[i]=0xFF;obuf[i+1]=0x44;obuf[i+2]=0x00;}
  }
}

writeFileSync('output/world-pretty-overview.png', makePNG(obuf, ow, oh));
console.log('Saved output/world-pretty-overview.png');
console.log('Done!');
