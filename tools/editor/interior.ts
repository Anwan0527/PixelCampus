/**
 * 室内编辑器（浏览器里跑，由 tools/editor/server.ts 用 esbuild 打包，页面 /interior）。
 * 编辑 data/interiors/<id>.json：房间大小/主题/门洞/窗户、家具摆放、NPC 与台词、墙上文字牌、是否开放入口。
 * 单位：格（16 px）。画面 = 上次生成的背景图（地板/墙/窗）+ 家具精灵（用游戏里同一套图集、同一套前后遮挡规则）。
 */
import { INTERIOR_THEMES, validateInterior, furnitureLabel, type InteriorSpec, type InteriorFurn, type Rot } from '../../src/shared/interior';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const cv = $('cv') as HTMLCanvasElement; const ctx = cv.getContext('2d')!;
const T = 16;
/** 二层以上没有南墙门洞：编辑器里按「零宽门洞」处理 */
const NOEXIT = { x: 0, w: 0 };
type RotInfo = { fw: number; fh: number; w: number; h: number; mx: number; my: number };
type Meta = { fw: number; fh: number; w: number; h: number; name: string; cat: string; top: boolean; rots: Record<number, RotInfo>; text?: { mode: 'h' | 'v'; def: string } };
type Frame = { x: number; y: number; w: number; h: number };

let specs: InteriorSpec[] = []; let meta: Record<string, Meta> = {}; let frames: Record<string, Frame> = {}; let atlasImg: HTMLImageElement | null = null;
const bgImgs = new Map<string, HTMLImageElement | null>();
let cur!: InteriorSpec; let savedJson = ''; let undoStack: string[] = []; let redoStack: string[] = [];
const view = { z: 3, x: 0, y: 0 }; // x,y = 画布左上角对应的房间像素坐标
type Tool = 'select' | 'place' | 'erase';
let tool: Tool = 'select'; let pk = 'sdesk'; let placeTop = false; let showFoot = false; let placeRot: Rot = 0;
type Sel = { t: 'f' | 'npc' | 'label' | 'win' | 'part'; i: number };
let sel: Sel[] = []; let cursor: [number, number] = [0, 0]; let mouseIn = false; let dirty = true; let building = false;
let drag: null | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'move'; start: [number, number]; orig: string; moved: boolean } | { kind: 'marquee'; a: [number, number] } = null;
let marquee: [number, number, number, number] | null = null;

const getJson = async (u: string) => (await fetch(u)).json();
const loadImg = (u: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(u)); i.src = u; });
const clone = <X,>(o: X): X => JSON.parse(JSON.stringify(o));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const snapshot = () => JSON.stringify(cur);
const isDirty = () => snapshot() !== savedJson;

// ---------------------------------------------------------------- 载入
async function loadAll(keepId?: string) {
  const r = await getJson('/api/interiors');
  specs = r.interiors; meta = r.furniture ?? {};
  if (!r.furniture) toast('没有家具目录——先在项目里运行 npm run assets:interiors', 8000);
  try {
    const aj = await getJson(`/gen/atlas-furniture.json?t=${Date.now()}`);
    frames = Object.fromEntries(Object.entries(aj.frames as Record<string, { frame: Frame }>).map(([k, v]) => [k, v.frame]));
    atlasImg = await loadImg(`/gen/atlas-furniture.png?t=${Date.now()}`);
  } catch { atlasImg = null; }
  bgImgs.clear();
  $('which').innerHTML = specs.map((s) => `<option value="${s.id}">${esc(s.name)}（${s.id}）</option>`).join('');
  const id = keepId && specs.some((s) => s.id === keepId) ? keepId : (specs.find((s) => s.open) ?? specs[0])?.id; // 默认打开已经开放的那一间
  if (id) await openRoom(id);
}
async function openRoom(id: string) {
  const s = specs.find((x) => x.id === id); if (!s) return;
  cur = clone(s); cur.furniture ??= []; savedJson = snapshot(); undoStack = []; redoStack = []; sel = [];
  ($('which') as HTMLSelectElement).value = id;
  await ensureBg(id);
  fit(); renderPalette(); renderSide(); refreshTop(); dirty = true;
}
async function ensureBg(id: string) { if (bgImgs.has(id)) return; bgImgs.set(id, null); try { bgImgs.set(id, await loadImg(`/gen/interior-${id}.png?t=${Date.now()}`)); } catch { bgImgs.set(id, null); } dirty = true; }
function fit() { const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio; view.z = Math.max(1, Math.min(6, Math.floor(Math.min(w / (cur.w * T + 40), h / (cur.h * T + 40)) * 2) / 2)); view.x = (cur.w * T) / 2 - w / 2 / view.z; view.y = (cur.h * T) / 2 - h / 2 / view.z; zoomLabel(); }
const zoomLabel = () => { $('zoomv').textContent = `缩放 ${Math.round(view.z * 100)}%`; };

// ---------------------------------------------------------------- 坐标
const toS = (x: number, y: number): [number, number] => [(x - view.x) * view.z, (y - view.y) * view.z]; // 房间像素 → 画布
const toR = (sx: number, sy: number): [number, number] => [sx / view.z + view.x, sy / view.z + view.y];
const tileOf = (e: MouseEvent): [number, number] => { const [x, y] = toR(e.offsetX, e.offsetY); return [Math.floor(x / T), Math.floor(y / T)]; };

