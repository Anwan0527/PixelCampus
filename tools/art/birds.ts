/**
 * 水禽美术（精工湖的鸭子和天鹅）：程序化像素画，做法和小猫 Rig 一致——外观（调色板 + 花纹开关）与姿势（Pose）分开，
 * 任何外观都能播放任何动作；每个形状按"在形状里的位置"分亮 / 中 / 暗三阶，最后统一加深色轮廓。
 * 视角：侧视（面朝右，朝左由游戏翻转）+ 正面（朝向镜头）+ 背面（背对镜头）；水线固定在帧里的同一行（BIRD_FRAME.ay），身子下半截泡在水里。
 * 种类（编号 = BIRD_KINDS 顺序，和 src/shared/waterfowl.ts 一致）：公绿头鸭、母绿头鸭、白鸭、白天鹅、黑天鹅。
 */
import { Img, hash2, hex, type RGBA } from './px.ts';

/** 画布 42×38，加 1 像素轮廓后每帧 44×40；锚点 = 水线正中（水线在画布第 29 行，轮廓平移 1 像素，所以 ay = 30） */
const CV = { w: 42, h: 38 };
export const BIRD_FRAME = { w: CV.w + 2, h: CV.h + 2, ax: 22, ay: 30 };
const WL = 29;

type Tone = [RGBA, RGBA, RGBA]; // 亮、中、暗
const tone = (base: string, l = 0.18, d = 0.22): Tone => {
  const c = hex(base);
  const mix = (t: number, to: number): RGBA => [Math.round(c[0] + (to - c[0]) * t), Math.round(c[1] + (to - c[1]) * t), Math.round(c[2] + (to - c[2]) * t), 255];
  const cool = (v: RGBA): RGBA => [Math.max(0, v[0] - 10), Math.max(0, v[1] - 4), Math.min(255, v[2] + 12), 255]; // 暗部偏冷紫
  return [mix(l, 255), [c[0], c[1], c[2], 255], cool(mix(d, 0))];
};

export interface BirdLook {
  name: string; swan: boolean;
  body: Tone; head: Tone; wing: Tone; chest?: Tone; tail: Tone;
  bill: RGBA; billTip: RGBA; knob?: boolean; ring?: boolean; mottled?: boolean; patch?: RGBA; wingTip?: RGBA;
  eye: RGBA; outline: RGBA;
}

export const BIRD_LOOKS: BirdLook[] = [
  { name: '公绿头鸭', swan: false, body: tone('#a9a9a2'), head: tone('#1f8a52', 0.22, 0.3), wing: tone('#9a9a94'), chest: tone('#8a4e30'), tail: tone('#2c2c34', 0.3, 0.3), bill: hex('#e8c433'), billTip: hex('#9a7a18'), ring: true, patch: hex('#3a5ec0'), eye: hex('#14141a'), outline: hex('#2c3030') },
  { name: '母绿头鸭', swan: false, body: tone('#a07c52'), head: tone('#8a6a46'), wing: tone('#8e6c46'), tail: tone('#6a4c30'), bill: hex('#cc8a3a'), billTip: hex('#4a3820'), mottled: true, patch: hex('#3a5ec0'), eye: hex('#14141a'), outline: hex('#3a2c20') },
  { name: '白鸭', swan: false, body: tone('#f4f2ec', 0.4, 0.2), head: tone('#f6f4ee', 0.4, 0.2), wing: tone('#eceae4', 0.4, 0.2), tail: tone('#e6e4de', 0.4, 0.2), bill: hex('#f2a032'), billTip: hex('#c07a1c'), eye: hex('#14141a'), outline: hex('#4a5060') },
  { name: '白天鹅', swan: true, body: tone('#fbfaf6', 0.5, 0.18), head: tone('#fbfaf6', 0.5, 0.18), wing: tone('#f2f0ea', 0.5, 0.2), tail: tone('#eeece6', 0.5, 0.2), bill: hex('#f0902a'), billTip: hex('#20202a'), knob: true, eye: hex('#14141a'), outline: hex('#4a5062') },
  { name: '黑天鹅', swan: true, body: tone('#34323c', 0.5, 0.35), head: tone('#34323c', 0.5, 0.35), wing: tone('#2a2830', 0.5, 0.3), tail: tone('#24222a', 0.5, 0.3), bill: hex('#d84040'), billTip: hex('#f6f0e8'), wingTip: hex('#eae6de'), eye: hex('#f2e0a0'), outline: hex('#121218') },
];

