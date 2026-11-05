/**
 * 校园小猫：6 种毛色 × 4 种姿势（走、坐、睡、吃），都是朝右的侧视图（朝左由游戏里翻转）。
 * 每帧 26×20（含 1px 彩色描边与脚下投影），脚点 = (13, 17)。颜色全部来自下面的 COATS，同 seed 同图。
 * 命名：cat{毛色}_{walk|sit|sleep|eat}_{帧}。毛色顺序要与 src/shared/cats.ts 的 COAT_NAMES 一致。
 */
import { Img, hex, type RGBA } from './px.ts';

interface Blob { on: 'body' | 'head'; dx: number; dy: number; r: number; c: string }
export interface Coat { name: string; base: string; shade: string; light: string; belly: string; stripe?: string; blobs?: Blob[]; eye: string; ear: string; nose: string }

export const COATS: Coat[] = [
  { name: '橘猫', base: '#e8a040', shade: '#c27a28', light: '#f6c670', belly: '#f8e0b0', stripe: '#c0702a', eye: '#4a8a3a', ear: '#f0a0a0', nose: '#e88a8a' },
  { name: '黑猫', base: '#34303c', shade: '#221f2a', light: '#524c5e', belly: '#46404e', eye: '#d8d040', ear: '#7a5a6a', nose: '#6a5060' },
  { name: '白猫', base: '#f4f0e8', shade: '#cfc8bd', light: '#ffffff', belly: '#fffaf2', eye: '#4a90c8', ear: '#f4b0b4', nose: '#f09aa0' },
  { name: '三花', base: '#f4f0e8', shade: '#d4cdc0', light: '#ffffff', belly: '#fffaf2', eye: '#5a8a3a', ear: '#f0a8a8', nose: '#f09aa0',
    blobs: [{ on: 'body', dx: -3, dy: -1, r: 3.2, c: '#e8a040' }, { on: 'body', dx: 3, dy: -2, r: 2.6, c: '#2c2832' }, { on: 'head', dx: -1.2, dy: -2.4, r: 2.6, c: '#e8a040' }, { on: 'body', dx: 0, dy: 2.4, r: 1.6, c: '#2c2832' }] },
  { name: '奶牛猫', base: '#f6f2ea', shade: '#d4cdc2', light: '#ffffff', belly: '#fffaf2', eye: '#d0b838', ear: '#f0a8ac', nose: '#f09aa0',
    blobs: [{ on: 'body', dx: -2, dy: -2, r: 3.8, c: '#2c2832' }, { on: 'body', dx: 4, dy: 1.2, r: 2.2, c: '#2c2832' }, { on: 'head', dx: 1.6, dy: -2.2, r: 2.4, c: '#2c2832' }] },
  { name: '灰猫', base: '#8d93a0', shade: '#666c7a', light: '#b0b6c2', belly: '#c6cad2', stripe: '#6a7080', eye: '#d8c040', ear: '#c8a0a8', nose: '#c88a94' },
];

export type Pose = 'walk' | 'sit' | 'sleep' | 'eat';
export const POSES: { pose: Pose; frames: number }[] = [{ pose: 'walk', frames: 4 }, { pose: 'sit', frames: 2 }, { pose: 'sleep', frames: 2 }, { pose: 'eat', frames: 2 }];

const W = 24, H = 18; // 画布（描边前）
const FX = 12, FY = 16; // 脚点（描边前）

function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: RGBA) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    img.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

interface Parts { img: Img; coat: Coat; C: { base: RGBA; shade: RGBA; light: RGBA; belly: RGBA; stripe?: RGBA; eye: RGBA; ear: RGBA; nose: RGBA }; body: [number, number]; head: [number, number] }

const pal = (coat: Coat) => ({ base: hex(coat.base), shade: hex(coat.shade), light: hex(coat.light), belly: hex(coat.belly), stripe: coat.stripe ? hex(coat.stripe) : undefined, eye: hex(coat.eye), ear: hex(coat.ear), nose: hex(coat.nose) });

