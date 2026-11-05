/**
 * 人物精灵 v2：16×32 学生，四方向 × 4 帧步行（帧0=站立）。
 * 比例参考星露谷：大头(12×13)、窄身、短腿。颜色由一个基色自动派生 4 阶明暗（暗部偏冷紫、亮部偏暖黄）。
 * 输出每帧 18×34（含 1px 彩色描边）。脚点 = (9, 33)。
 */
import { Img, type RGBA, hex } from './px.ts';

export type Dir = 'down' | 'up' | 'left' | 'right';
export const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
export type HairStyle = 'short' | 'bob' | 'long' | 'ponytail' | 'bun' | 'cap';
export type Top = 'tee' | 'hoodie' | 'jacket' | 'shirt' | 'sweater';
export type Bottom = 'jeans' | 'dark' | 'khaki' | 'skirt' | 'shorts';

export interface CharLook {
  skin: number; hair: string; hairStyle: HairStyle; top: Top; topColor: string; bottom: Bottom; bottomColor?: string;
  glasses?: boolean; bag?: boolean; headphones?: boolean; accent?: string;
}

/** 由基色派生 [暗, 次暗, 基, 亮]：暗部偏紫蓝，亮部偏暖黄 */
function tones(c: string): RGBA[] {
  const b = hex(c);
  const mix = (a: RGBA, t: RGBA, k: number): RGBA => [a[0] + (t[0] - a[0]) * k, a[1] + (t[1] - a[1]) * k, a[2] + (t[2] - a[2]) * k, 255].map(Math.round) as RGBA;
  const sc = (a: RGBA, f: number): RGBA => [a[0] * f, a[1] * f, a[2] * f, 255].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGBA;
  return [mix(sc(b, 0.58), [60, 40, 110, 255], 0.2), mix(sc(b, 0.8), [60, 40, 110, 255], 0.08), b, mix(sc(b, 1.16), [255, 240, 170, 255], 0.16)];
}
const SKINS = ['#f7d3b2', '#f0bf94', '#d9a073', '#a9714a'].map((c) => { const t = tones(c); return { hi: t[3], base: t[2], sh: t[1], dk: t[0], blush: mixB(t[2]) }; });
function mixB(c: RGBA): RGBA { return [Math.min(255, c[0] + 8), Math.max(0, c[1] - 38), Math.max(0, c[2] - 28), 255]; }
const WHITE = hex('#fbf8f0'), EYE = hex('#2a1e2e'), BROW_A = 0.7;
const MOUTH = hex('#b0584c');

function ell(img: Img, cx: number, cy: number, rx: number, ry: number, c: RGBA) { img.ellipse(cx, cy, rx, ry, c); }

