/**
 * 地形绘制器：矢量蓝图 -> 像素材质缓冲 -> 上色 -> 64×64 tile 的地面块 PNG。
 * 全程确定性（噪声基于坐标哈希）。材质之间按图层优先级自动生成边缘（路缘、岸线、描边）。
 */
import type { Mat, Shape, Terrain } from '../../src/shared/blueprint.ts';
import { hash2, vnoise, Img, type RGBA } from '../art/px.ts';
import { PAL } from '../art/palette.ts';

export const TILE = 16;
export const MATS: Mat[] = ['grass', 'forest', 'lawn', 'dirt', 'sand', 'path', 'stone', 'paver', 'asphalt', 'water', 'track', 'pitch', 'courtBlue', 'courtGreen', 'courtRed', 'roof', 'line', 'lineY', 'zebraH', 'zebraV', 'bedPink', 'bedPurple', 'bedYellow', 'plaza', 'plazaDark', 'plazaWarm', 'steps', 'rubber', 'boardwalk'];
export const MID: Record<Mat, number> = Object.fromEntries(MATS.map((m, i) => [m, i])) as any;
/** 图层优先级：高者压低者并负责画边缘 */
const LAYER: Record<Mat, number> = {
  grass: 0, forest: 0, lawn: 1, dirt: 2, sand: 2, water: 2, path: 3, paver: 3, track: 3, pitch: 4, courtBlue: 4, courtGreen: 4, courtRed: 4,
  stone: 4, asphalt: 5, roof: 6, line: 7, lineY: 7, zebraH: 6, zebraV: 6, bedPink: 1, bedPurple: 1, bedYellow: 1, plaza: 4, plazaDark: 4, plazaWarm: 4, steps: 4, rubber: 4, boardwalk: 5,
};
const LAYER_BY_ID = MATS.map((m) => LAYER[m]);

export class MaterialMap {
  readonly w: number; readonly h: number;
  readonly m: Uint8Array;
  constructor(public tilesW: number, public tilesH: number) {
    this.w = tilesW * TILE; this.h = tilesH * TILE;
    this.m = new Uint8Array(this.w * this.h);
  }
  at(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.m[y * this.w + x]; }
  /** 以 tile 为单位取某格中心材质 */
  tile(tx: number, ty: number): Mat { return MATS[this.at(Math.floor(tx * TILE + TILE / 2), Math.floor(ty * TILE + TILE / 2))]; }
}

function fillPoly(mm: MaterialMap, pts: [number, number][], id: number) {
  const P = pts.map(([x, y]) => [x * TILE, y * TILE] as [number, number]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of P) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(mm.h - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const yy = y + 0.5; const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      if ((y1 <= yy && y2 > yy) || (y2 <= yy && y1 > yy)) xs.push(x1 + ((yy - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.round(xs[k])), b = Math.min(mm.w, Math.round(xs[k + 1]));
      for (let x = a; x < b; x++) mm.m[y * mm.w + x] = id;
    }
  }
}
function fillEllipse(mm: MaterialMap, cx: number, cy: number, rx: number, ry: number, id: number) {
  const X = cx * TILE, Y = cy * TILE, RX = rx * TILE, RY = ry * TILE;
  for (let y = Math.max(0, Math.floor(Y - RY)); y <= Math.min(mm.h - 1, Math.ceil(Y + RY)); y++)
    for (let x = Math.max(0, Math.floor(X - RX)); x <= Math.min(mm.w - 1, Math.ceil(X + RX)); x++) {
      const dx = (x + 0.5 - X) / RX, dy = (y + 0.5 - Y) / RY;
      if (dx * dx + dy * dy <= 1) mm.m[y * mm.w + x] = id;
    }
}
function fillCapsule(mm: MaterialMap, cx: number, cy: number, rx: number, ry: number, id: number) {
  const X = cx * TILE, Y = cy * TILE, RX = rx * TILE, RY = ry * TILE, straight = Math.max(0, RY - RX);
  for (let y = Math.max(0, Math.floor(Y - RY)); y <= Math.min(mm.h - 1, Math.ceil(Y + RY)); y++)
    for (let x = Math.max(0, Math.floor(X - RX)); x <= Math.min(mm.w - 1, Math.ceil(X + RX)); x++) {
      const dx = x + 0.5 - X, dy = y + 0.5 - Y;
      const ady = Math.max(0, Math.abs(dy) - straight);
      if (dx * dx + ady * ady <= RX * RX) mm.m[y * mm.w + x] = id;
    }
}
function fillRect(mm: MaterialMap, x: number, y: number, w: number, h: number, id: number) {
  const x0 = Math.max(0, Math.round(x * TILE)), x1 = Math.min(mm.w, Math.round((x + w) * TILE));
  const y0 = Math.max(0, Math.round(y * TILE)), y1 = Math.min(mm.h, Math.round((y + h) * TILE));
  for (let yy = y0; yy < y1; yy++) mm.m.fill(id, yy * mm.w + x0, yy * mm.w + x1);
}
function strokeLine(mm: MaterialMap, pts: [number, number][], widthTiles: number, id: number, markFn?: (x: number, y: number, along: number, side: number) => number, flat = false) {
  const r = (widthTiles * TILE) / 2;
  let along = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = [pts[i][0] * TILE, pts[i][1] * TILE], [bx, by] = [pts[i + 1][0] * TILE, pts[i + 1][1] * TILE];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(mm.w - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(mm.h - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      if (flat && ((i === 0 && t < 0) || (i + 2 === pts.length && t > 1))) continue; // 切平的两端：垂直于路方向截断（中间的拐点仍是圆的，不会留缺口）
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 <= r * r) {
        if (markFn) {
          const side = (px - cx) * (-dy / len) + (py - cy) * (dx / len); // 有符号横向偏移
          const mid = markFn(px, py, along + t * len, side);
          mm.m[y * mm.w + x] = mid || id;
        } else mm.m[y * mm.w + x] = id;
      }
    }
    along += len;
  }
}

