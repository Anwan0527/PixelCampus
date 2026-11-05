/**
 * 建筑翼体生成器（斜投影：屋顶俯视 + 南立面）。
 *
 * 投影约定（与 docs/SCALE.md 一致）：
 *   地面 1:1（1 tile = 16px），竖直方向每层 FLOOR_PX 像素。
 *   一个翼体 = 平面矩形 (x,y,w,d)[tile] + 层数 f。
 *   精灵高度 = d*16（屋顶面）+ wallH（南立面）。精灵底边 = 平面南缘 = 深度排序基线。
 *   阻挡区 = 平面矩形（整块不可走，门格除外），立面/屋顶向北的视觉出头部分会遮挡人物。
 * 纹理用世界像素坐标 u 作相位，保证同一栋楼相邻翼体的窗/砖缝连续。
 */
import { Img, Rng, hash2, vnoise, shade, mix, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';

export const FLOOR_PX = 22;
export type Style = 'brick' | 'brickPale' | 'sand' | 'white' | 'glass' | 'civic' | 'hall';
export type RoofKind = 'flat' | 'hip' | 'solar' | 'seam';

export interface WingSpec {
  /** 平面矩形，单位 tile（世界坐标） */
  x: number; y: number; w: number; d: number;
  /** 层数 */
  f: number;
  style: Style;
  roof?: RoofKind;
  seed: number;
  /** 窗型：grid 单窗阵列 / strip 带形窗 / none 无 */
  windows?: 'grid' | 'strip' | 'band' | 'none';
  /** 入口：相对翼体左缘的 tile 偏移与宽度（tile），main=主入口(带雨棚) */
  door?: { tx: number; tw: number; main?: boolean };
  /** 是否画立面柱廊（图书馆/会议中心） */
  colonnade?: boolean;
  /** 绕矩形中心顺时针旋转的角度（度）。斜向楼体用，渲染时按竖条切片以保证遮挡正确 */
  rot?: number;
  /** 屋面色板序号（ROOF_TONES），同一栋楼的翼体应一致 */
  roofTone?: number;
  /** 细节层级（世界放大后启用）：空调机、窗帘、窗台花盆、屋顶水箱等 */
  detail?: number;
  /** 是否宿舍（宿舍多空调机与晾晒） */
  dorm?: boolean;
  /** 建筑类型（决定屋顶有无花园/天窗等） */
  kind?: string;
  /** 低矮附属（层高减半的裙房）可传 f=1 */
}

interface StyleDef {
  wall: RGBA[]; mortar: RGBA; roof: RGBA[]; trim: RGBA[]; outline: RGBA; brickPattern: boolean;
  /** 自定义玻璃/窗框（civic：深青色玻璃 + 深砖红窗框，参考旧版南门—图书馆段的立面） */
  glass?: RGBA[]; frame?: RGBA; civic?: boolean;
}
const TEAL: RGBA[] = ['#1b3b47', '#285063', '#37697b', '#5c9aa8'].map((c) => hex(c));
const LIME: RGBA[] = ['#9a9680', '#b8b49c', '#d2ceb6', '#e4e0ca', '#f1eedc'].map((c) => hex(c));
const CIVIC_WALL: RGBA[] = ['#7d2f25', '#a2412e', '#bd5238', '#cf6a42', '#e08558'].map((c) => hex(c));
/** 屋面色板（鸟瞰图里：灰 / 蓝灰 / 红褐 / 绿灰）。由 WingSpec.roofTone 选择 */
const ROOF_TONES: RGBA[][] = [PAL.roofGray, PAL.roofBlue, PAL.roofRed, [hex('#3f5a52'), hex('#56786c'), hex('#74988a'), hex('#97b8a8'), hex('#b8d4c6')], [hex('#5a5560'), hex('#757080'), hex('#938ea0'), hex('#b4afc0'), hex('#d0ccd8')], [hex('#7a8a88'), hex('#95a5a2'), hex('#aebcb8'), hex('#c5d0cc'), hex('#dbe3e0')]];
const STYLES: Record<Style, StyleDef> = {
  brick: { wall: PAL.brick, mortar: PAL.mortar, roof: PAL.roofGray, trim: PAL.sand, outline: PAL.outlineBrick, brickPattern: true },
  brickPale: { wall: [PAL.brick[1], PAL.brick[2], PAL.brick[3], PAL.brick[4], PAL.sand[3]], mortar: PAL.sand[4], roof: PAL.roofGray, trim: PAL.white, outline: PAL.outlineBrick, brickPattern: true },
  sand: { wall: PAL.sand, mortar: PAL.sand[4], roof: PAL.roofGray, trim: PAL.white, outline: hexC('#6a4f2c'), brickPattern: false },
  white: { wall: PAL.white, mortar: PAL.white[4], roof: PAL.roofBlue, trim: PAL.white, outline: hexC('#566078'), brickPattern: false },
  glass: { wall: PAL.glass, mortar: PAL.glass[3], roof: PAL.roofBlue, trim: PAL.white, outline: hexC('#243a5a'), brickPattern: false },
  civic: { wall: CIVIC_WALL, mortar: hex('#d1a084'), roof: PAL.roofGray, trim: LIME, outline: PAL.outlineBrick, brickPattern: true, glass: TEAL, frame: hex('#5a2a22'), civic: true },
  hall: { wall: CIVIC_WALL, mortar: hex('#d1a084'), roof: ROOF_TONES_SEAM(), trim: LIME, outline: PAL.outlineBrick, brickPattern: true, glass: TEAL, frame: hex('#5a2a22'), civic: true },
};
function ROOF_TONES_SEAM(): RGBA[] { return [hex('#7a8a88'), hex('#95a5a2'), hex('#aebcb8'), hex('#c5d0cc'), hex('#dbe3e0')]; }
function hexC(s: string): RGBA { const v = s.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255]; }

export interface Slice { img: Img; px: number; py: number; baseY: number }
export interface WingSprite {
  /** 轴向翼体为单片；旋转翼体为多个竖条切片（各自带独立基线） */
  slices: Slice[];
  /** 旋转翼体的平面多边形（世界 tile），用于碰撞 */
  poly?: [number, number][];
  img: Img;
  /** 精灵左上角在世界中的像素位置 */
  px: number; py: number;
  /** 深度排序基线（世界像素 y） */
  baseY: number;
  wallH: number;
  /** 阻挡矩形（世界 tile） */
  block: { x: number; y: number; w: number; d: number };
  /** 门（世界 tile，南缘外一格为触发格） */
  door?: { tx: number; ty: number; tw: number };
}