function drawHairBack(img: Img, look: CharLook, H: RGBA[], hy: number) {
  // 头发后面的体积（在脸之下先画，露出脑后/侧发）
  ell(img, 8, hy + 6, 6.3, 6.4, H[1]);
  if (look.hairStyle === 'long') { img.rect(2, hy + 6, 12, 11, H[1]); img.rect(2, hy + 15, 12, 2, H[0]); }
  if (look.hairStyle === 'bob') { img.rect(2, hy + 6, 12, 7, H[1]); img.rect(2, hy + 11, 12, 2, H[0]); }
}
function drawHairFront(img: Img, look: CharLook, H: RGBA[], hy: number) {
  const [d, m, b, l] = H;
  // 头顶：圆润盖帽
  ell(img, 8, hy + 3.3, 6.0, 3.9, b);
  img.rect(4, hy + 1, 8, 1, l); img.rect(5, hy, 5, 1, b); img.rect(5, hy + 1, 3, 1, l); img.rect(4, hy + 2, 2, 1, l);
  // 刘海：下缘参差（侧分）
  const fringe = [3, 3, 2, 3, 2, 2, 3, 2];
  for (let i = 0; i < 8; i++) { img.rect(4 + i, hy + 3, 1, fringe[i], i < 3 ? m : b); img.set(4 + i, hy + 2 + fringe[i], m); }
  // 鬓角
  img.rect(2, hy + 4, 2, 4, b); img.rect(12, hy + 4, 2, 4, b); img.vline(2, hy + 4, 4, m); img.vline(13, hy + 4, 4, d);
  // 立体高光带与发丝
  img.set(6, hy + 2, l); img.set(7, hy + 2, l); img.set(10, hy + 3, m); img.set(9, hy + 2, m);
  if (look.hairStyle === 'long') { img.rect(1, hy + 7, 2, 10, b); img.rect(13, hy + 7, 2, 10, b); img.vline(1, hy + 8, 9, m); img.vline(14, hy + 8, 9, d); img.rect(1, hy + 16, 2, 1, d); img.rect(13, hy + 16, 2, 1, d); }
  if (look.hairStyle === 'bob') { img.rect(1, hy + 7, 2, 6, b); img.rect(13, hy + 7, 2, 6, b); img.rect(1, hy + 12, 2, 1, d); img.rect(13, hy + 12, 2, 1, d); }
  if (look.hairStyle === 'bun') { ell(img, 8, hy - 1.5, 3, 2.6, b); img.set(7, hy - 3, l); img.set(8, hy - 3, l); img.set(7, hy - 2, l); }
  if (look.hairStyle === 'cap') {
    const cc = tones(look.accent ?? '#3a5fa0');
    ell(img, 8, hy + 4, 6.2, 4.6, cc[2]); img.rect(2, hy + 4, 12, 2, cc[1]); img.rect(4, hy + 1, 5, 1, cc[3]); img.rect(3, hy + 6, 10, 1, cc[0]);
    img.rect(3, hy + 4, 3, 1, cc[3]); // 帽檐高光
  }
}
function drawFaceFront(img: Img, S: typeof SKINS[number], look: CharLook, hy: number) {
  ell(img, 8, hy + 8, 5, 5.4, S.base);
  img.rect(5, hy + 12, 6, 1, S.sh); // 下巴暗
  img.rect(3, hy + 8, 1, 3, S.base); img.rect(12, hy + 8, 1, 3, S.base); // 耳朵
  img.set(3, hy + 9, S.sh); img.set(12, hy + 9, S.sh);
}
function drawEyesFront(img: Img, S: typeof SKINS[number], hy: number, glasses?: boolean) {
  // 眼睛：2×3，带高光
  img.rect(5, hy + 8, 2, 3, EYE); img.rect(9, hy + 8, 2, 3, EYE);
  img.set(5, hy + 8, WHITE); img.set(9, hy + 8, WHITE);
  img.set(6, hy + 10, [90, 60, 80, 255]); img.set(10, hy + 10, [90, 60, 80, 255]);
  img.rect(4, hy + 11, 2, 1, S.blush); img.rect(10, hy + 11, 2, 1, S.blush);
  img.rect(7, hy + 11, 2, 1, MOUTH);
  // 眼镜：只勾镜框上下缘与外侧，中间留出皮肤（脸只有 8 格宽，满框会像一块蓝面具）
  if (glasses) { const g = hex('#5a6088'); img.hline(4, hy + 7, 4, g); img.hline(8, hy + 7, 4, g); img.hline(4, hy + 11, 4, g); img.hline(8, hy + 11, 4, g); img.vline(4, hy + 8, 3, g); img.vline(11, hy + 8, 3, g); img.hline(7, hy + 8, 2, g); }
}

