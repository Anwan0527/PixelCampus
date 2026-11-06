/**
 * 办公室/社团活动室家具（数学建模协会 214 室等）：蓝色学生桌椅、八边形会议桌、长木桌、文件柜、冰箱、小推车、墙面挂件…
 * 约定同 furniture.ts：脚印 fw×fh（tile，16px），精灵左缘 = 脚印左缘、精灵底边 = 脚印底缘，精灵可以向上超出脚印。
 * fh = 0 的是墙面挂件（空调、字画、白板…）：不占地，摆在北墙的墙面上。
 */
import { Img, Rng, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';
import { DORM_INFO } from './furniture-dorm.ts';
import { DECOR_INFO } from './furniture-decor.ts';

const OUT = PAL.outline;
const W = PAL.wood, M = PAL.metal;
const BL: RGBA[] = ['#2f7fa6', '#4fb0dc', '#7fcfec', '#b5e6f5'].map((c) => hex(c)); // 蓝色塑料
const WH: RGBA[] = ['#8f95a6', '#b8bcc8', '#e6e8ee', '#f6f7fa'].map((c) => hex(c)); // 白/浅灰金属与塑料
const TOP: RGBA[] = ['#a8743f', '#c4905a', '#d8a867', '#e6bd80'].map((c) => hex(c)); // 浅色木桌面
const BOOKS: RGBA[] = ['#b34a3c', '#3f6fae', '#3f9a58', '#e0a53a', '#8a5aa8', '#e8e4da', '#c4503c', '#2f7a8a'].map((c) => hex(c));
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });

/** 蓝色学生桌（1 格）：几张并排 / 2×2 拼成一组 */
export function sdesk(): Furn {
  const img = new Img(16, 20);
  img.rect(0, 2, 16, 9, BL[2]); img.hline(0, 2, 16, BL[3]); img.rect(0, 11, 16, 3, BL[1]); img.hline(0, 13, 16, BL[0]);
  img.rect(1, 14, 2, 5, WH[1]); img.rect(13, 14, 2, 5, WH[1]); img.rect(1, 18, 2, 2, BL[1]); img.rect(13, 18, 2, 2, BL[1]);
  return f(img, 1, 1);
}
/** 蓝色学生椅，朝向 = 坐的人面朝的方向（d 朝南/u 朝北/l 朝西/r 朝东） */
export function bchair(dir: 'd' | 'u' | 'l' | 'r'): Furn {
  const img = new Img(16, 22);
  if (dir === 'd') { img.rect(3, 0, 10, 8, BL[1]); img.rect(6, 2, 4, 2, BL[0]); img.hline(3, 0, 10, BL[2]); img.rect(2, 9, 12, 6, BL[2]); img.hline(2, 9, 12, BL[3]); img.rect(3, 15, 2, 6, WH[1]); img.rect(11, 15, 2, 6, WH[1]); }
  else if (dir === 'u') { img.rect(2, 1, 12, 6, BL[2]); img.hline(2, 1, 12, BL[3]); img.rect(3, 7, 10, 9, BL[1]); img.rect(6, 9, 4, 2, BL[0]); img.hline(3, 15, 10, BL[0]); img.rect(3, 16, 2, 5, WH[1]); img.rect(11, 16, 2, 5, WH[1]); }
  else {
    const back = dir === 'l' ? 12 : 1; // 朝西的椅子靠背在东侧
    img.rect(dir === 'l' ? 2 : 4, 7, 10, 8, BL[2]); img.hline(dir === 'l' ? 2 : 4, 7, 10, BL[3]);
    img.rect(back, 2, 3, 13, BL[1]); img.vline(back, 2, 13, BL[2]);
    img.rect(dir === 'l' ? 3 : 5, 15, 2, 6, WH[1]); img.rect(dir === 'l' ? 9 : 11, 15, 2, 6, WH[1]);
  }
  return f(img, 1, 1);
}
export function stool(): Furn {
  const img = new Img(14, 16);
  img.ellipse(7, 5, 6, 3.5, BL[2]); img.ellipse(7, 4, 6, 3, BL[3]); img.rect(2, 8, 2, 7, WH[1]); img.rect(10, 8, 2, 7, WH[1]); img.rect(6, 8, 2, 7, WH[0]);
  return f(img, 1, 1);
}

