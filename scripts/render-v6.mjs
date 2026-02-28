#!/usr/bin/env node
/**
 * V6 — Pure polish pass. Same features as V5, everything refined:
 * - Richer, more natural color palettes
 * - Organic tree shapes (not perfect triangles)
 * - Smoother river/lake shore gradients
 * - Better foam (natural wave patterns, not random)
 * - Softer shadows with falloff
 * - Finer terrain texture grain
 * - More dramatic hillshading
 * - Rocks with irregular shapes
 * - Better cliff rendering (layered stripes)
 * - Flower variety (multiple colors)
 */
import { readFileSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import Alea from 'alea';
import { createNoise2D } from 'simplex-noise';

// ═══════════════════════════════
// RICHER PALETTES
// ═══════════════════════════════
const BIOME_PALETTES = {
  ocean:     [[0x06,0x22,0x4A],[0x0A,0x32,0x60],[0x10,0x44,0x78],[0x18,0x58,0x92],[0x22,0x6C,0xA8],[0x2E,0x80,0xBC]],
  beach:     [[0xB8,0xA4,0x62],[0xC6,0xB4,0x72],[0xD4,0xC4,0x80],[0xE2,0xD2,0x8C],[0xEC,0xDE,0x9C],[0xF6,0xEC,0xB0]],
  grassland: [[0x2E,0x5E,0x1A],[0x38,0x70,0x22],[0x44,0x84,0x2C],[0x50,0x96,0x36],[0x5E,0xA8,0x42],[0x6E,0xB8,0x50],[0x80,0xC4,0x62],[0x94,0xD0,0x78]],
  forest:    [[0x0E,0x32,0x10],[0x14,0x42,0x18],[0x1C,0x54,0x22],[0x24,0x66,0x2C],[0x2C,0x78,0x34],[0x34,0x88,0x3C]],
  desert:    [[0x9E,0x7E,0x38],[0xAE,0x8E,0x44],[0xBE,0x9E,0x50],[0xCE,0xAE,0x5C],[0xDC,0xBC,0x66],[0xE8,0xCC,0x74],[0xF2,0xDC,0x84]],
  mountain:  [[0x4E,0x4C,0x48],[0x5E,0x5C,0x58],[0x70,0x6E,0x6A],[0x84,0x82,0x7E],[0x98,0x96,0x92],[0xAC,0xAA,0xA6],[0xBE,0xBC,0xB8]],
  tundra:    [[0x9E,0xAE,0xBE],[0xAE,0xBC,0xCA],[0xBE,0xCA,0xD6],[0xCE,0xD8,0xE2],[0xDE,0xE6,0xEE],[0xEC,0xF0,0xF6]],
  swamp:     [[0x22,0x38,0x22],[0x2C,0x46,0x2C],[0x36,0x54,0x36],[0x40,0x62,0x40],[0x4C,0x72,0x4A],[0x58,0x80,0x56]],
};

const OCEAN_DEPTH=[[0x62,0xC0,0xD6],[0x4E,0xAC,0xC8],[0x3C,0x98,0xBC],[0x2C,0x84,0xAE],[0x20,0x6C,0x9A],[0x16,0x54,0x84],[0x0E,0x3E,0x6C],[0x08,0x2A,0x54]];
const RIVER_COLORS=[[0x38,0x92,0xBC],[0x30,0x85,0xB5],[0x28,0x78,0xA8]];
const LAKE_SHORE=[[0x5A,0xB4,0xCC],[0x4A,0xA4,0xC0],[0x3C,0x96,0xB4],[0x30,0x88,0xA8]];
const PATH_COLORS=[[0x8E,0x78,0x52],[0x9A,0x84,0x5C],[0xA6,0x90,0x68]];
const CLIFF_COLORS=[[0x5A,0x50,0x42],[0x4E,0x44,0x38],[0x62,0x58,0x4C]];

const DECO_COLORS={
  deco_tree_pine:[[0x14,0x52,0x18],[0x1A,0x5E,0x20],[0x20,0x6A,0x26]],
  deco_tree_oak:[[0x2E,0x80,0x34],[0x38,0x8E,0x3C],[0x42,0x9C,0x46]],
  deco_tree_palm:[[0x58,0xA8,0x5C],[0x66,0xBB,0x6A],[0x74,0xC8,0x78]],
  deco_rock_small:[[0x68,0x66,0x62],[0x75,0x75,0x75],[0x82,0x80,0x7C]],
  deco_rock_large:[[0x54,0x52,0x4E],[0x61,0x61,0x61],[0x6E,0x6C,0x68]],
  deco_flower:[[0xe9,0x1e,0x63],[0xE0,0x60,0x20],[0x90,0x40,0xC0],[0xFF,0xC1,0x07]],
  deco_cactus:[[0x24,0x6E,0x28],[0x2E,0x7D,0x32],[0x38,0x8C,0x3C]],
  deco_mushroom:[[0xC8,0x28,0x28],[0xd3,0x2f,0x2f],[0xDE,0x38,0x38]],
  deco_reed:[[0x7E,0xB0,0x42],[0x8b,0xc3,0x4a],[0x98,0xD0,0x54]],
  deco_snowdrift:[[0xE4,0xEC,0xF2],[0xff,0xff,0xff],[0xF0,0xF6,0xFA]],
  deco_seaweed:[[0x00,0x5C,0x50],[0x00,0x69,0x5c],[0x00,0x78,0x68]],
};

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
const bm=new Uint8Array(width*height);
for(let i=0;i<terrain.length;i++){const d=defById.get(terrain[i]);bm[i]=d?(BI[d.biome]??0):0;}

const distL=new Int16Array(width*height).fill(-1);
const q=[];for(let i=0;i<bm.length;i++)if(bm[i]!==0){distL[i]=0;q.push(i);}
let qi=0;while(qi<q.length){const ci=q[qi++];const cx=ci%width,cy=(ci/width)|0,cd=distL[ci];if(cd>=30)continue;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const ni=ny*width+nx;if(distL[ni]===-1){distL[ni]=cd+1;q.push(ni);}}}