function drawTorsoFront(img: Img, look: CharLook, ty: number, armSwing: number, S: typeof SKINS[number]) {
  const C = tones(look.topColor), A = tones(look.accent ?? '#e8e4da');
  const [cd, cm, cb, cl] = C;
  // 躯干
  img.rect(4, ty, 8, 9, cb); img.rect(4, ty, 1, 9, cl); img.rect(11, ty, 1, 9, cm); img.rect(4, ty + 8, 8, 1, cm);
  img.rect(5, ty + 1, 2, 3, cl); // 肩部高光
  // 脖子
  img.rect(7, ty - 1, 2, 1, S.sh);
  // 手臂（反向摆动）
  const aL = armSwing, aR = -armSwing;
  img.rect(2, ty + 1 + aL, 2, 6, cm); img.rect(12, ty + 1 + aR, 2, 6, cm);
  img.vline(2, ty + 1 + aL, 6, cd); img.vline(13, ty + 1 + aR, 6, cd);
  img.rect(2, ty + 7 + aL, 2, 2, S.base); img.rect(12, ty + 7 + aR, 2, 2, S.base); img.hline(2, ty + 8 + aL, 2, S.sh); img.hline(12, ty + 8 + aR, 2, S.sh);
  switch (look.top) {
    case 'hoodie': img.rect(5, ty - 1, 6, 2, cm); img.rect(6, ty, 4, 1, cd); img.rect(5, ty + 5, 6, 3, cm); img.hline(5, ty + 5, 6, cd); img.set(7, ty + 2, A[3]); img.set(9, ty + 2, A[3]); img.vline(7, ty + 2, 3, A[2]); img.vline(9, ty + 2, 3, A[2]); break;
    case 'jacket': img.rect(7, ty, 2, 9, A[2]); img.vline(8, ty, 9, A[1]); img.rect(5, ty, 2, 2, cl); img.rect(9, ty, 2, 2, cl); img.hline(4, ty + 7, 8, cd); img.vline(6, ty + 3, 4, cm); img.vline(10, ty + 3, 4, cm); break;
    case 'shirt': img.rect(5, ty, 6, 2, WHITE); img.set(7, ty + 2, WHITE); img.set(8, ty + 2, WHITE); img.vline(8, ty + 2, 6, A[3]); img.rect(7, ty + 1, 2, 5, hex('#c4503c')); img.set(7, ty + 6, hex('#8a2f26')); img.set(8, ty + 6, hex('#8a2f26')); break;
    case 'sweater': img.hline(4, ty + 8, 8, A[2]); img.hline(2, ty + 6, 2, A[2]); img.hline(12, ty + 6, 2, A[2]); for (let x = 5; x < 11; x += 2) img.set(x, ty + 3, cl); img.rect(6, ty, 4, 1, cm); break;
    default: img.rect(6, ty, 4, 1, S.sh); img.hline(4, ty + 8, 8, cm); break; // tee 圆领
  }
  if (look.bag) { img.vline(5, ty, 8, hex('#6f4a2c')); img.vline(10, ty, 8, hex('#6f4a2c')); img.set(5, ty + 8, hex('#a8794a')); img.set(10, ty + 8, hex('#a8794a')); }
}
function drawLegsFront(img: Img, look: CharLook, f: number, S: typeof SKINS[number]) {
  const B = tones(look.bottomColor ?? ({ jeans: '#3f6aa8', dark: '#3a3f55', khaki: '#b89e66', skirt: '#8a5aa8', shorts: '#4a5a78' } as const)[look.bottom]);
  const liftL = f === 1 ? 1 : 0, liftR = f === 3 ? 1 : 0;
  const shoe = hex('#34293a'), sole = hex('#f2eee6');
  if (look.bottom === 'skirt' || look.bottom === 'shorts') {
    const sh = look.bottom === 'skirt' ? 4 : 2;
    img.rect(4, 24, 8, sh, B[2]); img.rect(3, 24 + sh - 1, 10, 1, B[2]); img.hline(4, 24 + sh, 8, B[1]); img.rect(4, 24, 1, sh, B[3]); img.rect(11, 24, 1, sh, B[1]);
    for (let x = 5; x < 11; x += 2) img.vline(x, 25, sh - 1, B[1]);
    const lt = 24 + sh + 1;
    img.rect(5, lt, 2, 29 - lt - liftL + 1, S.base); img.rect(9, lt, 2, 29 - lt - liftR + 1, S.base);
  } else {
    img.rect(4, 24, 4, 5 - liftL, B[2]); img.rect(8, 24, 4, 5 - liftR, B[2]); img.rect(4, 24, 1, 5 - liftL, B[3]); img.rect(11, 24, 1, 5 - liftR, B[1]); img.vline(7, 24, 5 - Math.max(liftL, liftR), B[1]);
    img.hline(4, 24, 8, B[1]);
    if (look.bottom === 'jeans') { img.hline(4, 28 - liftL, 4, B[3]); img.hline(8, 28 - liftR, 4, B[3]); }
  }
  img.rect(4, 29 - liftL, 4, 2, shoe); img.rect(8, 29 - liftR, 4, 2, shoe);
  img.hline(4, 30 - liftL, 4, sole); img.hline(8, 30 - liftR, 4, sole); img.set(5, 29 - liftL, [120, 100, 130, 255]); img.set(9, 29 - liftR, [120, 100, 130, 255]);
}

