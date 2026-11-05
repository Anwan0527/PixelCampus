/**
 * 人物 Rig 原型（设计文档 docs/ART_CHARACTER_CAT_DESIGN.md §3）：
 * 外观（发型/发色/衣服/配饰…）与动作（Pose 数据表）分离——任何外观都能播放任何动作。
 * 只依赖 px.ts 的 Img，不改动现有 characters.ts；确认方向后再合并成正式管线（P0）。
 * 画布 16×36（比正式的 16×32 多 4 行头顶留白，给丸子头/举手用），脚点不变：输出 18×40，脚点 (9, h-3)。
 */
import { Img, hex, type RGBA } from './px-core.ts';
import { APP_LEN, BOTTOMS, DYE_COLORS, EYE_COLORS, FLAG, FRINGES, GLASSES, HAIR_COLORS, HAIR_STYLES, HATS, IDX, SHOES, SKIN_COLORS, TOPS, type Appearance } from '../shared/appearance.ts';

/* ───────── 外观 ───────── */
export type HairStyle = 'buzz' | 'short' | 'bob' | 'long' | 'wavy' | 'ponytail' | 'twin' | 'bun' | 'twinbun' | 'braid';
export type Fringe = 'none' | 'blunt' | 'side' | 'part' | 'airy';
export type TopKind = 'tee' | 'hoodie' | 'sweater' | 'shirt' | 'jacket' | 'cardigan' | 'labcoat' | 'jersey';
export type BottomKind = 'jeans' | 'wide' | 'sport' | 'shorts' | 'skirt' | 'longskirt';
export type ShoeKind = 'sneaker' | 'boots' | 'canvas' | 'loafer';
export type Glasses = 'round' | 'square' | 'sun' | 'aviator';
export type HatKind = 'cap' | 'beanie' | 'bucket' | 'beret';
export interface Look {
  skin: number; hair: HairStyle; fringe: Fringe; hairColor: string; tipColor?: string;
  top: TopKind; topColor: string; top2?: string;
  bottom: BottomKind; bottomColor: string;
  shoes: ShoeKind; shoeColor?: string; sock?: boolean;
  hat?: HatKind; hatColor?: string;
  glasses?: Glasses; eyeColor?: string; headphones?: boolean; scarf?: string; bag?: boolean; lanyard?: boolean; mask?: boolean; blush?: boolean; freckles?: boolean;
}

export { SKIN_COLORS, HAIR_COLORS, DYE_COLORS, EYE_COLORS };

/** 由基色派生 [暗, 次暗, 基, 亮]：暗部偏紫蓝，亮部偏暖黄（与 characters.ts 同一公式） */
export function tones(c: string): RGBA[] {
  const b = hex(c);
  const mix = (a: RGBA, t: RGBA, k: number): RGBA => [a[0] + (t[0] - a[0]) * k, a[1] + (t[1] - a[1]) * k, a[2] + (t[2] - a[2]) * k, 255].map(Math.round) as RGBA;
  const sc = (a: RGBA, f: number): RGBA => [a[0] * f, a[1] * f, a[2] * f, 255].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGBA;
  return [mix(sc(b, 0.58), [60, 40, 110, 255], 0.2), mix(sc(b, 0.8), [60, 40, 110, 255], 0.08), b, mix(sc(b, 1.16), [255, 240, 170, 255], 0.16)];
}
const skinTones = (i: number) => { const t = tones(SKIN_COLORS[i]); return { hi: t[3], base: t[2], sh: t[1], dk: t[0], blush: [Math.min(255, t[2][0] + 8), Math.max(0, t[2][1] - 38), Math.max(0, t[2][2] - 28), 255] as RGBA }; };
type Skin = ReturnType<typeof skinTones>;
const WHITE = hex('#fbf8f0'), EYE = hex('#2a1e2e'), MOUTH = hex('#b0584c'), MOUTH_IN = hex('#6a2a34'), TONGUE = hex('#e0707a');

/* ───────── 姿势（Rig） ───────── */
export type Eyes = 'open' | 'blink' | 'happy' | 'sad';
export type Mouth = 'neutral' | 'smile' | 'open' | 'frown';
export type ArmShape = 'down' | 'cheer' | 'wave' | 'chin' | 'hips' | 'hold';
export interface ArmSpec { shape: ArmShape; off?: number; alt?: boolean }
export interface SideRig { nx: number; nl: number; fx: number; fl: number; arm: 'swing' | 'bent' | 'up' | 'reach'; ax: number; lean: number }
export interface Pose {
  /** 上半身下沉（+）/抬起（−）；air = 整个人离地 */
  dy: number; air?: number; bx?: number;
  hx?: number; hy?: number; eyes?: Eyes; mouth?: Mouth;
  aL: ArmSpec; aR: ArmSpec; lift: [number, number];
  /** 右向侧视图的腿/臂 */
  s?: SideRig;
}
const D: ArmSpec = { shape: 'down' };
const sw = (o: number): ArmSpec => ({ shape: 'down', off: o });

export type View = 'down' | 'up' | 'right';
export interface Anim { id: string; fps: number; loop: boolean; views: View[]; frames: Pose[] }

const stand = (extra: Partial<Pose> = {}): Pose => ({ dy: 0, aL: D, aR: D, lift: [0, 0], s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'swing', ax: 0, lean: 0 }, ...extra });

/** 走：6 帧（接触 / 抬腿 / 经过 …），手臂与腿反向摆动，头 1px 起伏 */
const WALK_NX = [2, 1, 0, -2, -1, 0], WALK_NL = [0, 0, 0, 0, 1, 2], WALK_FL = [0, 1, 2, 0, 0, 0];
const WALK_ARM = [1, 0, -1, -1, 0, 1], WALK_DY = [0, -1, -1, 0, -1, -1];
const WALK: Pose[] = [0, 1, 2, 3, 4, 5].map((i) => ({
  dy: WALK_DY[i], aL: sw(WALK_ARM[i]), aR: sw(-WALK_ARM[i]),
  lift: [i === 4 ? 1 : i === 5 ? 2 : 0, i === 1 ? 1 : i === 2 ? 2 : 0] as [number, number],
  s: { nx: WALK_NX[i], nl: WALK_NL[i], fx: -WALK_NX[i], fl: WALK_FL[i], arm: 'swing', ax: -Math.round(WALK_NX[i] / 1), lean: 0 },
}));
/** 跑：6 帧，步幅更大、有腾空帧、手臂屈肘、身体前倾 */
const RUN_NX = [3, 1, -2, -3, -1, 2], RUN_NL = [0, 0, 1, 2, 3, 2], RUN_FL = [2, 3, 2, 0, 0, 1], RUN_DY = [0, -1, -2, 0, -1, -2];
const RUN: Pose[] = [0, 1, 2, 3, 4, 5].map((i) => ({
  dy: RUN_DY[i], air: i === 2 || i === 5 ? 1 : 0, aL: { shape: 'down', off: i < 3 ? 2 : -2 }, aR: { shape: 'down', off: i < 3 ? -2 : 2 },
  lift: [RUN_NL[i], RUN_FL[i]] as [number, number],
  s: { nx: RUN_NX[i], nl: RUN_NL[i], fx: -RUN_NX[i], fl: RUN_FL[i], arm: 'bent', ax: i < 3 ? -2 : 2, lean: 1 },
}));

export const ANIMS: Anim[] = [
  { id: 'idle', fps: 2, loop: true, views: ['down', 'up', 'right'], frames: [stand(), stand({ dy: 1 }), stand({ eyes: 'blink' })] },
  { id: 'walk', fps: 11, loop: true, views: ['down', 'up', 'right'], frames: WALK },
  { id: 'run', fps: 16, loop: true, views: ['down', 'up', 'right'], frames: RUN },
  { id: 'wave', fps: 5, loop: true, views: ['down'], frames: [
    stand({ eyes: 'happy', mouth: 'smile', aR: { shape: 'wave' } }), stand({ eyes: 'happy', mouth: 'smile', aR: { shape: 'wave', alt: true }, hx: 0 }),
    stand({ eyes: 'happy', mouth: 'smile', aR: { shape: 'wave' } }), stand({ eyes: 'happy', mouth: 'smile', aR: { shape: 'wave', alt: true } })] },
  { id: 'cheer', fps: 5, loop: false, views: ['down'], frames: [
    stand({ dy: 2, aL: sw(1), aR: sw(1), lift: [0, 0] }), stand({ dy: -1, air: 2, eyes: 'happy', mouth: 'open', aL: { shape: 'cheer' }, aR: { shape: 'cheer' }, lift: [1, 1] }),
    stand({ dy: 1, eyes: 'happy', mouth: 'open', aL: { shape: 'cheer' }, aR: { shape: 'cheer' } })] },
  { id: 'dance', fps: 6, loop: true, views: ['down'], frames: [
    stand({ bx: -1, hx: -1, eyes: 'happy', mouth: 'smile', aL: { shape: 'cheer' }, aR: D, lift: [0, 1] }), stand({ dy: -1, eyes: 'happy', mouth: 'smile', aL: sw(-1), aR: sw(1), lift: [0, 0] }),
    stand({ bx: 1, hx: 1, eyes: 'happy', mouth: 'smile', aL: D, aR: { shape: 'cheer' }, lift: [1, 0] }), stand({ dy: -1, eyes: 'happy', mouth: 'smile', aL: sw(1), aR: sw(-1), lift: [0, 0] })] },
  { id: 'think', fps: 2, loop: true, views: ['down'], frames: [stand({ hx: 1, aR: { shape: 'chin' } }), stand({ hx: 1, eyes: 'blink', aR: { shape: 'chin' } })] },
  { id: 'laugh', fps: 6, loop: true, views: ['down'], frames: [stand({ dy: 0, eyes: 'happy', mouth: 'open', aL: sw(-1), aR: sw(-1) }), stand({ dy: -1, eyes: 'happy', mouth: 'open', aL: sw(0), aR: sw(0) })] },
  { id: 'sad', fps: 1.5, loop: true, views: ['down'], frames: [stand({ dy: 1, hy: 1, eyes: 'sad', mouth: 'frown', aL: sw(1), aR: sw(1) }), stand({ dy: 1, hy: 1, eyes: 'blink', mouth: 'frown', aL: sw(1), aR: sw(1) })] },
  /** 蹲下伸手（摸猫、喂猫）：身体下沉，手臂向前下方伸出 */
  { id: 'crouch', fps: 2.5, loop: true, views: ['down', 'up', 'right'], frames: [
    stand({ dy: 5, hy: 1, eyes: 'happy', mouth: 'smile', aL: sw(3), aR: sw(3), s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'reach', ax: 1, lean: 1 } }),
    stand({ dy: 5, hy: 1, eyes: 'open', mouth: 'smile', aL: sw(3), aR: sw(2), s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'reach', ax: 1, lean: 1 } })] },
  /** 钓鱼：双手在胸前握竿（竿线和浮漂仍由场景画）；咬钩时身体后仰、竿一抖一抖 */
  { id: 'fish', fps: 1.5, loop: true, views: ['down', 'up', 'right'], frames: [
    stand({ aL: { shape: 'hold' }, aR: { shape: 'hold' }, s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'bent', ax: 2, lean: 0 } }),
    stand({ dy: 0, aL: { shape: 'hold', alt: true }, aR: { shape: 'hold', alt: true }, s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'bent', ax: 2, lean: 0 } })] },
  { id: 'fish_bite', fps: 10, loop: true, views: ['down', 'up', 'right'], frames: [
    stand({ dy: -1, hx: -1, mouth: 'open', aL: { shape: 'hold' }, aR: { shape: 'hold' }, s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'bent', ax: 2, lean: -1 } }),
    stand({ dy: 0, hx: 0, mouth: 'open', aL: { shape: 'hold', alt: true }, aR: { shape: 'hold', alt: true }, s: { nx: 0, nl: 0, fx: 0, fl: 0, arm: 'bent', ax: 2, lean: 0 } })] },
  { id: 'sit', fps: 2, loop: true, views: ['down'], frames: [stand({ dy: 3, aL: sw(-1), aR: sw(-1) }), stand({ dy: 3, eyes: 'blink', lift: [0, 1], aL: sw(-1), aR: sw(-1) })] },
];