console.log('Noise...');
function mkN(s,f,o=4){const p=Alea(s),n=createNoise2D(p);return(x,y)=>{let v=0,fr=f,a=1,m=0;for(let i=0;i<o;i++){v+=n(x*fr,y*fr)*a;m+=a;fr*=2;a*=0.5;}return(v/m+1)/2;};}
const cN=mkN('c6',0.032,6),eN=mkN('e6',0.011,7),dN=mkN('d6',0.22,4),bN=mkN('b6',0.055,4);
const fN=mkN('f6',0.15,3),wN=mkN('w6',0.06,4),clN=mkN('cl6',0.007,5),gN=mkN('g6',0.3,3);
const rN=mkN('r6',0.03,3),pN=mkN('p6',0.05,3),lkN=mkN('lk6',0.025,4);
// Extra fine noise for micro-texture
const microN=mkN('micro6',0.5,2);
const foliageN=mkN('fol6',0.12,3);

console.log('Elevation...');
const ev=new Float32Array(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)ev[y*width+x]=eN(x,y);

// Hillshade — stronger contrast
function hs(x,y){if(x<=0||x>=width-1||y<=0||y>=height-1)return 1;
  const dx=(ev[y*width+x+1]-ev[y*width+x-1])*6;const dy=(ev[(y+1)*width+x]-ev[(y-1)*width+x])*6;
  const az=315*Math.PI/180,alt=35*Math.PI/180;
  const sl=Math.atan(Math.sqrt(dx*dx+dy*dy)),asp=Math.atan2(-dy,-dx);
  return Math.max(0.45,Math.min(1.5,0.5+(Math.cos(alt)*Math.cos(sl)+Math.sin(alt)*Math.sin(sl)*Math.cos(az-asp))*1.0));}