// ---------------------------------------------------------------- 绘制
/** 这件家具当前朝向的占地/精灵信息（旋转后宽高互换；没有这个朝向时退回不旋转） */
const riOf = (f: InteriorFurn): RotInfo | null => { const m = meta[f.k]; if (!m) return null; return m.rots?.[f.rot ?? 0] ?? m.rots?.[0] ?? { fw: m.fw, fh: m.fh, w: m.w, h: m.h, mx: 1, my: m.h - 1 - m.fh * T }; };
const frameKey = (f: InteriorFurn) => (f.rot ? `${f.k}@${f.rot}` : f.k);
const depthOf = (f: InteriorFurn) => { const r = riOf(f); const b = (f.y + (r?.fh ?? 1)) * T; return f.top ? b + (f.dz ?? 24) + 0.1 : b; };
function drawFurn(f: InteriorFurn, alpha = 1) {
  const r = riOf(f), fr = frames[frameKey(f)]; if (!r || !fr || !atlasImg) return;
  const [sx, sy] = toS(f.x * T - r.mx, f.y * T - r.my); // 和游戏里同一个算法：精灵图的位置 = 占地左上角 − 占地在精灵图里的偏移
  ctx.globalAlpha = alpha; ctx.drawImage(atlasImg, fr.x, fr.y, fr.w, fr.h, sx, sy, fr.w * view.z, fr.h * view.z); ctx.globalAlpha = 1;
  const m = meta[f.k];
  if (f.text && m?.text) { const lb = furnitureLabel(f, { ...r, text: m.text.mode }); if (lb) drawLabelText(lb.text, lb.x, lb.y, lb.size ?? 10, lb.color ?? '#2a2a33', alpha); }
}
/** 家具上的字（和游戏里一样的位置、字号；竖排按行画） */
function drawLabelText(text: string, x: number, y: number, size: number, color: string, alpha = 1) {
  const [a, b] = toS(x * T, y * T); ctx.globalAlpha = alpha; ctx.font = `${size * view.z}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  const lines = text.split('\n'), lh = size * view.z * 1.15; lines.forEach((l, i) => ctx.fillText(l, a, b + (i - (lines.length - 1) / 2) * lh));
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
}
function footRects(f: InteriorFurn): [number, number, number, number] { const r = riOf(f); return [f.x, f.y, r?.fw ?? 1, r?.fh ?? 1]; }
function draw() {
  const w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#15110e'; ctx.fillRect(0, 0, w, h);
  if (!cur) return;
  const bg = bgImgs.get(cur.id);
  const [ox, oy] = toS(0, 0);
  if (bg) ctx.drawImage(bg, ox, oy, cur.w * T * view.z, cur.h * T * view.z); else { ctx.fillStyle = '#403a30'; ctx.fillRect(ox, oy, cur.w * T * view.z, cur.h * T * view.z); }
  // 家具：按和游戏里相同的层级排序
  const order = cur.furniture.map((f, i) => ({ f, i, d: depthOf(f) })).sort((a, b) => a.d - b.d || a.i - b.i);
  for (const { f } of order) drawFurn(f);
  // 网格
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.beginPath();
  for (let x = 0; x <= cur.w; x++) { const [sx] = toS(x * T, 0); ctx.moveTo(Math.round(sx) + 0.5, oy); ctx.lineTo(Math.round(sx) + 0.5, oy + cur.h * T * view.z); }
  for (let y = 0; y <= cur.h; y++) { const [, sy] = toS(0, y * T); ctx.moveTo(ox, Math.round(sy) + 0.5); ctx.lineTo(ox + cur.w * T * view.z, Math.round(sy) + 0.5); }
  ctx.stroke();
  // 占地（碰撞）：墙一圈半透明红，家具脚印淡红；门洞绿
  if (showFoot) {
    ctx.fillStyle = 'rgba(224,86,74,.22)';
    for (const f of cur.furniture) { if (f.top) continue; const [x, y, fw, fh] = footRects(f); const [a, b] = toS(x * T, y * T); ctx.fillRect(a, b, fw * T * view.z, fh * T * view.z); }
    const [a, b] = toS(0, 0); ctx.fillRect(a, b, cur.w * T * view.z, 3 * T * view.z); ctx.fillRect(a, b, T * view.z, cur.h * T * view.z); ctx.fillRect(a + (cur.w - 1) * T * view.z, b, T * view.z, cur.h * T * view.z);
  }
  { const [a, b] = toS((cur.exit ?? NOEXIT).x * T, (cur.h - 1) * T); ctx.fillStyle = 'rgba(80,200,110,.35)'; ctx.fillRect(a, b, (cur.exit ?? NOEXIT).w * T * view.z, T * view.z); ctx.fillStyle = '#bff0c8'; ctx.font = '12px sans-serif'; ctx.fillText('门洞（出口）', a + 4, b + 14); }
  // 窗户外框、文字牌、NPC
  (cur.windows ?? []).forEach((wd, i) => { const [a, b] = toS(wd.x * T, 5); ctx.strokeStyle = isSel('win', i) ? '#ffe070' : 'rgba(120,200,255,.7)'; ctx.lineWidth = isSel('win', i) ? 3 : 1.5; ctx.strokeRect(a, b, wd.w * T * view.z, 33 * view.z); });
  (cur.partitions ?? []).forEach((p, i) => { // 隔断：画面是上次生成的，这里叠一层半透明预览（青色 = 玻璃，绿色 = 内部门洞）
    const [a, b] = toS(p.x * T, p.y0 * T); ctx.fillStyle = 'rgba(120,200,255,.28)'; ctx.fillRect(a, b, T * view.z, (p.y1 - p.y0 + 1) * T * view.z);
    if (p.gap) { const [c, d] = toS(p.x * T, p.gap.y * T); ctx.fillStyle = 'rgba(80,200,110,.45)'; ctx.fillRect(c, d, T * view.z, p.gap.h * T * view.z); }
    ctx.strokeStyle = isSel('part', i) ? '#ffe070' : 'rgba(120,200,255,.8)'; ctx.lineWidth = isSel('part', i) ? 3 : 1.5; ctx.strokeRect(a, b, T * view.z, (p.y1 - p.y0 + 1) * T * view.z);
  });
  (cur.labels ?? []).forEach((l, i) => { const [a, b] = toS(l.x * T, l.y * T); ctx.font = `${(l.size ?? 10) * view.z}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = l.color ?? '#2a2a33'; ctx.fillText(l.text, a, b); const mw = ctx.measureText(l.text).width; ctx.strokeStyle = isSel('label', i) ? '#ffe070' : 'rgba(255,255,255,.3)'; ctx.lineWidth = isSel('label', i) ? 2 : 1; ctx.strokeRect(a - mw / 2 - 3, b - (l.size ?? 10) * view.z * 0.7, mw + 6, (l.size ?? 10) * view.z * 1.4); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; });
  (cur.npcs ?? []).forEach((n, i) => { const [a, b] = toS(n.x * T, n.y * T); ctx.fillStyle = '#3f9a58'; ctx.beginPath(); ctx.arc(a, b - 10 * view.z, 5 * view.z, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(a, b - 15 * view.z, 3 * view.z, 0, 7); ctx.fill(); ctx.strokeStyle = isSel('npc', i) ? '#ffe070' : '#fff'; ctx.lineWidth = isSel('npc', i) ? 3 : 1; ctx.strokeRect(a - 6 * view.z, b - 20 * view.z, 12 * view.z, 20 * view.z); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(n.name, a - 14, b + 12); });
  // 选中的家具
  for (const f of cur.furniture) if (f.interact) { const r = riOf(f); if (!r) continue; const [a, b] = toS((f.x + r.fw / 2) * T, f.y * T - (r.fh === 0 ? 4 : 0)); ctx.fillStyle = '#ffe070'; ctx.beginPath(); ctx.arc(a, b, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#2a2200'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('E', a, b + 3); ctx.textAlign = 'start'; } // 有互动的家具标一个 E
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffe070';
  for (const s of sel) if (s.t === 'f') { const f = cur.furniture[s.i]; if (!f) continue; const [x, y, fw, fh] = footRects(f); const [a, b] = toS(x * T, y * T); ctx.strokeRect(a, b, fw * T * view.z, Math.max(fh, 0.15) * T * view.z); }
  // 工具预览
  if (mouseIn && tool === 'place' && meta[pk]) {
    const f = newFurn(cursor[0], cursor[1]); drawFurn(f, 0.7);
    const [x, y, fw, fh] = footRects(f); const [a, b] = toS(x * T, y * T); ctx.strokeStyle = blocked(f) ? '#e0564a' : '#59c26a'; ctx.lineWidth = 2; ctx.strokeRect(a, b, fw * T * view.z, Math.max(fh, 0.15) * T * view.z);
  }
  if (mouseIn && tool === 'erase') { const [a, b] = toS(cursor[0] * T, cursor[1] * T); ctx.strokeStyle = '#e0564a'; ctx.lineWidth = 2; ctx.strokeRect(a, b, T * view.z, T * view.z); }
  if (marquee) { const [a, b] = toS(marquee[0] * T, marquee[1] * T), [c, d] = toS(marquee[2] * T, marquee[3] * T); ctx.fillStyle = 'rgba(240,192,64,.18)'; ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.5; ctx.fillRect(a, b, c - a, d - b); ctx.strokeRect(a, b, c - a, d - b); }
}
const isSel = (t: Sel['t'], i: number) => sel.some((s) => s.t === t && s.i === i);
/** 这件家具现在的位置会不会压到墙、别的家具（桌面小件和墙面挂件不算） */
function blocked(f: InteriorFurn): boolean {
  const m = riOf(f); if (!m || f.top || m.fh === 0) return false;
  for (let j = 0; j < m.fh; j++) for (let i = 0; i < m.fw; i++) {
    const x = f.x + i, y = f.y + j;
    if (x < 1 || x > cur.w - 2 || y < 3 || y > cur.h - 1 || (y === cur.h - 1 && !(x >= (cur.exit ?? NOEXIT).x && x < (cur.exit ?? NOEXIT).x + (cur.exit ?? NOEXIT).w))) return true;
    for (const p of cur.partitions ?? []) if (x === p.x && y >= p.y0 && y <= p.y1 && !(p.gap && y >= p.gap.y && y < p.gap.y + p.gap.h)) return true;
    for (const g of cur.furniture) { if (g === f || g.top) continue; const gm = riOf(g); if (!gm) continue; if (x >= g.x && x < g.x + gm.fw && y >= g.y && y < g.y + gm.fh) return true; }
  }
  return false;
}

// ---------------------------------------------------------------- 命中测试
function hitAt(rx: number, ry: number): Sel | null {
  const order = cur.furniture.map((f, i) => ({ f, i, d: depthOf(f) })).sort((a, b) => b.d - a.d || b.i - a.i); // 最上面的先判
  for (const { f, i } of order) {
    const r = riOf(f); if (!r) continue;
    const x0 = f.x * T - r.mx, y0 = f.y * T - r.my, fr = frames[frameKey(f)]; if (!fr) continue;
    if (rx >= x0 && rx <= x0 + fr.w && ry >= y0 && ry <= y0 + fr.h) return { t: 'f', i };
  }
  for (let i = (cur.npcs ?? []).length - 1; i >= 0; i--) { const n = cur.npcs![i]; if (Math.abs(rx - n.x * T) < 8 && ry < n.y * T + 2 && ry > n.y * T - 22) return { t: 'npc', i }; }
  for (let i = (cur.labels ?? []).length - 1; i >= 0; i--) { const l = cur.labels![i]; ctx.font = `${l.size ?? 10}px sans-serif`; const mw = ctx.measureText(l.text).width; if (Math.abs(rx - l.x * T) < mw / 2 + 3 && Math.abs(ry - l.y * T) < (l.size ?? 10)) return { t: 'label', i }; }
  for (let i = (cur.partitions ?? []).length - 1; i >= 0; i--) { const p = cur.partitions![i]; if (rx >= p.x * T && rx <= (p.x + 1) * T && ry >= p.y0 * T && ry <= (p.y1 + 1) * T) return { t: 'part', i }; }
  for (let i = (cur.windows ?? []).length - 1; i >= 0; i--) { const w = cur.windows![i]; if (rx >= w.x * T && rx <= (w.x + w.w) * T && ry >= 5 && ry <= 38) return { t: 'win', i }; }
  return null;
}

// ---------------------------------------------------------------- 修改（带撤销）
function pushUndo(s = snapshot()) { undoStack.push(s); if (undoStack.length > 200) undoStack.shift(); redoStack = []; }
function mutate(fn: () => void) { pushUndo(); fn(); changed(); }
function changed() { dirty = true; saveDraft(); refreshTop(); renderSide(); }
function restore(s: string) { cur = JSON.parse(s); sel = []; changed(); }
function undo() { const s = undoStack.pop(); if (s === undefined) return; redoStack.push(snapshot()); restore(s); }
function redo() { const s = redoStack.pop(); if (s === undefined) return; undoStack.push(snapshot()); restore(s); }
function saveDraft() { try { localStorage.setItem(`pixel-interior-draft-${cur.id}`, snapshot()); } catch { /* 没存成也不影响 */ } }
function refreshTop() { const d = isDirty(); $('dirty').textContent = d ? '● 有未保存的修改' : '已保存'; ($('dirty') as HTMLElement).style.color = d ? 'var(--acc)' : 'var(--dim)'; ($('undo') as HTMLButtonElement).disabled = !undoStack.length; ($('redo') as HTMLButtonElement).disabled = !redoStack.length; }
function toast(t: string, ms = 2600) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout((toast as any).tm); (toast as any).tm = setTimeout(() => { e.style.display = 'none'; }, ms); }

const ROT: string[][] = [['bchair_d', 'bchair_l', 'bchair_u', 'bchair_r'], ['chair', 'chairup']];
/** 旋转选中的家具：椅子在四个朝向的专用图之间切换（画得最好）；其他家具顺时针转 90°（Shift = 逆时针），占地的宽高跟着互换；墙面挂件不能转 */
function rotateSel(back = false) {
  const fs = sel.filter((s) => s.t === 'f'); if (!fs.length) return;
  if (!fs.some((s) => { const f = cur.furniture[s.i]; return ROT.some((r) => r.includes(f.k)) || meta[f.k]?.rots?.[90]; })) { toast('墙面挂件不能旋转'); return; }
  mutate(() => {
    for (const s of fs) {
      const f = cur.furniture[s.i]; const g = ROT.find((r) => r.includes(f.k));
      if (g) f.k = g[(g.indexOf(f.k) + (back ? g.length - 1 : 1)) % g.length];
      else if (meta[f.k]?.rots?.[90]) { const r = (((f.rot ?? 0) + (back ? 270 : 90)) % 360) as Rot; if (r) f.rot = r; else delete f.rot; }
    }
  });
}
function deleteSel() {
  if (!sel.length) return;
  mutate(() => {
    const kill = (t: Sel['t']) => new Set(sel.filter((s) => s.t === t).map((s) => s.i));
    const ff = kill('f'), nn = kill('npc'), ll = kill('label'), ww = kill('win'), pp = kill('part');
    cur.furniture = cur.furniture.filter((_, i) => !ff.has(i));
    if (cur.npcs) cur.npcs = cur.npcs.filter((_, i) => !nn.has(i));
    if (cur.labels) cur.labels = cur.labels.filter((_, i) => !ll.has(i));
    if (cur.windows) cur.windows = cur.windows.filter((_, i) => !ww.has(i));
    if (cur.partitions) { cur.partitions = cur.partitions.filter((_, i) => !pp.has(i)); if (!cur.partitions.length) delete cur.partitions; }
    sel = [];
  });
}
function duplicateSel() {
  const fs = sel.filter((s) => s.t === 'f'); if (!fs.length) return;
  mutate(() => { const start = cur.furniture.length; for (const s of fs) { const f = clone(cur.furniture[s.i]); f.x = Math.min(cur.w - 1, f.x + 1); f.y = Math.min(cur.h - 1, f.y + 1); cur.furniture.push(f); } sel = fs.map((_, k) => ({ t: 'f' as const, i: start + k })); });
}
function nudge(dx: number, dy: number) {
  if (!sel.length) return;
  mutate(() => {
    for (const s of sel) {
      if (s.t === 'f') { const f = cur.furniture[s.i]; f.x = Math.max(0, Math.min(cur.w - 1, f.x + dx)); f.y = Math.max(0, Math.min(cur.h - 1, f.y + dy)); }
      else if (s.t === 'npc') { const n = cur.npcs![s.i]; n.x += dx; n.y += dy; }
      else if (s.t === 'label') { const l = cur.labels![s.i]; l.x += dx; l.y += dy; }
      else if (s.t === 'win') { const w = cur.windows![s.i]; w.x = Math.max(1, Math.min(cur.w - 1 - w.w, w.x + dx)); }
      else if (s.t === 'part') { const p = cur.partitions![s.i]; p.x = Math.max(2, Math.min(cur.w - 3, p.x + dx)); }
    }
  });
}

/** 摆放时按 R 转"手里的"家具：椅子换朝向专用图，其他的转 90° */
function rotatePlace(back: boolean) {
  const g = ROT.find((r) => r.includes(pk));
  if (g) pk = g[(g.indexOf(pk) + (back ? g.length - 1 : 1)) % g.length];
  else if (meta[pk]?.rots?.[90]) placeRot = ((placeRot + (back ? 270 : 90)) % 360) as Rot; else { toast('墙面挂件不能旋转'); return; }
  dirty = true; renderPalette(); renderSide();
}
/** 按当前的摆放设置造一件新家具（带朝向；横幅/字画/白板带默认文字） */
function newFurn(x: number, y: number): InteriorFurn {
  const m = meta[pk]; const f: InteriorFurn = { k: pk, x, y };
  if (placeTop) f.top = true; if (placeRot && m?.rots?.[placeRot]) f.rot = placeRot; if (m?.text?.def) f.text = m.text.def;
  return f;
}
// ---------------------------------------------------------------- 鼠标
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mouseenter', () => { mouseIn = true; }); cv.addEventListener('mouseleave', () => { mouseIn = false; dirty = true; });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [rx, ry] = toR(e.offsetX, e.offsetY); view.z = Math.max(1, Math.min(8, view.z * Math.exp(-e.deltaY * 0.0015)));
  view.x = rx - e.offsetX / view.z; view.y = ry - e.offsetY / view.z; zoomLabel(); dirty = true;
}, { passive: false });
let spaceDown = false;
cv.addEventListener('mousedown', (e) => {
  (document.activeElement as HTMLElement | null)?.blur?.(); // 点画布时让输入框/下拉框失焦，否则方向键会被它们吃掉（"方向键没反应"）
  const t = tileOf(e); cursor = t;
  if (e.button === 1 || e.button === 2 || spaceDown) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
  if (e.button !== 0) return;
  const [rx, ry] = toR(e.offsetX, e.offsetY);
  if (tool === 'place') {
    if (!meta[pk]) return;
    const f = newFurn(t[0], t[1]);
    if (t[0] < 0 || t[1] < 0 || t[0] >= cur.w || t[1] >= cur.h) return;
    if (blocked(f)) { toast('这里放不下：压到墙或别的家具了（红框）。想叠在桌面上，请勾「摆在桌面上」'); return; }
    mutate(() => { cur.furniture.push(f); sel = [{ t: 'f', i: cur.furniture.length - 1 }]; }); return;
  }
  if (tool === 'erase') { const h = hitAt(rx, ry); if (h && h.t === 'f') mutate(() => { cur.furniture.splice(h.i, 1); sel = []; }); return; }
  const h = hitAt(rx, ry);
  if (h) {
    if (e.shiftKey) { if (isSel(h.t, h.i)) sel = sel.filter((s) => !(s.t === h.t && s.i === h.i)); else sel.push(h); }
    else if (!isSel(h.t, h.i)) sel = [h];
    drag = { kind: 'move', start: t, orig: snapshot(), moved: false }; renderSide(); dirty = true; return;
  }
  if (!e.shiftKey) sel = [];
  drag = { kind: 'marquee', a: t }; marquee = [t[0], t[1], t[0] + 1, t[1] + 1]; renderSide(); dirty = true;
});
window.addEventListener('mousemove', (e) => {
  if (drag?.kind === 'pan') { view.x = drag.vx - (e.clientX - drag.sx) / view.z; view.y = drag.vy - (e.clientY - drag.sy) / view.z; dirty = true; return; }
  if (e.target !== cv && !drag) return;
  const r = cv.getBoundingClientRect(); const [rx, ry] = toR(e.clientX - r.left, e.clientY - r.top); cursor = [Math.floor(rx / T), Math.floor(ry / T)]; dirty = true;
  $('pos').textContent = `格 ${cursor[0]}, ${cursor[1]}（房间 ${cur?.w}×${cur?.h}）`;
  if (drag?.kind === 'move') {
    const dx = cursor[0] - drag.start[0], dy = cursor[1] - drag.start[1];
    if (!drag.moved && (dx || dy)) { drag.moved = true; pushUndo(drag.orig); }
    if (drag.moved) {
      const o0 = JSON.parse(drag.orig) as InteriorSpec;
      for (const s of sel) {
        if (s.t === 'f') { const f = cur.furniture[s.i], g = o0.furniture[s.i]; f.x = Math.max(0, Math.min(cur.w - 1, g.x + dx)); f.y = Math.max(0, Math.min(cur.h - 1, g.y + dy)); }
        else if (s.t === 'npc') { const n = cur.npcs![s.i], g = o0.npcs![s.i]; n.x = g.x + dx; n.y = g.y + dy; }
        else if (s.t === 'label') { const l = cur.labels![s.i], g = o0.labels![s.i]; l.x = g.x + dx; l.y = g.y + dy; }
        else if (s.t === 'win') { const w = cur.windows![s.i], g = o0.windows![s.i]; w.x = Math.max(1, Math.min(cur.w - 1 - w.w, g.x + dx)); }
        else if (s.t === 'part') { const pp = cur.partitions![s.i], g = o0.partitions![s.i]; pp.x = Math.max(2, Math.min(cur.w - 3, g.x + dx)); }
      }
    }
  } else if (drag?.kind === 'marquee') { const a = drag.a; marquee = [Math.min(a[0], cursor[0]), Math.min(a[1], cursor[1]), Math.max(a[0], cursor[0]) + 1, Math.max(a[1], cursor[1]) + 1]; }
});
window.addEventListener('mouseup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.kind === 'move' && d.moved) changed();
  if (d.kind === 'marquee' && marquee) {
    const [x0, y0, x1, y1] = marquee; marquee = null;
    const add: Sel[] = [];
    cur.furniture.forEach((f, i) => { const [x, y, fw, fh] = footRects(f); if (x < x1 && x + fw > x0 && y < y1 && y + Math.max(fh, 1) > y0) add.push({ t: 'f', i }); });
    for (const a of add) if (!isSel(a.t, a.i)) sel.push(a);
    renderSide();
  }
  dirty = true;
});