function styleFor(s: WingSpec): StyleDef {
  const base = STYLES[s.style];
  return s.roofTone === undefined ? base : { ...base, roof: ROOF_TONES[s.roofTone % ROOF_TONES.length] };
}
export function renderWing(s: WingSpec): WingSprite {
  if (s.rot) return renderRotWing(s);
  const st = styleFor(s);
  const W = Math.round(s.w * 16), roofH = Math.round(s.d * 16);
  const wallH = Math.max(14, s.f * FLOOR_PX + 6);
  const H = roofH + wallH;
  const img = new Img(W, H + 4);
  const rng = new Rng(s.seed * 9973 + Math.floor(s.x * 7 + s.y * 13));
  const u0 = Math.round(s.x * 16);
  const roofKind = s.roof ?? 'flat';

  // ---------- 屋顶面 ----------
  paintRoof(img, W, roofH, st, roofKind, rng, s);
  // ---------- 南立面 ----------
  paintWall(img, 0, roofH, W, wallH, st, s, u0, rng);

  // 整体外轮廓（1px 深色）
  const out = img.outlined(st.outline, false);
  // 脚下阴影：贴着基线向南 3px，浅且半透明
  const base = roofH + wallH + 1; // outlined 后基线所在行
  for (let y = 0; y < 3; y++) for (let x = 1; x < W + 1; x++) {
    if (out.alpha(x, base + y) === 0) out.set(x, base + y, [28, 36, 66, y === 0 ? 70 : y === 1 ? 44 : 22]);
  }
  const px0 = u0 - 1, py0 = Math.round(s.y * 16) - wallH - 1, baseY0 = Math.round((s.y + s.d) * 16);
  const sp: WingSprite = {
    slices: [{ img: out, px: px0, py: py0, baseY: baseY0 }],
    img: out,
    px: px0,
    py: py0,
    baseY: baseY0,
    wallH,
    block: { x: s.x, y: s.y, w: s.w, d: s.d },
  };
  if (s.door) sp.door = { tx: s.x + s.door.tx, ty: s.y + s.d, tw: s.door.tw };
  return sp;
}

// ---------------------------------------------------------------- 屋顶
function paintRoof(img: Img, W: number, H: number, st: StyleDef, kind: RoofKind, rng: Rng, s: WingSpec) {
  const R = st.roof;
  const par = 3; // 女儿墙厚度
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x, y, H - 1 - y);
    let c: RGBA;
    if (edge < par) c = kind === 'seam' ? (edge === 0 ? hex('#8a3426') : edge === 1 ? hex('#c0583a') : hex('#a2412e')) : edge === 0 ? R[3] : edge === 1 ? R[4] : R[2];
    else {
      const n = vnoise(x, y, 7, s.seed) * 0.22;
      c = R[2];
      if (kind === 'seam') {
        // 银灰立缝金属屋面：竖向咬合缝 + 屋脊 + 左亮右暗
        const lightX = 0.9 + 0.1 * (1 - x / W);
        c = R[3];
        if (x % 8 === 0) c = R[2]; else if (x % 8 === 1) c = R[4];
        if (Math.abs(y - H / 2) < 1.2) c = R[1]; else if (Math.abs(y - H / 2 - 1.5) < 0.6) c = R[4];
        c = shade(c, lightX * (y > H / 2 ? 0.94 : 1.02));
      } else if (kind === 'hip') {
        const mid = H / 2;
        const south = y > mid;
        c = south ? R[1] : R[3];
        if (Math.abs(y - mid) < 1.5) c = R[4];
        if ((y + (south ? 0 : 3)) % 5 === 0) c = shade(c, 0.9);
      } else {
        // 平屋面：16px 分块板缝（很淡）+ 每块板极轻微明暗差；干净的浅灰，像旧版屋顶
        const bx = Math.floor(x / 16), by = Math.floor(y / 16);
        const tint = hash2(bx, by, s.seed + 77);
        c = shade(R[3], 0.965 + tint * 0.06);
        if (x % 16 === 0 || y % 16 === 0) c = shade(R[2], 1.02);
        else if (x % 16 === 1 || y % 16 === 1) c = shade(R[4], 0.99);
        else if (n > 0.2 && hash2(x, y, s.seed) < 0.18) c = shade(c, 0.97);
      }
    }
    img.set(x, y, c);
  }
  // 女儿墙内侧暗线与南缘檐下阴影
  img.hline(par, par, W - par * 2, R[1]);
  img.hline(par, H - par - 1, W - par * 2, R[1]);
  // 屋顶设备
  if (false && (s.detail ?? 0) > 0 && kind === 'flat' && s.dorm && W > 80 && H > 40) { // 水箱 + 太阳能热水器（宿舍屋顶常见）
    const nt = Math.min(4, Math.floor(W / 90) + 1);
    for (let i = 0; i < nt; i++) {
      const tx = par + 8 + Math.floor(hash2(i, 5, s.seed) * (W - par * 2 - 24)), ty = par + 6 + Math.floor(hash2(i, 9, s.seed) * Math.max(1, H - par * 2 - 24));
      img.ellipse(tx + 6, ty + 9, 6, 3, [20, 24, 50, 70]); img.rect(tx, ty + 2, 12, 8, hex('#c8d4e0')); img.rect(tx, ty + 2, 3, 8, hex('#e8eff6')); img.rect(tx + 9, ty + 2, 3, 8, hex('#8fa0b4')); img.ellipse(tx + 6, ty + 2, 6, 2.5, hex('#dce6f0')); img.set(tx + 4, ty + 1, hex('#ffffff'));
    }
  }
  if ((s.detail ?? 0) > 0 && (kind === 'flat' || kind === 'solar')) roofDetail(img, W, H, par, st, rng, s, kind === 'solar');
  else if (kind === 'flat' || kind === 'solar') {
    const area = W * H;
    const n = (s.detail ?? 0) > 0 ? Math.min(46, Math.floor(area / 2200) + 2) : Math.min(14, Math.floor(area / 1400) + 1);
    for (let i = 0; i < n; i++) {
      const bw = rng.pick([6, 8, 10]), bh = rng.pick([4, 5, 6]);
      const x = par + 4 + rng.int(Math.max(1, W - par * 2 - bw - 8)), y = par + 4 + rng.int(Math.max(1, H - par * 2 - bh - 8));
      if (kind === 'solar' && i < 3) { solarPanel(img, x, y, Math.min(18, W - x - par), Math.min(10, H - y - par)); continue; }
      const t = rng.int(3);
      if (t === 0) { // 空调外机
        img.rect(x, y, bw, bh, R[4]); img.rect(x, y + bh - 2, bw, 2, R[0]);
        img.hline(x, y, bw, R[4]);
      } else if (t === 1) { // 天窗
        img.rect(x, y, bw + 2, bh, PAL.glass[2]); img.hline(x, y, bw + 2, PAL.glass[3]); img.vline(x, y, bh, PAL.frame);
        img.hline(x, y + bh - 1, bw + 2, PAL.frameDark);
      } else { // 楼梯间小盒
        img.rect(x, y, bw, bh + 2, R[3]); img.rect(x, y + bh, bw, 2, R[1]); img.hline(x, y, bw, R[4]);
      }
    }
  }
  if (kind === 'solar') {
    for (let k = 0; k < 2; k++) solarPanel(img, par + 4 + k * 22, H - par - 14, 18, 10);
  }
}
/**
 * 大屋顶细节（世界放大后启用）：伸缩缝分区（轻微色差）、楼梯间、水箱（宿舍）、空调机组（带风扇）、
 * 天窗带（教学/实验/行政）、屋顶花园（图书馆/文化/行政/教学）、光伏阵列、管线、检修步道。
 * 用 8px 占位网格避免重叠，全部确定性。
 */