// Cliffs
console.log('Cliffs...');
const cliffM=new Uint8Array(width*height);
for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){if(bm[y*width+x]===0)continue;const dx=Math.abs(ev[y*width+x+1]-ev[y*width+x-1]);const dy=Math.abs(ev[(y+1)*width+x]-ev[(y-1)*width+x]);const sl=Math.sqrt(dx*dx+dy*dy);if(sl>0.05)cliffM[y*width+x]=Math.min(4,(sl/0.025)|0);}

// Lakes
console.log('Lakes...');
const lkM=new Uint8Array(width*height);
const lkRng=Alea('lk6');
for(let i=0;i<400;i++){const x=(lkRng()*(width-40)+20)|0,y=(lkRng()*(height-40)+20)|0;const idx=y*width+x;if(bm[idx]===0||ev[idx]>0.42||ev[idx]<0.2)continue;if(lkN(x,y)>0.42)continue;const th=ev[idx]+0.018;const vis=new Set();const fl=[idx];const filled=[];while(fl.length>0&&filled.length<100){const ci=fl.pop();if(vis.has(ci))continue;vis.add(ci);if(ev[ci]>th||bm[ci]===0)continue;filled.push(ci);const cx2=ci%width,cy2=(ci/width)|0;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx2+dx,ny=cy2+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height)fl.push(ny*width+nx);}}if(filled.length>=10)for(const fi of filled)lkM[fi]=1;}

// Lake shore distance
const lkDist=new Int8Array(width*height).fill(-1);
const lkQ=[];for(let i=0;i<lkM.length;i++)if(lkM[i]&&bm[i]!==0){for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=i%width+dx,ny=((i/width)|0)+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&!lkM[ny*width+nx]&&bm[ny*width+nx]!==0){lkDist[i]=0;lkQ.push(i);break;}}}
qi=0;while(qi<lkQ.length){const ci=lkQ[qi++];const cd=lkDist[ci];if(cd>=6)continue;const cx=ci%width,cy=(ci/width)|0;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const ni=ny*width+nx;if(lkM[ni]&&lkDist[ni]===-1){lkDist[ni]=cd+1;lkQ.push(ni);}}}
console.log(`Lakes: ${lkM.reduce((a,v)=>a+v,0)} tiles`);

// Rivers
console.log('Rivers...');
const rvM=new Uint8Array(width*height);
const rvRng=Alea('rv6');
const srcs=[];for(let i=0;i<2000;i++){const x=(rvRng()*(width-40)+20)|0,y=(rvRng()*(height-40)+20)|0;if(bm[y*width+x]!==0&&ev[y*width+x]>0.55)srcs.push([x,y]);}
srcs.sort((a,b)=>ev[b[1]*width+b[0]]-ev[a[1]*width+a[0]]);srcs.length=Math.min(80,srcs.length);
for(const[sx,sy]of srcs){let x=sx,y=sy,steps=0;const vis=new Set();while(steps<2000){if(x<1||x>=width-1||y<1||y>=height-1)break;if(bm[y*width+x]===0)break;const k=`${x},${y}`;if(vis.has(k))break;vis.add(k);const w=Math.min(4,1+(steps/60)|0);for(let dy=-w;dy<=w;dy++)for(let dx=-w;dx<=w;dx++)if(dx*dx+dy*dy<=w*w){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height)rvM[ny*width+nx]=Math.max(rvM[ny*width+nx],w);}let be=ev[y*width+x],bx=x,by=y;const m=(rN(x*0.5,y*0.5)-0.5)*0.02;for(const[dx,dy]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){const e=ev[ny*width+nx]+m*dx;if(e<be){be=e;bx=nx;by=ny;}}}if(bx===x&&by===y){x+=(rvRng()>0.5?1:-1);y+=(rvRng()>0.5?1:-1);}else{x=bx;y=by;}steps++;}}
console.log(`Rivers: ${rvM.reduce((a,v)=>a+(v>0?1:0),0)} tiles`);

