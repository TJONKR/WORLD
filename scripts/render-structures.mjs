#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const BIOME_COLORS = {
  ocean:[0x22,0x66,0xaa], beach:[0xe8,0xd8,0x8c], grassland:[0x5d,0xaa,0x40],
  forest:[0x2e,0x7d,0x32], desert:[0xdb,0xb8,0x5c], mountain:[0x9e,0x9e,0x9e],
  tundra:[0xe0,0xe8,0xf0], swamp:[0x4a,0x6e,0x48],
};
const VOFF = [0, 12, -12, 8, -8];
const DECO_COLORS = {
  deco_tree_pine:[0x1b,0x5e,0x20], deco_tree_oak:[0x38,0x8e,0x3c],
  deco_tree_palm:[0x66,0xbb,0x6a], deco_rock_small:[0x75,0x75,0x75],
  deco_rock_large:[0x61,0x61,0x61], deco_flower:[0xe9,0x1e,0x63],
  deco_cactus:[0x2e,0x7d,0x32], deco_mushroom:[0xd3,0x2f,0x2f],
  deco_reed:[0x8b,0xc3,0x4a], deco_snowdrift:[0xff,0xff,0xff],
  deco_seaweed:[0x00,0x69,0x5c],
};
// House color variants: [roof, wall, door]
const HOUSE_PALETTES = [
  { roof: [0x8B,0x45,0x13], wall: [0xF5,0xE6,0xCC], door: [0x5D,0x34,0x0F] },
  { roof: [0xB7,0x41,0x0E], wall: [0xFA,0xEB,0xD7], door: [0x6B,0x3A,0x2E] },
  { roof: [0x2E,0x4A,0x62], wall: [0xEC,0xE5,0xD8], door: [0x4A,0x35,0x28] },
  { roof: [0x6B,0x8E,0x23], wall: [0xF0,0xE6,0xD2], door: [0x5C,0x40,0x33] },
];

const clamp = v => Math.max(0, Math.min(255, v));

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

// --- Load ---
const worldPath = process.argv[2] || 'output/world-2k-struct.json';
console.log('Loading...');
const w = JSON.parse(readFileSync(worldPath, 'utf-8'));
const { width, height, terrain, decorations, tileDefs, structures, decoTints } = w;
const defById = new Map(); for (const d of tileDefs) defById.set(d.id, d);
console.log(`World: ${width}x${height}, ${structures?.length||0} structures, ${decorations.filter(d=>d).length} decos`);

function getTileRGB(tileId) {
  const d = defById.get(tileId);
  if (!d) return [255,0,255];
  const bc = BIOME_COLORS[d.biome] || [255,0,255];
  const off = VOFF[d.variant||0] || 0;
  return [clamp(bc[0]+off), clamp(bc[1]+off), clamp(bc[2]+off)];
}

// --- Render helpers ---
const T = 16; // px per tile

function setpx(buf, bw, x, y, r, g, b) {
  if (x < 0 || x >= bw || y < 0) return;
  const bh = buf.length / (bw * 3);
  if (y >= bh) return;
  const i = (y * bw + x) * 3;
  buf[i] = r; buf[i+1] = g; buf[i+2] = b;
}

function drawOutlinedShape(buf, bw, points, color, outline) {
  // Fill shape
  for (const [x,y] of points) setpx(buf, bw, x, y, ...color);
  // Outline: for each filled pixel, check 4 neighbors
  for (const [x,y] of points) {
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx=x+dx, ny=y+dy;
      if (!points.some(([px,py])=>px===nx&&py===ny)) {
        setpx(buf, bw, nx, ny, ...outline);
      }
    }
  }
}