function roofDetail(img: Img, W: number, H: number, par: number, st: StyleDef, rng: Rng, s: WingSpec, solar: boolean) {
  const R = st.roof, x0 = par + 3, y0 = par + 3, x1 = W - par - 3, y1 = H - par - 3;
  if (x1 - x0 < 20 || y1 - y0 < 16) return;
  const gw = Math.ceil(W / 8), gh = Math.ceil(H / 8), occ = new Uint8Array(gw * gh);
  const isFree = (x: number, y: number, w: number, h: number) => { for (let j = Math.floor(y / 8); j <= Math.floor((y + h) / 8); j++) for (let i = Math.floor(x / 8); i <= Math.floor((x + w) / 8); i++) if (i < 0 || j < 0 || i >= gw || j >= gh || occ[j * gw + i]) return false; return true; };
  const mark = (x: number, y: number, w: number, h: number) => { for (let j = Math.floor(y / 8); j <= Math.floor((y + h) / 8); j++) for (let i = Math.floor(x / 8); i <= Math.floor((x + w) / 8); i++) if (i >= 0 && j >= 0 && i < gw && j < gh) occ[j * gw + i] = 1; };
  const place = (w: number, h: number, gap = 6): [number, number] | null => {
    for (let t = 0; t < 40; t++) {
      const x = x0 + rng.int(Math.max(1, x1 - x0 - w)), y = y0 + rng.int(Math.max(1, y1 - y0 - h));
      if (isFree(x - gap, y - gap, w + gap * 2, h + gap * 2)) { mark(x - 2, y - 2, w + 4, h + 4); return [x, y]; }
    }
    return null;
  };
  const A = W * H, G = PAL.glass;
  // 1) 伸缩缝分区：每 ~72px 一道深浅双线，各区块 ±3% 明暗
  const zw = 72 + Math.floor(hash2(s.seed, 1, 5) * 24), zh = 64 + Math.floor(hash2(s.seed, 2, 5) * 24);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const zx = Math.floor((x - x0) / zw), zy = Math.floor((y - y0) / zh);
    const c = img.get(x, y);
    const f = 0.975 + hash2(zx, zy, s.seed + 31) * 0.05;
    img.set(x, y, [c[0] * f, c[1] * f, c[2] * f, 255]);
    if ((x - x0) % zw === 0 || (y - y0) % zh === 0) img.set(x, y, shade(R[1], 0.95));
    else if ((x - x0) % zw === 1 || (y - y0) % zh === 1) img.set(x, y, shade(R[4], 1.0));
  }
  // 2) 楼梯间
  const ns = Math.min(4, 1 + Math.floor(A / 14000));
  const stairs: [number, number][] = [];
  for (let i = 0; i < ns; i++) { const p = place(18, 14, 10); if (!p) continue; const [x, y] = p; stairs.push([x, y]);
    img.rect(x, y, 18, 9, R[4]); img.hline(x, y, 18, shade(R[4], 1.08)); img.rect(x, y + 9, 18, 5, R[1]); img.rect(x + 7, y + 10, 4, 4, hex('#2a2e3e')); img.hline(x + 6, y + 9, 6, R[4]); img.vline(x + 17, y, 14, R[3]); }
  // 3) 水箱（宿舍）
  if (s.dorm) for (let i = 0, n = Math.min(5, 1 + Math.floor(A / 9000)); i < n; i++) { const p = place(14, 14, 8); if (!p) continue; const [x, y] = p;
    img.ellipse(x + 7, y + 13, 7, 3, [20, 24, 50, 70]); img.rect(x, y + 3, 14, 9, hex('#c8d4e0')); img.rect(x, y + 3, 4, 9, hex('#e8eff6')); img.rect(x + 10, y + 3, 4, 9, hex('#8fa0b4')); img.ellipse(x + 7, y + 3, 7, 3, hex('#dce6f0')); img.set(x + 4, y + 2, hex('#ffffff')); img.hline(x, y + 8, 14, hex('#a4b2c4')); }
  // 4) 空调机组：一块大风扇 + 侧面散热格栅 + 阴影（尺寸/朝向多样，避免"一对眼睛"）
  for (let i = 0, n = Math.min(18, 2 + Math.floor(A / 5200)); i < n; i++) { const big = rng.chance(0.4), w = big ? 18 : 12, h = big ? 12 : 9, p = place(w, h, 5); if (!p) break; const [x, y] = p;
    img.rect(x + 1, y + h - 1, w, 2, [20, 24, 50, 60]);
    img.rect(x, y + 2, w, h - 2, shade(R[4], 1.04)); img.hline(x, y + 2, w, hex('#ffffff')); img.rect(x, y + h - 2, w, 2, R[0]); img.vline(x + w - 1, y + 2, h - 2, R[2]);
    const r = big ? 4 : 3; img.ellipse(x + w / 2 - 1, y + 2 + (h - 4) / 2 + 0.5, r, r * 0.7, hex('#2f3342')); img.set(x + Math.floor(w / 2) - 1, y + 2 + Math.floor((h - 4) / 2), hex('#7a82a0'));
    for (let k = 2; k < h - 4; k += 2) img.hline(x + 1, y + 2 + k, 2, R[1]); }
  // 5) 天窗带（非宿舍）
  if (!s.dorm) for (let i = 0, n = Math.min(7, Math.floor(A / 8000)); i < n; i++) { const p = place(40, 12, 8); if (!p) break; const [x, y] = p;
    img.rect(x - 1, y - 1, 42, 14, PAL.frame);
    for (let j = 0; j < 12; j++) for (let k = 0; k < 40; k++) img.set(x + k, y + j, j < 4 ? G[3] : j < 8 ? G[2] : G[1]);
    for (let k = 10; k < 40; k += 10) img.vline(x + k, y, 12, PAL.frame); img.hline(x - 1, y + 13, 42, PAL.frameDark); }
  // 6) 屋顶花园（图书馆/文化/行政/教学）
  if (['library', 'culture', 'admin', 'teaching'].includes(s.kind ?? '') && A > 7000) { const p = place(46, 28, 6); if (p) { const [x, y] = p;
    img.rect(x - 1, y - 1, 48, 30, PAL.stone[2]); img.rect(x, y, 46, 28, PAL.grass[2]);
    for (let j = 0; j < 28; j++) for (let k = 0; k < 46; k++) { const h = hash2(k, j, s.seed + 5); img.set(x + k, y + j, h < 0.18 ? PAL.grass[1] : h > 0.88 ? PAL.grass[4] : PAL.grass[2]); }
    img.rect(x + 3, y + 12, 40, 4, PAL.stone[3]); // 小径
    for (let k = 0; k < 7; k++) { const sx = x + 4 + k * 6 + (k % 2) * 2, sy = y + (k % 2 ? 4 : 19); img.ellipse(sx, sy, 3, 2.4, PAL.leaf[2]); img.set(sx - 1, sy - 1, PAL.leaf[4]); if (k % 3 === 0) img.set(sx + 1, sy, hex('#ee93b6')); }
    img.rect(x + 20, y + 10, 6, 2, PAL.wood[3]); } }
  // 7) 光伏阵列
  if (solar || (s.dorm && hash2(s.seed, 8, 3) < 0.5)) { const cols = 4 + rng.int(3), rows = 2 + rng.int(2), pw = cols * 11, ph = rows * 9; const p = place(pw, ph, 6);
    if (p) { const [x, y] = p; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) solarPanel(img, x + c * 11, y + r * 9, 10, 8); } }
  // 8) 管线与检修步道
  for (const [sx, sy] of stairs) { // 步道：从楼梯间向南/向东
    img.rect(sx + 8, sy + 14, 3, 10, shade(R[4], 1.06));
    for (let k = 0; k < 10; k += 3) img.hline(sx + 8, sy + 14 + k, 3, shade(R[3], 0.96)); }
  for (let i = 0; i < Math.min(8, 1 + Math.floor(A / 8000)); i++) { const horiz = rng.chance(0.6), L = 24 + rng.int(30); const p = place(horiz ? L : 3, horiz ? 3 : L, 2); if (!p) break; const [x, y] = p;
    if (horiz) { img.hline(x, y, L, hex('#4a5063')); img.hline(x, y + 1, L, hex('#8a92a8')); for (let k = 0; k < L; k += 12) img.rect(x + k, y - 1, 2, 4, hex('#5a6178')); }
    else { img.vline(x, y, L, hex('#4a5063')); img.vline(x + 1, y, L, hex('#8a92a8')); for (let k = 0; k < L; k += 12) img.rect(x - 1, y + k, 4, 2, hex('#5a6178')); } }
  // 9) 使用痕迹：防水修补补丁、雨渍、排水口、卫星锅与避雷针；宿舍屋顶偶有晾晒的被单/衣物
  for (let i = 0, n = Math.min(6, 1 + Math.floor(A / 9000)); i < n; i++) { const pw = 14 + rng.int(14), ph = 8 + rng.int(10), p = place(pw, ph, 3); if (!p) break; const [x, y] = p;
    for (let j = 0; j < ph; j++) for (let k = 0; k < pw; k++) { const e = Math.min(k, j, pw - 1 - k, ph - 1 - j); if (e === 0 && hash2(k, j, s.seed + 9) < 0.5) continue; img.set(x + k, y + j, e === 0 ? shade(R[1], 0.9) : shade(R[1], 0.82 + hash2(k, j, s.seed + 11) * 0.06)); } }
  for (let i = 0, n = Math.min(5, 1 + Math.floor(A / 10000)); i < n; i++) { const p = place(6, 6, 2); if (!p) break; const [x, y] = p; // 排水口 + 向外洇开的雨渍
    for (let k = 0; k < 18; k++) { const a = hash2(k, i, s.seed + 13) * 6.283, d = 2 + hash2(k, i, s.seed + 17) * 8; const c = img.get(Math.round(x + 3 + Math.cos(a) * d), Math.round(y + 3 + Math.sin(a) * d * 0.7)); img.set(Math.round(x + 3 + Math.cos(a) * d), Math.round(y + 3 + Math.sin(a) * d * 0.7), [c[0] * 0.86, c[1] * 0.88, c[2] * 0.9, 255]); }
    img.rect(x + 1, y + 1, 4, 4, hex('#4a5063')); img.rect(x + 2, y + 2, 2, 2, hex('#1f2230')); img.hline(x + 1, y + 1, 4, hex('#8a92a8')); }
  if (hash2(s.seed, 21, 3) < 0.6) { const p = place(10, 10, 4); if (p) { const [x, y] = p; // 卫星锅：斜放的圆盘 + 支臂
    img.ellipse(x + 5, y + 9, 5, 2, [20, 24, 50, 60]); img.ellipse(x + 5, y + 4, 4, 3.4, hex('#dfe4ea')); img.ellipse(x + 5, y + 4, 2.4, 2, hex('#aeb7c4')); img.set(x + 5, y + 4, hex('#4a5063')); img.vline(x + 5, y + 6, 4, hex('#6a7288')); } }
  if (A > 6000) { const x = x1 - 5 - rng.int(8), y = y0 + 4 + rng.int(6); // 避雷针 + 阴影
    img.rect(x + 1, y + 3, 4, 2, [20, 24, 50, 60]); img.vline(x, y - 7, 11, hex('#7d8598')); img.set(x, y - 8, hex('#e8eff6')); img.hline(x - 2, y + 3, 5, hex('#4a5063')); }
  if (s.dorm && hash2(s.seed, 31, 3) < 0.55) { const p = place(48, 14, 4); if (p) { const [x, y] = p; // 晾晒：两根杆 + 一排被单与衣物
    const cols = ['#f2f0ea', '#9ec7ea', '#f4b6c8', '#e8d9a0', '#bfe0b8', '#f2f0ea'];
    img.vline(x, y + 2, 12, hex('#6a7288')); img.vline(x + 47, y + 2, 12, hex('#6a7288')); img.hline(x, y + 2, 48, hex('#7d8598'));
    for (let k = 0, cx = x + 3; k < cols.length && cx < x + 44; k++) { const cw = 5 + rng.int(5), ch = k % 3 === 0 ? 10 : 6; img.rect(cx, y + 3, cw, ch, hex(cols[k])); img.hline(cx, y + 3 + ch - 1, cw, shade(hex(cols[k]), 0.88)); img.rect(cx + 1, y + 3 + ch, cw, 1, [20, 24, 50, 50]); cx += cw + 2; } } }
}
function solarPanel(img: Img, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const line = i % 6 === 0 || j % 4 === 0;
    img.set(x + i, y + j, line ? PAL.roofBlue[3] : PAL.roofBlue[0]);
  }
}