export function paintShapes(mm: MaterialMap, shapes: Shape[]) {
  for (const s of shapes) {
    const id = MID[s.mat];
    if (s.kind === 'poly') fillPoly(mm, s.pts, id);
    else if (s.kind === 'capsule') fillCapsule(mm, s.cx, s.cy, s.rx, s.ry, id);
    else if (s.kind === 'rect') fillRect(mm, s.x, s.y, s.w, s.h, id);
    else if (s.kind === 'ellipse') fillEllipse(mm, s.cx, s.cy, s.rx, s.ry, id);
    else if (s.kind === 'stroke') {
      const hw = (s.w * TILE) / 2;
      if (s.mat === 'asphalt' && s.mark) {
        const mk = s.mark;
        strokeLine(mm, s.pts, s.w, id, (_x, _y, along, side) => {
          if ((mk === 'center' || mk === 'both') && Math.abs(side) < 0.8 && along % 22 < 12) return MID.lineY;
          if (mk === 'double' && (Math.abs(side - 1.6) < 0.5 || Math.abs(side + 1.6) < 0.5)) return MID.lineY;
          if ((mk === 'edges' || mk === 'both') && (Math.abs(side) > hw - 4.2 && Math.abs(side) < hw - 3.2)) return MID.line;
          return 0;
        }, s.flat);
      } else strokeLine(mm, s.pts, s.w, id, undefined, s.flat);
    }
  }
}

// ------------------------------------------------------------------ 着色
const R = (c: RGBA[], i: number) => c[Math.max(0, Math.min(c.length - 1, i))];

/** 到最近"非水"像素的近似距离（两遍倒角），仅对给定窗口计算 */
export function waterDistance(mm: MaterialMap, x0: number, y0: number, w: number, h: number, pad = 12): { d: Uint8Array; X0: number; Y0: number; W: number; H: number } {
  const X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad);
  const W = Math.min(mm.w, x0 + w + pad) - X0, H = Math.min(mm.h, y0 + h + pad) - Y0;
  const d = new Uint8Array(W * H);
  const INF = 250;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = mm.at(X0 + x, Y0 + y) === MID.water ? INF : 0;
  const idx = (x: number, y: number) => y * W + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = d[idx(x, y)]; if (!v) continue;
    if (x > 0) v = Math.min(v, d[idx(x - 1, y)] + 3);
    if (y > 0) v = Math.min(v, d[idx(x, y - 1)] + 3);
    if (x > 0 && y > 0) v = Math.min(v, d[idx(x - 1, y - 1)] + 4);
    if (x < W - 1 && y > 0) v = Math.min(v, d[idx(x + 1, y - 1)] + 4);
    d[idx(x, y)] = Math.min(250, v);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    let v = d[idx(x, y)]; if (!v) continue;
    if (x < W - 1) v = Math.min(v, d[idx(x + 1, y)] + 3);
    if (y < H - 1) v = Math.min(v, d[idx(x, y + 1)] + 3);
    if (x < W - 1 && y < H - 1) v = Math.min(v, d[idx(x + 1, y + 1)] + 4);
    if (x > 0 && y < H - 1) v = Math.min(v, d[idx(x - 1, y + 1)] + 4);
    d[idx(x, y)] = Math.min(250, v);
  }
  return { d, X0, Y0, W, H };
}