function drawFront(look: CharLook, f: number, back: boolean): Img {
  const img = new Img(16, 32);
  const S = SKINS[look.skin], H = tones(look.hair);
  const bob = f === 1 || f === 3 ? 1 : 0;
  drawLegsFront(img, look, f, S);
  const body = new Img(16, 32);
  const armSwing = f === 1 ? 1 : f === 3 ? -1 : 0;
  drawTorsoFront(body, look, 16, armSwing, S);
  const hy = 2;
  if (back) {
    drawHairBack(body, look, H, hy);
    ell(body, 8, hy + 8, 5, 5.4, H[2]); // 后脑勺
    body.rect(3, hy + 8, 1, 3, S.base); body.rect(12, hy + 8, 1, 3, S.base);
    drawHairFront(body, look, H, hy); // 复用盖帽
    body.rect(4, hy + 5, 8, 6, H[2]); body.rect(4, hy + 10, 8, 1, H[1]);
    if (look.hairStyle === 'ponytail') { body.rect(7, hy + 10, 2, 7, H[2]); body.rect(7, hy + 16, 2, 1, H[0]); body.vline(8, hy + 11, 5, H[1]); }
    if (look.bag) { body.rect(4, 17, 8, 8, hex('#7a5233')); body.rect(4, 17, 8, 1, hex('#a8794a')); body.rect(5, 19, 6, 3, hex('#6a4528')); body.rect(7, 21, 2, 1, hex('#d8b36a')); body.hline(4, 24, 8, hex('#4a2f1a')); }
  } else {
    drawHairBack(body, look, H, hy);
    drawFaceFront(body, S, look, hy);
    drawHairFront(body, look, H, hy);
    drawEyesFront(body, S, hy, look.glasses);
    if (look.headphones) { const hp = hex('#2f3342'); body.rect(2, hy + 6, 2, 5, hp); body.rect(12, hy + 6, 2, 5, hp); body.hline(3, hy + 1, 10, hp); body.set(2, hy + 7, hex('#6a7090')); body.set(13, hy + 7, hex('#6a7090')); }
  }
  img.blit(body.crop(0, 0, 16, 32), 0, -bob);
  return img;
}

