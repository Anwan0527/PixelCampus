/**
 * 手动层（data/campus/manual.json）：地图编辑器（`npm run editor`）里手动调整的内容。
 * 编译地图时放在最后——涂的地面盖在所有自动生成的地面之上，摆的物件不会被自动清理掉，擦除会去掉范围内已有的物件。
 * 坐标单位和蓝图一样：原 5 m/格（编译时按世界放大倍数 ×S）。编辑器、编译、测试共用本文件。
 */
import type { Mat } from './blueprint';

export const MANUAL_VERSION = 1;

/** 编辑器里能涂的地面材质（顺序 = 调色板顺序）与中文名 */
export const MANUAL_MATS: { mat: Mat; name: string; color: string }[] = [
  { mat: 'lawn', name: '草坪', color: '#4f9a3a' }, { mat: 'grass', name: '野草地', color: '#5aa23f' }, { mat: 'forest', name: '林地', color: '#3f7f30' },
  { mat: 'asphalt', name: '沥青路', color: '#4a4a58' }, { mat: 'path', name: '人行道', color: '#b9b5a8' }, { mat: 'paver', name: '红砖路', color: '#b5654a' },
  { mat: 'plaza', name: '广场石板', color: '#d2cfc0' }, { mat: 'plazaDark', name: '深色石板', color: '#a9a69a' }, { mat: 'plazaWarm', name: '米黄铺装', color: '#dcc28f' },
  { mat: 'stone', name: '石面', color: '#9a978c' }, { mat: 'steps', name: '台阶', color: '#c9c4b2' }, { mat: 'dirt', name: '泥土', color: '#8a6a45' },
  { mat: 'sand', name: '沙地', color: '#d8c48a' }, { mat: 'water', name: '水', color: '#4a86b8' }, { mat: 'zebraH', name: '斑马线(竖条)', color: '#eeeeee' },
  { mat: 'zebraV', name: '斑马线(横条)', color: '#e6e6e6' }, { mat: 'line', name: '白线', color: '#ffffff' }, { mat: 'lineY', name: '黄线', color: '#e8c030' },
  { mat: 'track', name: '跑道', color: '#b5503a' }, { mat: 'pitch', name: '球场草', color: '#3f9a3a' }, { mat: 'rubber', name: '塑胶', color: '#678f9f' },
  { mat: 'boardwalk', name: '木栈道', color: '#9a6e3e' }, { mat: 'bedPink', name: '花带(粉)', color: '#d86a9a' }, { mat: 'bedYellow', name: '花带(黄)', color: '#e0c040' },
  { mat: 'courtBlue', name: '球场(蓝)', color: '#3f78c0' }, { mat: 'courtGreen', name: '球场(绿)', color: '#3f8a5a' }, { mat: 'courtRed', name: '球场(红)', color: '#c0503c' },
];

export const MANUAL_TREES: { k: string; name: string }[] = [
  { k: 'oakS', name: '小橡树' }, { k: 'oak', name: '橡树' }, { k: 'oakL', name: '大橡树' }, { k: 'poplar', name: '杨树' }, { k: 'ginkgo', name: '银杏' },
  { k: 'maple', name: '枫树' }, { k: 'blossom', name: '海棠' }, { k: 'pine', name: '松树' }, { k: 'willow', name: '柳树' },
];
export const MANUAL_PROPS: { k: string; name: string }[] = [
  { k: 'lamp', name: '路灯' }, { k: 'lampGold', name: '金色路灯' }, { k: 'bench', name: '长椅' }, { k: 'bin', name: '垃圾桶' }, { k: 'flowerbed', name: '花坛' },
  { k: 'bollard', name: '石球墩' }, { k: 'boulder', name: '庭石' }, { k: 'rockS', name: '小石头' }, { k: 'bikeRack', name: '车架' }, { k: 'pergola', name: '廊架' },
  { k: 'pavilion', name: '凉亭' }, { k: 'parasolTable', name: '遮阳伞桌椅' }, { k: 'noticeBoard', name: '公告牌' }, { k: 'fountain', name: '喷泉' }, { k: 'floodlight', name: '球场灯杆' },
  { k: 'sign', name: '指示牌' }, { k: 'stone', name: '石头' },
  { k: 'goal', name: '球门' }, { k: 'hoop', name: '篮球架' }, { k: 'bleacher', name: '看台' }, { k: 'stadium', name: '体育中心(大)' },
  { k: 'wallH', name: '砖墙(横)' }, { k: 'wallV', name: '砖墙(竖)' }, { k: 'fenceH', name: '铁栏(横)' }, { k: 'fenceV', name: '铁栏(竖)' }, { k: 'pier', name: '砖柱' }, { k: 'railV', name: '栏杆(竖)' },
];
const TREE_VARIANTS: Record<string, number> = { oak: 4, oakS: 3, oakL: 3, poplar: 3, ginkgo: 3, maple: 3, blossom: 3, pine: 3, willow: 2 };
const KEYS = new Set([...MANUAL_TREES, ...MANUAL_PROPS].map((e) => e.k));