// Paths
console.log('Paths...');
const ptM=new Uint8Array(width*height);
const ptRng=Alea('pt6');
for(let i=0;i<40;i++){const x1=(ptRng()*(width-100)+50)|0,y1=(ptRng()*(height-100)+50)|0;const x2=x1+((ptRng()*120-60)|0),y2=y1+((ptRng()*120-60)|0);if(x2<0||x2>=width||y2<0||y2>=height||bm[y1*width+x1]===0||bm[y2*width+x2]===0)continue;let x=x1,y=y1,steps=0;while(steps<500&&(Math.abs(x-x2)>1||Math.abs(y-y2)>1)){if(bm[y*width+x]===0)break;ptM[y*width+x]=1;if(x+1<width)ptM[y*width+x+1]=1;if(y+1<height)ptM[(y+1)*width+x]=1;const dx=x2-x,dy=y2-y,wb=(pN(x*0.3,y*0.3)-0.5)*3;x=Math.max(0,Math.min(width-1,x+Math.sign(dx+wb)));y=Math.max(0,Math.min(height-1,y+Math.sign(dy+wb*0.5)));steps++;}}

// ═══════════════════════════════
// TERRAIN COLOR
// ═══════════════════════════════
function getColor(tx,ty){
  const idx=ty*width+tx;const bid=bm[idx];

  // Lake with shore gradient
  if(lkM[idx]){
    const ld=lkDist[idx];const dt=ld<0?1:Math.min(1,ld/5);
    const di=Math.min(LAKE_SHORE.length-2,(dt*(LAKE_SHORE.length-1))|0);
    const df=dt*(LAKE_SHORE.length-1)-di;
    let c=lerpC(LAKE_SHORE[di],LAKE_SHORE[di+1],df);
    const wv=(wN(tx*2,ty*2)-0.5)*6;const mn=(microN(tx,ty)-0.5)*4;
    c=[clamp(c[0]+wv+mn),clamp(c[1]+wv+mn),clamp(c[2]+wv+mn)];
    // Light reflection on lake surface
    const h=hs(tx,ty);if(h>1.2) c=lerpC(c,[0xCC,0xE8,0xF0],(h-1.2)*0.8);
    else c=[clamp(c[0]*h*0.95),clamp(c[1]*h*0.95),clamp(c[2]*h*0.95)];
    return c;
  }

  // River with gradient
  if(rvM[idx]>0&&bid!==0){
    const rw=rvM[idx];const ri=Math.min(2,(rw-1));
    let c=[...RIVER_COLORS[ri]];
    const wv=(wN(tx*2,ty*2)-0.5)*8;const mn=(microN(tx,ty)-0.5)*4;
    c=[clamp(c[0]+wv+mn),clamp(c[1]+wv+mn),clamp(c[2]+wv+mn)];
    // Bank blending
    let bankDist=99;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&rvM[ny*width+nx]===0&&bm[ny*width+nx]!==0)bankDist=1;}
    if(bankDist<=1){const bp=BIOME_PALETTES[BN[bid]]||BIOME_PALETTES.grassland;c=lerpC(c,bp[Math.min(1,bp.length-1)],0.25);}
    const h=hs(tx,ty);if(h>1.2)c=lerpC(c,[0xB0,0xD8,0xE4],(h-1.2)*0.6);
    else c=[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];
    return c;
  }

  // Ocean
  if(bid===0){
    let dist=distL[idx];if(dist<0)dist=30;
    // Multi-layer foam
    if(dist<=1){const fn=fN(tx,ty);const fn2=fN(tx*1.5+100,ty*1.5+100);if(fn>0.35||fn2>0.55)return lerpC([0xE0,0xEC,0xF0],[0xF4,0xF8,0xFA],fn);}
    // Wave crests
    if(dist>=2&&dist<=5){const wv=wN(tx*1.2+dist*0.3,ty*1.2);if(wv>0.60)return lerpC(OCEAN_DEPTH[0],[0xE0,0xEC,0xF0],(wv-0.6)*1.5);}
    // Sand in shallows
    if(dist>=1&&dist<=3){const sn=dN(tx*1.5,ty*1.5);if(sn>0.72)return lerpC(OCEAN_DEPTH[0],[0xC8,0xC0,0x98],0.15);}
    const dt=Math.min(1,dist/25);const di=Math.min(OCEAN_DEPTH.length-2,(dt*(OCEAN_DEPTH.length-1))|0);const df=dt*(OCEAN_DEPTH.length-1)-di;
    let c=lerpC(OCEAN_DEPTH[di],OCEAN_DEPTH[di+1],df);
    const wv=(wN(tx,ty)-0.5)*6;const mn=(microN(tx,ty)-0.5)*3;
    c=[clamp(c[0]+wv+mn),clamp(c[1]+wv+mn),clamp(c[2]+wv+mn)];
    const h=0.88+(hs(tx,ty)-1)*0.2;return[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];
  }

  const pal=BIOME_PALETTES[BN[bid]]||BIOME_PALETTES.grassland;
  const cn=cN(tx,ty);const si=Math.min(pal.length-1,(cn*pal.length)|0);
  let c=[...pal[si]];

  // Path
  if(ptM[idx]){
    const pi=(pN(tx*0.5,ty*0.5)*PATH_COLORS.length)|0;
    c=lerpC(c,PATH_COLORS[Math.min(pi,PATH_COLORS.length-1)],0.55);
    let edge=false;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&!ptM[ny*width+nx])edge=true;}
    if(edge)c=[clamp(c[0]-18),clamp(c[1]-18),clamp(c[2]-12)];
  }

  // Micro-texture (fine grain)
  const mn=(microN(tx,ty)-0.5)*10;
  const det=(dN(tx,ty)-0.5)*12;
  c=[clamp(c[0]+det+mn),clamp(c[1]+det+mn),clamp(c[2]+det+mn)];

  // Hillshade
  const h=hs(tx,ty);c=[clamp(c[0]*h),clamp(c[1]*h),clamp(c[2]*h)];

  // Cliff — layered stripes
  if(cliffM[idx]>0){
    const cf=Math.min(0.65,cliffM[idx]*0.18);
    const ci=(tx+ty)%3; // stripe pattern
    const cc=CLIFF_COLORS[ci%CLIFF_COLORS.length];
    c=lerpC(c,cc,cf);
    // Cliff highlight on top edge
    if(ty>0&&cliffM[(ty-1)*width+tx]===0)c=[clamp(c[0]+20),clamp(c[1]+18),clamp(c[2]+15)];
  }

  // Snow
  const e=ev[idx];
  if(e>0.74){const st=Math.min(1,(e-0.74)/0.14);
    const snowC=microN(tx*2,ty*2)>0.5?[0xF2,0xF6,0xFB]:[0xE6,0xEE,0xF4];
    c=lerpC(c,snowC,st*0.8);}

  // Biome blend (smoother)
  const BR=7;let bC=0,bR=0,bG=0,bB=0;
  for(const[dx,dy]of[[-BR,0],[BR,0],[0,-BR],[0,BR],[-BR,-BR],[BR,BR],[BR,-BR],[-BR,BR],[-BR/2|0,-BR],[BR/2|0,BR]]){
    const nx=tx+dx,ny=ty+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
    const nb=bm[ny*width+nx];if(nb!==bid&&nb!==0){const np=BIOME_PALETTES[BN[nb]]||BIOME_PALETTES.grassland;const ns=Math.min(np.length-1,(cn*np.length)|0);bR+=np[ns][0];bG+=np[ns][1];bB+=np[ns][2];bC++;}}
  if(bC>0){const bn=bN(tx,ty);const bs=Math.min(0.45,(bC/10)*0.5)*(0.35+bn*0.65);c=lerpC(c,[bR/bC,bG/bC,bB/bC],bs);}

  // Wet sand
  if(bid===1){let nw=false;for(const[dx,dy]of[[-3,0],[3,0],[0,-3],[0,3]]){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&(bm[ny*width+nx]===0||lkM[ny*width+nx]||rvM[ny*width+nx]>0))nw=true;}if(nw)c=lerpC(c,[0x94,0x82,0x58],0.35);}

  // Clouds
  const cl=clN(tx,ty);if(cl>0.58){const cs=(cl-0.58)/0.42*0.22;c=[clamp(c[0]*(1-cs)),clamp(c[1]*(1-cs)),clamp(c[2]*(1-cs))];}

  return c;
}