export interface ColorCtx { mm: MaterialMap; wd?: ReturnType<typeof waterDistance>; frame: number; seed: number }

export function pixelColor(ctx: ColorCtx, x: number, y: number): RGBA {
  const { mm, seed, frame } = ctx;
  const m = mm.at(x, y);
  const mat = MATS[m];
  // 边缘检测：4 邻域中是否存在更低图层
  const L = LAYER_BY_ID[m];
  const nL = mm.at(x, y - 1), sL = mm.at(x, y + 1), wL = mm.at(x - 1, y), eL = mm.at(x + 1, y);
  const lowN = LAYER_BY_ID[nL] < L, lowS = LAYER_BY_ID[sL] < L, lowW = LAYER_BY_ID[wL] < L, lowE = LAYER_BY_ID[eL] < L;
  const edge = lowN || lowS || lowW || lowE;
  // 相邻更高图层 => 当前像素是"被压住的低层"，对草地做靠边阴影
  const hiNear = mat === 'grass' || mat === 'forest' || mat === 'lawn'
    ? (LAYER_BY_ID[nL] > L || LAYER_BY_ID[sL] > L || LAYER_BY_ID[wL] > L || LAYER_BY_ID[eL] > L) : false;

  switch (mat) {
    case 'grass': case 'forest': case 'lawn': {
      const big = vnoise(x, y, 40, seed), small = vnoise(x, y, 7, seed + 3), fine = hash2(x, y, seed + 1);
      let n = big * 0.55 + small * 0.3 + fine * 0.15;
      if (mat === 'forest') n *= 0.78;
      else if (mat === 'lawn') n = 0.3 + n * 0.45;
      let idx = n < 0.3 ? 1 : n < 0.55 ? 2 : n < 0.72 ? 3 : 4;
      if (n < 0.14) idx = 0;
      if (mat === 'lawn' && Math.floor(x / 8) % 2 === 0) idx = Math.max(0, idx - 1);
      if (mat === 'forest') idx = Math.max(0, idx - 1);
      let c = PAL.grass[idx];
      if (hiNear) c = PAL.grass[Math.max(0, idx - 1)];
      // 水边湿润暗边
      if (mm.at(x, y - 1) === MID.water || mm.at(x, y + 1) === MID.water || mm.at(x - 1, y) === MID.water || mm.at(x + 1, y) === MID.water) c = PAL.grass[0];
      return c;
    }
    case 'dirt': {
      const n = vnoise(x, y, 6, seed + 11) * 0.7 + hash2(x, y, seed) * 0.3;
      let c = PAL.dirt[Math.max(0, Math.min(4, Math.floor(n * 5)))];
      if (edge) c = PAL.dirt[1];
      return c;
    }
    case 'sand': {
      const n = vnoise(x, y, 5, seed + 17);
      return mixRamp(PAL.dirt, 3 + (n > 0.55 ? 1 : 0)); }
    case 'path': {
      const joint = x % 16 === 0 || y % 16 === 0;
      let c = PAL.stone[joint ? 2 : 3];
      if (!joint && hash2(x, y, seed) < 0.03) c = PAL.stone[2];
      if (!joint && hash2(x, y, seed + 1) < 0.02) c = PAL.stone[4];
      if (edge) c = lowN || lowW ? PAL.stone[4] : PAL.stone[1];
      return c;
    }
    case 'stone': {
      const px = Math.floor(x / 16), py = Math.floor(y / 16);
      const joint = x % 16 === 0 || y % 16 === 0;
      const tint = hash2(px, py, seed);
      let c = PAL.stone[tint < 0.1 ? 2 : tint > 0.9 ? 4 : 3];
      if (joint) c = PAL.stone[2];
      else if (x % 16 === 1 || y % 16 === 1) c = PAL.stone[4];
      else if (hash2(x, y, seed + 2) < 0.025) c = PAL.stone[2];
      if (edge) c = lowN || lowW ? PAL.stone[4] : PAL.stone[1];
      return c;
    }
    case 'paver': {
      const row = Math.floor(y / 4), off = (row % 2) * 4;
      const bx = Math.floor((x + off) / 8);
      const mort = y % 4 === 3 || (x + off) % 8 === 7;
      const r = hash2(bx, row, seed);
      let c = mort ? PAL.paver[0] : PAL.paver[r < 0.2 ? 1 : r < 0.75 ? 2 : 3];
      if (edge) c = PAL.paver[0];
      return c;
    }
    case 'asphalt': {
      const n = hash2(x, y, seed);
      let c = PAL.asphalt[n < 0.08 ? 0 : n < 0.9 ? 1 : 2];
      if (edge) c = lowN || lowW ? PAL.stone[3] : PAL.stone[1]; // 路缘石
      return c;
    }
    case 'water': return waterColor(ctx, x, y);
    case 'track': {
      const n = hash2(x, y, seed);
      let c = PAL.track[n < 0.1 ? 0 : n < 0.8 ? 1 : 2];
      if (edge) c = PAL.track[0];
      return c;
    }
    case 'pitch': {
      const stripe = Math.floor(x / 16) % 2;
      let c = PAL.pitch[stripe];
      if (hash2(x, y, seed) < 0.05) c = PAL.pitch[stripe ^ 1];
      if (edge) c = [30, 80, 40, 255];
      return c;
    }
    case 'courtBlue': case 'courtGreen': case 'courtRed': {
      const ramp = mat === 'courtBlue' ? PAL.courtBlue : mat === 'courtGreen' ? PAL.courtGreen : PAL.courtRed;
      let c = ramp[hash2(x, y, seed) < 0.06 ? 1 : 0];
      if (edge) c = shadeUp(ramp[0], 0.8);
      return c;
    }
    case 'roof': {
      const joint = x % 8 === 0 || y % 8 === 0;
      let c = PAL.white[joint ? 2 : 3];
      if (edge) c = PAL.white[1];
      return c;
    }
    case 'bedPink': case 'bedPurple': case 'bedYellow': {
      const pal = mat === 'bedPink' ? [PAL.blossom[0], PAL.blossom[1], PAL.blossom[2], PAL.blossom[3]] : mat === 'bedPurple' ? [hex2('#5a3a8a'), hex2('#7a52b0'), hex2('#a07ad0'), hex2('#d0b4f0')] : [PAL.ginkgo[1], PAL.ginkgo[2], PAL.ginkgo[3], PAL.ginkgo[4]];
      const r = hash2(x, y, seed + 51);
      if (edge) return PAL.grass[0];
      if (r < 0.36) return pal[Math.floor(hash2(x, y, seed + 52) * 4)];
      if (r < 0.5) return PAL.leaf[2];
      return PAL.grass[1];
    }
    case 'plaza': case 'plazaDark': case 'plazaWarm': {
      // 石灰岩/铺装大板：16px 大缝 + 8px 极淡细缝；每块板轻微明暗；大尺度上有 64px 级的色带分区与每 128px 的深色分格带（铺装图案），
      // 并按低频噪声做"板组"色差（旧石板/新石板）、零星细斑
      const R = mat === 'plazaWarm' ? PAL.plazaWarm : PAL.plaza, dark = mat === 'plazaDark';
      const slab = hash2(Math.floor(x / 8), Math.floor(y / 8), seed + 61);
      const grp = vnoise(x, y, 70, seed + 64);               // 板组色差
      let c = R[(dark ? 1 : 2) + (slab > 0.9 ? 1 : slab < 0.07 ? -1 : 0) + (grp > 0.68 ? 1 : grp < 0.28 ? -1 : 0)] ?? R[2];
      if (x % 16 === 0 || y % 16 === 0) c = R[dark ? 0 : 1];
      else if (!dark && (x % 8 === 0 || y % 8 === 0)) c = shade2(R[2], 0.95);
      else if (x % 16 === 1 || y % 16 === 1) c = R[dark ? 2 : 3];
      else if (hash2(x, y, seed + 62) < 0.03) c = R[dark ? 0 : 1];
      // 分格带：每 128px 一条 2px 深色带（东西/南北各一），交叉处加方块
      const bx = x % 128, by = y % 128;
      if (!dark && (bx < 3 || by < 3)) c = bx < 3 && by < 3 ? R[0] : shade2(R[1], 0.96);
      else if (!dark && ((bx >= 3 && bx < 5) || (by >= 3 && by < 5))) c = R[4];
      if (edge) c = lowN || lowW ? R[4] : R[0];
      return c;
    }
    case 'rubber': { // 青灰色塑胶场地：大块暗纹 + 细颗粒
      const R = ['#587f90', '#678f9f', '#759dac', '#84aab8'].map(hex2);
      const n = vnoise(x, y, 14, seed + 71), g = hash2(x, y, seed + 72);
      let c = R[n > 0.62 ? 2 : n > 0.3 ? 1 : 1]; if (g < 0.1) c = R[0]; else if (g > 0.93) c = R[3];
      if (edge) c = R[0];
      return c;
    }
    case 'boardwalk': { // 木栈道：横向木板 + 板缝 + 两侧护边
      const W = PAL.wood;
      const k = y % 4, lr = mm.at(x, y - 3) !== m, ud = mm.at(x, y + 3) !== m;
      let c = k === 3 ? W[1] : (Math.floor(x / 11 + Math.floor(y / 4) * 5) % 3 === 0 ? W[3] : W[2]);
      if (k === 0) c = W[4];
      if (hash2(x, y, seed + 73) < 0.04) c = W[1];
      if (lr || ud) c = W[0];
      return c;
    }
    case 'steps': {
      // 台阶：每 5px 一级（高光踏面 / 浅 / 中 / 暗立面），两侧略暗
      const k = y % 5;
      let c = k === 0 ? PAL.steps[4] : k === 1 ? PAL.steps[3] : k === 2 ? PAL.steps[3] : k === 3 ? PAL.steps[2] : PAL.steps[0];
      const lw = mm.at(x - 3, y) !== m, rw = mm.at(x + 3, y) !== m;
      if (lw || rw) c = k === 0 ? PAL.steps[3] : PAL.steps[1];
      return c;
    }
    case 'line': return PAL.line;
    case 'lineY': return PAL.markY;
    case 'zebraH': return Math.floor(x / 4) % 2 === 0 ? PAL.markW : PAL.asphalt[1];
    case 'zebraV': return Math.floor(y / 4) % 2 === 0 ? PAL.markW : PAL.asphalt[1];
  }
  return PAL.grass[2];
}
function hex2(c: string): RGBA { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]; }
function shade2(c: RGBA, f: number): RGBA { return [c[0] * f, c[1] * f, c[2] * f, c[3]].map(Math.round) as RGBA; }
function shadeUp(c: RGBA, f = 1.0): RGBA { return [Math.min(255, c[0] * f * 0.94), Math.min(255, c[1] * f * 0.94), Math.min(255, c[2] * f * 0.96), 255]; }
function mixRamp(r: RGBA[], i: number): RGBA { return r[Math.max(0, Math.min(r.length - 1, i))]; }

