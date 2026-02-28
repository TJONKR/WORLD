#!/usr/bin/env node
/**
 * V4 Renderer — everything from V3 plus:
 * - Procedural rivers (follow elevation downhill to ocean)
 * - Grass tufts / ground cover (tiny 2-3px marks everywhere)
 * - Cloud shadows drifting across the landscape
 * - Snow caps on high-elevation any-biome tiles
 * - Coastline wave bands
 * - Ambient darkening at biome edges
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

// ═══════════════════════════════
// PALETTES
// ═══════════════════════════════
const BIOME_PALETTES = {
  ocean:     [[0x08,0x2A,0x54],[0x0D,0x3B,0x6E],[0x13,0x4D,0x85],[0x1B,0x5E,0x9A],[0x24,0x72,0xAF]],
  beach:     [[0xC2,0xAE,0x6B],[0xCE,0xBC,0x78],[0xDC,0xCC,0x88],[0xE8,0xD8,0x8C],[0xF4,0xE8,0xA2]],
  grassland: [[0x35,0x6B,0x20],[0x42,0x80,0x2D],[0x52,0x96,0x38],[0x5D,0xAA,0x40],[0x72,0xB8,0x55],[0x88,0xC5,0x6A]],
  forest:    [[0x12,0x3E,0x14],[0x1A,0x50,0x1E],[0x22,0x63,0x28],[0x2E,0x7D,0x32],[0x36,0x8A,0x3A]],
  desert:    [[0xA8,0x88,0x40],[0xBC,0x9C,0x4C],[0xCE,0xAE,0x58],[0xDB,0xB8,0x5C],[0xE8,0xC8,0x68],[0xF0,0xD8,0x78]],
  mountain:  [[0x58,0x58,0x58],[0x6E,0x6E,0x6E],[0x84,0x84,0x84],[0x9E,0x9E,0x9E],[0xB2,0xB2,0xB2]],
  tundra:    [[0xAA,0xB8,0xC8],[0xBE,0xC8,0xD6],[0xD0,0xD8,0xE4],[0xE0,0xE8,0xF0],[0xEE,0xF2,0xF8]],
  swamp:     [[0x28,0x40,0x28],[0x33,0x50,0x33],[0x3E,0x5E,0x3E],[0x4A,0x6E,0x48],[0x56,0x7D,0x54]],
};

const OCEAN_DEPTH = [
  [0x5A,0xB8,0xD0],[0x42,0x9E,0xC0],[0x30,0x85,0xB5],[0x24,0x72,0xAF],
  [0x18,0x5A,0x95],[0x0D,0x3B,0x6E],[0x08,0x2A,0x54],
];
const RIVER_COLOR = [0x30,0x85,0xB5];
const FOAM_COLOR = [0xE8,0xF0,0xF4];

const DECO_COLORS = {
  deco_tree_pine:[0x1b,0x5e,0x20], deco_tree_oak:[0x38,0x8e,0x3c],
  deco_tree_palm:[0x66,0xbb,0x6a], deco_rock_small:[0x75,0x75,0x75],
  deco_rock_large:[0x61,0x61,0x61], deco_flower:[0xe9,0x1e,0x63],
  deco_cactus:[0x2e,0x7d,0x32], deco_mushroom:[0xd3,0x2f,0x2f],
  deco_reed:[0x8b,0xc3,0x4a], deco_snowdrift:[0xff,0xff,0xff],
  deco_seaweed:[0x00,0x69,0x5c],
};

const clamp = v => Math.max(0, Math.min(255, v | 0));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpC = (a, b, t) => [clamp(lerp(a[0],b[0],t)), clamp(lerp(a[1],b[1],t)), clamp(lerp(a[2],b[2],t))];

// ═══════════════════════════════
// PNG
// ═══════════════════════════════
function makePNG(buf,w,h){const raw=Buffer.alloc(h*(1+w*3));for(let y=0;y<h;y++){raw[y*(1+w*3)]=0;buf.copy(raw,y*(1+w*3)+1,y*w*3,(y+1)*w*3);}const idat=deflateSync(raw,{level:6});function crc32(d){let c=0xffffffff;for(let i=0;i<d.length;i++){c^=d[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',(()=>{const b=Buffer.alloc(13);b.writeUInt32BE(w,0);b.writeUInt32BE(h,4);b[8]=8;b[9]=2;return b;})()),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}

// ═══════════════════════════════
// LOAD
// ═══════════════════════════════
const worldPath = process.argv[2] || 'output/world-2k-v3.json';
console.log('Loading...');
const world = JSON.parse(readFileSync(worldPath, 'utf-8'));
const { width, height, terrain, decorations, tileDefs, decoTints } = world;
const defById = new Map(); for(const d of tileDefs) defById.set(d.id, d);

// ═══════════════════════════════
// PRECOMPUTE
// ═══════════════════════════════
console.log('Building maps...');
const BIOME_IDS = {ocean:0,beach:1,grassland:2,forest:3,desert:4,mountain:5,tundra:6,swamp:7};
const BIOME_NAMES = Object.keys(BIOME_IDS);
const biomeMap = new Uint8Array(width*height);
for(let i=0;i<terrain.length;i++){const d=defById.get(terrain[i]);biomeMap[i]=d?(BIOME_IDS[d.biome]??0):0;}

// Distance from land (BFS)
const distFromLand = new Int16Array(width*height).fill(-1);
const queue = [];
for(let i=0;i<biomeMap.length;i++) if(biomeMap[i]!==0){distFromLand[i]=0;queue.push(i);}
let qi=0;
while(qi<queue.length){const ci=queue[qi++];const cx=ci%width,cy=(ci/width)|0,cd=distFromLand[ci];if(cd>=25) continue;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=width||ny<0||ny>=height) continue;const ni=ny*width+nx;if(distFromLand[ni]===-1){distFromLand[ni]=cd+1;queue.push(ni);}}}

// Noise generators
console.log('Generating noise...');
function makeNoise(seed,freq,oct=4){const p=Alea(seed),n=createNoise2D(p);return(x,y)=>{let v=0,f=freq,a=1,m=0;for(let o=0;o<oct;o++){v+=n(x*f,y*f)*a;m+=a;f*=2;a*=0.5;}return(v/m+1)/2;};}

const colorNoise = makeNoise('color-v4',0.035,5);
const elevNoise = makeNoise('elev-v4',0.012,6);
const detailNoise = makeNoise('detail-v4',0.18,3);
const blendNoise = makeNoise('blend-v4',0.06,3);
const foamNoise = makeNoise('foam-v4',0.2,2);
const waveNoise = makeNoise('wave-v4',0.08,3);
const cloudNoise = makeNoise('cloud-v4',0.008,4);
const grassNoise = makeNoise('grass-v4',0.25,2);
const riverNoise = makeNoise('river-v4',0.03,3);

// Elevation grid
console.log('Computing elevation...');
const elevGrid = new Float32Array(width*height);
for(let y=0;y<height;y++) for(let x=0;x<width;x++) elevGrid[y*width+x]=elevNoise(x,y);

// Hillshade
function getHS(x,y){
  if(x<=0||x>=width-1||y<=0||y>=height-1) return 1.0;
  const dzdx=(elevGrid[y*width+(x+1)]-elevGrid[y*width+(x-1)])*5;
  const dzdy=(elevGrid[(y+1)*width+x]-elevGrid[(y-1)*width+x])*5;
  const az=315*Math.PI/180, alt=40*Math.PI/180;
  const sl=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy));
  const asp=Math.atan2(-dzdy,-dzdx);
  return Math.max(0.5,Math.min(1.4, 0.5+((Math.cos(alt)*Math.cos(sl)+Math.sin(alt)*Math.sin(sl)*Math.cos(az-asp))*0.9)));
}

// ═══════════════════════════════
// RIVERS — trace downhill from high points
// ═══════════════════════════════
console.log('Generating rivers...');
const riverMap = new Uint8Array(width*height); // 0=no river, 1-5=river width
const riverRng = Alea('rivers-v4');

// Find river sources: high elevation non-ocean tiles
const sources = [];
for(let i=0;i<2000;i++){
  const x=(riverRng()*(width-40)+20)|0, y=(riverRng()*(height-40)+20)|0;
  if(biomeMap[y*width+x]!==0 && elevGrid[y*width+x]>0.55) sources.push([x,y]);
}
// Sort by elevation descending — start from highest
sources.sort((a,b)=>elevGrid[b[1]*width+b[0]]-elevGrid[a[1]*width+a[0]]);
// Keep top 80
sources.length = Math.min(80, sources.length);

for(const [sx,sy] of sources){
  let x=sx, y=sy, steps=0;
  const visited = new Set();
  while(steps<2000){
    if(x<1||x>=width-1||y<1||y>=height-1) break;
    if(biomeMap[y*width+x]===0) break; // reached ocean
    const key=`${x},${y}`;
    if(visited.has(key)) break;
    visited.add(key);
    
    // River gets wider downstream
    const w = Math.min(4, 1 + (steps/80)|0);
    for(let dy=-w;dy<=w;dy++) for(let dx=-w;dx<=w;dx++){
      if(dx*dx+dy*dy<=w*w){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<width&&ny>=0&&ny<height) riverMap[ny*width+nx]=Math.max(riverMap[ny*width+nx],w);
      }
    }
    
    // Find lowest neighbor
    let bestE=elevGrid[y*width+x], bx=x, by=y;
    // Add some noise to make rivers meander
    const meander = (riverNoise(x*0.5,y*0.5)-0.5)*0.02;
    for(const[dx,dy]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<width&&ny>=0&&ny<height){
        const e=elevGrid[ny*width+nx]+meander*dx;
        if(e<bestE){bestE=e;bx=nx;by=ny;}
      }
    }
    if(bx===x&&by===y){
      // Stuck — push in a random direction
      x+=(riverRng()>0.5?1:-1); y+=(riverRng()>0.5?1:-1);
    } else { x=bx; y=by; }
    steps++;
  }
}
const riverCount = riverMap.reduce((a,v)=>a+(v>0?1:0),0);
console.log(`Rivers: ${sources.length} sources, ${riverCount} river tiles`);

// ═══════════════════════════════
// TERRAIN COLOR
// ═══════════════════════════════
function getColor(tx,ty){
  const idx=ty*width+tx;
  const biomeId=biomeMap[idx];
  const biomeName=BIOME_NAMES[biomeId];

  // River overlay
  if(riverMap[idx]>0 && biomeId!==0){
    const rw=riverMap[idx];
    let c=[...RIVER_COLOR];
    const wv=(waveNoise(tx*2,ty*2)-0.5)*10;
    c=[clamp(c[0]+wv),clamp(c[1]+wv),clamp(c[2]+wv)];
    // Riverbank: blend at edges
    let nearNonRiver=false;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx=tx+dx,ny=ty+dy;
      if(nx>=0&&nx<width&&ny>=0&&ny<height&&riverMap[ny*width+nx]===0&&biomeMap[ny*width+nx]!==0) nearNonRiver=true;
    }
    if(nearNonRiver) c=lerpC(c,[0x5A,0x7A,0x4A],0.3); // muddy bank
    const hs=getHS(tx,ty);
    return [clamp(c[0]*hs),clamp(c[1]*hs),clamp(c[2]*hs)];
  }

  // Ocean
  if(biomeId===0){
    let dist=distFromLand[idx]; if(dist<0) dist=25;
    if(dist<=1){const fn=foamNoise(tx,ty);if(fn>0.4) return FOAM_COLOR;}
    // Wave bands near shore
    if(dist>=2&&dist<=4){const wv=waveNoise(tx*1.5,ty*1.5);if(wv>0.65) return lerpC(OCEAN_DEPTH[0],FOAM_COLOR,0.3);}
    const depthT=Math.min(1,dist/22);
    const di=Math.min(OCEAN_DEPTH.length-2,(depthT*(OCEAN_DEPTH.length-1))|0);
    const df=depthT*(OCEAN_DEPTH.length-1)-di;
    let c=lerpC(OCEAN_DEPTH[di],OCEAN_DEPTH[di+1],df);
    const wv=(waveNoise(tx,ty)-0.5)*8;
    c=[clamp(c[0]+wv),clamp(c[1]+wv),clamp(c[2]+wv)];
    const hs=0.85+(getHS(tx,ty)-1)*0.25;
    return [clamp(c[0]*hs),clamp(c[1]*hs),clamp(c[2]*hs)];
  }

  const palette=BIOME_PALETTES[biomeName]||BIOME_PALETTES.grassland;
  const cn=colorNoise(tx,ty);
  const si=Math.min(palette.length-1,(cn*palette.length)|0);
  let c=[...palette[si]];

  // Detail noise
  const det=(detailNoise(tx,ty)-0.5)*14;
  c=[clamp(c[0]+det),clamp(c[1]+det),clamp(c[2]+det)];

  // Hillshade
  const hs=getHS(tx,ty);
  c=[clamp(c[0]*hs),clamp(c[1]*hs),clamp(c[2]*hs)];

  // Snow caps on high elevation (any biome)
  const elev=elevGrid[idx];
  if(elev>0.78 && biomeId!==0){
    const snowT=Math.min(1,(elev-0.78)/0.12);
    c=lerpC(c,[0xF0,0xF5,0xFA],snowT*0.7);
  }

  // Biome edge blending
  const BR=6;
  let bCnt=0,bR=0,bG=0,bB=0;
  for(const[dx,dy]of[[-BR,0],[BR,0],[0,-BR],[0,BR],[-BR,-BR],[BR,BR],[BR,-BR],[-BR,BR]]){
    const nx=tx+dx,ny=ty+dy;
    if(nx<0||nx>=width||ny<0||ny>=height) continue;
    const nb=biomeMap[ny*width+nx];
    if(nb!==biomeId&&nb!==0){
      const np=BIOME_PALETTES[BIOME_NAMES[nb]]||BIOME_PALETTES.grassland;
      const ns=Math.min(np.length-1,(cn*np.length)|0);
      bR+=np[ns][0];bG+=np[ns][1];bB+=np[ns][2];bCnt++;
    }
  }
  if(bCnt>0){
    const bn=blendNoise(tx,ty);
    const bs=Math.min(0.4,(bCnt/8)*0.45)*(0.4+bn*0.6);
    c=lerpC(c,[bR/bCnt,bG/bCnt,bB/bCnt],bs);
  }

  // Wet sand near water
  if(biomeId===1){
    let nw=false;
    for(const[dx,dy]of[[-2,0],[2,0],[0,-2],[0,2]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&biomeMap[ny*width+nx]===0) nw=true;}
    if(nw) c=lerpC(c,[0x9A,0x88,0x60],0.3);
  }

  // Cloud shadows
  const cloud=cloudNoise(tx,ty);
  if(cloud>0.6){
    const shadowStr=(cloud-0.6)/0.4*0.2;
    c=[clamp(c[0]*(1-shadowStr)),clamp(c[1]*(1-shadowStr)),clamp(c[2]*(1-shadowStr))];
  }

  return c;
}

// ═══════════════════════════════
// PIXEL HELPERS
// ═══════════════════════════════
function setpx(buf,bw,bh,x,y,r,g,b){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=r;buf[i+1]=g;buf[i+2]=b;}
function shadowpx(buf,bw,bh,x,y,a){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=clamp(buf[i]*a);buf[i+1]=clamp(buf[i+1]*a);buf[i+2]=clamp(buf[i+2]*a);}
function drawOutline(buf,bw,bh,pts,c,dk){const s=new Set(pts.map(([x,y])=>`${x},${y}`));for(const[x,y]of pts)setpx(buf,bw,bh,x,y,...c);for(const[x,y]of pts)for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]])if(!s.has(`${x+dx},${y+dy}`))setpx(buf,bw,bh,x+dx,y+dy,...dk);}

function drawDeco(buf,bw,bh,pcx,pcy,name,tint){
  const bc=DECO_COLORS[name];if(!bc)return;
  const t=((tint||4)-4)*6;
  const c=[clamp(bc[0]+t),clamp(bc[1]+t),clamp(bc[2]+t)];
  const dk=[clamp(c[0]-50),clamp(c[1]-50),clamp(c[2]-50)];

  // Drop shadow
  if(name.includes('tree')){const sz=name.includes('palm')?4:name.includes('oak')?5:6;for(let dy=-sz;dy<=sz-1;dy++){const w=sz-Math.abs(dy);for(let dx=-w;dx<=w;dx++)shadowpx(buf,bw,bh,pcx+dx+2,pcy+dy+1,0.55);}}
  else if(name.includes('rock')){const r=name.includes('large')?4:2;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r+1)shadowpx(buf,bw,bh,pcx+dx+1,pcy+dy+1,0.6);}

  if(name.includes('tree')){
    const pts=[];const sz=name.includes('palm')?4:name.includes('oak')?5:6;
    for(let dy=-sz;dy<=sz-1;dy++){const w=sz-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy-1]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    // Inner highlight
    for(let i=0;i<Math.min(4,pts.length);i++){const[hx,hy]=pts[i];setpx(buf,bw,bh,hx,hy,clamp(c[0]+30),clamp(c[1]+30),clamp(c[2]+30));}
    const tc=name.includes('palm')?[0x8B,0x6B,0x3D]:[0x5D,0x34,0x0F];
    for(let dy=sz-1;dy<=sz+2;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...tc);setpx(buf,bw,bh,pcx-1,pcy+dy,...tc);}
  } else if(name.includes('rock')){
    const r=name.includes('large')?4:2;const pts=[];
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r+1)pts.push([pcx+dx,pcy+dy]);
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx-1,pcy-1,clamp(c[0]+40),clamp(c[1]+40),clamp(c[2]+40));
    setpx(buf,bw,bh,pcx,pcy-1,clamp(c[0]+25),clamp(c[1]+25),clamp(c[2]+25));
  } else if(name.includes('flower')){
    const pts=[];for(let dy=-2;dy<=2;dy++){const w=2-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);setpx(buf,bw,bh,pcx,pcy,0xFF,0xEB,0x3B);
  } else if(name.includes('mushroom')){
    const pts=[];for(let dy=-3;dy<=0;dy++){const w=3-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx-1,pcy-2,255,255,255);setpx(buf,bw,bh,pcx+1,pcy-1,255,255,255);
    for(let dy=1;dy<=3;dy++){setpx(buf,bw,bh,pcx,pcy+dy,0xE8,0xD8,0xB0);setpx(buf,bw,bh,pcx-1,pcy+dy,0xE8,0xD8,0xB0);}
  } else if(name.includes('snow')){
    const pts=[];for(let dy=-3;dy<=3;dy++){const w=3-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,[0xF0,0xF8,0xFF],[0xC0,0xD0,0xE0]);
  } else if(name.includes('cactus')){
    for(let dy=-5;dy<=5;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...c);setpx(buf,bw,bh,pcx+1,pcy+dy,...c);}
    for(let dx=1;dx<=3;dx++){setpx(buf,bw,bh,pcx+1+dx,pcy-2,...c);setpx(buf,bw,bh,pcx-dx,pcy+1,...c);}
    setpx(buf,bw,bh,pcx+4,pcy-3,...c);setpx(buf,bw,bh,pcx+4,pcy-4,...c);setpx(buf,bw,bh,pcx-3,pcy,...c);setpx(buf,bw,bh,pcx-3,pcy-1,...c);
  } else {
    for(let dy=-4;dy<=4;dy++)setpx(buf,bw,bh,pcx,pcy+dy,...c);
    setpx(buf,bw,bh,pcx-1,pcy-2,...c);setpx(buf,bw,bh,pcx+1,pcy+1,...c);
  }
}

// ═══════════════════════════════
// RENDER
// ═══════════════════════════════
const T=16;

// Find coastal area with rivers nearby
const searchRng=Alea('search-v4');
let bestX=500,bestY=500,bestScore=0;
for(let i=0;i<800;i++){
  const tx=(searchRng()*(width-120)+60)|0,ty=(searchRng()*(height-80)+40)|0;
  const biomes=new Set();let ocean=0,land=0,rivers=0;
  for(let dy=-25;dy<=25;dy+=5)for(let dx=-25;dx<=25;dx+=5){
    const nx=tx+dx,ny=ty+dy;
    if(nx>=0&&nx<width&&ny>=0&&ny<height){
      biomes.add(BIOME_NAMES[biomeMap[ny*width+nx]]);
      if(biomeMap[ny*width+nx]===0) ocean++;else land++;
      if(riverMap[ny*width+nx]>0) rivers++;
    }
  }
  const score=biomes.size*3+(ocean>0&&land>0?10:0)+(rivers>0?8:0);
  if(score>bestScore){bestScore=score;bestX=tx;bestY=ty;}
}

const CW=80,CH=50;
const cx=Math.max(0,Math.min(width-CW,bestX-CW/2));
const cy=Math.max(0,Math.min(height-CH,bestY-CH/2));
const iw=CW*T,ih=CH*T;
console.log(`Close-up: ${iw}x${ih} at (${cx},${cy}), score=${bestScore}`);

const buf=Buffer.alloc(iw*ih*3);

// Terrain
console.log('Terrain...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const c=getColor(cx+tx,cy+ty);
  for(let py=0;py<T;py++)for(let px=0;px<T;px++)setpx(buf,iw,ih,tx*T+px,ty*T+py,...c);
}

// Ground cover (grass tufts — tiny marks on grass/forest)
console.log('Ground cover...');
const turfRng=Alea('turf-v4');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const idx=(cy+ty)*width+(cx+tx);
  const b=biomeMap[idx];
  if(b!==2&&b!==3&&b!==7) continue; // grass, forest, swamp only
  if(decorations[idx]) continue; // skip if deco already there
  const gn=grassNoise(cx+tx,cy+ty);
  if(gn<0.35||turfRng()>0.4) continue;
  // Tiny 2-3px grass mark
  const pcx=tx*T+(turfRng()*12+2)|0, pcy=ty*T+(turfRng()*12+2)|0;
  const shade=b===3?-15:10;
  const gc=BIOME_PALETTES[BIOME_NAMES[b]][0];
  const tc=[clamp(gc[0]+shade),clamp(gc[1]+shade+8),clamp(gc[2]+shade)];
  setpx(buf,iw,ih,pcx,pcy,...tc);
  setpx(buf,iw,ih,pcx,pcy-1,...tc);
  if(turfRng()>0.5) setpx(buf,iw,ih,pcx+1,pcy,...tc);
}

// Decorations
console.log('Decorations...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const idx=(cy+ty)*width+(cx+tx);
  const did=decorations[idx];if(!did)continue;
  const dd=defById.get(did);if(!dd)continue;
  drawDeco(buf,iw,ih,tx*T+T/2,ty*T+T/2,dd.name,decoTints?decoTints[idx]:4);
}

writeFileSync('output/world-v4-closeup.png',makePNG(buf,iw,ih));
console.log('Saved close-up');

// Overview
const sc=2;const ow=width/sc|0,oh=height/sc|0;
console.log(`Overview: ${ow}x${oh}...`);
const ob=Buffer.alloc(ow*oh*3);
for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){
  const tx=ox*sc,ty=oy*sc;
  let c=getColor(tx,ty);
  const did=decorations[ty*width+tx];
  if(did){const dd=defById.get(did);if(dd){const dc=DECO_COLORS[dd.name];if(dc)c=lerpC(c,dc,0.2);}}
  const i=(oy*ow+ox)*3;ob[i]=c[0];ob[i+1]=c[1];ob[i+2]=c[2];
}
writeFileSync('output/world-v4-overview.png',makePNG(ob,ow,oh));
console.log('Saved overview. Done!');