// ═══════════════════════════════
// DRAW
// ═══════════════════════════════
function setpx(buf,bw,bh,x,y,r,g,b){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=r;buf[i+1]=g;buf[i+2]=b;}
function blendpx(buf,bw,bh,x,y,r,g,b,a){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=clamp(buf[i]*(1-a)+r*a);buf[i+1]=clamp(buf[i+1]*(1-a)+g*a);buf[i+2]=clamp(buf[i+2]*(1-a)+b*a);}
function shadowpx(buf,bw,bh,x,y,a){if(x<0||x>=bw||y<0||y>=bh)return;const i=(y*bw+x)*3;buf[i]=clamp(buf[i]*a);buf[i+1]=clamp(buf[i+1]*a);buf[i+2]=clamp(buf[i+2]*a);}

function drawOutline(buf,bw,bh,pts,c,dk){const s=new Set(pts.map(([x,y])=>`${x},${y}`));for(const[x,y]of pts)setpx(buf,bw,bh,x,y,...c);for(const[x,y]of pts)for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]])if(!s.has(`${x+dx},${y+dy}`))setpx(buf,bw,bh,x+dx,y+dy,...dk);}

function drawDeco(buf,bw,bh,pcx,pcy,name,tint,szM=1){
  const bcArr=DECO_COLORS[name];if(!bcArr)return;
  const ci=((tint||0)%bcArr.length);
  const bc=bcArr[ci];
  const t=((tint||4)-4)*4;
  const c=[clamp(bc[0]+t),clamp(bc[1]+t),clamp(bc[2]+t)];
  const dk=[clamp(c[0]-45),clamp(c[1]-45),clamp(c[2]-45)];
  const hi=[clamp(c[0]+35),clamp(c[1]+35),clamp(c[2]+35)];

  if(name.includes('tree')){
    const bsz=name.includes('palm')?4:name.includes('oak')?5:6;
    const sz=Math.round(bsz*szM);
    // Soft shadow (graduated)
    for(let dy=-sz;dy<=sz;dy++){const w=sz-Math.abs(dy);for(let dx=-w;dx<=w;dx++){const dist=Math.sqrt(dx*dx+dy*dy)/sz;shadowpx(buf,bw,bh,pcx+dx+2,pcy+dy+2,0.5+dist*0.2);}}
    // Organic canopy: noise-perturbed radius per row
    const pts=[];const cRng=Alea(`${pcx}${pcy}`);
    for(let dy=-sz;dy<=sz-1;dy++){
      const baseW=sz-Math.abs(dy);
      const wobble=((cRng()*2-1)*1.5)|0; // ±1-2 pixel variation
      const w=Math.max(1,baseW+wobble);
      for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy-1]);
    }
    drawOutline(buf,bw,bh,pts,c,dk);
    // Highlight on upper-left quadrant
    for(const[hx,hy]of pts){if(hx<pcx&&hy<pcy-sz/3)setpx(buf,bw,bh,hx,hy,...hi);}
    // Trunk
    const tc=name.includes('palm')?[0x8B,0x6B,0x3D]:[0x5D,0x34,0x0F];
    const tw=sz>5?2:1;
    for(let dy=sz-1;dy<=sz+Math.round(2*szM);dy++)for(let dx=0;dx<tw;dx++){setpx(buf,bw,bh,pcx-dx,pcy+dy,...tc);}
  } else if(name.includes('rock')){
    const br=Math.round((name.includes('large')?4:2)*szM);
    // Irregular shape
    const pts=[];const rRng=Alea(`r${pcx}${pcy}`);
    for(let dy=-br;dy<=br;dy++)for(let dx=-br;dx<=br;dx++){
      const d=Math.sqrt(dx*dx+dy*dy);const wobble=rRng()*1.5;
      if(d<=br+wobble-0.5)pts.push([pcx+dx,pcy+dy]);
    }
    // Shadow
    for(const[px,py]of pts)shadowpx(buf,bw,bh,px+1,py+1,0.55);
    drawOutline(buf,bw,bh,pts,c,dk);
    // Highlight
    for(const[px,py]of pts)if(px<=pcx-br/3&&py<=pcy-br/3)setpx(buf,bw,bh,px,py,...hi);
  } else if(name.includes('flower')){
    // Multiple colors via tint
    const pts=[];for(let dy=-2;dy<=2;dy++){const w=2-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx,pcy,0xFF,0xEB,0x3B);
    // Stem
    setpx(buf,bw,bh,pcx,pcy+3,0x4A,0x80,0x2C);setpx(buf,bw,bh,pcx,pcy+4,0x4A,0x80,0x2C);
  } else if(name.includes('mushroom')){
    const pts=[];for(let dy=-3;dy<=0;dy++){const w=3-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    shadowpx(buf,bw,bh,pcx+1,pcy+2,0.55);shadowpx(buf,bw,bh,pcx+2,pcy+1,0.55);
    drawOutline(buf,bw,bh,pts,c,dk);
    setpx(buf,bw,bh,pcx-1,pcy-2,0xF8,0xF0,0xE0);setpx(buf,bw,bh,pcx+1,pcy-1,0xF8,0xF0,0xE0);
    for(let dy=1;dy<=3;dy++){setpx(buf,bw,bh,pcx,pcy+dy,0xE0,0xD4,0xA8);setpx(buf,bw,bh,pcx-1,pcy+dy,0xE0,0xD4,0xA8);}
  } else if(name.includes('snow')){
    const pts=[];for(let dy=-3;dy<=3;dy++){const w=3-Math.abs(dy);for(let dx=-w;dx<=w;dx++)pts.push([pcx+dx,pcy+dy]);}
    drawOutline(buf,bw,bh,pts,[0xEE,0xF4,0xF8],[0xC8,0xD4,0xE0]);
  } else if(name.includes('cactus')){
    // Thicker, more defined
    for(let dy=-5;dy<=5;dy++){setpx(buf,bw,bh,pcx,pcy+dy,...c);setpx(buf,bw,bh,pcx+1,pcy+dy,...c);setpx(buf,bw,bh,pcx-1,pcy+dy,...dk);}
    for(let dx=1;dx<=3;dx++){setpx(buf,bw,bh,pcx+1+dx,pcy-2,...c);setpx(buf,bw,bh,pcx-dx,pcy+1,...c);}
    setpx(buf,bw,bh,pcx+4,pcy-3,...c);setpx(buf,bw,bh,pcx+4,pcy-4,...c);setpx(buf,bw,bh,pcx-3,pcy,...c);setpx(buf,bw,bh,pcx-3,pcy-1,...c);
    // Cactus highlight
    for(let dy=-4;dy<=4;dy++)setpx(buf,bw,bh,pcx+1,pcy+dy,...hi);
  } else {
    for(let dy=-4;dy<=4;dy++)setpx(buf,bw,bh,pcx,pcy+dy,...c);
    setpx(buf,bw,bh,pcx-1,pcy-2,...c);setpx(buf,bw,bh,pcx+1,pcy+1,...c);
    setpx(buf,bw,bh,pcx-1,pcy+2,...c);
  }
}

