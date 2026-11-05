/**
 * 小猫 Rig 原型（设计文档 私有设计稿 §7）：
 * 外观（毛色/花纹/白色面积/瞳色/体型/耳/尾/配饰）与姿势（Pose 数据）分离——任何外观都能播放任何动作。
 * 渲染思路：先把每个像素画成"部位 + 明暗级"（不带颜色），最后按花纹引擎给每个像素选色板——
 * 所以花纹在所有姿势里都自然跟着身体走。只依赖 px.ts 的 Img，不改动现有 cats.ts。
 * 坐标沿用旧版 cats.ts 的"旧坐标"（身体中心约 (10,10)、脚底 15），渲染时整体平移 (SX,SY)。右向侧视图，左向由游戏翻转。
 */
import { Img, hash2, hex, vnoise, type RGBA } from './px.ts';

/* ───────── 外观 ───────── */
export type CatPattern = 'solid' | 'mackerel' | 'classic' | 'spotted' | 'ticked' | 'tortie' | 'calico' | 'van' | 'point' | 'smoke';
export interface CatLook {
  coat: string; coat2?: string; pattern: CatPattern;
  /** 白色面积：0 无 / 1 白手套 / 2 +胸与口鼻 / 3 +腹与四肢（燕尾服·橘白） / 4 大部分白 */
  white?: 0 | 1 | 2 | 3 | 4;
  eye: string; eye2?: string;
  build?: 'normal' | 'chonky' | 'slim' | 'kitten'; fur?: 'short' | 'long'; ear?: 'prick' | 'fold'; tail?: 'long' | 'bob' | 'fluffy';
  acc?: 'collar' | 'bell' | 'bow' | 'scarf'; accColor?: string; seed?: number;
}

/* ───────── 姿势 ───────── */
export type Ell = [number, number, number, number];
export interface Leg { x0: number; y0: number; x1: number; y1: number; far?: boolean; over?: boolean; paw?: boolean }
export interface CPose {
  body: Ell; body2?: Ell; chest?: Ell;
  head: [number, number]; headMode?: 'side' | 'down' | 'up';
  eye?: 'open' | 'closed' | 'slow' | 'happy'; mouth?: 'closed' | 'open' | 'big' | 'tongue';
  ear?: 'up' | 'back' | 'twitch';
  legs: Leg[]; tail: [number, number][]; tailFront?: boolean; puff?: boolean;
  /** 头朝左（回头看 / 追尾巴 / 面对面理毛）、肚皮朝上（打滚）、嘴里叼的东西、甩出的水珠/雪花（轮廓之外的特效） */
  headFlip?: boolean; bellyUp?: boolean; item?: 'fish' | 'leaf'; fx?: { c: RGBA; pts: [number, number][] };
}
export interface CAnim { id: string; fps: number; loop: boolean; frames: CPose[] }

const STAND: Leg[] = [
  { x0: 8, y0: 12, x1: 8, y1: 15, far: true }, { x0: 15, y0: 12, x1: 15, y1: 15, far: true },
  { x0: 6, y0: 12, x1: 6, y1: 15 }, { x0: 13, y0: 12, x1: 13, y1: 15 },
];
const tailUp = (sw = 0): [number, number][] => [[4, 9], [3, 8], [2, 6], [2, 4], [2 + sw, 3]];
const tailLow = (sw = 0): [number, number][] => [[4, 10], [3, 11], [2, 12], [1, 12.5], [0 + sw, 12.5]];
const tailFlat = (sw = 0): [number, number][] => [[4, 9.5], [2.5, 9.3], [1, 9], [-0.5, 8.8 + sw], [-2, 9 + sw]];
const tailGround: [number, number][] = [[2, 15], [3, 16], [5, 16], [7, 16], [9, 16], [11, 16], [12, 16]];
const sitBase = (): CPose => ({ body: [9, 11.5, 5.4, 4.6], chest: [13, 8.5, 3.2, 5], head: [15, 5], legs: [
  { x0: 5, y0: 15, x1: 10, y1: 15 }, { x0: 15, y0: 11, x1: 15, y1: 16, far: true }, { x0: 13, y0: 11, x1: 13, y1: 16 }], tail: tailGround });

/** 步态（walk 6 帧 / trot 4 帧 / run 4 帧）：对角步态，腿摆幅与抬腿高度随速度增大，身体起伏、尾巴摆动 */
function gait(i: number, n: number, kind: 'walk' | 'trot' | 'run'): CPose {
  const th = (i / n) * Math.PI * 2, A = { walk: 2, trot: 2.8, run: 3.8 }[kind], Lf = { walk: 1.5, trot: 2, run: 2.8 }[kind];
  const leg = (hx: number, ph: number, far: boolean): Leg => { const t = th + ph, lift = Math.max(0, -Math.sin(t)) * Lf; return { x0: hx, y0: 12, x1: hx + A * Math.cos(t) * 0.9, y1: 15 - lift, far }; };
  const bob = (kind === 'run' ? 1.3 : kind === 'trot' ? 0.9 : 0.6) * Math.abs(Math.sin(th));
  const legs = [leg(8, 0, true), leg(15, Math.PI, true), leg(6, Math.PI, false), leg(13, 0, false)];
  const sw = Math.sin(th * (kind === 'walk' ? 1 : 2)) * 1.2;
  return {
    body: [10, 10 - bob, kind === 'run' ? 7.6 : 7, 3.7], head: [17 + (kind === 'run' ? 0.8 : 0), 7 - bob * 0.5 + (kind === 'run' ? 1 : 0)], legs,
    tail: kind === 'run' ? tailFlat(sw) : tailUp(sw), ear: kind === 'run' ? 'back' : 'up', mouth: kind === 'run' ? 'open' : 'closed',
  };
}
const seq = (n: number, f: (i: number) => CPose) => Array.from({ length: n }, (_, i) => f(i));