// ---------------------------------------------------------------- 键盘
/** 方向键（含小键盘：NumLock 关时是方向键本身，开时是 8/2/4/6） */
const NUMPAD_DIR: Record<string, [number, number]> = { Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, -1], Numpad2: [0, 1] };
function dirOf(e: KeyboardEvent): [number, number] | null {
  if (e.key === 'ArrowLeft') return [-1, 0]; if (e.key === 'ArrowRight') return [1, 0]; if (e.key === 'ArrowUp') return [0, -1]; if (e.key === 'ArrowDown') return [0, 1];
  return NUMPAD_DIR[e.code] ?? null;
}
window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Escape') { sel = []; setTool('select'); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  const k = e.key.toLowerCase();
  if (k === 'v') setTool('select'); else if (k === 'b') setTool('place'); else if (k === 'x') setTool('erase'); else if (k === 'r') { if (tool === 'place') rotatePlace(e.shiftKey); else rotateSel(e.shiftKey); } else if (k === 'g') { showFoot = !showFoot; dirty = true; renderSide(); }
  else if (dirOf(e)) { e.preventDefault(); const [dx, dy] = dirOf(e)!; if (sel.length) nudge(dx, dy); else { view.x += (dx * 3 * T); view.y += (dy * 3 * T); dirty = true; } } // 有选中 = 微调位置；没选中 = 平移画面
  else if (e.key === '=' || e.key === '+') { view.z = Math.min(8, view.z * 1.25); zoomLabel(); dirty = true; } else if (e.key === '-') { view.z = Math.max(1, view.z * 0.8); zoomLabel(); dirty = true; }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