/* ───────── 画布 ───────── */
class Cv {
  img = new Img(CV.w, CV.h);
  /** 椭圆：按位置分三阶（上亮下暗，左上方来光） */
  ell(cx: number, cy: number, rx: number, ry: number, t: Tone, o: { cut?: number; mot?: Tone; seed?: number; lit?: number } = {}) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (o.cut !== undefined && y >= o.cut) continue;
      const v = dy + dx * 0.25 * (o.lit ?? 1);
      let c = v < -0.45 ? t[0] : v > 0.38 ? t[2] : t[1];
      if (o.mot && hash2(x, y, o.seed ?? 5) < 0.24 && c !== t[0]) c = o.mot[2];
      this.img.set(x, y, c);
    }
  }
  dot(x: number, y: number, c: RGBA) { this.img.set(x, y, c); }
  /** 粗线（沿路径盖圆）：脖子、羽毛 */
  line(x0: number, y0: number, x1: number, y1: number, r: number, t: Tone, cut?: number) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= n; i++) { const k = i / n; this.ell(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, r, r, t, { cut }); }
  }
  /** 沿二次曲线的脖子（起点 → 控制点 → 终点），半径逐渐变细 */
  neck(p0: [number, number], pc: [number, number], p1: [number, number], r0: number, r1: number, t: Tone, cut?: number) {
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const k = i / n, u = 1 - k;
      const x = u * u * p0[0] + 2 * u * k * pc[0] + k * k * p1[0], y = u * u * p0[1] + 2 * u * k * pc[1] + k * k * p1[1];
      this.ell(x, y, r0 + (r1 - r0) * k, r0 + (r1 - r0) * k, t, { cut });
    }
  }
  /** 水线以下的部分抹掉（身子泡在水里） */
  sink(from = WL) { for (let y = from; y < this.img.h; y++) for (let x = 0; x < this.img.w; x++) this.img.data[(y * this.img.w + x) * 4 + 3] = 0; }
  /** 水面涟漪（半透明白）：围着身子的一圈 + 可选尾迹 */
  ripple(cx: number, rx: number, phase: number, wake = 0) {
    const w: RGBA = [255, 255, 255, 120], w2: RGBA = [255, 255, 255, 70];
    for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) { const e = Math.abs(x - cx) / rx; if (e < 0.94) this.img.set(x, WL + (e > 0.55 ? 0 : 1) + (phase & 1 && e < 0.3 ? 1 : 0), e > 0.7 ? w2 : w); }
    if (wake) for (let i = 0; i < wake; i++) { this.img.set(Math.round(cx - rx - 2 - i * 2), WL - 1 - (i & 1), w2); this.img.set(Math.round(cx - rx - 1 - i * 2), WL + 1, w2); }
  }
  done(outline: RGBA): Img { return this.img.outlined(outline, false); }
}

/* ───────── 姿势 ───────── */
export type HeadMode = 'up' | 'dip' | 'preen' | 'tuck';
export interface BPose {
  bob?: number;          // 身体上下（像素，负 = 抬）
  head?: HeadMode; hx?: number; hy?: number;   // 头的偏移（相对默认位置）
  wing?: number;         // 0 收拢 .. 1 展开
  tailUp?: number;       // 尾巴翘起
  blink?: boolean; open?: boolean;
  phase?: number;        // 涟漪相位
  wake?: number;         // 尾迹长度
  splash?: number;       // 扑翅时的水花
}
export interface BAnim { id: string; fps: number; loop: boolean; frames: BPose[]; view?: 'side' | 'down' | 'up' }