function drawDeco(buf, bw, pcx, pcy, name, tint) {
  const baseColor = DECO_COLORS[name];
  if (!baseColor) return;
  // Apply tint variation (-20 to +20)
  const tintOff = (tint - 4) * 5;
  const c = [clamp(baseColor[0]+tintOff), clamp(baseColor[1]+tintOff), clamp(baseColor[2]+tintOff)];
  const dark = [clamp(c[0]-40), clamp(c[1]-40), clamp(c[2]-40)];

  if (name.includes('tree')) {
    // Triangle with outline
    const pts = [];
    for (let dy=-5;dy<=4;dy++) { const w2=5-Math.abs(dy); for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy-1]); }
    drawOutlinedShape(buf, bw, pts, c, dark);
    // Trunk
    for (let dy=4;dy<=6;dy++) { setpx(buf,bw,pcx,pcy+dy,0x5D,0x34,0x0F); setpx(buf,bw,pcx-1,pcy+dy,0x5D,0x34,0x0F); }
  } else if (name.includes('rock')) {
    const rad = name.includes('large') ? 4 : 2;
    const pts = [];
    for(let dy=-rad;dy<=rad;dy++) for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=rad*rad) pts.push([pcx+dx,pcy+dy]);
    drawOutlinedShape(buf, bw, pts, c, dark);
  } else if (name.includes('flower')) {
    // Diamond with center dot
    const pts = [];
    for(let dy=-2;dy<=2;dy++){const w2=2-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutlinedShape(buf, bw, pts, c, dark);
    setpx(buf,bw,pcx,pcy,0xFF,0xEB,0x3B); // yellow center
  } else if (name.includes('mushroom')) {
    // Red cap with white dots + stem
    const pts = [];
    for(let dy=-3;dy<=0;dy++){const w2=3-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutlinedShape(buf, bw, pts, c, dark);
    setpx(buf,bw,pcx-1,pcy-2,255,255,255); setpx(buf,bw,pcx+1,pcy-1,255,255,255); // white dots
    for(let dy=1;dy<=3;dy++){setpx(buf,bw,pcx,pcy+dy,0xE8,0xD8,0xB0);setpx(buf,bw,pcx-1,pcy+dy,0xE8,0xD8,0xB0);}
  } else if (name.includes('snow')) {
    const pts = [];
    for(let dy=-3;dy<=3;dy++){const w2=3-Math.abs(dy);for(let dx=-w2;dx<=w2;dx++) pts.push([pcx+dx,pcy+dy]);}
    drawOutlinedShape(buf, bw, pts, [0xF0,0xF8,0xFF], [0xC0,0xD0,0xE0]);
  } else if (name.includes('cactus')) {
    // Vertical line with arms
    for(let dy=-5;dy<=5;dy++) setpx(buf,bw,pcx,pcy+dy,...c);
    for(let dy=-5;dy<=5;dy++) setpx(buf,bw,pcx+1,pcy+dy,...c);
    // Arms
    for(let dx=1;dx<=3;dx++) { setpx(buf,bw,pcx+1+dx,pcy-2,...c); setpx(buf,bw,pcx-dx,pcy+1,...c); }
    setpx(buf,bw,pcx+4,pcy-3,...c); setpx(buf,bw,pcx+4,pcy-4,...c);
    setpx(buf,bw,pcx-3,pcy,...c); setpx(buf,bw,pcx-3,pcy-1,...c);
  } else {
    // Reed/seaweed line
    for(let dy=-4;dy<=4;dy++) setpx(buf,bw,pcx,pcy+dy,...c);
    setpx(buf,bw,pcx-1,pcy-2,...c); setpx(buf,bw,pcx+1,pcy+1,...c);
  }
}

function drawHouse(buf, bw, sx, sy, variant) {
  const pal = HOUSE_PALETTES[variant % HOUSE_PALETTES.length];
  const HW = 4 * T, HH = 3 * T;
  const cx = sx + HW/2, roofTop = sy + 4;
  const wallTop = sy + T + 8;
  const wallBot = sy + HH - 2;
  const wallL = sx + 4, wallR = sx + HW - 5;

  // Shadow
  for (let y = wallTop; y <= wallBot + 2; y++)
    for (let x = wallL + 3; x <= wallR + 3; x++)
      setpx(buf, bw, x, y, 0, 0, 0);

  // Walls
  for (let y = wallTop; y <= wallBot; y++)
    for (let x = wallL; x <= wallR; x++)
      setpx(buf, bw, x, y, ...pal.wall);

  // Wall outline
  for (let x = wallL; x <= wallR; x++) { setpx(buf,bw,x,wallTop,40,30,20); setpx(buf,bw,x,wallBot,40,30,20); }
  for (let y = wallTop; y <= wallBot; y++) { setpx(buf,bw,wallL,y,40,30,20); setpx(buf,bw,wallR,y,40,30,20); }

  // Roof (triangle)
  const roofBot = wallTop;
  const roofH = roofBot - roofTop;
  for (let dy = 0; dy <= roofH; dy++) {
    const w2 = ((HW/2 + 4) * dy / roofH) | 0;
    for (let dx = -w2; dx <= w2; dx++) {
      setpx(buf, bw, cx + dx, roofTop + dy, ...pal.roof);
    }
    // Roof outline
    setpx(buf, bw, cx - w2, roofTop + dy, 40, 30, 20);
    setpx(buf, bw, cx + w2, roofTop + dy, 40, 30, 20);
  }
  // Roof peak outline
  for (let dx = -2; dx <= 2; dx++) setpx(buf, bw, cx + dx, roofTop, 40, 30, 20);

  // Door
  const doorL = cx - 3, doorR = cx + 3;
  const doorTop = wallBot - 14, doorBot = wallBot;
  for (let y = doorTop; y <= doorBot; y++)
    for (let x = doorL; x <= doorR; x++)
      setpx(buf, bw, x, y, ...pal.door);
  // Door outline
  for (let x = doorL-1; x <= doorR+1; x++) setpx(buf,bw,x,doorTop-1,40,30,20);
  for (let y = doorTop; y <= doorBot; y++) { setpx(buf,bw,doorL-1,y,40,30,20); setpx(buf,bw,doorR+1,y,40,30,20); }
  // Doorknob
  setpx(buf, bw, doorR - 1, (doorTop+doorBot)/2|0, 0xDD, 0xAA, 0x00);

  // Windows (two)
  const winSize = 5;
  const winY = wallTop + 6;
  for (const winCx of [cx - 12, cx + 12]) {
    for (let dy = 0; dy < winSize; dy++)
      for (let dx = 0; dx < winSize; dx++)
        setpx(buf, bw, winCx + dx, winY + dy, 0x87, 0xCE, 0xEB);
    // Window frame
    for (let dx = -1; dx <= winSize; dx++) { setpx(buf,bw,winCx+dx,winY-1,40,30,20); setpx(buf,bw,winCx+dx,winY+winSize,40,30,20); }
    for (let dy = -1; dy <= winSize; dy++) { setpx(buf,bw,winCx-1,winY+dy,40,30,20); setpx(buf,bw,winCx+winSize,winY+dy,40,30,20); }
    // Cross
    setpx(buf,bw,winCx+2,winY+1,40,30,20); setpx(buf,bw,winCx+2,winY+2,40,30,20); setpx(buf,bw,winCx+2,winY+3,40,30,20);
    setpx(buf,bw,winCx+1,winY+2,40,30,20); setpx(buf,bw,winCx+3,winY+2,40,30,20);
  }
}

// --- Find a house near center for close-up ---
const strs = structures || [];
let bestStr = strs[0];
let bestDist = Infinity;
for (const s of strs) {
  const dx = s.x - width/2, dy = s.y - height/2;
  const d = Math.sqrt(dx*dx+dy*dy);
  if (d < bestDist) { bestDist = d; bestStr = s; }
}

// --- Close-up around a house (60x40 tiles at 16px/tile) ---
const CROP_W = 60, CROP_H = 40;
const cropX = bestStr ? Math.max(0, Math.min(width-CROP_W, bestStr.x - CROP_W/2 + 2)) : width/2 - CROP_W/2;
const cropY = bestStr ? Math.max(0, Math.min(height-CROP_H, bestStr.y - CROP_H/2 + 1)) : height/2 - CROP_H/2;
const imgW = CROP_W * T, imgH = CROP_H * T;
console.log(`Close-up: ${imgW}x${imgH} around tile (${cropX},${cropY}), house at (${bestStr?.x},${bestStr?.y})`);

const buf = Buffer.alloc(imgW * imgH * 3);

// Draw terrain
for (let ty = 0; ty < CROP_H; ty++) {
  for (let tx = 0; tx < CROP_W; tx++) {
    const idx = (cropY+ty)*width + (cropX+tx);
    const [r,g,b] = getTileRGB(terrain[idx]);
    for (let py=0;py<T;py++) for(let px=0;px<T;px++) setpx(buf,imgW,tx*T+px,ty*T+py,r,g,b);
    // Subtle grid
    for(let px=0;px<T;px++) setpx(buf,imgW,tx*T+px,ty*T,clamp(r-10),clamp(g-10),clamp(b-10));
    for(let py=0;py<T;py++) setpx(buf,imgW,tx*T,ty*T+py,clamp(r-10),clamp(g-10),clamp(b-10));
  }
}

// Draw decorations
for (let ty = 0; ty < CROP_H; ty++) {
  for (let tx = 0; tx < CROP_W; tx++) {
    const idx = (cropY+ty)*width + (cropX+tx);
    const did = decorations[idx];
    if (!did) continue;
    const dd = defById.get(did);
    if (!dd) continue;
    const tint = decoTints ? decoTints[idx] : 4;
    drawDeco(buf, imgW, tx*T+T/2, ty*T+T/2, dd.name, tint);
  }
}

// Draw structures
for (const s of strs) {
  if (s.type !== 'house') continue;
  const rx = s.x - cropX, ry = s.y - cropY;
  if (rx < -s.w || rx >= CROP_W || ry < -s.h || ry >= CROP_H) continue;
  drawHouse(buf, imgW, rx * T, ry * T, s.variant || 0);
}

writeFileSync('output/world-house-closeup.png', makePNG(buf, imgW, imgH));
console.log('Saved output/world-house-closeup.png');

// --- Overview with houses marked ---
const scale = 4;
const ow = width/scale|0, oh = height/scale|0;
console.log(`Overview: ${ow}x${oh}...`);
const obuf = Buffer.alloc(ow*oh*3);
for (let oy=0;oy<oh;oy++) for(let ox=0;ox<ow;ox++){
  const idx=(oy*scale)*width+(ox*scale);
  let [r,g,b]=getTileRGB(terrain[idx]);
  const did=decorations[idx];
  if(did){const dd=defById.get(did);if(dd){const dc=DECO_COLORS[dd.name];if(dc){r=clamp((dc[0]*0.5+r*0.5)|0);g=clamp((dc[1]*0.5+g*0.5)|0);b=clamp((dc[2]*0.5+b*0.5)|0);}}}
  const i=(oy*ow+ox)*3;obuf[i]=r;obuf[i+1]=g;obuf[i+2]=b;
}
// Mark houses on overview
for (const s of strs) {
  const ox=(s.x/scale)|0, oy=(s.y/scale)|0;
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const px=ox+dx,py=oy+dy;
    if(px>=0&&px<ow&&py>=0&&py<oh){const i=(py*ow+px)*3;obuf[i]=0xFF;obuf[i+1]=0x44;obuf[i+2]=0x00;}
  }
}
writeFileSync('output/world-struct-overview.png', makePNG(obuf, ow, oh));
console.log('Saved output/world-struct-overview.png');
console.log('Done!');