/** 椭圆体：暗边 → 底色 → 亮部，三层叠出体积 */
function volume(img: Img, cx: number, cy: number, rx: number, ry: number, C: Parts['C']) {
  img.ellipse(cx, cy, rx, ry, C.shade);
  img.ellipse(cx, cy - 0.5, rx - 0.7, ry - 0.7, C.base);
  img.ellipse(cx - 0.8, cy - ry * 0.45, rx * 0.55, ry * 0.32, C.light);
}

/** 花纹：斑块只涂在已有的不透明像素上；条纹按身体上的位置画 */
function markings(p: Parts) {
  const { img, coat, C } = p;
  for (const b of coat.blobs ?? []) {
    const [ox, oy] = b.on === 'body' ? p.body : p.head, col = hex(b.c);
    for (let y = Math.floor(oy + b.dy - b.r); y <= Math.ceil(oy + b.dy + b.r); y++) for (let x = Math.floor(ox + b.dx - b.r); x <= Math.ceil(ox + b.dx + b.r); x++) {
      if (img.alpha(x, y) && (x + 0.5 - ox - b.dx) ** 2 + (y + 0.5 - oy - b.dy) ** 2 <= b.r * b.r) img.set(x, y, col);
    }
  }
  if (C.stripe) {
    const [bx, by] = p.body;
    for (let i = -2; i <= 2; i++) for (let y = Math.round(by - 4); y <= Math.round(by - 1); y++) {
      const x = Math.round(bx + i * 2.4);
      if (img.alpha(x, y) && (y + i) % 3 !== 0) img.set(x, y, C.stripe);
    }
    const [hx, hy] = p.head; // 额头的"M"纹
    for (const dx of [-1, 0, 1]) if (img.alpha(Math.round(hx + dx), Math.round(hy - 3))) img.set(Math.round(hx + dx), Math.round(hy - 3), C.stripe);
  }
}

function head(p: Parts, hx: number, hy: number, o: { closed?: boolean; down?: boolean } = {}) {
  const { img, C } = p;
  p.head = [hx, hy];
  // 耳朵（先画，头盖在上面）
  for (const s of [-1, 1]) {
    const ex = Math.round(hx + s * 2.2 + 0.5), ey = Math.round(hy - 3.2);
    img.set(ex, ey, C.base); img.set(ex, ey - 1, C.base); img.set(ex + s, ey, C.shade); img.set(ex - s, ey, C.base);
    img.set(ex, ey + 1, C.ear); // 耳内
  }
  volume(img, hx, hy, 3.6, 3.2, C);
  img.set(Math.round(hx - 2), Math.round(hy + 1.6), C.belly); img.set(Math.round(hx - 1), Math.round(hy + 2), C.belly); // 脸颊/下巴
  // 眼睛与鼻子（朝右：眼靠右）
  const ex = Math.round(hx + 1.6), ey = Math.round(hy - 0.4);
  if (o.closed) { img.set(ex, ey + 1, hex('#2a1f2e')); img.set(ex - 1, ey + 1, hex('#2a1f2e')); }
  else { img.set(ex, ey, hex('#241a26')); img.set(ex, ey - 1, C.eye); img.set(ex - 1, ey, C.eye); img.set(ex + 1, ey - 1, hex('#ffffff')); }
  img.set(Math.round(hx + 3.2), Math.round(hy + 0.8), C.nose);
}

function tail(img: Img, pts: [number, number][], C: Parts['C']) {
  pts.forEach(([x, y], i) => { img.set(x, y, i > pts.length - 3 ? C.shade : C.base); img.set(x, y + 1, C.shade); });
}
function legs(img: Img, xs: number[], y0: number, y1: number, C: Parts['C']) {
  for (const x of xs) { img.vline(x, y0, y1 - y0, C.base); img.set(x, y1, C.belly); img.set(x + 1, y1, C.belly); } // 白手套
}