const seq = (n: number, f: (i: number) => BPose): BPose[] => Array.from({ length: n }, (_, i) => f(i));
export const BIRD_ANIMS: BAnim[] = [
  { id: 'swim', fps: 6, loop: true, frames: seq(4, (i) => ({ bob: [0, -1, 0, 0][i], hx: [0, 0.6, 1, 0.6][i], phase: i, wake: 2 })) },
  { id: 'idle', fps: 1.6, loop: true, frames: [{ phase: 0 }, { bob: -1, phase: 1 }] },
  { id: 'preen', fps: 3, loop: true, frames: seq(4, (i) => ({ head: 'preen', hy: [0, 1, 0, 1][i], hx: [0, 0, -1, 0][i], phase: i & 1 })) },
  { id: 'flap', fps: 7, loop: true, frames: seq(4, (i) => ({ wing: [0.45, 1, 0.5, 1][i], bob: [-1, -2, -1, -2][i], phase: i, splash: 1 })) },
  { id: 'dip', fps: 3, loop: true, frames: seq(4, (i) => ({ head: 'dip', hx: [0, 0.5, 0.5, 0][i], hy: [0, 1, 1, 0][i], tailUp: [1, 2, 2, 1][i], phase: i & 1 })) },
  { id: 'sleep', fps: 1, loop: true, frames: [{ head: 'tuck', blink: true, phase: 0 }, { head: 'tuck', blink: true, bob: -1, phase: 1 }] },
  { id: 'idle_down', fps: 1.6, loop: true, view: 'down', frames: [{ phase: 0 }, { bob: -1, phase: 1, blink: true }] },
  { id: 'swim_down', fps: 5, loop: true, view: 'down', frames: seq(2, (i) => ({ bob: -i, phase: i, wake: 1 })) },
  { id: 'idle_up', fps: 1.6, loop: true, view: 'up', frames: [{ phase: 0 }, { bob: -1, phase: 1 }] },
  { id: 'swim_up', fps: 5, loop: true, view: 'up', frames: seq(2, (i) => ({ bob: -i, phase: i, wake: 1 })) },
];