/* ───────── 绘图小工具 ───────── */
/**
 * 画布 / 焦点：身体仍按 16×32 的比例画（原点在 ox,oy），画布四周留白用来放宽发型、举手、背包、帽檐；
 * 想再放大或挪动人物，只改这里（预览与图集 meta 都从它派生）。脚点 = (ox+8+1, 画布高-3)。
 */
export const CANVAS = { w: 24, h: 42, ox: 4, oy: 8 };
/**
 * 画笔：坐标以"1× 原像素"为单位（身体按 16×32 设计），k=2 时每个原像素画成 2×2，圆形用高分辨率椭圆（更圆润）；
 * hr/hs 是**原生高清像素**（单位 = 1 个高清像素），脸、眼睛、眼镜这类细节用它画。
 */
class Pen {
  constructor(readonly img: Img, public ox = 0, public oy = 0, readonly k = 1) {}
  at(ox: number, oy: number) { return new Pen(this.img, this.ox + ox, this.oy + oy, this.k); }
  set(x: number, y: number, c: RGBA) { this.rect(x, y, 1, 1, c); }
  rect(x: number, y: number, w: number, h: number, c: RGBA) { const k = this.k; this.img.rect((x + this.ox) * k, (y + this.oy) * k, w * k, h * k, c); }
  hline(x: number, y: number, w: number, c: RGBA) { this.rect(x, y, w, 1, c); }
  vline(x: number, y: number, h: number, c: RGBA) { this.rect(x, y, 1, h, c); }
  ell(cx: number, cy: number, rx: number, ry: number, c: RGBA) { const k = this.k; this.img.ellipse((cx + this.ox) * k, (cy + this.oy) * k, rx * k, ry * k, c); }
  hr(x: number, y: number, w: number, h: number, c: RGBA) { this.img.rect(this.ox * this.k + x, this.oy * this.k + y, w, h, c); }
  hs(x: number, y: number, c: RGBA) { this.hr(x, y, 1, 1, c); }
}
const TY = 16, HY = 1; // 躯干起点、头顶（头比旧版高 1 格，下巴与领口之间露出脖子）

/* ───────── 头发 ───────── */
interface HairDef { side: number; back: number; tail?: 'high' | 'twin' | 'braid'; bun?: 'top' | 'twin'; buzz?: boolean; wave?: boolean }
const HAIRS: Record<HairStyle, HairDef> = {
  buzz: { side: 0, back: 0, buzz: true }, short: { side: 4, back: 0 }, bob: { side: 8, back: 7 }, long: { side: 12, back: 11 }, wavy: { side: 12, back: 11, wave: true },
  ponytail: { side: 4, back: 0, tail: 'high' }, twin: { side: 4, back: 0, tail: 'twin' }, bun: { side: 4, back: 0, bun: 'top' }, twinbun: { side: 4, back: 0, bun: 'twin' }, braid: { side: 4, back: 0, tail: 'braid' },
};
/** 发尾渐变：下方 30% 换成发尾色 */
function hairTones(look: Look) { return { H: tones(look.hairColor), T: tones(look.tipColor ?? look.hairColor) }; }

function hairBackFront(p: Pen, look: Look, def: HairDef, k: ReturnType<typeof hairTones>, sway: number) {
  const { H, T } = k, hy = HY;
  if (def.buzz) return;
  p.ell(8, hy + 6, 6.3, 6.4, H[1]);
  if (def.back) {
    p.rect(2, hy + 6, 12, def.back, H[1]);
    const tip = def.back * 0.7;
    p.rect(2, hy + 6 + Math.round(tip), 12, def.back - Math.round(tip), T[1]);
    p.rect(2, hy + 4 + def.back, 12, 2, T[0]);
    if (def.wave) for (let x = 2; x < 14; x += 2) p.set(x + (sway & 1), hy + 6 + def.back, T[0]);
  }
  if (def.tail === 'twin') for (const [x, s] of [[-1, -1], [14, 1]] as const) { p.rect(x, hy + 6, 3, 9, H[2]); p.vline(s < 0 ? x : x + 2, hy + 7, 8, H[1]); p.rect(x, hy + 13, 3, 2, T[1]); p.rect(x, hy + 6, 3, 1, hex('#e8a0b0')); p.set(x + 1, hy + 15, T[0]); }
}
function hairFrontFront(p: Pen, look: Look, def: HairDef, k: ReturnType<typeof hairTones>) {
  const { H } = k, [d, m, b, l] = H, hy = HY;
  if (def.buzz) { p.ell(8, hy + 3, 5.5, 3.2, m); p.rect(5, hy + 1, 6, 1, b); p.set(6, hy + 1, l); p.set(7, hy + 1, l); p.vline(3, hy + 5, 3, m); p.vline(12, hy + 5, 3, m); p.hline(4, hy + 5, 8, m); return; }
  p.ell(8, hy + 3, 6.0, 3.6, b);
  p.rect(4, hy + 1, 8, 1, l); p.rect(5, hy, 5, 1, b); p.rect(5, hy + 1, 3, 1, l); p.rect(4, hy + 2, 2, 1, l);
  // 刘海
  const f = look.fringe;
  const cols: Record<Fringe, number[]> = { none: [0, 0, 0, 0, 0, 0, 0, 0], blunt: [3, 3, 3, 3, 3, 3, 3, 3], side: [3, 3, 2, 3, 2, 2, 3, 2], part: [3, 2, 1, 0, 0, 1, 2, 3], airy: [2, 0, 2, 1, 2, 0, 2, 1] };
  cols[f].forEach((len, i) => { if (len) { p.rect(4 + i, hy + 3, 1, len, i < 3 ? m : b); if (f !== 'airy') p.set(4 + i, hy + 2 + len, m); else p.set(4 + i, hy + 2 + len, d); } });
  if (f === 'part') { p.set(7, hy + 2, d); p.set(8, hy + 3, d); }
  if (f === 'none') p.hline(4, hy + 5, 8, m);
  // 鬓角 / 侧发
  p.rect(2, hy + 4, 2, 4, b); p.rect(12, hy + 4, 2, 4, b); p.vline(2, hy + 4, 4, m); p.vline(13, hy + 4, 4, d);
  if (def.side > 4) { p.rect(1, hy + 7, 2, def.side - 3, b); p.rect(13, hy + 7, 2, def.side - 3, b); p.vline(1, hy + 8, def.side - 4, m); p.vline(14, hy + 8, def.side - 4, d); for (let i = 0; i < def.side - 4; i += 3) { p.set(2, hy + 8 + i, l); p.set(13, hy + 9 + i, m); } }
  p.set(6, hy + 2, l); p.set(7, hy + 2, l); p.set(10, hy + 3, m);
  if (def.bun === 'top') { p.ell(8, hy - 1.5, 3, 2.6, b); p.set(7, hy - 3, l); p.set(8, hy - 3, l); p.set(7, hy - 2, l); p.hline(5, hy, 6, m); }
  if (def.bun === 'twin') for (const cx of [3.5, 12.5]) { p.ell(cx, hy, 2.5, 2.4, b); p.set(Math.round(cx) - 1, hy - 1, l); p.set(Math.round(cx), hy - 1, l); p.vline(Math.round(cx) + (cx < 8 ? 1 : -1), hy + 1, 1, m); }
  if (def.tail === 'braid') { // 麻花辫搭在右肩前
    for (let i = 0; i < 9; i++) { p.rect(11, hy + 9 + i, 3, 1, i % 2 ? m : b); p.set(11 + (i % 2), hy + 9 + i, d); }
    p.rect(11, hy + 18, 3, 1, hex('#e8a0b0')); p.rect(12, hy + 19, 2, 1, d);
  }
  if (def.tail === 'high') { p.hline(6, hy + 2, 4, hex('#e8a0b0')); }
}
function hairBackView(p: Pen, look: Look, def: HairDef, k: ReturnType<typeof hairTones>, sway: number) {
  const { H, T } = k, [d, m, b, l] = H, hy = HY;
  p.ell(8, hy + 8, 5.4, 5.8, def.buzz ? m : b);
  p.rect(3, hy + 8, 1, 3, SKIN_EAR_BACK);
  if (def.buzz) { p.rect(4, hy + 5, 8, 6, m); p.rect(5, hy + 1, 6, 1, b); return; }
  p.ell(8, hy + 3.3, 6.0, 3.9, b); p.rect(5, hy, 5, 1, b); p.rect(4, hy + 1, 8, 1, l);
  p.rect(4, hy + 5, 8, 6, b); p.rect(4, hy + 10, 8, 1, m); p.rect(2, hy + 4, 2, 4, b); p.rect(12, hy + 4, 2, 4, b);
  p.vline(8, hy + 3, 7, m); p.rect(5, hy + 3, 2, 3, l);
  if (def.back) {
    p.rect(2, hy + 6, 12, def.back + 1, b); p.vline(2, hy + 7, def.back, m); p.vline(13, hy + 7, def.back, d);
    const tip = Math.round(def.back * 0.7);
    p.rect(2, hy + 7 + tip, 12, def.back - tip, T[2]); p.rect(2, hy + 6 + def.back, 12, 2, T[1]);
    if (def.wave) for (let x = 2; x < 14; x += 2) p.set(x + (sway & 1), hy + 8 + def.back, T[1]);
    const ex = [0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 0, 1];
    for (let x = 2; x < 14; x++) p.vline(x, hy + 8 + def.back, ex[x - 2], x < 8 ? T[1] : T[0]);
    for (const x of [4, 6, 9, 11]) p.vline(x, hy + 9, Math.max(1, def.back - 2), x < 8 ? l : m);
  }
  if (def.bun === 'top') { p.ell(8, hy - 1.5, 3, 2.6, b); p.set(7, hy - 3, l); p.set(8, hy - 3, l); }
  if (def.bun === 'twin') for (const cx of [3.5, 12.5]) { p.ell(cx, hy, 2.5, 2.4, b); p.set(Math.round(cx) - 1, hy - 1, l); }
  if (def.tail === 'high') { p.hline(6, hy + 3, 4, hex('#e8a0b0')); p.rect(7, hy + 4, 2, 13, T[2]); p.vline(8, hy + 5, 11, T[1]); p.rect(7, hy + 15 + (sway & 1), 2, 2, T[0]); }
  if (def.tail === 'twin') for (const x of [-1, 14]) { p.rect(x, hy + 6, 3, 10, b); p.vline(x < 8 ? x : x + 2, hy + 7, 9, d); p.rect(x, hy + 13, 3, 3, T[1]); p.rect(x, hy + 6, 3, 1, hex('#e8a0b0')); }
  if (def.tail === 'braid') { for (let i = 0; i < 12; i++) { p.rect(7, hy + 9 + i, 3, 1, i % 2 ? m : b); p.set(7 + (i % 2), hy + 9 + i, d); } p.rect(7, hy + 21, 3, 1, hex('#e8a0b0')); }
}
const SKINS_DUMMY: RGBA = [0, 0, 0, 0];
const SKIN_EAR_BACK: RGBA = [0, 0, 0, 0];
function hairSide(p: Pen, look: Look, def: HairDef, k: ReturnType<typeof hairTones>, sway: number) {
  const { H, T } = k, [d, m, b, l] = H, hy = HY;
  if (def.buzz) { p.ell(8, hy + 3.2, 5.8, 3.4, m); p.rect(5, hy + 1, 5, 1, b); p.rect(3, hy + 5, 4, 4, m); return; }
  p.ell(8, hy + 3.2, 6.1, 3.7, b);
  p.rect(5, hy, 5, 1, b); p.rect(6, hy + 1, 3, 1, l); p.rect(5, hy + 2, 2, 1, l);
  p.rect(3, hy + 4, 5, 5, b); p.vline(3, hy + 5, 4, d); p.rect(4, hy + 5, 2, 3, m); p.hline(3, hy + 9, 5, m);
  const fr = { none: 1, blunt: 3, side: 3, part: 2, airy: 2 }[look.fringe];
  p.rect(8, hy + 3, 4, fr, b); if (fr > 1) p.hline(8, hy + 2 + fr, 4, m); if (look.fringe === 'airy') p.set(10, hy + 4, SKINS_DUMMY);
  if (def.back) {
    p.rect(2, hy + 8, 6, def.back + 2, b); p.rect(3, hy + 9, 2, def.back - 1, m);
    const tip = Math.round(def.back * 0.7);
    p.rect(2, hy + 9 + tip, 6, def.back - tip + 1, T[2]); p.rect(2, hy + 9 + def.back, 6, 1, T[0]);
    if (def.wave) for (let x = 2; x < 8; x += 2) p.set(x + (sway & 1), hy + 10 + def.back, T[1]);
  }
  if (def.bun === 'top') { p.ell(6, hy - 1.5, 3, 2.6, b); p.set(5, hy - 3, l); p.set(6, hy - 3, l); }
  if (def.bun === 'twin') { p.ell(6, hy, 2.6, 2.4, b); p.set(5, hy - 1, l); }
  if (def.tail === 'high') { p.hline(3, hy + 3, 3, hex('#e8a0b0')); p.rect(1, hy + 3, 3, 12, T[2]); p.vline(2, hy + 4, 10, T[1]); p.rect(1, hy + 13 + (sway & 1), 3, 2, T[0]); }
  if (def.tail === 'twin') { p.rect(1, hy + 5, 3, 10, b); p.vline(2, hy + 6, 9, m); p.rect(1, hy + 12, 3, 3, T[1]); p.rect(1, hy + 5, 3, 1, hex('#e8a0b0')); }
  if (def.tail === 'braid') { for (let i = 0; i < 10; i++) { p.rect(3, hy + 9 + i, 3, 1, i % 2 ? m : b); p.set(3 + (i % 2), hy + 9 + i, d); } p.rect(3, hy + 19, 3, 1, hex('#e8a0b0')); }
}