export const CAT_ANIMS: CAnim[] = [
  { id: 'walk', fps: 8, loop: true, frames: seq(6, (i) => gait(i, 6, 'walk')) },
  { id: 'trot', fps: 10, loop: true, frames: seq(4, (i) => gait(i, 4, 'trot')) },
  { id: 'run', fps: 12, loop: true, frames: seq(4, (i) => gait(i, 4, 'run')) },
  { id: 'sit', fps: 1.4, loop: true, frames: [
    { ...sitBase() }, { ...sitBase(), tail: [...tailGround.slice(0, 6), [12, 15]] }, { ...sitBase(), eye: 'closed' }, { ...sitBase(), ear: 'twitch', tail: [...tailGround.slice(0, 6), [12, 15]] }] },
  { id: 'loaf', fps: 1, loop: true, frames: seq(2, (i) => ({ body: [10, 12.6 - i * 0.3, 7.2, 3.4 + i * 0.3], head: [17.5, 10.4 - i * 0.3], legs: [{ x0: 14, y0: 14.5, x1: 17, y1: 15.3, paw: true }], tail: [[3, 14], [2, 15], [4, 16], [7, 16.2], [10, 16.3]] })) },
  { id: 'sleep_curl', fps: 1, loop: true, frames: seq(2, (i) => ({ body: [10, 12.2, 7, 4.3 + i * 0.4], head: [15.5, 13.6], headMode: 'down', eye: 'closed', legs: [], tail: [[3, 15], [5, 16.3], [9, 16.8], [13, 16.8], [16, 16], [17.8, 14.8]], tailFront: true })) },
  { id: 'sleep_side', fps: 1, loop: true, frames: seq(2, (i) => ({ body: [10, 13.6 - i * 0.2, 8.2, 3 + i * 0.3], head: [18.5, 13.8], eye: 'closed', legs: [
    { x0: 5, y0: 13, x1: 2, y1: 15, far: true }, { x0: 14, y0: 12.5, x1: 21, y1: 14, far: true }, { x0: 6, y0: 14, x1: 3, y1: 16 }, { x0: 12, y0: 13.8, x1: 20, y1: 15.5 }], tail: [[2, 13], [0, 14], [-1, 15], [-3, 15.6]] })) },
  { id: 'eat', fps: 4, loop: true, frames: seq(2, (i) => ({ body: [8, 10, 6.4, 3.8], head: [14.5, 11 + i], headMode: 'down', eye: 'happy', mouth: i ? 'open' : 'closed', legs: [
    { x0: 5, y0: 12, x1: 5, y1: 15, far: true }, { x0: 7, y0: 12, x1: 7, y1: 15, far: true }, { x0: 5, y0: 12, x1: 5, y1: 15 }, { x0: 13, y0: 12, x1: 13, y1: 15 }, { x0: 11, y0: 12, x1: 11, y1: 15 }], tail: tailUp(0) })) },
  { id: 'drink', fps: 4, loop: true, frames: seq(2, (i) => ({ body: [8, 10.4, 6.4, 3.8], head: [15, 12.6], headMode: 'down', eye: 'closed', mouth: i ? 'tongue' : 'closed', legs: [
    { x0: 5, y0: 12, x1: 5, y1: 15, far: true }, { x0: 7, y0: 12, x1: 7, y1: 15, far: true }, { x0: 12, y0: 12, x1: 12, y1: 15 }, { x0: 14, y0: 12, x1: 14, y1: 15, far: true }], tail: tailLow(i) })) },
  { id: 'lick_paw', fps: 3, loop: true, frames: seq(4, (i) => ({ ...sitBase(), head: [14.6, 7.2 + (i & 1) * 0.6], headMode: 'down', eye: 'closed', mouth: i & 1 ? 'tongue' : 'closed', legs: [
    { x0: 5, y0: 15, x1: 10, y1: 15 }, { x0: 15, y0: 11, x1: 15, y1: 16, far: true }, { x0: 13, y0: 10.5, x1: 15.2 + (i & 1) * -0.6, y1: 7.4 + (i & 1) * 0.5, over: true, paw: true }] })) },
  { id: 'groom', fps: 3, loop: true, frames: seq(4, (i) => ({ ...sitBase(), chest: [13.5, 9.6, 3.2, 4.4], head: [14.6, 8.6 + (i & 1) * 0.5], headMode: 'down', eye: 'closed', mouth: i & 1 ? 'tongue' : 'closed', legs: [
    { x0: 5, y0: 15, x1: 9, y1: 15 }, { x0: 15, y0: 11, x1: 15, y1: 16, far: true }, { x0: 13, y0: 11, x1: 13, y1: 16 }, { x0: 8, y0: 12.5, x1: 13 - (i & 1) * 0.6, y1: 10.2, over: true, paw: true }] })) },
  { id: 'scratch', fps: 8, loop: true, frames: seq(4, (i) => ({ ...sitBase(), head: [15.2, 5.2], eye: 'happy', ear: 'twitch', legs: [
    { x0: 5, y0: 15, x1: 9, y1: 15 }, { x0: 15, y0: 11, x1: 15, y1: 16, far: true }, { x0: 13, y0: 11, x1: 13, y1: 16 }, { x0: 9, y0: 12.5, x1: 14.5 + [0, 1, 0, -1][i], y1: 6.6, over: true, paw: true }] })) },
  { id: 'yawn', fps: 3, loop: false, frames: [
    { ...sitBase(), head: [15.4, 4.6], headMode: 'up', eye: 'closed', mouth: 'open' }, { ...sitBase(), head: [15.6, 4.2], headMode: 'up', eye: 'closed', mouth: 'big' }, { ...sitBase(), head: [15.6, 4.2], headMode: 'up', eye: 'closed', mouth: 'big' }, { ...sitBase(), head: [15.4, 4.6], headMode: 'up', eye: 'closed', mouth: 'open' }] },
  { id: 'meow', fps: 4, loop: true, frames: [{ ...sitBase(), head: [15.4, 4.6], mouth: 'open' }, { ...sitBase(), head: [15.4, 4.8], mouth: 'closed' }] },
  { id: 'slow_blink', fps: 2, loop: false, frames: [{ ...sitBase() }, { ...sitBase(), eye: 'slow' }, { ...sitBase(), eye: 'closed' }, { ...sitBase(), eye: 'slow' }] },
  { id: 'stretch', fps: 3, loop: false, frames: [0, 1, 2, 3].map((i): CPose => {
    const k = [0.4, 1, 1, 0.5][i];
    return { body: [8.5, 11 - 1.5 * k, 4.6, 3.4], body2: [13.5 + k, 12.4, 4.2, 3], head: [19 + k * 1.2, 12.6 + k * 0.4], headMode: 'down', eye: k > 0.9 ? 'closed' : 'open', mouth: k > 0.9 ? 'open' : 'closed',
      legs: [{ x0: 7, y0: 12, x1: 7, y1: 15, far: true }, { x0: 6, y0: 12, x1: 6, y1: 15 }, { x0: 17, y0: 13, x1: 21 + k, y1: 15.2, far: true, paw: true }, { x0: 16, y0: 13.4, x1: 20 + k, y1: 15.4, paw: true }], tail: tailUp(0) };
  }) },
  { id: 'stalk', fps: 4, loop: true, frames: seq(3, (i) => ({ body: [10, 13, 7.4, 2.9], head: [17.6, 11 + (i === 1 ? 0.3 : 0)], ear: 'back', legs: [
    { x0: 8, y0: 13.5, x1: 8.5, y1: 15, far: true }, { x0: 15, y0: 13.5, x1: 16, y1: 15, far: true }, { x0: 6, y0: 13.5, x1: 5.5 + i * 0.6, y1: 15 }, { x0: 13, y0: 13.5, x1: 14.5 - i * 0.6, y1: 15 }], tail: [[4, 12.5], [2.5, 12.8], [1, 12.8], [-0.5, 12.5 + (i - 1) * 1.2], [-2, 12.5 + (i - 1) * 1.8]] })) },
  { id: 'pounce', fps: 6, loop: false, frames: [
    { body: [10, 12.4, 7.4, 3], head: [17.6, 11.2], ear: 'back', legs: [{ x0: 8, y0: 13, x1: 7, y1: 15, far: true }, { x0: 15, y0: 13.5, x1: 16, y1: 15, far: true }, { x0: 6, y0: 12.5, x1: 4.5, y1: 15 }, { x0: 13, y0: 13.5, x1: 14.5, y1: 15 }], tail: tailFlat(1) },
    { body: [10, 10.4, 7.4, 3], head: [18.2, 8], ear: 'back', mouth: 'open', legs: [{ x0: 8, y0: 12, x1: 5, y1: 15, far: true }, { x0: 16, y0: 10, x1: 20, y1: 9, far: true, paw: true }, { x0: 6, y0: 12, x1: 3, y1: 15 }, { x0: 14, y0: 10.5, x1: 19, y1: 9.6, paw: true }], tail: tailFlat(-1) },
    { body: [10, 7.2, 7.4, 2.9], head: [18, 5.6], ear: 'back', mouth: 'open', legs: [{ x0: 7, y0: 8.5, x1: 1, y1: 9.5, far: true }, { x0: 16, y0: 8, x1: 21, y1: 8.2, far: true, paw: true }, { x0: 5, y0: 9, x1: -0.5, y1: 10.5 }, { x0: 14, y0: 8.6, x1: 20, y1: 9, paw: true }], tail: [[3, 7], [1, 7], [-1, 7.2], [-3, 7.6], [-5, 8]] },
    { body: [11, 11.2, 7, 3.4], head: [19, 10], ear: 'back', legs: [{ x0: 8, y0: 12.5, x1: 7, y1: 15, far: true }, { x0: 17, y0: 12, x1: 19, y1: 15, far: true, paw: true }, { x0: 6, y0: 12.5, x1: 4, y1: 15 }, { x0: 15, y0: 12, x1: 17.5, y1: 15, paw: true }], tail: tailFlat(0) },
    { body: [10, 12.8, 7.3, 3.1], head: [17.6, 11], legs: STAND.map((l) => ({ ...l, y0: 13.5 })), tail: tailLow(1) }] },
  { id: 'arch', fps: 4, loop: true, frames: seq(2, (i) => ({ body: [10, 10.4, 6.4, 3.2], body2: [10, 8.8 - i * 0.4, 4.4, 2.8], head: [17.6, 9], headMode: 'down', ear: 'back', mouth: 'open', puff: true,
    legs: [{ x0: 8, y0: 12, x1: 8, y1: 15, far: true }, { x0: 15, y0: 12, x1: 15, y1: 15, far: true }, { x0: 6, y0: 12, x1: 6, y1: 15 }, { x0: 13, y0: 12, x1: 13, y1: 15 }], tail: [[4, 9], [3, 7.5], [2.5, 5.5], [2.5 + i * 0.6, 3.5], [2.5 + i, 1.8]] })) },
];