function waterColor(ctx: ColorCtx, x: number, y: number): RGBA {
  const { wd, frame, seed } = ctx;
  let d = 40;
  if (wd) { const ix = x - wd.X0, iy = y - wd.Y0; if (ix >= 0 && iy >= 0 && ix < wd.W && iy < wd.H) d = wd.d[iy * wd.W + ix] / 3; }
  // 岸线：1px 深色描边 -> 浅滩 -> 中 -> 深
  let base: RGBA;
  if (d <= 1.2) base = PAL.water[0];
  else if (d <= 3.5) base = PAL.water[3];
  else if (d <= 7) base = PAL.water[2];
  else base = PAL.water[d > 16 ? 1 : 2];
  // 波光：短横线随帧移动
  const sx = x - frame * 3;
  const cellX = Math.floor(sx / 7), cellY = Math.floor(y / 3);
  const h = hash2(cellX, cellY, seed + 21);
  if (h < 0.1 && d > 2) { const off = Math.floor(hash2(cellX, cellY, seed + 5) * 3); const lx = ((sx % 7) + 7) % 7; if (y % 3 === 1 && lx >= off && lx < off + 3) return PAL.water[4]; }
  // 浅滩泡沫
  if (d > 1.2 && d <= 3.5 && hash2(x + frame * 2, y, seed + 9) < 0.06) return PAL.foam;
  // 水面轻微暗纹
  if (d > 7 && hash2(Math.floor((x + frame * 2) / 3), Math.floor(y / 2), seed + 33) < 0.07) return PAL.water[0];
  return base;
}