/* ───────── 侧视 ───────── */
function drawSide(L: BirdLook, P: BPose): Img {
  const c = new Cv(), s = L.swan, bob = Math.round(P.bob ?? 0), tu = P.tailUp ?? 0;
  const bx = s ? 17 : 17, by = WL - (s ? 5 : 4) + bob + (P.head === 'dip' ? 1 : 0), rx = s ? 9.5 : 8, ry = s ? 6 : 5;
  const mot = L.mottled ? L.body : undefined;
  // 尾巴（翘起的小三角）
  c.ell(bx - rx + 1, by - 2 - tu, s ? 3.4 : 2.8, s ? 2.2 : 1.8, L.tail, { cut: WL });
  // 身体
  c.ell(bx, by, rx, ry, L.body, { cut: WL, mot, seed: 3 });
  // 胸（公绿头鸭栗色胸、天鹅 / 白鸭同色）
  if (L.chest) c.ell(bx + rx * 0.55, by + 0.5, 3.6, 3.8, L.chest, { cut: WL });
  // 脖子和头
  const neckBase: [number, number] = [bx + rx * 0.6, by - ry * 0.4];
  let head: [number, number], billDir = 1;
  const hx = P.hx ?? 0, hy = P.hy ?? 0;
  if (P.head === 'tuck') head = [bx + 1, by - ry + 0.5];
  else if (P.head === 'preen') head = [bx + 1 + hx, by - 1 + hy];
  else if (P.head === 'dip') head = [bx + rx + (s ? 4 : 3) + hx, WL - 3 + hy];
  else head = s ? [bx + rx * 0.6 + 4 + hx, by - 15 + (bob ? 0 : 0)] : [bx + rx * 0.6 + 3.5 + hx, by - 8.5];
  if (P.head !== 'tuck') {
    if (s) {
      const pc: [number, number] = P.head === 'dip' ? [neckBase[0] + 7, neckBase[1] - 4] : P.head === 'preen' ? [bx + rx * 0.8, by - 12] : [bx + rx * 0.6 - 2.5, by - 9];
      c.neck(neckBase, pc, head, 2.3, 1.5, L.head, P.head === 'dip' ? WL : undefined);
    } else {
      const pc: [number, number] = P.head === 'preen' ? [bx + rx * 0.8, by - 8] : [neckBase[0] + 1.5, neckBase[1] - 4];
      c.neck(neckBase, pc, head, 2.1, 1.7, L.head, P.head === 'dip' ? WL : undefined);
    }
    if (L.ring) { const nx = neckBase[0] + (head[0] - neckBase[0]) * 0.18, ny = neckBase[1] + (head[1] - neckBase[1]) * 0.18; if (P.head !== 'dip' && P.head !== 'preen') for (let i = -2; i <= 2; i++) c.dot(Math.round(nx + i * 0.5), Math.round(ny + 0.5), hex('#f4f3ec')); }
  }
  billDir = P.head === 'preen' ? -1 : 1;
  const hr = s ? 2.4 : 3.1;
  c.ell(head[0], head[1], hr, hr * 0.9, L.head, { cut: P.head === 'dip' ? WL : undefined });
  // 嘴
  const bl = s ? 4 : 3.5, by0 = Math.round(head[1] + (P.head === 'dip' ? 1 : 0.5)), dirx = billDir;
  if (P.head === 'tuck') { /* 嘴藏在翅膀里 */ }
  else {
    for (let i = 0; i < bl; i++) { const px = Math.round(head[0] + dirx * (hr - 0.5 + i)), py = by0 + (P.head === 'dip' || P.head === 'preen' ? Math.round(i * 0.5) : 0); if (py < WL || P.head !== 'dip') { c.dot(px, py, i >= bl - 1 ? L.billTip : L.bill); if (!s || i < 2) c.dot(px, py + 1, L.bill); } }
    if (L.knob) c.dot(Math.round(head[0] + dirx * (hr - 0.5)), by0 - 1, L.billTip);
  }
  // 眼睛
  const ex = Math.round(head[0] + dirx * 0.8), ey = Math.round(head[1] - 0.6);
  if (P.head === 'tuck' || P.blink) c.dot(ex, ey, L.eye); else { c.dot(ex, ey, L.eye); if (hash2(ex, ey, 1) > 2) c.dot(ex, ey - 1, [255, 255, 255, 255]); }
  if (L.knob && P.head !== 'tuck') c.dot(ex - dirx, ey, L.billTip);   // 天鹅眼先的黑脸
  // 翅膀
  const w = P.wing ?? 0;
  if (w <= 0.01) {
    c.ell(bx - 1, by - 0.5, rx * 0.62, ry * 0.58, L.wing, { cut: WL, mot, seed: 8 });
    c.ell(bx - rx * 0.55, by + 0.5, 3.4, 1.4, L.wing, { cut: WL });                       // 后缘的长羽
    if (L.patch) { c.dot(Math.round(bx - 1), Math.round(by + 0.5), L.patch); c.dot(Math.round(bx), Math.round(by + 0.5), L.patch); c.dot(Math.round(bx + 1), Math.round(by + 0.5), [250, 250, 250, 255]); }
    if (L.wingTip) for (let i = 0; i < 4; i++) c.dot(Math.round(bx - rx * 0.62 - 1 - i * 0.4), Math.round(by + 0.4 + (i & 1) * 0.8), L.wingTip);
  } else {
    // 展翅：一把扇形的羽毛从肩膀向后上方展开（w 越大越向上），再盖上一层翅根
    const sx = bx + 1, sy = by - ry * 0.55, len = (s ? 15 : 10.5) * (0.55 + 0.45 * w);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + 0.1 + w * 0.5 + k * 0.23, l = len * (k === 2 || k === 3 ? 1 : 0.82);
      c.line(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, 1.1, k % 2 ? L.wing : [L.wing[0], L.wing[0], L.wing[1]], WL);
    }
    c.ell(bx - 0.5, by - 1.8, rx * 0.5, ry * 0.5, L.wing, { cut: WL });
  }
  c.sink();
  c.ripple(bx, rx + 3, P.phase ?? 0, P.wake ?? 0);
  if (P.splash) { const wh: RGBA = [255, 255, 255, 190]; for (let i = 0; i < 6; i++) c.dot(Math.round(bx - rx - 1 + i * 3 + (P.phase ?? 0)), WL - 1 - ((i * 5 + (P.phase ?? 0) * 3) % 4), wh); }
  return c.done(L.outline);
}