/* ───────── 补全的动作（§7.2 的 B/C 级） ───────── */
const WATER: RGBA = [190, 225, 255, 255], SNOW: RGBA = [255, 255, 255, 255];
const shakeFx = (c: RGBA, i: number) => ({ c, pts: ([[], [[2, 5], [19, 4], [-1, 9], [22, 8], [10, 1]], [[0, 6], [21, 5], [3, 2], [23, 10], [8, 0]], [[1, 4], [20, 3], [-2, 8], [22, 6], [12, 1]]] as [number, number][][])[i] });
const shake = (c: RGBA): CPose[] => [0, 1, 2, 3].map((i) => { const dx = [0, -1.2, 1.2, -0.8][i], hd = [0, 1, -1, 0.6][i]; return { body: [10 + dx, 10, 7, 3.7], head: [17 + hd + dx * 0.3, 7], ear: 'back', eye: 'closed', puff: i > 0, legs: STAND, tail: tailUp(dx), fx: i ? shakeFx(c, i) : undefined } as CPose; });
const sideLegs: Leg[] = [{ x0: 5, y0: 13, x1: 2, y1: 15, far: true }, { x0: 14, y0: 12.5, x1: 21, y1: 14, far: true }, { x0: 6, y0: 14, x1: 3, y1: 16 }, { x0: 12, y0: 13.8, x1: 20, y1: 15.5 }];
const upLegs = (w: number): Leg[] => [{ x0: 5, y0: 12.6, x1: 3 + w, y1: 8.5, far: true, paw: true }, { x0: 8, y0: 12.4, x1: 7.5 - w, y1: 8, far: true, paw: true }, { x0: 13, y0: 12.4, x1: 15 + w, y1: 8.5, paw: true }, { x0: 15.5, y0: 12.8, x1: 18.5 - w, y1: 9.6, paw: true }];
CAT_ANIMS.push(
  { id: 'rub', fps: 4, loop: true, frames: seq(4, (i) => { const k = [0, 0.6, 1, 0.6][i]; return { body: [10 + k * 1.2, 10 + k * 0.5, 7, 3.7], head: [17 + k * 2.4, 7 + k * 2.2], headMode: 'down', eye: 'happy', legs: STAND.map((l, n) => (n === 1 || n === 3 ? { ...l, x0: l.x0 + k * 1.2, x1: l.x1 + k * 1.8 } : l)), tail: [[4, 9], [3.2, 7], [3, 5], [3, 3], [3.4 + (i & 1) * 0.8, 1.5]] } as CPose; }) },
  { id: 'knead', fps: 5, loop: true, frames: seq(4, (i) => { const a = i & 1; return { body: [10, 12.6, 7, 3.4], head: [17.4, 10.8], eye: i > 1 ? 'closed' : 'happy', legs: [{ x0: 13, y0: 13.6, x1: 16.5 + (a ? 0 : 2.4), y1: a ? 13.2 : 14.8, paw: true }, { x0: 15, y0: 13.6, x1: 18.2 - (a ? 2.2 : 0), y1: a ? 14.8 : 13.2, far: true, paw: true }], tail: [[3, 13.5], [2, 14.5], [3, 16], [6, 16.4]] } as CPose; }) },
  { id: 'roll', fps: 4, loop: true, frames: [
    { body: [10, 13.6, 8.2, 3], head: [18.5, 13.4], eye: 'happy', legs: sideLegs, tail: [[2, 13], [0, 14], [-1, 15], [-3, 15.6]] },
    { body: [10, 13.2, 7.4, 3.4], head: [18.4, 12.8], eye: 'happy', mouth: 'open', legs: [{ x0: 5, y0: 13, x1: 3, y1: 10.5, far: true }, { x0: 6.5, y0: 13.4, x1: 4.5, y1: 10.8 }, { x0: 14, y0: 12.5, x1: 20, y1: 13.5, far: true }, { x0: 12, y0: 13.8, x1: 19, y1: 15.2 }], tail: [[2, 13], [0, 14], [-1, 15], [-3, 15.6]] },
    { body: [10, 13.7, 7.4, 3.1], chest: [10, 12.9, 5.4, 1.7], bellyUp: true, head: [18.4, 13.6], eye: 'happy', mouth: 'open', legs: upLegs(0), tail: [[2, 14], [0, 15], [-1, 15.6], [-3, 15.9]] },
    { body: [10, 13.7, 7.4, 3.1], chest: [10, 12.9, 5.4, 1.7], bellyUp: true, head: [18.4, 13.6], eye: 'happy', mouth: 'open', legs: upLegs(1.2), tail: [[2, 14], [0, 15], [-1, 15.6], [-3, 15.9]] }] },
  { id: 'shake_water', fps: 10, loop: false, frames: shake(WATER) },
  { id: 'shake_snow', fps: 10, loop: false, frames: shake(SNOW) },
  { id: 'chase_tail', fps: 6, loop: true, frames: seq(4, (i) => { const tip = ([[2.4, 8.2], [1.2, 9.4], [2, 10.8], [3.4, 9.6]] as [number, number][])[i]; return { body: [9.5, 12.6, 6.6, 3.3], head: [5.6 + (i & 1) * 0.8, 9.4 + (i >> 1) * 0.4], headFlip: true, ear: 'back', legs: [{ x0: 7, y0: 14, x1: 8, y1: 15, far: true }, { x0: 13, y0: 14, x1: 14, y1: 15, far: true }, { x0: 5, y0: 14, x1: 4 + (i & 1), y1: 15 }, { x0: 11, y0: 14, x1: 12, y1: 15 }], tail: [[3.8, 13], [2.4, 12], [1.8, 10.4], tip] } as CPose; }) },
  { id: 'carry_fish', fps: 8, loop: true, frames: seq(6, (i) => ({ ...gait(i, 6, 'walk'), item: 'fish' as const })) },
  { id: 'carry_leaf', fps: 8, loop: true, frames: seq(6, (i) => ({ ...gait(i, 6, 'walk'), item: 'leaf' as const })) },
  { id: 'jump_up', fps: 8, loop: false, frames: [
    { body: [10, 13.4, 7.4, 2.7], head: [17, 11.5], ear: 'back', legs: [{ x0: 8, y0: 14, x1: 8.5, y1: 15, far: true }, { x0: 15, y0: 14, x1: 16, y1: 15, far: true }, { x0: 6, y0: 14, x1: 5, y1: 15 }, { x0: 13, y0: 14, x1: 14, y1: 15 }], tail: tailLow(0) },
    { body: [8.5, 11, 5, 3.2], body2: [13, 8.6, 4.2, 3], head: [18.5, 5.4], mouth: 'open', legs: [{ x0: 8, y0: 12.5, x1: 5, y1: 15.5, far: true }, { x0: 16, y0: 9, x1: 20.5, y1: 6.5, far: true, paw: true }, { x0: 6, y0: 12.5, x1: 3.5, y1: 15.5 }, { x0: 14, y0: 9.4, x1: 19.5, y1: 7, paw: true }], tail: tailFlat(1) },
    { body: [10, 7.5, 7, 3.2], head: [18, 4.8], legs: [{ x0: 7, y0: 9, x1: 2, y1: 10.5, far: true }, { x0: 16, y0: 8.5, x1: 20.5, y1: 8.4, far: true, paw: true }, { x0: 5, y0: 9.4, x1: 0.5, y1: 11 }, { x0: 14, y0: 8.8, x1: 19.5, y1: 9, paw: true }], tail: [[3, 7.5], [1, 7.6], [-1, 7.8], [-3, 8], [-5, 8.4]] },
    { body: [11, 10.8, 7, 3.4], head: [18.6, 7.8], legs: [{ x0: 8, y0: 12.5, x1: 4, y1: 14.8, far: true }, { x0: 17, y0: 12, x1: 19, y1: 15, far: true, paw: true }, { x0: 6, y0: 12.5, x1: 3, y1: 14.6 }, { x0: 15, y0: 12, x1: 17.5, y1: 15, paw: true }], tail: tailUp(1) },
    { body: [10, 10, 7, 3.7], head: [17, 7], legs: STAND, tail: tailUp(0) }] },
  { id: 'jump_down', fps: 8, loop: false, frames: [
    { body: [10.5, 10.2, 7, 3.6], head: [18.6, 9.6], headMode: 'down', legs: STAND.map((l, n) => (n === 1 || n === 3 ? { ...l, x0: l.x0 + 1.2, x1: l.x1 + 1.6 } : l)), tail: tailUp(0) },
    { body: [10.5, 9.4, 7, 3.3], head: [19, 8.4], mouth: 'open', legs: [{ x0: 8, y0: 11.5, x1: 3, y1: 13, far: true }, { x0: 16, y0: 11, x1: 21, y1: 15.6, far: true, paw: true }, { x0: 6, y0: 11.5, x1: 1.5, y1: 12.6 }, { x0: 14, y0: 11, x1: 19.5, y1: 15.8, paw: true }], tail: tailFlat(0) },
    { body: [10, 13, 7.6, 2.8], head: [17.8, 11.6], ear: 'back', legs: [{ x0: 8, y0: 14, x1: 8, y1: 15, far: true }, { x0: 15, y0: 14, x1: 16, y1: 15, far: true }, { x0: 6, y0: 14, x1: 5, y1: 15 }, { x0: 13, y0: 14, x1: 14, y1: 15 }], tail: tailLow(0) },
    { body: [10, 10, 7, 3.7], head: [17, 7], legs: STAND, tail: tailUp(0) }] },
  { id: 'look_back', fps: 2, loop: true, frames: [{ ...sitBase(), head: [12.8, 5.2], headFlip: true }, { ...sitBase(), head: [12.2, 5.4], headFlip: true, eye: 'slow' }, { ...sitBase(), head: [12.8, 5.2], headFlip: true, ear: 'twitch' }] },
);