function walk(p: Parts, f: number) {
  const { img, C } = p;
  p.body = [10, 10];
  // 腿：远侧一对（暗）在前，近侧一对在后；四拍步态
  const sw = [[-1, 1, 1, -1], [0, 0, 0, 0], [1, -1, -1, 1], [0, 0, 0, 0]][f];
  const lift = [[0, 1, 1, 0], [0, 0, 0, 0], [1, 0, 0, 1], [0, 0, 0, 0]][f];
  const bobY = f === 1 || f === 3 ? 0 : 1;
  const legX = [6, 8, 13, 15];
  [1, 3].forEach((i) => legs(img, [legX[i] + sw[i]], 12 - bobY, 15 - lift[i], { ...C, base: C.shade }));
  tail(img, [[3, 9 - bobY], [2, 8 - bobY], [1, 6 - bobY], [1, 4 - bobY], [2, 3 - bobY]], C);
  volume(img, 10, 10 - bobY, 7, 3.7, C);
  img.hline(6, 12 - bobY, 8, C.belly);
  [0, 2].forEach((i) => legs(img, [legX[i] + sw[i]], 12 - bobY, 15 - lift[i], C));
  p.body = [10, 10 - bobY];
  head(p, 17, 7 - bobY);
}

function sit(p: Parts, f: number) {
  const { img, C } = p;
  p.body = [9, 11];
  // 尾巴盘在身前的地面上，第二帧尾尖翘起
  const flick = f === 1;
  tail(img, [[2, 15], [3, 16], [5, 16], [7, 16], [9, 16], [11, 16], flick ? [12, 15] : [12, 16]], C);
  volume(img, 9, 11.5, 5.4, 4.6, C);            // 后臀
  volume(img, 13, 8.5, 3.2, 5, C);              // 立起的胸
  img.vline(13, 11, 5, C.belly); img.vline(14, 11, 5, C.belly); img.set(13, 16, C.belly); img.set(14, 16, C.belly);  // 前腿 + 白手套
  img.hline(11, 15, 4, C.shade);
  head(p, 15, 5);
}

function sleep(p: Parts, f: number) {
  const { img, C } = p;
  const b = f; // 呼吸：身体上下起伏 1px
  p.body = [10, 12];
  tail(img, [[16, 15], [14, 16], [11, 16], [8, 16], [5, 16], [3, 15], [3, 14]], C);
  volume(img, 10, 12.5 - b * 0.4, 7.4, 3.8 + b * 0.4, C);
  img.hline(5, 15, 10, C.shade);
  head(p, 16, 12, { closed: true });
  img.set(18, 15, C.belly); img.set(19, 15, C.belly); // 前爪垫在下巴下
}

function eat(p: Parts, f: number) {
  const { img, C } = p;
  p.body = [8, 10];
  const dip = f; // 低头啄食
  tail(img, [[2, 9], [1, 8], [1, 6], [2, 5], [3, 4]], C);
  [[5, 11], [7, 11]].forEach(([x, y]) => legs(img, [x], y + 1, 15, { ...C, base: C.shade }));
  volume(img, 8, 10, 6.4, 3.8, C);
  [[5, 12], [7, 12]].forEach(([x, y]) => legs(img, [x], y, 15, C));
  legs(img, [13, 15], 12, 15, C);
  head(p, 14.5, 11 + dip);
  img.hline(11, 14, 3, C.base);
}

export function buildCat(coatIdx: number, pose: Pose, f: number): Img {
  const coat = COATS[coatIdx], C = pal(coat);
  const img = new Img(W, H);
  const p: Parts = { img, coat, C, body: [10, 10], head: [16, 7] };
  ({ walk, sit, sleep, eat })[pose](p, f);
  markings(p);
  const o = img.outlinedSoft(0.36, [40, 28, 64, 255]);
  const out = new Img(o.w, o.h + 2);
  for (let y = o.h - 5; y < o.h + 2; y++) for (let x = 2; x < o.w - 2; x++) { // 脚下柔和投影
    const dx = (x + 0.5 - (FX + 1)) / 8.5, dy = (y + 0.5 - (FY + 2.4)) / 1.9;
    if (dx * dx + dy * dy <= 1) out.set(x, y, [28, 36, 66, dx * dx + dy * dy > 0.5 ? 34 : 60]);
  }
  out.blit(o, 0, 0);
  return out;
}

export const CAT_META = { w: W + 2, h: H + 4, ax: FX + 1, ay: FY + 2 };
