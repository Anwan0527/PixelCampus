/**
 * 对位：在一组"我们的蓝图楼（量自卫星图，已按视差折成脚印）"和"模型里对应的楼"之间搜缩放+平移，使脚印重叠度(IoU)最大。
 * 一、二社区各自拟合的结果一致：缩放 ≈ 0.192 格/模型米（模型整体比真实大约 4%）、IoU ≈ 0.72；用法见 docs/map/GLB_REFERENCE.md。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {rootByName,footprint} from './glblib.mjs';
const D = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'campus', 'buildings') + '/';
const all=[];for(const f of fs.readdirSync(D))all.push(...JSON.parse(fs.readFileSync(D+f)));
const par=(x)=>x>=303?[-0.35,0]:[0.3,-0.15];const G=0.25;
export function oursMask(ids,bb){const [X0,Y0,X1,Y1]=bb;const w=Math.ceil((X1-X0)/G),h=Math.ceil((Y1-Y0)/G);const m=new Uint8Array(w*h);
 for(const id of ids){const b=all.find(b=>b.id===id);for(const wg of b.wings){const f=wg.f??b.f??4;let dx=0,dy=0;if(!b.ground&&!wg.ground){const p=par(wg.x);dx=-p[0]*f;dy=-p[1]*f;}
  const cx=wg.x+wg.w/2+dx,cy=wg.y+wg.d/2+dy;const rot=(wg.rot||0)*Math.PI/180;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const px=X0+(xx+.5)*G-cx,py=Y0+(yy+.5)*G-cy;const u=px*Math.cos(rot)+py*Math.sin(rot),v=-px*Math.sin(rot)+py*Math.cos(rot);if(Math.abs(u)<=wg.w/2&&Math.abs(v)<=wg.d/2)m[yy*w+xx]=1;}}}
 return {m,w,h};}
export function modelPts(prefixes,filter=(mn)=>!/铺装/.test(mn)){const pts=[];for(const pf of prefixes){const fp=footprint(rootByName(pf),1,filter);for(let z=0;z<fp.h;z++)for(let x=0;x<fp.w;x++)if(fp.g[z*fp.w+x])pts.push([fp.x0+x+.5,fp.z0+z+.5]);}return pts;}
function iou(om,pts,sx,sy,bx,by,bb){const [X0,Y0]=bb;const {m,w,h}=om;const mm=new Uint8Array(w*h);
 for(const [mx,mz] of pts){const xx=Math.floor((sx*mx+bx-X0)/G),yy=Math.floor((sy*mz+by-Y0)/G);if(xx<0||yy<0||xx>=w||yy>=h)continue;mm[yy*w+xx]=1;}
 let inter=0,a=0;for(let i=0;i<w*h;i++){if(mm[i]&&m[i])inter++;if(mm[i]||m[i])a++;}return inter/a;}
export function fit(oursIds,modelPrefixes,bb,filter,scales){
 const om=oursMask(oursIds,bb);const pts=modelPts(modelPrefixes,filter);
 const cm=pts.reduce((a,p)=>[a[0]+p[0]/pts.length,a[1]+p[1]/pts.length],[0,0]);
 let oc=[0,0,0];for(let i=0;i<om.m.length;i++)if(om.m[i]){oc[0]+=bb[0]+(i%om.w+.5)*G;oc[1]+=bb[1]+(Math.floor(i/om.w)+.5)*G;oc[2]++;}
 oc=[oc[0]/oc[2],oc[1]/oc[2]];let best={v:0};
 const SS=scales??Array.from({length:7},(_,i)=>0.186+i*0.003);for(const sx of SS)for(const sy of (scales?[sx]:SS)){const bx0=oc[0]-sx*cm[0],by0=oc[1]-sy*cm[1];
  for(let dx=-8;dx<=8;dx+=0.5)for(let dy=-8;dy<=8;dy+=0.5){const v=iou(om,pts,sx,sy,bx0+dx,by0+dy,bb);if(v>best.v)best={v,sx,sy,bx:bx0+dx,by:by0+dy};}}
 // refine
 const b0={...best};for(let dx=-0.5;dx<=0.5;dx+=0.125)for(let dy=-0.5;dy<=0.5;dy+=0.125){const v=iou(om,pts,b0.sx,b0.sy,b0.bx+dx,b0.by+dy,bb);if(v>best.v)best={v,sx:b0.sx,sy:b0.sy,bx:b0.bx+dx,by:b0.by+dy};}
 return best;}
if(false){
 console.log('c1',JSON.stringify(fit(['d1-a','d1-b','d1-c','d1-d','d1-e','d1-f','d1-g','d1-h','d1-bath','d1-mid','canteen-1'],['c1_A','c1_B','c1_C','c1_D','c1_E','canteen1','bath_c1_north','bath_c1_northeast'],[20,55,90,130])));
 console.log('c2',JSON.stringify(fit(['d2-a','d2-b','d2-c','d2-d','d2-e','d2-f','d2-g','d2-h','d2-diag1','d2-diag2','d2-bath','d2-canteen','d2-market'],['c2_A','c2_B','c2_C','c2_D','c2_E','canteen2','bath_c2'],[80,10,155,75])));
 console.log('44',JSON.stringify(fit(['exchange','se-logistics'],['44_international'],[280,210,340,250])));
}