// ---------------------------------------------------------------- 界面
const TOOLS: [Tool, string, string][] = [['select', '选择', 'V'], ['place', '摆放', 'B'], ['erase', '擦除', 'X']];
const HELP: Record<Tool, string> = {
  select: '点选家具/NPC/文字牌/窗户，拖动移动；拖空地 = 框选多个（Shift+点击增减）；方向键微调，R 旋转（Shift+R 反向；椅子换朝向，其他转 90°），Ctrl+D 复制，Delete 删除，G 显示占地。',
  place: '在左侧选一件家具，点地图格子摆放（红框 = 压到墙或别的家具，放不下）。桌上的小件会自动摆在桌面上；也可以勾「摆在桌面上」让任何东西叠在桌子上。',
  erase: '点一件家具把它擦掉。',
};
function setTool(t: Tool) { tool = t; renderTools(); renderSide(); dirty = true; }
function renderTools() {
  $('tb').innerHTML = TOOLS.map(([t, n, k]) => `<button data-tool="${t}" class="${tool === t ? 'on' : ''}">${n} <small style="display:inline">${k}</small></button>`).join('');
  $('help').textContent = HELP[tool];
}
$('tb').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) setTool(b.dataset.tool as Tool); });

function thumb(key: string): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = c.height = 36; const f = frames[key]; if (f && atlasImg) { const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; const s = Math.min(36 / f.w, 36 / f.h, 1.5); x.drawImage(atlasImg, f.x, f.y, f.w, f.h, (36 - f.w * s) / 2, 36 - f.h * s, f.w * s, f.h * s); } return c; }
function renderPalette() {
  const cats = [...new Set(Object.values(meta).map((m) => m.cat))];
  $('palette').innerHTML = `<h4>家具（点一个，再到地图上点格子摆放）</h4>` + cats.map((c) => `<h4>${c}</h4><div class="grid">${Object.entries(meta).filter(([, m]) => m.cat === c).map(([k, m]) => `<div class="sw ${pk === k ? 'on' : ''}" data-pk="${k}" title="${k} · ${m.fw}×${m.fh} 格"><span data-th="${k}"></span><span class="nm">${m.name}</span></div>`).join('')}</div>`).join('');
  $('palette').querySelectorAll<HTMLElement>('[data-th]').forEach((el) => el.replaceWith(thumb(el.dataset.th!)));
}
$('palette').addEventListener('click', (e) => { const sw = (e.target as HTMLElement).closest<HTMLElement>('.sw'); if (!sw?.dataset.pk) return; pk = sw.dataset.pk; placeTop = !!meta[pk]?.top; placeRot = 0; setTool('place'); renderPalette(); }); // 桌上的小件默认摆在桌面上，其他东西默认占地