// ---------------------------------------------------------------- 立面
function paintWall(img: Img, ox: number, oy: number, W: number, H: number, st: StyleDef, s: WingSpec, u0: number, rng: Rng) {
  const wall = st.wall;
  const plinth = 4, cornice = 4;
  // 墙面底纹
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = u0 + x, v = y;
    let c: RGBA;
    if (st.brickPattern) {
      const row = Math.floor(v / 4);
      const off = (row % 2) * 4;
      const bx = Math.floor((u + off) / 8);
      const inMortarRow = v % 4 === 3, inMortarCol = (u + off) % 8 === 7;
      if (inMortarRow || inMortarCol) c = st.mortar;
      else {
        const r = hash2(bx, row, s.seed);
        const idx = r < 0.12 ? 1 : r < 0.5 ? 2 : r < 0.86 ? 3 : 4;
        c = wall[Math.min(idx, wall.length - 1)];
        if (v % 4 === 0) c = shade(c, 1.07); // 砖面上缘高光
      }
    } else {
      const n = vnoise(u, v, 9, s.seed + 5);
      c = wall[n > 0.62 ? 3 : n > 0.3 ? 2 : 2];
      if (v % 11 === 10) c = wall[1];
    }
    // 竖直渐变：下部略暗
    const f = 1 - (v / H) * 0.12;
    img.set(ox + x, oy + y, shade(c, f));
  }
  // 檐口（顶部浅色石带 + 檐下阴影）
  img.rect(ox, oy, W, 2, st.trim[3]);
  img.rect(ox, oy + 2, W, 1, st.trim[2]);
  img.rect(ox, oy + 3, W, 2, [20, 24, 50, 60]);
  // 勒脚（底部石基）
  img.rect(ox, oy + H - plinth, W, plinth, PAL.stone[1]);
  img.rect(ox, oy + H - plinth, W, 1, PAL.stone[3]);
  img.rect(ox, oy + H - 1, W, 1, PAL.stone[0]);
  // 两侧暗边
  img.vline(ox, oy + cornice, H - cornice - plinth, shade(wall[1], 0.85));
  img.vline(ox + W - 1, oy + cornice, H - cornice - plinth, shade(wall[1], 0.85));

  const mode = s.windows ?? (s.style === 'glass' ? 'strip' : st.civic ? 'band' : 'grid');
  const floors = Math.max(1, s.f);
  const usableTop = cornice + 3, usableBot = H - plinth - 1;
  const floorH = (usableBot - usableTop) / floors;
  const doorPx = s.door ? { x: Math.round(s.door.tx * 16), w: Math.round(s.door.tw * 16) } : null;
  // 入口门廊（civic 主入口）：宽度 = 门宽 + 4 格，竖向通高
  const portal = st.civic && s.door?.main && doorPx && W > 120 ? (() => { const pw = Math.min(W - 24, doorPx.w + 64); const x0 = Math.round(doorPx.x + doorPx.w / 2 - pw / 2); return { x0, x1: x0 + pw }; })() : null;
  const pal: WinPal | undefined = st.glass ? { glass: st.glass, frame: st.frame ?? DEFAULT_WIN.frame, dark: shade(st.frame ?? DEFAULT_WIN.frame, 0.7), sill: LIME[3] } : undefined;
  if (mode === 'band') paintBand(img, ox, oy, W, floors, usableTop, floorH, st, s, u0, portal, doorPx);
  else if (mode !== 'none') {
    for (let fl = 0; fl < floors; fl++) {
      const top = Math.round(usableTop + fl * floorH);
      const wh = Math.min(13, Math.round(floorH - 5));
      const wy = top + Math.max(2, Math.round((floorH - wh) / 2) - 1);
      if (mode === 'strip') {
        const pitch = 36;
        for (let gx = 6; gx + 30 <= W - 4; gx += pitch) {
          if (doorPx && fl === floors - 1 && gx + 30 > doorPx.x - 3 && gx < doorPx.x + doorPx.w + 3) continue;
          windowBox(img, ox + gx, oy + wy, 30, wh, true, fl === 0 && floors > 1 ? 0 : 1, pal);
        }
      } else {
        const pitch = 18;
        const phase = ((u0 % pitch) + pitch) % pitch;
        for (let gx = -phase + 4; gx + 10 <= W - 3; gx += pitch) {
          if (gx < 3) continue;
          if (doorPx && fl === floors - 1 && gx + 10 > doorPx.x - 3 && gx < doorPx.x + doorPx.w + 3) continue;
          const rr = hash2(gx + u0, fl, s.seed);
          const det = s.detail ?? 0;
          const variant = det ? (rr < 0.08 ? 2 : rr < 0.15 ? 4 : rr < 0.21 ? 5 : rr < 0.26 ? 6 : rr > 0.9 ? 3 : 0) : (rr < 0.12 ? 2 : pal && rr > 0.88 ? 3 : 0);
          windowBox(img, ox + gx, oy + wy, 10, wh, false, variant, pal);
          if (det) {
            const r2 = hash2(gx + u0, fl * 7 + 3, s.seed + 9);
            if ((s.dorm && r2 < 0.3) || (!s.dorm && r2 < 0.1)) { // 空调外机：浅灰箱体 + 散热格栅 + 底部暗线
              const ax = ox + gx + 1, ay = oy + wy + wh + 2;
              img.rect(ax, ay, 8, 4, hex('#d9dde6')); img.hline(ax, ay, 8, hex('#f4f6fa')); img.hline(ax, ay + 3, 8, hex('#8f96a8'));
              for (let k = 1; k < 8; k += 2) img.set(ax + k, ay + 2, hex('#6e7488'));
            } else if (r2 > 0.9) { // 窗台花盆
              const px0 = ox + gx + 2 + Math.floor(r2 * 20) % 4, py0 = oy + wy + wh + 1;
              img.rect(px0, py0, 3, 2, hex('#b8654a')); img.set(px0, py0 - 1, PAL.leaf[3]); img.set(px0 + 1, py0 - 2, PAL.leaf[4]); img.set(px0 + 2, py0 - 1, PAL.leaf[2]); img.set(px0 + 1, py0 - 3, hex('#ee93b6'));
            } else if (s.dorm && r2 > 0.82 && fl > 0) { // 晾晒的衣物
              const lx = ox + gx + 1, ly = oy + wy + wh + 2;
              img.hline(lx - 1, ly, 10, hex('#8f96a8'));
              const cs = [hex('#f4f6fa'), hex('#e8a0a8'), hex('#8ab4e0'), hex('#f0d890')];
              for (let k = 0; k < 3; k++) img.rect(lx + k * 3, ly + 1, 2, 3 + (k % 2), cs[(Math.floor(r2 * 100) + k) % 4]);
            }
          }
        }
      }
    }
  }
  // 柱廊
  if (s.colonnade) {
    const colTop = cornice + 2, colBot = H - plinth;
    for (let gx = 10; gx + 6 <= W - 8; gx += 20) {
      for (let y = colTop; y < colBot; y++) {
        img.set(ox + gx, oy + y, st.trim[4]); img.set(ox + gx + 1, oy + y, st.trim[3]);
        img.set(ox + gx + 2, oy + y, st.trim[2]); img.set(ox + gx + 3, oy + y, st.trim[1]);
      }
    }
  }
  if (portal) paintPortal(img, ox, oy, H, st, portal, floors, usableTop, floorH, plinth, cornice);
  // 门
  if (doorPx) paintDoor(img, ox + doorPx.x, oy + H - plinth, doorPx.w, s.door!.main ?? false, st);
}