function drawSide(look: CharLook, f: number): Img {
  const img = new Img(16, 32);
  const S = SKINS[look.skin], H = tones(look.hair), C = tones(look.topColor), A = tones(look.accent ?? '#e8e4da');
  const B = tones(look.bottomColor ?? ({ jeans: '#3f6aa8', dark: '#3a3f55', khaki: '#b89e66', skirt: '#8a5aa8', shorts: '#4a5a78' } as const)[look.bottom]);
  const bob = f === 1 || f === 3 ? 1 : 0;
  const stride = f === 1 ? 2 : f === 3 ? -2 : 0;
  const shoe = hex('#34293a'), sole = hex('#f2eee6');
  // 腿：后腿(暗) 前腿
  const skirt = look.bottom === 'skirt', shorts = look.bottom === 'shorts';
  const lt = skirt ? 29 : shorts ? 27 : 25;
  img.rect(6 - stride, lt, 3, 29 - lt + (skirt || shorts ? 0 : 0), skirt || shorts ? S.sh : B[1]); img.rect(6 - stride, 29, 4, 2, shoe); img.hline(6 - stride, 30, 4, sole);
  img.rect(7 + stride, lt, 3, 29 - lt, skirt || shorts ? S.base : B[2]); img.rect(7 + stride, 29, 4, 2, shoe); img.hline(7 + stride, 30, 4, sole); img.set(10 + stride, 29, [120, 100, 130, 255]);
  if (skirt) { img.rect(4, 24, 8, 4, B[2]); img.rect(3, 27, 10, 1, B[2]); img.hline(4, 28, 8, B[1]); }
  if (shorts) { img.rect(5, 24, 6, 3, B[2]); img.hline(5, 26, 6, B[1]); }
  if (look.bottom === 'jeans') { img.hline(6 - stride, 28, 3, B[3]); img.hline(7 + stride, 28, 3, B[3]); }
  // 躯干与手臂
  const body = new Img(16, 32);
  const ty = 16;
  body.rect(5, ty, 6, 9, C[2]); body.vline(5, ty, 9, C[3]); body.vline(10, ty, 9, C[1]); body.hline(5, ty + 8, 6, C[1]);
  if (look.top === 'hoodie') { body.rect(4, ty - 1, 6, 2, C[1]); body.rect(5, ty + 5, 6, 3, C[1]); }
  if (look.top === 'jacket') { body.vline(10, ty, 9, A[2]); body.hline(5, ty + 7, 6, C[0]); }
  if (look.top === 'shirt') { body.rect(9, ty, 2, 2, WHITE); body.vline(10, ty + 2, 5, hex('#c4503c')); }
  if (look.top === 'sweater') { body.hline(5, ty + 8, 6, A[2]); }
  body.rect(6, ty - 1, 3, 1, S.sh);
  if (look.bag) { body.rect(2, ty + 1, 4, 8, hex('#7a5233')); body.rect(2, ty + 1, 4, 1, hex('#a8794a')); body.rect(3, ty + 3, 2, 3, hex('#6a4528')); body.vline(9, ty, 5, hex('#6f4a2c')); }
  const sw = f === 1 ? 2 : f === 3 ? -2 : 0;
  body.rect(7 + sw, ty + 1, 3, 6, C[1]); body.vline(7 + sw, ty + 1, 6, C[3]); body.rect(7 + sw, ty + 7, 3, 2, S.base); body.hline(7 + sw, ty + 8, 3, S.sh);
  // 头（右向侧脸）
  const hy = 2;
  drawHairBackSide(body, look, H, hy);
  ell(body, 9, hy + 8, 4.6, 5.4, S.base);
  body.rect(5, hy + 12, 6, 1, S.sh);
  body.rect(12, hy + 9, 1, 2, S.base); body.set(12, hy + 10, S.sh); // 鼻
  body.rect(10, hy + 8, 2, 3, EYE); body.set(10, hy + 8, WHITE); body.set(10, hy + 10, [90, 60, 80, 255]);
  body.rect(9, hy + 11, 2, 1, S.blush); body.rect(11, hy + 12, 1, 1, MOUTH);
  if (look.glasses) { const g = hex('#8a92c0'); body.rect(9, hy + 7, 4, 1, g); body.vline(9, hy + 7, 5, g); body.vline(12, hy + 7, 5, g); body.hline(9, hy + 11, 4, g); body.hline(3, hy + 8, 6, g); }
  drawHairSide(body, look, H, hy);
  if (look.headphones) { const hp = hex('#2f3342'); body.rect(5, hy + 6, 4, 5, hp); body.hline(5, hy + 1, 8, hp); body.rect(6, hy + 7, 2, 3, hex('#6a7090')); }
  img.blit(body.crop(0, 0, 16, 32), 0, -bob);
  return img;
}
function drawHairBackSide(img: Img, look: CharLook, H: RGBA[], hy: number) {
  ell(img, 7.5, hy + 6.5, 6, 6.4, H[1]);
  if (look.hairStyle === 'long') { img.rect(2, hy + 6, 8, 11, H[1]); img.rect(2, hy + 15, 8, 2, H[0]); }
  if (look.hairStyle === 'bob') { img.rect(2, hy + 6, 8, 7, H[1]); img.rect(2, hy + 11, 8, 2, H[0]); }
  if (look.hairStyle === 'ponytail') { img.rect(1, hy + 6, 3, 10, H[2]); img.rect(1, hy + 15, 3, 1, H[0]); img.vline(2, hy + 7, 8, H[1]); }
}
function drawHairSide(img: Img, look: CharLook, H: RGBA[], hy: number) {
  const [d, m, b, l] = H;
  ell(img, 8, hy + 3.4, 6.1, 4.0, b);
  img.rect(5, hy, 5, 1, b); img.rect(6, hy + 1, 3, 1, l); img.rect(5, hy + 2, 2, 1, l);
  img.rect(3, hy + 4, 5, 5, b); img.vline(3, hy + 5, 4, d); img.rect(4, hy + 5, 2, 3, m); img.hline(3, hy + 9, 5, m);
  // 侧面刘海
  img.rect(8, hy + 3, 4, 2, b); img.rect(10, hy + 5, 2, 1, m);
  if (look.hairStyle === 'long') { img.rect(2, hy + 8, 6, 9, b); img.rect(3, hy + 9, 2, 6, m); img.rect(2, hy + 16, 6, 1, d); }
  if (look.hairStyle === 'bob') { img.rect(2, hy + 8, 6, 5, b); img.rect(2, hy + 12, 6, 1, d); }
  if (look.hairStyle === 'bun') { ell(img, 6, hy - 1.5, 3, 2.6, b); img.set(5, hy - 3, l); img.set(6, hy - 3, l); }
  if (look.hairStyle === 'cap') {
    const cc = tones(look.accent ?? '#3a5fa0');
    ell(img, 8, hy + 4, 6.2, 4.4, cc[2]); img.rect(3, hy + 4, 9, 2, cc[1]); img.rect(10, hy + 5, 5, 1, cc[1]); img.rect(11, hy + 4, 4, 1, cc[3]); img.rect(5, hy + 1, 4, 1, cc[3]);
  }
}

