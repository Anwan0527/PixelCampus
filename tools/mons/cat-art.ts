/**
 * 猫系精灵的战斗美术：按校园小猫的 20 种毛色（tools/art/cat-rig.ts 的 CAT_PRESETS）程序化画出
 * 每条进化线 3 个阶段 × 正面/背面，共 120 张 64×64：
 *   public/assets/generated/mons/c<毛色两位><a|b|c>-front.png / -back.png
 * 阶段：幼崽（小一号、大头大眼）→ 成年（围一条小围巾）→ 王者（体型最大，戴王冠、披红披风）。
 * 画法：先把每个像素标成"部位 + 明暗级"，再按毛色/花纹给每个像素选色——花纹在不同阶段、不同朝向都跟着身体走。
 *   用法：npx tsx tools/mons/cat-art.ts            生成全部
 *         npx tsx tools/mons/cat-art.ts --preview  另外输出预览图到 .cache/preview/
 */
import { join } from 'node:path';
import { Img, hash2, hex, vnoise, type RGBA } from '../art/px.ts';
import { CAT_PRESETS, type CatLook } from '../art/cat-rig.ts';
import { GEN, CACHE } from '../paths.ts';
import { catSpeciesId } from '../../src/shared/cat-mons.ts';

const W = 62;
const PT = { none: 0, body: 1, head: 2, ear: 3, earIn: 4, tail: 5, paw: 6, cape: 7 } as const;
const OUT = hex('#2a1f2e');

const mix = (a: RGBA, b: RGBA, t: number): RGBA => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), 255];
const DARK: RGBA = [40, 28, 64, 255], WHITE: RGBA = [255, 255, 255, 255];
/** 一种颜色的 4 级明暗：深 / 暗 / 基础 / 亮 */
const tones = (c: string): RGBA[] => { const b = hex(c); return [mix(b, DARK, 0.42), mix(b, DARK, 0.2), b, mix(b, WHITE, 0.2)]; };

class Layers {
  part = new Uint8Array(W * W); tone = new Uint8Array(W * W).fill(2);
  private put(x: number, y: number, part: number, nx: number, ny: number) {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const l = -(nx * 0.55 + ny * 0.85), i = y * W + x;
    this.part[i] = part; this.tone[i] = l > 0.55 ? 3 : l < -0.85 ? 0 : l < -0.4 ? 1 : 2;
  }
  ell(cx: number, cy: number, rx: number, ry: number, part: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) this.put(x, y, part, nx, ny);
    }
  }
  tri(a: [number, number], b: [number, number], c: [number, number], part: number) {
    const minx = Math.floor(Math.min(a[0], b[0], c[0])), maxx = Math.ceil(Math.max(a[0], b[0], c[0])), miny = Math.floor(Math.min(a[1], b[1], c[1])), maxy = Math.ceil(Math.max(a[1], b[1], c[1]));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) this.put(x, y, part, (px - cx) / 8, (py - cy) / 8);
    }
  }
  /** 折线加粗：沿线盖圆 */
  stroke(pts: [number, number][], r0: number, r1: number, part: number) {
    for (let s = 0; s < pts.length - 1; s++) {
      const n = 14;
      for (let k = 0; k <= n; k++) { const t = k / n, x = pts[s][0] + (pts[s + 1][0] - pts[s][0]) * t, y = pts[s][1] + (pts[s + 1][1] - pts[s][1]) * t, r = r0 + (r1 - r0) * ((s + t) / (pts.length - 1)); this.ell(x, y, r, r, part); }
    }
  }
}

interface Geo { s: number; bw: number; hh: number; cx: number; bRx: number; bRy: number; bCy: number; hRx: number; hRy: number; hCy: number }
const geo = (look: CatLook, stage: 1 | 2 | 3, dm = false): Geo => {
  const s = [0.7, 0.88, 1][stage - 1], bw = (look.build === 'chonky' ? 1.18 : look.build === 'slim' ? 0.9 : 1) * (dm ? 1.06 : 1), hh = stage === 1 ? 1.14 : dm ? 1.1 : 1;
  const bRx = 16 * s * bw, bRy = 15.5 * s, bCy = 60 - bRy, hRx = 17 * s * hh, hRy = 13.5 * s * hh, hCy = (60 - 2 * bRy) - hRy * 0.02 + 1;
  return { s, bw, hh, cx: 30.5, bRx, bRy, bCy, hRx, hRy, hCy };
};