/* ───────── 帽子 ───────── */
function hatFront(p: Pen, look: Look, back: boolean) {
  if (!look.hat) return;
  const c = tones(look.hatColor ?? '#3a5fa0'), hy = HY;
  switch (look.hat) {
    case 'cap': p.ell(8, hy + 4, 6.2, 4.4, c[2]); p.rect(2, hy + 4, 12, 2, c[1]); p.rect(4, hy + 1, 5, 1, c[3]); p.rect(3, hy + 6, 10, 1, c[0]); if (!back) { p.rect(3, hy + 4, 3, 1, c[3]); p.rect(4, hy + 6, 8, 2, c[1]); p.hline(4, hy + 8, 8, c[0]); } break;
    case 'beanie': p.ell(8, hy + 3.2, 6.5, 4.4, c[2]); p.rect(2, hy + 4, 12, 3, c[1]); for (let x = 2; x < 14; x += 2) p.vline(x, hy + 4, 3, c[0]); p.rect(2, hy + 4, 12, 1, c[3]); p.ell(8, hy - 1, 1.8, 1.6, c[3]); p.set(8, hy - 1, WHITE); break;
    case 'bucket': p.ell(8, hy + 3, 5.6, 4, c[2]); p.rect(1, hy + 5, 14, 2, c[1]); p.hline(2, hy + 7, 12, c[0]); p.rect(3, hy + 1, 4, 1, c[3]); p.hline(3, hy + 5, 10, c[3]); break;
    case 'beret': p.ell(9, hy + 2.2, 7, 3.4, c[2]); p.rect(3, hy + 4, 11, 1, c[1]); p.set(9, hy - 2, c[0]); p.rect(5, hy, 5, 1, c[3]); p.rect(4, hy + 1, 3, 1, c[3]); break;
  }
}
function hatSide(p: Pen, look: Look) {
  if (!look.hat) return;
  const c = tones(look.hatColor ?? '#3a5fa0'), hy = HY;
  switch (look.hat) {
    case 'cap': p.ell(8, hy + 4, 6.2, 4.4, c[2]); p.rect(3, hy + 4, 9, 2, c[1]); p.rect(10, hy + 5, 5, 1, c[1]); p.rect(11, hy + 4, 4, 1, c[3]); p.rect(5, hy + 1, 4, 1, c[3]); break;
    case 'beanie': p.ell(8, hy + 3.2, 6.4, 4.4, c[2]); p.rect(3, hy + 4, 10, 3, c[1]); for (let x = 3; x < 13; x += 2) p.vline(x, hy + 4, 3, c[0]); p.ell(8, hy - 1, 1.8, 1.6, c[3]); break;
    case 'bucket': p.ell(8, hy + 3, 5.4, 4, c[2]); p.rect(2, hy + 5, 13, 2, c[1]); p.hline(3, hy + 7, 11, c[0]); p.rect(4, hy + 1, 4, 1, c[3]); break;
    case 'beret': p.ell(9, hy + 2.2, 6.6, 3.4, c[2]); p.rect(4, hy + 4, 10, 1, c[1]); p.set(9, hy - 2, c[0]); p.rect(5, hy, 5, 1, c[3]); break;
  }
}

/* ───────── 脸 ───────── */
function faceFront(p: Pen, S: Skin, look: Look, eyes: Eyes, mouth: Mouth) {
  const hy = HY;
  p.ell(8, hy + 8, 5, 5.4, S.base);
  p.rect(5, hy + 12, 6, 1, S.sh);
  p.rect(3, hy + 8, 1, 3, S.base); p.rect(12, hy + 8, 1, 3, S.base); if (p.k >= 2) { p.hr(7, (hy + 9) * 2, 1, 2, S.sh); p.hr(24, (hy + 9) * 2, 1, 2, S.sh); } else { p.set(3, hy + 9, S.sh); p.set(12, hy + 9, S.sh); }
}
function eyesFront(p: Pen, S: Skin, look: Look, eyes: Eyes, mouth: Mouth) {
  if (p.k >= 2) { faceHD(p, S, look, eyes, mouth); return; }
  const hy = HY, dark: RGBA = [90, 60, 80, 255];
  if (eyes === 'open' || eyes === 'sad') { for (const x of [5, 9]) { p.rect(x, hy + 8, 2, 3, EYE); p.set(x, hy + 8, WHITE); p.set(x + 1, hy + 10, dark); } }
  else if (eyes === 'blink') { p.hline(5, hy + 10, 2, EYE); p.hline(9, hy + 10, 2, EYE); }
  else { for (const x of [5, 9]) { p.hline(x, hy + 9, 2, EYE); p.set(x - 1, hy + 10, EYE); p.set(x + 2, hy + 10, EYE); } }
  if (eyes === 'sad') { p.set(5, hy + 7, EYE); p.set(6, hy + 6, EYE); p.set(10, hy + 6, EYE); p.set(11, hy + 7, EYE); }
  if (look.fringe === 'none' || look.fringe === 'part' || look.fringe === 'airy') { const bc = tones(look.hairColor)[1]; p.hline(5, hy + 6, 2, bc); p.hline(9, hy + 6, 2, bc); if (eyes === 'sad') { p.set(5, hy + 6, SKINS_DUMMY); p.set(5, hy + 7, bc); p.set(10, hy + 6, SKINS_DUMMY); p.set(10, hy + 7, bc); } }
  if (look.blush !== false) { p.rect(4, hy + 11, 2, 1, S.blush); p.rect(10, hy + 11, 2, 1, S.blush); }
  if (look.freckles) { for (const [x, y] of [[4, 10], [6, 11], [10, 11], [11, 10]]) p.set(x, hy + y, S.sh); }
  if (mouth === 'neutral') p.rect(7, hy + 11, 2, 1, MOUTH);
  else if (mouth === 'smile') { p.set(6, hy + 11, MOUTH); p.hline(7, hy + 12, 2, MOUTH); p.set(9, hy + 11, MOUTH); }
  else if (mouth === 'open') { p.rect(7, hy + 11, 2, 2, MOUTH_IN); p.set(7, hy + 12, TONGUE); p.set(8, hy + 12, TONGUE); }
  else { p.set(6, hy + 12, MOUTH); p.hline(7, hy + 11, 2, MOUTH); p.set(9, hy + 12, MOUTH); }
  if (look.mask) { const mk = tones('#e8f0f4'); p.rect(4, hy + 10, 8, 4, mk[2]); p.hline(4, hy + 10, 8, mk[3]); p.hline(4, hy + 13, 8, mk[1]); p.vline(3, hy + 9, 3, mk[1]); p.vline(12, hy + 9, 3, mk[1]); }
  if (look.glasses) glassesFront(p, look.glasses);
}

