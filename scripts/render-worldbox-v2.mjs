#!/usr/bin/env node
/**
 * WorldBox-style renderer v2
 * 
 * 6 key improvements over v1:
 * 1. Checkerboard dither on terrain (alternating shade every other pixel)
 * 2. Ordered dithering at biome borders (density gradient, not random scatter)
 * 3. Flattened ellipse trees (wider than tall)
 * 4. Top-left lighting (highlight TL, shadow BR on everything)
 * 5. Shore shadow line (1px dark on land side of coast)
 * 6. 7-8 ocean depth bands (much more gradual)
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

// ═══════════════════════════════
// PALETTES
// ═══════════════════════════════
const PALETTES = {
  ocean: [
    // 8 depth bands: coast → abyss
    [[0x5C,0xB8,0xE0],[0x58,0xB4,0xDC],[0x60,0xBC,0xE4]],  // 0: coast/surf
    [[0x48,0x9E,0xCC],[0x44,0x9A,0xC8],[0x4C,0xA2,0xD0]],  // 1: shallows
    [[0x38,0x8A,0xBC],[0x34,0x86,0xB8],[0x3C,0x8E,0xC0]],  // 2: nearshore
    [[0x2E,0x7A,0xAC],[0x2C,0x78,0xA8],[0x30,0x7C,0xB0]],  // 3: mid-shallow
    [[0x24,0x68,0x9C],[0x22,0x66,0x98],[0x26,0x6A,0xA0]],  // 4: mid
    [[0x1C,0x58,0x8C],[0x1A,0x56,0x88],[0x1E,0x5A,0x90]],  // 5: mid-deep
    [[0x16,0x48,0x7C],[0x14,0x46,0x78],[0x18,0x4A,0x80]],  // 6: deep
    [[0x10,0x3A,0x6C],[0x0E,0x38,0x68],[0x12,0x3C,0x70]],  // 7: abyss
  ],
  beach: [[0xE4,0xD0,0x82],[0xE0,0xCC,0x7E],[0xE8,0xD4,0x88],[0xDC,0xC8,0x7A]],
  grassland: [
    [0x4C,0xAA,0x36],[0x50,0xAE,0x3A],[0x48,0xA6,0x32],[0x54,0xB2,0x3E],
    [0x58,0xB6,0x42],[0x44,0xA2,0x2E],[0x5C,0xBA,0x46],
  ],
  forest: [
    [0x28,0x7E,0x2C],[0x24,0x76,0x28],[0x2C,0x82,0x30],[0x20,0x72,0x24],
    [0x30,0x86,0x34],[0x1C,0x6E,0x20],
  ],
  desert: [[0xD8,0xBC,0x5C],[0xD4,0xB8,0x58],[0xDC,0xC0,0x60],[0xE0,0xC4,0x64],[0xD0,0xB4,0x54]],
  mountain: [
    [0x88,0x86,0x82],[0x84,0x82,0x7E],[0x8C,0x8A,0x86],[0x80,0x7E,0x7A],
    [0x94,0x92,0x8E],[0x78,0x76,0x72],
  ],
  tundra: [[0xD8,0xE4,0xEE],[0xD4,0xE0,0xEA],[0xDC,0xE8,0xF2],[0xE0,0xEC,0xF4]],
  swamp: [[0x3A,0x62,0x3A],[0x36,0x5E,0x36],[0x3E,0x66,0x3E],[0x42,0x6A,0x42],[0x34,0x5C,0x34]],
};

const SNOW = [[0xF0,0xF4,0xF8],[0xEC,0xF0,0xF4],[0xF4,0xF8,0xFC],[0xE8,0xEE,0xF2]];
const RIVER = [[0x28,0x7A,0xB0],[0x2C,0x7E,0xB4],[0x24,0x76,0xAC]];
const LAKE = [[0x38,0x90,0xC0],[0x34,0x8C,0xBC],[0x3C,0x94,0xC4]];
const PATH = [[0x9A,0x86,0x5C],[0x96,0x82,0x58],[0x9E,0x8A,0x60]];

const DECO_TREES = {
  pine:  [[0x18,0x5C,0x1C],[0x14,0x54,0x18],[0x1C,0x60,0x20]],
  oak:   [[0x30,0x88,0x34],[0x2C,0x84,0x30],[0x34,0x8C,0x38]],
  palm:  [[0x54,0xAA,0x58],[0x50,0xA6,0x54],[0x58,0xAE,0x5C]],
};
const DECO_OTHER = {
  rock_small: [[0x6E,0x6C,0x68],[0x72,0x70,0x6C]],
  rock_large: [[0x5A,0x58,0x54],[0x5E,0x5C,0x58]],
  flower:     [[0xE8,0x30,0x60],[0xE0,0x80,0x20],[0x90,0x40,0xC0],[0xFF,0xC0,0x10]],
  cactus:     [[0x2A,0x78,0x2E],[0x2E,0x7C,0x32]],
  mushroom:   [[0xCC,0x2C,0x2C],[0xD0,0x30,0x30]],
  reed:       [[0x7E,0xB0,0x42],[0x82,0xB4,0x46]],
  snowdrift:  [[0xE8,0xF0,0xF6],[0xEC,0xF4,0xFA]],
};

const clamp=v=>Math.max(0,Math.min(255,v|0));

function makePNG(buf,w,h){const raw=Buffer.alloc(h*(1+w*3));for(let y=0;y<h;y++){raw[y*(1+w*3)]=0;buf.copy(raw,y*(1+w*3)+1,y*w*3,(y+1)*w*3);}const idat=deflateSync(raw,{level:6});function crc32(d){let c=0xffffffff;for(let i=0;i<d.length;i++){c^=d[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',(()=>{const b=Buffer.alloc(13);b.writeUInt32BE(w,0);b.writeUInt32BE(h,4);b[8]=8;b[9]=2;return b;})()),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}

// ═══════════════════════════════
// LOAD
// ═══════════════════════════════
const worldPath=process.argv[2]||'output/world-2k-v3.json';
console.log('Loading...');
const world=JSON.parse(readFileSync(worldPath,'utf-8'));
const{width,height,terrain,decorations,tileDefs,decoTints}=world;
const defById=new Map();for(const d of tileDefs)defById.set(d.id,d);

// ═══════════════════════════════
// PRECOMPUTE
// ═══════════════════════════════
console.log('Building maps...');
const BI={ocean:0,beach:1,grassland:2,forest:3,desert:4,mountain:5,tundra:6,swamp:7};
const BN=Object.keys(BI);
const bm=new Uint8Array(width*height);
for(let i=0;i<terrain.length;i++){const d=defById.get(terrain[i]);bm[i]=d?(BI[d.biome]??0):0;}

// Distance from land (for ocean depth bands)
const distL=new Int16Array(width*height).fill(-1);
const q=[];for(let i=0;i<bm.length;i++)if(bm[i]!==0){distL[i]=0;q.push(i);}
let qi=0;while(qi<q.length){const ci=q[qi++];const cx=ci%width,cy=(ci/width)|0,cd=distL[ci];if(cd>=40)continue;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const ni=ny*width+nx;if(distL[ni]===-1){distL[ni]=cd+1;q.push(ni);}}}

// Shore adjacency map: land tiles adjacent to ocean get a flag
const shoreAdj=new Uint8Array(width*height); // bitmask: 1=N,2=E,4=S,8=W has ocean
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(bm[y*width+x]===0)continue;
  let mask=0;
  if(y>0 && bm[(y-1)*width+x]===0) mask|=1;
  if(x<width-1 && bm[y*width+x+1]===0) mask|=2;
  if(y<height-1 && bm[(y+1)*width+x]===0) mask|=4;
  if(x>0 && bm[y*width+x-1]===0) mask|=8;
  shoreAdj[y*width+x]=mask;
}

// Noise
console.log('Noise...');
function mkN(s,f,o=4){const p=Alea(s),n=createNoise2D(p);return(x,y)=>{let v=0,fr=f,a=1,m=0;for(let i=0;i<o;i++){v+=n(x*fr,y*fr)*a;m+=a;fr*=2;a*=0.5;}return(v/m+1)/2;};}
const elevN=mkN('wbelev',0.012,6);
const rN=mkN('wbriv',0.03,3);
const lkN=mkN('wblk',0.025,4);

const ev=new Float32Array(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)ev[y*width+x]=elevN(x,y);

// Lakes
console.log('Lakes...');
const lkM=new Uint8Array(width*height);
const lkRng=Alea('wblk2');
for(let i=0;i<400;i++){const x=(lkRng()*(width-40)+20)|0,y=(lkRng()*(height-40)+20)|0;const idx=y*width+x;if(bm[idx]===0||ev[idx]>0.42||ev[idx]<0.2)continue;if(lkN(x,y)>0.42)continue;const th=ev[idx]+0.018;const vis=new Set();const fl=[idx];const filled=[];while(fl.length>0&&filled.length<100){const ci=fl.pop();if(vis.has(ci))continue;vis.add(ci);if(ev[ci]>th||bm[ci]===0)continue;filled.push(ci);const cx=ci%width,cy=(ci/width)|0;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height)fl.push(ny*width+nx);}}if(filled.length>=10)for(const fi of filled)lkM[fi]=1;}

// Rivers
console.log('Rivers...');
const rvM=new Uint8Array(width*height);
const rvRng=Alea('wbrv');
const srcs=[];for(let i=0;i<2000;i++){const x=(rvRng()*(width-40)+20)|0,y=(rvRng()*(height-40)+20)|0;if(bm[y*width+x]!==0&&ev[y*width+x]>0.55)srcs.push([x,y]);}
srcs.sort((a,b)=>ev[b[1]*width+b[0]]-ev[a[1]*width+a[0]]);srcs.length=Math.min(80,srcs.length);
for(const[sx,sy]of srcs){let x=sx,y=sy,steps=0;const vis=new Set();while(steps<2000){if(x<1||x>=width-1||y<1||y>=height-1)break;if(bm[y*width+x]===0)break;const k=`${x},${y}`;if(vis.has(k))break;vis.add(k);const w=Math.min(3,1+(steps/80)|0);for(let dy=-w;dy<=w;dy++)for(let dx=-w;dx<=w;dx++)if(dx*dx+dy*dy<=w*w){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height)rvM[ny*width+nx]=Math.max(rvM[ny*width+nx],w);}let be=ev[y*width+x],bx=x,by=y;const m=(rN(x*0.5,y*0.5)-0.5)*0.02;for(const[dx,dy]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){const e=ev[ny*width+nx]+m*dx;if(e<be){be=e;bx=nx;by=ny;}}}if(bx===x&&by===y){x+=(rvRng()>0.5?1:-1);y+=(rvRng()>0.5?1:-1);}else{x=bx;y=by;}steps++;}}

// Paths
console.log('Paths...');
const ptM=new Uint8Array(width*height);
const ptRng=Alea('wbpt');const pN=mkN('wbpn',0.05,3);
for(let i=0;i<40;i++){const x1=(ptRng()*(width-100)+50)|0,y1=(ptRng()*(height-100)+50)|0;const x2=x1+((ptRng()*120-60)|0),y2=y1+((ptRng()*120-60)|0);if(x2<0||x2>=width||y2<0||y2>=height||bm[y1*width+x1]===0||bm[y2*width+x2]===0)continue;let x=x1,y=y1,steps=0;while(steps<500&&(Math.abs(x-x2)>1||Math.abs(y-y2)>1)){if(bm[y*width+x]===0)break;ptM[y*width+x]=1;if(x+1<width)ptM[y*width+x+1]=1;const dx=x2-x,dy=y2-y,wb=(pN(x*0.3,y*0.3)-0.5)*3;x=Math.max(0,Math.min(width-1,x+Math.sign(dx+wb)));y=Math.max(0,Math.min(height-1,y+Math.sign(dy+wb*0.5)));steps++;}}

// ═══════════════════════════════
// HELPERS
// ═══════════════════════════════
function tileHash(x,y){return((x*374761393+y*668265263)^(x*1274126177))>>>0;}
function pick(arr,x,y){return arr[tileHash(x,y)%arr.length];}

// 4x4 Bayer ordered dither matrix (normalized 0-15)
const BAYER4 = [
  [ 0, 8, 2,10],
  [12, 4,14, 6],
  [ 3,11, 1, 9],
  [15, 7,13, 5],
];

// ═══════════════════════════════
// TILE COLOR — with 8-band ocean depth
// ═══════════════════════════════
function getTileColor(tx,ty){
  const idx=ty*width+tx;
  const bid=bm[idx];

  if(lkM[idx]) return pick(LAKE,tx,ty);
  if(rvM[idx]>0&&bid!==0) return pick(RIVER,tx,ty);
  if(ptM[idx]&&bid!==0) return pick(PATH,tx,ty);

  // *** IMPROVEMENT 6: 8 ocean depth bands ***
  if(bid===0){
    let dist=distL[idx];if(dist<0)dist=40;
    const band = dist<=1?0 : dist<=3?1 : dist<=5?2 : dist<=8?3 : dist<=12?4 : dist<=18?5 : dist<=28?6 : 7;
    return pick(PALETTES.ocean[band],tx,ty);
  }

  const e=ev[idx];
  if(e>0.78) return pick(SNOW,tx,ty);

  const bn=BN[bid];
  return pick(PALETTES[bn],tx,ty);
}

// Get neighbor biome for border dithering
function getNeighborBiome(tx,ty){
  const idx=ty*width+tx;
  const bid=bm[idx];
  if(bid===0)return null;
  for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){
    const nx=tx+dx,ny=ty+dy;
    if(nx<0||nx>=width||ny<0||ny>=height)continue;
    const nb=bm[ny*width+nx];
    if(nb!==bid&&nb!==0) return {biome:nb, dx, dy};
  }
  return null;
}

// ═══════════════════════════════
// PIXEL
// ═══════════════════════════════
function setpx(buf,bw,bh,x,y,r,g,b){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=r;buf[i+1]=g;buf[i+2]=b;}

// ═══════════════════════════════
// *** IMPROVEMENT 3: Flattened ellipse trees ***
// ═══════════════════════════════
function drawWBTree(buf,bw,bh,pcx,pcy,type,tint){
  const cols=DECO_TREES[type]||DECO_TREES.oak;
  const c=cols[(tint||0)%cols.length];
  const dk=[clamp(c[0]-40),clamp(c[1]-40),clamp(c[2]-40)];
  const hi=[clamp(c[0]+30),clamp(c[1]+30),clamp(c[2]+30)];

  // Flattened ellipse: wider than tall (rx > ry)
  const rx = type==='palm'?4 : type==='pine'?3 : 5;  // horizontal radius
  const ry = type==='palm'?2 : type==='pine'?3 : 3;  // vertical radius (smaller = flatter)

  for(let dy=-ry;dy<=ry;dy++){
    const frac=dy/ry;
    const halfW=Math.round(rx*Math.sqrt(1-frac*frac));
    for(let dx=-halfW;dx<=halfW;dx++){
      // *** IMPROVEMENT 4: Top-left lighting ***
      const isTopLeft = dx <= -halfW+1 || dy <= -ry+1;
      const isBotRight = dx >= halfW-1 || dy >= ry-1;
      if(isTopLeft && !isBotRight){
        setpx(buf,bw,bh,pcx+dx,pcy+dy,...hi);
      } else if(isBotRight){
        setpx(buf,bw,bh,pcx+dx,pcy+dy,...dk);
      } else {
        setpx(buf,bw,bh,pcx+dx,pcy+dy,...c);
      }
    }
  }

  // Trunk (short, centered, below canopy)
  const tc=[0x5A,0x38,0x14];
  const tcdk=[0x44,0x28,0x0A];
  setpx(buf,bw,bh,pcx,pcy+ry+1,...tc);
  setpx(buf,bw,bh,pcx,pcy+ry+2,...tc);
  setpx(buf,bw,bh,pcx+1,pcy+ry+1,...tcdk); // shadow side of trunk
}

function drawWBDeco(buf,bw,bh,pcx,pcy,name,tint){
  if(name.includes('tree_pine')) return drawWBTree(buf,bw,bh,pcx,pcy,'pine',tint);
  if(name.includes('tree_oak')) return drawWBTree(buf,bw,bh,pcx,pcy,'oak',tint);
  if(name.includes('tree_palm')) return drawWBTree(buf,bw,bh,pcx,pcy,'palm',tint);

  const type=name.replace('deco_','');
  const cols=DECO_OTHER[type];
  if(!cols) return;
  const c=cols[(tint||0)%cols.length];
  const dk=[clamp(c[0]-30),clamp(c[1]-30),clamp(c[2]-30)];
  const hi=[clamp(c[0]+25),clamp(c[1]+25),clamp(c[2]+25)];

  if(type.includes('rock')){
    const r=type.includes('large')?3:2;
    for(let dy=-r+1;dy<=r;dy++)for(let dx=-r+1;dx<=r;dx++){
      if(dx*dx+dy*dy>r*r) continue;
      // *** IMPROVEMENT 4: Top-left lighting on rocks ***
      if(dx<=-r+1||dy<=-r+1) setpx(buf,bw,bh,pcx+dx,pcy+dy,...hi);
      else if(dx>=r-1||dy>=r-1) setpx(buf,bw,bh,pcx+dx,pcy+dy,...dk);
      else setpx(buf,bw,bh,pcx+dx,pcy+dy,...c);
    }
  } else if(type==='flower'){
    setpx(buf,bw,bh,pcx,pcy,...c);
    setpx(buf,bw,bh,pcx-1,pcy,...c);setpx(buf,bw,bh,pcx+1,pcy,...c);
    setpx(buf,bw,bh,pcx,pcy-1,...c);setpx(buf,bw,bh,pcx,pcy+1,...c);
    setpx(buf,bw,bh,pcx,pcy,0xFF,0xEB,0x3B);
  } else if(type==='cactus'){
    for(let dy=-4;dy<=4;dy++) setpx(buf,bw,bh,pcx,pcy+dy,...c);
    setpx(buf,bw,bh,pcx+1,pcy-2,...c);setpx(buf,bw,bh,pcx+2,pcy-2,...c);setpx(buf,bw,bh,pcx+2,pcy-3,...c);
    setpx(buf,bw,bh,pcx-1,pcy+1,...c);setpx(buf,bw,bh,pcx-2,pcy+1,...c);setpx(buf,bw,bh,pcx-2,pcy,...c);
    // Light on left side
    setpx(buf,bw,bh,pcx-1,pcy-3,...hi);setpx(buf,bw,bh,pcx-1,pcy-2,...hi);
  } else if(type==='mushroom'){
    setpx(buf,bw,bh,pcx,pcy,...c);setpx(buf,bw,bh,pcx-1,pcy,...c);setpx(buf,bw,bh,pcx+1,pcy,...c);
    setpx(buf,bw,bh,pcx,pcy-1,...hi);setpx(buf,bw,bh,pcx-1,pcy-1,...c);setpx(buf,bw,bh,pcx+1,pcy-1,...dk);
    setpx(buf,bw,bh,pcx,pcy+1,0xE0,0xD0,0xA0);setpx(buf,bw,bh,pcx,pcy+2,0xE0,0xD0,0xA0);
    setpx(buf,bw,bh,pcx,pcy-1,0xF8,0xF0,0xF0);
  } else if(type==='snowdrift'){
    for(let dx=-2;dx<=2;dx++) setpx(buf,bw,bh,pcx+dx,pcy,...c);
    setpx(buf,bw,bh,pcx-1,pcy-1,...hi);setpx(buf,bw,bh,pcx,pcy-1,...c);setpx(buf,bw,bh,pcx+1,pcy-1,...c);
    setpx(buf,bw,bh,pcx+2,pcy,...dk);
  } else {
    for(let dy=-3;dy<=3;dy++) setpx(buf,bw,bh,pcx,pcy+dy,...c);
    setpx(buf,bw,bh,pcx-1,pcy-1,...hi);
  }
}

// ═══════════════════════════════
// RENDER
// ═══════════════════════════════
const T=12;

// Find interesting area
const sRng=Alea('wbsrch');
let bX=500,bY=500,bS=0;
for(let i=0;i<1000;i++){const tx=(sRng()*(width-120)+60)|0,ty=(sRng()*(height-80)+40)|0;const biomes=new Set();let oc=0,ld=0,rv=0;for(let dy=-30;dy<=30;dy+=5)for(let dx=-30;dx<=30;dx+=5){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){biomes.add(BN[bm[ny*width+nx]]);if(bm[ny*width+nx]===0)oc++;else ld++;if(rvM[ny*width+nx]>0)rv++;}}const sc=biomes.size*3+(oc>0&&ld>0?12:0)+(rv>2?8:0);if(sc>bS){bS=sc;bX=tx;bY=ty;}}

const CW=100,CH=70;
const cx=Math.max(0,Math.min(width-CW,bX-CW/2)),cy=Math.max(0,Math.min(height-CH,bY-CH/2));
const iw=CW*T,ih=CH*T;
console.log(`Close-up: ${iw}x${ih} at (${cx},${cy})`);

const buf=Buffer.alloc(iw*ih*3);

// ═══════════════════════════════
// TERRAIN PASS
// ═══════════════════════════════
console.log('Terrain...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const wtx=cx+tx, wty=cy+ty;
  const idx=wty*width+wtx;
  const c=getTileColor(wtx,wty);
  const bid=bm[idx];
  const neighborInfo=getNeighborBiome(wtx,wty);

  for(let py=0;py<T;py++)for(let px=0;px<T;px++){
    let r=c[0],g=c[1],b=c[2];

    // *** IMPROVEMENT 1: Checkerboard dither ***
    // Alternate shade on every other pixel (chess pattern)
    if((px+py)%2===0){
      r=clamp(r+4); g=clamp(g+4); b=clamp(b+4);
    } else {
      r=clamp(r-4); g=clamp(g-4); b=clamp(b-4);
    }

    // Border dithering removed — clean edges look better

    setpx(buf,iw,ih,tx*T+px,ty*T+py,r,g,b);
  }

  // *** IMPROVEMENT 5: Shore shadow line ***
  const shore=shoreAdj[idx];
  if(shore){
    const shadowColor=[clamp(c[0]-50),clamp(c[1]-50),clamp(c[2]-50)];
    // 1px dark line on the land side where it touches ocean
    if(shore&1) // ocean to the North → dark line at top of this tile
      for(let px=0;px<T;px++) setpx(buf,iw,ih,tx*T+px,ty*T,...shadowColor);
    if(shore&2) // ocean to East → dark line at right
      for(let py=0;py<T;py++) setpx(buf,iw,ih,tx*T+T-1,ty*T+py,...shadowColor);
    if(shore&4) // ocean to South → dark line at bottom
      for(let px=0;px<T;px++) setpx(buf,iw,ih,tx*T+px,ty*T+T-1,...shadowColor);
    if(shore&8) // ocean to West → dark line at left
      for(let py=0;py<T;py++) setpx(buf,iw,ih,tx*T,ty*T+py,...shadowColor);
  }

  // Micro-texture dots (keep from v1)
  const h=tileHash(wtx,wty);
  const numDots=(h%3)+1;
  for(let d=0;d<numDots;d++){
    const dpx=((h>>(d*4))%10)+1;
    const dpy=(((h>>(d*4+2))%8))+2;
    if(dpx<T&&dpy<T){
      const shade=((h>>(d*6))%2===0)?10:-10;
      const bi=(ty*T+dpy)*iw+(tx*T+dpx);
      if(bi*3+2<buf.length){
        buf[bi*3]=clamp(buf[bi*3]+shade);
        buf[bi*3+1]=clamp(buf[bi*3+1]+shade);
        buf[bi*3+2]=clamp(buf[bi*3+2]+shade);
      }
    }
  }
}

// Decorations
console.log('Decorations...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const idx=(cy+ty)*width+(cx+tx);
  const did=decorations[idx];if(!did)continue;
  const dd=defById.get(did);if(!dd)continue;
  const tint=decoTints?decoTints[idx]:0;
  drawWBDeco(buf,iw,ih,tx*T+T/2,ty*T+T/2,dd.name,tint);
}

writeFileSync('output/world-wb2-closeup.png',makePNG(buf,iw,ih));
console.log('Saved close-up');

// Overview
const sc2=2;const ow=width/sc2|0,oh=height/sc2|0;
console.log(`Overview: ${ow}x${oh}...`);
const ob=Buffer.alloc(ow*oh*3);
for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){
  const tx=ox*sc2,ty=oy*sc2;
  const c=getTileColor(tx,ty);
  const did=decorations[ty*width+tx];
  let r=c[0],g=c[1],b=c[2];
  if(did){const dd=defById.get(did);if(dd&&dd.name.includes('tree')){r=clamp(r*0.8+0x28*0.2);g=clamp(g*0.8+0x78*0.2);b=clamp(b*0.8+0x2C*0.2);}}
  // Shore shadow on overview too
  const idx=ty*width+tx;
  if(shoreAdj[idx]){r=clamp(r-30);g=clamp(g-30);b=clamp(b-30);}
  const i=(oy*ow+ox)*3;ob[i]=r;ob[i+1]=g;ob[i+2]=b;
}
writeFileSync('output/world-wb2-overview.png',makePNG(ob,ow,oh));
console.log('Done!');
