/**
 * 地图编辑器界面（浏览器里跑，由 tools/editor/server.ts 用 esbuild 打包）。
 * 显示的是"编译好的当前地图"（地面块 + 建筑 + 物件），在上面涂地面、摆/擦物件，结果存成 data/campus/manual.json（手动层）。
 * 单位：编辑器里的坐标都是"原 5 m 格"（u），世界像素 = u × 世界放大倍数 × 16。
 */
import { MANUAL_MATS, MANUAL_TREES, MANUAL_PROPS, BUILDING_STYLES, BUILDING_KINDS, ROOF_TONES, FIELD_KINDS, manualSpriteKey, rowPoints, emptyManual, validateManual, wingFromSpec, simplifyManual, expandField, fenceCells, capsulePoly, type ManualFile, type ManualShape, type ManualBuilding, type ManualWing, type ManualField, type ManualFence } from '../../src/shared/manual';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

interface World {
  tile: number; width: number; height: number; scale?: number; chunk: { px: number; cols: number; rows: number }; chunks: string[];
  buildings: { name: string; wings: { k: string; x: number; y: number; base: number; pg?: number }[] }[];
  objects: { k: string; x: number; y: number; ax: number; ay: number }[];
  pois: { name: string; kind: string; x: number; y: number }[];
  atlases: { buildingPages?: number };
}
type Frame = { x: number; y: number; w: number; h: number };
type Item = { depth: number; k: string; x: number; y: number; src: 'p' | 'b'; pg: number; bid?: string };

let W!: World; let S = 2; let U = 32;
let propsImg!: HTMLImageElement; let propsFrames: Record<string, Frame> = {};
let bImgs: HTMLImageElement[] = []; let bFrames: Record<string, Frame>[] = [];
let items: Item[] = [];
const anchors = new Map<string, { ax: number; ay: number }>();
let ver = 0; let season = 'summer'; // ver：地图生成时间。网址里不带它——缓存靠服务端的 ETag（内容没变就 304，不重新下载）
const chunkImgs = new Map<string, HTMLImageElement | null>();
/** 建筑：基线 = 编译导出的当前建筑（原 5 m 格脚印）；bSprites = 每栋每段翼体的精灵范围（世界像素），用来点选 */
let baseB: ManualBuilding[] = [];
let interiorList: { id: string; name: string; open?: boolean }[] = []; // 可以给建筑选的室内（data/interiors）
const bSprites = new Map<string, { i: number; x: number; y: number; w: number; h: number }[]>();

let man: ManualFile = emptyManual();
let undoStack: string[] = []; let redoStack: string[] = []; let savedJson = '';
const view = { x: 0, y: 0, z: 0.6 };
type Tool = 'select' | 'rect' | 'ellipse' | 'road' | 'stroke' | 'poly' | 'field' | 'fence' | 'object' | 'row' | 'erase' | 'building' | 'newb' | 'door';
let tool: Tool = 'select';
let mat = 'lawn'; let objK = 'oakS'; let roadW = 3; let snap = 0.5; let rowGap = 3; let eraseWhat: 'all' | 'trees' | 'props' = 'all';
const layers = { ground: true, buildings: true, objects: true, grid: true, manual: true, bp: true };
// 折线路 / 运动场 / 围栏的工具设置
let strokeFlat = true; let strokeMark = ''; let angStroke = 15; let angFence = 90;
let fieldKind = 'soccer'; let fieldFence = true; let fieldGate: 'N' | 'S' | 'E' | 'W' = 'S'; let fieldLights = true;
let fenceWall = false; let fencePiers = 4; let fenceForce = false;
let eraseBp = false; // 擦除时连带去掉框内的蓝图图形
type Sel = { t: 'shape' | 'object' | 'row' | 'erase' | 'field' | 'fence' | 'bp'; id: string } | { t: 'baked'; idx: number } | { t: 'building'; id: string; wing: number } | null;
let sel: Sel = null;
let cursor: [number, number] = [0, 0]; let cursorRaw: [number, number] = [0, 0]; let mouseIn = false;
let drawing: { a?: [number, number]; pts: [number, number][] } | null = null;
let drag: null | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'move'; start: [number, number]; orig: string; moved: boolean } | { kind: 'handle'; i: number; orig: string; moved: boolean } | { kind: 'vertex'; i: number; orig: string; moved: boolean } | { kind: 'baked'; idx: number; start: [number, number]; moved: boolean } | { kind: 'bmove'; id: string; wing: number; start: [number, number]; orig: string; ow: ManualWing[]; shift: boolean; moved: boolean } | { kind: 'bhandle'; id: string; wing: number; i: number; orig: string; moved: boolean } | { kind: 'dmove'; id: string; wing: number; orig: string; moved: boolean } = null;
let rot = 0; // 视角旋转（弧度）：整张画布绕中心转，鼠标坐标先反转回去再用
const multi = new Set<string>(); // 建筑多选（Ctrl/⌘+点击），用来一键融合
let spaceDown = false; let dirty = true; let building = false; let stale = false; let bakedM0 = -1; // stale：部署后并入了新的基础地图，这个页面里的东西已经过期，必须刷新
let nid = 0; const newId = (p: string) => `${p}${Date.now().toString(36)}${(nid++).toString(36)}`;

// ---------------------------------------------------------------- 坐标
const toS = (ux: number, uy: number): [number, number] => [(ux * U - view.x) * view.z, (uy * U - view.y) * view.z];
const toU = (sx: number, sy: number): [number, number] => [(sx / view.z + view.x) / U, (sy / view.z + view.y) / U];
const unrot = (px: number, py: number): [number, number] => { // 画布像素（旋转后）→ 旋转前的屏幕坐标
  if (!rot) return [px, py];
  const cx = cv.width / devicePixelRatio / 2, cy = cv.height / devicePixelRatio / 2, c = Math.cos(-rot), s = Math.sin(-rot), dx = px - cx, dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};
const rotVec = (dx: number, dy: number): [number, number] => { const c = Math.cos(-rot), s = Math.sin(-rot); return [dx * c - dy * s, dx * s + dy * c]; };
function setRot(a: number) { rot = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (rot < 1e-9 || rot > 2 * Math.PI - 1e-9) rot = 0; $('rotv').textContent = rot ? `${Math.round((rot * 180) / Math.PI)}°` : ''; dirty = true; }
const snapV = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v);
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const matColor = (m: string) => MANUAL_MATS.find((x) => x.mat === m)?.color ?? '#f0f';

// ---------------------------------------------------------------- 载入
const loadImg = (url: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(url)); i.src = url; });
const getJson = async (url: string) => (await fetch(url)).json();

async function loadWorld() {
  W = await getJson(`/gen/world.json`);
  S = W.scale ?? 1; U = S * W.tile;
  const pf = await getJson(`/gen/atlas-props.json`);
  propsFrames = Object.fromEntries(Object.entries(pf.frames as Record<string, { frame: Frame }>).map(([k, v]) => [k, v.frame]));
  propsImg = await loadImg(`/gen/${await atlasName()}`);
  bImgs = []; bFrames = [];
  for (let i = 0; i < (W.atlases.buildingPages ?? 1); i++) {
    const j = await getJson(`/gen/atlas-buildings-${i}.json`);
    bFrames.push(Object.fromEntries(Object.entries(j.frames as Record<string, { frame: Frame }>).map(([k, v]) => [k, v.frame])));
    bImgs.push(await loadImg(`/gen/atlas-buildings-${i}.png`));
  }
  try {
    const bj = await getJson('/api/buildings');
    baseB = (bj.buildings as any[]).map((b) => ({ id: b.id, name: b.name, kind: b.kind, ...(b.interior ? { interior: b.interior } : {}), ...(b.sign ? { sign: b.sign } : {}), ...(b.desc ? { desc: b.desc } : {}), ...(b.fixed ? { fixed: true } : {}), wings: b.wings.map((g: any) => wingFromSpec(g, bj.scale, b.fixed)) }));
  } catch { baseB = []; }
  try { interiorList = ((await getJson('/api/interiors')).interiors as any[]).map((s) => ({ id: s.id, name: s.name, open: s.open })); } catch { interiorList = []; }
  try { const bp = await getJson('/api/blueprint'); bpData = bp.items as BpItem[]; bpById.clear(); for (const it of bpData) bpById.set(it.id, it); } catch { bpData = []; bpById.clear(); }
  anchors.clear();
  for (const o of W.objects) if (!anchors.has(o.k)) anchors.set(o.k, { ax: o.ax, ay: o.ay });
  items = [];
  for (const o of W.objects) if (propsFrames[o.k]) items.push({ depth: o.y, k: o.k, x: o.x - o.ax, y: o.y - o.ay, src: 'p', pg: 0 });
  bSprites.clear();
  for (const b of W.buildings) b.wings.forEach((w, i) => {
    const pg = w.pg ?? 0, f = bFrames[pg]?.[w.k]; if (!f) return;
    const m = /^b_(.+)_(\d+)_(\d+)$/.exec(w.k), bid = m?.[1];
    items.push({ depth: w.base + i * 0.01, k: w.k, x: w.x, y: w.y, src: 'b', pg, bid });
    if (bid) { const l = bSprites.get(bid) ?? []; l.push({ i: Number(m![2]), x: w.x, y: w.y, w: f.w, h: f.h }); bSprites.set(bid, l); }
  });
  items.sort((a, b) => a.depth - b.depth);
  chunkImgs.clear(); chunkPending.length = 0; baseRev++; preloadAllChunks();
  loadImg(`/gen/minimap.png`).then((im) => { miniImg = im; baseRev++; dirty = true; }).catch(() => { miniImg = null; });
}
async function atlasName() { try { await loadImg(`/gen/atlas-props-${season}.png`); return `atlas-props-${season}.png`; } catch { return 'atlas-props.png'; } }

/**
 * 地面块按"离屏幕中心近的先加载"排队，同时最多 6 张；没加载好的地方先垫一张整图缩略（minimap.png），不再是大片黑色。
 */
let miniImg: HTMLImageElement | null = null;
const chunkPending: [number, number, string][] = []; let chunkLoading = 0; let baseRev = 0;
function chunk(cx: number, cy: number) {
  const key = `${season}/${cx}_${cy}`;
  if (chunkImgs.has(key)) return chunkImgs.get(key);
  chunkImgs.set(key, null);
  if (!W.chunks.includes(`${cx}_${cy}`)) return null;
  chunkPending.push([cx, cy, key]); pumpChunks();
  return null;
}
function pumpChunks() {
  while (chunkLoading < 6 && chunkPending.length) {
    const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio, px = W.chunk.px;
    const mx = view.x + w / 2 / view.z, my = view.y + h / 2 / view.z; let bi = 0, bd = Infinity;
    chunkPending.forEach(([cx, cy], i) => { const d = Math.hypot((cx + 0.5) * px - mx, (cy + 0.5) * px - my); if (d < bd) { bd = d; bi = i; } });
    const [cx, cy, key] = chunkPending.splice(bi, 1)[0];
    if (!key.startsWith(`${season}/`)) continue; // 季节已经换了，这张不要了
    chunkLoading++;
    const im = new Image();
    const ready = () => { chunkImgs.set(key, im); baseRev++; dirty = true; chunkProgress(); };
    im.onload = () => { // 下载完就让出名额继续下载；解码在后台做（页面在后台时解码可能不动，最多等 1.5 秒），解码好了再用，平移时不会卡
      chunkLoading--; pumpChunks();
      void Promise.race([im.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]).then(ready);
    };
    im.onerror = () => { chunkLoading--; pumpChunks(); };
    im.src = `/gen/ground/${season}/c_${cx}_${cy}.png`;
  }
}
/** 一打开就把整张地图的地面块全部排队加载（离屏幕近的先来），状态栏显示进度；之后平移、缩放都是现成的，不再有模糊的占位图 */
function preloadAllChunks() {
  for (const id of W.chunks) { const [cx, cy] = id.split('_').map(Number); chunk(cx, cy); }
  chunkProgress();
}
function chunkProgress() {
  const total = W.chunks.length; let n = 0;
  for (const id of W.chunks) if (chunkImgs.get(`${season}/${id}`)) n++;
  const st = $('status'); if (!st) return;
  if (!building) st.textContent = n < total ? `地面载入中 ${n}/${total}…` : '';
}

// ---------------------------------------------------------------- 蓝图条目（运动场地面/白线、围栏围墙、道路…）：可以去掉，或者原位修改
/** 编译时导出的蓝图条目（原 5 m 格坐标）。手动层里 bp.hide = 去掉，bp.edit[id] = 原位替换（保持原来的盖住/被盖顺序） */
type BpItem = { id: string; cat: string; e: any };
let bpData: BpItem[] = []; const bpById = new Map<string, BpItem>();
const BP_CATS: [string, string, string][] = [['sports', '运动场地', '#6fe0ff'], ['fence', '围栏围墙', '#ffc060'], ['road', '道路', '#a8a8ff'], ['plaza', '广场铺装', '#d8a8ff'], ['green', '绿地', '#90e090']];
const bpCats: Record<string, boolean> = { sports: true, fence: true, road: false, plaza: false, green: false };
const bpState = () => (man.bp ??= { hide: [], edit: {} });
const bpHidden = (id: string) => !!man.bp?.hide.includes(id);
const bpCur = (m: ManualFile, id: string): any => m.bp?.edit?.[id] ?? bpById.get(id)?.e;
const bpIsArea = (e: any) => ['rect', 'ellipse', 'capsule', 'poly'].includes(e.kind);
function ensureBpEdit(id: string): any { const st = bpState(); if (!st.edit[id]) st.edit[id] = JSON.parse(JSON.stringify(bpById.get(id)!.e)); st.hide = st.hide.filter((h) => h !== id); return st.edit[id]; }
function bpPath(e: any) {
  if (e.kind === 'capsule') { polyPath(capsulePoly(e.cx - e.rx, e.cy - e.ry, 2 * e.rx, 2 * e.ry)); ctx.closePath(); }
  else if (e.kind === 'fence' || e.kind === 'prop') polyPath(e.pts);
  else shapePath(e);
}
function bpBox(e: any): [number, number, number, number] {
  if (e.kind === 'rect') return [e.x, e.y, e.x + e.w, e.y + e.h];
  if (e.kind === 'ellipse' || e.kind === 'capsule') return [e.cx - e.rx, e.cy - e.ry, e.cx + e.rx, e.cy + e.ry];
  const xs = e.pts.map((p: number[]) => p[0]), ys = e.pts.map((p: number[]) => p[1]), pad = e.kind === 'stroke' ? e.w / 2 : 0;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}