function layout(look: CatLook, stage: 1 | 2 | 3, view: 'front' | 'back', dm = false): { L: Layers; g: Geo } {
  const L = new Layers(), g = geo(look, stage, dm), { s, cx } = g;
  const he = 11 * s + 3, fluffy = look.fur === 'long';
  // 披风（王者）：正面在身体两侧露出来，背面盖在身上
  if (!dm && stage === 3 && view === 'front') { L.tri([cx - g.bRx - 4 * s, 56], [cx - g.bRx * 0.4, g.bCy - g.bRy + 6], [cx - g.bRx * 0.3, 58], PT.cape); L.tri([cx + g.bRx + 4 * s, 56], [cx + g.bRx * 0.4, g.bCy - g.bRy + 6], [cx + g.bRx * 0.3, 58], PT.cape); }
  // 尾巴：正面从身体右下绕出来；背面从身体中间竖起来
  const tr = (fluffy ? 3.4 : dm ? 4 : 2.5) * Math.max(0.8, s);
  if (view === 'front') L.stroke([[cx + g.bRx * 0.7, 56], [cx + g.bRx + 4 * s, 53 - 2 * s], [cx + g.bRx + 7 * s, 42 * 1], [cx + g.bRx + 3 * s, 30 + (1 - s) * 10]], tr, tr * 0.85, PT.tail);
  // 身体、脚
  L.ell(cx, g.bCy, g.bRx * (view === 'back' ? 1.05 : 1), g.bRy, PT.body);
  if (fluffy) { L.ell(cx, g.bCy - g.bRy * 0.55, g.bRx * 0.62, g.bRy * 0.4, PT.body); }
  for (const sx of [-1, 1]) L.ell(cx + sx * g.bRx * 0.42, 60 - 3.4 * s, 5.4 * s * g.bw, 3.5 * s, PT.paw);
  if (!dm && stage === 3 && view === 'back') L.ell(cx, g.bCy - 1, g.bRx * 0.92, g.bRy * 0.95, PT.cape);
  // 龙背形态：背面，沿弓起的脊背竖起一排炸开的毛
  if (dm && view === 'back') for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const y0 = g.bCy - g.bRy * 0.62 + k * 7.5, ex = g.bRx * (0.92 - Math.abs(k - 1.2) * 0.04); L.tri([cx + sx * (ex - 4), y0 + 3.6], [cx + sx * (ex - 3), y0 - 4.2], [cx + sx * (ex + 5.5 + (k === 1 ? 2 : 0)), y0 - 5.4], PT.body); }
  // 耳朵（先画，头盖在耳根上）
  for (const sx of [-1, 1]) {
    if (dm) { // 耳朵压平贴在脑袋两侧：从正面看脑袋是圆的
      L.tri([cx + sx * g.hRx * 0.97, g.hCy - g.hRy * 0.05], [cx + sx * g.hRx * 1.08, g.hCy - g.hRy * 0.62], [cx + sx * g.hRx * 0.5, g.hCy - g.hRy * 0.9], PT.ear);
      continue;
    }
    const A: [number, number] = [cx + sx * g.hRx * 0.92, g.hCy - g.hRy * 0.12], B: [number, number] = [cx + sx * g.hRx * 0.66, g.hCy - g.hRy - he * 0.85], C: [number, number] = [cx + sx * g.hRx * 0.12, g.hCy - g.hRy * 0.95];
    L.tri(A, B, C, PT.ear);
    if (view === 'front') { const m: [number, number] = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3], k = 0.5; L.tri([m[0] + (A[0] - m[0]) * k, m[1] + (A[1] - m[1]) * k], [m[0] + (B[0] - m[0]) * k, m[1] + (B[1] - m[1]) * k], [m[0] + (C[0] - m[0]) * k, m[1] + (C[1] - m[1]) * k], PT.earIn); }
  }
  L.ell(cx, g.hCy, g.hRx, g.hRy, PT.head);
  if (fluffy || dm) for (const sx of [-1, 1]) L.ell(cx + sx * g.hRx * 0.82, g.hCy + g.hRy * 0.45, 4.8 * s, 4.8 * s, PT.head); // 颊毛（耄耋：圆圆的大脸盘）
  // 背面的尾巴盖在身体前面
  if (view === 'back') L.stroke([[cx + 5 * s, 58], [cx + 11 * s, 52], [cx + 12 * s, 40], [cx + 9 * s, g.hCy + g.hRy * 0.7]], tr, tr * 0.8, PT.tail);
  return { L, g };
}