function clutter(img: Img, x0: number, y0: number, w: number, seed: number, n = 5) {
  const rng = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng.int(Math.max(1, w - 8)), y = y0 + rng.int(4);
    switch (rng.int(4)) {
      case 0: { const c = rng.pick(BOOKS); img.rect(x, y + 2, 7, 3, c); img.hline(x, y + 2, 7, [Math.min(255, c[0] + 50), Math.min(255, c[1] + 50), Math.min(255, c[2] + 50), 255]); img.rect(x + 1, y, 6, 2, rng.pick(BOOKS)); break; }
      case 1: img.rect(x, y, 3, 6, hex('#cfe8f4')); img.rect(x, y, 3, 1, hex('#3f78c0')); break; // 矿泉水瓶
      case 2: img.rect(x, y + 1, 8, 4, hex('#e8e4da')); img.hline(x, y + 1, 8, hex('#ffffff')); break; // 纸/笔记本
      default: img.rect(x, y, 6, 4, hex('#3a3f4c')); img.rect(x + 1, y + 1, 4, 2, hex('#5f98cc')); break; // 笔记本电脑
    }
  }
}

/** 八边形会议桌（4×2 格脚印）：木桌面 + 灰色金属裙板，桌上堆着书和水瓶 */
export function octable(): Furn {
  const w = 64, h = 52, img = new Img(w, h), c = 12, top = 34;
  for (let y = 0; y < top; y++) {
    const inset = y < c ? c - y : y >= top - c ? y - (top - c - 1) : 0;
    for (let x = inset; x < w - inset; x++) img.set(x, y, (x + y * 2) % 11 === 0 ? TOP[1] : y < 2 ? TOP[3] : TOP[2]);
  }
  img.rect(c, top, w - 2 * c, 3, TOP[1]); img.hline(c, top + 2, w - 2 * c, TOP[0]);
  img.rect(10, top + 3, w - 20, 13, WH[0]); for (const x of [14, 30, 46]) img.rect(x, top + 5, 12, 9, WH[1]); img.hline(10, top + 3, w - 20, WH[2]);
  img.rect(12, h - 2, 3, 2, M[1]); img.rect(w - 15, h - 2, 3, 2, M[1]);
  clutter(img, 8, 6, 48, 7, 7); clutter(img, 12, 18, 40, 9, 4);
  return f(img, 4, 2);
}
/** 长木桌（n×2 格脚印）：浅色木桌面 + 黑色金属腿，桌面零零散散放着东西 */
export function ltable(n: number): Furn {
  const w = n * 16, h = 40, img = new Img(w, h);
  img.rect(0, 0, w, 28, TOP[2]); img.hline(0, 0, w, TOP[3]); for (let x = 5; x < w; x += 13) img.vline(x, 2, 24, TOP[1]);
  img.rect(0, 28, w, 4, TOP[1]); img.hline(0, 31, w, TOP[0]);
  for (const x of [4, w - 8]) { img.rect(x, 32, 4, 8, M[0]); img.rect(x - 1, 38, 6, 2, M[1]); }
  img.rect(Math.floor(w / 2) - 1, 32, 3, 6, M[0]);
  clutter(img, 2, 5, w - 4, n * 13 + 1, n + 2);
  return f(img, n, 2);
}
/** 四门文件柜（灰白色，上半玻璃门、下半铁门） */
export function cab4(): Furn {
  const img = new Img(48, 36);
  img.rect(0, 0, 48, 36, hex('#d4d8de')); img.hline(0, 0, 48, WH[3]);
  for (let i = 0; i < 4; i++) {
    const x = 1 + i * 12;
    img.rect(x, 2, 10, 17, hex('#9fb6c8')); img.rect(x, 2, 10, 2, hex('#b9cbd8'));
    for (let k = 0; k < 4; k++) img.rect(x + 1 + k * 2, 8 + (k % 2) * 2, 1, 8 - (k % 2) * 2, BOOKS[(i + k) % BOOKS.length]);
    img.rect(x, 21, 10, 13, hex('#c3c8d0')); img.rect(x + (i % 2 ? 1 : 8), 25, 1, 5, M[1]);
  }
  img.hline(0, 35, 48, WH[0]);
  return f(img, 3, 1);
}
/** 双门柜（米黄色，带编号牌） */
export function cab2(): Furn {
  const img = new Img(32, 36);
  img.rect(0, 0, 32, 36, hex('#d9cf9e')); img.hline(0, 0, 32, hex('#ece4b8'));
  for (let i = 0; i < 2; i++) { const x = 1 + i * 15; img.rect(x, 2, 13, 17, hex('#a8b8b0')); img.rect(x, 2, 13, 2, hex('#c4d2cb')); img.rect(x, 21, 13, 13, hex('#c9bf8c')); img.rect(x + (i ? 1 : 11), 25, 1, 5, M[1]); }
  img.rect(20, 5, 9, 7, hex('#f4f2ea')); img.hline(21, 7, 7, hex('#3a3f4c')); img.hline(21, 9, 5, hex('#3a3f4c'));
  img.hline(0, 35, 32, hex('#8a7f58'));
  return f(img, 2, 1);
}
/** 冰箱（黑色双门） */
export function fridge(): Furn {
  const img = new Img(16, 38);
  img.rect(1, 0, 14, 37, hex('#2c2f3a')); img.vline(1, 0, 37, hex('#454a5a')); img.hline(1, 0, 14, hex('#454a5a')); img.hline(1, 14, 14, hex('#14161e'));
  img.rect(12, 5, 1, 6, M[3]); img.rect(12, 18, 1, 9, M[3]); img.rect(3, 30, 10, 3, hex('#3a3f4c'));
  return f(img, 1, 1);
}
/** 带杂物的木桌（2×1），靠墙放的办公桌 */
export function deskw(): Furn {
  const img = new Img(32, 30);
  img.rect(0, 8, 32, 6, W[3]); img.hline(0, 8, 32, W[4]); img.hline(0, 13, 32, W[2]);
  img.rect(1, 14, 30, 12, W[2]); img.rect(2, 15, 12, 10, W[1]); img.rect(18, 15, 12, 10, W[1]); img.rect(7, 19, 2, 2, W[4]); img.rect(23, 19, 2, 2, W[4]);
  img.rect(1, 26, 3, 3, W[0]); img.rect(28, 26, 3, 3, W[0]);
  clutter(img, 2, 2, 28, 21, 5);
  return f(img, 2, 1);
}
/** 绿色塑料椅（现代造型） */
export function gchair(): Furn {
  const img = new Img(16, 22);
  img.ellipse(8, 5, 7, 5, hex('#5fb84e')); img.ellipse(8, 4, 6, 4, hex('#7fd46a')); img.rect(3, 8, 10, 5, hex('#5fb84e')); img.rect(3, 13, 2, 7, W[3]); img.rect(11, 13, 2, 7, W[3]); img.rect(7, 13, 2, 7, W[2]);
  return f(img, 1, 1);
}
/** 白色三层小推车 */
export function cart(): Furn {
  const img = new Img(16, 30);
  img.rect(1, 2, 14, 24, hex('#f2f3f6')); for (const y of [2, 12, 22]) { img.rect(1, y, 14, 3, WH[1]); img.hline(1, y, 14, WH[3]); }
  img.rect(2, 5, 4, 6, hex('#e0a53a')); img.rect(9, 6, 4, 5, hex('#c4503c')); img.rect(3, 15, 9, 6, hex('#e8e4da'));
  img.rect(1, 26, 2, 3, M[1]); img.rect(13, 26, 2, 3, M[1]);
  return f(img, 1, 1);
}
/** 折叠露营椅 */
export function campchair(): Furn {
  const img = new Img(16, 20);
  img.rect(2, 2, 12, 6, hex('#3a3f4c')); img.rect(1, 8, 14, 5, hex('#4a5062')); img.hline(1, 8, 14, hex('#6a7284')); img.rect(2, 13, 2, 6, M[1]); img.rect(12, 13, 2, 6, M[1]);
  return f(img, 1, 1);
}
/** 一袋矿泉水 / 绿盆 / 书堆 / 笔记本电脑 / 保温壶：桌上或地上的小件（top 摆放时压在桌面上） */
export function waterpack(): Furn {
  const img = new Img(16, 14);
  img.rect(1, 2, 14, 11, hex('#dcecf6')); img.hline(1, 2, 14, hex('#ffffff')); for (let i = 0; i < 4; i++) img.rect(2 + i * 3, 5, 2, 7, hex('#bcd8ec')); img.rect(3, 7, 10, 3, hex('#3f78c0'));
  return f(img, 1, 1);
}
export function basin(): Furn {
  const img = new Img(14, 8);
  img.ellipse(7, 4, 6.5, 3.5, hex('#8fd0a0')); img.ellipse(7, 4, 5, 2.4, hex('#b4e6c0'));
  return f(img, 1, 1);
}
export function books(): Furn {
  const img = new Img(12, 10);
  for (let i = 0; i < 3; i++) img.rect(0 + (i % 2), 6 - i * 3, 11 - (i % 2) * 2, 3, BOOKS[(i * 3 + 1) % BOOKS.length]);
  return f(img, 1, 1);
}
export function laptop(): Furn {
  const img = new Img(14, 12);
  img.rect(1, 0, 12, 7, hex('#3a3f4c')); img.rect(2, 1, 10, 5, hex('#5f98cc')); img.rect(0, 8, 14, 3, hex('#a6adbd'));
  return f(img, 1, 1);
}
export function thermos(): Furn {
  const img = new Img(8, 14);
  img.rect(1, 2, 6, 11, hex('#e8e4da')); img.rect(1, 0, 6, 3, hex('#c4503c')); img.vline(6, 3, 10, hex('#b8bcc8'));
  return f(img, 1, 1);
}
/** 暖气片（2 格宽，贴在窗下） */
export function radiator(): Furn {
  const img = new Img(32, 14);
  img.rect(0, 0, 32, 3, WH[2]); for (let x = 1; x < 31; x += 3) { img.rect(x, 3, 2, 9, WH[3]); img.vline(x + 1, 3, 9, WH[1]); }
  img.rect(0, 12, 32, 2, WH[0]);
  return f(img, 2, 1);
}
// ---- 墙面挂件（fh = 0）
export function ac(): Furn {
  const img = new Img(34, 13);
  img.rect(0, 0, 34, 12, hex('#f4f5f8')); img.hline(0, 0, 34, hex('#ffffff')); img.hline(0, 10, 34, WH[1]); img.rect(2, 7, 30, 1, WH[1]); img.rect(26, 3, 5, 2, hex('#3f9a58')); img.rect(3, 3, 8, 2, WH[1]);
  return f(img, 2, 0);
}
export function scroll(): Furn { // 字画：纸 + 木轴，字由文字牌（furniture.text，竖排）盖在上面
  const img = new Img(14, 38);
  img.rect(0, 0, 14, 2, W[1]); img.rect(1, 2, 12, 32, hex('#efe6cc')); img.rect(0, 34, 14, 3, W[1]);
  img.rect(10, 30, 2, 2, hex('#c4503c'));
  return f(img, 1, 0);
}
export function banner(): Furn { // 横幅：白纸，字由文字牌（furniture.text）盖在上面
  const img = new Img(64, 14);
  img.rect(0, 0, 64, 13, hex('#f4f2ea')); img.hline(0, 0, 64, hex('#ffffff')); img.hline(0, 12, 64, hex('#cfc9b8'));
  return f(img, 4, 0);
}
export function whiteboard(): Furn {
  const img = new Img(50, 28);
  img.rect(0, 0, 50, 26, hex('#c4c8d2')); img.rect(2, 2, 46, 22, hex('#f6f8fa')); img.rect(0, 26, 50, 2, WH[0]);
  for (let i = 0; i < 5; i++) img.hline(6 + i * 2, 7 + i * 3, 14 + (i % 3) * 6, hex('#3f6fae'));
  return f(img, 3, 0);
}
export function hookbag(): Furn {
  const img = new Img(12, 20);
  img.rect(5, 0, 2, 3, M[2]); img.rect(1, 6, 10, 13, hex('#3f9a58')); img.rect(1, 6, 10, 2, hex('#2f7a44')); img.rect(3, 10, 6, 5, hex('#e8e4da')); img.rect(4, 8, 4, 2, hex('#2f7a44'));
  return f(img, 1, 0);
}
export function rope(): Furn {
  const img = new Img(10, 32);
  img.rect(4, 0, 2, 3, M[2]); for (let y = 3; y < 30; y += 2) { img.set(3 + (y % 4 === 1 ? 1 : 0), y, hex('#2a2a33')); img.set(5 - (y % 4 === 1 ? 1 : 0), y, hex('#3a3f4c')); img.set(4, y + 1, hex('#2a2a33')); }
  return f(img, 1, 0);
}