/* ───────── 缓冲区：部位 + 明暗级 ───────── */
const CW = 36, CH = 30, SX = 6, SY = 8;
export const CAT_FRAME = { w: CW + 2, h: CH + 2 + 2, ax: SX + 12 + 1, ay: SY + 15 + 1 + 2 };   // 脚点在脚底下 2 行；x 在身体中心稍靠前（与旧版一致，翻转时不跳）
const PART = { body: 1, head: 2, tail: 3, near: 4, far: 5, ear: 6, chest: 7, muzzle: 8, paw: 9 };
type Anchors = { head: [number, number]; mouth: [number, number]; tail: [number, number] };

class Buf {
  lvl = new Int8Array(CW * CH).fill(-1); part = new Uint8Array(CW * CH); aux = new Uint8Array(CW * CH);
  spec: [number, number, RGBA][] = [];
  /** 轮廓之外直接上色的像素（水珠、铃铛、蝴蝶结尾…）与叼着的东西 */
  fxs: [number, number, RGBA][] = [];
  item?: { kind: 'fish' | 'leaf'; x: number; y: number; dr: number };
  constructor(public s = 1) {}
  tx(x: number) { return SX + 10 + (x - 10) * this.s; }
  ty(y: number) { return SY + 15 - (15 - y) * this.s; }
  put(x: number, y: number, lv: number, part: number, aux = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= CW || y >= CH) return;
    const i = y * CW + x; this.lvl[i] = lv; this.part[i] = part; this.aux[i] = aux;
  }
  /** 椭圆体：下沿/下侧深、上方有高光（forceLv 用于口鼻等固定明暗） */
  ell(cx: number, cy: number, rx: number, ry: number, part: number, forceLv?: number) {
    const s = this.s, tcx = this.tx(cx), tcy = this.ty(cy), trx = rx * s, tr_y = ry * s;
    for (let y = Math.floor(tcy - tr_y); y <= Math.ceil(tcy + tr_y); y++) for (let x = Math.floor(tcx - trx); x <= Math.ceil(tcx + trx); x++) {
      const u = (x + 0.5 - tcx) / trx, v = (y + 0.5 - tcy) / tr_y, d2 = u * u + v * v;
      if (d2 > 1) continue;
      let lv = 1;
      if ((v > 0.35 && d2 > 0.45) || (d2 > 0.82 && v > -0.3)) lv = 0;
      else if (v < -0.4 && (u + 0.2) ** 2 * 0.7 + (v + 0.62) ** 2 < 0.2) lv = 2;
      this.put(x, y, forceLv ?? lv, part);
    }
  }
  /** 2 像素宽的线（腿 / 尾） */
  line(x0: number, y0: number, x1: number, y1: number, part: number, lv: number, w = 2, aux = 0) {
    let a = Math.round(this.tx(x0)), b = Math.round(this.ty(y0)); const c = Math.round(this.tx(x1)), d = Math.round(this.ty(y1));
    const dx = Math.abs(c - a), dy = -Math.abs(d - b), sx = a < c ? 1 : -1, sy = b < d ? 1 : -1; let err = dx + dy;
    for (;;) {
      for (let k = 0; k < w; k++) this.put(a + k, b, lv, part, aux);
      if (a === c && b === d) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; a += sx; } if (e2 <= dx) { err += dx; b += sy; }
    }
  }
  stamp(x: number, y: number, n: number, part: number, lv: number, aux: number) { const px = Math.round(this.tx(x)), py = Math.round(this.ty(y)); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.put(px + i, py + j, j === n - 1 && n > 1 && lv === 1 ? 0 : lv, part, aux); }
  sp(x: number, y: number, c: RGBA) { this.spec.push([Math.round(this.tx(x)), Math.round(this.ty(y)), c]); }
  spf(x: number, y: number, c: RGBA) { this.fxs.push([Math.round(this.tx(x)), Math.round(this.ty(y)), c]); }
}

/* ───────── 色板与花纹 ───────── */
function furTones(c: string): RGBA[] {
  const b = hex(c);
  const mix = (a: RGBA, t: RGBA, k: number): RGBA => [a[0] + (t[0] - a[0]) * k, a[1] + (t[1] - a[1]) * k, a[2] + (t[2] - a[2]) * k, 255].map(Math.round) as RGBA;
  const sc = (a: RGBA, f: number): RGBA => [a[0] * f, a[1] * f, a[2] * f, 255].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGBA;
  const light = mix(sc(b, 1.16), [255, 240, 170, 255], 0.16);
  return [mix(sc(b, 0.8), [60, 40, 110, 255], 0.08), b, light, mix(light, [255, 250, 240, 255], 0.5)];
}
type Reg = 'A' | 'B' | 'W' | 'D' | 'P';
interface Ctx { bx: number; by: number; rx: number; ry: number; hx: number; hy: number; tailN: number; front?: boolean; flip?: boolean }

function region(L: CatLook, c: Ctx, p: number, x: number, y: number, aux: number, lv: number): Reg {
  const u = (x + 0.5 - c.bx) / c.rx, v = (y + 0.5 - c.by) / c.ry, seed = L.seed ?? 1;
  const hdx0 = x - c.hx, hdy = y - c.hy, hdx = c.flip ? -hdx0 : hdx0;
  const body = p === PART.body || p === PART.chest;
  const tailRing = aux > 0 && aux % 3 === 0, tailTip = aux >= c.tailN - 1 && c.tailN > 0;
  let r: Reg = 'A';
  const faceMarks = () => (p === PART.head && (c.front ? ((hdy === -2 && Math.abs(hdx) <= 1) || (hdy === -1 && Math.abs(hdx) < 0.6) || (hdy === 1 && Math.abs(hdx) >= 3)) : ((hdy === -3 && Math.abs(hdx) <= 1) || (hdy === -2 && hdx === 0) || (hdy === 1 && hdx <= -2)))) ? 'D' as Reg : null;
  const legBar = (p === PART.near || p === PART.far) && lv !== 3 && y % 3 === 0;
  switch (L.pattern) {
    case 'mackerel': r = (body && v < 0.55 && (x + (y >> 1)) % 3 === 0) || (p === PART.tail && (tailRing || tailTip)) || legBar ? 'D' : (faceMarks() ?? 'A'); break;
    case 'classic': { const e = u * u + ((v + 0.1) * 1.5) ** 2; r = (body && ((e > 0.2 && e < 0.45) || v < -0.62)) || (p === PART.tail && (tailRing || tailTip)) || legBar ? 'D' : (faceMarks() ?? 'A'); break; }
    case 'spotted': r = vnoise(x, y, 2.4, seed) > 0.66 && p !== PART.ear ? 'D' : (faceMarks() ?? 'A'); break;
    case 'ticked': r = (hash2(x, y, seed) < 0.24 && p !== PART.muzzle) || (p === PART.tail && (tailRing || tailTip)) || legBar ? 'D' : (faceMarks() ?? 'A'); break;
    case 'tortie': r = vnoise(x, y, 3.2, seed) > 0.5 ? 'B' : 'A'; if (p === PART.head && hdx > 0.5) r = seed % 2 ? 'A' : 'B'; break;
    case 'calico': { const n = vnoise(x, y, 4.2, seed + 7); r = p === PART.ear || (p === PART.head && hdy < -1) ? (hdx < 0 ? 'A' : 'B') : n > 0.64 ? 'A' : n < 0.28 ? 'B' : 'W'; if (p === PART.tail) r = 'A'; break; }
    case 'van': r = p === PART.ear || (p === PART.head && hdy < 0.5) || p === PART.tail ? 'A' : 'W'; break;
    case 'point': r = p === PART.ear || p === PART.muzzle || (p === PART.head && (c.front ? hdy > -1 && Math.abs(hdx) < 3.2 : hdx > -0.5)) || p === PART.tail || ((p === PART.near || p === PART.far || p === PART.paw) && lv !== -9) ? 'P' : 'A'; break;
    case 'smoke': r = (body && ((v < -0.2 && hash2(x, y, seed) < 0.55) || (v < 0.3 && hash2(x, y, seed + 3) < 0.2))) || (p === PART.tail && (tailTip || hash2(x, y, seed) < 0.3)) || (p === PART.ear) || (p === PART.head && hdy < -2 && hash2(x, y, seed) < 0.6) ? 'D' : 'A'; break;
    default: r = 'A';
  }
  // 白色面积
  const w = L.white ?? 0, leg = p === PART.near || p === PART.far;
  if (w >= 1 && (p === PART.paw || (leg && lv === 3))) r = 'W';
  if (w >= 2 && (p === PART.chest || p === PART.muzzle)) r = 'W';
  if (w >= 3 && (leg || (body && v > 0.3) || (p === PART.head && hdy > 1 && hdx > 0))) r = 'W';
  if (w >= 4 && (body || leg || p === PART.chest || (p === PART.head && hdy > -1.5) || (p === PART.tail && !tailTip))) r = 'W';
  return r;
}