function drawFenceCells(pts: [number, number][], piers: number, wall: boolean, alpha = 1) {
  for (const c of fenceCells(pts.map(([x, y]) => [x * S, y * S] as [number, number]), piers, wall, true)) for (const it of c.items) drawSprite(it.k, it.x * W.tile, it.y * W.tile, alpha);
}
function drawShapeFill(s: any, alpha = 0.55) {
  bpPath(s); ctx.globalAlpha = alpha;
  if (s.kind === 'stroke') { ctx.strokeStyle = matColor(s.mat); ctx.lineWidth = s.w * U * view.z; ctx.lineCap = s.flat ? 'butt' : 'round'; ctx.lineJoin = 'round'; ctx.stroke(); } else { ctx.fillStyle = matColor(s.mat); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineWidth = 1.5;
}
function drawFieldGraphics(f: ManualField, alpha = 0.6) {
  const ex = expandField(f);
  for (const sh of ex.shapes) drawShapeFill(sh, alpha);
  for (const o of ex.objects) if (!drawSprite(manualSpriteKey(o.k, o.x, o.y), o.x * U, o.y * U, Math.min(1, alpha + 0.3))) dot(o.x, o.y);
  for (const fe of ex.fences) drawFenceCells(fe.pts, fe.piers ?? 4, !!fe.wall, Math.min(1, alpha + 0.3));
}
function drawBp() {
  if (!layers.bp || !bpData.length) return;
  for (const it of bpData) {
    if (!bpCats[it.cat]) continue;
    const col = BP_CATS.find((c) => c[0] === it.cat)![2], ed: any = man.bp?.edit?.[it.id], hid = bpHidden(it.id);
    ctx.lineWidth = 1;
    if (ed) {
      ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(210,210,210,.5)'; bpPath(it.e); ctx.stroke(); ctx.setLineDash([]); // 原来的位置
      if (ed.kind === 'fence') { drawFenceCells(ed.pts, ed.piers ?? 4, !!ed.wall, 0.8); ctx.strokeStyle = col; polyPath(ed.pts); ctx.stroke(); }
      else if (ed.kind === 'prop') { for (const [x, y] of rowPoints(ed.pts, ed.spacing)) drawSprite(manualSpriteKey(ed.prop, x, y), x * U, y * U, 0.8); ctx.strokeStyle = col; polyPath(ed.pts); ctx.stroke(); }
      else { drawShapeFill(ed); ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 3]); bpPath(ed); ctx.stroke(); ctx.setLineDash([]); }
    } else if (hid) {
      ctx.setLineDash([5, 3]); ctx.strokeStyle = '#e0564a'; bpPath(it.e); if (bpIsArea(it.e)) { ctx.fillStyle = 'rgba(224,86,74,.2)'; ctx.fill(); } ctx.stroke(); ctx.setLineDash([]);
    } else { ctx.strokeStyle = col + 'bb'; bpPath(it.e); ctx.stroke(); }
  }
}
function hitBp(u: [number, number]): string | null {
  if (!layers.bp) return null;
  const tol = 9 / (view.z * U), [x, y] = u; let best: string | null = null, ba = Infinity;
  for (let i = bpData.length - 1; i >= 0; i--) {
    const it = bpData[i]; if (!bpCats[it.cat]) continue;
    const e = man.bp?.edit?.[it.id] ?? it.e; let hit = false, area = 0;
    if (e.kind === 'rect') { hit = x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h; area = e.w * e.h; }
    else if (e.kind === 'ellipse') { hit = ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1; area = Math.PI * e.rx * e.ry; }
    else if (e.kind === 'capsule') { hit = inPoly(x, y, capsulePoly(e.cx - e.rx, e.cy - e.ry, 2 * e.rx, 2 * e.ry)); area = 4 * e.rx * e.ry; }
    else if (e.kind === 'poly') { hit = inPoly(x, y, e.pts); const b = bpBox(e); area = (b[2] - b[0]) * (b[3] - b[1]); }
    else { const w = e.kind === 'stroke' ? Math.max(e.w / 2, tol) : tol; let len = 0; for (let k = 0; k + 1 < e.pts.length; k++) { if (distSeg(x, y, e.pts[k], e.pts[k + 1]) <= w) hit = true; len += Math.hypot(e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]); } area = e.kind === 'stroke' ? len * e.w : 0; }
    if (hit && area < ba) { ba = area; best = it.id; }
  }
  return best;
}
/** 擦除框里连带去掉蓝图图形：外接矩形整个落在框里、且这一类蓝图当前显示着的才去掉 */
function hideBpInside(r: [number, number, number, number]): number {
  let n = 0; const st = bpState();
  for (const it of bpData) {
    if (!bpCats[it.cat] || st.hide.includes(it.id)) continue;
    const b = bpBox(st.edit[it.id] ?? it.e);
    if (b[0] >= r[0] - 0.05 && b[1] >= r[1] - 0.05 && b[2] <= r[0] + r[2] + 0.05 && b[3] <= r[1] + r[3] + 0.05) { st.hide.push(it.id); delete st.edit[it.id]; n++; }
  }
  return n;
}

// ---------------------------------------------------------------- 绘制
function resize() { const r = cv.parentElement!.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; dirty = true; }
const spriteFrame = (k: string) => propsFrames[k];
function drawSprite(key: string, fx: number, fy: number, alpha = 1) { // fx,fy = 脚点（世界像素）
  const f = spriteFrame(key); if (!f) return false;
  const a = anchors.get(key) ?? { ax: f.w / 2, ay: f.h };
  const [sx, sy] = [(fx - a.ax - view.x) * view.z, (fy - a.ay - view.y) * view.z];
  ctx.globalAlpha = alpha; ctx.drawImage(propsImg, f.x, f.y, f.w, f.h, sx, sy, f.w * view.z, f.h * view.z); ctx.globalAlpha = 1;
  return true;
}
function polyPath(pts: [number, number][]) { ctx.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = toS(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); }
function shapePath(s: ManualShape) {
  ctx.beginPath();
  if (s.kind === 'rect') { const [a, b] = toS(s.x, s.y), [c, d] = toS(s.x + s.w, s.y + s.h); ctx.rect(a, b, c - a, d - b); }
  else if (s.kind === 'ellipse') { const [a, b] = toS(s.cx, s.cy); ctx.ellipse(a, b, s.rx * U * view.z, s.ry * U * view.z, 0, 0, Math.PI * 2); }
  else if (s.kind === 'poly') { polyPath(s.pts); ctx.closePath(); }
  else { polyPath(s.pts); }
}
function bboxOf(t: 'rect' | 'ellipse' | 'erase', o: any): [number, number, number, number] {
  if (t === 'rect') return [o.x, o.y, o.x + o.w, o.y + o.h];
  if (t === 'erase') return [o.rect[0], o.rect[1], o.rect[0] + o.rect[2], o.rect[1] + o.rect[3]];
  return [o.cx - o.rx, o.cy - o.ry, o.cx + o.rx, o.cy + o.ry];
}

let editedIds = new Set<string>();
/** 底图（地面 + 物件 + 建筑）画在离屏画布上，只有视角/图层/载入进度变了才重画；鼠标移动、选中等只重画上面的叠加层 */
const baseCv = document.createElement('canvas'); const bctx = baseCv.getContext('2d')!; let baseSig = '';
function renderBase(w: number, h: number, ex: number, ey: number) {
  if (baseCv.width !== cv.width || baseCv.height !== cv.height) { baseCv.width = cv.width; baseCv.height = cv.height; }
  const c = bctx; c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  c.fillStyle = '#16191a'; c.fillRect(0, 0, w, h);
  c.save(); c.translate(w / 2, h / 2); c.rotate(rot); c.translate(-w / 2, -h / 2);
  c.imageSmoothingEnabled = rot !== 0; // 转着的时候让图像平滑一点，别太锯齿
  const wx0 = view.x - ex / view.z, wy0 = view.y - ey / view.z, wx1 = view.x + (w + ex) / view.z, wy1 = view.y + (h + ey) / view.z;
  if (layers.ground) {
    if (miniImg) { c.imageSmoothingEnabled = true; const k = (W.tile / 3) * view.z; c.drawImage(miniImg, -view.x * view.z, -view.y * view.z, miniImg.width * k, miniImg.height * k); c.imageSmoothingEnabled = rot !== 0; }
    const px = W.chunk.px;
    for (let cy = Math.max(0, Math.floor(wy0 / px)); cy <= Math.min(W.chunk.rows - 1, Math.floor(wy1 / px)); cy++)
      for (let cx = Math.max(0, Math.floor(wx0 / px)); cx <= Math.min(W.chunk.cols - 1, Math.floor(wx1 / px)); cx++) {
        const im = chunk(cx, cy); if (im) c.drawImage(im, (cx * px - view.x) * view.z, (cy * px - view.y) * view.z, im.width * view.z, im.height * view.z);
      }
  }
  for (const it of items) {
    if (it.src === 'p' ? !layers.objects : (!layers.buildings || (it.bid && editedIds.has(it.bid)))) continue;
    const f = it.src === 'p' ? propsFrames[it.k] : bFrames[it.pg][it.k];
    if (it.x > wx1 || it.y > wy1 || it.x + f.w < wx0 || it.y + f.h < wy0) continue;
    c.drawImage(it.src === 'p' ? propsImg : bImgs[it.pg], f.x, f.y, f.w, f.h, (it.x - view.x) * view.z, (it.y - view.y) * view.z, f.w * view.z, f.h * view.z);
  }
  c.restore();
}
function draw() {
  const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio;
  if (!cv.width || !cv.height) { dirty = true; return; } // 画布还没有尺寸（窗口在后台/刚创建），下一帧再来
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#16191a'; ctx.fillRect(0, 0, w, h);
  if (!W) return;
  editedIds = dirtyBuildingIds();
  const D = Math.hypot(w, h), ex = rot ? (D - w) / 2 : 0, ey = rot ? (D - h) / 2 : 0; // 转着时画布四角会露出更大的范围；不转时就是画布本身（之前这里不转时算成了负数，只画了中间一小块，其余地方只剩模糊的缩略图）
  const sig = `${view.x}|${view.y}|${view.z}|${rot}|${cv.width}x${cv.height}|${+layers.ground}${+layers.objects}${+layers.buildings}|${[...editedIds].sort().join(',')}|${baseRev}`;
  if (sig !== baseSig) { baseSig = sig; renderBase(w, h, ex, ey); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(baseCv, 0, 0); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  ctx.imageSmoothingEnabled = rot !== 0;
  if (layers.grid) drawGrid(w, h, ex, ey);
  drawBp();
  if (layers.manual) drawManual();
  drawBuildings();
  drawDoors();
  drawTool();
  if (sel) drawSelection();
  ctx.restore();
}
function drawGrid(w: number, h: number, ex = 0, ey = 0) {
  const step = U * view.z; if (step < 5) return;
  const [u0, v0] = toU(-ex, -ey), [u1, v1] = toU(w + ex, h + ey);
  ctx.lineWidth = 1;
  const lines = (every: number, color: string) => {
    ctx.strokeStyle = color; ctx.beginPath();
    for (let u = Math.floor(u0 / every) * every; u <= u1; u += every) { const x = Math.round(toS(u, 0)[0]) + 0.5; ctx.moveTo(x, -ey); ctx.lineTo(x, h + ey); }
    for (let v = Math.floor(v0 / every) * every; v <= v1; v += every) { const y = Math.round(toS(0, v)[1]) + 0.5; ctx.moveTo(-ex, y); ctx.lineTo(w + ex, y); }
    ctx.stroke();
  };
  if (step >= 22) lines(0.5, 'rgba(255,255,255,.07)');
  lines(1, 'rgba(255,255,255,.14)');
  if (step >= 5) lines(10, 'rgba(255,220,120,.28)');
}
function drawManual() {
  for (const s of man.shapes) {
    shapePath(s);
    ctx.globalAlpha = 0.55; ctx.fillStyle = matColor(s.mat);
    if (s.kind === 'stroke') { ctx.strokeStyle = matColor(s.mat); ctx.lineWidth = s.w * U * view.z; ctx.lineCap = s.flat ? 'butt' : 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineCap = 'butt'; } else ctx.fill();
    ctx.globalAlpha = 1; ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; shapePath(s); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const e of man.erase) {
    const [a, b] = toS(e.rect[0], e.rect[1]), [c, d] = toS(e.rect[0] + e.rect[2], e.rect[1] + e.rect[3]);
    ctx.fillStyle = 'rgba(224,86,74,.28)'; ctx.fillRect(a, b, c - a, d - b);
    ctx.strokeStyle = '#e0564a'; ctx.setLineDash([5, 3]); ctx.strokeRect(a + 0.5, b + 0.5, c - a, d - b); ctx.setLineDash([]);
    text(`擦除·${{ all: '全部', trees: '树', props: '小品' }[e.what]}`, a + 3, b + 12, '#ffb0a8');
  }
  for (const r of man.rows) {
    ctx.strokeStyle = 'rgba(240,192,64,.5)'; ctx.setLineDash([3, 4]); polyPath(r.pts); ctx.stroke(); ctx.setLineDash([]);
    for (const [x, y] of rowPoints(r.pts, r.spacing)) if (!drawSprite(manualSpriteKey(r.k, x, y), x * U, y * U)) dot(x, y);
  }
  for (const o of man.objects) if (!drawSprite(manualSpriteKey(o.k, o.x, o.y), o.x * U, o.y * U)) dot(o.x, o.y);
  for (const f of man.fences ?? []) { drawFenceCells(f.pts, f.piers ?? 4, !!f.wall); ctx.strokeStyle = 'rgba(255,192,96,.6)'; ctx.setLineDash([3, 4]); polyPath(f.pts); ctx.stroke(); ctx.setLineDash([]); }
  for (const f of man.fields ?? []) {
    drawFieldGraphics(f);
    const [a, b] = toS(f.x, f.y), [c, d] = toS(f.x + f.w, f.y + f.h);
    ctx.strokeStyle = 'rgba(111,224,255,.9)'; ctx.setLineDash([6, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(a, b, c - a, d - b); ctx.setLineDash([]);
    text(FIELD_KINDS.find((k) => k.k === f.kind)?.name ?? f.kind, a + 4, b + 14, '#bfefff', '12px sans-serif');
  }
}
function dot(x: number, y: number) { const [sx, sy] = toS(x, y); ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); }
function drawTool() {
  if (!mouseIn) return;
  const [cx, cy] = cursor;
  ctx.strokeStyle = 'rgba(240,192,64,.9)'; ctx.fillStyle = 'rgba(240,192,64,.18)'; ctx.lineWidth = 1.5;
  if (drawing?.a && (tool === 'rect' || tool === 'ellipse' || tool === 'erase' || tool === 'newb')) {
    const [ax, ay] = drawing.a, x0 = Math.min(ax, cx), y0 = Math.min(ay, cy), x1 = Math.max(ax, cx), y1 = Math.max(ay, cy);
    const [a, b] = toS(x0, y0), [c, d] = toS(x1, y1);
    ctx.fillStyle = tool === 'erase' ? 'rgba(224,86,74,.3)' : tool === 'newb' ? 'rgba(170,85,60,.6)' : matColor(mat) + '99'; ctx.beginPath();
    if (tool === 'ellipse') ctx.ellipse((a + c) / 2, (b + d) / 2, (c - a) / 2, (d - b) / 2, 0, 0, 7); else ctx.rect(a, b, c - a, d - b);
    ctx.fill(); ctx.stroke();
    label(`${r2(x1 - x0)} × ${r2(y1 - y0)}`, c + 6, d + 14);
  } else if (drawing?.a && tool === 'road') {
    const r = roadRect(drawing.a, cursor); const [a, b] = toS(r[0], r[1]), [c, d] = toS(r[0] + r[2], r[1] + r[3]);
    ctx.fillStyle = matColor(mat) + '99'; ctx.fillRect(a, b, c - a, d - b); ctx.strokeRect(a, b, c - a, d - b); label(`${r2(r[2])} × ${r2(r[3])}`, c + 6, d + 14);
  } else if (tool === 'poly' && drawing) {
    ctx.fillStyle = matColor(mat) + '66'; polyPath([...drawing.pts, cursor]); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const [x, y] of drawing.pts) dot(x, y);
  } else if (tool === 'stroke' && drawing) {
    const pts = [...drawing.pts, cursor]; drawShapeFill({ kind: 'stroke', mat, w: roadW, pts, flat: strokeFlat }, 0.6); ctx.strokeStyle = 'rgba(240,192,64,.9)'; polyPath(pts); ctx.stroke();
    for (const [x, y] of drawing.pts) dot(x, y);
    const l = drawing.pts[drawing.pts.length - 1]; if (l) { const ang = (Math.atan2(cursor[1] - l[1], cursor[0] - l[0]) * 180) / Math.PI; label(`${r2(Math.hypot(cursor[0] - l[0], cursor[1] - l[1]))} 格 · ${Math.round(((ang % 360) + 360) % 360)}°`, toS(cursor[0], cursor[1])[0] + 8, toS(cursor[0], cursor[1])[1] + 16); }
  } else if (tool === 'fence' && drawing) {
    const pts = [...drawing.pts, cursor]; if (pts.length > 1) drawFenceCells(pts, fencePiers, fenceWall, 0.75);
    ctx.strokeStyle = 'rgba(255,192,96,.9)'; polyPath(pts); ctx.stroke(); for (const [x, y] of drawing.pts) dot(x, y);
  } else if (tool === 'field' && drawing?.a) {
    const [ax, ay] = drawing.a, f = { id: '', kind: fieldKind, x: Math.min(ax, cx), y: Math.min(ay, cy), w: Math.abs(cx - ax), h: Math.abs(cy - ay), fence: fieldFence, gate: fieldGate, lights: fieldLights } as ManualField;
    if (f.w >= 3 && f.h >= 3) drawFieldGraphics(f, 0.5);
    const [a, b] = toS(f.x, f.y), [c, d] = toS(f.x + f.w, f.y + f.h); ctx.strokeRect(a, b, c - a, d - b); label(`${r2(f.w)} × ${r2(f.h)}`, c + 6, d + 14);
  } else if (tool === 'row' && drawing?.a) {
    const pts: [number, number][] = [drawing.a, cursor];
    ctx.setLineDash([4, 3]); polyPath(pts); ctx.stroke(); ctx.setLineDash([]);
    for (const [x, y] of rowPoints(pts, rowGap)) if (!drawSprite(manualSpriteKey(objK, x, y), x * U, y * U, 0.7)) dot(x, y);
  } else if (tool === 'object' || (tool === 'row' && !drawing)) {
    if (!drawSprite(manualSpriteKey(objK, cx, cy), cx * U, cy * U, 0.7)) dot(cx, cy);
  } else if (tool === 'rect' || tool === 'ellipse' || tool === 'erase' || tool === 'road' || tool === 'newb' || tool === 'stroke' || tool === 'fence' || tool === 'poly' || tool === 'field') {
    const [sx, sy] = toS(cx, cy); ctx.beginPath(); ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy); ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8); ctx.stroke();
  }
}
function label(t: string, x: number, y: number) { ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); ctx.font = '12px sans-serif'; const w = ctx.measureText(t).width + 8; ctx.fillStyle = '#000b'; ctx.fillRect(-4, -12, w, 16); ctx.fillStyle = '#fff'; ctx.fillText(t, 0, 0); ctx.restore(); }
function text(t: string, x: number, y: number, color: string, font = '11px sans-serif') { ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); ctx.font = font; ctx.fillStyle = color; ctx.fillText(t, 0, 0); ctx.restore(); }
function roadRect(a: [number, number], b: [number, number]): [number, number, number, number] {
  const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
  return dx >= dy ? [Math.min(a[0], b[0]), snapV(a[1] - roadW / 2), Math.max(dx, snap || 0.1), roadW] : [snapV(a[0] - roadW / 2), Math.min(a[1], b[1]), roadW, Math.max(dy, snap || 0.1)];
}