/** 季节点缀（由 seasons.ts 设置）：specks = 落叶/雪粒的颜色，speckP = 每格出现的概率；flowers = 画不画小花 */
export const GROUND_FX = { specks: [] as RGBA[], speckP: 0, flowers: true };

/** 点缀（草丛/小花）：确定性地写入图像，仅覆盖草地像素 */
export function decorateGrass(ctx: ColorCtx, img: Img, ox: number, oy: number) {
  const { mm, seed } = ctx;
  for (let ty = 0; ty < img.h / TILE; ty++) for (let tx = 0; tx < img.w / TILE; tx++) {
    const gx = Math.floor(ox / TILE) + tx, gy = Math.floor(oy / TILE) + ty;
    const n = Math.floor(2 * hash2(gx, gy, seed + 100) * 1.7);
    for (let k = 0; k < n; k++) {
      const px = gx * TILE + 2 + Math.floor(hash2(gx, gy, seed + 200 + k) * 12), py = gy * TILE + 2 + Math.floor(hash2(gx, gy, seed + 300 + k) * 12);
      const m = mm.at(px, py);
      if (m !== MID.grass && m !== MID.lawn && m !== MID.forest) continue;
      if (mm.at(px - 1, py) !== m || mm.at(px + 1, py) !== m || mm.at(px, py + 1) !== m) continue;
      const lx = px - ox, ly = py - oy;
      const dark = m === MID.forest ? PAL.grass[0] : PAL.grass[1], light = PAL.grass[4];
      img.set(lx, ly, dark); img.set(lx - 1, ly - 1, light); img.set(lx + 1, ly - 1, light);
    }
    // 季节点缀：秋天的落叶、冬天的雪粒（只落在草地上）
    if (GROUND_FX.specks.length && hash2(gx, gy, seed + 800) < GROUND_FX.speckP) {
      const px = gx * TILE + 1 + Math.floor(hash2(gx, gy, seed + 810) * 14), py = gy * TILE + 1 + Math.floor(hash2(gx, gy, seed + 820) * 14);
      const m = mm.at(px, py);
      if (m === MID.grass || m === MID.lawn || m === MID.forest) {
        const col = GROUND_FX.specks[Math.floor(hash2(gx, gy, seed + 830) * GROUND_FX.specks.length)];
        img.set(px - ox, py - oy, col); if (hash2(gx, gy, seed + 840) < 0.5) img.set(px - ox + 1, py - oy, col);
      }
    }
    // 小花：成片（由低频噪声控制），不是处处都有
    const fl = vnoise(gx * 16, gy * 16, 90, seed + 7);
    if (GROUND_FX.flowers && fl > 0.64 && hash2(gx, gy, seed + 400) < 0.5) {
      const px = gx * TILE + 3 + Math.floor(hash2(gx, gy, seed + 500) * 10), py = gy * TILE + 3 + Math.floor(hash2(gx, gy, seed + 600) * 10);
      const m = mm.at(px, py);
      if (m === MID.grass || m === MID.lawn) {
        const col = [PAL.grassFlowerY, PAL.grassFlowerW, PAL.grassFlowerP][Math.floor(hash2(gx, gy, seed + 700) * 3)];
        img.set(px - ox, py - oy, col); img.set(px - ox, py - oy + 1, PAL.grass[1]);
      }
    }
  }
}

/** 渲染一个像素窗口（可含水动画帧） */
export function renderRegion(ctx: ColorCtx, x0: number, y0: number, w: number, h: number, decorate = true): Img {
  const img = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.set(x, y, pixelColor(ctx, x0 + x, y0 + y));
  if (decorate) decorateGrass(ctx, img, x0, y0);
  return img;
}

export function terrainFromBlueprint(t: Terrain, tilesW: number, tilesH: number): MaterialMap {
  const mm = new MaterialMap(tilesW, tilesH);
  paintShapes(mm, t.shapes);
  return mm;
}
