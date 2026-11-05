/**
 * 把模型里某栋楼的脚印变成蓝图翼体：模型米 → 蓝图格（局部相似变换 T，缩放 0.192、平移按局部对位）→ 0.5 格(=2.5 m)的栅格
 * → 开运算去掉细毛刺 → 贪心拆成矩形（每次取"新覆盖格最多"的最大矩形）。斜向的楼传 rot（度，顺时针），先转正再拆、拆完转回。
 * 用法：node tools/reference/glb/decomp.mjs c1_A [rot]   （打印字符图和翼体 JSON）
 */
import {rootByName,footprint} from './glblib.mjs';
export const G=0.5; // tile5 per cell (= 2.5 m)
// transform model metres -> tile5
export const T={sx:0.192,sy:0.192,bx:178.1,by:131.5};
export function toTile(mx,mz,t=T){return [t.sx*mx+t.bx,t.sy*mz+t.by];}
// build cell mask for a set of roots, optional rotation (deg, clockwise, about centroid) so rotated blocks become axis aligned
export function buildMask(prefixes,{t=T,rot=0,filter=(mn)=>!/铺装/.test(mn)}={}){
 const fps=prefixes.map(p=>footprint(rootByName(p),0.5,filter));
 // collect tile5 coordinates of covered sample points
 const pts=[];for(const fp of fps)for(let z=0;z<fp.h;z++)for(let x=0;x<fp.w;x++)if(fp.g[z*fp.w+x]){const [tx,ty]=toTile(fp.x0+(x+.5)*fp.res,fp.z0+(z+.5)*fp.res,t);pts.push([tx,ty]);}
 let cx=0,cy=0;for(const p of pts){cx+=p[0];cy+=p[1];}cx/=pts.length;cy/=pts.length;
 const a=-rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
 const rp=pts.map(([x,y])=>{const dx=x-cx,dy=y-cy;return [cx+dx*ca-dy*sa,cy+dx*sa+dy*ca];});
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const [x,y] of rp){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 x0=Math.floor(x0/G)*G-G;y0=Math.floor(y0/G)*G-G;const w=Math.ceil((x1-x0)/G)+2,h=Math.ceil((y1-y0)/G)+2;
 const cnt=new Float32Array(w*h);const per=(G/(0.192*0.5))**2; // samples per cell ~ (G tile5 / (0.5m*0.192))^2
 for(const [x,y] of rp){const xx=Math.floor((x-x0)/G),yy=Math.floor((y-y0)/G);cnt[yy*w+xx]++;}
 const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=cnt[i]>=per*0.5?1:0;
 return {x0,y0,w,h,m,cx,cy,rot};}
export function open(mk,k=1){ // erode then dilate with (2k+1)^2 square
 const {w,h,m}=mk;const er=new Uint8Array(w*h);
 for(let y=k;y<h-k;y++)for(let x=k;x<w-k;x++){let ok=1;for(let dy=-k;dy<=k&&ok;dy++)for(let dx=-k;dx<=k;dx++)if(!m[(y+dy)*w+x+dx]){ok=0;break;}er[y*w+x]=ok;}
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(er[y*w+x])for(let dy=-k;dy<=k;dy++)for(let dx=-k;dx<=k;dx++)out[(y+dy)*w+x+dx]=1;
 return {...mk,m:out};}
export function decompose(mk,minNew=4){
 const {w,h,m}=mk;const cov=new Uint8Array(w*h);const rects=[];
 for(let iter=0;iter<30;iter++){let best=null;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!m[y*w+x])continue;
   let maxw=w-x;
   for(let hh=1;y+hh-1<h;hh++){let row=y+hh-1;
    let rw=0;while(rw<maxw&&m[row*w+x+rw])rw++;maxw=Math.min(maxw,rw);if(maxw===0)break;
    for(let ww=1;ww<=maxw;ww++){let nw=0;for(let yy=y;yy<=row;yy++)for(let xx=x;xx<x+ww;xx++)if(!cov[yy*w+xx])nw++;
     const area=ww*hh;if(!best||nw>best.nw||(nw===best.nw&&area<best.area)){best={x,y,w:ww,h:hh,nw,area};}}}}
  if(!best||best.nw<minNew)break;rects.push(best);
  for(let yy=best.y;yy<best.y+best.h;yy++)for(let xx=best.x;xx<best.x+best.w;xx++)cov[yy*w+xx]=1;}
 return rects;}
export function ascii(mk,rects=[]){let s='';const id=new Int16Array(mk.w*mk.h).fill(-1);rects.forEach((r,i)=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(id[y*mk.w+x]<0)id[y*mk.w+x]=i;});
 for(let y=0;y<mk.h;y++){let r='';for(let x=0;x<mk.w;x++){r+=mk.m[y*mk.w+x]?(id[y*mk.w+x]>=0?String.fromCharCode(65+id[y*mk.w+x]):'#'):'.';}s+=r+'\n';}return s;}
// rects (cell units, in rotated frame) -> blueprint wings in tile5 world coords
export function toWings(mk,rects){return rects.map(r=>{const lx=mk.x0+(r.x+r.w/2)*G,ly=mk.y0+(r.y+r.h/2)*G; // centre in rotated frame
  const a=mk.rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);const dx=lx-mk.cx,dy=ly-mk.cy; // rotate back (clockwise rot) : world = c + R(rot)*d
  const wx=mk.cx+dx*ca-dy*sa,wy=mk.cy+dx*sa+dy*ca;const w=r.w*G,d=r.h*G;
  const o={x:+(wx-w/2).toFixed(2),y:+(wy-d/2).toFixed(2),w:+w.toFixed(2),d:+d.toFixed(2)};if(mk.rot)o.rot=mk.rot;return o;});}
if((process.argv[1]||"").endsWith("decomp.mjs")&&process.argv[2]){const names=process.argv[2].split(',');const rot=+(process.argv[3]||0);let mk=buildMask(names,{rot});mk=open(mk,1);const rs=decompose(mk);console.log(ascii(mk,rs));console.log(JSON.stringify(toWings(mk,rs)));}