/** 连续玻璃带窗：每层一条深青色玻璃带，砖墩按世界坐标每 96px 一根，竖梃每 12px，少量亮灯格。 */
function paintBand(img: Img, ox: number, oy: number, W: number, floors: number, usableTop: number, floorH: number, st: StyleDef, s: WingSpec, u0: number, portal: { x0: number; x1: number } | null, doorPx: { x: number; w: number } | null) {
  const G = st.glass ?? PAL.glass, FR = st.frame ?? hex('#5a2a22');
  const PIER = 96, PW = 6;
  // 本翼体内的墩柱起点
  const piers: number[] = [];
  for (let k = Math.floor(u0 / PIER); ; k++) { const c = k * PIER - u0; if (c - 3 > W) break; const st0 = c - 3; if (st0 > 4 && st0 + PW < W - 4) piers.push(st0); }
  const edges: [number, number][] = []; // 玻璃段 [a,b)
  let a = 4;
  for (const p of piers) { if (p - a >= 6) edges.push([a, p]); a = p + PW; }
  if (W - 4 - a >= 6) edges.push([a, W - 4]);
  const skip = (x0: number, x1: number) => (portal && x1 > portal.x0 - 2 && x0 < portal.x1 + 2) || (!portal && doorPx && x1 > doorPx.x - 3 && x0 < doorPx.x + doorPx.w + 3);
  for (let fl = 0; fl < floors; fl++) {
    const top = Math.round(usableTop + fl * floorH);
    const bh = Math.max(7, Math.round(floorH - 6));
    const y0 = oy + top + 3;
    for (const [x0, x1] of edges) {
      if (fl === floors - 1 && skip(x0, x1)) continue;
      if (portal && x1 > portal.x0 - 2 && x0 < portal.x1 + 2) continue; // 门廊通高
      img.hline(ox + x0 - 1, y0 - 1, x1 - x0 + 2, FR);                      // 窗楣
      img.hline(ox + x0 - 1, y0 + bh, x1 - x0 + 2, LIME[3]);                // 窗台石带
      img.hline(ox + x0 - 1, y0 + bh + 1, x1 - x0 + 2, shade(FR, 0.8));
      for (let y = 0; y < bh; y++) for (let x = x0; x < x1; x++) {
        const t = y / Math.max(1, bh - 1);
        let c = y === 0 ? G[0] : t < 0.3 ? G[2] : t < 0.7 ? G[1] : G[0];
        const uu = u0 + x;
        if (uu % 12 === 0) c = G[3];                                       // 竖梃
        else if (uu % 12 === 1) c = G[0];
        if ((x - y + 400) % 17 === 0 && t < 0.7) c = G[3];                 // 斜向反光
        const cell = Math.floor(uu / 12);
        if (hash2(cell, fl, s.seed + 31) < 0.1 && uu % 12 > 1 && y > 1 && y < bh - 1) c = y < bh / 2 ? hex('#f5d48a') : hex('#e8b860'); // 亮灯
        img.set(ox + x, y0 + y, c);
      }
    }
    for (const px of piers) { // 砖墩（略亮，带高光）
      if (portal && px + PW > portal.x0 - 2 && px < portal.x1 + 2) continue;
      img.rect(ox + px, oy + top, PW, Math.round(floorH), st.wall[3]); img.vline(ox + px, oy + top, Math.round(floorH), st.wall[4]); img.vline(ox + px + PW - 1, oy + top, Math.round(floorH), st.wall[1]);
    }
    if (fl < floors - 1) { // 层间檐带
      const yy = oy + Math.round(usableTop + (fl + 1) * floorH) - 1;
      img.hline(ox, yy, W, LIME[2]); img.hline(ox, yy + 1, W, shade(st.wall[1], 0.9));
    }
  }
}

