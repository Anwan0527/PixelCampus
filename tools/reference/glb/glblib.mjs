/**
 * 读校园 GLB 模型（参考资料/河北工程大学-校园模型-通用版.glb，不入库）的极简读取器：只取三角面，不做贴图。
 * 模型是 gltfpack 输出（无压缩扩展、无贴图、纯色材质），坐标单位≈米，x 向东、z 向南、y 向上；每栋楼一个顶层节点。
 * 用途与结论见 docs/map/GLB_REFERENCE.md。环境变量 GLB 可指定别的路径。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const P = process.env.GLB ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '参考资料', '河北工程大学-校园模型-通用版.glb');
export const buf=fs.readFileSync(P);
const jl=buf.readUInt32LE(12);
export const j=JSON.parse(buf.toString('utf8',20,20+jl));
const binOff=20+jl+8;
const dv=new DataView(buf.buffer,buf.byteOffset);
export function acc(i){const a=j.accessors[i];const v=j.bufferViews[a.bufferView];const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 const off=binOff+(v.byteOffset||0)+(a.byteOffset||0);const ct=a.componentType;
 const bytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[ct];const st=v.byteStride||bytes*comps;
 const out=ct===5126?new Float32Array(a.count*comps):new Uint32Array(a.count*comps);
 for(let k=0;k<a.count;k++)for(let c=0;c<comps;c++){const o=off+k*st+c*bytes;out[k*comps+c]=ct===5126?dv.getFloat32(o,true):ct===5125?dv.getUint32(o,true):ct===5123?dv.getUint16(o,true):dv.getUint8(o);}
 return out;}
export function mul(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
export function local(n){ if(n.matrix) return n.matrix; const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];
 const [x,y,z,w]=q; const m=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0, 2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0, 2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0, 0,0,0,1];
 for(let i=0;i<3;i++){m[i]*=s[0];m[4+i]*=s[1];m[8+i]*=s[2];} m[12]=t[0];m[13]=t[1];m[14]=t[2]; return m;}
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function rootByName(prefix){return j.scenes[0].nodes.find(r=>(j.nodes[r].name||'').startsWith(prefix));}
// iterate triangles of a root: cb(matName, ax,ay,az,bx,by,bz,cx,cy,cz) world coords (x east, y up, z south)
export function eachTri(root,cb){
 (function walk(i,pm){const n=j.nodes[i];const m=mul(pm,local(n));
  if(n.mesh!=null)for(const p of j.meshes[n.mesh].primitives){const pos=acc(p.attributes.POSITION);const idx=p.indices!=null?acc(p.indices):null;const mn=j.materials[p.material]?.name||'';
   const nv=pos.length/3;const W=new Float32Array(nv*3);
   for(let v=0;v<nv;v++){const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2];W[v*3]=m[0]*x+m[4]*y+m[8]*z+m[12];W[v*3+1]=m[1]*x+m[5]*y+m[9]*z+m[13];W[v*3+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}
   const nt=idx?idx.length/3:nv/3;
   for(let t=0;t<nt;t++){const a=idx?idx[t*3]:t*3,b=idx?idx[t*3+1]:t*3+1,c=idx?idx[t*3+2]:t*3+2;
    cb(mn,W[a*3],W[a*3+1],W[a*3+2],W[b*3],W[b*3+1],W[b*3+2],W[c*3],W[c*3+1],W[c*3+2]);}}
  for(const ch of n.children||[])walk(ch,m);})(root,I);}
// rasterise footprint grid at res metres; returns {x0,z0,res,w,h,g:Uint8Array,top:Float32Array}
export function footprint(root,res=0.5,filter=()=>true){
 const tris=[];let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9;
 eachTri(root,(mn,ax,ay,az,bx,by,bz,cx,cy,cz)=>{if(!filter(mn,ay,by,cy))return;tris.push([ax,ay,az,bx,by,bz,cx,cy,cz]);for(const [x,z] of [[ax,az],[bx,bz],[cx,cz]]){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}});
 const w=Math.ceil((x1-x0)/res)+2,h=Math.ceil((z1-z0)/res)+2;const g=new Uint8Array(w*h),top=new Float32Array(w*h).fill(-9);
 for(const t of tris){const [ax,ay,az,bx,by,bz,cx,cy,cz]=t;const X=[(ax-x0)/res,(bx-x0)/res,(cx-x0)/res],Z=[(az-z0)/res,(bz-z0)/res,(cz-z0)/res];
  const mnx=Math.floor(Math.min(...X)),mxx=Math.ceil(Math.max(...X)),mnz=Math.floor(Math.min(...Z)),mxz=Math.ceil(Math.max(...Z));
  const d=(Z[1]-Z[2])*(X[0]-X[2])+(X[2]-X[1])*(Z[0]-Z[2]);
  for(let z=mnz;z<=mxz;z++)for(let x=mnx;x<=mxx;x++){const px=x+.5,pz=z+.5;let ok;let hh;
   if(Math.abs(d)<1e-9){ok=false}else{const l1=((Z[1]-Z[2])*(px-X[2])+(X[2]-X[1])*(pz-Z[2]))/d,l2=((Z[2]-Z[0])*(px-X[2])+(X[0]-X[2])*(pz-Z[2]))/d,l3=1-l1-l2;ok=l1>=-0.02&&l2>=-0.02&&l3>=-0.02;hh=l1*ay+l2*by+l3*cy;}
   if(!ok)continue;if(x<0||z<0||x>=w||z>=h)continue;g[z*w+x]=1;if(hh>top[z*w+x])top[z*w+x]=hh;}
  // degenerate vertical tris: mark their bbox thin lines
  if(Math.abs(d)<1e-9){}}
 return {x0,z0,res,w,h,g,top};}
export function ascii(fp,step=2){let s='';for(let z=0;z<fp.h;z+=step){let r='';for(let x=0;x<fp.w;x+=step){r+=fp.g[z*fp.w+x]?'#':'.';}s+=r+'\n';}return s;}
