/**
 * 把模型里一个楼群拆成蓝图翼体（2026-11-04 西侧学院楼群用）：点云(蓝图格) → 连通分量 → 对每个分量试几种旋转角，
 * 取"矩形数最少"的 → 贪心矩形拆分。导出：ptsOf（模型根节点 → 蓝图格点云，t=局部对位）、components、wingsForComp。
 * 斜向（如管商楼群 55°）靠旋转候选；圆形（管商圆厅）拆不了，手工用两条十字相交的矩形近似。
 */
import {rootByName,footprint} from './glblib.mjs';
const G=0.5;
export function ptsOf(roots,t,filter=(mn)=>!/铺装/.test(mn)){const pts=[];for(const r of roots){const fp=footprint(rootByName(r),0.5,filter);for(let z=0;z<fp.h;z++)for(let x=0;x<fp.w;x++)if(fp.g[z*fp.w+x])pts.push([t.sx*(fp.x0+(x+.5)*fp.res)+t.bx,t.sy*(fp.z0+(z+.5)*fp.res)+t.by]);}return pts;}
function grid(pts,rot,c){const a=-rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);const rp=pts.map(([x,y])=>{const dx=x-c[0],dy=y-c[1];return [c[0]+dx*ca-dy*sa,c[1]+dx*sa+dy*ca];});
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const [x,y] of rp){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 x0=Math.floor(x0/G)*G-G;y0=Math.floor(y0/G)*G-G;const w=Math.ceil((x1-x0)/G)+2,h=Math.ceil((y1-y0)/G)+2;const cnt=new Float32Array(w*h);
 for(const [x,y] of rp)cnt[Math.floor((y-y0)/G)*w+Math.floor((x-x0)/G)]++;const per=(G/(0.5*0.192))**2;const m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=cnt[i]>=per*0.5?1:0;return {x0,y0,w,h,m,c,rot};}
function open(mk,k=1){const {w,h,m}=mk;const er=new Uint8Array(w*h);for(let y=k;y<h-k;y++)for(let x=k;x<w-k;x++){let ok=1;for(let dy=-k;dy<=k&&ok;dy++)for(let dx=-k;dx<=k;dx++)if(!m[(y+dy)*w+x+dx]){ok=0;break;}er[y*w+x]=ok;}
 const o=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(er[y*w+x])for(let dy=-k;dy<=k;dy++)for(let dx=-k;dx<=k;dx++)o[(y+dy)*w+x+dx]=1;return {...mk,m:o};}
function decompose(mk,minNew=10){const {w,h,m}=mk;const cov=new Uint8Array(w*h);const rects=[];
 for(let it=0;it<30;it++){let best=null;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!m[y*w+x])continue;let maxw=w-x;for(let hh=1;y+hh-1<h;hh++){const row=y+hh-1;let rw=0;while(rw<maxw&&m[row*w+x+rw])rw++;maxw=Math.min(maxw,rw);if(!maxw)break;
  for(let ww=1;ww<=maxw;ww++){let nw=0;for(let yy=y;yy<=row;yy++)for(let xx=x;xx<x+ww;xx++)if(!cov[yy*w+xx])nw++;const area=ww*hh;if(!best||nw>best.nw||(nw===best.nw&&area<best.area))best={x,y,w:ww,h:hh,nw,area};}}}
  if(!best||best.nw<minNew)break;rects.push(best);for(let yy=best.y;yy<best.y+best.h;yy++)for(let xx=best.x;xx<best.x+best.w;xx++)cov[yy*w+xx]=1;}return rects;}
function toWings(mk,rects){return rects.map(r=>{const lx=mk.x0+(r.x+r.w/2)*G,ly=mk.y0+(r.y+r.h/2)*G;const a=mk.rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);const dx=lx-mk.c[0],dy=ly-mk.c[1];const wx=mk.c[0]+dx*ca-dy*sa,wy=mk.c[1]+dx*sa+dy*ca;const w=r.w*G,d=r.h*G;
  const o={x:+(wx-w/2).toFixed(2),y:+(wy-d/2).toFixed(2),w:+w.toFixed(2),d:+d.toFixed(2)};if(mk.rot)o.rot=mk.rot;return o;});}
const clean=ws=>ws.filter(w=>!(Math.min(w.w,w.d)<2&&w.w*w.d<9));
// connected components on cell mask (8-neighbour)
export function components(pts,bbPad=0){const c=[0,0];for(const p of pts){c[0]+=p[0]/pts.length;c[1]+=p[1]/pts.length;}
 let mk=open(grid(pts,0,c),1);const {w,h,m}=mk;const lab=new Int16Array(w*h).fill(-1);let n=0;
 for(let i=0;i<w*h;i++){if(!m[i]||lab[i]>=0)continue;const st=[i];lab[i]=n;while(st.length){const k=st.pop();const x=k%w,y=(k/w)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const kk=yy*w+xx;if(m[kk]&&lab[kk]<0){lab[kk]=n;st.push(kk);}}}n++;}
 const comps=Array.from({length:n},()=>[]);for(const [x,y] of pts){const cx=Math.floor((x-mk.x0)/G),cy=Math.floor((y-mk.y0)/G);const l=lab[cy*w+cx];if(l>=0)comps[l].push([x,y]);}
 return comps.filter(p=>p.length>200);}
export function wingsForComp(pts,rots=[0,45,-45,30,-30,60,-60,15,-15,75,-75],minNew=10){const c=[0,0];for(const p of pts){c[0]+=p[0]/pts.length;c[1]+=p[1]/pts.length;}
 let best=null;for(const rot of rots){const mk=open(grid(pts,rot,c),1);const ws=clean(toWings(mk,decompose(mk,minNew)));const cov=ws.reduce((a,w)=>a+w.w*w.d,0);const score=ws.length+(rot?1.5:0);if(!best||score<best.score-0.01)best={score,rot,ws,mk};}
 return best;}