/** 手动摆的物件对应的精灵名：树/花坛等有多个变体，按位置确定性地挑一个（同一位置永远同一个） */
export function manualSpriteKey(k: string, x: number, y: number): string {
  const h = (Math.imul(Math.round(x * 8), 73856093) ^ Math.imul(Math.round(y * 8), 19349663)) >>> 0;
  if (TREE_VARIANTS[k]) return `${k}_${1 + (h % TREE_VARIANTS[k])}`;
  if (k === 'flowerbed' || k === 'rockS') return `${k}_${1 + (h % 3)}`;
  if (k === 'parasolTable') return `${k}_${h % 3}`;
  return k;
}
export const isManualTree = (k: string) => !!TREE_VARIANTS[k];

export type ManualShape = { id: string; note?: string } & (
  | { kind: 'rect'; mat: Mat; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; mat: Mat; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'poly'; mat: Mat; pts: [number, number][] }
  | { kind: 'stroke'; mat: Mat; w: number; pts: [number, number][]; /** 沥青路的车道线：中线/边线/两者/双黄线 */ mark?: 'center' | 'edges' | 'both' | 'double'; /** 两端切平（垂直于路方向）；缺省 = 圆头，和蓝图里的路一致 */ flat?: boolean }
);
export interface ManualObject { id: string; k: string; x: number; y: number }
export interface ManualRow { id: string; k: string; pts: [number, number][]; spacing: number }
/** 擦除：矩形范围内已有的物件（all = 全部；trees = 只树；props = 只小品）。校园商店/校园墙不会被擦掉 */
export interface ManualErase { id: string; rect: [number, number, number, number]; what: 'all' | 'trees' | 'props' }
/** 围栏/围墙：沿折线放铁栏杆（wall = 砖墙）。force = 忽略地面（不在路口自动留口）；piers = 每隔几格立一根砖柱。斜线会变成阶梯状的横竖段 */
export interface ManualFence { id: string; pts: [number, number][]; wall?: boolean; piers?: number; force?: boolean }
/** 运动场地模板：一个矩形里自动铺好地面、白线、球门/篮架、围栏（带缺口）、灯杆；后面的层可以整体移动/改大小 */
export const FIELD_KINDS: { k: string; name: string; size: [number, number] }[] = [
  { k: 'soccer', name: '足球场', size: [13, 20] }, { k: 'basketball', name: '篮球场', size: [6, 11] }, { k: 'tennis', name: '网球场', size: [7, 14] }, { k: 'track', name: '田径场（跑道）', size: [22, 36] },
];
export interface ManualField { id: string; kind: string; x: number; y: number; w: number; h: number; fence?: boolean; gate?: 'N' | 'S' | 'E' | 'W'; lights?: boolean; goals?: boolean }
/** 蓝图里已有的图形/围栏的改动：hide = 去掉；edit = 原位替换（保持盖住/被盖的顺序）。键是编译导出的蓝图 id（文件#序号:指纹），见 tools/world/blueprint-load.ts */
export interface ManualBp { hide: string[]; edit: Record<string, Record<string, unknown>> }
/** 建筑的外墙风格、种类、屋面色（和蓝图一致），带中文名 */
export const BUILDING_STYLES: { k: string; name: string }[] = [
  { k: 'brick', name: '红砖' }, { k: 'brickPale', name: '浅红砖' }, { k: 'sand', name: '沙色' }, { k: 'white', name: '白墙' }, { k: 'civic', name: '大楼（深青玻璃带）' }, { k: 'glass', name: '玻璃' }, { k: 'hall', name: '礼堂' },
];
export const BUILDING_KINDS: { k: string; name: string }[] = [
  { k: 'teaching', name: '教学楼' }, { k: 'dorm', name: '宿舍' }, { k: 'library', name: '图书馆' }, { k: 'canteen', name: '食堂' }, { k: 'admin', name: '行政楼' },
  { k: 'lab', name: '实验楼' }, { k: 'sport', name: '体育' }, { k: 'service', name: '服务设施' }, { k: 'culture', name: '文化' }, { k: 'misc', name: '其他' },
];
export const ROOF_TONES = ['灰', '蓝', '红褐', '绿灰', '紫灰'];
const BSTYLE = new Set(BUILDING_STYLES.map((e) => e.k)), BKIND = new Set(BUILDING_KINDS.map((e) => e.k));