// ---------------------------------------------------------------- 选中
function findSel(write = false): any {
  if (!sel || sel.t === 'baked' || sel.t === 'building') return null;
  if (sel.t === 'bp') return write ? ensureBpEdit(sel.id) : bpCur(man, sel.id) ?? null; // 蓝图条目：写的时候才生成"修改"，只是点选不算改动
  const list: any[] = sel.t === 'shape' ? man.shapes : sel.t === 'object' ? man.objects : sel.t === 'row' ? man.rows : sel.t === 'field' ? (man.fields ?? []) : sel.t === 'fence' ? (man.fences ?? []) : man.erase;
  const id = (sel as { id: string }).id; return list.find((x) => x.id === id) ?? null;
}
function handlesOf(): [number, number][] { // 选中项的拖拽点（u）：矩形/椭圆/擦除是四角，多边形/连排是每个顶点
  if (sel?.t === 'building') { const g = effBuilding(sel.id)?.wings[sel.wing]; if (!g || g.rot) return []; const [x0, y0, x1, y1] = wingBox(g); return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  const o = findSel(); if (!o || !sel || sel.t === 'baked') return [];
  if (sel.t === 'erase' || sel.t === 'field' || ((sel.t === 'shape' || sel.t === 'bp') && (o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'capsule'))) { const [x0, y0, x1, y1] = sel.t === 'field' ? [o.x, o.y, o.x + o.w, o.y + o.h] : bboxOf(sel.t === 'erase' ? 'erase' : o.kind === 'rect' ? 'rect' : 'ellipse', o); return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  if (sel.t === 'row' || sel.t === 'fence' || ((sel.t === 'shape' || sel.t === 'bp') && o.pts)) return o.pts;
  return [];
}
function drawSelection() {
  ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 2;
  for (const id of multi) { const mb = effBuilding(id); if (!mb) continue; ctx.strokeStyle = '#6fe0ff'; ctx.lineWidth = 3; for (const g of mb.wings) { const [x0, y0, x1, y1] = wingBox(g); const [a, c] = toS(x0, y0), [d, e] = toS(x1, y1); ctx.strokeRect(a, c, d - a, e - c); } }
  if (sel!.t === 'building') {
    const b = effBuilding(sel!.id); if (!b) return;
    b.wings.forEach((g, i) => { const [x0, y0, x1, y1] = wingBox(g); const [a, c] = toS(x0, y0), [d, e] = toS(x1, y1); ctx.lineWidth = i === (sel as any).wing ? 3 : 1.5; ctx.strokeStyle = i === (sel as any).wing ? '#ffe070' : '#ffb040'; ctx.strokeRect(a, c, d - a, e - c); });
    for (const [x, y] of handlesOf()) { const [sx, sy] = toS(x, y); ctx.fillStyle = '#fff'; ctx.fillRect(sx - 4, sy - 4, 8, 8); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(sx - 4, sy - 4, 8, 8); }
    return;
  }
  if (sel!.t === 'baked') {
    const o = W.objects[sel!.idx]; if (!o) return; const f = spriteFrame(o.k); if (!f) return;
    const [sx, sy] = [(o.x - o.ax - view.x) * view.z, (o.y - o.ay - view.y) * view.z]; ctx.strokeRect(sx, sy, f.w * view.z, f.h * view.z); return;
  }
  const o = findSel(); if (!o) return;
  if (sel!.t === 'shape') { shapePath(o); ctx.stroke(); }
  else if (sel!.t === 'bp') { bpPath(o); ctx.stroke(); }
  else if (sel!.t === 'field') { const [a, b] = toS(o.x, o.y), [c, d] = toS(o.x + o.w, o.y + o.h); ctx.strokeRect(a, b, c - a, d - b); }
  else if (sel!.t === 'erase') { const [a, b] = toS(o.rect[0], o.rect[1]), [c, d] = toS(o.rect[0] + o.rect[2], o.rect[1] + o.rect[3]); ctx.strokeRect(a, b, c - a, d - b); }
  else if (sel!.t === 'object') { const [sx, sy] = toS(o.x, o.y); ctx.beginPath(); ctx.arc(sx, sy, 10, 0, 7); ctx.stroke(); }
  else { polyPath(o.pts); ctx.stroke(); }
  for (const [x, y] of handlesOf()) { const [sx, sy] = toS(x, y); ctx.fillStyle = '#fff'; ctx.fillRect(sx - 4, sy - 4, 8, 8); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(sx - 4, sy - 4, 8, 8); }
}


// ---------------------------------------------------------------- 建筑
const bEntries = () => (man.buildings ??= []);
/** 上次生成地图时各栋楼的手动条目（id → JSON）：和现在不一样的才是"待生成"，才画草图并盖住旧精灵 */
let builtB = new Map<string, string>();
const entryJson = (id: string) => { const e = bEntries().find((x) => x.id === id); return e ? JSON.stringify(e) : ''; };
const snapBuilt = () => new Map(bEntries().map((e) => [e.id, JSON.stringify(e)] as [string, string]));
function dirtyBuildingIds(): Set<string> {
  const ids = new Set([...bEntries().map((b) => b.id), ...builtB.keys()]);
  return new Set([...ids].filter((id) => entryJson(id) !== (builtB.get(id) ?? '')));
}
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
/** 当前有效的建筑：手动改过的用手动层里的版本（删掉的不算），没改过的用编译导出的基线 */
function effList(): ManualBuilding[] {
  const m = new Map(bEntries().map((b) => [b.id, b]));
  const out = baseB.filter((b) => !m.has(b.id));
  for (const b of m.values()) if (!b.delete) out.push(b);
  return out;
}
const effBuilding = (id: string) => effList().find((b) => b.id === id);
/** 取得（没有就从基线复制一份）手动层里这栋楼的条目——只在 mutate 里调用 */
function ensureEntry(id: string): ManualBuilding {
  let e = bEntries().find((b) => b.id === id);
  if (!e) { const b = baseB.find((x) => x.id === id); if (!b) throw new Error(`没有这栋楼 ${id}`); e = clone(b); bEntries().push(e); }
  return e;
}
const wingBox = (g: ManualWing): [number, number, number, number] => [g.x, g.y, g.x + g.w, g.y + g.d];
function drawBuildings() {
  const showAll = tool === 'building' || tool === 'newb';
  ctx.font = '12px sans-serif';
  for (const id of dirtyBuildingIds()) { // 改了还没生成的楼：先画脚印草图（旧精灵已隐藏）
    const b = effBuilding(id); if (!b) continue;
    b.wings.forEach((g, i) => {
      const [x0, y0, x1, y1] = wingBox(g); const [a, c] = toS(x0, y0), [d, e] = toS(x1, y1);
      ctx.fillStyle = 'rgba(170,85,60,.72)'; ctx.fillRect(a, c, d - a, e - c);
      ctx.fillStyle = 'rgba(255,225,190,.35)'; ctx.fillRect(a, c, d - a, Math.min(e - c, 10 + 0));
      ctx.setLineDash([5, 3]); ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1.5; ctx.strokeRect(a + 0.5, c + 0.5, d - a, e - c); ctx.setLineDash([]);
      if (g.door) { const dx = (x0 + g.door.tx) , [sx, sy] = toS(dx, y1); ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, sy - 3, g.door.tw / 2 * U * view.z, 4); }
      if (i === 0) label(`${b.name}（待生成）`, a + 4, c + 14);
    });
  }
  if (!showAll) return;
  for (const b of effList()) {
    ctx.strokeStyle = 'rgba(90,200,255,.8)'; ctx.lineWidth = 1;
    b.wings.forEach((g) => { const [x0, y0, x1, y1] = wingBox(g); const [a, c] = toS(x0, y0), [d, e] = toS(x1, y1); ctx.strokeRect(a + 0.5, c + 0.5, d - a, e - c); });
    const g = b.wings[0]; const [x0, y0, x1, y1] = wingBox(g); const [a, c] = toS(x0, y0), [d] = toS(x1, y1);
    if (view.z * U > 5 && d - a > 40) text(b.name, a + 3, c + 13, '#9fe0ff', '12px sans-serif');
  }
}
/** 点中哪栋楼的哪一段翼体：手动改过的按脚印（向上放宽一点，好点屋顶），没改过的按精灵范围 */
function hitBuilding(u: [number, number]): { id: string; wing: number } | null {
  let best: { id: string; wing: number } | null = null, bd = -1e9;
  const [x, y] = u, wx = x * U, wy = y * U, dirty0 = dirtyBuildingIds();
  for (const b of effList()) {
    const edited = dirty0.has(b.id);
    if (edited) b.wings.forEach((g, i) => { const up = (g.f ?? 4) * 0.45; if (x >= g.x && x <= g.x + g.w && y >= g.y - up && y <= g.y + g.d && g.y + g.d > bd) { bd = g.y + g.d; best = { id: b.id, wing: i }; } });
    else for (const sp of bSprites.get(b.id) ?? []) { if (wx >= sp.x && wx <= sp.x + sp.w && wy >= sp.y && wy <= sp.y + sp.h) { const g = b.wings[sp.i]; const depth = g ? g.y + g.d : 0; if (depth > bd) { bd = depth; best = { id: b.id, wing: Math.min(sp.i, b.wings.length - 1) }; } } }
  }
  return best;
}
function deleteBuilding(id: string) { mutate(() => removeBuilding(id)); multi.delete(id); sel = null; }
function addWing(id: string, wing: number, dir: 'right' | 'left' | 'down' | 'up' | 'dup') {
  mutate(() => {
    const e = ensureEntry(id); const g = e.wings[wing]; if (!g) return;
    const n: ManualWing = { ...clone(g), door: undefined }; delete n.door; delete n.rot;
    const half = (v: number) => Math.max(2, Math.round(v) / 2);
    if (dir === 'right') { n.x = g.x + g.w; n.w = half(g.w); }
    else if (dir === 'left') { n.w = half(g.w); n.x = g.x - n.w; }
    else if (dir === 'down') { n.y = g.y + g.d; n.d = half(g.d); }
    else if (dir === 'up') { n.d = half(g.d); n.y = g.y - n.d; }
    else { n.x = g.x + 1; n.y = g.y + 1; }
    e.wings.push(n); sel = { t: 'building', id, wing: e.wings.length - 1 };
  });
}


// ---------------------------------------------------------------- 门、融合
/** 一段翼体上的门：中心 c（原 5 m 格，绝对坐标）、半宽（门宽 tw 是游戏格，所以除以放大倍数）、门所在的南边 y */
function doorGeom(g: ManualWing) { const d = g.door!; const c = g.x + d.tx + d.tw / 2, half = d.tw / (2 * S); return { c, x0: c - half, x1: c + half, ys: g.y + g.d, half }; }
/** 门前 1.5 格是否被别的翼体（别的楼，或同一栋楼的别段）盖住 */
function doorBlocked(b: ManualBuilding, wi: number, all: ManualBuilding[] = effList()): boolean {
  const g = b.wings[wi]; if (!g.door) return false; const q = doorGeom(g);
  for (const o of all) for (let k = 0; k < o.wings.length; k++) {
    if (o === b && k === wi) continue; const w2 = o.wings[k];
    if (Math.min(q.x1, w2.x + w2.w) - Math.max(q.x0, w2.x) > 0.05 && Math.min(q.ys + 1.5, w2.y + w2.d) - Math.max(q.ys, w2.y) > 0.05) return true;
  }
  return false;
}
function drawDoors() {
  const all = tool === 'door';
  const eff = effList();
  const list = all ? eff : sel?.t === 'building' ? [effBuilding(sel.id)].filter(Boolean) as ManualBuilding[] : [];
  for (const b of list) b.wings.forEach((g, i) => {
    if (!g.door) return; const q = doorGeom(g), bad = doorBlocked(b, i, eff);
    const [a, c] = toS(q.x0, q.ys - 0.2), [d, e] = toS(q.x1, q.ys + 0.2);
    ctx.fillStyle = bad ? '#e0564a' : '#59c26a'; ctx.fillRect(a, c, Math.max(d - a, 6), Math.max(e - c, 6)); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(a + 0.5, c + 0.5, Math.max(d - a, 6), Math.max(e - c, 6));
    if (g.door.main) text('★', a + 1, c - 3, '#ffe070', '13px sans-serif');
    if (bad) text('门前被挡', a, e + 14, '#ff9a90', '11px sans-serif');
  });
}
function hitDoor(u: [number, number]): { id: string; wing: number } | null {
  for (const b of effList()) for (let i = 0; i < b.wings.length; i++) { const g = b.wings[i]; if (!g.door) continue; const q = doorGeom(g);
    if (u[0] >= q.x0 - 0.4 && u[0] <= q.x1 + 0.4 && Math.abs(u[1] - q.ys) <= 0.6) return { id: b.id, wing: i }; }
  return null;
}
/** 光标靠近哪一段翼体的南边（门只能开在南边） */
function nearSouthEdge(u: [number, number]): { id: string; wing: number } | null {
  let best: { id: string; wing: number } | null = null, bd = 1.2;
  for (const b of effList()) b.wings.forEach((g, i) => { if (g.rot) return; if (u[0] >= g.x && u[0] <= g.x + g.w) { const d = Math.abs(u[1] - (g.y + g.d)); if (d < bd) { bd = d; best = { id: b.id, wing: i }; } } });
  return best;
}
function setDoorAt(id: string, wing: number, cx: number, tw?: number) {
  const e = ensureEntry(id); const g = e.wings[wing]; if (!g) return;
  const w = tw ?? g.door?.tw ?? 2, half = w / (2 * S), c = Math.max(g.x + half, Math.min(g.x + g.w - half, cx));
  const hadMain = e.wings.some((x, k) => k !== wing && x.door?.main);
  g.door = { tx: r2(c - g.x - w / 2), tw: w, ...(g.door?.main || !hadMain ? { main: true } : {}) };
}
function removeBuilding(id: string) { // 在 mutate 里调用：基线里有的记成 delete，手动新建的直接去掉
  const list = bEntries(); const i = list.findIndex((b) => b.id === id); if (i >= 0) list.splice(i, 1);
  const b = baseB.find((x) => x.id === id); if (b) list.push({ id, name: b.name, kind: b.kind, delete: true, wings: [] });
}
/** 把选中的几栋楼融合成一栋：翼体全部并到第一栋里，位置不变；名字用 name；其余几栋删掉 */
function mergeBuildings(ids: string[], name: string) {
  const effs = ids.map((id) => effBuilding(id)).filter(Boolean) as ManualBuilding[];
  if (effs.length < 2) return;
  const total = effs.reduce((a, b) => a + b.wings.length, 0);
  if (total > 48) { toast(`翼体共 ${total} 段，超过 48 段，分两次融合`); return; }
  const first = effs[0].id;
  mutate(() => {
    const wings = effs.flatMap((b) => clone(b.wings)); let main = false;
    for (const g of wings) if (g.door?.main) { if (main) g.door.main = false; else main = true; } // 只留一个正门
    const en = ensureEntry(first); en.wings = wings; en.name = name.slice(0, 30) || en.name; en.sign = name.slice(0, 12) || en.sign;
    for (const b of effs.slice(1)) removeBuilding(b.id);
  });
  multi.clear(); sel = { t: 'building', id: first, wing: 0 };
  toast(`已融合成「${name}」，共 ${total} 段翼体`);
}

// ---------------------------------------------------------------- 命中测试
const inPoly = (x: number, y: number, p: [number, number][]) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function distSeg(px: number, py: number, a: [number, number], b: [number, number]) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1e-9; const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }
function hitManual(u: [number, number]): Sel {
  const tol = 9 / (view.z * U); const [x, y] = u;
  for (let i = man.objects.length - 1; i >= 0; i--) {
    const o = man.objects[i], f = spriteFrame(manualSpriteKey(o.k, o.x, o.y)), hw = f ? f.w / 2 / U : 0.5, hh = f ? f.h / U : 0.5;
    if ((Math.abs(x - o.x) <= Math.max(hw, tol) && y <= o.y + tol && y >= o.y - Math.max(hh, tol)) || Math.hypot(x - o.x, y - o.y) <= tol) return { t: 'object', id: o.id };
  }
  for (let i = man.rows.length - 1; i >= 0; i--) { const r = man.rows[i]; for (let k = 0; k + 1 < r.pts.length; k++) if (distSeg(x, y, r.pts[k], r.pts[k + 1]) <= tol) return { t: 'row', id: r.id }; }
  for (let i = (man.fences?.length ?? 0) - 1; i >= 0; i--) { const f = man.fences![i]; for (let k = 0; k + 1 < f.pts.length; k++) if (distSeg(x, y, f.pts[k], f.pts[k + 1]) <= tol) return { t: 'fence', id: f.id }; }
  for (let i = man.erase.length - 1; i >= 0; i--) { const [a, b, c, d] = man.erase[i].rect; if (x >= a && x <= a + c && y >= b && y <= b + d) return { t: 'erase', id: man.erase[i].id }; }
  for (let i = man.shapes.length - 1; i >= 0; i--) {
    const s = man.shapes[i]; let hit = false;
    if (s.kind === 'rect') hit = x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    else if (s.kind === 'ellipse') hit = ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;
    else if (s.kind === 'poly') hit = inPoly(x, y, s.pts);
    else for (let k = 0; k + 1 < s.pts.length; k++) if (distSeg(x, y, s.pts[k], s.pts[k + 1]) <= s.w / 2) hit = true;
    if (hit) return { t: 'shape', id: s.id };
  }
  for (let i = (man.fields?.length ?? 0) - 1; i >= 0; i--) { const f = man.fields![i]; if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return { t: 'field', id: f.id }; }
  return null;
}
function hitBaked(u: [number, number]): number {
  const wx = u[0] * U, wy = u[1] * U; let best = -1, by = -1e9;
  for (let i = 0; i < W.objects.length; i++) { const o = W.objects[i]; const f = spriteFrame(o.k); if (!f) continue;
    if (wx >= o.x - o.ax && wx <= o.x - o.ax + f.w && wy >= o.y - o.ay && wy <= o.y - o.ay + f.h && o.y > by) { best = i; by = o.y; } }
  return best;
}