// ═══════════════════════════════
// RENDER
// ═══════════════════════════════
const T=16;
const sRng=Alea('s6');
let bX=500,bY=500,bS=0;
for(let i=0;i<1200;i++){const tx=(sRng()*(width-120)+60)|0,ty=(sRng()*(height-80)+40)|0;const biomes=new Set();let oc=0,ld=0,rv=0,lk=0,pt=0;for(let dy=-25;dy<=25;dy+=4)for(let dx=-25;dx<=25;dx+=4){const nx=tx+dx,ny=ty+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height){biomes.add(BN[bm[ny*width+nx]]);if(bm[ny*width+nx]===0)oc++;else ld++;if(rvM[ny*width+nx]>0)rv++;if(lkM[ny*width+nx])lk++;if(ptM[ny*width+nx])pt++;}}const sc=biomes.size*3+(oc>0&&ld>0?12:0)+(rv>3?10:0)+(lk>3?8:0)+(pt>2?4:0);if(sc>bS){bS=sc;bX=tx;bY=ty;}}

const CW=80,CH=50;
const cx=Math.max(0,Math.min(width-CW,bX-CW/2)),cy=Math.max(0,Math.min(height-CH,bY-CH/2));
const iw=CW*T,ih=CH*T;
console.log(`Close-up: ${iw}x${ih} at (${cx},${cy}), score=${bS}`);