/** 主入口门廊：两侧石柱、通高幕墙、宽雨棚。竖向通高，位置对应 portal.x0..x1（楼身局部像素） */
function paintPortal(img: Img, ox: number, oy: number, H: number, st: StyleDef, p: { x0: number; x1: number }, floors: number, usableTop: number, floorH: number, plinth: number, cornice: number) {
  const G = st.glass ?? PAL.glass;
  const x0 = ox + p.x0, w = p.x1 - p.x0, yTop = oy + cornice + 2, yBot = oy + H - plinth;
  // 底板：深一阶的砖红
  img.rect(x0, yTop, w, yBot - yTop, st.wall[1]);
  for (let y = yTop; y < yBot; y += 4) img.hline(x0, y + 3, w, shade(st.wall[0], 1.0));
  // 幕墙：除首层外每层一段，石质竖梃每 16px
  for (let fl = 0; fl < floors - 1; fl++) {
    const top = oy + Math.round(usableTop + fl * floorH) + 2, bh = Math.max(8, Math.round(floorH) - 4);
    for (let y = 0; y < bh; y++) for (let x = 9; x < w - 9; x++) {
      const t = y / Math.max(1, bh - 1);
      let c = t < 0.3 ? G[2] : t < 0.7 ? G[1] : G[0];
      if (x % 16 === 0) c = LIME[3]; else if (x % 16 === 1) c = LIME[1];
      if (hash2(Math.floor(x / 16), fl, 77) < 0.28 && x % 16 > 1 && y > 1 && y < bh - 1) c = y < bh / 2 ? hex('#f5d48a') : hex('#e8b860');
      img.set(x0 + x, top + y, c);
    }
    img.hline(x0 + 8, top - 1, w - 16, LIME[3]); img.hline(x0 + 8, top + bh, w - 16, LIME[1]);
  }
  // 两侧通高石柱（带柱头/柱础）
  for (const px of [x0, x0 + w - 8]) {
    for (let y = yTop; y < yBot; y++) { img.set(px, y, LIME[4]); img.set(px + 1, y, LIME[3]); img.rect(px + 2, y, 4, 1, LIME[2]); img.set(px + 6, y, LIME[1]); img.set(px + 7, y, LIME[0]); }
    img.rect(px - 1, yTop, 10, 2, LIME[4]); img.rect(px - 1, yBot - 3, 10, 3, LIME[3]);
  }
  // 宽雨棚（压在首层顶）
  const cy = yBot - 25;
  img.rect(x0 + 2, cy, w - 4, 3, LIME[4]); img.hline(x0 + 2, cy + 2, w - 4, LIME[2]); img.rect(x0 + 2, cy + 3, w - 4, 3, [20, 24, 50, 80]);
  // 首层暗色门洞底（门与两侧亮窗稍后绘制）
  img.rect(x0 + 8, cy + 6, w - 16, yBot - cy - 6, G[0]);
  for (let x = x0 + 10; x < x0 + w - 10; x += 12) { img.vline(x, cy + 7, yBot - cy - 8, LIME[2]); }
}