/* ───────── 绘制侧视图 ───────── */
function buildScale(b: CatLook['build']) { return b === 'kitten' ? 0.72 : 1; }
function drawCat(L: CatLook, P: CPose): { buf: Buf; ctx: Ctx; anchors: Anchors } {
  const build = L.build ?? 'normal', buf = new Buf(buildScale(build));
  const bm: [number, number, number] = build === 'chonky' ? [1.18, 1.3, 0.5] : build === 'slim' ? [1, 0.9, -0.2] : [1, 1, 0], hm = build === 'chonky' ? 1.06 : build === 'kitten' ? 1.22 : 1;
  const bodyE = (e: Ell): Ell => [e[0], e[1] + bm[2], e[2] * bm[0], e[3] * bm[1]];
  const mode = P.headMode ?? 'side', dr = P.headFlip ? -1 : 1, [hx, hy] = P.head, fluffy = L.tail === 'fluffy' || L.fur === 'long' || P.puff;
  const tailKind = L.tail ?? 'long';
  // 尾巴
  const drawTail = () => {
    const pts = tailKind === 'bob' ? P.tail.slice(0, 2) : P.tail;
    pts.forEach(([x, y], i) => buf.stamp(x, y, fluffy ? 3 : 2, PART.tail, i >= pts.length - 2 && !fluffy ? 0 : 1, i + 1));
  };
  if (!P.tailFront) drawTail();
  const legsOf = (over: boolean, far: boolean) => P.legs.filter((l) => !!l.over === over && !!l.far === far);
  const drawLeg = (l: Leg) => {
    buf.line(l.x0, l.y0, l.x1, l.y1, l.far ? PART.far : PART.near, l.far ? 0 : 1);
    buf.line(l.x1 - 0.5, l.y1, l.x1 + 0.5, l.y1, l.paw ? PART.paw : l.far ? PART.far : PART.near, 3);   // 脚爪（浅色）
  };
  legsOf(false, true).forEach(drawLeg);
  buf.ell(...bodyE(P.body), PART.body);
  if (P.body2) buf.ell(...bodyE(P.body2), PART.body);
  if (P.chest) buf.ell(P.chest[0], P.chest[1], P.chest[2], P.chest[3], PART.chest, P.bellyUp ? 3 : undefined);
  if (L.fur === 'long') buf.ell(hx - 1.2 * dr, hy + 3, 3.4, 2.6, PART.chest);   // 长毛：胸前的毛领
  legsOf(false, false).forEach(drawLeg);
  if (L.fur === 'long') { // 长毛：腹下参差的毛边、腿后的羽毛
    const bE = bodyE(P.body), bot = bE[1] + bE[3];
    for (let x = Math.round(bE[0] - bE[2] * 0.75); x <= Math.round(bE[0] + bE[2] * 0.75); x++) if (x % 2 === 0) buf.put(buf.tx(x), buf.ty(bot), x % 4 === 0 ? 3 : 0, PART.chest);
    P.legs.forEach((l) => { if (!l.over && l.y1 > 13.5) buf.put(buf.tx(l.x1) + 2, buf.ty(l.y1) - 1, 1, l.far ? PART.far : PART.near); });
  }
  // 头与耳
  const ear = P.ear ?? 'up', earIn: [number, number][] = [];
  for (const s of [-1, 1]) {
    const ex = Math.round(hx + s * 2.2 + 0.5), ey = Math.round(hy - 3.2), tw = ear === 'twitch' && s === 1 ? 1 : 0;
    if (L.ear === 'fold') { // 折耳：贴着头顶、尖端向前下垂的小耳廓
      for (let k = -1; k <= 1; k++) buf.stamp(ex + k, ey - 1.2, 1, PART.ear, 1, 0);
      buf.stamp(ex - dr, ey - 2.2, 1, PART.ear, 1, 0); buf.stamp(ex, ey - 2.2, 1, PART.ear, 1, 0); buf.stamp(ex + dr, ey - 0.2, 1, PART.ear, 0, 0); buf.stamp(ex + 2 * dr, ey + 0.8, 1, PART.ear, 0, 0);
    }
    else if (ear === 'back') { for (let k = 0; k < 3; k++) buf.stamp(ex + dr * (-2 + k + (s > 0 ? 0 : -1)), ey + 1 - (k === 2 ? 1 : 0), 1, PART.ear, 1, 0); }
    else { buf.stamp(ex, ey - 2 - tw, 1, PART.ear, 1, 0); for (let k = -1; k <= 1; k++) { buf.stamp(ex + k, ey - 1 - tw, 1, PART.ear, k === s ? 0 : 1, 0); } buf.stamp(ex - 1, ey, 1, PART.ear, 1, 0); buf.stamp(ex + 1, ey, 1, PART.ear, 1, 0); earIn.push([ex, ey - 0.4 - tw]); if (L.fur === 'long') buf.stamp(ex, ey - 3 - tw, 1, PART.ear, 2, 0); }
  }
  buf.ell(hx, hy, 3.6 * hm, 3.2 * hm, PART.head);
  const noseX = hx + (mode === 'up' ? 2.8 : 3.2) * dr, noseY = mode === 'up' ? hy - 0.2 : mode === 'down' ? hy + 1.4 : hy + 0.8;
  buf.ell(hx + 2.3 * dr, mode === 'down' ? hy + 1.8 : hy + 1.2, 1.7, 1.3, PART.muzzle, 3);
  if (L.fur === 'long') { buf.put(buf.tx(hx - 3.6 * dr), buf.ty(hy + 1.2), 2, PART.head); buf.put(buf.tx(hx - 3 * dr), buf.ty(hy + 2.8), 2, PART.head); buf.put(buf.tx(hx - 2 * dr), buf.ty(hy + 3.8), 1, PART.chest); buf.put(buf.tx(hx - 4 * dr), buf.ty(hy + 2), 1, PART.head); }
  legsOf(true, false).concat(legsOf(true, true)).forEach(drawLeg);
  if (P.tailFront) drawTail();
  // 轮廓之外的细节（直接上色）：耳内、眼、鼻、嘴、配饰
  const pinkEar: RGBA = hex('#f0a0a8'), dark: RGBA = hex('#241a26'), tongue: RGBA = hex('#f08a98');
  const ec = hex(L.eye);
  if (ear !== 'back' && L.ear !== 'fold') earIn.forEach(([x, y]) => buf.sp(x, y, pinkEar));
  const ex = hx + 1.6 * hm * dr, ey = mode === 'up' ? hy - 0.8 : hy - 0.4, E = (dx: number, dy: number, c: RGBA) => buf.sp(ex + dx * dr, ey + dy, c);
  switch (P.eye ?? 'open') {
    case 'closed': E(-1, 0.6, dark); E(0, 0.6, dark); break;
    case 'happy': E(-1, 0.6, dark); E(0, -0.2, dark); E(1, 0.6, dark); break;
    case 'slow': E(-1, 0, ec); E(0, 0, ec); E(-1, -1, dark); E(0, -1, dark); E(1, -0.6, dark); break;
    default: E(-1, -1, ec); E(0, -1, ec); E(-1, 0, ec); E(0, 0, dark); E(-1, -1, hex('#ffffff')); E(1, -1, dark);
  }
  buf.sp(noseX, noseY, hex('#e88a8a'));
  const m = P.mouth ?? 'closed', n1 = noseX - 0.5 * dr, n2 = noseX - 1.5 * dr, n3 = noseX - 1 * dr;
  if (m === 'open' || m === 'big') { buf.sp(n1, noseY + 1.4, dark); buf.sp(n2, noseY + 1.4, dark); if (m === 'big') { buf.sp(n1, noseY + 2.4, dark); buf.sp(n2, noseY + 2.4, dark); buf.sp(n3, noseY + 1.6, tongue); buf.sp(n3, noseY + 2.4, tongue); } else buf.sp(n3, noseY + 1.4, tongue); }
  if (m === 'tongue') { buf.sp(noseX - 0.6 * dr, noseY + 1.2, tongue); buf.sp(noseX - 0.6 * dr, noseY + 2.2, tongue); }
  if (P.item) buf.item = { kind: P.item, x: buf.tx(noseX - 0.5 * dr), y: buf.ty(noseY + 1.4), dr };
  if (L.acc) { // 配饰：颈圈三格厚（上沿提亮），铃铛/蝴蝶结/围巾尾用"轮廓外直接上色"画，不会被身体盖住
    const col = hex(L.accColor ?? '#d6405c'), hi = lighter(col), cx = hx - 1.8 * dr, cy = hy + (mode === 'down' ? 3.4 : 3.0);
    for (let k = 0; k < 4; k++) { const x = cx + k * 0.9 * dr, y = cy + k * 0.45; buf.sp(x, y, hi); buf.sp(x, y + 1, col); buf.sp(x, y + 2, col); }
    const fx = cx + 2.6 * dr, fy = cy + 3.4;
    if (L.acc === 'bell') { buf.spf(fx, fy, hex('#f6d45a')); buf.spf(fx + dr, fy, hex('#c89a2a')); buf.spf(fx, fy + 1, hex('#c89a2a')); buf.spf(fx + dr, fy + 1, hex('#a07a1a')); }
    if (L.acc === 'bow') for (const [dx, dy] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1], [-2, -1.6], [2, -1.6], [-2, 1.4], [2, 1.4]]) buf.spf(fx + dx * dr, fy - 1.2 + dy, dx === 0 && dy === 0 ? hi : col);
    if (L.acc === 'scarf') for (let k = 0; k < 4; k++) { buf.spf(fx - dr, fy - 1 + k, k === 3 ? hi : col); buf.spf(fx, fy - 1 + k, col); }
  }
  const ctx: Ctx = { bx: buf.tx(P.body[0]), by: buf.ty(P.body[1] + bm[2]), rx: P.body[2] * bm[0] * buf.s, ry: P.body[3] * bm[1] * buf.s, hx: buf.tx(hx), hy: buf.ty(hy), tailN: tailKind === 'bob' ? 2 : P.tail.length, flip: !!P.headFlip };
  if (P.fx) P.fx.pts.forEach(([x, y]) => buf.spf(x, y, P.fx!.c));
  const tl = P.tail[tailKind === 'bob' ? 1 : P.tail.length - 1];
  return { buf, ctx, anchors: { head: [buf.tx(hx) + 1, buf.ty(hy) + 1], mouth: [buf.tx(noseX) + 1, buf.ty(noseY + 1.4) + 1], tail: [buf.tx(tl[0]) + 1, buf.ty(tl[1]) + 1] } };
}