const buf=Buffer.alloc(iw*ih*3);

console.log('Terrain...');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){const c=getColor(cx+tx,cy+ty);for(let py=0;py<T;py++)for(let px=0;px<T;px++)setpx(buf,iw,ih,tx*T+px,ty*T+py,...c);}

console.log('Ground cover...');
const tRng=Alea('t6');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){const idx=(cy+ty)*width+(cx+tx);const b=bm[idx];if(b!==2&&b!==3&&b!==7)continue;if(decorations[idx])continue;const gn=gN(cx+tx,cy+ty);if(gn<0.32||tRng()>0.45)continue;const pcx=tx*T+(tRng()*12+2)|0,pcy=ty*T+(tRng()*12+2)|0;const gc=BIOME_PALETTES[BN[b]][b===3?0:Math.min(2,BIOME_PALETTES[BN[b]].length-1)];const shade=b===3?8:-8;blendpx(buf,iw,ih,pcx,pcy,gc[0]+shade,gc[1]+shade+6,gc[2]+shade,0.6);blendpx(buf,iw,ih,pcx,pcy-1,gc[0]+shade,gc[1]+shade+6,gc[2]+shade,0.5);if(tRng()>0.4)blendpx(buf,iw,ih,pcx+1,pcy,gc[0]+shade,gc[1]+shade+6,gc[2]+shade,0.4);}