/* ───────── 眼镜 ───────── */
const MIX = (a: RGBA, b: RGBA, t: number): RGBA => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255].map(Math.round) as RGBA;
function glassesFront(p: Pen, kind: Glasses) {
  if (p.k >= 2) { glassesHD(p, kind, false); return; }
  const hy = HY;
  if (kind === 'sun') { // 墨镜：深色渐变镜片（上深下浅）+ 斜向高光 + 镜腿 + 鼻梁；镜片下缘收圆，露出一点脸颊
    const F = hex('#22222e'), L = [hex('#151a2b'), hex('#222b47'), hex('#34436c')], GL = hex('#9fb0e4'), GL2 = hex('#5e72b0');
    p.hline(4, hy + 7, 8, F);
    for (const x0 of [4, 8]) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { if (r === 2 && (c === 0 || c === 3)) continue; p.set(x0 + c, hy + 8 + r, L[r]); }
      p.set(x0 + 1, hy + 8, GL2); p.set(x0 + 2, hy + 9, GL); p.set(x0 + 1, hy + 9, GL2);
    }
    p.vline(4, hy + 8, 2, F); p.vline(11, hy + 8, 2, F); p.hline(7, hy + 8, 2, F); p.hline(5, hy + 11, 2, F); p.hline(9, hy + 11, 2, F);
    p.set(3, hy + 8, F); p.set(12, hy + 8, F); p.set(3, hy + 9, F); p.set(12, hy + 9, F);
  } else if (kind === 'aviator') { // 飞行员：金属框 + 泪滴镜片（灰绿渐变）+ 双鼻梁
    const F = hex('#d8b050'), Fd = hex('#9a7a30'), L = [hex('#4a5a54'), hex('#6a7c72'), hex('#8aa096')];
    for (const x0 of [4, 8]) {
      p.hline(x0, hy + 7, 4, F); p.vline(x0, hy + 8, 3, F); p.vline(x0 + 3, hy + 8, 3, F); p.hline(x0 + 1, hy + 11, 2, Fd);
      for (let r = 0; r < 3; r++) p.hline(x0 + 1, hy + 8 + r, 2, L[r]);
      p.set(x0 + 1, hy + 8, hex('#d8e6dc'));
    }
    p.hline(7, hy + 7, 2, F); p.hline(7, hy + 8, 2, Fd); p.set(3, hy + 8, Fd); p.set(12, hy + 8, Fd);
  } else if (kind === 'square') { // 粗框方镜：黑框 + 淡蓝镜片 + 高光
    const F = hex('#2a2a34'), T: RGBA = [180, 215, 245, 80];
    p.hline(4, hy + 7, 8, F); p.hline(4, hy + 11, 3, F); p.hline(9, hy + 11, 3, F); p.vline(4, hy + 8, 3, F); p.vline(11, hy + 8, 3, F); p.vline(7, hy + 8, 3, F); p.vline(8, hy + 8, 3, F);
    p.rect(5, hy + 8, 2, 3, T); p.rect(9, hy + 8, 2, 3, T); p.set(5, hy + 8, [255, 255, 255, 150]); p.set(9, hy + 8, [255, 255, 255, 150]);
    p.set(3, hy + 8, F); p.set(12, hy + 8, F);
  } else { // 圆框细丝眼镜：灰蓝细框 + 近乎透明的镜片，中间只留鼻梁
    const F = hex('#5a6088'), T: RGBA = [190, 225, 250, 60];
    for (const x0 of [4, 8]) { p.hline(x0 + 1, hy + 7, 2, F); p.vline(x0, hy + 8, 3, F); p.vline(x0 + 3, hy + 8, 3, F); p.hline(x0 + 1, hy + 11, 2, F); p.rect(x0 + 1, hy + 8, 2, 3, T); p.set(x0 + 1, hy + 8, [255, 255, 255, 140]); }
    p.set(7, hy + 8, F); p.set(8, hy + 8, F); p.set(3, hy + 8, F); p.set(12, hy + 8, F);
  }
}
function glassesSide(p: Pen, kind: Glasses) {
  if (p.k >= 2) { glassesHD(p, kind, true); return; }
  const hy = HY;
  if (kind === 'sun') {
    const F = hex('#22222e'), L = [hex('#151a2b'), hex('#222b47'), hex('#34436c')];
    p.hline(3, hy + 8, 7, F); p.hline(9, hy + 7, 4, F);
    for (let r = 0; r < 3; r++) p.hline(9, hy + 8 + r, 4, L[r]);
    p.set(12, hy + 8, F); p.set(12, hy + 9, F); p.hline(9, hy + 11, 3, F);
    p.set(10, hy + 8, hex('#5e72b0')); p.set(11, hy + 9, hex('#9fb0e4'));
  } else if (kind === 'aviator') {
    const F = hex('#d8b050'), L = [hex('#4a5a54'), hex('#6a7c72'), hex('#8aa096')];
    p.hline(3, hy + 8, 6, hex('#9a7a30')); p.hline(9, hy + 7, 4, F); p.vline(9, hy + 8, 3, F); p.vline(12, hy + 8, 3, F); p.hline(10, hy + 11, 2, F);
    for (let r = 0; r < 3; r++) p.hline(10, hy + 8 + r, 2, L[r]);
    p.set(10, hy + 8, hex('#d8e6dc'));
  } else if (kind === 'square') {
    const F = hex('#2a2a34');
    p.hline(3, hy + 8, 6, F); p.hline(9, hy + 7, 4, F); p.hline(9, hy + 11, 4, F); p.vline(9, hy + 8, 3, F); p.vline(12, hy + 8, 3, F); p.rect(10, hy + 8, 2, 3, [180, 215, 245, 80]);
  } else {
    const F = hex('#8a92c0');
    p.hline(3, hy + 8, 6, F); p.hline(10, hy + 7, 2, F); p.vline(9, hy + 8, 3, F); p.vline(12, hy + 8, 3, F); p.hline(10, hy + 11, 2, F); p.rect(10, hy + 8, 2, 3, [190, 225, 250, 60]);
  }
}

/* ───────── 高清脸（k=2）：眼睛 / 眉 / 嘴 / 眼镜用原生高清像素画 ───────── */
type Pal = Record<string, RGBA>;
const pat = (p: Pen, x: number, y: number, rows: string[], pal: Pal, mirror = false) => rows.forEach((row, j) => [...(mirror ? [...row].reverse().join('') : row)].forEach((ch, i) => { if (ch !== '.' && pal[ch]) p.hs(x + i, y + j, pal[ch]); }));
/** 眼睛 5×6：D 睫毛线，i 虹膜深，I 虹膜，l 虹膜亮，W 高光；列 0 = 外眼角 */
const EYE_OPEN = ['DDDD.', 'DiiiI', 'iWWiI', 'iWIII', 'IIIIl', '.lll.'];
const EYE_BLINK = ['.....', '.....', '.....', 'DDDDD', 'D....', '.....'];
const EYE_HAPPY = ['.....', '.....', '.DDD.', 'D...D', '.....', '.....'];
const EYE_SAD = ['.DDDD', 'DiiiI', 'iWWiI', 'iWIII', 'IIIIl', '.lll.'];
function faceHD(p: Pen, S: Skin, look: Look, eyes: Eyes, mouth: Mouth) {
  const ey = (HY + 8) * 2, it = tones(look.eyeColor ?? '#5a3a2a');
  const pal: Pal = { D: EYE, i: it[0], I: it[2], l: it[3], W: [255, 255, 255, 255] };
  const rows = eyes === 'blink' ? EYE_BLINK : eyes === 'happy' ? EYE_HAPPY : eyes === 'sad' ? EYE_SAD : EYE_OPEN;
  pat(p, 9, ey, rows, pal); pat(p, 18, ey, rows, pal, true);
  if (look.fringe === 'none' || look.fringe === 'part' || look.fringe === 'airy') { // 眉毛（刘海没盖住额头时）
    const bc = tones(look.hairColor)[1], by = (HY + 6) * 2;
    if (eyes === 'sad') { p.hr(9, by + 2, 1, 1, bc); p.hr(10, by + 1, 2, 1, bc); p.hr(12, by, 1, 1, bc); p.hr(19, by, 1, 1, bc); p.hr(20, by + 1, 2, 1, bc); p.hr(22, by + 2, 1, 1, bc); }
    else { p.hr(9, by + 1, 1, 1, bc); p.hr(10, by, 3, 1, bc); p.hr(19, by, 3, 1, bc); p.hr(22, by + 1, 1, 1, bc); }
  }
  if (look.blush !== false) { const bl: RGBA = [S.blush[0], S.blush[1], S.blush[2], 150]; p.hr(8, ey + 7, 4, 2, bl); p.hr(20, ey + 7, 4, 2, bl); }
  if (look.freckles) for (const [x, y] of [[9, 24], [11, 25], [13, 24], [18, 24], [20, 25], [22, 24]]) p.hs(x, y, S.sh);
  const my = ey + 8;
  if (mouth === 'neutral') p.hr(14, my, 4, 1, MOUTH);
  else if (mouth === 'smile') { p.hs(13, my - 1, MOUTH); p.hr(14, my, 4, 1, MOUTH); p.hs(18, my - 1, MOUTH); p.hr(15, my + 1, 2, 1, [MOUTH[0], MOUTH[1], MOUTH[2], 120]); }
  else if (mouth === 'open') { p.hr(14, my - 1, 4, 3, MOUTH_IN); p.hr(14, my - 1, 4, 1, WHITE); p.hr(15, my + 1, 2, 1, TONGUE); p.hr(13, my, 1, 1, MOUTH); p.hr(18, my, 1, 1, MOUTH); }
  else { p.hs(13, my + 1, MOUTH); p.hr(14, my, 4, 1, MOUTH); p.hs(18, my + 1, MOUTH); }
  if (look.mask) { const mk = tones('#e8f0f4'), y0 = ey + 4; p.hr(8, y0, 16, 9, mk[2]); p.hr(8, y0, 16, 1, mk[3]); p.hr(8, y0 + 8, 16, 1, mk[1]); p.hr(8, y0 + 4, 16, 1, mk[1]); p.hr(6, y0 - 2, 2, 5, mk[1]); p.hr(24, y0 - 2, 2, 5, mk[1]); }
  if (look.glasses) glassesFront(p, look.glasses);
}
function faceSideHD(p: Pen, S: Skin, look: Look, eyes: Eyes, mouth: Mouth) {
  const ey = (HY + 8) * 2, it = tones(look.eyeColor ?? '#5a3a2a');
  const pal: Pal = { D: EYE, i: it[0], I: it[2], l: it[3], W: [255, 255, 255, 255] };
  const rows = eyes === 'blink' ? ['...', '...', '...', 'DDD', '...', '...'] : eyes === 'happy' ? ['...', '...', '.DD', 'D..', '...', '...'] : ['.DD', 'iiD', 'WiI', 'WII', 'IIl', '.l.'];
  pat(p, 22, ey, rows, pal);
  if (look.blush !== false) p.hr(17, ey + 7, 4, 2, [S.blush[0], S.blush[1], S.blush[2], 150]);
  p.hr(24, ey + 8, 2, 1, mouth === 'open' ? MOUTH_IN : MOUTH);
  if (look.mask) { const mk = tones('#e8f0f4'); p.hr(16, ey + 4, 11, 9, mk[2]); p.hr(16, ey + 4, 11, 1, mk[3]); p.hr(14, ey + 2, 2, 5, mk[1]); }
  if (look.glasses) glassesSide(p, look.glasses);
}