/** 一个像素的颜色类别：A 底色 / D 花纹色 / O 橘 / W 白 / P 粉 */
function kindAt(look: CatLook, x: number, y: number, part: number, g: Geo, view: 'front' | 'back'): 'A' | 'D' | 'O' | 'W' | 'P' {
  if (part === PT.earIn) return 'P';
  const seed = look.seed ?? 0, { cx } = g, dx = x - cx;
  const head = part === PT.head || part === PT.ear, body = part === PT.body, tail = part === PT.tail, paw = part === PT.paw;
  const w = look.white ?? 0;
  if (w > 0 && view === 'front') {
    if (paw) return 'W';
    if (w >= 2 && body && Math.abs(dx) < g.bRx * 0.42 && y > g.bCy - g.bRy * 0.4) return 'W';
    if (w >= 2 && part === PT.head && y > g.hCy + g.hRy * 0.25 && Math.abs(dx) < g.hRx * 0.42) return 'W';
    if (w >= 3 && body && y > g.bCy + g.bRy * 0.1) return 'W';
    if (w >= 3 && part === PT.head && Math.abs(dx) < g.hRx * 0.12 && y < g.hCy) return 'W';
    if (w >= 4) return 'W';
  } else if (w > 0) { // 背面：只有爪和尾尖、局部白
    if (paw) return 'W';
    if (w >= 3 && (tail || (body && y > g.bCy + g.bRy * 0.45))) return 'W';
    if (w >= 4) return 'W';
  }
  switch (look.pattern) {
    case 'solid': return 'A';
    case 'mackerel': {
      if (head && view === 'front' && y < g.hCy - g.hRy * 0.35 && Math.abs(dx) < g.hRx * 0.5 && ((x - Math.round(cx)) % 4 === 0)) return 'D';
      if (head && view === 'front' && Math.abs(dx) > g.hRx * 0.62 && y > g.hCy && (y % 4 === 0)) return 'D';
      if (head && view === 'back' && y < g.hCy && ((x + (y >> 1)) % 4 === 0)) return 'D';
      if (body && ((x + (y >> 2)) % 4 === 0) && y < g.bCy + g.bRy * 0.5) return 'D';
      if (tail && (y >> 1) % 3 === 0) return 'D';
      if (paw && (x % 3 === 0)) return 'D';
      return 'A';
    }
    case 'classic': {
      const r = Math.hypot(dx, (y - g.bCy) * 1.1);
      if (body && (Math.abs(r - g.bRx * 0.55) < 1.1 || Math.abs(r - g.bRx * 0.3) < 0.9)) return 'D';
      if (head && view === 'front' && y < g.hCy - g.hRy * 0.3 && Math.abs(dx) < g.hRx * 0.5 && ((x - Math.round(cx)) % 4 === 0)) return 'D';
      if (head && view === 'front' && Math.abs(dx) > g.hRx * 0.6 && y > g.hCy && y % 3 === 0) return 'D';
      if (tail && (y >> 1) % 3 === 0) return 'D';
      return 'A';
    }
    case 'ticked': return hash2(x, y, seed + 9) > 0.7 || (tail && y % 5 === 0) ? 'D' : 'A';
    case 'smoke': return ((part === PT.ear) || tail || paw || (head && y < g.hCy - g.hRy * 0.25) || (body && y < g.bCy - g.bRy * 0.3 && vnoise(x, y, 6, seed) > 0.4)) ? 'D' : 'A';
    case 'point': {
      if (part === PT.ear || paw || tail) return 'D';
      if (head && view === 'front' && Math.abs(dx) < g.hRx * 0.55 && y > g.hCy - g.hRy * 0.35 && y < g.hCy + g.hRy * 0.65) return 'D';
      if (head && view === 'back' && y < g.hCy - g.hRy * 0.4) return 'D';
      return 'A';
    }
    case 'calico': case 'tortie': {
      const n = vnoise(x, y, look.pattern === 'tortie' ? 4 : 9, seed * 31 + 5);
      if (look.pattern === 'tortie') return n < 0.5 ? 'O' : 'A';
      return n < 0.36 ? 'O' : n < 0.62 ? 'W' : 'A';
    }
    default: return 'A';
  }
}