console.log('Decorations...');
const szRng=Alea('sz6');
for(let ty=0;ty<CH;ty++)for(let tx=0;tx<CW;tx++){const idx=(cy+ty)*width+(cx+tx);const did=decorations[idx];if(!did)continue;const dd=defById.get(did);if(!dd)continue;const szM=0.7+szRng()*0.7;drawDeco(buf,iw,ih,tx*T+T/2,ty*T+T/2,dd.name,decoTints?decoTints[idx]:4,szM);}

writeFileSync('output/world-v6-closeup.png',makePNG(buf,iw,ih));
console.log('Saved close-up');

const sc2=2;const ow=width/sc2|0,oh=height/sc2|0;
console.log(`Overview: ${ow}x${oh}...`);
const ob=Buffer.alloc(ow*oh*3);
for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){const tx=ox*sc2,ty=oy*sc2;let c=getColor(tx,ty);const did=decorations[ty*width+tx];if(did){const dd=defById.get(did);if(dd){const dc=DECO_COLORS[dd.name];if(dc)c=lerpC(c,dc[1]||dc[0],0.2);}}const i=(oy*ow+ox)*3;ob[i]=c[0];ob[i+1]=c[1];ob[i+2]=c[2];}
writeFileSync('output/world-v6-overview.png',makePNG(ob,ow,oh));
console.log('Done!');