/** 圆角矩形内部判定（上/下圆角半径分别为 rt/rb；以像素中心计） */
function inRR(x: number, y: number, x0: number, y0: number, w: number, h: number, rt: number, rb: number) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const lx = x - x0 + 0.5, ly = y - y0 + 0.5;
  const c = (cx: number, cy: number, r: number) => (lx - cx) ** 2 + (ly - cy) ** 2 <= r * r;
  if (ly < rt) { if (lx < rt) return c(rt, rt, rt); if (lx > w - rt) return c(w - rt, rt, rt); }
  if (ly > h - rb) { if (lx < rb) return c(rb, h - rb, rb); if (lx > w - rb) return c(w - rb, h - rb, rb); }
  return true;
}
/** 泪滴形（飞行员镜片）：下半部向内收 */
function inDrop(x: number, y: number, x0: number, y0: number, w: number, h: number) {
  const cx = x0 + w / 2, cy = y0 + h * 0.42, px = x + 0.5, py = y + 0.5;
  const f = py > cy ? 1 - 0.3 * Math.min(1, (py - cy) / (y0 + h - cy)) : 1;
  return ((px - cx) / ((w / 2) * f)) ** 2 + ((py - cy) / (h / 2)) ** 2 <= 1;
}
type Shape = (x: number, y: number, s: number) => boolean;
/** 画一个镜框 + 镜片：shape(x,y,s) 里 s = 向内收缩的像素数（s=0 外轮廓，s=1 内沿）；lens 返回镜片色（null 则不画）；frame 可按位置给色 */
function lens(p: Pen, x0: number, y0: number, w: number, h: number, shape: Shape, frame: (lx: number, ly: number) => RGBA, fill: (lx: number, ly: number, w: number, h: number) => RGBA | null, innerShrink = 1) {
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    if (!shape(x, y, 0)) continue;
    const inner = shape(x, y, innerShrink);
    if (!inner) p.hs(x, y, frame(x - x0, y - y0));
    else { const c = fill(x - x0, y - y0, w, h); if (c) p.hs(x, y, c); }
  }
}
function glassesHD(p: Pen, kind: Glasses, side: boolean) {
  const y0 = (HY + 7) * 2;                                     // 镜框顶（高清像素）
  const lensX = side ? [19] : [7, 17];                         // 每片镜片左缘（侧面只有一片）
  const W = kind === 'aviator' ? 8 : 7, H = kind === 'aviator' ? 10 : kind === 'round' ? 8 : 9;
  const mixc = MIX;
  for (let n = 0; n < lensX.length; n++) {
    const x0 = lensX[n] + (kind === 'sun' && !side ? 1 : 0) * (n === 0 ? 0 : 0);
    let shape: Shape, frame: (lx: number, ly: number) => RGBA, fill: (lx: number, ly: number, w: number, h: number) => RGBA | null, shr = 1;
    if (kind === 'sun') { // 墨镜：宽顶梁 + 下缘收圆 + 深色渐变镜片 + 斜高光 + 下缘反光
      const F = hex('#1b1b26'), Fh = hex('#3a3a4c'), top = hex('#10152a'), bot = hex('#33426e'), gl = hex('#b4c4f4'), gl2 = hex('#6a80c0');
      shape = (x, y, s) => inRR(x, y, x0 + s, y0 + (s ? 2 : 0), W - 2 * s, H - (s ? 3 : 0), 2 - Math.min(1, s), 4 - Math.min(2, s * 2));
      frame = (lx, ly) => (ly <= 1 ? (lx > 1 && lx < W - 2 && ly === 0 ? Fh : F) : F);
      fill = (lx, ly, w, h) => {
        const t = (ly - 1) / (h - 3);
        let c = mixc(top, bot, Math.max(0, Math.min(1, t)));
        const d = lx + ly;
        if ((d === 7 || d === 8) && ly >= 2 && ly <= 6) c = d === 7 ? gl : gl2;
        if (lx === 2 && ly === 3) c = gl2;
        if (ly === h - 3 && lx > 1 && lx < w - 2) c = mixc(c, gl2, 0.35);
        return c;
      };
      shr = 1;
    } else if (kind === 'aviator') { // 飞行员：金属细框 + 泪滴灰绿渐变镜片 + 高光
      const F = hex('#d8b050'), Fd = hex('#9a7a30'), top = hex('#3a4a44'), bot = hex('#92aa9c'), gl = hex('#e4efe8');
      shape = (x, y, s) => (s ? inDrop(x, y, x0 + 1, y0 + 1, W - 2, H - 2) : inDrop(x, y, x0, y0, W, H));
      frame = (lx, ly) => (ly < H / 2 ? F : Fd);
      fill = (lx, ly, w, h) => { let c = mixc(top, bot, ly / h); if ((lx + ly === 6 || lx + ly === 7) && ly >= 1 && ly <= 4) c = gl; return c; };
    } else if (kind === 'square') { // 粗框方镜：黑色粗框（上沿更粗）+ 淡蓝透明镜片 + 白色高光
      const F = hex('#25252f'), Fh = hex('#4a4a5a');
      shape = (x, y, s) => inRR(x, y, x0 + s, y0 + (s ? 2 : 0), W - 2 * s, H - (s ? 3 : 0), 1, 2 - Math.min(1, s));
      frame = (lx, ly) => (ly === 0 && lx > 0 && lx < W - 1 ? Fh : F);
      fill = (lx, ly) => ((lx + ly === 5 || lx + ly === 6) && ly >= 1 && ly <= 4 ? [255, 255, 255, 170] : [175, 215, 245, 55]);
    } else { // 圆框细丝：灰蓝细圆环 + 近乎透明的镜片 + 一撮高光
      const F = hex('#6a7298');
      shape = (x, y, s) => inRR(x, y, x0 + s, y0 + 1 + s, W - 2 * s, H - 2 * s, 3.5 - s, 3.5 - s);
      frame = () => F;
      fill = (lx, ly) => ((lx === 2 && ly === 2) || (lx === 3 && ly === 1) || (lx === 2 && ly === 3) ? [255, 255, 255, 190] : [190, 225, 250, 40]);
    }
    if (kind === 'round') { const sh2 = shape; shape = sh2; }
    lens(p, x0, y0, W, H, shape, frame, fill, shr);
  }
  // 鼻梁与镜腿
  const F = kind === 'aviator' ? hex('#d8b050') : kind === 'round' ? hex('#6a7298') : hex('#1b1b26');
  if (!side) {
    const bx = 15, by = kind === 'round' ? y0 + 3 : kind === 'sun' ? y0 + 1 : y0 + 1;
    p.hr(bx, by, 2, kind === 'sun' || kind === 'square' ? 2 : 1, F);
    if (kind === 'aviator') p.hr(bx, y0 + 4, 2, 1, hex('#9a7a30'));
    p.hr(5, y0 + 2, 3, 1, F); p.hr(24, y0 + 2, 3, 1, F);                    // 镜腿（压在耳朵上）
  } else {
    p.hr(7, y0 + 2, 12, 1, F);                                              // 侧面：镜腿一路伸到耳后
    if (kind === 'sun' || kind === 'square') p.hr(7, y0 + 3, 4, 1, F);
  }
}

/** 高清下给头发补发丝与高光（k≥2，仅正面）：让头发不再是一整块色面 */
function hairDetailHD(p: Pen, look: Look, def: HairDef) {
  if (def.buzz) return;
  const [d, m, b, l] = tones(look.hairColor), hy = HY;
  p.hr(11, 3, 6, 1, l); p.hr(10, 4, 3, 1, l); p.hr(18, 3, 2, 1, m);          // 头顶弧形高光
  for (const x of [9, 12, 15, 18, 21]) p.hr(x, 5, 1, 3, m);                   // 发丝
  for (const x of [13, 19]) p.hr(x, 6, 1, 2, l);
  if (def.side > 4) for (let y = (hy + 8) * 2; y < (hy + 8) * 2 + (def.side - 4) * 2 - 1; y += 4) { p.hr(3, y, 1, 2, l); p.hr(4, y + 2, 1, 2, m); p.hr(27, y + 1, 1, 2, m); p.hr(28, y + 3, 1, 1, d); }
}

/* ───────── 手臂 ───────── */
type Cell = [number, number];
function armCells(spec: ArmSpec): Cell[] {
  const off = spec.off ?? 0;
  switch (spec.shape) {
    case 'cheer': return [[0, 0], [0, -1], [-1, -2], [-1, -3], [-1, -4], [-2, -5], [-2, -6], [-2, -7]];
    case 'wave': return spec.alt ? [[0, 0], [0, -1], [-1, -2], [-1, -3], [-1, -4], [-1, -5], [-2, -6], [-2, -7]] : [[0, 0], [0, -1], [-1, -2], [-1, -3], [-1, -4], [-1, -5], [0, -6], [0, -7]];
    case 'chin': return [[0, 0], [0, 1], [0, 2], [0, 3], [1, 2], [2, 0], [2, -1], [3, -2]];
    case 'hips': return [[0, 0], [0, 1], [-1, 2], [-1, 3], [0, 4], [1, 5], [1, 6], [1, 7]];
    /** 双手在胸前握住鱼竿（两只手在身体中线汇合） */
    case 'hold': return spec.alt ? [[0, 0], [0, 1], [0, 2], [1, 3], [2, 3], [3, 2], [4, 2], [5, 2]] : [[0, 0], [0, 1], [0, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3]];
    default: return Array.from({ length: 8 }, (_, i) => [0, i + off] as Cell);
  }
}
/** 衣袖长度（格数）：T 恤/球衣短，其它长 */
const sleeveLen = (t: TopKind) => (t === 'tee' ? 3 : t === 'jersey' ? 0 : t === 'labcoat' ? 7 : 6);
function drawArmFront(p: Pen, look: Look, C: RGBA[], S: Skin, spec: ArmSpec, right: boolean, sy: number) {
  const cells = armCells(spec), sl = sleeveLen(look.top), cuff = look.top === 'sweater' || look.top === 'hoodie';
  const sx = right ? 12 : 2;
  cells.forEach(([dx, dy], i) => {
    const x = right ? sx - dx : sx + dx, y = sy + dy, hand = i >= cells.length - 2;
    const outerX = right ? x + 1 : x;
    if (hand) { p.rect(x, y, 2, 1, i === cells.length - 1 ? S.sh : S.base); }
    else if (i < sl) { p.rect(x, y, 2, 1, C[1]); p.set(outerX, y, C[0]); if ((cuff || look.top === 'tee') && i === sl - 1) p.rect(x, y, 2, 1, C[0]); }
    else { p.rect(x, y, 2, 1, S.base); p.set(outerX, y, S.sh); }
  });
}