/** 渲染一帧侧视猫（朝右）；返回图与锚点（头/嘴/尾尖，输出像素坐标，供爱心、💤、叼着的鱼、气泡挂接） */
export function renderCat(L: CatLook, P: CPose): { img: Img; anchors: Anchors } {
  const { buf, ctx, anchors } = drawCat(L, P);
  return { img: finishCat(L, buf, ctx), anchors };
}
function finishCat(L: CatLook, buf: Buf, ctx: Ctx): Img {
  const pal: Record<Reg, RGBA[]> = {
    A: furTones(L.coat), B: furTones(L.coat2 ?? '#e8a040'), W: furTones('#f6f2ea'),
    D: furTones(L.coat2 && (L.pattern === 'mackerel' || L.pattern === 'classic' || L.pattern === 'spotted' || L.pattern === 'ticked' || L.pattern === 'smoke') ? L.coat2! : darker(L.coat)),
    P: furTones(L.coat2 ?? '#5a4034'),
  };
  const raw = new Img(CW, CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x, lv = buf.lvl[i]; if (lv < 0) continue;
    const r = region(L, ctx, buf.part[i], x, y, buf.aux[i], lv);
    raw.set(x, y, pal[r][Math.min(3, lv)]);
  }
  for (const [x, y, c] of buf.spec) if (raw.alpha(x, y)) raw.set(x, y, c);
  const o = raw.outlinedSoft(0.36, [40, 28, 64, 255]);
  const out = new Img(o.w, o.h + 2);
  for (let y = o.h - 5; y < o.h + 2; y++) for (let x = 2; x < o.w - 2; x++) { // 脚下柔和投影
    const dx = (x + 0.5 - (SX + 11)) / (8.5 * buf.s), dy = (y + 0.5 - (SY + 18.4)) / 1.9;
    if (dx * dx + dy * dy <= 1) out.set(x, y, [28, 36, 66, dx * dx + dy * dy > 0.5 ? 34 : 60]);
  }
  out.blit(o, 0, 0);
  if (buf.item) { // 嘴里叼的东西（带自己的描边）
    const it = itemImg(buf.item.kind), flip = buf.item.dr < 0, img = flip ? mirrorImg(it) : it;
    const x = flip ? buf.item.x - 1 : buf.item.x - it.w + 4, y = buf.item.y - (buf.item.kind === 'leaf' ? it.h - 2 : 1);
    out.blit(img, x + 1, y + 1);
  }
  for (const [x, y, c] of buf.fxs) out.set(x + 1, y + 1, c);
  return out;
}
function mirrorImg(img: Img): Img { const m = new Img(img.w, img.h); for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const c = img.get(img.w - 1 - x, y); if (c[3]) m.set(x, y, c); } return m; }
/** 叼着的鱼（嘴在右端）/ 银杏叶（叶柄在下） */
function itemImg(kind: 'fish' | 'leaf'): Img {
  const rows = kind === 'fish' ? ['tbbbbb.', 'ttbbbEb', 'tbwwwb.'] : ['.yyy.', 'yyyyy', '.yyy.', '..s..'];
  const pal: Record<string, RGBA> = { t: hex('#5a7a98'), b: hex('#8fb0d0'), w: hex('#d6e6f2'), E: hex('#241a26'), y: hex('#e8c040'), s: hex('#8a5a2a') };
  const im = new Img(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) im.set(x, y, pal[ch]); }));
  if (kind === 'leaf') { im.set(0, 1, hex('#c89a20')); im.set(4, 1, hex('#c89a20')); im.set(1, 2, hex('#c89a20')); im.set(3, 2, hex('#c89a20')); }
  return im.outlinedSoft(0.42, [40, 28, 64, 255]);
}
/* ───────── 正面 / 背面视角（朝向镜头走来、面对玩家坐着；背面是走远） ───────── */
export interface FCfg { kind: 'walk' | 'sit' | 'loaf'; bob?: number; lift?: [number, number]; sway?: number; eye?: 'open' | 'closed' | 'slow' | 'happy'; mouth?: 'closed' | 'open'; ear?: 'up' | 'twitch'; hdx?: number; tail: [number, number][] }
export interface FAnim { id: string; fps: number; loop: boolean; back: boolean; frames: FCfg[] }
const ftailW = (sw: number): [number, number][] => [[14, 11], [15, 10], [16, 8.5], [16, 6.5], [15.5 + sw, 5.5]];
const ftailB = (sw: number): [number, number][] => [[10, 9], [10, 7], [10.4, 5], [10, 3.2], [10.4 + sw, 1.6]];
const ftailSit = (f: number): [number, number][] => [[14, 15.5], [15.2, 15.8], [16.6, 15.4], [17.2, 14.2 - f]];
export const CAT_FRONT_ANIMS: FAnim[] = [
  { id: 'walk_down', fps: 8, loop: true, back: false, frames: [0, 1, 2, 3].map((i): FCfg => ({ kind: 'walk', bob: [0, 0.8, 0, 0.8][i], lift: [[0, 0], [1.6, 0], [0, 0], [0, 1.6]][i] as [number, number], sway: [0, 1, 0, -1][i], tail: ftailW([0, 1, 0, -1][i]) })) },
  { id: 'sit_down', fps: 1.4, loop: true, back: false, frames: [{ kind: 'sit', tail: ftailSit(0) }, { kind: 'sit', eye: 'closed', tail: ftailSit(0) }, { kind: 'sit', ear: 'twitch', tail: ftailSit(1) }] },
  { id: 'slow_blink_down', fps: 2, loop: false, back: false, frames: [{ kind: 'sit', tail: ftailSit(0) }, { kind: 'sit', eye: 'slow', tail: ftailSit(0) }, { kind: 'sit', eye: 'closed', tail: ftailSit(0) }, { kind: 'sit', eye: 'slow', tail: ftailSit(0) }] },
  { id: 'meow_down', fps: 4, loop: true, back: false, frames: [{ kind: 'sit', mouth: 'open', tail: ftailSit(0) }, { kind: 'sit', tail: ftailSit(0) }] },
  { id: 'loaf_down', fps: 1, loop: true, back: false, frames: [{ kind: 'loaf', tail: [] }, { kind: 'loaf', bob: 0.4, tail: [] }] },
  { id: 'rub_down', fps: 5, loop: true, back: false, frames: [-2, -1, 1, 2, 1, -1].map((d, i): FCfg => ({ kind: 'walk', bob: 0, sway: 0, hdx: d, eye: 'happy', ear: i % 3 === 2 ? 'twitch' : 'up', lift: [0, 0], tail: ftailW(i % 2) })) },
  { id: 'knead_down', fps: 5, loop: true, back: false, frames: [[0, 0], [1.6, 0], [0, 0], [0, 1.6]].map((l, i): FCfg => ({ kind: 'loaf', lift: l as [number, number], eye: i > 1 ? 'closed' : 'happy', tail: [] })) },
  { id: 'walk_up', fps: 8, loop: true, back: true, frames: [0, 1, 2, 3].map((i): FCfg => ({ kind: 'walk', bob: [0, 0.8, 0, 0.8][i], lift: [[0, 0], [1.6, 0], [0, 0], [0, 1.6]][i] as [number, number], sway: [0, 1, 0, -1][i], tail: ftailB([0, 1, 0, -1][i]) })) },
  { id: 'sit_up', fps: 1.4, loop: true, back: true, frames: [{ kind: 'sit', tail: ftailSit(0) }, { kind: 'sit', ear: 'twitch', tail: ftailSit(1) }] },
];
function drawFront(L: CatLook, C: FCfg, back: boolean): { buf: Buf; ctx: Ctx; anchors: Anchors } {
  const build = L.build ?? 'normal', buf = new Buf(buildScale(build));
  const bm = build === 'chonky' ? [1.25, 1.2] : build === 'slim' ? [0.92, 0.95] : [1, 1], hm = build === 'chonky' ? 1.06 : build === 'kitten' ? 1.22 : 1;
  const sit = C.kind === 'sit', loaf = C.kind === 'loaf', bob = C.bob ?? 0, sway = (C.sway ?? 0) * 0.4;
  const hx = 10 + sway + (C.hdx ?? 0), hy = (sit ? 4.4 : loaf ? 9.2 : 5) - bob * 0.5, by = sit ? 11 : loaf ? 13 : 10 - bob, fluffy = L.tail === 'fluffy' || L.fur === 'long';
  const drawTail = () => { const pts = L.tail === 'bob' ? C.tail.slice(0, 2) : C.tail; pts.forEach(([x, y], i) => buf.stamp(x, y, fluffy && !sit ? 3 : 2, PART.tail, i >= pts.length - 2 && !fluffy ? 0 : 1, i + 1)); };
  if (!back) drawTail();
  if (sit) { buf.ell(6.4, 13.6, 2.8 * bm[0], 2.4, PART.body); buf.ell(13.6, 13.6, 2.8 * bm[0], 2.4, PART.body); }
  else if (!loaf) { buf.ell(6.8, 12.3, 1.8, 2.4, PART.body); buf.ell(13.2, 12.3, 1.8, 2.4, PART.body); }
  const legs = (): void => {
    if (loaf) { const l = C.lift ?? [0, 0]; buf.line(8, 15 - l[0], 9, 15 - l[0], PART.paw, 3); buf.line(11, 15 - l[1], 12, 15 - l[1], PART.paw, 3); return; }
    const l = C.lift ?? [0, 0], x0 = sit ? [8, 10] : [7, 11], y0 = sit ? 11 : by + 2.5, y1 = sit ? 16 : 15;
    [0, 1].forEach((k) => { buf.line(x0[k], y0, x0[k], y1 - l[k], PART.near, 1); buf.line(x0[k], y1 - l[k], x0[k] + 1, y1 - l[k], PART.paw, 3); });
  };
  if (back && sit) { /* 背面坐姿：只有大大的臀 + 脚尖 */ } else legs();
  const bw = (sit ? 4.4 : loaf ? 5.2 : 4) * bm[0], bh = (sit ? 4.8 : loaf ? 3 : 4.6) * bm[1];
  buf.ell(10, by, bw, bh, PART.body);
  if (back && sit) { buf.line(5, 16, 6, 16, PART.paw, 3); buf.line(13, 16, 14, 16, PART.paw, 3); }
  if (!back) buf.ell(10, by - 0.4, sit ? 2.2 : 2, sit ? 3.4 : 3, PART.chest);
  if (L.fur === 'long' && !back) buf.ell(10, hy + 3, 3.4, 2.2, PART.chest);
  if (back) drawTail();
  // 耳朵与头
  const ear = C.ear ?? 'up', earIn: [number, number][] = [];
  for (const s of [-1, 1]) {
    const ex = Math.round(hx + s * 2.6), ey = Math.round(hy - 3.0), tw = ear === 'twitch' && s === 1 ? 1 : 0;
    if (L.ear === 'fold') { buf.stamp(ex - 1, ey + 1, 1, PART.ear, 0, 0); buf.stamp(ex, ey + 1, 1, PART.ear, 1, 0); buf.stamp(ex + 1, ey + 1, 1, PART.ear, 0, 0); buf.stamp(ex, ey + 2, 1, PART.ear, 0, 0); }
    else { buf.stamp(ex, ey - 2 - tw, 1, PART.ear, 1, 0); for (let k = -1; k <= 1; k++) buf.stamp(ex + k, ey - 1 - tw, 1, PART.ear, 1, 0); buf.stamp(ex - 1, ey, 1, PART.ear, 1, 0); buf.stamp(ex + 1, ey, 1, PART.ear, 1, 0); if (!back) earIn.push([ex, ey - 0.4 - tw]); }
  }
  buf.ell(hx, hy, 4.2 * hm, 3.4 * hm, PART.head);
  if (!back) buf.ell(hx, hy + 1.6, 1.9, 1.2, PART.muzzle, 3);
  // 直接上色的细节
  const dark: RGBA = hex('#241a26'), pinkEar: RGBA = hex('#f0a0a8'), tongue: RGBA = hex('#f08a98');
  if (!back) {
    if (L.ear !== 'fold') earIn.forEach(([x, y]) => buf.sp(x, y, pinkEar));
    const eyeAt = (cx: number, cy: number, c: RGBA, mode: NonNullable<FCfg['eye']>) => {
      const E = (dx: number, dy: number, col: RGBA) => buf.sp(cx + dx, cy + dy, col);
      switch (mode) {
        case 'closed': E(-1, 0.6, dark); E(0, 0.6, dark); break;
        case 'happy': E(-1, 0.6, dark); E(0, -0.2, dark); E(1, 0.6, dark); break;
        case 'slow': E(-1, 0, c); E(0, 0, c); E(-1, -1, dark); E(0, -1, dark); break;
        default: E(-1, -1, c); E(0, -1, c); E(-1, 0, c); E(0, 0, dark); E(-1, -1, hex('#ffffff'));
      }
    };
    const e1 = hex(L.eye), e2 = hex(L.eye2 ?? L.eye);
    eyeAt(hx - 1.2, hy + 0.2, e1, C.eye ?? 'open'); eyeAt(hx + 2.8, hy + 0.2, e2, C.eye ?? 'open');
    buf.sp(hx + 0.6, hy + 1.6, hex('#e88a8a'));
    if (C.mouth === 'open') { buf.sp(hx - 0.4, hy + 2.8, dark); buf.sp(hx + 0.6, hy + 2.8, dark); buf.sp(hx - 0.4, hy + 3.8, dark); buf.sp(hx + 0.6, hy + 3.8, dark); buf.sp(hx - 0.4, hy + 3, tongue); buf.sp(hx + 0.6, hy + 3, tongue); }
    else { buf.sp(hx - 0.4, hy + 2.7, dark); buf.sp(hx + 1.6, hy + 2.7, dark); }
  }
  if (L.acc && !back) {
    const col = hex(L.accColor ?? '#d6405c'), cy = hy + 3.9;
    for (let k = -3; k <= 3; k++) { buf.sp(hx + k * 0.9 - 0.4, cy + Math.abs(k) * 0.18, col); }
    if (L.acc === 'bell') buf.sp(hx - 0.4, cy + 1, hex('#f0c84a'));
    if (L.acc === 'bow') { buf.sp(hx + 3.2, hy - 3.6, col); buf.sp(hx + 4.1, hy - 4.4, col); buf.sp(hx + 4.1, hy - 2.8, col); buf.sp(hx + 2.4, hy - 4.4, col); }
    if (L.acc === 'scarf') { buf.sp(hx + 1.6, cy + 1, col); buf.sp(hx + 1.6, cy + 2, col); }
  }
  const tl = C.tail.length ? C.tail[C.tail.length - 1] : [10, 15] as [number, number];
  return { buf, ctx: { bx: buf.tx(10), by: buf.ty(by), rx: bw * buf.s, ry: bh * buf.s, hx: buf.tx(hx), hy: buf.ty(hy), tailN: L.tail === 'bob' ? 2 : C.tail.length, front: true }, anchors: { head: [buf.tx(hx) + 1, buf.ty(hy) + 1], mouth: [buf.tx(hx + 0.6) + 1, buf.ty(hy + 2.6) + 1], tail: [buf.tx(tl[0]) + 1, buf.ty(tl[1]) + 1] } };
}
export function renderCatFront(L: CatLook, C: FCfg, back = false): { img: Img; anchors: Anchors } {
  const { buf, ctx, anchors } = drawFront(L, C, back);
  return { img: finishCat(L, buf, ctx), anchors };
}