interface WinPal { glass: RGBA[]; frame: RGBA; dark: RGBA; sill: RGBA }
const DEFAULT_WIN: WinPal = { glass: PAL.glass, frame: PAL.frame, dark: PAL.frameDark, sill: PAL.stone[4] };
function windowBox(img: Img, x: number, y: number, w: number, h: number, wide: boolean, variant: number, pal: WinPal = DEFAULT_WIN) {
  const G = pal.glass;
  // 窗框
  img.rect(x - 1, y - 1, w + 2, h + 2, pal.frame);
  // 玻璃：上亮下暗 + 斜高光
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = j / Math.max(1, h - 1);
    let c = t < 0.35 ? G[3] : t < 0.7 ? G[2] : G[1];
    if (variant === 2) c = t < 0.5 ? PAL.sand[4] : PAL.sand[3]; // 拉着窗帘的窗
    if (variant === 3) c = t < 0.5 ? hex('#f5d48a') : hex('#e8b860'); // 亮灯的窗
    if (variant === 4) c = t < 0.55 ? hex('#9ec0e8') : hex('#7ea4d0'); // 蓝窗帘
    if (variant === 5) c = t < 0.55 ? hex('#f0b8c8') : hex('#d896ac'); // 粉窗帘
    if (variant === 6) c = t < 0.55 ? hex('#b8dcb0') : hex('#94c28c'); // 绿窗帘
    if (((i + j) % 9 === 2 || (i + j) % 9 === 3) && variant < 2) c = G[3];
    if (variant >= 4 && i % 3 === 0) c = [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92, 255]; // 窗帘褶皱
    img.set(x + i, y + j, c);
  }
  if (!wide) img.vline(x + Math.floor(w / 2), y, h, pal.frame); // 中梃
  else for (let k = 10; k < w; k += 10) img.vline(x + k, y, h, pal.frame);
  img.hline(x - 1, y + h + 1, w + 2, pal.dark); // 窗台投影
  img.hline(x - 1, y + h, w + 2, pal.sill);
}

function paintDoor(img: Img, x: number, yBase: number, w: number, main: boolean, st: StyleDef) {
  const G = st.glass ?? PAL.glass;
  const dh = 20, dw = Math.max(12, w - 2);
  const dx = x + Math.floor((w - dw) / 2), dy = yBase - dh;
  img.rect(dx - 1, dy - 1, dw + 2, dh + 1, PAL.frameDark);
  img.rect(dx, dy, dw, dh, G[1]);
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) if (((i + j) % 8) < 2) img.set(dx + i, dy + j, G[3]);
  img.vline(dx + Math.floor(dw / 2), dy, dh, PAL.frameDark);
  img.rect(dx, dy + dh - 3, dw, 3, PAL.stone[1]);
  // 雨棚
  if (main) {
    const cw = dw + 10;
    img.rect(dx - 5, dy - 5, cw, 3, st.trim[4]);
    img.rect(dx - 5, dy - 2, cw, 1, st.trim[1]);
    img.rect(dx - 5, dy - 1, cw, 2, [20, 24, 50, 70]);
  }
  // 台阶
  img.rect(dx - 2, yBase - 1, dw + 4, 1, PAL.stone[4]);
}