export const OFFICE_FURNITURE: Record<string, () => Furn> = {
  sdesk, bchair_d: () => bchair('d'), bchair_u: () => bchair('u'), bchair_l: () => bchair('l'), bchair_r: () => bchair('r'), stool,
  octable, ltable3: () => ltable(3), ltable4: () => ltable(4), ltable5: () => ltable(5), ltable6: () => ltable(6),
  cab4, cab2, fridge, deskw, gchair, cart, campchair, waterpack, basin, books, laptop, thermos, radiator,
  ac, scroll, banner, whiteboard, hookbag, rope,
};

/** 编辑器里的家具目录：中文名 + 分类（key → 名称/分类）。分类顺序 = 面板顺序 */
export const FURN_CATS = ['桌椅', '柜子电器', '小件', '墙面挂件', '图书馆', '食堂', '其他'] as const;
/** 能在上面写字的家具：h 横排 / v 竖排，及新摆时的默认文字 */
export const FURN_TEXT: Record<string, { mode: 'h' | 'v'; def: string }> = { banner: { mode: 'h', def: '横幅文字' }, scroll: { mode: 'v', def: '天道酬勤' }, whiteboard: { mode: 'h', def: '' } };
export const FURN_INFO: Record<string, { name: string; cat: (typeof FURN_CATS)[number]; top?: boolean }> = {
  sdesk: { name: '蓝色学生桌', cat: '桌椅' }, bchair_d: { name: '蓝椅·朝南', cat: '桌椅' }, bchair_u: { name: '蓝椅·朝北', cat: '桌椅' }, bchair_l: { name: '蓝椅·朝西', cat: '桌椅' }, bchair_r: { name: '蓝椅·朝东', cat: '桌椅' }, stool: { name: '蓝凳子', cat: '桌椅' },
  octable: { name: '八边形会议桌', cat: '桌椅' }, ltable3: { name: '长木桌(3格)', cat: '桌椅' }, ltable4: { name: '长木桌(4格)', cat: '桌椅' }, ltable5: { name: '长木桌(5格)', cat: '桌椅' }, ltable6: { name: '长木桌(6格)', cat: '桌椅' },
  deskw: { name: '木办公桌(带杂物)', cat: '桌椅' }, gchair: { name: '绿色椅子', cat: '桌椅' }, campchair: { name: '折叠椅', cat: '桌椅' }, desk: { name: '木书桌', cat: '桌椅' }, deskpc: { name: '木桌+电脑', cat: '桌椅' },
  chair: { name: '木椅·朝南', cat: '桌椅' }, chairup: { name: '木椅·朝北', cat: '桌椅' }, table2: { name: '木桌2', cat: '桌椅' }, table3: { name: '木桌3×2', cat: '桌椅' }, table4: { name: '木桌4×2', cat: '桌椅' }, cantable: { name: '食堂餐桌', cat: '食堂' },
  cab4: { name: '四门文件柜', cat: '柜子电器' }, cab2: { name: '双门柜', cat: '柜子电器' }, fridge: { name: '冰箱', cat: '柜子电器' }, cart: { name: '小推车', cat: '柜子电器' }, radiator: { name: '暖气片', cat: '柜子电器' }, bin: { name: '垃圾桶', cat: '柜子电器' }, plant: { name: '绿植', cat: '柜子电器' }, sofa: { name: '沙发', cat: '柜子电器' }, podium: { name: '讲台', cat: '柜子电器' },
  waterpack: { name: '一袋矿泉水', cat: '小件', top: true }, basin: { name: '绿盆', cat: '小件', top: true }, books: { name: '书堆', cat: '小件', top: true }, laptop: { name: '笔记本电脑', cat: '小件', top: true }, thermos: { name: '保温壶', cat: '小件', top: true },
  ac: { name: '空调', cat: '墙面挂件' }, scroll: { name: '字画（竖）', cat: '墙面挂件' }, banner: { name: '横幅', cat: '墙面挂件' }, whiteboard: { name: '白板', cat: '墙面挂件' }, hookbag: { name: '挂着的袋子', cat: '墙面挂件' }, rope: { name: '挂绳', cat: '墙面挂件' },
  shelf1: { name: '书架1', cat: '图书馆' }, shelf2: { name: '书架2', cat: '图书馆' }, shelf3: { name: '书架3', cat: '图书馆' }, shelf4: { name: '书架4', cat: '图书馆' },
  counter3: { name: '柜台3', cat: '食堂' }, counter5: { name: '柜台5', cat: '食堂' }, foodcounter5: { name: '打饭窗口5', cat: '食堂' }, foodcounter7: { name: '打饭窗口7', cat: '食堂' },
  ...DORM_INFO, // 宿舍家具（单人床/衣柜/宝箱…），画在 furniture-dorm.ts
  ...DECOR_INFO, // 宿舍商店卖的装饰家具，画在 furniture-decor.ts
};