/* ───────── 正面 / 背面 ───────── */
function drawFront(L: BirdLook, P: BPose, back: boolean): Img {
  const c = new Cv(), s = L.swan, bob = Math.round(P.bob ?? 0), cx = 20;
  const by = WL - (s ? 5 : 4) + bob, rx = s ? 7.5 : 6.5, ry = s ? 5.5 : 4.8;
  if (back) c.ell(cx, by + ry - 1, 2.6, 1.8, L.tail, { cut: WL + 1 });               // 尾羽朝向镜头
  c.ell(cx, by, rx, ry, L.body, { cut: WL, mot: L.mottled ? L.body : undefined, seed: 11 });
  if (!back) {
    c.ell(cx, by + 0.5, rx * 0.55, ry * 0.8, L.chest ?? L.body, { cut: WL });
    // 翅膀：两侧
    c.ell(cx - rx + 1.2, by, 2.2, ry * 0.8, L.wing, { cut: WL }); c.ell(cx + rx - 1.2, by, 2.2, ry * 0.8, L.wing, { cut: WL });
  } else {
    c.ell(cx - 2.4, by - 0.5, 3.2, ry * 0.85, L.wing, { cut: WL }); c.ell(cx + 2.4, by - 0.5, 3.2, ry * 0.85, L.wing, { cut: WL });
    if (L.patch) { c.dot(cx - 4, by + 1, L.patch); c.dot(cx + 3, by + 1, L.patch); }
    for (let y = Math.round(by - ry + 1); y < WL - 1; y++) c.dot(cx, y, L.wing[2]);        // 背中线
  }
  // 脖子 + 头
  const hy = s ? by - 16 : by - 9.5;
  if (s) c.line(cx, by - ry + 2, cx, hy + 1, 2.1, L.head); else c.line(cx, by - ry + 2, cx, hy + 1, 2.4, L.head);
  if (L.ring && !back) for (let i = -2; i <= 2; i++) c.dot(cx + i, Math.round(hy + 4), hex('#f4f3ec'));
  const hr = s ? 2.6 : 3.2;
  c.ell(cx, hy, hr, hr, L.head);
  if (!back) {
    // 嘴朝下朝向镜头
    const bw = s ? 3 : 5;
    for (let i = -Math.floor(bw / 2); i <= Math.floor(bw / 2); i++) { c.dot(cx + i, Math.round(hy + hr - 0.6), L.bill); c.dot(cx + i, Math.round(hy + hr + 0.4), L.bill); if (Math.abs(i) < 2) c.dot(cx + i, Math.round(hy + hr + 1.4), i === 0 ? L.billTip : L.bill); }
    if (L.knob) c.dot(cx, Math.round(hy + 0.2), L.billTip);
    const ex = Math.max(1, Math.round(hr * 0.55)); c.dot(cx - ex, Math.round(hy - 0.4), L.eye); c.dot(cx + ex, Math.round(hy - 0.4), L.eye);
  }
  c.sink();
  c.ripple(cx, rx + 3, P.phase ?? 0, 0);
  if (P.wake) { const w2: RGBA = [255, 255, 255, 90]; c.dot(cx - rx - 2, WL, w2); c.dot(cx + rx + 2, WL, w2); }
  return c.done(L.outline);
}

/** 渲染一帧：view = 'side' 侧视（面朝右）/ 'down' 面朝镜头 / 'up' 背对镜头 */
export function renderBird(L: BirdLook, P: BPose, view: 'side' | 'down' | 'up' = 'side'): Img {
  return view === 'side' ? drawSide(L, P) : drawFront(L, P, view === 'up');
}