/**
 * 建筑的一段翼体（一个矩形体量；L 形、回字形的楼由几段拼成）。坐标是**脚印**（楼实际立在地上的位置，原 5 m 格），
 * 不再做卫星斜视角的屋顶→脚印换算（编译时按 ground: true 处理）。door.tx 是门左缘离翼体左缘的距离（原 5 m 格），tw 是门宽（游戏格）。
 */
export interface ManualWing { x: number; y: number; w: number; d: number; f?: number; style?: string; roof?: 'flat' | 'hip' | 'solar' | 'seam'; windows?: 'grid' | 'strip' | 'band' | 'none'; door?: { tx: number; tw: number; main?: boolean }; colonnade?: boolean; rot?: number; roofTone?: number }
/**
 * 手动改过的建筑：id 与已有建筑相同 = 整栋替换成这里的翼体（改位置/长度/拐弯）；id 是新的 = 新建筑；delete = 删掉这栋已有建筑。
 * fixed = 门卫亭这类小尺度建筑（放大世界时尺寸不变，只移动中心）。
 */
export interface ManualBuilding { id: string; name: string; kind: string; sign?: string; desc?: string; fixed?: boolean; roofTone?: number; interior?: string; delete?: boolean; wings: ManualWing[] }

/** 把编译导出的"放大后世界格"翼体（.cache/editor-buildings.json）还原成手动层里的原 5 m 格脚印（scale.ts 里 scaleBuildings 的逆运算） */
export function wingFromSpec(g: Record<string, any>, S: number, fixed = false): ManualWing {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  const w: ManualWing = fixed
    ? { x: r((g.x + g.w / 2) / S - g.w / 2), y: r((g.y + g.d / 2) / S - g.d / 2), w: g.w, d: g.d }
    : { x: r(g.x / S), y: r(g.y / S), w: r(g.w / S), d: r(g.d / S) };
  for (const k of ['f', 'style', 'roof', 'windows', 'colonnade', 'rot', 'roofTone'] as const) if (g[k] !== undefined) (w as any)[k] = g[k];
  if (g.door) w.door = fixed ? { ...g.door } : { tx: r((g.door.tx + g.door.tw / 2) / S - g.door.tw / 2), tw: g.door.tw, ...(g.door.main ? { main: true } : {}) };
  return w;
}

export interface ManualFile { version: number; shapes: ManualShape[]; objects: ManualObject[]; rows: ManualRow[]; erase: ManualErase[]; buildings?: ManualBuilding[]; fences?: ManualFence[]; fields?: ManualField[]; bp?: ManualBp }

type Box = [number, number, number, number];
const EPS = 1e-6;
/** 矩形 a 减去矩形 b，剩下的最多 4 块 */
function subtractBox(a: Box, b: Box): Box[] {
  const [ax0, ay0, ax1, ay1] = a, [bx0, by0, bx1, by1] = b;
  if (bx0 >= ax1 - EPS || bx1 <= ax0 + EPS || by0 >= ay1 - EPS || by1 <= ay0 + EPS) return [a];
  const out: Box[] = [], y0 = Math.max(ay0, by0), y1 = Math.min(ay1, by1);
  if (by0 > ay0 + EPS) out.push([ax0, ay0, ax1, by0]);
  if (by1 < ay1 - EPS) out.push([ax0, by1, ax1, ay1]);
  if (bx0 > ax0 + EPS) out.push([ax0, y0, bx0, y1]);
  if (bx1 < ax1 - EPS) out.push([bx1, y0, ax1, y1]);
  return out;
}
/** 图形的外接矩形（折线加上半个线宽）：外接矩形被盖住 ⇒ 图形一定被盖住（保守） */
export function shapeBox(s: ManualShape): Box {
  if (s.kind === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  if (s.kind === 'ellipse') return [s.cx - s.rx, s.cy - s.ry, s.cx + s.rx, s.cy + s.ry];
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]), pad = s.kind === 'stroke' ? s.w / 2 : 0;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}
const covered = (box: Box, rects: Box[]) => { let pieces: Box[] = [box]; for (const r of rects) { pieces = pieces.flatMap((p) => subtractBox(p, r)); if (!pieces.length) return true; } return false; };
/**
 * 去掉被后面的图形完全盖住的旧图形。地面是"后涂的替换先涂的"——被完全盖住的图形对最终地图没有任何贡献，留着只是历史包袱。
 * 只用后面的**矩形**当盖子（精确：可以几块矩形拼起来盖住）；laterRects = 更靠后的层里的矩形。结果和原来画出来的地图完全一样。
 */