/* ───────── 躯干（前 / 后） ───────── */
function drawTorsoFront(p: Pen, look: Look, S: Skin, back: boolean) {
  const C = tones(look.topColor), A = tones(look.top2 ?? '#e8e4da'), [cd, cm, cb, cl] = C, ty = TY;
  const labH = look.top === 'labcoat' ? 13 : 9;
  p.rect(4, ty, 8, labH, cb); p.rect(4, ty, 1, labH, cl); p.rect(11, ty, 1, labH, cm); p.rect(4, ty + labH - 1, 8, 1, cm);
  if (!back) p.rect(5, ty + 1, 2, 3, cl);
  if (p.k >= 2) { p.hr(13, (ty - 1) * 2, 6, 1, S.sh); p.hr(13, (ty - 1) * 2 + 1, 6, 1, S.base); } else { p.rect(6, ty - 1, 4, 1, S.sh); p.rect(7, ty - 1, 2, 1, S.dk); }
  const front = !back;
  switch (look.top) {
    case 'hoodie': p.rect(5, ty - 1, 6, 2, cm); p.rect(6, ty, 4, 1, cd); if (front) { p.rect(5, ty + 5, 6, 3, cm); p.hline(5, ty + 5, 6, cd); p.set(7, ty + 2, A[3]); p.set(9, ty + 2, A[3]); p.vline(7, ty + 2, 3, A[2]); p.vline(9, ty + 2, 3, A[2]); } else p.rect(5, ty, 6, 3, cm); break;
    case 'jacket': if (front) { p.rect(7, ty, 2, 9, A[2]); p.vline(8, ty, 9, A[1]); p.rect(5, ty, 2, 2, cl); p.rect(9, ty, 2, 2, cl); p.vline(6, ty + 3, 4, cm); p.vline(10, ty + 3, 4, cm); } p.hline(4, ty + 7, 8, cd); p.hline(4, ty + 8, 8, A[2]); break;
    case 'shirt': if (front) { p.rect(5, ty, 6, 2, WHITE); p.set(7, ty + 2, WHITE); p.set(8, ty + 2, WHITE); p.vline(8, ty + 2, 6, A[3]); p.rect(7, ty + 1, 2, 5, hex('#c4503c')); p.set(7, ty + 6, hex('#8a2f26')); p.set(8, ty + 6, hex('#8a2f26')); } else p.rect(5, ty, 6, 1, WHITE); break;
    case 'sweater': p.rect(5, ty - 1, 6, 2, cm); p.hline(5, ty - 1, 6, cl); p.hline(4, ty + 8, 8, A[2]); for (let x = 5; x < 11; x += 2) { p.set(x, ty + 3, cl); p.set(x + 1, ty + 5, cl); } break;
    case 'cardigan': if (front) { p.rect(6, ty, 4, 9, A[2]); p.hline(6, ty, 4, A[3]); p.vline(6, ty, 9, cd); p.vline(9, ty, 9, cd); for (const y of [2, 4, 6]) p.set(8, ty + y, A[0]); } p.hline(4, ty + 8, 8, cd); break;
    case 'labcoat': if (front) { p.vline(8, ty + 1, 12, cm); p.set(7, ty, cd); p.set(9, ty, cd); p.set(6, ty + 1, cd); p.set(10, ty + 1, cd); p.rect(5, ty + 7, 2, 2, cm); p.hline(5, ty + 7, 2, cd); p.set(10, ty + 4, hex('#4a7ac0')); p.set(10, ty + 5, hex('#c4503c')); } p.hline(4, ty + 12, 8, cm); break;
    case 'jersey': p.rect(4, ty, 8, 9, cb); p.rect(4, ty, 1, 9, cl); p.rect(11, ty, 1, 9, cm); if (front) { p.rect(5, ty, 6, 2, S.base); p.rect(6, ty + 2, 4, 1, S.base); p.hline(5, ty + 2, 1, cd); p.hline(10, ty + 2, 1, cd); for (const [x, y] of [[7, 3], [8, 3], [7, 4], [8, 5], [7, 6], [8, 6], [7, 7]]) p.set(x, ty + y, A[3]); p.hline(4, ty + 8, 8, A[2]); } else { p.rect(7, ty + 3, 3, 4, A[3]); } break;
    default: if (front) { if (p.k >= 2) { p.hr(13, ty * 2, 6, 1, S.base); p.hr(14, ty * 2 + 1, 4, 1, S.sh); } else p.rect(6, ty, 4, 1, S.sh); } p.hline(4, ty + 8, 8, cm); break;
  }
  if (p.k >= 2 && front && look.top !== 'jersey') { p.hr(11, ty * 2 + 8, 1, 6, cm); p.hr(20, ty * 2 + 10, 1, 5, cm); p.hr(9, ty * 2 + 2, 3, 1, cl); }
  if (look.lanyard && front) { p.set(6, ty, hex('#c4503c')); p.set(9, ty, hex('#c4503c')); p.set(7, ty + 1, hex('#c4503c')); p.set(8, ty + 1, hex('#c4503c')); p.rect(7, ty + 5, 2, 3, WHITE); p.set(7, ty + 5, hex('#4a7ac0')); p.set(8, ty + 5, hex('#4a7ac0')); p.set(7, ty + 3, hex('#c4503c')); p.set(8, ty + 4, hex('#c4503c')); }
  if (look.bag && front) { p.vline(5, ty, 8, hex('#6f4a2c')); p.vline(10, ty, 8, hex('#6f4a2c')); p.set(5, ty + 8, hex('#a8794a')); p.set(10, ty + 8, hex('#a8794a')); }
  if (look.bag && back) { p.rect(4, 17, 8, 8, hex('#7a5233')); p.rect(4, 17, 8, 1, hex('#a8794a')); p.rect(5, 19, 6, 3, hex('#6a4528')); p.rect(7, 21, 2, 1, hex('#d8b36a')); p.hline(4, 24, 8, hex('#4a2f1a')); }
}