// ---------------------------------------------------------------- 修改（带撤销）
function snapshot() { return JSON.stringify(man); }
function pushUndo(s = snapshot()) { undoStack.push(s); if (undoStack.length > 200) undoStack.shift(); redoStack = []; }
function mutate(fn: () => void) { pushUndo(); fn(); changed(); }
function changed() { dirty = true; saveDraft(); refreshTop(); renderSide(); }
function restore(s: string) { man = JSON.parse(s); man.buildings ??= []; if (sel && sel.t !== 'baked' && !findSel()) sel = null; changed(); }
function undo() { const s = undoStack.pop(); if (s === undefined) return; redoStack.push(snapshot()); restore(s); }
function redo() { const s = redoStack.pop(); if (s === undefined) return; undoStack.push(snapshot()); restore(s); }
/** 草稿连同"基础地图版本"（baked.json 的时间）一起存：部署并入之后版本变了，旧草稿就作废，不会把已并入的东西又加一遍 */
function saveDraft() { try { localStorage.setItem('pixel-editor-draft', JSON.stringify({ b: bakedM0, m: man })); } catch { /* 没存成也不影响 */ } }
const isDirty = () => snapshot() !== savedJson;
function deleteSel() {
  if (!sel) return;
  if (sel.t === 'building') { deleteBuilding(sel.id); return; }
  if (sel.t === 'baked') { const o = W.objects[sel.idx]; if (!o) return; mutate(() => man.erase.push({ id: newId('e'), rect: [r2(o.x / U - 0.15), r2(o.y / U - 0.15), 0.3, 0.3], what: 'all' })); sel = null; return; }
  const id = sel.id, t = sel.t;
  if (t === 'bp') { mutate(() => { const st = bpState(); delete st.edit[id]; if (!st.hide.includes(id)) st.hide.push(id); }); toast('已去掉这个蓝图图形（「保存并生成预览」后才会从地图上消失；红色虚线 = 已去掉，点选后可以恢复）'); return; }
  mutate(() => { const key = t === 'shape' ? 'shapes' : t === 'object' ? 'objects' : t === 'row' ? 'rows' : t === 'field' ? 'fields' : t === 'fence' ? 'fences' : 'erase'; (man as any)[key] = ((man as any)[key] ?? []).filter((x: any) => x.id !== id); });
  sel = null;
}
const baseKey = (k: string) => k.replace(/_\d+$/, '');
const mappable = (k: string) => [...MANUAL_TREES, ...MANUAL_PROPS].some((e) => e.k === baseKey(k));

// ---------------------------------------------------------------- 鼠标
const evU = (e: MouseEvent): [number, number] => toU(...unrot(e.offsetX, e.offsetY));
/** 光标落点：先吸附到网格；画折线路/围栏时，再把方向锁到固定角度（默认路 15°、围栏 90°；按住 Shift = 反过来：锁定 ↔ 自由） */
function adjustCursor(raw: [number, number], shift: boolean): [number, number] {
  const base: [number, number] = [snapV(raw[0]), snapV(raw[1])];
  if ((tool === 'stroke' || tool === 'fence') && drawing?.pts.length) {
    let stepDeg = tool === 'stroke' ? angStroke : angFence; if (shift) stepDeg = stepDeg ? 0 : tool === 'stroke' ? 15 : 90;
    if (stepDeg) {
      const l = drawing.pts[drawing.pts.length - 1], dx = raw[0] - l[0], dy = raw[1] - l[1], st = (stepDeg * Math.PI) / 180, a = Math.round(Math.atan2(dy, dx) / st) * st;
      const len = snap > 0 ? Math.max(snap, Math.round(Math.hypot(dx, dy) / snap) * snap) : Math.hypot(dx, dy);
      return [r2(l[0] + len * Math.cos(a)), r2(l[1] + len * Math.sin(a))];
    }
  }
  return base;
}
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mouseenter', () => { mouseIn = true; });
cv.addEventListener('mouseleave', () => { mouseIn = false; dirty = true; });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.altKey) { setRot(rot + (e.deltaY > 0 ? 1 : -1) * (Math.PI / 36)); return; } // Alt + 滚轮：转视角（5° 一格）
  const [px, py] = unrot(e.offsetX, e.offsetY); const [ux, uy] = toU(px, py); const z = Math.max(0.04, Math.min(5, view.z * Math.exp(-e.deltaY * 0.0015)));
  view.z = z; view.x = ux * U - px / z; view.y = uy * U - py / z; dirty = true; $('zoomv').textContent = `缩放 ${Math.round(z * 100)}%`;
}, { passive: false });