const lighter = (c: RGBA): RGBA => [Math.min(255, c[0] + 60), Math.min(255, c[1] + 60), Math.min(255, c[2] + 60), 255];
function darker(c: string) { const b = hex(c); return '#' + [b[0], b[1], b[2]].map((v, i) => Math.round(v * 0.55 + [20, 14, 40][i] * 0.2).toString(16).padStart(2, '0')).join(''); }

/* ───────── 预置毛色（设计文档 §7.5 的图鉴）：名称 → 外观 ───────── */
export const CAT_PRESETS: { name: string; rarity: '常见' | '少见' | '稀有'; look: CatLook }[] = [
  { name: '橘猫', rarity: '常见', look: { coat: '#e8a040', coat2: '#c0702a', pattern: 'mackerel', eye: '#4a8a3a' } },
  { name: '黑猫', rarity: '常见', look: { coat: '#34303c', pattern: 'solid', eye: '#d8d040' } },
  { name: '白猫', rarity: '稀有', look: { coat: '#f4f0e8', pattern: 'solid', eye: '#4a90c8' } },
  { name: '三花', rarity: '常见', look: { coat: '#2c2832', coat2: '#e8a040', pattern: 'calico', eye: '#5a8a3a', seed: 5 } },
  { name: '奶牛', rarity: '常见', look: { coat: '#2c2832', coat2: '#2c2832', pattern: 'calico', eye: '#d0b838', seed: 11 } },
  { name: '灰猫', rarity: '常见', look: { coat: '#8d93a0', coat2: '#6a7080', pattern: 'mackerel', eye: '#d8c040' } },
  { name: '狸花', rarity: '常见', look: { coat: '#8a7054', coat2: '#3a2e28', pattern: 'mackerel', eye: '#c8a838' } },
  { name: '橘白', rarity: '常见', look: { coat: '#e8a040', coat2: '#c0702a', pattern: 'solid', white: 3, eye: '#5a8a3a' } },
  { name: '蓝白', rarity: '常见', look: { coat: '#8d93a0', pattern: 'solid', white: 3, eye: '#d8c040' } },
  { name: '燕尾服', rarity: '常见', look: { coat: '#34303c', pattern: 'solid', white: 2, eye: '#d8d040' } },
  { name: '玳瑁', rarity: '少见', look: { coat: '#2c2832', coat2: '#d8782a', pattern: 'tortie', eye: '#c8a838', seed: 3 } },
  { name: '银渐层', rarity: '少见', look: { coat: '#c8ccd6', coat2: '#8a90a0', pattern: 'smoke', eye: '#6ab088' } },
  { name: '金渐层', rarity: '少见', look: { coat: '#e8c880', coat2: '#b8803a', pattern: 'smoke', eye: '#4a9a6a' } },
  { name: '银虎斑', rarity: '少见', look: { coat: '#b0b4c0', coat2: '#4a4e5c', pattern: 'classic', eye: '#d8c040' } },
  { name: '蓝猫', rarity: '少见', look: { coat: '#7c8698', pattern: 'solid', eye: '#d89a3a', build: 'chonky' } },
  { name: '奶油', rarity: '少见', look: { coat: '#f0d8a8', coat2: '#d8b078', pattern: 'ticked', eye: '#d8b838' } },
  { name: '暹罗', rarity: '稀有', look: { coat: '#eee0c8', coat2: '#5a4034', pattern: 'point', eye: '#4a90d8', build: 'slim' } },
  { name: '布偶', rarity: '稀有', look: { coat: '#f0e6d4', coat2: '#6a5446', pattern: 'point', white: 2, eye: '#4a90d8', fur: 'long' } },
  { name: '异瞳白猫', rarity: '稀有', look: { coat: '#f6f2ea', pattern: 'solid', eye: '#4a90d8', eye2: '#d8b838' } },
  { name: '胖橘', rarity: '常见', look: { coat: '#e8a040', coat2: '#c0702a', pattern: 'mackerel', eye: '#4a8a3a', build: 'chonky', acc: 'bell', accColor: '#d6405c' } },
];