/* ───────── 腿 / 鞋 ───────── */
const BOTTOM_DEFAULT: Record<BottomKind, string> = { jeans: '#3f6aa8', wide: '#6a6a78', sport: '#3a3f55', shorts: '#4a5a78', skirt: '#8a5aa8', longskirt: '#7a4a58' };
function shoeCols(look: Look) { return tones(look.shoeColor ?? ({ sneaker: '#34293a', boots: '#5a3a2a', canvas: '#c4503c', loafer: '#2a2430' } as const)[look.shoes]); }
function drawShoe(p: Pen, look: Look, x: number, y: number, w: number, flip = false) {
  const s = shoeCols(look), sole = hex('#f2eee6');
  switch (look.shoes) {
    case 'boots': p.rect(x, y - 3, w, 5, s[2]); p.rect(x, y - 3, w, 1, s[3]); p.vline(x, y - 2, 4, s[1]); p.hline(x, y + 1, w, s[0]); break;
    case 'canvas': p.rect(x, y, w, 2, s[2]); p.hline(x, y + 1, w, sole); p.rect(flip ? x : x + w - 2, y, 2, 1, sole); p.set(x + 1, y, s[3]); break;
    case 'loafer': p.rect(x, y, w, 2, s[2]); p.hline(x, y + 1, w, s[0]); p.set(x + 1, y, s[3]); p.set(x + 2, y, s[3]); break;
    default: p.rect(x, y, w, 2, s[2]); p.hline(x, y + 1, w, sole); p.set(x + 1, y, [120, 100, 130, 255]); p.set(x + 2, y, s[3]); break;
  }
}
function drawLegsFront(p: Pen, look: Look, S: Skin, lift: [number, number]) {
  const B = tones(look.bottomColor), A = tones(look.top2 ?? '#e8e4da'), k = look.bottom, [lL, lR] = lift;
  const skirty = k === 'skirt' || k === 'shorts' || k === 'longskirt';
  if (k === 'skirt' || k === 'shorts') {
    const sh = k === 'skirt' ? 4 : 2;
    p.rect(4, 24, 8, sh, B[2]); p.rect(3, 24 + sh - 1, 10, 1, B[2]); p.hline(4, 24 + sh, 8, B[1]); p.rect(4, 24, 1, sh, B[3]); p.rect(11, 24, 1, sh, B[1]);
    if (k === 'skirt') for (let x = 5; x < 11; x += 2) p.vline(x, 25, sh - 1, B[1]);
    const lt = 24 + sh + 1;
    p.rect(5, lt, 2, 29 - lt - lL + 1, S.base); p.rect(9, lt, 2, 29 - lt - lR + 1, S.base);
    if (look.sock) { p.rect(5, 27 - lL, 2, 2, WHITE); p.rect(9, 27 - lR, 2, 2, WHITE); }
  } else if (k === 'longskirt') {
    p.rect(4, 24, 8, 5, B[2]); p.rect(3, 27, 10, 2, B[2]); p.rect(4, 24, 1, 5, B[3]); p.rect(11, 24, 1, 5, B[1]); p.hline(3, 28, 10, B[1]); p.hline(3, 27, 10, B[3]);
    for (let x = 5; x < 11; x += 2) p.vline(x, 25, 4, B[1]);
  } else {
    const wide = k === 'wide';
    p.rect(4, 24, 4, 5 - lL, B[2]); p.rect(8, 24, 4, 5 - lR, B[2]); p.rect(4, 24, 1, 5 - lL, B[3]); p.rect(11, 24, 1, 5 - lR, B[1]); p.vline(7, 24, 5 - Math.max(lL, lR), B[1]); p.hline(4, 24, 8, B[1]);
    if (k === 'jeans') { p.hline(4, 28 - lL, 4, B[3]); p.hline(8, 28 - lR, 4, B[3]); }
    if (wide) { p.rect(3, 27 - lL, 5, 2, B[2]); p.rect(8, 27 - lR, 5, 2, B[2]); p.vline(3, 27 - lL, 2, B[3]); p.vline(12, 27 - lR, 2, B[1]); }
    if (k === 'sport') { p.vline(4, 25, 4 - lL, A[3]); p.vline(11, 25, 4 - lR, A[3]); }
  }
  void skirty;
  drawShoe(p, look, 4, 29 - lL, 4); drawShoe(p, look, 8, 29 - lR, 4, true);
}
function drawLegsSide(p: Pen, look: Look, S: Skin, s: SideRig) {
  const B = tones(look.bottomColor), A = tones(look.top2 ?? '#e8e4da'), k = look.bottom;
  const skin = k === 'skirt' || k === 'shorts' || k === 'longskirt';
  const lt = k === 'skirt' ? 29 : k === 'shorts' ? 27 : k === 'longskirt' ? 29 : 25;
  const leg = (x: number, lift: number, far: boolean) => {
    const col = skin ? (far ? S.sh : S.base) : far ? B[1] : B[2];
    p.rect(x, lt, 3, 29 - lt - lift + (lift && !skin ? 0 : 0), col);
    if (k === 'jeans' && !far) p.hline(x, 28 - lift, 3, B[3]);
    if (k === 'wide') p.rect(x - 1, 27 - lift, 5, 2, col);
    if (k === 'sport' && !far) p.vline(x + 1, lt, 29 - lt - lift, A[3]);
    if (skin && look.sock) p.rect(x, 27 - lift, 3, 2, WHITE);
    drawShoe(p, look, x - 1 + (far ? 0 : 1), 29 - lift, 4);
  };
  leg(6 + s.fx, s.fl, true); leg(7 + s.nx, s.nl, false);
  if (k === 'skirt') { p.rect(4, 24, 8, 4, B[2]); p.rect(3, 27, 10, 1, B[2]); p.hline(4, 28, 8, B[1]); }
  if (k === 'shorts') { p.rect(5, 24, 6, 3, B[2]); p.hline(5, 26, 6, B[1]); }
  if (k === 'longskirt') { p.rect(4, 24, 8, 5, B[2]); p.rect(3, 27, 10, 2, B[2]); p.hline(3, 28, 10, B[1]); }
}
function drawTorsoSide(p: Pen, look: Look, S: Skin, s: SideRig) {
  const C = tones(look.topColor), A = tones(look.top2 ?? '#e8e4da'), ty = TY, ln = s.lean;
  const labH = look.top === 'labcoat' ? 13 : 9;
  p.rect(5 + ln, ty, 6, labH, C[2]); p.vline(5 + ln, ty, labH, C[3]); p.vline(10 + ln, ty, labH, C[1]); p.hline(5 + ln, ty + labH - 1, 6, C[1]);
  switch (look.top) {
    case 'hoodie': p.rect(4 + ln, ty - 1, 6, 2, C[1]); p.rect(5 + ln, ty + 5, 6, 3, C[1]); break;
    case 'jacket': p.vline(10 + ln, ty, 9, A[2]); p.hline(5 + ln, ty + 7, 6, C[0]); break;
    case 'shirt': p.rect(9 + ln, ty, 2, 2, WHITE); p.vline(10 + ln, ty + 2, 5, hex('#c4503c')); break;
    case 'sweater': p.hline(5 + ln, ty + 8, 6, A[2]); p.rect(5 + ln, ty - 1, 5, 2, C[1]); break;
    case 'cardigan': p.vline(10 + ln, ty, 9, A[2]); p.hline(5 + ln, ty + 8, 6, C[0]); break;
    case 'labcoat': p.vline(10 + ln, ty + 1, 12, C[1]); p.hline(5 + ln, ty + 12, 6, C[1]); break;
    case 'jersey': p.rect(7 + ln, ty + 3, 3, 4, A[3]); break;
  }
  if (p.k >= 2) { p.hr((6 + ln) * 2, (ty - 1) * 2, 6, 1, S.sh); p.hr((6 + ln) * 2, (ty - 1) * 2 + 1, 6, 1, S.base); } else p.rect(6 + ln, ty - 1, 3, 1, S.sh);
  if (look.lanyard) { p.vline(10 + ln, ty, 3, hex('#c4503c')); p.rect(10 + ln, ty + 3, 1, 3, WHITE); }
  if (look.bag) { p.rect(2 + ln, ty + 1, 4, 8, hex('#7a5233')); p.rect(2 + ln, ty + 1, 4, 1, hex('#a8794a')); p.rect(3 + ln, ty + 3, 2, 3, hex('#6a4528')); p.vline(9 + ln, ty, 5, hex('#6f4a2c')); }
}
function drawArmSide(p: Pen, look: Look, C: RGBA[], S: Skin, s: SideRig, far: boolean) {
  const ty = TY, sl = sleeveLen(look.top), col = far ? C[0] : C[1], ln = s.lean;
  const ax = far ? -s.ax : s.ax;
  const x0 = 7 + ln + (far ? 0 : 0);
  if (s.arm === 'reach') { // 向前下方伸手（摸猫、喂猫）：手臂沿对角线伸向前下方
    if (far) return;
    const x = 8 + ln, y = TY + 1;
    for (let i = 0; i < 7; i++) p.rect(x - 1 + i, y + i, 3, 1, i >= 5 ? (i === 6 ? S.sh : S.base) : i < sl ? col : S.base);
    return;
  }
  if (s.arm === 'bent') { // 屈肘：向前的臂上臂下垂、前臂前抬握拳；向后的臂斜向后下
    const x = 8 + ln, y = TY + 1;
    if (ax > 0) { p.rect(x - 1, y, 3, 3, col); p.rect(x + 1, y + 2, 4, 2, col); p.rect(x + 5, y + 1, 2, 3, S.base); p.set(x + 6, y + 3, S.sh); if (!far) p.vline(x - 1, y, 3, C[3]); }
    else { p.rect(x - 1, y, 3, 2, col); p.rect(x - 3, y + 2, 3, 3, col); p.rect(x - 4, y + 4, 2, 3, S.base); p.set(x - 4, y + 6, S.sh); if (!far) p.vline(x - 3, y + 2, 3, C[3]); }
    return;
  }
  const y = TY + 1;
  for (let i = 0; i < 8; i++) {
    const hand = i >= 6, c = hand ? (i === 7 ? S.sh : S.base) : i < sl ? col : S.base;
    p.rect(x0 + ax, y + i, 3, 1, c);
  }
  if (!far) p.vline(x0 + ax, y, Math.min(sl, 6), C[3]);
}

/* ───────── 头（侧） ───────── */
function headSide(p: Pen, look: Look, S: Skin, eyes: Eyes, mouth: Mouth) {
  const hy = HY;
  p.ell(9, hy + 8, 4.6, 5.4, S.base); p.rect(5, hy + 12, 6, 1, S.sh);
  p.rect(12, hy + 9, 1, 2, S.base); p.set(12, hy + 10, S.sh);
  if (p.k >= 2) { faceSideHD(p, S, look, eyes, mouth); return; }
  if (eyes === 'blink') p.hline(10, hy + 10, 2, EYE); else { p.rect(10, hy + 8, 2, 3, EYE); p.set(10, hy + 8, WHITE); p.set(10, hy + 10, [90, 60, 80, 255]); }
  if (look.blush !== false) p.rect(9, hy + 11, 2, 1, S.blush);
  p.set(11, hy + 12, mouth === 'open' ? MOUTH_IN : MOUTH);
  if (look.mask) { const mk = tones('#e8f0f4'); p.rect(8, hy + 10, 5, 4, mk[2]); p.hline(8, hy + 10, 5, mk[3]); p.vline(7, hy + 9, 3, mk[1]); }
  if (look.glasses) glassesSide(p, look.glasses);
}

/* ───────── 合成一帧 ───────── */
/** 输出帧尺寸与脚点（k = 分辨率倍数）：k=1 → 26×44；k=2 → 50×84 */
export const frameMeta = (k = 1) => ({ w: CANVAS.w * k + 2, h: CANVAS.h * k + 2 + 2 * k, ax: (CANVAS.ox + 8) * k + 1, ay: (CANVAS.oy + 33) * k });   // 脚点 = 鞋底再往下 2k 行（与旧版 16×32 人物的锚点关系一致）
export const FRAME = frameMeta(1);
export function renderFrame(look: Look, pose: Pose, view: View, tick = 0, k = 1): Img {
  const raw = new Img(CANVAS.w * k, CANVAS.h * k), S = skinTones(look.skin), C = tones(look.topColor), kh = hairTones(look), def = HAIRS[look.hair];
  const air = pose.air ?? 0, eyes = pose.eyes ?? 'open', mouth = pose.mouth ?? 'neutral', sway = tick;
  const base = new Pen(raw, CANVAS.ox, CANVAS.oy - air, k);          // 腿
  const up = new Pen(raw, CANVAS.ox + (pose.bx ?? 0), CANVAS.oy + pose.dy - air, k); // 上半身
  const head = up.at(pose.hx ?? 0, pose.hy ?? 0);
  if (view === 'right') {
    const s = pose.s ?? stand().s!;
    const lean = s.lean;
    drawLegsSide(base, look, S, s);
    drawArmSide(up, look, C, S, s, true);
    drawTorsoSide(up, look, S, s);
    drawArmSide(up, look, C, S, s, false);
    const h = head.at(lean, 0);
    headSideLayers(h, look, S, eyes, mouth, def, kh, sway);
  } else {
    const back = view === 'up';
    drawLegsFront(base, look, S, pose.lift);
    if (!back) hairBackFront(head, look, def, kh, sway); // 长发的后片在身体后面，露出脖子与肩线
    if (back) { drawTorsoFront(up, look, S, true); }
    else drawTorsoFront(up, look, S, false);
    const sy = TY + 1, raised = (a: ArmSpec) => a.shape === 'cheer' || a.shape === 'wave' || a.shape === 'chin';
    if (!raised(pose.aL)) drawArmFront(up, look, C, S, pose.aL, false, sy);
    if (!raised(pose.aR)) drawArmFront(up, look, C, S, pose.aR, true, sy);
    if (!back) {
      faceFront(head, S, look, eyes, mouth);
      if (look.scarf) scarf(up, look);
      hairFrontFront(head, look, def, kh);
      if (k >= 2) hairDetailHD(head, look, def);
      eyesFront(head, S, look, eyes, mouth);
      hatFront(head, look, false);
    } else {
      hairBackView(head, look, def, kh, sway);
      if (look.scarf) scarf(up, look);
      hatFront(head, look, true);
    }
    if (look.headphones) { const hp = hex('#2f3342'); head.rect(2, HY + 6, 2, 5, hp); head.rect(12, HY + 6, 2, 5, hp); head.hline(3, HY + 1, 10, hp); head.set(2, HY + 7, hex('#6a7090')); head.set(13, HY + 7, hex('#6a7090')); }
    if (raised(pose.aL)) drawArmFront(up, look, C, S, pose.aL, false, sy);
    if (raised(pose.aR)) drawArmFront(up, look, C, S, pose.aR, true, sy);
  }
  return finish(raw, k);
}
function headSideLayers(p: Pen, look: Look, S: Skin, eyes: Eyes, mouth: Mouth, def: HairDef, k: ReturnType<typeof hairTones>, sway: number) {
  headSide(p, look, S, eyes, mouth);
  hairSide(p, look, def, k, sway);
  if (look.headphones) { const hp = hex('#2f3342'); p.rect(5, HY + 6, 4, 5, hp); p.hline(5, HY + 1, 8, hp); p.rect(6, HY + 7, 2, 3, hex('#6a7090')); }
  if (look.scarf) { const c = tones(look.scarf); p.rect(5, TY - 1, 6, 2, c[2]); p.hline(5, TY - 1, 6, c[3]); }
  hatSide(p, look);
}
function scarf(p: Pen, look: Look) {
  const c = tones(look.scarf!);
  p.rect(4, TY - 1, 8, 3, c[2]); p.hline(4, TY - 1, 8, c[3]); p.hline(4, TY + 1, 8, c[1]);
  p.rect(9, TY + 2, 3, 6, c[2]); p.vline(11, TY + 2, 6, c[1]); p.hline(9, TY + 7, 3, c[0]); for (let x = 9; x < 12; x += 2) p.set(x, TY + 8, c[1]);
  for (let x = 5; x < 12; x += 2) p.set(x, TY, c[1]);
}
function finish(raw: Img, k = 1): Img {
  const o = raw.outlinedSoft();
  const out = new Img(o.w, o.h + 2 * k);
  for (let y = o.h - 4 * k; y < o.h + 2 * k; y++) for (let x = 1; x < o.w - 1; x++) {
    const dx = (x + 0.5 - o.w / 2) / (6.2 * k), dy = (y + 0.5 - (o.h - 0.6 * k)) / (2.1 * k);
    if (dx * dx + dy * dy <= 1) out.set(x, y, [28, 36, 66, dx * dx + dy * dy > 0.5 ? 34 : 60]);
  }
  out.blit(o, 0, 0);
  return out;
}