function renderSide() {
  if (!cur) return;
  const num = (id: string, v: number, extra = '') => `<input id="${id}" type="number" value="${v}" ${extra}>`;
  let h = `<h4>房间</h4>
    <div class="row"><label>名称</label><input id="rname" type="text" value="${esc(cur.name)}" style="flex:1;min-width:0"></div>
    <div class="row"><label>提示语</label><input id="rdesc" type="text" value="${esc(cur.desc ?? '')}" style="flex:1;min-width:0" placeholder="进门时显示的小字"></div>
    <div class="row"><label>主题</label><select id="rtheme">${INTERIOR_THEMES.map((t) => `<option value="${t.k}" ${cur.theme === t.k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
    <div class="row"><label>大小</label>${num('rw', cur.w, 'min="8" max="48"')}×${num('rh', cur.h, 'min="8" max="40"')} <span style="color:var(--dim)">格</span></div>
    <div class="row"><label>门洞</label>${num('rex', (cur.exit ?? NOEXIT).x, 'min="1"')}<label style="min-width:0">宽</label>${num('rew', (cur.exit ?? NOEXIT).w, 'min="2" max="6"')}</div>
    <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="rglass" ${cur.wallW === 'glass' ? 'checked' : ''}> 西墙玻璃隔断</label></div>
    <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="ropen" ${cur.open ? 'checked' : ''}> 开放入口（玩家能进）</label></div>
    <div style="color:var(--dim)">改了主题/大小/门洞/窗户后，要点「保存并生成预览」才会换画面；改了「开放入口」要再点「生成地图」。</div>
    <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="showfoot" ${showFoot ? 'checked' : ''}> 显示占地（G）</label></div>`;
  if (tool === 'place') h += `<h4>摆放</h4><div class="row"><b>${meta[pk]?.name ?? pk}</b> <span style="color:var(--dim)">${meta[pk]?.fw}×${meta[pk]?.fh} 格${placeRot ? ` · 转 ${placeRot}°` : ''}</span> <button data-act="rotplace">旋转（R）</button></div><div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" id="ptop" ${placeTop ? 'checked' : ''}> 摆在桌面上（不占地、盖在桌子上）</label></div>`;
  const one = sel.length === 1 ? sel[0] : null;
  if (sel.length > 1) h += `<h4>选中 ${sel.length} 项</h4><div id="sel"><div class="row"><button data-act="dup">复制</button><button data-act="rot">旋转椅子</button><button class="warn" data-act="del">删除</button></div></div>`;
  else if (one?.t === 'f') {
    const f = cur.furniture[one.i]; const m = meta[f?.k];
    if (f) h += `<h4>家具</h4><div id="sel"><b>${m?.name ?? f.k}</b> <span style="color:var(--dim)">${f.k}</span>
      <div class="row"><label>位置</label><input data-f="x" type="number" value="${f.x}"><input data-f="y" type="number" value="${f.y}"></div>
      <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" data-ftop ${f.top ? 'checked' : ''}> 摆在桌面上</label>${f.top ? `<label style="min-width:0">层级抬高</label><input data-f="dz" type="number" value="${f.dz ?? 24}" style="width:56px">` : ''}</div>
      <div class="row"><label>互动</label><input data-finteract type="text" maxlength="120" value="${esc(f.interact ?? '')}" placeholder="走近按 E 弹出的话（可留空）" style="flex:1;min-width:0"></div>
      ${m?.text ? `<div class="row"><label>文字</label><input data-ftext type="text" maxlength="16" value="${esc(f.text ?? '')}" placeholder="${m.text.mode === 'v' ? '竖排，如：天道酬勤' : '横排，如：数学建模协会'}" style="flex:1;min-width:0"></div>` : ''}
      ${m?.rots?.[90] || ROT.some((r) => r.includes(f.k)) ? `<div class="row"><label>朝向</label><span>${ROT.some((r) => r.includes(f.k)) ? '（椅子：R 换朝向）' : `${f.rot ?? 0}°`}</span></div>` : ''}
      <div class="row"><button data-act="dup">复制</button><button data-act="rot">旋转（R）</button><button class="warn" data-act="del">删除</button></div></div>`;
  } else if (one?.t === 'npc') {
    const n = cur.npcs![one.i];
    h += `<h4>NPC</h4><div id="sel"><div class="row"><label>名字</label><input data-n="name" type="text" value="${esc(n.name)}" maxlength="12" style="flex:1;min-width:0"></div>
      <div class="row"><label>外观</label><input data-n="look" type="number" min="0" max="20" value="${n.look}"><label style="min-width:0">朝向</label><select data-n="facing">${['down', 'up', 'left', 'right'].map((d) => `<option value="${d}" ${(n.facing ?? 'down') === d ? 'selected' : ''}>${{ down: '南', up: '北', left: '西', right: '东' }[d]}</option>`).join('')}</select></div>
      <div class="row"><label>位置</label><input data-n="x" type="number" step="0.5" value="${n.x}"><input data-n="y" type="number" step="0.5" value="${n.y}"></div>
      <div style="color:var(--dim)">台词（一行一句，最多 8 句）</div><textarea data-n="lines">${esc(n.lines.join('\n'))}</textarea>
      <div class="row"><button class="warn" data-act="del">删除这个 NPC</button></div></div>`;
  } else if (one?.t === 'label') {
    const l = cur.labels![one.i];
    h += `<h4>文字牌</h4><div id="sel"><div class="row"><label>文字</label><input data-l="text" type="text" value="${esc(l.text)}" maxlength="30" style="flex:1;min-width:0"></div>
      <div class="row"><label>位置</label><input data-l="x" type="number" step="0.25" value="${l.x}"><input data-l="y" type="number" step="0.25" value="${l.y}"></div>
      <div class="row"><label>字号</label><input data-l="size" type="number" min="6" max="24" value="${l.size ?? 10}"></div><div class="row"><button class="warn" data-act="del">删除</button></div></div>`;
  } else if (one?.t === 'win') {
    const w = cur.windows![one.i];
    h += `<h4>窗户（北墙）</h4><div id="sel"><div class="row"><label>位置/宽</label><input data-w="x" type="number" step="0.5" value="${w.x}"><input data-w="w" type="number" step="0.5" min="1" max="12" value="${w.w}"></div>
      <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" data-wcur ${w.curtain ? 'checked' : ''}> 挂窗帘</label></div><div class="row"><button class="warn" data-act="del">删除</button></div></div>`;
  } else if (one?.t === 'part') {
    const p = cur.partitions![one.i];
    h += `<h4>玻璃隔断（竖向）</h4><div id="sel"><div class="row"><label>所在列 x</label><input data-p="x" type="number" min="2" value="${p.x}"></div>
      <div class="row"><label>从行 / 到行</label><input data-p="y0" type="number" min="3" value="${p.y0}"><input data-p="y1" type="number" value="${p.y1}"></div>
      <div class="row"><label style="min-width:0;color:var(--fg)"><input type="checkbox" data-pgap ${p.gap ? 'checked' : ''}> 留内部门洞</label></div>
      ${p.gap ? `<div class="row"><label>门洞 起行/高</label><input data-p="gy" type="number" value="${p.gap.y}"><input data-p="gh" type="number" min="2" max="4" value="${p.gap.h}"></div>` : ''}
      <div style="color:var(--dim)">隔断挡路，只有门洞能过；画面要「保存并生成预览」才更新（这里先叠了一层半透明预览）。</div><div class="row"><button class="warn" data-act="del">删除这道隔断</button></div></div>`;
  } else h += `<h4>选中</h4><div id="sel"><span style="color:var(--dim)">点画面里的东西。</span></div>`;
  h += `<h4>添加</h4><div class="row" style="flex-wrap:wrap"><button data-act="addnpc">+ NPC</button><button data-act="addlabel">+ 文字牌</button><button data-act="addwin">+ 窗户</button><button data-act="addpart">+ 玻璃隔断</button></div>`;
  h += `<h4>统计</h4><div style="color:var(--dim)">家具 ${cur.furniture.length} 件 · NPC ${(cur.npcs ?? []).length} · 文字牌 ${(cur.labels ?? []).length} · 窗 ${(cur.windows ?? []).length} · 隔断 ${(cur.partitions ?? []).length}</div>`;
  h += `<h4>快捷键</h4><div style="color:var(--dim);line-height:1.9"><kbd>V</kbd>选择 <kbd>B</kbd>摆放 <kbd>X</kbd>擦除 <kbd>R</kbd>旋转 <kbd>方向键/小键盘</kbd>微调 <kbd>G</kbd>占地<br><kbd>空格</kbd>/右键拖动平移 · 滚轮缩放<br><kbd>Ctrl</kbd>+<kbd>Z</kbd>撤销 · <kbd>Ctrl</kbd>+<kbd>S</kbd>保存 · <kbd>Ctrl</kbd>+<kbd>D</kbd>复制</div>`;
  $('side').innerHTML = h;
}
$('side').addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act; if (!act) return;
  if (act === 'rotplace') rotatePlace(false); else if (act === 'del') deleteSel(); else if (act === 'dup') duplicateSel(); else if (act === 'rot') rotateSel();
  else if (act === 'addnpc') mutate(() => { (cur.npcs ??= []).push({ look: 2, x: Math.floor(cur.w / 2) + 0.5, y: cur.h - 4, name: '新同学', facing: 'down', lines: ['你好！'] }); sel = [{ t: 'npc', i: cur.npcs!.length - 1 }]; });
  else if (act === 'addlabel') mutate(() => { (cur.labels ??= []).push({ text: '文字', x: cur.w / 2, y: 1, size: 10, color: '#2a2a33' }); sel = [{ t: 'label', i: cur.labels!.length - 1 }]; });
  else if (act === 'addpart') mutate(() => { (cur.partitions ??= []).push({ x: Math.floor(cur.w / 2), y0: 3, y1: cur.h - 2, gap: { y: cur.h - 5, h: 3 } }); sel = [{ t: 'part', i: cur.partitions!.length - 1 }]; });
  else if (act === 'addwin') mutate(() => { (cur.windows ??= []).push({ x: Math.max(1, Math.floor(cur.w / 2) - 2), w: 4, curtain: true }); sel = [{ t: 'win', i: cur.windows!.length - 1 }]; });
});
$('side').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement; const one = sel.length === 1 ? sel[0] : null; const num = Number(t.value);
  if (t.id === 'showfoot') { showFoot = t.checked; dirty = true; return; }
  if (t.id === 'ptop') { placeTop = t.checked; dirty = true; return; }
  if (t.id === 'rname') mutate(() => { cur.name = t.value.slice(0, 30) || cur.name; });
  else if (t.id === 'rdesc') mutate(() => { if (t.value) cur.desc = t.value.slice(0, 80); else delete cur.desc; });
  else if (t.id === 'rtheme') mutate(() => { cur.theme = t.value as InteriorSpec['theme']; });
  else if (t.id === 'rw' || t.id === 'rh') { const w = t.id === 'rw' ? num : cur.w, h = t.id === 'rh' ? num : cur.h; if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || w > 48 || h < 8 || h > 40) { toast('宽 8~48、高 8~40（整数）'); renderSide(); return; } mutate(() => { cur.w = w; cur.h = h; cur.exit!.x = Math.min(cur.exit!.x, w - 1 - cur.exit!.w); cur.furniture = cur.furniture.filter((f) => f.x < w && f.y < h); }); }
  else if (t.id === 'rex' || t.id === 'rew') { const x = t.id === 'rex' ? num : cur.exit!.x, w = t.id === 'rew' ? num : cur.exit!.w; if (!Number.isInteger(x) || !Number.isInteger(w) || w < 2 || w > 6 || x < 1 || x + w > cur.w - 1) { toast('门洞要在南墙内（宽 2~6）'); renderSide(); return; } mutate(() => { cur.exit = { x, w }; }); }
  else if (t.id === 'rglass') mutate(() => { if (t.checked) cur.wallW = 'glass'; else delete cur.wallW; });
  else if (t.id === 'ropen') mutate(() => { if (t.checked) cur.open = true; else delete cur.open; });
  else if (one?.t === 'f') {
    const f = cur.furniture[one.i];
    if ((t as HTMLInputElement).dataset.finteract !== undefined) mutate(() => { const v = t.value.trim().slice(0, 120); if (v) f.interact = v; else delete f.interact; });
    else if ((t as HTMLInputElement).dataset.ftext !== undefined) mutate(() => { const v = t.value.trim().slice(0, 16); if (v) f.text = v; else delete f.text; });
    else if ((t as HTMLInputElement).dataset.ftop !== undefined) mutate(() => { if (t.checked) f.top = true; else { delete f.top; delete f.dz; } });
    else if (t.dataset.f && Number.isFinite(num)) mutate(() => { (f as any)[t.dataset.f!] = t.dataset.f === 'dz' ? Math.max(0, Math.min(200, num)) : Math.max(0, Math.round(num)); });
  } else if (one?.t === 'npc') {
    const n = cur.npcs![one.i], k = t.dataset.n!;
    mutate(() => { if (k === 'lines') n.lines = t.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8); else if (k === 'name') n.name = t.value.slice(0, 12) || n.name; else if (k === 'facing') n.facing = t.value as any; else if (Number.isFinite(num)) (n as any)[k] = k === 'look' ? Math.max(0, Math.min(20, Math.round(num))) : num; });
  } else if (one?.t === 'label') {
    const l = cur.labels![one.i], k = t.dataset.l!;
    mutate(() => { if (k === 'text') l.text = t.value.slice(0, 30) || l.text; else if (Number.isFinite(num)) (l as any)[k] = k === 'size' ? Math.max(6, Math.min(24, num)) : num; });
  } else if (one?.t === 'part') {
    const p = cur.partitions![one.i];
    if ((t as HTMLInputElement).dataset.pgap !== undefined) mutate(() => { if (t.checked) p.gap = { y: Math.min(p.y1 - 2, p.y0 + 2), h: 3 }; else delete p.gap; });
    else if (t.dataset.p && Number.isFinite(num)) mutate(() => { const k = t.dataset.p!, v = Math.round(num); if (k === 'gy' && p.gap) p.gap.y = v; else if (k === 'gh' && p.gap) p.gap.h = Math.max(2, Math.min(4, v)); else (p as any)[k] = v; });
  } else if (one?.t === 'win') {
    const w = cur.windows![one.i];
    if ((t as HTMLInputElement).dataset.wcur !== undefined) mutate(() => { if (t.checked) w.curtain = true; else delete w.curtain; });
    else if (t.dataset.w && Number.isFinite(num)) mutate(() => { (w as any)[t.dataset.w!] = num; });
  }
  dirty = true;
});