/* ───────── 两只猫互动（成对渲染：两张图按偏移叠放，其中一只镜像） ───────── */
export const PAIR_FRAME = { w: 58, h: CAT_FRAME.h };
export interface PairFrame { a: CPose; b: CPose; ax: number; bx: number; aMirror?: boolean; bMirror?: boolean; front?: 'a' | 'b' }
export interface PairAnim { id: string; fps: number; loop: boolean; frames: PairFrame[] }
const poseOf = (id: string, i: number): CPose => { const a = CAT_ANIMS.find((x) => x.id === id)!; return a.frames[i % a.frames.length]; };
export const PAIR_ANIMS: PairAnim[] = [
  { id: 'groom_each', fps: 3, loop: true, frames: [0, 1, 2, 3].map((i): PairFrame => ({
    a: { ...sitBase(), head: [16.6 + (i & 1) * 0.4, 6.2 + (i & 1) * 0.6], headMode: 'down', eye: 'closed', mouth: i & 1 ? 'tongue' : 'closed' },
    b: { ...sitBase(), head: [15.2, 5.4 + (i & 1) * 0.3], eye: i === 3 ? 'closed' : 'happy', ear: i === 2 ? 'twitch' : 'up' }, ax: 2, bx: 20, bMirror: true })) },
  { id: 'sleep_together', fps: 1, loop: true, frames: [0, 1].map((i): PairFrame => ({ a: poseOf('sleep_curl', i), b: poseOf('sleep_curl', i + 1), ax: 6, bx: 18, bMirror: true, front: 'a' })) },
  { id: 'chase', fps: 12, loop: true, frames: [0, 1, 2, 3].map((i): PairFrame => ({ a: poseOf('run', i), b: poseOf('run', i + 2), ax: 20, bx: 0 })) },
  { id: 'sit_together', fps: 1.4, loop: true, frames: [0, 1, 2, 3].map((i): PairFrame => ({ a: poseOf('sit', i), b: poseOf('sit', i + 1), ax: 14, bx: 2, front: 'a' })) },
];
export function renderPair(La: CatLook, Lb: CatLook, f: PairFrame): Img {
  const out = new Img(PAIR_FRAME.w, PAIR_FRAME.h);
  const A = renderCat(La, f.a).img, B = renderCat(Lb, f.b).img;
  const a = f.aMirror ? mirrorImg(A) : A, b = f.bMirror ? mirrorImg(B) : B;
  if (f.front === 'a') { out.blit(b, f.bx, 0); out.blit(a, f.ax, 0); } else { out.blit(a, f.ax, 0); out.blit(b, f.bx, 0); }
  return out;
}