/** 渲染一个外观的一个动作：key = `${anim}_${view}_${frame}`，left 视角由 right 镜像 */
export function buildAnim(look: Look, a: Anim, k = 1): Record<string, Img> {
  const out: Record<string, Img> = {};
  for (const v of a.views) a.frames.forEach((pose, i) => {
    const img = renderFrame(look, pose, v, i, k);
    out[`${a.id}_${v}_${i}`] = img;
    if (v === 'right') { const m = new Img(img.w, img.h); for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const c = img.get(img.w - 1 - x, y); if (c[3]) m.set(x, y, c); } out[`${a.id}_left_${i}`] = m; }
  });
  return out;
}
/** 渲染一个外观的全部动作 */
export function buildAll(look: Look, k = 1): Record<string, Img> {
  const out: Record<string, Img> = {};
  for (const a of ANIMS) Object.assign(out, buildAnim(look, a, k));
  return out;
}

/**
 * 证件照（学生证头像 / 创建角色预览 / 资料卡）：2 倍分辨率的正面半身像，40×58，带渐变底色。
 * expr：neutral 证件照标准脸 / smile 微笑 / happy 笑眼。地图上的小人仍用 k=1。
 */
export const PORTRAIT = { w: 40, h: 58 };
export function renderPortrait(look: Look, o: { bg?: string | null; expr?: 'neutral' | 'smile' | 'happy' } = {}): Img {
  const eyes: Eyes = o.expr === 'happy' ? 'happy' : 'open', mouth: Mouth = o.expr === 'neutral' ? 'neutral' : 'smile';
  const full = renderFrame(look, stand({ eyes, mouth }), 'down', 0, 2);
  const img = new Img(PORTRAIT.w, PORTRAIT.h);
  if (o.bg !== null) {
    const base = hex(o.bg ?? '#cfe3f2');
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const vx = Math.abs(x - img.w / 2) / (img.w / 2); img.set(x, y, MIX(MIX(base, [255, 255, 255, 255], 0.28 * (1 - y / img.h)), [40, 50, 90, 255], 0.14 * vx * vx)); }
  }
  img.blit(full.crop(5, 8, PORTRAIT.w, PORTRAIT.h), 0, 0);
  return img;
}

/**
 * 预置造型（游戏里档案的 look 编号 0–11，对应旧版 tools/art/characters.ts 的 LOOKS 下标，男女各 6 个由 shared/profile.ts 的 LOOK_CHOICES 决定）。
 * 现在由 Rig 渲染；以后 Appearance 自定义（P2）也是同一套参数，预置只是其中 12 个固定取值。
 */
export const PRESET_LOOKS: Look[] = [
  { skin: 1, hair: 'short', fringe: 'side', hairColor: '#2f2430', top: 'hoodie', topColor: '#3f78c0', top2: '#e8e4da', bottom: 'jeans', bottomColor: '#3f6aa8', shoes: 'sneaker', bag: true },
  { skin: 0, hair: 'long', fringe: 'part', hairColor: '#5a3a24', top: 'sweater', topColor: '#d96a58', top2: '#f4e4c8', bottom: 'skirt', bottomColor: '#4a5a88', shoes: 'sneaker' },
  { skin: 2, hair: 'short', fringe: 'side', hairColor: '#241c28', top: 'jacket', topColor: '#4a7a5a', top2: '#d8d0b8', bottom: 'jeans', bottomColor: '#b89e66', shoes: 'sneaker', glasses: 'round' },
  { skin: 0, hair: 'bun', fringe: 'blunt', hairColor: '#d8a84e', top: 'tee', topColor: '#f2eee4', top2: '#e8c8d8', bottom: 'skirt', bottomColor: '#8a5aa8', shoes: 'canvas', shoeColor: '#f2eee4' },
  { skin: 3, hair: 'short', fringe: 'side', hairColor: '#1c1620', top: 'tee', topColor: '#e8a83a', bottom: 'jeans', bottomColor: '#3a3f55', shoes: 'sneaker', bag: true, headphones: true },
  { skin: 1, hair: 'ponytail', fringe: 'side', hairColor: '#a8402f', top: 'hoodie', topColor: '#8a5aa8', top2: '#e8d8f0', bottom: 'jeans', bottomColor: '#3f6aa8', shoes: 'sneaker' },
  { skin: 2, hair: 'short', fringe: 'side', hairColor: '#4a3020', top: 'shirt', topColor: '#5a88c8', top2: '#c4503c', bottom: 'jeans', bottomColor: '#3a3f55', shoes: 'sneaker', hat: 'cap', hatColor: '#c4503c' },
  { skin: 0, hair: 'bob', fringe: 'side', hairColor: '#8a5a2b', top: 'jacket', topColor: '#c08a4a', top2: '#f0e4cc', bottom: 'shorts', bottomColor: '#4a5a78', shoes: 'sneaker', glasses: 'round', sock: true },
  { skin: 1, hair: 'long', fringe: 'part', hairColor: '#3a3250', top: 'tee', topColor: '#58b0a0', bottom: 'jeans', bottomColor: '#3f6aa8', shoes: 'sneaker', bag: true },
  { skin: 2, hair: 'bun', fringe: 'blunt', hairColor: '#2a2024', top: 'sweater', topColor: '#7a9ad0', top2: '#ffffff', bottom: 'skirt', bottomColor: '#3a3f55', shoes: 'loafer' },
  { skin: 0, hair: 'short', fringe: 'side', hairColor: '#3a2a1c', top: 'sweater', topColor: '#c0584a', top2: '#f0e4cc', bottom: 'jeans', bottomColor: '#3f6aa8', shoes: 'sneaker', bag: true },
  { skin: 1, hair: 'short', fringe: 'part', hairColor: '#1c1620', top: 'tee', topColor: '#58b0a0', bottom: 'jeans', bottomColor: '#b89e66', shoes: 'sneaker', glasses: 'round', headphones: true },
];

/* ───────── 外观（shared/appearance 的数字数组）↔ Look ───────── */
/** 把网络/档案里的外观数组变成渲染用的 Look；数组必须已通过 parseAppearance */
export function appToLook(a: Appearance): Look {
  const f = a[IDX.flags], tip = a[IDX.tip], scarf = a[IDX.scarf], hat = HATS[a[IDX.hat]], glasses = GLASSES[a[IDX.glasses]];
  return {
    skin: a[IDX.skin], hair: HAIR_STYLES[a[IDX.hair]], fringe: FRINGES[a[IDX.fringe]], hairColor: HAIR_COLORS[a[IDX.hairColor]], tipColor: tip ? HAIR_COLORS[tip - 1] : undefined,
    top: TOPS[a[IDX.top]], topColor: DYE_COLORS[a[IDX.topColor]], top2: DYE_COLORS[a[IDX.top2]], bottom: BOTTOMS[a[IDX.bottom]], bottomColor: DYE_COLORS[a[IDX.bottomColor]],
    shoes: SHOES[a[IDX.shoes]], sock: !!(f & FLAG.sock), hat, hatColor: hat ? DYE_COLORS[a[IDX.hatColor]] : undefined, glasses,
    headphones: !!(f & FLAG.headphones), bag: !!(f & FLAG.bag), lanyard: !!(f & FLAG.lanyard), mask: !!(f & FLAG.mask), freckles: !!(f & FLAG.freckles), blush: !(f & FLAG.noBlush),
    scarf: scarf ? DYE_COLORS[scarf - 1] : undefined, eyeColor: EYE_COLORS[a[IDX.eye]],
  };
}
const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
/** 色板里最接近的颜色编号（把预置造型里的任意颜色映射成色板编号，供"从预置开始修改"用） */
function nearest(pal: readonly string[], c: string | undefined, fallback = 0): number {
  if (!c) return fallback;
  const t = rgb(c); let best = 0, bd = 1e9;
  pal.forEach((p, i) => { const q = rgb(p), d = (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}
export function lookToApp(l: Look): Appearance {
  const a = new Array<number>(APP_LEN).fill(0);
  a[IDX.skin] = l.skin; a[IDX.eye] = nearest(EYE_COLORS, l.eyeColor); a[IDX.hair] = HAIR_STYLES.indexOf(l.hair); a[IDX.fringe] = FRINGES.indexOf(l.fringe);
  a[IDX.hairColor] = nearest(HAIR_COLORS, l.hairColor); a[IDX.tip] = l.tipColor ? nearest(HAIR_COLORS, l.tipColor) + 1 : 0;
  a[IDX.top] = TOPS.indexOf(l.top); a[IDX.topColor] = nearest(DYE_COLORS, l.topColor); a[IDX.top2] = nearest(DYE_COLORS, l.top2 ?? '#e8e4da');
  a[IDX.bottom] = BOTTOMS.indexOf(l.bottom); a[IDX.bottomColor] = nearest(DYE_COLORS, l.bottomColor); a[IDX.shoes] = SHOES.indexOf(l.shoes);
  a[IDX.hat] = l.hat ? HATS.indexOf(l.hat) : 0; a[IDX.hatColor] = nearest(DYE_COLORS, l.hatColor); a[IDX.glasses] = l.glasses ? GLASSES.indexOf(l.glasses) : 0;
  a[IDX.flags] = (l.headphones ? FLAG.headphones : 0) | (l.bag ? FLAG.bag : 0) | (l.lanyard ? FLAG.lanyard : 0) | (l.mask ? FLAG.mask : 0) | (l.freckles ? FLAG.freckles : 0) | (l.blush === false ? FLAG.noBlush : 0) | (l.sock ? FLAG.sock : 0);
  a[IDX.scarf] = l.scarf ? nearest(DYE_COLORS, l.scarf) + 1 : 0;
  return a;
}
/** 预置造型 n 对应的外观数组（创建角色时"从预置开始修改"用） */
export const presetApp = (n: number): Appearance => lookToApp(PRESET_LOOKS[n] ?? PRESET_LOOKS[0]);