/** 画一只猫的战斗图（64×64，含外轮廓）。stage：1 幼崽 / 2 成年 / 3 王者 */
export function drawCatMon(look: CatLook, stage: 1 | 2 | 3, view: 'front' | 'back', coatIdx = 0, variant?: 'dm'): Img {
  const dm = variant === 'dm';
  const { L, g } = layout(look, stage, view, dm), { s, cx } = g;
  const T: Record<'A' | 'D' | 'O' | 'W' | 'P', RGBA[]> = {
    A: tones(look.coat), D: tones(look.pattern === 'calico' || look.pattern === 'tortie' ? look.coat : look.coat2 ?? '#5a4a4a'), O: tones(look.coat2 ?? '#d8782a'),
    W: tones('#f6f2ea'), P: tones('#e8909a'),
  };
  if (look.pattern === 'calico' || look.pattern === 'tortie') { T.D = tones(look.coat); T.A = tones(look.coat); }
  const cape = tones('#c8333e'), gold = tones('#f2c230');
  const img = new Img(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const part = L.part[y * W + x]; if (!part) continue;
    const tone = L.tone[y * W + x];
    if (part === PT.cape) { img.set(x, y, cape[tone]); continue; }
    img.set(x, y, T[kindAt(look, x, y, part, g, view)][tone]);
  }
  if (view === 'front') {
    // 眼睛、鼻子、嘴、胡须
    const ex = g.hRx * 0.4, ey = g.hCy + g.hRy * 0.02, er = Math.max(2.4, 3.3 * s * (stage === 1 ? 1.3 : 1)), erY = er * (dm ? 0.85 : 1.25);
    for (const sx of [-1, 1]) {
      const iris = hex(sx > 0 && look.eye2 ? look.eye2 : look.eye);
      img.ellipse(cx + sx * ex, ey, er, erY, hex('#fffdf5'));
      img.ellipse(cx + sx * ex, ey + 0.3, er - 0.7, erY - 0.7, iris);
      img.ellipse(cx + sx * ex, ey + 0.4, Math.max(0.9, er * 0.38), erY - 1.1, hex('#1c1420'));
      img.set(cx + sx * ex - 1, ey - erY * 0.45, hex('#ffffff')); if (stage === 1) img.set(cx + sx * ex + 1, ey + 1, hex('#ffffff'));
      if (dm) { // 生气的眉毛：由外向内斜着压下来，把眼睛压成一条凶巴巴的缝
        const bc = hex('#4a2418');
        for (let k = 0; k <= er * 2 + 2; k++) { const bx = cx + sx * (ex + er + 1 - k), by = ey - erY - 2 + Math.round(k * 0.55); img.set(bx, by, bc); img.set(bx, by + 1, bc); }
        for (let k = -er; k <= er; k++) img.set(cx + sx * ex + k, ey - erY * 0.5, bc);
      }
    }
    const ny = g.hCy + g.hRy * 0.42;
    img.rect(cx - 1, ny, 3, 1, hex('#d86a7a')); img.set(cx, ny + 1, hex('#d86a7a'));
    img.set(cx - 2, ny + 3, hex('#3a2a34')); img.set(cx + 2, ny + 3, hex('#3a2a34')); img.hline(cx - 1, ny + 2, 3, hex('#3a2a34')); img.set(cx, ny + 1, hex('#b84a5a'));
    if (dm) { // 哈——！张大嘴露出小尖牙和粉舌头；额头上一个小小的青筋
      img.rect(cx - 4, ny + 3, 9, 5, hex('#3a1420')); img.rect(cx - 2, ny + 6, 5, 2, hex('#e8707e'));
      for (const x of [-4, 4]) { img.set(cx + x, ny + 3, hex('#ffffff')); img.set(cx + x, ny + 4, hex('#ffffff')); }
      img.set(cx - 2, ny + 3, hex('#ffffff')); img.set(cx + 2, ny + 3, hex('#ffffff'));
      const v = hex('#d83a2a'), vx = Math.round(cx + g.hRx * 0.55), vy = Math.round(g.hCy - g.hRy * 0.45); img.hline(vx - 2, vy, 2, v); img.vline(vx - 1, vy - 2, 5, v); img.hline(vx + 1, vy + 2, 2, v);
    }
    const wc = hex('#f4f0e8');
    for (const sx of [-1, 1]) for (const k of [0, 2]) { const y0 = ny + 1 + k; for (let i = 0; i < 7 * Math.max(0.8, s); i++) img.set(cx + sx * (g.hRx * 0.5 + i), y0 - Math.floor(i / 4) * (k ? -1 : 1), wc); }
  } else { // 背面：后脑勺的小旋、耳背
    img.set(cx + 1, g.hCy - g.hRy * 0.55, tones(look.coat)[0]);
  }
  // 脖子上的小装饰：成年 = 围巾（颜色随毛色轮换），胖橘的铃铛项圈；王者 = 披风扣 + 王冠
  const scarfC = tones(['#3a8ad0', '#6ab04a', '#d8603a', '#8a5ac8', '#e0a020', '#3ab0a8'][coatIdx % 6]);
  const neckY = Math.round(g.hCy + g.hRy - 1.5);
  if (!dm && (stage === 2 || look.acc === 'bell')) {
    const c = look.acc === 'bell' ? tones('#d6405c') : scarfC;
    for (let x = Math.round(cx - g.hRx * 0.6); x <= Math.round(cx + g.hRx * 0.6); x++) { const t = (x - cx) / (g.hRx * 0.6), y = neckY + Math.round((1 - t * t) * 1.5); img.set(x, y, c[2]); img.set(x, y + 1, c[1]); }
    if (view === 'front') { img.set(cx, neckY + 2, gold[3]); img.set(cx, neckY + 3, gold[2]); if (stage === 2) { img.set(cx + 4, neckY + 3, c[2]); img.set(cx + 5, neckY + 4, c[2]); img.set(cx + 5, neckY + 5, c[1]); } }
  }
  if (!dm && stage === 3) {
    if (view === 'front') { img.set(cx - 1, neckY + 2, gold[3]); img.set(cx, neckY + 2, gold[3]); img.set(cx - 1, neckY + 3, gold[2]); img.set(cx, neckY + 3, gold[2]); }
    const top = Math.round(g.hCy - g.hRy) - 2, w = 4;
    for (let x = -w; x <= w; x++) img.set(cx + x, top + 5, gold[2]);
    for (let x = -w; x <= w; x++) img.set(cx + x, top + 6, gold[1]);
    for (const x of [-w, 0, w]) { img.set(cx + x, top + 4, gold[3]); img.set(cx + x, top + 3, gold[3]); }
    for (const x of [-w + 2, w - 2]) img.set(cx + x, top + 4, gold[2]);
    img.set(cx, top + 5, hex('#d6405c'));
  }
  const soft = img.outlinedSoft(0.5);
  return soft.w === 64 ? soft : (() => { const o = new Img(64, 64); o.blit(soft, 0, 0); return o; })();
}