async function save(): Promise<boolean> {
  const errs = validateInterior(cur, new Set(Object.keys(meta)));
  if (errs.length) { toast(`保存失败：${errs[0]}`, 6000); return false; }
  const r = await fetch('/api/interior', { method: 'POST', headers: { 'x-editor': '1', 'content-type': 'application/json' }, body: JSON.stringify(cur) });
  if (!r.ok) { toast(`保存失败：${(await r.text()).slice(0, 160)}`, 6000); return false; }
  savedJson = snapshot(); const i = specs.findIndex((s) => s.id === cur.id); if (i >= 0) specs[i] = clone(cur); else specs.push(clone(cur));
  refreshTop(); toast(`已保存到 data/interiors/${cur.id}.json`); return true;
}
async function rebuild(what: 'interiors' | 'world') {
  if (building) return; if (!(await save())) return;
  building = true; ($('build') as HTMLButtonElement).disabled = ($('buildworld') as HTMLButtonElement).disabled = true;
  await fetch(`/api/rebuild?what=${what}`, { method: 'POST', headers: { 'x-editor': '1' } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 800));
    const s = await getJson('/api/rebuild/status'); $('status').textContent = s.running ? `生成中… ${s.sec} 秒` : '';
    if (!s.running) {
      building = false; ($('build') as HTMLButtonElement).disabled = ($('buildworld') as HTMLButtonElement).disabled = false;
      if (s.ok) { const id = cur.id, keep = snapshot(); await loadAll(id); if (keep !== snapshot()) { cur = JSON.parse(keep); } renderSide(); refreshTop(); dirty = true; toast(what === 'world' ? '地图已重新生成：「开放入口」的室内，门口会出现「进入」' : '室内画面已更新'); }
      else toast(`生成失败：${s.log.split('\n').slice(-2).join(' ')}`, 8000);
      break;
    }
  }
}
$('build').onclick = () => void rebuild('interiors'); $('buildworld').onclick = () => void rebuild('world');
$('save').onclick = () => void save(); $('undo').onclick = undo; $('redo').onclick = redo;
$('which').addEventListener('change', async (e) => { const id = (e.target as HTMLSelectElement).value; if (isDirty() && !confirm('当前这间有没保存的修改，切换会丢掉。继续吗？')) { ($('which') as HTMLSelectElement).value = cur.id; return; } await openRoom(id); });
$('newroom').onclick = async () => {
  const id = (prompt('新室内的 id（小写字母/数字/短横线，如 library-2f）') ?? '').trim(); if (!id) return;
  if (specs.some((s) => s.id === id)) { toast('这个 id 已经有了'); return; }
  const base: InteriorSpec = { id, name: '新房间', w: 20, h: 16, theme: 'office', exit: { x: 9, w: 3 }, desc: '走到南侧门口即可离开', furniture: [] };
  const errs = validateInterior(base, new Set(Object.keys(meta))); if (errs.length) { toast(errs[0]); return; }
  specs.push(base); $('which').innerHTML = specs.map((s) => `<option value="${s.id}">${esc(s.name)}（${s.id}）</option>`).join(''); await openRoom(id); savedJson = ''; refreshTop(); toast('已新建（还没保存）：摆好家具后点「保存并生成预览」');
};
$('dup').onclick = async () => {
  const id = (prompt('复制成新室内，新的 id：') ?? '').trim(); if (!id) return;
  if (specs.some((s) => s.id === id)) { toast('这个 id 已经有了'); return; }
  const c = clone(cur); c.id = id; c.name = `${cur.name}（副本）`; delete c.open;
  const errs = validateInterior(c, new Set(Object.keys(meta))); if (errs.length) { toast(errs[0]); return; }
  specs.push(c); $('which').innerHTML = specs.map((s) => `<option value="${s.id}">${esc(s.name)}（${s.id}）</option>`).join(''); await openRoom(id); savedJson = ''; refreshTop(); toast('已复制（还没保存）');
};
window.addEventListener('beforeunload', (e) => { if (cur && isDirty()) { e.preventDefault(); e.returnValue = ''; } });
function resize() { const r = cv.parentElement!.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; dirty = true; }
window.addEventListener('resize', resize);
(window as any).__ied = { state: () => ({ cur, sel, tool, view }), draw: () => { dirty = true; } };

(async function main() {
  renderTools(); resize();
  $('status').textContent = '载入…';
  await loadAll();
  try { const raw = cur && localStorage.getItem(`pixel-interior-draft-${cur.id}`); if (raw && raw !== savedJson && confirm('发现这间室内上次没保存的草稿，恢复吗？（取消 = 用已保存的文件）')) { cur = JSON.parse(raw); renderSide(); refreshTop(); } } catch { /* 忽略坏草稿 */ }
  $('status').textContent = '';
  const loop = () => { requestAnimationFrame(loop); if (!dirty) return; dirty = false; try { draw(); } catch (e) { console.error('绘制出错', e); } };
  loop();
})();
