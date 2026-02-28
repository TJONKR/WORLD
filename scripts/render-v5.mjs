#!/usr/bin/env node
/**
 * V5 Renderer — V4 plus:
 * - Dirt paths winding between points
 * - Cliff edges on steep elevation drops
 * - Lakes pooling in low-elevation basins
 * - Denser forests with overlapping varied-size canopy
 * - Shoreline sand particles in shallow water
 * - Improved river width + delta at coast
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

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
const OCEAN_DEPTH=[[0x5A,0xB8,0xD0],[0x42,0x9E,0xC0],[0x30,0x85,0xB5],[0x24,0x72,0xAF],[0x18,0x5A,0x95],[0x0D,0x3B,0x6E],[0x08,0x2A,0x54]];
const RIVER_COLOR=[0x30,0x85,0xB5];
const LAKE_COLORS=[[0x4A,0xA8,0xC4],[0x3E,0x98,0xB8],[0x32,0x88,0xAC]];
const FOAM_COLOR=[0xE8,0xF0,0xF4];
const PATH_COLOR=[0x9E,0x88,0x60];
const CLIFF_COLOR=[0x55,0x4A,0x3E];
const DECO_COLORS={deco_tree_pine:[0x1b,0x5e,0x20],deco_tree_oak:[0x38,0x8e,0x3c],deco_tree_palm:[0x66,0xbb,0x6a],deco_rock_small:[0x75,0x75,0x75],deco_rock_large:[0x61,0x61,0x61],deco_flower:[0xe9,0x1e,0x63],deco_cactus:[0x2e,0x7d,0x32],deco_mushroom:[0xd3,0x2f,0x2f],deco_reed:[0x8b,0xc3,0x4a],deco_snowdrift:[0xff,0xff,0xff],deco_seaweed:[0x00,0x69,0x5c]};

const clamp=v=>Math.max(0,Math.min(255,v|0));
const lerp=(a,b,t)=>a+(b-a)*t;
const lerpC=(a,b,t)=>[clamp(lerp(a[0],b[0],t)),clamp(lerp(a[1],b[1],t)),clamp(lerp(a[2],b[2],t))];

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
const biomeMap=new Uint8Array(width*height);
for(let i=0;i<terrain.length;i++){const d=defById.get(terrain[i]);biomeMap[i]=d?(BI[d.biome]??0):0;}

// Distance from land
const distLand=new Int16Array(width*height).fill(-1);
const q=[];
for(let i=0;i<biomeMap.length;i++)if(biomeMap[i]!==0){distLand[i]=0;q.push(i);}
let qi=0;while(qi<q.length){const ci=q[qi++];const cx=ci%width,cy=(ci/width)|0,cd=distLand[ci];if(cd>=25)continue;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const ni=ny*width+nx;if(distLand[ni]===-1){distLand[ni]=cd+1;q.push(ni);}}}

// Noise
console.log('Noise...');
function mkN(s,f,o=4){const p=Alea(s),n=createNoise2D(p);return(x,y)=>{let v=0,fr=f,a=1,m=0;for(let i=0;i<o;i++){v+=n(x*fr,y*fr)*a;m+=a;fr*=2;a*=0.5;}return(v/m+1)/2;};}
const colorN=mkN('c5',0.035,5),elevN=mkN('e5',0.012,6),detN=mkN('d5',0.18,3),blendN=mkN('b5',0.06,3);
const foamN=mkN('f5',0.2,2),waveN=mkN('w5',0.08,3),cloudN=mkN('cl5',0.008,4),grassN=mkN('g5',0.25,2);
const riverN=mkN('r5',0.03,3),pathN=mkN('p5',0.05,3),lakeN=mkN('lk5',0.025,4);

// Elevation
console.log('Elevation...');
const elev=new Float32Array(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)elev[y*width+x]=elevN(x,y);

// Hillshade
function hs(x,y){if(x<=0||x>=width-1||y<=0||y>=height-1)return 1;const dx=(elev[y*width+x+1]-elev[y*width+x-1])*5,dy=(elev[(y+1)*width+x]-elev[(y-1)*width+x])*5;const az=315*Math.PI/180,alt=40*Math.PI/180,sl=Math.atan(Math.sqrt(dx*dx+dy*dy)),asp=Math.atan2(-dy,-dx);return Math.max(0.5,Math.min(1.4,0.5+(Math.cos(alt)*Math.cos(sl)+Math.sin(alt)*Math.sin(sl)*Math.cos(az-asp))*0.9));}

// Cliff detection (steep slope)
console.log('Cliff detection...');
const cliffMap=new Uint8Array(width*height);
for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  if(biomeMap[y*width+x]===0) continue;
  const dx=Math.abs(elev[y*width+x+1]-elev[y*width+x-1]);
  const dy=Math.abs(elev[(y+1)*width+x]-elev[(y-1)*width+x]);
  const slope=Math.sqrt(dx*dx+dy*dy);
  if(slope>0.06) cliffMap[y*width+x]=Math.min(3,(slope/0.03)|0);
}

// Lakes — flood fill low basins
console.log('Lakes...');
const lakeMap=new Uint8Array(width*height);
const lakeRng=Alea('lakes5');
for(let i=0;i<300;i++){
  const x=(lakeRng()*(width-40)+20)|0,y=(lakeRng()*(height-40)+20)|0;
  const idx=y*width+x;
  if(biomeMap[idx]===0||elev[idx]>0.45||elev[idx]<0.2) continue;
  // Check it's a local minimum
  const ln=lakeN(x,y);
  if(ln>0.45) continue;
  // Flood fill up to threshold
  const threshold=elev[idx]+0.015;
  const visited=new Set();
  const flood=[idx];
  const filled=[];
  while(flood.length>0&&filled.length<80){
    const ci=flood.pop();
    if(visited.has(ci)) continue;
    visited.add(ci);
    const ce=elev[ci];
    if(ce>threshold||biomeMap[ci]===0) continue;
    filled.push(ci);
    const cx2=ci%width,cy2=(ci/width)|0;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=cx2+dx,ny=cy2+dy;
      if(nx>=0&&nx<width&&ny>=0&&ny<height) flood.push(ny*width+nx);
    }
  }
  if(filled.length>=8) for(const fi of filled) lakeMap[fi]=1;
}
console.log(`Lakes: ${lakeMap.reduce((a,v)=>a+v,0)} tiles`);

// Rivers
console.log('Rivers...');
const riverMap=new Uint8Array(width*height);
const rivRng=Alea('riv5');
const srcs=[];
for(let i=0;i<2000;i++){const x=(rivRng()*(width-40)+20)|0,y=(rivRng()*(height-40)+20)|0;if(biomeMap[y*width+x]!==0&&elev[y*width+x]>0.55)srcs.push([x,y]);}
srcs.sort((a,b)=>elev[b[1]*width+b[0]]-elev[a[1]*width+a[0]]);
srcs.length=Math.min(80,srcs.length);

for(const[sx,sy]of srcs){
  let x=sx,y=sy,steps=0;const vis=new Set();
  while(steps<2000){
    if(x<1||x>=width-1||y<1||y>=height-1)break;
    if(biomeMap[y*width+x]===0)break;
    const k=`${x},${y}`;if(vis.has(k))break;vis.add(k);
    const w=Math.min(4,1+(steps/60)|0);
    for(let dy=-w;dy<=w;dy++)for(let dx=-w;dx<=w;dx++)if(dx*dx+dy*dy<=w*w){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height)riverMap[ny*width+nx]=Math.max(riverMap[ny*width+nx],w);}
    let be=elev[y*width+x],bx=x,by=y;
    const m=(riverN(x*0.5,y*0.5)-0.5)*0.02;
    for(const[dx,dy]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){const e=elev[ny*width+nx]+m*dx;if(e<be){be=e;bx=nx;by=ny;}}}
    if(bx===x&&by===y){x+=(rivRng()>0.5?1:-1);y+=(rivRng()>0.5?1:-1);}else{x=bx;y=by;}
    steps++;
  }
}
console.log(`Rivers: ${riverMap.reduce((a,v)=>a+(v>0?1:0),0)} tiles`);

// Paths — connect random land points via A*-lite
console.log('Paths...');
const pathMap=new Uint8Array(width*height);
const pathRng=Alea('path5');
const pathPairs=[];
for(let i=0;i<40;i++){
  const x1=(pathRng()*(width-100)+50)|0,y1=(pathRng()*(height-100)+50)|0;
  const x2=x1+(pathRng()*120-60)|0,y2=y1+(pathRng()*120-60)|0;
  if(x2<0||x2>=width||y2<0||y2>=height) continue;
  if(biomeMap[y1*width+x1]===0||biomeMap[y2*width+x2]===0) continue;
  pathPairs.push([x1,y1,x2,y2]);
}

for(const[x1,y1,x2,y2]of pathPairs){
  // Simple walk towards target with noise wobble
  let x=x1,y=y1,steps=0;
  while(steps<500&&(Math.abs(x-x2)>1||Math.abs(y-y2)>1)){
    if(biomeMap[y*width+x]===0) break;
    pathMap[y*width+x]=1;
    // Also fill 1px neighbors for width
    if(x+1<width) pathMap[y*width+x+1]=1;
    if(y+1<height) pathMap[(y+1)*width+x]=1;
    
    const dx=x2-x,dy=y2-y;
    const wobble=(pathN(x*0.3,y*0.3)-0.5)*3;
    const nx=x+Math.sign(dx+wobble),ny=y+Math.sign(dy+wobble*0.5);
    x=Math.max(0,Math.min(width-1,nx));
    y=Math.max(0,Math.min(height-1,ny));
    steps++;
  }
}
console.log(`Paths: ${pathMap.reduce((a,v)=>a+v,0)} tiles`);

// ═══════════════════════════════
// TERRAIN COLOR
// ═══════════════════════════════
function getColor(tx,ty){
  const idx=ty*width+tx;
  const bid=biomeMap[idx];

  // Lake
  if(lakeMap[idx]){
    const ln=lakeN(tx,ty);
    const c=lerpC(LAKE_COLORS[0],LAKE_COLORS[2],ln);
    const wv=(waveN(tx*2,ty*2)-0.5)*8;
    const h=hs(tx,ty)*0.95+0.05;
    return[clamp((c[0]+wv)*h),clamp((c[1]+wv)*h),clamp((c[2]+wv)*h)];
  }

  // River
  if(riverMap[idx]>0&&bid!==0){
    let c=[...RIVER_COLOR];const wv=(waveN(tx*2,ty*2)-0.5)*10;c=[clamp(c[0]+wv),clamp(c[1]+wv),clamp(c[2]+wv)];
    let bank=false;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&riverMap[ny*width+nx]===0&&biomeMap[ny*width+nx]!==0)bank=true;}
    if(bank)c=lerpC(c,[0x5A,0x7A,0x4A],0.3);
    const h=hs(tx,ty);return[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];
  }

  // Ocean
  if(bid===0){
    let dist=distLand[idx];if(dist<0)dist=25;
    if(dist<=1){const fn=foamN(tx,ty);if(fn>0.38)return FOAM_COLOR;}
    if(dist>=2&&dist<=4){const wv=waveN(tx*1.5,ty*1.5);if(wv>0.62)return lerpC(OCEAN_DEPTH[0],FOAM_COLOR,0.3);}
    // Sand particles in shallow water
    if(dist>=1&&dist<=3){const sn=detN(tx*2,ty*2);if(sn>0.7)return lerpC(OCEAN_DEPTH[0],[0xD0,0xC8,0xA0],0.2);}
    const dt=Math.min(1,dist/22),di=Math.min(OCEAN_DEPTH.length-2,(dt*(OCEAN_DEPTH.length-1))|0),df=dt*(OCEAN_DEPTH.length-1)-di;
    let c=lerpC(OCEAN_DEPTH[di],OCEAN_DEPTH[di+1],df);
    const wv=(waveN(tx,ty)-0.5)*8;c=[clamp(c[0]+wv),clamp(c[1]+wv),clamp(c[2]+wv)];
    const h=0.85+(hs(tx,ty)-1)*0.25;return[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];
  }

  const pal=BIOME_PALETTES[BN[bid]]||BIOME_PALETTES.grassland;
  const cn=colorN(tx,ty);
  const si=Math.min(pal.length-1,(cn*pal.length)|0);
  let c=[...pal[si]];

  // Path overlay
  if(pathMap[idx]){
    c=lerpC(c,PATH_COLOR,0.6);
    // Path edge darkening
    let edge=false;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&!pathMap[ny*width+nx])edge=true;}
    if(edge) c=lerpC(c,[0x6E,0x5A,0x3A],0.3);
  }

  // Detail + hillshade
  const det=(detN(tx,ty)-0.5)*14;c=[clamp(c[0]+det),clamp(c[1]+det),clamp(c[2]+det)];
  const h=hs(tx,ty);c=[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];

  // Cliff edges
  if(cliffMap[idx]>0){
    const cf=Math.min(0.6,cliffMap[idx]*0.2);
    c=lerpC(c,CLIFF_COLOR,cf);
  }

  // Snow caps
  const ev=elev[idx];
  if(ev>0.76){const st=Math.min(1,(ev-0.76)/0.12);c=lerpC(c,[0xF0,0xF5,0xFA],st*0.75);}

  // Biome blend
  const BR=6;let bC=0,bR=0,bG=0,bB=0;
  for(const[dx,dy]of[[-BR,0],[BR,0],[0,-BR],[0,BR],[-BR,-BR],[BR,BR],[BR,-BR],[-BR,BR]]){const nx=tx+dx,ny=ty+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const nb=biomeMap[ny*width+nx];if(nb!==bid&&nb!==0){const np=BIOME_PALETTES[BN[nb]]||BIOME_PALETTES.grassland;const ns=Math.min(np.length-1,(cn*np.length)|0);bR+=np[ns][0];bG+=np[ns][1];bB+=np[ns][2];bC++;}}
  if(bC>0){const bn=blendN(tx,ty);const bs=Math.min(0.4,(bC/8)*0.45)*(0.4+bn*0.6);c=lerpC(c,[bR/bC,bG/bC,bB/bC],bs);}

  // Wet sand
  if(bid===1){let nw=false;for(const[dx,dy]of[[-2,0],[2,0],[0,-2],[0,2]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&biomeMap[ny*width+nx]===0)nw=true;}if(nw)c=lerpC(c,[0x9A,0x88,0x60],0.3);}

  // Cloud shadows
  const cl=cloudN(tx,ty);if(cl>0.6)c=[clamp(c[0]*(1-(cl-0.6)/2)),clamp(c[1]*(1-(cl-0.6)/2)),clamp(c[2]*(1-(cl-0.6)/2))];

  return c;
}

// ═══════════════════════════════
// DRAW HELPERS
// ═══════════════════════════════
function setpx(buf,bw,bh,x,y,r,g,b){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=r;buf[i+1]=g;buf[i+2]=b;}
function shadowpx(buf,bw,bh,x,y,a){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=clamp(buf[i]*a);buf[i+1]=clamp(buf[i+1]*a);buf[i+2]=clamp(buf[i+2]*a);}
function drawOutline(buf,bw,bh,pts,c,dk){const s=new Set(pts.map(([x,y])=>`${x},${y}`));for(const[x,y]of pts)setpx(buf,bw,bh,x,y,...c);for(const[x,y]of pts)for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]])if(!s.has(`${x+dx},${y+dy}`))setpx(buf,bw,bh,x+dx,y+dy,...dk);}

function drawDeco(buf,bw,bh,pcx,pcy,name,tint,sizeMulti=1){
  const bc=DECO_COLORS[name];if(!bc)return;
  const t=((tint||4)-4)*6;
  const c=[clamp(bc[0]+t),clamp(bc[1]+t),clamp(bc[2]+t)];
  const dk=[clamp(c[0]-50),clamp(c[1]-50),clamp(c[2]-50)];

  if(name.includes('tree')){
    const baseSz=name.includes('palm')?4:name.includes('oak')?5:6;
    const sz=Math.round(baseSz*sizeMulti);
    // Shadow
    for(let dy=-sz;dy<=sz-1;dy++){const w=sz-Math.abs(dy);for(let dx=-w;dx<=w;dx++)shadowpx(buf,bw,bh,pcx+dx+2,pcy+dy+1,0.55);}
    // Canopy
    const pts=[];for(let dy=-sz;dy<=sz-1;dy++){const w=sz-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy-1]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    for(let i=0;i<Math.min(4,pts.length);i++){const[hx,hy]=pts[i];setpx(buf,bw,bh,hx,hy,clamp(c[0]+30),clamp(c[1]+30),clamp(c[2]+30));}
    const tc=name.includes('palm')?[0x8B,0x6B,0x3D]:[0x5D,0x34,0x0F];
    for(let dy=sz-1;dy<=sz+2;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...tc);setpx(buf,bw,bh,pcx-1,pcy+dy,...tc);}
  } else if(name.includes('rock')){
    const r=Math.round((name.includes('large')?4:2)*sizeMulti);const pts=[];
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r+1)shadowpx(buf,bw,bh,pcx+dx+1,pcy+dy+1,0.6);
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r+1)pts.push([pcx+dx,pcy+dy]);
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx-1,pcy-1,clamp(c[0]+40),clamp(c[1]+40),clamp(c[2]+40));
  } else if(name.includes('flower')){
    const pts=[];for(let dy=-2;dy<=2;dy++){const w=2-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);setpx(buf,bw,bh,pcx,pcy,0xFF,0xEB,0x3B);
  } else if(name.includes('mushroom')){
    const pts=[];for(let dy=-3;dy<=0;dy++){const w=3-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);setpx(buf,bw,bh,pcx-1,pcy-2,255,255,255);setpx(buf,bw,bh,pcx+1,pcy-1,255,255,255);
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
const searchRng=Alea('srch5');
let bX=500,bY=500,bS=0;
for(let i=0;i<1000;i++){
  const tx=(searchRng()*(width-120)+60)|0,ty=(searchRng()*(height-80)+40)|0;
  const biomes=new Set();let oc=0,ld=0,rv=0,lk=0,pt=0;
  for(let dy=-25;dy<=25;dy+=4)for(let dx=-25;dx<=25;dx+=4){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){biomes.add(BN[biomeMap[ny*width+nx]]);if(biomeMap[ny*width+nx]===0)oc++;else ld++;if(riverMap[ny*width+nx]>0)rv++;if(lakeMap[ny*width+nx])lk++;if(pathMap[ny*width+nx])pt++;}}
  const sc=biomes.size*3+(oc>0&&ld>0?10:0)+(rv>2?8:0)+(lk>2?6:0)+(pt>2?4:0);
  if(sc>bS){bS=sc;bX=tx;bY=ty;}
}

const CW=80,CH=50;
const cx=Math.max(0,Math.min(width-CW,bX-CW/2)),cy=Math.max(0,Math.min(height-CH,bY-CH/2));
const iw=CW*T,ih=CH*T;
console.log(`Close-up: ${iw}x${ih} at (${cx},${cy}), score=${bS}`);

const buf=Buffer.alloc(iw*ih*3);

console.log('Terrain...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){const c=getColor(cx+tx,cy+ty);for(let py=0;py<T;py++)for(let px=0;px<T;px++)setpx(buf,iw,ih,tx*T+px,ty*T+py,...c);}

// Ground cover
console.log('Ground cover...');
const tRng=Alea('turf5');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const idx=(cy+ty)*width+(cx+tx);const b=biomeMap[idx];
  if(b!==2&&b!==3&&b!==7)continue;if(decorations[idx])continue;
  const gn=grassN(cx+tx,cy+ty);if(gn<0.35||tRng()>0.4)continue;
  const pcx=tx*T+(tRng()*12+2)|0,pcy=ty*T+(tRng()*12+2)|0;
  const shade=b===3?-15:10;const gc=BIOME_PALETTES[BN[b]][0];
  const tc=[clamp(gc[0]+shade),clamp(gc[1]+shade+8),clamp(gc[2]+shade)];
  setpx(buf,iw,ih,pcx,pcy,...tc);setpx(buf,iw,ih,pcx,pcy-1,...tc);
  if(tRng()>0.5)setpx(buf,iw,ih,pcx+1,pcy,...tc);
}

// Decorations — with size variation
console.log('Decorations...');
const sizeRng=Alea('size5');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){
  const idx=(cy+ty)*width+(cx+tx);const did=decorations[idx];if(!did)continue;
  const dd=defById.get(did);if(!dd)continue;
  const sizeMul=0.7+sizeRng()*0.6; // 0.7 to 1.3
  drawDeco(buf,iw,ih,tx*T+T/2,ty*T+T/2,dd.name,decoTints?decoTints[idx]:4,sizeMul);
}

writeFileSync('output/world-v5-closeup.png',makePNG(buf,iw,ih));
console.log('Saved close-up');

// Overview
const sc2=2;const ow=width/sc2|0,oh=height/sc2|0;
console.log(`Overview: ${ow}x${oh}...`);
const ob=Buffer.alloc(ow*oh*3);
for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){
  const tx=ox*sc2,ty=oy*sc2;let c=getColor(tx,ty);
  const did=decorations[ty*width+tx];if(did){const dd=defById.get(did);if(dd){const dc=DECO_COLORS[dd.name];if(dc)c=lerpC(c,dc,0.2);}}
  const i=(oy*ow+ox)*3;ob[i]=c[0];ob[i+1]=c[1];ob[i+2]=c[2];
}
writeFileSync('output/world-v5-overview.png',makePNG(ob,ow,oh));
console.log('Done!');