export interface CharFrames { frames: Record<string, Img>; w: number; h: number; ax: number; ay: number }

export function buildCharacter(look: CharLook): CharFrames {
  const frames: Record<string, Img> = {};
  const fin = (raw: Img) => {
    const o = raw.outlinedSoft();
    const out = new Img(o.w, o.h + 2);
    // 脚下柔和投影（只画在空像素上）
    for (let y = o.h - 4; y < o.h + 2; y++) for (let x = 1; x < o.w - 1; x++) {
      const dx = (x + 0.5 - o.w / 2) / 6.2, dy = (y + 0.5 - (o.h - 0.6)) / 2.1;
      if (dx * dx + dy * dy <= 1) out.set(x, y, [28, 36, 66, dx * dx + dy * dy > 0.5 ? 34 : 62]);
    }
    out.blit(o, 0, 0);
    return out;
  };
  for (let f = 0; f < 4; f++) {
    frames[`down_${f}`] = fin(drawFront(look, f, false));
    frames[`up_${f}`] = fin(drawFront(look, f, true));
    const r = fin(drawSide(look, f));
    frames[`right_${f}`] = r;
    const m = new Img(r.w, r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.get(r.w - 1 - x, y); if (c[3]) m.set(x, y, c); }
    frames[`left_${f}`] = m;
  }
  const any = frames['down_0'];
  return { frames, w: any.w, h: any.h, ax: 9, ay: any.h - 3 };
}

/** 预置外观：[0] 为玩家默认，其余为 NPC/他人 */
export const LOOKS: CharLook[] = [
  { skin: 1, hair: '#2f2430', hairStyle: 'short', top: 'hoodie', topColor: '#3f78c0', bottom: 'jeans', bag: true, accent: '#e8e4da' },
  { skin: 0, hair: '#5a3a24', hairStyle: 'long', top: 'sweater', topColor: '#d96a58', bottom: 'skirt', bottomColor: '#4a5a88', accent: '#f4e4c8' },
  { skin: 2, hair: '#241c28', hairStyle: 'short', top: 'jacket', topColor: '#4a7a5a', bottom: 'khaki', glasses: true, accent: '#d8d0b8' },
  { skin: 0, hair: '#d8a84e', hairStyle: 'bun', top: 'tee', topColor: '#f2eee4', bottom: 'skirt', bottomColor: '#8a5aa8', accent: '#e8c8d8' },
  { skin: 3, hair: '#1c1620', hairStyle: 'short', top: 'tee', topColor: '#e8a83a', bottom: 'dark', bag: true, headphones: true },
  { skin: 1, hair: '#a8402f', hairStyle: 'ponytail', top: 'hoodie', topColor: '#8a5aa8', bottom: 'jeans', accent: '#e8d8f0' },
  { skin: 2, hair: '#4a3020', hairStyle: 'cap', top: 'shirt', topColor: '#5a88c8', bottom: 'dark', accent: '#c4503c' },
  { skin: 0, hair: '#8a5a2b', hairStyle: 'bob', top: 'jacket', topColor: '#c08a4a', bottom: 'shorts', accent: '#f0e4cc', glasses: true },
  { skin: 1, hair: '#3a3250', hairStyle: 'long', top: 'tee', topColor: '#58b0a0', bottom: 'jeans', bag: true },
  { skin: 2, hair: '#2a2024', hairStyle: 'bun', top: 'sweater', topColor: '#7a9ad0', bottom: 'skirt', bottomColor: '#3a3f55', accent: '#fff' },
  // 10、11：补两个男生造型，使可选造型男女各 6 个（见 src/shared/profile.ts 的 LOOK_CHOICES）
  { skin: 0, hair: '#3a2a1c', hairStyle: 'short', top: 'sweater', topColor: '#c0584a', bottom: 'jeans', bag: true, accent: '#f0e4cc' },
  { skin: 1, hair: '#1c1620', hairStyle: 'short', top: 'tee', topColor: '#58b0a0', bottom: 'khaki', glasses: true, headphones: true },
];