// ---------------------------------------------------------------- 旋转翼体
/**
 * 旋转矩形的斜投影：屋顶 = 多边形上移 wallH；南向边挤出成墙。
 * 纹理先在轴向画布上画好（屋顶 W×D、墙 len×wallH），再按旋转后的局部坐标最近邻采样。
 * 最后按 SLICE 像素宽切成竖条，每条取自己范围内的最低 y 作基线，避免长斜楼与旁边物体排序错误。
 */
const SLICE = 24;
function renderRotWing(s: WingSpec): WingSprite {
  const st = styleFor(s);
  const W = s.w * 16, D = s.d * 16;
  const wallH = Math.max(14, s.f * FLOOR_PX + 6);
  const th = ((s.rot ?? 0) * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
  const cx = (s.x + s.w / 2) * 16, cy = (s.y + s.d / 2) * 16;
  const loc: [number, number][] = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  const P = loc.map(([x, y]) => [cx + x * cs - y * sn, cy + x * sn + y * cs] as [number, number]);
  const minX = Math.floor(Math.min(...P.map((p) => p[0]))) - 2, maxX = Math.ceil(Math.max(...P.map((p) => p[0]))) + 2;
  const minY = Math.floor(Math.min(...P.map((p) => p[1]))) - wallH - 2, maxY = Math.ceil(Math.max(...P.map((p) => p[1]))) + 4;
  const rng = new Rng(s.seed * 9973 + Math.floor(s.x * 7 + s.y * 13));

  const roofTex = new Img(Math.round(W), Math.round(D));
  paintRoof(roofTex, roofTex.w, roofTex.h, st, s.roof ?? 'flat', rng, s);
  // 南向边：外法线 y>0（顺时针绕序下，边 A->B 的外法线为 (ey,-ex)）
  const edges: { A: [number, number]; B: [number, number]; len: number; tex: Img }[] = [];
  for (let i = 0; i < 4; i++) {
    const A = P[i], B = P[(i + 1) % 4];
    const ex = B[0] - A[0], ey = B[1] - A[1];
    if (-ex <= 0.001 || Math.abs(ex) < 1) continue; // 外法线 y 分量 = -ex，需 >0
    const len = Math.hypot(ex, ey);
    const tex = new Img(Math.round(len), wallH);
    paintWall(tex, 0, 0, tex.w, wallH, st, s, Math.round(i * 37), rng);
    edges.push({ A, B, len, tex });
  }
  const img = new Img(maxX - minX, maxY - minY);
  const inPoly = (x: number, y: number) => {
    // 在旋转局部坐标下判断是否落在矩形内
    const dx = x - cx, dy = y - cy;
    const u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
    return u >= -W / 2 && u < W / 2 && v >= -D / 2 && v < D / 2 ? [u + W / 2, v + D / 2] as [number, number] : null;
  };
  const R = st.roof;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const wx = minX + x + 0.5, wy = minY + y + 0.5;
    const r = inPoly(wx, wy + wallH);
    if (r) { img.set(x, y, roofTex.get(Math.min(roofTex.w - 1, Math.floor(r[0])), Math.min(roofTex.h - 1, Math.floor(r[1])))); continue; }
    for (const e of edges) {
      const ex = e.B[0] - e.A[0], ey = e.B[1] - e.A[1];
      const t0 = (wx - e.A[0]) / ex;
      if (t0 < 0 || t0 > 1) continue;
      const t = (e.A[1] + t0 * ey - wy) / wallH; // 0=底边 1=顶边
      if (t < 0 || t > 1) continue;
      img.set(x, y, e.tex.get(Math.min(e.tex.w - 1, Math.floor(t0 * e.len)), Math.min(wallH - 1, Math.floor((1 - t) * wallH))));
      break;
    }
  }
  void R;
  const out = img.outlined(st.outline, false);
  // 竖条切片
  const slices: Slice[] = [];
  for (let sx = 0; sx < out.w; sx += SLICE) {
    const w = Math.min(SLICE, out.w - sx);
    const piece = out.crop(sx, 0, w, out.h);
    // 该条范围内多边形的最低 y（世界像素）
    const wx0 = minX - 1 + sx, wx1 = wx0 + w;
    let base = -1e9;
    for (let i = 0; i < 4; i++) {
      const A = P[i], B = P[(i + 1) % 4];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
        if (x >= wx0 && x <= wx1) base = Math.max(base, y);
      }
      for (const xx of [wx0, wx1]) {
        if ((A[0] - xx) * (B[0] - xx) <= 0 && A[0] !== B[0]) base = Math.max(base, A[1] + ((xx - A[0]) / (B[0] - A[0])) * (B[1] - A[1]));
      }
    }
    if (base < -1e8) continue; // 空条
    // 去掉整条全透明的片
    let any = false; for (let i = 3; i < piece.data.length; i += 4) if (piece.data[i]) { any = true; break; }
    if (!any) continue;
    slices.push({ img: piece, px: wx0, py: minY - 1, baseY: Math.round(base) });
  }
  return {
    slices, img: out, px: minX - 1, py: minY - 1, baseY: Math.round(Math.max(...P.map((p) => p[1]))), wallH,
    block: { x: Math.min(...P.map((p) => p[0])) / 16, y: Math.min(...P.map((p) => p[1])) / 16, w: (Math.max(...P.map((p) => p[0])) - Math.min(...P.map((p) => p[0]))) / 16, d: (Math.max(...P.map((p) => p[1])) - Math.min(...P.map((p) => p[1]))) / 16 },
    poly: P.map(([x, y]) => [x / 16, y / 16] as [number, number]),
    door: s.door ? { tx: (Math.max(...P.map((p) => p[0])) / 16 + Math.min(...P.map((p) => p[0])) / 16) / 2 - s.door.tw / 2, ty: Math.max(...P.map((p) => p[1])) / 16, tw: s.door.tw } : undefined,
  };
}