export function simplifyShapes<T extends ManualShape>(shapes: T[], laterRects: Box[] = []): T[] {
  const rects = [...laterRects], keep: boolean[] = [];
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (covered(shapeBox(s), rects)) { keep[i] = false; continue; }
    keep[i] = true; if (s.kind === 'rect') rects.push(shapeBox(s));
  }
  return shapes.filter((_, i) => keep[i]);
}
/** 整理一份手动层：去掉被盖住的旧图形、同一位置重复摆的同种物件、被更大擦除范围包住的擦除；返回整理后的副本和各去掉了多少 */
export function simplifyManual(m: ManualFile): { m: ManualFile; removed: { shapes: number; objects: number; erase: number } } {
  const shapes = simplifyShapes(m.shapes);
  const seen = new Set<string>(), objects = m.objects.filter((o) => { const k = `${o.k}|${Math.round(o.x * 1000)}|${Math.round(o.y * 1000)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const inside = (a: ManualErase, b: ManualErase) => a.rect[0] >= b.rect[0] - EPS && a.rect[1] >= b.rect[1] - EPS && a.rect[0] + a.rect[2] <= b.rect[0] + b.rect[2] + EPS && a.rect[1] + a.rect[3] <= b.rect[1] + b.rect[3] + EPS && (b.what === 'all' || b.what === a.what);
  const erase = m.erase.filter((a, i) => !m.erase.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)));
  return { m: { ...m, shapes, objects, erase }, removed: { shapes: m.shapes.length - shapes.length, objects: m.objects.length - objects.length, erase: m.erase.length - erase.length } };
}
/** 已并入的各层：后面的层盖住的旧层图形也去掉（部署并入时整理一次，避免层层叠加越来越冗余） */
export function compactBaked(b: BakedFile): BakedFile {
  const later: Box[] = [], layers = [...b.layers];
  for (let i = layers.length - 1; i >= 0; i--) {
    const shapes = simplifyShapes(layers[i].shapes, later);
    layers[i] = { ...layers[i], shapes };
    for (const s of shapes) if (s.kind === 'rect') later.push(shapeBox(s));
  }
  return { ...b, layers };
}

/** 已部署并入基础地图的手动层：每次部署后把当时的 manual.json 作为一层追加（data/campus/baked.json），编辑器里的 manual.json 清空重来 */
export interface BakedFile { version: number; layers: (ManualFile & { at?: string; note?: string })[] }
export const emptyBaked = (): BakedFile => ({ version: MANUAL_VERSION, layers: [] });
export const isManualEmpty = (m: ManualFile) => !(m.shapes.length || m.objects.length || m.rows.length || m.erase.length || (m.buildings?.length ?? 0) || (m.fences?.length ?? 0) || (m.fields?.length ?? 0) || (m.bp?.hide.length ?? 0) || Object.keys(m.bp?.edit ?? {}).length);
/** 把手动层作为新的一层追加到已并入的各层后面（纯函数；层之间按顺序叠加，所以先后顺序不能变） */
export function appendLayer(baked: BakedFile, manual: ManualFile, at: string): BakedFile {
  return { version: baked.version, layers: [...baked.layers, { at, ...manual }] };
}
export function validateBaked(j: unknown, bounds = { w: 352, h: 272 }): string[] {
  if (!j || typeof j !== 'object' || !Array.isArray((j as BakedFile).layers)) return ['baked.json 不是 { layers: [] }'];
  const err: string[] = [];
  (j as BakedFile).layers.forEach((l, i) => { for (const e of validateManual(l, bounds)) err.push(`layers[${i}]: ${e}`); });
  return err;
}

// ------------------------------------------------------------ 运动场地模板 / 围栏
type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ShapeBody = DOmit<ManualShape, 'id' | 'note'>;
export interface FieldParts { shapes: ShapeBody[]; objects: { k: string; x: number; y: number }[]; fences: Omit<ManualFence, 'id'>[] }
const rnd3 = (v: number) => Math.round(v * 1000) / 1000;

/** 运动场形（两端半圆、中间直边）的多边形，长轴沿较长的一边；返回闭合点列（首点不重复） */
export function capsulePoly(x: number, y: number, w: number, h: number, n = 16): [number, number][] {
  const r = Math.min(w, h) / 2, out: [number, number][] = [];
  if (h >= w) {
    const cx = x + w / 2, c0 = y + r, c1 = y + h - r;
    for (let i = 0; i <= n; i++) { const t = Math.PI + (Math.PI * i) / n; out.push([cx + r * Math.cos(t), c0 + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = (Math.PI * i) / n; out.push([cx + r * Math.cos(t), c1 + r * Math.sin(t)]); }
  } else {
    const cy = y + h / 2, c0 = x + r, c1 = x + w - r;
    for (let i = 0; i <= n; i++) { const t = Math.PI / 2 + (Math.PI * i) / n; out.push([c0 + r * Math.cos(t), cy + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + (Math.PI * i) / n; out.push([c1 + r * Math.cos(t), cy + r * Math.sin(t)]); }
  }
  return out.map(([a, b]) => [rnd3(a), rnd3(b)]);
}

/**
 * 把一个运动场地模板展开成地面图形、物件（球门/篮架/灯杆）和围栏段。编译（手动层）和编辑器预览共用这一个函数。
 * 单位：原 5 m 格。长轴 = 较长的那一边；球门/篮架放在长轴两端；围栏沿矩形边缘，gate 那一侧留 2 格缺口。
 */
export function expandField(f: ManualField): FieldParts {
  const vertical = f.h >= f.w, L = vertical ? f.h : f.w, Wd = vertical ? f.w : f.h;
  const P = (a: number, b: number): [number, number] => (vertical ? [rnd3(f.x + b), rnd3(f.y + a)] : [rnd3(f.x + a), rnd3(f.y + b)]);
  const shapes: ShapeBody[] = [], objects: FieldParts['objects'] = [], fences: FieldParts['fences'] = [];
  const rectS = (mat: Mat, a0: number, b0: number, a1: number, b1: number) => {
    const [x0, y0] = P(a0, b0), [x1, y1] = P(a1, b1);
    shapes.push({ kind: 'rect', mat, x: Math.min(x0, x1), y: Math.min(y0, y1), w: rnd3(Math.abs(x1 - x0)), h: rnd3(Math.abs(y1 - y0)) });
  };
  const line = (pts: [number, number][], w = 0.13) => shapes.push({ kind: 'stroke', mat: 'line', w, pts: pts.map(([a, b]) => P(a, b)) });
  const box = (a0: number, b0: number, a1: number, b1: number, w?: number) => line([[a0, b0], [a1, b0], [a1, b1], [a0, b1], [a0, b0]], w);
  const circle = (a: number, b: number, r: number) => line(Array.from({ length: 25 }, (_, i) => [a + r * Math.cos((i / 24) * Math.PI * 2), b + r * Math.sin((i / 24) * Math.PI * 2)] as [number, number]));
  const arc = (ca: number, cb: number, r: number, t0: number, t1: number, flip: boolean) =>
    line(Array.from({ length: 13 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / 12; const da = r * Math.cos(t), db = r * Math.sin(t); return [flip ? ca - da : ca + da, cb + db] as [number, number]; }));
  const worldCapsule = (inset: number) => capsulePoly(f.x + inset, f.y + inset, f.w - 2 * inset, f.h - 2 * inset);
  if (f.kind === 'soccer') {
    rectS('pitch', 0, 0, L, Wd); box(0, 0, L, Wd); line([[L / 2, 0], [L / 2, Wd]]); circle(L / 2, Wd / 2, 0.135 * Wd);
    const pd = 0.157 * L, pw = 0.593 * Wd, gd = 0.052 * L, gw = 0.27 * Wd;
    for (const [a0, a1] of [[0, pd], [L - pd, L]]) box(a0, (Wd - pw) / 2, a1, (Wd + pw) / 2);
    for (const [a0, a1] of [[0, gd], [L - gd, L]]) box(a0, (Wd - gw) / 2, a1, (Wd + gw) / 2);
    if (f.goals !== false) { const [x0, y0] = P(Math.min(1.1, L * 0.1), Wd / 2), [x1, y1] = P(L, Wd / 2); objects.push({ k: 'goal', x: x0, y: y0 }, { k: 'goal', x: x1, y: y1 }); }
  } else if (f.kind === 'basketball') {
    rectS('courtRed', 0, 0, L, Wd); box(0, 0, L, Wd); line([[L / 2, 0], [L / 2, Wd]]); circle(L / 2, Wd / 2, 0.12 * Wd);
    const kd = 0.207 * L, kw = 0.327 * Wd;
    box(0, (Wd - kw) / 2, kd, (Wd + kw) / 2); box(L - kd, (Wd - kw) / 2, L, (Wd + kw) / 2);
    arc(0.056 * L, Wd / 2, 0.45 * Wd, -1.3, 1.3, false); arc(L - 0.056 * L, Wd / 2, 0.45 * Wd, -1.3, 1.3, true);
    if (f.goals !== false) { const d = 0.045 * L + 0.2; const [x0, y0] = P(d, Wd / 2), [x1, y1] = P(L - d, Wd / 2); objects.push({ k: 'hoop', x: x0, y: y0 }, { k: 'hoop', x: x1, y: y1 }); }
  } else if (f.kind === 'tennis') {
    rectS('courtGreen', 0, 0, L, Wd);
    const a0 = 0.175 * L, a1 = L - 0.175 * L, b0 = 0.2 * Wd, b1 = Wd - 0.2 * Wd, sb0 = b0 + 0.125 * (b1 - b0), sb1 = b1 - 0.125 * (b1 - b0), sv = 0.269 * (a1 - a0);
    rectS('courtBlue', a0, b0, a1, b1); box(a0, b0, a1, b1);
    line([[L / 2, b0 - 0.12], [L / 2, b1 + 0.12]], 0.2); line([[a0, sb0], [a1, sb0]]); line([[a0, sb1], [a1, sb1]]);
    line([[L / 2 - sv, sb0], [L / 2 - sv, sb1]]); line([[L / 2 + sv, sb0], [L / 2 + sv, sb1]]); line([[L / 2 - sv, Wd / 2], [L / 2 + sv, Wd / 2]]);
  } else if (f.kind === 'track') {
    const m = 0.06 * Wd, band = 0.135 * Wd;
    const [rx0, ry0] = P(0, 0), [rx1, ry1] = P(L, Wd);
    shapes.push({ kind: 'rect', mat: 'rubber', x: Math.min(rx0, rx1), y: Math.min(ry0, ry1), w: rnd3(Math.abs(rx1 - rx0)), h: rnd3(Math.abs(ry1 - ry0)) });
    shapes.push({ kind: 'poly', mat: 'track', pts: worldCapsule(m) });
    shapes.push({ kind: 'poly', mat: 'pitch', pts: worldCapsule(m + band) });
    for (let i = 0; i <= 4; i++) { const pts = worldCapsule(m + (band * i) / 4); shapes.push({ kind: 'stroke', mat: 'line', w: 0.08, pts: [...pts, pts[0]] }); }
  }
  if (f.fence) {
    const g = f.gate ?? 'S', x0 = f.x, y0 = f.y, x1 = f.x + f.w, y1 = f.y + f.h, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const edges: { side: 'N' | 'S' | 'E' | 'W'; a: [number, number]; b: [number, number] }[] = [
      { side: 'N', a: [x0, y0], b: [x1, y0] }, { side: 'E', a: [x1, y0], b: [x1, y1] }, { side: 'S', a: [x0, y1], b: [x1, y1] }, { side: 'W', a: [x0, y0], b: [x0, y1] },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      if (e.side === g && len > 3.5) {
        const horiz = e.side === 'N' || e.side === 'S', c = horiz ? cx : cy;
        const mk = (t: number): [number, number] => (horiz ? [rnd3(t), e.a[1]] : [e.a[0], rnd3(t)]);
        const s0 = horiz ? e.a[0] : e.a[1], s1 = horiz ? e.b[0] : e.b[1];
        fences.push({ pts: [mk(s0), mk(c - 1)], piers: 5, force: true }, { pts: [mk(c + 1), mk(s1)], piers: 5, force: true });
      } else fences.push({ pts: [[rnd3(e.a[0]), rnd3(e.a[1])], [rnd3(e.b[0]), rnd3(e.b[1])]], piers: 5, force: true });
    }
  }
  if (f.lights) for (const [lx, ly] of [[f.x + 0.9, f.y + 0.9], [f.x + f.w - 0.9, f.y + 0.9], [f.x + 0.9, f.y + f.h - 0.9], [f.x + f.w - 0.9, f.y + f.h - 0.9]]) objects.push({ k: 'floodlight', x: rnd3(lx), y: rnd3(ly) });
  return { shapes, objects, fences };
}

/**
 * 围栏沿折线分成逐格的小段（和蓝图 fence 同一算法）：pts 是**世界格**坐标。每格 = 判定点 (px,py)（用来判断路口留口/楼内）+ 要放的精灵。
 * 横向（|dx|≥|dy|）放 fenceH（wallH 仅当 wallH=true，手动围墙用），竖向放 fenceV/wallV；每隔 every 格和段尾立砖柱。
 */
export interface FenceCell { px: number; py: number; items: { k: string; x: number; y: number }[] }
export function fenceCells(pts: [number, number][], every: number, wall: boolean, wallH = false): FenceCell[] {
  const out: FenceCell[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, items: FenceCell['items'] = [];
      if (horiz) {
        const cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 0.9;
        items.push({ k: wall && wallH ? 'wallH' : 'fenceH', x: cx, y: cy });
        if (k % every === 0) items.push({ k: 'pier', x: cx - 0.2, y: cy + 0.04 });
        if (k === n - 1) items.push({ k: 'pier', x: cx + 0.2, y: cy + 0.04 });
      } else {
        const cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 1.0;
        items.push({ k: wall ? 'wallV' : 'fenceV', x: cx, y: cy });
        if (k % every === 0) items.push({ k: 'pier', x: cx, y: cy - 0.55 });
        if (k === n - 1) items.push({ k: 'pier', x: cx, y: cy - 0.02 });
      }
      out.push({ px: x, py: y, items });
    }
  }
  return out;
}

export const emptyManual = (): ManualFile => ({ version: MANUAL_VERSION, shapes: [], objects: [], rows: [], erase: [], buildings: [] });

/** 沿折线按间距取点（含两端），和蓝图里的 prop 行同一算法 */
export function rowPoints(pts: [number, number][], spacing: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / spacing));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

const MATS = new Set<string>(MANUAL_MATS.map((m) => m.mat));
/** 校验手动层，返回错误列表（空 = 合法）。编辑器保存前、编译前、测试都用它 */
export function validateManual(j: unknown, bounds = { w: 352, h: 272 }): string[] {
  const err: string[] = [];
  if (!j || typeof j !== 'object') return ['不是对象'];
  const m = j as Partial<ManualFile>;
  if (m.version !== MANUAL_VERSION) err.push(`version 应为 ${MANUAL_VERSION}`);
  for (const key of ['shapes', 'objects', 'rows', 'erase'] as const) if (!Array.isArray(m[key])) err.push(`${key} 不是数组`);
  if (err.length) return err;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const inB = (x: number, y: number) => x >= -2 && y >= -2 && x <= bounds.w + 2 && y <= bounds.h + 2;
  const pts = (p: unknown, min: number) => Array.isArray(p) && p.length >= min && p.length <= 400 && p.every((q) => Array.isArray(q) && q.length === 2 && num(q[0]) && num(q[1]) && inB(q[0], q[1]));
  const ids = new Set<string>();
  const id = (o: { id?: unknown }, where: string) => { if (typeof o.id !== 'string' || !o.id) err.push(`${where}: 缺 id`); else if (ids.has(o.id)) err.push(`${where}: id 重复 ${o.id}`); else ids.add(o.id); };
  if (m.shapes!.length > 3000 || m.objects!.length > 6000 || m.rows!.length > 1000 || m.erase!.length > 3000) err.push('条目太多');
  m.shapes!.forEach((s, i) => {
    const w = `shapes[${i}]`; id(s, w);
    if (!MATS.has(s.mat)) err.push(`${w}: 未知材质 ${s.mat}`);
    if (s.kind === 'rect') { if (![s.x, s.y, s.w, s.h].every(num) || s.w <= 0 || s.h <= 0 || !inB(s.x, s.y)) err.push(`${w}: 矩形不合法`); }
    else if (s.kind === 'ellipse') { if (![s.cx, s.cy, s.rx, s.ry].every(num) || s.rx <= 0 || s.ry <= 0 || !inB(s.cx, s.cy)) err.push(`${w}: 椭圆不合法`); }
    else if (s.kind === 'poly') { if (!pts(s.pts, 3)) err.push(`${w}: 多边形顶点不合法`); }
    else if (s.kind === 'stroke') { if (!pts(s.pts, 2) || !num(s.w) || s.w <= 0 || s.w > 60 || (s.mark !== undefined && !['center', 'edges', 'both', 'double'].includes(s.mark))) err.push(`${w}: 折线不合法`); }
    else err.push(`${w}: 未知类型`);
  });
  m.objects!.forEach((o, i) => { id(o, `objects[${i}]`); if (!KEYS.has(o.k) || !num(o.x) || !num(o.y) || !inB(o.x, o.y)) err.push(`objects[${i}]: 不合法`); });
  m.rows!.forEach((r, i) => { id(r, `rows[${i}]`); if (!KEYS.has(r.k) || !pts(r.pts, 2) || !num(r.spacing) || r.spacing < 0.3 || r.spacing > 60) err.push(`rows[${i}]: 不合法`); else if (rowPoints(r.pts, r.spacing).length > 1500) err.push(`rows[${i}]: 太密`); });
  if (m.fences !== undefined) {
    if (!Array.isArray(m.fences) || m.fences.length > 800) err.push('fences 不合法');
    else m.fences.forEach((f, i) => { id(f, `fences[${i}]`); if (!pts(f.pts, 2) || (f.piers !== undefined && (!num(f.piers) || f.piers < 1 || f.piers > 40))) err.push(`fences[${i}]: 不合法`); });
  }
  if (m.fields !== undefined) {
    if (!Array.isArray(m.fields) || m.fields.length > 200) err.push('fields 不合法');
    else m.fields.forEach((f, i) => {
      id(f, `fields[${i}]`);
      if (!FIELD_KINDS.some((k) => k.k === f.kind) || ![f.x, f.y, f.w, f.h].every(num) || f.w < 3 || f.h < 3 || f.w > 80 || f.h > 80 || !inB(f.x, f.y) || !inB(f.x + f.w, f.y + f.h) || (f.gate !== undefined && !['N', 'S', 'E', 'W'].includes(f.gate))) err.push(`fields[${i}]: 不合法`);
    });
  }
  if (m.bp !== undefined) {
    const bp = m.bp as Partial<ManualBp>;
    if (!bp || !Array.isArray(bp.hide) || bp.hide.length > 3000 || !bp.hide.every((h) => typeof h === 'string' && h.length > 0 && h.length < 80) || !bp.edit || typeof bp.edit !== 'object') err.push('bp 不合法');
    else for (const [bid, e] of Object.entries(bp.edit)) {
      const w = `bp.edit[${bid}]`;
      if (bid.length >= 80 || !e || typeof e !== 'object') { err.push(`${w}: 不合法`); continue; }
      const ex = e as Record<string, any>;
      if (!['rect', 'ellipse', 'capsule', 'poly', 'stroke', 'fence', 'prop'].includes(ex.kind)) err.push(`${w}: 未知类型`);
      else if (ex.mat !== undefined && !MATS.has(ex.mat)) err.push(`${w}: 未知材质`);
      else if (ex.pts !== undefined && !pts(ex.pts, 2)) err.push(`${w}: 顶点不合法`);
      else if (['rect', 'ellipse', 'capsule'].includes(ex.kind) && !(['rect'].includes(ex.kind) ? [ex.x, ex.y, ex.w, ex.h] : [ex.cx, ex.cy, ex.rx, ex.ry]).every(num)) err.push(`${w}: 尺寸不合法`);
    }
  }
  m.erase!.forEach((e, i) => { id(e, `erase[${i}]`); if (!Array.isArray(e.rect) || e.rect.length !== 4 || !e.rect.every(num) || e.rect[2] <= 0 || e.rect[3] <= 0 || !['all', 'trees', 'props'].includes(e.what)) err.push(`erase[${i}]: 不合法`); });
  if (m.buildings !== undefined) {
    if (!Array.isArray(m.buildings) || m.buildings.length > 400) err.push('buildings 不合法');
    else {
      const bids = new Set<string>();
      m.buildings.forEach((b, i) => {
        const w = `buildings[${i}]`;
        if (typeof b.id !== 'string' || !b.id || b.id.length > 60 || bids.has(b.id)) err.push(`${w}: id 缺失或重复`); else bids.add(b.id);
        if (typeof b.name !== 'string' || !b.name || b.name.length > 30) err.push(`${w}: 名字 1~30 字`);
        if (!BKIND.has(b.kind)) err.push(`${w}: 未知种类 ${b.kind}`);
        if (b.sign !== undefined && (typeof b.sign !== 'string' || b.sign.length > 12)) err.push(`${w}: 门头牌子最多 12 字`);
        if (b.interior !== undefined && (typeof b.interior !== 'string' || b.interior.length > 40)) err.push(`${w}: interior 不合法`);
        if (b.delete) return;
        if (!Array.isArray(b.wings) || b.wings.length < 1 || b.wings.length > 48) { err.push(`${w}: 翼体 1~48 段`); return; }
        b.wings.forEach((g, k) => {
          const ww = `${w}.wings[${k}]`;
          if (![g.x, g.y, g.w, g.d].every(num) || g.w < 0.5 || g.d < 0.5 || g.w > 120 || g.d > 120 || !inB(g.x, g.y) || !inB(g.x + g.w, g.y + g.d)) err.push(`${ww}: 位置/大小不合法`);
          if (g.f !== undefined && (!Number.isInteger(g.f) || g.f < 1 || g.f > 12)) err.push(`${ww}: 层数 1~12`);
          if (g.style !== undefined && !BSTYLE.has(g.style)) err.push(`${ww}: 未知风格`);
          if (g.roof !== undefined && !['flat', 'hip', 'solar', 'seam'].includes(g.roof)) err.push(`${ww}: 未知屋顶`);
          if (g.windows !== undefined && !['grid', 'strip', 'band', 'none'].includes(g.windows)) err.push(`${ww}: 未知窗型`);
          if (g.door !== undefined && (!num(g.door.tx) || !num(g.door.tw) || g.door.tw <= 0 || g.door.tw > 12)) err.push(`${ww}: 门不合法`);
          if (g.rot !== undefined && !num(g.rot)) err.push(`${ww}: 旋转不合法`);
          if (g.roofTone !== undefined && (!Number.isInteger(g.roofTone) || g.roofTone < 0 || g.roofTone > 9)) err.push(`${ww}: 屋面色 0~9`);
        });
      });
    }
  }
  return err;
}