const PREVIEW = process.argv.includes('--preview');
const catId = (coat: number, stage: 1 | 2 | 3) => catSpeciesId(coat, stage);
if (process.argv[1]?.endsWith('cat-art.ts')) {
  let n = 0;
  for (let coat = 0; coat < CAT_PRESETS.length; coat++) for (const stage of [1, 2, 3] as const) for (const view of ['front', 'back'] as const) {
    await drawCatMon(CAT_PRESETS[coat].look, stage, view, coat).save(join(GEN, 'mons', `${catId(coat, stage)}-${view}.png`)); n++;
  }
  for (const view of ['front', 'back'] as const) { await drawCatMon({ ...CAT_PRESETS[0].look, build: 'chonky' }, 3, view, 0, 'dm').save(join(GEN, 'mons', `dm-${view}.png`)); n++; } // 耄耋：登录赠送的橘猫
  console.log(`✓ 猫系精灵美术：${CAT_PRESETS.length} 种毛色 × 3 阶段 × 正/背 + 耄耋 = ${n} 张 → ${join(GEN, 'mons')}`);
  if (PREVIEW) {
    { const S = new Img(2 * 66, 66); for (const [k, view] of (['front', 'back'] as const).entries()) S.blit(drawCatMon({ ...CAT_PRESETS[0].look, build: 'chonky' }, 3, view, 0, 'dm'), k * 66 + 1, 1); await S.savePreview(join(CACHE, 'preview', 'cat-mons-dm.png'), 5, '#e6e6dc'); }
    for (const [name, coats] of [['a', [0, 1, 2, 3, 4]], ['b', [5, 6, 7, 8, 9]], ['c', [10, 11, 12, 13, 14]], ['d', [15, 16, 17, 18, 19]]] as [string, number[]][]) {
      const cols = 6, cw = 66, rows = coats.length, S = new Img(cols * cw, rows * cw);
      for (let r = 0; r < rows; r++) for (let st = 0; st < 3; st++) for (let v = 0; v < 2; v++) {
        const im = drawCatMon(CAT_PRESETS[coats[r]].look, (st + 1) as 1 | 2 | 3, v ? 'back' : 'front', coats[r]); S.blit(im, (st * 2 + v) * cw + 1, r * cw + 1);
      }
      await S.savePreview(join(CACHE, 'preview', `cat-mons-${name}.png`), 2, '#e6e6dc');
    }
  }
}