cv.addEventListener('mousedown', (e) => {
  (document.activeElement as HTMLElement | null)?.blur?.(); // 点画布时让输入框/下拉框失焦，否则方向键会被它们吃掉
  const raw = evU(e); cursorRaw = raw; cursor = adjustCursor(raw, e.shiftKey);
  if (e.button === 1 || e.button === 2 || spaceDown) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
  if (e.button !== 0) return;
  if (tool === 'select' || tool === 'building') {
    // 先看有没有点在选中项的拖拽点上
    const hs = handlesOf(); const tolPx = 7;
    const [opx, opy] = unrot(e.offsetX, e.offsetY);
    for (let i = 0; i < hs.length; i++) { const [sx, sy] = toS(hs[i][0], hs[i][1]); if (Math.hypot(sx - opx, sy - opy) <= tolPx) {
      if (sel?.t === 'building') drag = { kind: 'bhandle', id: sel.id, wing: sel.wing, i, orig: snapshot(), moved: false };
      else drag = { kind: findSel()?.pts ? 'vertex' : 'handle', i, orig: snapshot(), moved: false };
      return; } }
    if (tool === 'select') {
      const h = hitManual(raw);
      if (h) { sel = h; drag = { kind: 'move', start: cursor, orig: snapshot(), moved: false }; renderSide(); dirty = true; return; }
      const b = hitBaked(raw);
      if (b >= 0) { sel = { t: 'baked', idx: b }; drag = { kind: 'baked', idx: b, start: cursor, moved: false }; renderSide(); dirty = true; return; }
      const bid = hitBp(raw);
      if (bid) { sel = { t: 'bp', id: bid }; drag = { kind: 'move', start: cursor, orig: snapshot(), moved: false }; renderSide(); dirty = true; return; }
    }
    const hb = hitBuilding(raw);
    if (hb && (e.ctrlKey || e.metaKey)) { // Ctrl/⌘ + 点击：多选建筑（之后可以一键融合）
      if (sel?.t === 'building' && !multi.size) multi.add(sel.id);
      if (multi.has(hb.id)) multi.delete(hb.id); else multi.add(hb.id);
      sel = { t: 'building', id: hb.id, wing: hb.wing }; renderSide(); dirty = true; return;
    }
    if (!hb || !multi.has(hb.id)) multi.clear();
    if (hb) { sel = { t: 'building', id: hb.id, wing: hb.wing }; drag = { kind: 'bmove', id: hb.id, wing: hb.wing, start: cursor, orig: snapshot(), ow: clone(effBuilding(hb.id)!.wings), shift: e.shiftKey, moved: false }; renderSide(); dirty = true; return; }
    sel = null; renderSide(); dirty = true; return;
  }
  if (tool === 'door') {
    const hd = hitDoor(raw);
    if (hd) { sel = { t: 'building', id: hd.id, wing: hd.wing }; drag = { kind: 'dmove', id: hd.id, wing: hd.wing, orig: snapshot(), moved: false }; renderSide(); dirty = true; return; }
    const ne = nearSouthEdge(raw);
    if (ne) { mutate(() => { setDoorAt(ne.id, ne.wing, cursor[0]); sel = { t: 'building', id: ne.id, wing: ne.wing }; }); return; }
    const hb = hitBuilding(raw); sel = hb ? { t: 'building', id: hb.id, wing: hb.wing } : null; toast('点要开门的那一段楼的南面边缘（门都开在南面）'); renderSide(); dirty = true; return;
  }
  if (tool === 'rect' || tool === 'ellipse' || tool === 'erase' || tool === 'road' || tool === 'newb' || tool === 'field') { drawing = { a: cursor, pts: [] }; return; }
  if (tool === 'poly' || tool === 'stroke' || tool === 'fence') { if (!drawing) drawing = { pts: [] }; drawing.pts.push(cursor); dirty = true; return; }
  if (tool === 'object') { const [x, y] = cursor; mutate(() => { man.objects.push({ id: newId('o'), k: objK, x: r2(x), y: r2(y) }); }); return; }
  if (tool === 'row') {
    if (!drawing?.a) { drawing = { a: cursor, pts: [] }; return; }
    const a = drawing.a, b = cursor; drawing = null;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2) return;
    mutate(() => { const r = { id: newId('r'), k: objK, pts: [[r2(a[0]), r2(a[1])], [r2(b[0]), r2(b[1])]] as [number, number][], spacing: rowGap }; man.rows.push(r); sel = { t: 'row', id: r.id }; });
  }
});
window.addEventListener('mousemove', (e) => {
  if (drag?.kind === 'pan') { const [ddx, ddy] = rotVec(e.clientX - drag.sx, e.clientY - drag.sy); view.x = drag.vx - ddx / view.z; view.y = drag.vy - ddy / view.z; dirty = true; return; }
  if (e.target !== cv && !drag) return;
  const rect = cv.getBoundingClientRect(); const raw = toU(...unrot(e.clientX - rect.left, e.clientY - rect.top));
  cursorRaw = raw; cursor = adjustCursor(raw, e.shiftKey); dirty = true;
  $('pos').textContent = `x ${r2(raw[0]).toFixed(2)}  y ${r2(raw[1]).toFixed(2)}（原 5 m 格；光标吸附 ${cursor[0]}, ${cursor[1]}）`;
  if (!drag) return;
  if (drag.kind === 'move') {
    const dx = cursor[0] - drag.start[0], dy = cursor[1] - drag.start[1];
    if (!drag.moved && (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6)) { drag.moved = true; pushUndo(drag.orig); }
    if (drag.moved) { const o0 = JSON.parse(drag.orig) as ManualFile; applyMove(o0, dx, dy); dirty = true; }
  } else if (drag.kind === 'bmove') {
    const dx = cursor[0] - drag.start[0], dy = cursor[1] - drag.start[1];
    if (!drag.moved && (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6)) { drag.moved = true; pushUndo(drag.orig); }
    if (drag.moved) { const en = ensureEntry(drag.id); drag.ow.forEach((g, k) => { if (drag!.kind === 'bmove' && drag!.shift && k !== drag!.wing) return; en.wings[k].x = r2(g.x + dx); en.wings[k].y = r2(g.y + dy); }); dirty = true; }
  } else if (drag.kind === 'dmove') {
    if (!drag.moved) { drag.moved = true; pushUndo(drag.orig); }
    setDoorAt(drag.id, drag.wing, cursor[0]); dirty = true;
  } else if (drag.kind === 'bhandle') {
    if (!drag.moved) { drag.moved = true; pushUndo(drag.orig); }
    const en = ensureEntry(drag.id), g = en.wings[drag.wing]; const b = wingBox(g);
    const hs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; const fx = hs[(drag.i + 2) % 4];
    const x0 = Math.min(fx[0], cursor[0]), x1 = Math.max(fx[0], cursor[0]), y0 = Math.min(fx[1], cursor[1]), y1 = Math.max(fx[1], cursor[1]);
    if (x1 - x0 >= 1 && y1 - y0 >= 1) { g.x = r2(x0); g.y = r2(y0); g.w = r2(x1 - x0); g.d = r2(y1 - y0); }
    dirty = true;
  } else if (drag.kind === 'handle' || drag.kind === 'vertex') {
    if (!drag.moved) { drag.moved = true; pushUndo(drag.orig); }
    applyHandle(drag.i, cursor); dirty = true;
  } else if (drag.kind === 'baked' && !drag.moved && Math.hypot(cursor[0] - drag.start[0], cursor[1] - drag.start[1]) > 0.01) { drag.moved = true; }
});
window.addEventListener('mouseup', (e) => {
  if (!drag && !drawing) return;
  if (drag) {
    const d = drag; drag = null;
    if (d.kind === 'baked' && d.moved) {
      const o = W.objects[d.idx];
      if (!mappable(o.k)) toast('这个物件暂时只能删除，不能移动');
      else mutate(() => { man.erase.push({ id: newId('e'), rect: [r2(o.x / U - 0.15), r2(o.y / U - 0.15), 0.3, 0.3], what: 'all' }); const k = baseKey(o.k); const ob = { id: newId('o'), k, x: r2(cursor[0]), y: r2(cursor[1]) }; man.objects.push(ob); sel = { t: 'object', id: ob.id }; });
    } else if (d.kind === 'move' || d.kind === 'handle' || d.kind === 'vertex' || d.kind === 'bmove' || d.kind === 'bhandle' || d.kind === 'dmove') { if (d.moved) changed(); }
    dirty = true; return;
  }
  if (drawing?.a && (tool === 'rect' || tool === 'ellipse' || tool === 'erase' || tool === 'road' || tool === 'newb' || tool === 'field')) {
    const a = drawing.a, b = cursor; drawing = null;
    let x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    if (tool === 'field') {
      if (x1 - x0 < 3 || y1 - y0 < 3) { const sz = FIELD_KINDS.find((k) => k.k === fieldKind)!.size; x0 = a[0] - sz[0] / 2; y0 = a[1] - sz[1] / 2; x1 = x0 + sz[0]; y1 = y0 + sz[1]; } // 只点一下 = 按默认大小放在点的位置
      mutate(() => { const f: ManualField = { id: newId('f'), kind: fieldKind, x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0), ...(fieldFence ? { fence: true, gate: fieldGate } : {}), ...(fieldLights ? { lights: true } : {}) }; (man.fields ??= []).push(f); sel = { t: 'field', id: f.id }; });
      const fid = (sel as { id: string } | null)?.id; if (fid) { setTool('select'); sel = { t: 'field', id: fid }; renderSide(); dirty = true; }
      return;
    }
    if (tool === 'newb') {
      if (x1 - x0 < 2 || y1 - y0 < 2) { toast('新建筑至少 2 × 2 格，拖大一点'); return; }
      const id = `nb-${Date.now().toString(36)}`;
      mutate(() => { bEntries().push({ id, name: '新建筑', kind: 'teaching', sign: '新建筑', wings: [{ x: r2(x0), y: r2(y0), w: r2(x1 - x0), d: r2(y1 - y0), f: 4, style: 'brick', roofTone: 0, door: { tx: r2((x1 - x0) / 2 - 1), tw: 2, main: true } }] }); sel = { t: 'building', id, wing: 0 }; });
      setTool('building'); sel = { t: 'building', id, wing: 0 }; renderSide(); return;
    }
    if (tool === 'road') { const r = roadRect(a, b); mutate(() => { const s = { id: newId('s'), kind: 'rect' as const, mat: mat as any, x: r2(r[0]), y: r2(r[1]), w: r2(r[2]), h: r2(r[3]) }; man.shapes.push(s); sel = { t: 'shape', id: s.id }; }); return; }
    if (x1 - x0 < 0.05 || y1 - y0 < 0.05) return;
    mutate(() => {
      if (tool === 'rect') { const s = { id: newId('s'), kind: 'rect' as const, mat: mat as any, x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) }; man.shapes.push(s); sel = { t: 'shape', id: s.id }; }
      else if (tool === 'ellipse') { const s = { id: newId('s'), kind: 'ellipse' as const, mat: mat as any, cx: r2((x0 + x1) / 2), cy: r2((y0 + y1) / 2), rx: r2((x1 - x0) / 2), ry: r2((y1 - y0) / 2) }; man.shapes.push(s); sel = { t: 'shape', id: s.id }; }
      else {
        const s = { id: newId('e'), rect: [r2(x0), r2(y0), r2(x1 - x0), r2(y1 - y0)] as [number, number, number, number], what: eraseWhat }; man.erase.push(s); sel = { t: 'erase', id: s.id };
        if (eraseBp) { const n = hideBpInside(s.rect); toast(n ? `连带去掉了框里的 ${n} 个蓝图图形（红色虚线）` : '框里没有（整个落在框内的）蓝图图形——先在右侧「显示」里勾上要处理的类别'); }
      }
    });
  }
});
cv.addEventListener('dblclick', () => { if (tool === 'poly' && drawing && drawing.pts.length >= 3) finishPoly(); else if ((tool === 'stroke' || tool === 'fence') && drawing) finishLine(); });
/** 折线路 / 围栏：点一个个顶点，双击或 Enter 完成 */
function finishLine() {
  if (!drawing) return;
  const clean = drawing.pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6); // 双击会连发两次单击，去掉紧挨着的重复点
  drawing = null; if (clean.length < 2) return;
  const pts = clean.map(([x, y]) => [r2(x), r2(y)] as [number, number]);
  if (tool === 'stroke') mutate(() => { const sh: any = { id: newId('s'), kind: 'stroke', mat, w: roadW, pts }; if (strokeFlat) sh.flat = true; if (strokeMark && mat === 'asphalt') sh.mark = strokeMark; man.shapes.push(sh); sel = { t: 'shape', id: sh.id }; });
  else mutate(() => { const f: ManualFence = { id: newId('f'), pts, piers: fencePiers, ...(fenceWall ? { wall: true } : {}), ...(fenceForce ? { force: true } : {}) }; (man.fences ??= []).push(f); sel = { t: 'fence', id: f.id }; });
}
function finishPoly() {
  if (!drawing || drawing.pts.length < 3) { drawing = null; return; }
  const pts = drawing.pts.slice(); drawing = null;
  // 双击会连发两次单击，去掉紧挨着的重复点
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
  if (clean.length < 3) return;
  mutate(() => { const s = { id: newId('s'), kind: 'poly' as const, mat: mat as any, pts: clean.map(([x, y]) => [r2(x), r2(y)] as [number, number]) }; man.shapes.push(s); sel = { t: 'shape', id: s.id }; });
}
function applyMove(o0: ManualFile, dx: number, dy: number) {
  if (!sel || sel.t === 'baked') return;
  const id = sel.id, t = sel.t;
  const src: any = t === 'bp' ? bpCur(o0, id) : (t === 'shape' ? o0.shapes : t === 'object' ? o0.objects : t === 'row' ? o0.rows : t === 'field' ? (o0.fields ?? []) : t === 'fence' ? (o0.fences ?? []) : o0.erase).find((x: any) => x.id === id);
  const dst: any = findSel(true); if (!src || !dst) return;
  if (t === 'object' || t === 'field') { dst.x = r2(src.x + dx); dst.y = r2(src.y + dy); }
  else if (src.kind === 'capsule') { dst.cx = r2(src.cx + dx); dst.cy = r2(src.cy + dy); }
  else if (t === 'erase') dst.rect = [r2(src.rect[0] + dx), r2(src.rect[1] + dy), src.rect[2], src.rect[3]];
  else if (t === 'row' || t === 'fence') dst.pts = src.pts.map(([x, y]: number[]) => [r2(x + dx), r2(y + dy)]);
  else if (src.kind === 'rect') { dst.x = r2(src.x + dx); dst.y = r2(src.y + dy); }
  else if (src.kind === 'ellipse') { dst.cx = r2(src.cx + dx); dst.cy = r2(src.cy + dy); }
  else dst.pts = src.pts.map(([x, y]: number[]) => [r2(x + dx), r2(y + dy)]);
}
function applyHandle(i: number, c: [number, number]) {
  const o = findSel(true); if (!o || !sel || sel.t === 'baked') return;
  if (o.pts && (sel.t === 'row' || sel.t === 'shape' || sel.t === 'fence' || sel.t === 'bp')) { o.pts[i] = [r2(c[0]), r2(c[1])]; return; }
  if (sel.t === 'field') {
    const b = [o.x, o.y, o.x + o.w, o.y + o.h], hs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], fx = hs[(i + 2) % 4];
    const x0 = Math.min(fx[0], c[0]), x1 = Math.max(fx[0], c[0]), y0 = Math.min(fx[1], c[1]), y1 = Math.max(fx[1], c[1]);
    if (x1 - x0 >= 3 && y1 - y0 >= 3) { o.x = r2(x0); o.y = r2(y0); o.w = r2(x1 - x0); o.h = r2(y1 - y0); }
    return;
  }
  const kind = sel.t === 'erase' ? 'erase' : o.kind; const b = bboxOf(kind === 'capsule' ? 'ellipse' : kind, o);
  const opp = [(i + 2) % 4]; const hs = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; const fixed = hs[opp[0]];
  const x0 = Math.min(fixed[0], c[0]), x1 = Math.max(fixed[0], c[0]), y0 = Math.min(fixed[1], c[1]), y1 = Math.max(fixed[1], c[1]);
  if (x1 - x0 < 0.05 || y1 - y0 < 0.05) return;
  if (kind === 'rect') { o.x = r2(x0); o.y = r2(y0); o.w = r2(x1 - x0); o.h = r2(y1 - y0); }
  else if (kind === 'erase') o.rect = [r2(x0), r2(y0), r2(x1 - x0), r2(y1 - y0)];
  else { o.cx = r2((x0 + x1) / 2); o.cy = r2((y0 + y1) / 2); o.rx = r2((x1 - x0) / 2); o.ry = r2((y1 - y0) / 2); }
}

// ---------------------------------------------------------------- 键盘
/** 方向键（含小键盘：NumLock 关时就是方向键，开时是 8/2/4/6） */
const NUMPAD_DIR: Record<string, [number, number]> = { Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, -1], Numpad2: [0, 1] };
function dirOf(e: KeyboardEvent): [number, number] | null {
  if (e.key === 'ArrowLeft') return [-1, 0]; if (e.key === 'ArrowRight') return [1, 0]; if (e.key === 'ArrowUp') return [0, -1]; if (e.key === 'ArrowDown') return [0, 1];
  return NUMPAD_DIR[e.code] ?? null;
}
/** 有选中的东西时，方向键微调它的位置（一次一个吸附步长，Shift = 1 格）；返回 false = 没选中，调用方去平移画面 */
function nudgeSel(dx: number, dy: number, big: boolean): boolean {
  if (!sel) return false;
  if (sel.t === 'baked') { toast('地图上已有的物件：先用鼠标拖一下（变成手动物件）再用方向键微调'); return true; }
  const [rx, ry] = rotVec(dx, dy); const ax = Math.abs(rx) >= Math.abs(ry) ? [Math.sign(rx), 0] : [0, Math.sign(ry)]; // 视角转过时，按屏幕方向挪
  const step = big ? 1 : snap > 0 ? snap : 0.25, mx = ax[0] * step, my = ax[1] * step;
  if (sel.t === 'building') { const id = sel.id; mutate(() => { for (const g of ensureEntry(id).wings) { g.x = r2(g.x + mx); g.y = r2(g.y + my); } }); return true; }
  const o0 = JSON.parse(snapshot()) as ManualFile; mutate(() => { applyMove(o0, mx, my); }); return true;
}
const KEYS: Record<string, Tool> = { v: 'select', r: 'rect', e: 'ellipse', l: 'road', k: 'stroke', p: 'poly', f: 'field', w: 'fence', o: 'object', t: 'row', x: 'erase', b: 'building', n: 'newb', d: 'door' };
window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Escape') { drawing = null; sel = null; dirty = true; renderSide(); return; }
  if (e.key === 'Enter' && tool === 'poly') { finishPoly(); return; }
  if (e.key === 'Enter' && (tool === 'stroke' || tool === 'fence')) { finishLine(); return; }
  if (e.key === 'Backspace' && drawing?.pts.length) { e.preventDefault(); drawing.pts.pop(); if (!drawing.pts.length) drawing = null; dirty = true; return; } // 画到一半：退回上一个点
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { setTool(KEYS[e.key.toLowerCase()]); return; }
  const pan = 80 / view.z;
  const arrow = (dx: number, dy: number) => { const [rx, ry] = rotVec(dx * pan, dy * pan); view.x += rx; view.y += ry; };
  const dd = dirOf(e);
  if (dd) { e.preventDefault(); if (!nudgeSel(dd[0], dd[1], e.shiftKey)) arrow(dd[0], dd[1]); }
  else if (e.key === '[') setRot(rot - Math.PI / 12); else if (e.key === ']') setRot(rot + Math.PI / 12); else if (e.key === '\\') setRot(0);
  else if (e.key === '=' || e.key === '+') zoomBy(1.25); else if (e.key === '-') zoomBy(0.8); else return;
  dirty = true;
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
function zoomBy(f: number) { const w = cv.width / devicePixelRatio / 2, h = cv.height / devicePixelRatio / 2; const [ux, uy] = toU(w, h); view.z = Math.max(0.04, Math.min(5, view.z * f)); view.x = ux * U - w / view.z; view.y = uy * U - h / view.z; $('zoomv').textContent = `缩放 ${Math.round(view.z * 100)}%`; }
function setTool(t: Tool) { tool = t; drawing = null; if (t !== 'building' && t !== 'select') multi.clear(); if (t !== 'select' && t !== 'building') sel = null; if (t === 'building' && sel?.t !== 'building') sel = null; renderTools(); renderSide(); dirty = true; }
function gotoU(ux: number, uy: number, z = 0.9) { const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio; view.z = z; view.x = ux * U - w / 2 / z; view.y = uy * U - h / 2 / z; dirty = true; $('zoomv').textContent = `缩放 ${Math.round(z * 100)}%`; }

// ---------------------------------------------------------------- 界面
const TOOLS: [Tool, string, string][] = [['select', '选择', 'V'], ['rect', '涂矩形', 'R'], ['road', '画路', 'L'], ['stroke', '斜路/折线路', 'K'], ['ellipse', '涂椭圆', 'E'], ['poly', '涂多边形', 'P'], ['field', '运动场', 'F'], ['fence', '围栏围墙', 'W'], ['object', '摆物件', 'O'], ['row', '连排摆', 'T'], ['erase', '擦除', 'X'], ['building', '改建筑', 'B'], ['newb', '新建筑', 'N'], ['door', '加门', 'D']];
const HELP: Record<Tool, string> = {
  select: '点选手动元素或地图上已有的物件；拖动移动，拖白点改大小/顶点，Delete 删除。已有物件可删除，也可拖到新位置（= 擦掉原来的并摆一个新的）。',
  rect: '选一种材质，拖一个矩形涂地面（盖在原来的地面上）。',
  road: '选一种材质（沥青路/人行道…），在路的起点按下、拖到终点松开：画一段横平竖直、方头的路，宽度在右侧设置。',
  stroke: '画斜向/拐弯的路：选材质和路宽，依次点路的顶点，双击或 Enter 完成，Backspace 退回一个点，Esc 取消。方向默认锁在 15° 的倍数（右侧可改成 45°/90°/自由，按住 Shift 临时反转）；两端默认切平（不会冒出半圆）。完成后用「选择」拖白点改路线。',
  field: '运动场地模板：右侧选足球场/篮球场/网球场/田径场，拖一个矩形（只点一下 = 默认大小）。自动铺好地面、白线、球门/篮架、围栏（留缺口）、灯杆。建好后切到「选择」，拖白点改大小，拖动整体移动，右侧改围栏/缺口/灯杆。球门/篮架放在长边的两头。',
  fence: '围栏/围墙：依次点顶点，双击或 Enter 完成，Backspace 退回，Esc 取消。方向默认锁 90°（横平竖直）；斜线会变成阶梯状。路口自动留口（勾「忽略地面」则不留）。完成后用「选择」拖白点。',
  ellipse: '选一种材质，拖出椭圆的外框。',
  poly: '选一种材质，依次点多边形的顶点，双击或按 Enter 完成，Esc 取消。',
  object: '选右侧的树/小品，点一下摆一个。',
  row: '选右侧的树/小品，点起点、再点终点，沿线按间距连排摆放（路灯、行道树）。',
  building: '点一栋楼选中它：拖动 = 整栋移动（按住 Shift 拖 = 只移动点中的那一段）；拖白点 = 改这一段的长/宽；右侧可以改名字、层数、风格，给这栋楼接一段新的翼体（做出拐弯/L 形）。改完要「保存并生成预览」才会换成新的建筑图。',
  door: '点楼某一段的南面边缘加门（引擎里的门都开在翼体的南面，为以后进室内做准备）；拖门左右滑动；红色 = 门前被别的楼挡住了，走不进去。右侧可以调门宽、设为正门、去掉门。',
  newb: '在空地上拖一个矩形，新建一栋楼（先用现有的建筑素材：红砖、4 层、南面有门）；建好后在「改建筑」里调整名字、层数、风格，接翼体。',
  erase: '拖一个矩形，擦掉范围内已有的物件（可选全部/只树/只小品）。校园商店、校园墙不会被擦。保存并生成预览后才真正消失。',
};
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([t, n, k]) => `<button data-tool="${t}" class="${tool === t ? 'on' : ''}">${n}<small>${k}</small></button>`).join('');
  $('help').textContent = HELP[tool];
}
$('tools').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) setTool(b.dataset.tool as Tool); });
function thumb(key: string) { const c = document.createElement('canvas'); c.width = c.height = 32; const f = propsFrames[key]; if (f) { const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; const s = Math.min(32 / f.w, 32 / f.h, 1); x.drawImage(propsImg, f.x, f.y, f.w, f.h, (32 - f.w * s) / 2, 32 - f.h * s, f.w * s, f.h * s); } return c; }
function renderSide() {
  const side = $('side'); const o = findSel();
  const matGrid = `<div class="grid">${MANUAL_MATS.map((m) => `<div class="sw ${mat === m.mat ? 'on' : ''}" data-mat="${m.mat}"><i style="background:${m.color}"></i>${m.name}</div>`).join('')}</div>`;
  const objGrid = (list: { k: string; name: string }[]) => `<div class="grid">${list.map((m) => `<div class="sw ${objK === m.k ? 'on' : ''}" data-obj="${m.k}"><span data-th="${manualSpriteKey(m.k, 0, 0)}"></span>${m.name}</div>`).join('')}</div>`;
  let h = '';
  const angSel = (id: string, v: number) => `<select id="${id}">${[[0, '自由'], [15, '15° 的倍数'], [45, '45° 的倍数'], [90, '横平竖直 (90°)']].map(([a, n]) => `<option value="${a}" ${v === a ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  if (['rect', 'ellipse', 'poly', 'road', 'stroke'].includes(tool)) { h += `<h4>地面材质</h4>${matGrid}`; if (tool === 'road' || tool === 'stroke') h += `<div class="row"><label>路宽</label><input id="roadw" type="number" min="0.5" max="40" step="0.5" value="${roadW}"> <span style="color:var(--dim)">格（5 m）</span></div>`; }
  if (tool === 'stroke') h += `<div class="row"><label>方向</label>${angSel('tsang', angStroke)}</div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="tsflat" ${strokeFlat ? 'checked' : ''}> 两端切平（不冒半圆）</label></div><div class="row"><label>车道线</label><select id="tsmark">${[['', '无'], ['center', '虚中线'], ['edges', '两侧边线'], ['both', '中线+边线'], ['double', '双黄线']].map(([v, n]) => `<option value="${v}" ${strokeMark === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div style="color:var(--dim)">车道线只对「沥青路」材质有效。</div>`;
  if (tool === 'field') h += `<h4>运动场地</h4><div class="grid">${FIELD_KINDS.map((k) => `<div class="sw ${fieldKind === k.k ? 'on' : ''}" data-fk="${k.k}">${k.name}</div>`).join('')}</div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="tffence" ${fieldFence ? 'checked' : ''}> 围栏</label><label style="min-width:0">缺口</label><select id="tfgate">${[['S', '南'], ['N', '北'], ['E', '东'], ['W', '西']].map(([v, n]) => `<option value="${v}" ${fieldGate === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="tflights" ${fieldLights ? 'checked' : ''}> 四角灯杆</label></div><div style="color:var(--dim)">拖矩形 = 指定大小；只点一下 = 默认大小（${FIELD_KINDS.find((k) => k.k === fieldKind)!.size.join(' × ')} 格）。</div>`;
  if (tool === 'fence') h += `<h4>围栏 / 围墙</h4><div class="row"><label>类型</label><select id="tfwall"><option value="0" ${!fenceWall ? 'selected' : ''}>铁栏杆</option><option value="1" ${fenceWall ? 'selected' : ''}>砖墙</option></select></div><div class="row"><label>砖柱间隔</label><input id="tfpiers" type="number" min="1" max="40" step="1" value="${fencePiers}" style="width:60px"> <span style="color:var(--dim)">格</span></div><div class="row"><label>方向</label>${angSel('tfang', angFence)}</div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="tfforce" ${fenceForce ? 'checked' : ''}> 忽略地面（路口也不留口）</label></div>`;
  if (tool === 'object' || tool === 'row') { h += `<h4>树</h4>${objGrid(MANUAL_TREES)}<h4>小品</h4>${objGrid(MANUAL_PROPS)}`; if (tool === 'row') h += `<div class="row"><label>间距</label><input id="gap" type="number" min="0.5" max="40" step="0.5" value="${rowGap}"> <span style="color:var(--dim)">格</span></div>`; }
  if (tool === 'erase') h += `<h4>擦除对象</h4><div class="row"><select id="what"><option value="all" ${eraseWhat === 'all' ? 'selected' : ''}>全部物件</option><option value="trees" ${eraseWhat === 'trees' ? 'selected' : ''}>只擦树</option><option value="props" ${eraseWhat === 'props' ? 'selected' : ''}>只擦小品（灯/椅/花坛…）</option></select></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="terasebp" ${eraseBp ? 'checked' : ''}> 连带去掉框内的蓝图图形</label></div><div style="color:var(--dim)">勾上后，整个落在框里的蓝图图形（运动场地面/白线、围栏…，按下面「显示」里勾选的类别）也会被去掉——整块清掉旧运动场再放新的用这个。</div>`;
  if (tool === 'building' || tool === 'newb' || tool === 'door' || sel?.t === 'building') h += buildingPanel();
  if (tool === 'select') {
    h += '<h4>选中</h4><div id="sel">';
    if (sel?.t === 'baked') { const b = W.objects[sel.idx]; h += `地图上已有的物件：<b>${b?.k ?? '?'}</b><br>位置 ${r2((b?.x ?? 0) / U)}, ${r2((b?.y ?? 0) / U)}<div class="row"><button class="warn" data-act="del">删除（擦掉）</button></div>`; }
    else if (!o) h += '<span style="color:var(--dim)">没有选中。点地图上的东西。</span>';
    else if (sel!.t === 'shape') h += `<b>地面 · ${{ rect: '矩形', ellipse: '椭圆', poly: '多边形', stroke: '折线' }[o.kind as string]}</b><div class="row"><label>材质</label><select id="selmat">${MANUAL_MATS.map((m) => `<option value="${m.mat}" ${o.mat === m.mat ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>${shapeFields(o)}<div class="row"><button data-act="up">上移一层</button><button data-act="down">下移一层</button><button class="warn" data-act="del">删除</button></div>`;
    else if (sel!.t === 'object') h += `<b>物件</b><div class="row"><label>种类</label><select id="selk">${[...MANUAL_TREES, ...MANUAL_PROPS].map((m) => `<option value="${m.k}" ${o.k === m.k ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div><div class="row"><label>x / y</label><input data-f="x" type="number" step="0.25" value="${o.x}"><input data-f="y" type="number" step="0.25" value="${o.y}"></div><div class="row"><button class="warn" data-act="del">删除</button></div>`;
    else if (sel!.t === 'row') h += `<b>连排</b><div class="row"><label>种类</label><select id="selk">${[...MANUAL_TREES, ...MANUAL_PROPS].map((m) => `<option value="${m.k}" ${o.k === m.k ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div><div class="row"><label>间距</label><input data-f="spacing" type="number" min="0.5" step="0.5" value="${o.spacing}"></div><div class="row"><button class="warn" data-act="del">删除</button></div>`;
    else if (sel!.t === 'field') h += `<b>运动场 · ${FIELD_KINDS.find((k) => k.k === o.kind)?.name ?? o.kind}</b><div class="row"><label>种类</label><select id="sfkind">${FIELD_KINDS.map((k) => `<option value="${k.k}" ${o.kind === k.k ? 'selected' : ''}>${k.name}</option>`).join('')}</select></div><div class="row"><label>x / y</label><input data-f="x" type="number" step="0.25" value="${o.x}"><input data-f="y" type="number" step="0.25" value="${o.y}"></div><div class="row"><label>宽 / 高</label><input data-f="w" type="number" min="3" step="0.25" value="${o.w}"><input data-f="h" type="number" min="3" step="0.25" value="${o.h}"></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="sffence" ${o.fence ? 'checked' : ''}> 围栏</label><label style="min-width:0">缺口</label><select id="sfgate">${[['S', '南'], ['N', '北'], ['E', '东'], ['W', '西']].map(([v, n]) => `<option value="${v}" ${(o.gate ?? 'S') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="sflights" ${o.lights ? 'checked' : ''}> 四角灯杆</label><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="sfgoals" ${o.goals === false ? '' : 'checked'}> 球门/篮架</label></div><div class="row"><button class="warn" data-act="del">删除</button></div>`;
    else if (sel!.t === 'fence') h += `<b>${o.wall ? '围墙' : '围栏'}（${o.pts.length} 个顶点）</b><div class="row"><label>类型</label><select id="sewall"><option value="0" ${!o.wall ? 'selected' : ''}>铁栏杆</option><option value="1" ${o.wall ? 'selected' : ''}>砖墙</option></select></div><div class="row"><label>砖柱间隔</label><input data-f="piers" type="number" min="1" max="40" step="1" value="${o.piers ?? 4}" style="width:60px"></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="seforce" ${o.force ? 'checked' : ''}> 忽略地面</label></div><div style="color:var(--dim)">拖白点改顶点；Delete 删除。</div><div class="row"><button class="warn" data-act="del">删除</button></div>`;
    else if (sel!.t === 'bp') h += bpPanel((sel as { id: string }).id, o);
    else h += `<b>擦除范围</b><div class="row"><select id="selwhat"><option value="all" ${o.what === 'all' ? 'selected' : ''}>全部物件</option><option value="trees" ${o.what === 'trees' ? 'selected' : ''}>只擦树</option><option value="props" ${o.what === 'props' ? 'selected' : ''}>只擦小品</option></select></div><div class="row"><button class="warn" data-act="del">删除这个擦除</button></div>`;
    h += '</div>';
  }
  h += `<h4>显示</h4><div class="row" style="flex-wrap:wrap">${(['ground', 'buildings', 'objects', 'grid', 'manual', 'bp'] as const).map((k) => `<label style="min-width:0;color:var(--fg)"><input type="checkbox" data-layer="${k}" ${layers[k] ? 'checked' : ''}> ${{ ground: '地面', buildings: '建筑', objects: '物件', grid: '网格', manual: '我的改动', bp: '蓝图图形(可改)' }[k]}</label>`).join('')}</div>`;
  if (layers.bp && bpData.length) h += `<div class="row" style="flex-wrap:wrap">${BP_CATS.map(([k, n, c]) => `<label style="min-width:0;color:${c}"><input type="checkbox" data-bpcat="${k}" ${bpCats[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div><div style="color:var(--dim)">勾上的类别会画出细线轮廓，用「选择」点中可以拖动/改大小/去掉。</div>`;
  h += `<h4>设置</h4><div class="row"><label>吸附</label><select id="snap">${[[0.5, '0.5 格（推荐）'], [0.25, '0.25 格'], [1, '1 格'], [0, '不吸附']].map(([v, n]) => `<option value="${v}" ${snap === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="row"><label>季节</label><select id="season">${['spring', 'summer', 'autumn', 'winter'].map((s) => `<option value="${s}" ${season === s ? 'selected' : ''}>${{ spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[s]}</option>`).join('')}</select></div>`;
  h += `<h4>我的改动</h4><div style="color:var(--dim)">地面 ${man.shapes.length} · 物件 ${man.objects.length} · 连排 ${man.rows.length} · 擦除 ${man.erase.length} · 建筑 ${bEntries().length} · 运动场 ${man.fields?.length ?? 0} · 围栏 ${man.fences?.length ?? 0} · 蓝图去掉 ${man.bp?.hide.length ?? 0}/改 ${Object.keys(man.bp?.edit ?? {}).length}</div>${man.bp && (man.bp.hide.length || Object.keys(man.bp.edit).length) ? '<div class="row"><button data-act="bp-reset" class="warn">蓝图图形全部恢复原样</button></div>' : ''}<div class="row">${(() => { const r = simplifyManual(man).removed, n = r.shapes + r.objects + r.erase; return n ? `<button data-act="tidy" class="pri" title="去掉被后涂的图形完全盖住的旧图形、重复物件、被包住的擦除；地图画面不变">整理（可去掉 ${n} 项冗余）</button>` : '<span style="color:var(--dim)">没有冗余</span>'; })()}<button data-act="clear" class="warn">清空全部改动</button></div>`;
  h += `<h4>快捷键</h4><div style="color:var(--dim);line-height:1.9"><kbd>空格</kbd>拖动 / 右键拖动平移 · 滚轮缩放<br><kbd>V</kbd><kbd>R</kbd><kbd>L</kbd><kbd>E</kbd><kbd>P</kbd><kbd>O</kbd><kbd>T</kbd><kbd>X</kbd> 切换工具<br><kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销 · <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存</div>`;
  side.innerHTML = h;
  side.querySelectorAll<HTMLElement>('[data-th]').forEach((el) => el.replaceWith(thumb(el.dataset.th!)));
}

function mergePanel(): string {
  const names = [...multi].map((id) => effBuilding(id)?.name ?? id);
  const wings = [...multi].reduce((a, id) => a + (effBuilding(id)?.wings.length ?? 0), 0);
  return `<h4>多选 · ${multi.size} 栋（Ctrl/⌘+点击增减）</h4><div id="sel">${names.map((n) => `<div>· ${n}</div>`).join('')}
    <div style="color:var(--dim);margin:4px 0">共 ${wings} 段翼体。融合后成为一栋楼：所有翼体保持原来的位置，门保留（只留一个正门）。</div>
    <div class="row"><label>新名字</label><input id="mname" type="text" value="${(effBuilding([...multi][0])?.name ?? '').replace(/"/g, '&quot;')}" style="flex:1;min-width:0"></div>
    <div class="row"><button class="pri" data-act="merge">融合成一栋楼</button><button data-act="unmulti">取消多选</button></div></div>`;
}
function buildingPanel(): string {
  if (multi.size >= 2) return mergePanel();
  if (tool === 'newb') return `<h4>新建筑</h4><div id="sel">在地图空地上拖一个矩形。建好后会自动切到「改建筑」。</div>`;
  if (sel?.t !== 'building') return `<h4>建筑</h4><div id="sel"><span style="color:var(--dim)">点一栋楼选中它。</span></div>`;
  const b = effBuilding(sel.id); if (!b) return '';
  const curWing = Math.min(sel.wing, b.wings.length - 1), g = b.wings[curWing];
  const inBase = baseB.some((x) => x.id === b.id), edited = bEntries().some((x) => x.id === b.id);
  const sel1 = (id: string, list: { k: string; name: string }[], v: string | undefined) => `<select id="${id}">${list.map((m) => `<option value="${m.k}" ${v === m.k ? 'selected' : ''}>${m.name}</option>`).join('')}</select>`;
  const tones = [0, 1, 2, 3, 4].map((t) => `<option value="${t}" ${(g.roofTone ?? 0) === t ? 'selected' : ''}>${ROOF_TONES[t]}</option>`).join('');
  const f = (k: string, label: string, v: number, step = 0.5) => `<input data-bf="${k}" type="number" step="${step}" value="${v}" title="${label}">`;
  return `<h4>建筑${edited ? (dirtyBuildingIds().has(b.id) ? ' · 已改动（待生成）' : ' · 已改动（已生成）') : ''}</h4><div id="sel">
    <div class="row"><label>名称</label><input id="bname" type="text" value="${b.name.replace(/"/g, '&quot;')}" style="flex:1;min-width:0"></div>
    <div class="row"><label>种类</label>${sel1('bkind', BUILDING_KINDS, b.kind)}</div>
    <div class="row"><label>风格</label>${sel1('bstyle', BUILDING_STYLES, g.style)}</div>
    <div class="row"><label>层数</label><input id="bfloors" type="number" min="1" max="12" step="1" value="${g.f ?? 4}" style="width:60px"> <label style="min-width:0">屋面</label><select id="btone" style="flex:1">${tones}</select></div>
    <div class="row"><label>门牌</label><input id="bsign" type="text" maxlength="12" value="${(b.sign ?? '').replace(/"/g, '&quot;')}" placeholder="门头上的字" style="flex:1;min-width:0"></div>
    <div class="row"><label>室内</label><select id="binterior" title="在正门口按 E 进入哪间室内；只有在室内编辑器里勾了「开放入口」的才会真的开放"><option value="">（无）</option>${interiorList.map((r) => `<option value="${r.id}" ${(b.interior ?? '') === r.id ? 'selected' : ''}>${r.name}${r.open ? '' : '（未开放）'}</option>`).join('')}</select></div>
    <h4 style="margin-top:10px">翼体（${b.wings.length} 段，点选）</h4>
    <div class="row" style="flex-wrap:wrap">${b.wings.map((_, i) => `<button data-act="b-pick" data-wing="${i}" class="${i === curWing ? 'on' : ''}" style="padding:2px 8px">${i + 1}</button>`).join('')}</div>
    <div class="row"><label>x / y</label>${f('x', 'x', g.x)}${f('y', 'y', g.y)}</div>
    <div class="row"><label>长 / 宽</label>${f('w', '长', g.w)}${f('d', '宽', g.d)}</div>
    ${g.rot ? '<div style="color:var(--dim)">这一段是斜的，只能整段移动。</div>' : ''}
    <h4 style="margin-top:10px">门（这一段的南面）</h4>
    ${g.door ? `<div class="row"><label>位置</label><input data-door="c" type="number" step="0.5" value="${r2(g.x + g.door.tx + g.door.tw / 2)}" title="门中心的 x"><label style="min-width:0">宽</label><input data-door="tw" type="number" min="1" max="8" step="0.5" value="${g.door.tw}" style="width:56px"></div>
    <div class="row"><button data-act="d-main" class="${g.door.main ? 'on' : ''}">${g.door.main ? '★ 是正门' : '设为正门'}</button><button class="warn" data-act="d-del">去掉门</button></div>${doorBlocked(b, curWing) ? '<div style="color:#ff9a90">⚠ 门前被别的楼挡住了，拖开这扇门或挪楼。</div>' : ''}`
      : `<div class="row"><span style="color:var(--dim)">这一段没有门。</span><button data-act="d-add">加一扇门（居中）</button></div>`}
    <div class="row" style="flex-wrap:wrap"><button data-act="b-add" data-dir="right">向右接一段</button><button data-act="b-add" data-dir="left">向左</button><button data-act="b-add" data-dir="down">向下</button><button data-act="b-add" data-dir="up">向上</button><button data-act="b-add" data-dir="dup">复制此段</button></div>
    <div class="row">${b.wings.length > 1 ? '<button class="warn" data-act="b-delwing">删除这一段</button>' : ''}<button class="warn" data-act="b-del">删除整栋</button>${inBase && edited ? '<button data-act="b-revert">还原成原来的</button>' : ''}</div>
    <div style="color:var(--dim);margin-top:6px">拖楼 = 整栋移动；按住 Shift 拖 = 只移动这一段；拖白点 = 改这一段大小。「保存并生成预览」后换成新的建筑图。</div></div>`;
}
function shapeFields(o: any) {
  if (o.kind === 'rect') return `<div class="row"><label>x / y</label><input data-f="x" type="number" step="0.25" value="${o.x}"><input data-f="y" type="number" step="0.25" value="${o.y}"></div><div class="row"><label>宽 / 高</label><input data-f="w" type="number" step="0.25" value="${o.w}"><input data-f="h" type="number" step="0.25" value="${o.h}"></div>`;
  if (o.kind === 'ellipse') return `<div class="row"><label>圆心</label><input data-f="cx" type="number" step="0.25" value="${o.cx}"><input data-f="cy" type="number" step="0.25" value="${o.cy}"></div><div class="row"><label>半径</label><input data-f="rx" type="number" step="0.25" value="${o.rx}"><input data-f="ry" type="number" step="0.25" value="${o.ry}"></div>`;
  if (o.kind === 'stroke') return `<div class="row"><label>路宽</label><input data-f="w" type="number" min="0.25" max="60" step="0.25" value="${o.w}"></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="selflat" ${o.flat ? 'checked' : ''}> 两端切平</label></div>${o.mat === 'asphalt' ? `<div class="row"><label>车道线</label><select id="selmark">${[['', '无'], ['center', '虚中线'], ['edges', '两侧边线'], ['both', '中线+边线'], ['double', '双黄线']].map(([v, n]) => `<option value="${v}" ${(o.mark ?? '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}`;
  return '';
}
/** 选中的蓝图条目（已有的运动场地面/白线、围栏围墙、道路…）：改了就是"原位修改"，删除就是"去掉"，都可以恢复 */
function bpPanel(id: string, o: any): string {
  const it = bpById.get(id); const cat = BP_CATS.find((c) => c[0] === it?.cat)?.[1] ?? '';
  const edited = !!man.bp?.edit?.[id], hid = bpHidden(id);
  const kindName = ({ rect: '矩形', ellipse: '椭圆', capsule: '跑道形', poly: '多边形', stroke: '折线', fence: '围栏', prop: '连排' } as Record<string, string>)[o.kind] ?? o.kind;
  const nf = (k: string, label: string, step = 0.25, min?: number) => `<input data-bp="${k}" type="number" step="${step}" ${min !== undefined ? `min="${min}"` : ''} value="${o[k]}" title="${label}">`;
  let h = `<b>蓝图 · ${cat} · ${kindName}</b>${o.note ? `<div style="color:var(--dim)">${String(o.note).replace(/</g, '&lt;')}</div>` : ''}<div style="color:var(--dim)">${hid ? '已去掉（保存并生成预览后消失）' : edited ? '已修改（原位置 = 灰色虚线；生成预览后生效）' : '未修改——拖动、拖白点或改下面的数值就会变成修改'}</div>`;
  if (hid) return h + `<div class="row"><button class="pri" data-act="bp-revert">恢复</button></div>`;
  if (o.mat) h += `<div class="row"><label>材质</label><select id="bpmat">${MANUAL_MATS.map((m) => `<option value="${m.mat}" ${o.mat === m.mat ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>`;
  if (o.kind === 'rect') h += `<div class="row"><label>x / y</label>${nf('x', 'x')}${nf('y', 'y')}</div><div class="row"><label>宽 / 高</label>${nf('w', '宽', 0.25, 0.1)}${nf('h', '高', 0.25, 0.1)}</div>`;
  else if (o.kind === 'ellipse' || o.kind === 'capsule') h += `<div class="row"><label>圆心</label>${nf('cx', 'cx')}${nf('cy', 'cy')}</div><div class="row"><label>半径</label>${nf('rx', 'rx', 0.25, 0.1)}${nf('ry', 'ry', 0.25, 0.1)}</div>`;
  else if (o.kind === 'stroke') h += `<div class="row"><label>宽</label>${nf('w', '宽', o.mat === 'line' ? 0.01 : 0.25, 0.01)}</div>`;
  else if (o.kind === 'fence') h += `<div class="row"><label>砖柱间隔</label>${nf('piers', '砖柱间隔', 1, 1)}</div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="bpwall" ${o.wall ? 'checked' : ''}> 砖墙</label><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="bpforce" ${o.force ? 'checked' : ''}> 忽略地面</label></div>`;
  else if (o.kind === 'prop') h += `<div class="row"><label>间距</label>${nf('spacing', '间距', 0.25, 0.25)}</div>`;
  return h + `<div class="row">${edited ? '<button data-act="bp-revert">恢复原样</button>' : ''}<button class="warn" data-act="del">去掉</button></div>`;
}
$('side').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const sw = t.closest<HTMLElement>('.sw');
  if (sw?.dataset.mat) { mat = sw.dataset.mat; renderSide(); return; }
  if (sw?.dataset.obj) { objK = sw.dataset.obj; renderSide(); return; }
  if (sw?.dataset.fk) { fieldKind = sw.dataset.fk; renderSide(); return; }
  const actEl = t.closest<HTMLElement>('[data-act]'); const act = actEl?.dataset.act;
  if (act === 'tidy') { tidy(); renderSide(); return; }
  if (act === 'bp-revert' && sel?.t === 'bp') { const id = sel.id; mutate(() => { const st = bpState(); delete st.edit[id]; st.hide = st.hide.filter((h) => h !== id); }); return; }
  if (act === 'bp-reset') { if (confirm('把所有蓝图图形的「去掉」和「修改」都恢复成原样？（可以 Ctrl+Z 撤销）')) mutate(() => { delete man.bp; }); return; }
  if (act === 'merge') { mergeBuildings([...multi], (document.getElementById('mname') as HTMLInputElement | null)?.value ?? ''); renderSide(); dirty = true; return; }
  if (act === 'unmulti') { multi.clear(); renderSide(); dirty = true; return; }
  if (act?.startsWith('d-') && sel?.t === 'building') {
    const bs = sel;
    if (act === 'd-add') mutate(() => { const g = ensureEntry(bs.id).wings[bs.wing]; setDoorAt(bs.id, bs.wing, g.x + g.w / 2); });
    else if (act === 'd-del') mutate(() => { const g = ensureEntry(bs.id).wings[bs.wing]; delete g.door; });
    else if (act === 'd-main') mutate(() => { const en = ensureEntry(bs.id); en.wings.forEach((g, k) => { if (g.door) g.door.main = k === bs.wing; }); });
    return;
  }
  if (act?.startsWith('b-') && sel?.t === 'building') {
    const bs = sel; const wing = bs.wing;
    if (act === 'b-pick') { sel = { t: 'building', id: bs.id, wing: Number(actEl!.dataset.wing) }; renderSide(); dirty = true; }
    else if (act === 'b-add') addWing(bs.id, wing, actEl!.dataset.dir as any);
    else if (act === 'b-delwing') mutate(() => { const en = ensureEntry(bs.id); en.wings.splice(wing, 1); sel = { t: 'building', id: bs.id, wing: 0 }; });
    else if (act === 'b-del') { if (confirm('删除整栋楼？（可以 Ctrl+Z 撤销）')) deleteBuilding(bs.id); }
    else if (act === 'b-revert') mutate(() => { const l = bEntries(); const i = l.findIndex((x) => x.id === bs.id); if (i >= 0) l.splice(i, 1); sel = { t: 'building', id: bs.id, wing: Math.min(wing, (effBuilding(bs.id)?.wings.length ?? 1) - 1) }; });
    return;
  }
  if (act === 'del') deleteSel();
  else if (act === 'clear') { if (confirm('清空全部手动改动？（可以用 Ctrl+Z 撤销）')) mutate(() => { man = emptyManual(); sel = null; }); }
  else if (act === 'up' || act === 'down') { const i = man.shapes.findIndex((s) => s.id === (sel as any)?.id); const j = i + (act === 'up' ? 1 : -1); if (i >= 0 && j >= 0 && j < man.shapes.length) mutate(() => { [man.shapes[i], man.shapes[j]] = [man.shapes[j], man.shapes[i]]; }); }
});
$('side').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement; const o = findSel();
  if (sel?.t === 'building' && (t.id.startsWith('b') || t.dataset.bf || t.dataset.door)) {
    const bs = sel;
    const setAll = (fn: (g: ManualWing) => void) => mutate(() => { ensureEntry(bs.id).wings.forEach(fn); });
    if (t.id === 'bname') mutate(() => { const en = ensureEntry(bs.id); if (!en.sign || en.sign === en.name) en.sign = t.value.slice(0, 12); en.name = t.value.slice(0, 30) || en.name; });
    else if (t.id === 'bkind') mutate(() => { ensureEntry(bs.id).kind = t.value; });
    else if (t.id === 'binterior') mutate(() => { ensureEntry(bs.id).interior = t.value; }); // 空字符串 = 明确不要室内
    else if (t.id === 'bstyle') setAll((g) => { g.style = t.value; });
    else if (t.id === 'bfloors') setAll((g) => { g.f = Math.max(1, Math.min(12, Math.round(Number(t.value) || 4))); });
    else if (t.id === 'btone') setAll((g) => { g.roofTone = Number(t.value); });
    else if (t.id === 'bsign') mutate(() => { const en = ensureEntry(bs.id); if (t.value) en.sign = t.value.slice(0, 12); else delete en.sign; });
    else if (t.dataset.door) { const v = Number(t.value); if (Number.isFinite(v)) mutate(() => { const g = ensureEntry(bs.id).wings[bs.wing]; if (!g.door) return; if (t.dataset.door === 'tw') setDoorAt(bs.id, bs.wing, g.x + g.door.tx + g.door.tw / 2, Math.max(1, Math.min(8, v))); else setDoorAt(bs.id, bs.wing, v); }); }
    else if (t.dataset.bf) { const v = Number(t.value); if (Number.isFinite(v)) mutate(() => { const g = ensureEntry(bs.id).wings[bs.wing]; (g as any)[t.dataset.bf!] = (t.dataset.bf === 'w' || t.dataset.bf === 'd') ? Math.max(1, v) : v; }); }
    dirty = true; return;
  }
  if (t.id === 'tsang') { angStroke = Number(t.value); renderSide(); return; }
  if (t.id === 'tfang') { angFence = Number(t.value); renderSide(); return; }
  if (t.id === 'tsflat') { strokeFlat = t.checked; return; }
  if (t.id === 'tsmark') { strokeMark = t.value; return; }
  if (t.id === 'tffence') { fieldFence = t.checked; return; }
  if (t.id === 'tfgate') { fieldGate = t.value as any; return; }
  if (t.id === 'tflights') { fieldLights = t.checked; return; }
  if (t.id === 'tfwall') { fenceWall = t.value === '1'; return; }
  if (t.id === 'tfpiers') { fencePiers = Math.max(1, Math.min(40, Math.round(Number(t.value) || 4))); return; }
  if (t.id === 'tfforce') { fenceForce = t.checked; return; }
  if (t.id === 'terasebp') { eraseBp = t.checked; return; }
  if (t.dataset.bpcat) { bpCats[t.dataset.bpcat] = t.checked; dirty = true; return; }
  if (sel?.t === 'bp' && (t.id.startsWith('bp') || t.dataset.bp)) {
    const id = sel.id;
    if (t.id === 'bpmat') mutate(() => { ensureBpEdit(id).mat = t.value; });
    else if (t.id === 'bpwall') mutate(() => { const e = ensureBpEdit(id); if (t.checked) e.wall = true; else delete e.wall; });
    else if (t.id === 'bpforce') mutate(() => { const e = ensureBpEdit(id); if (t.checked) e.force = true; else delete e.force; });
    else if (t.dataset.bp) { const v = Number(t.value); if (Number.isFinite(v)) mutate(() => { ensureBpEdit(id)[t.dataset.bp!] = v; }); }
    dirty = true; return;
  }
  if (o && sel?.t === 'field' && t.id.startsWith('sf')) {
    mutate(() => { if (t.id === 'sfkind') o.kind = t.value; else if (t.id === 'sffence') { if (t.checked) { o.fence = true; o.gate ??= 'S'; } else delete o.fence; } else if (t.id === 'sfgate') o.gate = t.value; else if (t.id === 'sflights') { if (t.checked) o.lights = true; else delete o.lights; } else if (t.id === 'sfgoals') { if (t.checked) delete o.goals; else o.goals = false; } });
    dirty = true; return;
  }
  if (o && sel?.t === 'fence' && t.id.startsWith('se')) { mutate(() => { if (t.id === 'sewall') { if (t.value === '1') o.wall = true; else delete o.wall; } else if (t.id === 'seforce') { if (t.checked) o.force = true; else delete o.force; } }); dirty = true; return; }
  if (o && sel?.t === 'shape' && t.id === 'selflat') { mutate(() => { if (t.checked) o.flat = true; else delete o.flat; }); dirty = true; return; }
  if (o && sel?.t === 'shape' && t.id === 'selmark') { mutate(() => { if (t.value) o.mark = t.value; else delete o.mark; }); dirty = true; return; }
  if (t.id === 'roadw') roadW = Math.max(0.5, Number(t.value) || 3);
  else if (t.id === 'gap') rowGap = Math.max(0.5, Number(t.value) || 3);
  else if (t.id === 'what') eraseWhat = t.value as any;
  else if (t.id === 'snap') { snap = Number(t.value); }
  else if (t.id === 'season') { season = t.value; void reloadAtlas(); }
  else if (t.dataset.layer) { (layers as any)[t.dataset.layer] = t.checked; dirty = true; }
  else if (o && t.id === 'selmat') mutate(() => { o.mat = t.value; });
  else if (o && t.id === 'selk') mutate(() => { o.k = t.value; });
  else if (o && t.id === 'selwhat') mutate(() => { o.what = t.value; });
  else if (o && t.dataset.f) { const v = Number(t.value); if (Number.isFinite(v)) mutate(() => { o[t.dataset.f!] = v; }); }
  dirty = true;
});
async function reloadAtlas() { propsImg = await loadImg(`/gen/${await atlasName()}`); chunkImgs.clear(); chunkPending.length = 0; baseRev++; preloadAllChunks(); renderSide(); dirty = true; }

function toast(t: string, ms = 2600) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout((toast as any).tm); (toast as any).tm = setTimeout(() => { e.style.display = 'none'; }, ms); }
function refreshTop() {
  if (stale) { $('dirty').textContent = '⚠ 地图已更新（部署后并入），请刷新页面'; ($('dirty') as HTMLElement).style.color = 'var(--red)'; return; }
  const d = isDirty(); $('dirty').textContent = d ? '● 有未保存的修改' : '已保存'; ($('dirty') as HTMLElement).style.color = d ? 'var(--acc)' : 'var(--dim)';
  ($('undo') as HTMLButtonElement).disabled = !undoStack.length; ($('redo') as HTMLButtonElement).disabled = !redoStack.length;
}
/** 整理：去掉被后涂的图形完全盖住的旧图形、重复物件、被包住的擦除（结果的地图完全一样，只是不再留着冗余）；可以撤销 */
function tidy(silent = false): number {
  const r = simplifyManual(man), n = r.removed.shapes + r.removed.objects + r.removed.erase;
  if (!n) { if (!silent) toast('没有可整理的：没有被完全盖住的旧图形'); return 0; }
  mutate(() => { man = r.m; sel = null; });
  toast(`已整理：去掉被盖住的旧图形 ${r.removed.shapes} 块、重复物件 ${r.removed.objects} 个、被包住的擦除 ${r.removed.erase} 个（地图画面不变，可 Ctrl+Z 撤销）`, 5000);
  return n;
}
async function save(): Promise<boolean> {
  if (stale) { toast('地图已经更新（部署后并入了基础地图），请先刷新页面再保存，否则会把旧内容写回去', 6000); return false; }
  tidy(true); // 保存前自动整理一遍
  if (man.bp && !man.bp.hide.length && !Object.keys(man.bp.edit).length) delete man.bp; // 空的就不写进文件
  if (!man.fences?.length) delete man.fences; if (!man.fields?.length) delete man.fields;
  const errs = validateManual(man, { w: W.width / S, h: W.height / S });
  if (errs.length) { toast(`保存失败：${errs[0]}`, 5000); return false; }
  const r = await fetch('/api/manual', { method: 'POST', headers: { 'x-editor': '1', 'content-type': 'application/json' }, body: JSON.stringify(man) });
  if (!r.ok) { toast(`保存失败：${(await r.text()).slice(0, 120)}`, 5000); return false; }
  savedJson = snapshot(); refreshTop(); toast('已保存到 data/campus/manual.json'); return true;
}
async function buildPreview() {
  if (building) return; if (!(await save())) return;
  building = true; ($('build') as HTMLButtonElement).disabled = true;
  await fetch('/api/rebuild', { method: 'POST', headers: { 'x-editor': '1' } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = await getJson('/api/rebuild/status');
    $('status').textContent = s.running ? `生成中… ${s.sec} 秒` : '';
    if (!s.running) {
      building = false; ($('build') as HTMLButtonElement).disabled = false;
      if (s.ok) { try { ver = (await getJson('/api/info')).worldMtime; } catch { ver = Date.now(); } await loadWorld(); builtB = snapBuilt(); renderSide(); dirty = true; toast('预览已生成：现在看到的就是游戏里的样子'); }
      else toast(`生成失败：${s.log.split('\n').slice(-2).join(' ')}`, 8000);
      break;
    }
  }
}
$('rotl').onclick = () => setRot(rot - Math.PI / 12); $('rotr').onclick = () => setRot(rot + Math.PI / 12); $('rot0').onclick = () => setRot(0);
$('save').onclick = () => void save();
$('build').onclick = () => void buildPreview();
$('undo').onclick = undo; $('redo').onclick = redo;
$('jump').addEventListener('change', (e) => { const v = (e.target as HTMLSelectElement).value; if (!v) return; const [x, y] = v.split(',').map(Number); gotoU(x, y, 1.1); (e.target as HTMLSelectElement).value = ''; });
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', resize);

(window as any).__ed = { state: () => ({ tool, sel, drag, handles: handlesOf(), view, cursor }), toS, debug: () => ({ items: items.length, chunksLoaded: [...chunkImgs.values()].filter(Boolean).length, chunkKeys: chunkImgs.size, pending: chunkPending.length, loading: chunkLoading, mini: !!miniImg, baseRev, layers, cv: [cv.width, cv.height], baseCv: [baseCv.width, baseCv.height], season, wchunks: W.chunks.length, view }) }; // 调试/自动化测试用
/** 部署后 bake 会改写 baked.json：页面里的东西就过期了，提示刷新，并且不让保存（否则会把已并入的改动又写回 manual.json） */
async function checkStale() {
  try { const inf = await getJson('/api/info'); if (bakedM0 >= 0 && inf.bakedMtime !== bakedM0 && !stale) { stale = true; refreshTop(); toast('部署后编辑器的改动已并入基础地图——请刷新页面（Cmd/Ctrl+R）', 10000); } } catch { /* 服务停了就算了 */ }
}
setInterval(() => { if (!document.hidden) void checkStale(); }, 15000);
window.addEventListener('focus', () => void checkStale());
// ---------------------------------------------------------------- 启动
(async function main() {
  renderTools(); resize();
  $('status').textContent = '载入地图…';
  try { ver = (await getJson('/api/info')).worldMtime; } catch { ver = Date.now(); }
  await loadWorld();
  const jr = await fetch('/api/manual'); man = await jr.json(); man.buildings ??= []; savedJson = snapshot();
  try { const inf = await getJson('/api/info'); builtB = inf.worldMtime >= inf.manualMtime ? snapBuilt() : new Map(); bakedM0 = inf.bakedMtime; } catch { builtB = new Map(); }
  try { const raw = localStorage.getItem('pixel-editor-draft'); const d = raw ? JSON.parse(raw) : null; if (d && d.b === bakedM0 && d.m?.version === 1 && JSON.stringify(d.m) !== savedJson && confirm('发现上次没保存的草稿，恢复吗？（取消 = 用已保存的文件）')) { man = d.m; man.buildings ??= []; } else if (d && d.b !== bakedM0) localStorage.removeItem('pixel-editor-draft'); } catch { /* 忽略坏草稿 */ }
  $('jump').innerHTML = '<option value="">跳到…</option>' + [...W.pois].filter((p) => p.kind !== 'spawn').map((p) => `<option value="${p.x / S},${p.y / S}">${p.name}</option>`).join('') + '<option value="180,225">南门 → 图书馆中轴</option>'
    + [['太极广场与海棠园', 280, 228], ['图书馆西侧花草地与水渠', 147, 185], ['荷塘（信电学院西侧）', 90, 95], ['荷塘（文法/管商西侧）', 78, 150], ['文法/管商/体育与健康学院', 92, 150], ['机械/信电学院', 105, 95], ['材料/矿测/地球科学学院', 130, 100], ['西操场与体育综合馆', 45, 150], ['留学生公寓（44 号楼）', 299, 230], ['二社区', 112, 38], ['一社区', 55, 90]].map(([n, x, y]) => `<option value="${x},${y}">${n}</option>`).join('');
  gotoU(180, 228, 0.7);
  $('status').textContent = '';
  renderSide(); refreshTop();
  // 先排下一帧再画：就算某一帧出错，绘制循环也不会停（之前一次出错整个画面就卡死在半成品上）
  const loop = () => { requestAnimationFrame(loop); if (!dirty) return; dirty = false; try { draw(); } catch (e) { console.error('绘制出错', e); } };
  loop();
})();
