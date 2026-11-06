/**
 * 桌子与桌面小件的转向贴图（规则见 turn.ts）：90 = 朝西、180 = 朝北、270 = 朝东；脚印是转向后的占地。
 * 画法：不是把正面图转一下，而是按真实形状重画——朝北看到的是背板 / 显示器后壳，朝西朝东是竖放的长桌（桌面是往上延伸的一条，
 * 一端是侧板和桌腿），抽屉、显示器、笔记本屏幕朝哪边，就把它们画在哪边。
 *
 * 桌面小件的高度约定：小件摆在转向后脚印的第 j 行（从最北一行起数），贴图被抬高 8·j + lift 像素，它的底边落在
 * 桌面贴图的 H − 16·N + 16 − lift + 8·j 处（H = 桌子贴图的高，N = 转向后的行数）。每一张桌面贴图都按这个高度铺了桌面，
 * 竖放的桌子桌面深度 = 8·N（一行 8 像素，和这个约定一致），所以小件放在哪一格都落在桌面上。
 * 每个 *Side / *Back 函数先画「原始」图（Img），再 .outlined 描边；朝东 = 朝西的左右镜像。
 */
import { Img, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';
import type { ViewMap } from './turn.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const c = (s: string): RGBA => hex(s);
const LT: RGBA[] = ['#b98350', '#d6a56c', '#e8c288', '#f6e0b0'].map(c); // 浅色木头（同 furniture-decor.ts）
const K = c('#2b2e40'), KS = c('#3a3f52'), KD = c('#1d1f28'), SCREEN = c('#5f98cc'), SCREEN_HI = c('#9cc4e8');
const PAPER = c('#e8e4da'), RED = c('#c4503c'), BLUE = c('#3f6fae');

const fin = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });
/** 左右镜像（朝东 = 朝西镜像过来） */
function mirror(src: Img): Img {
  const o = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) o.set(src.w - 1 - x, y, src.get(x, y));
  return o;
}
/** 给「朝西」的原始图，生成朝西 / 朝东两个 Furn */
const side = (west: Img, fw: number, fh: number) => ({ 90: () => fin(west, fw, fh), 270: () => fin(mirror(west), fw, fh) });

// ------------------------------------------------------------------ 木书桌（深色木）：desk / deskpc，2×1，lift 12
/** 小显示器的侧影：屏幕朝左（朝西），竖着一块薄板，下面一根脖子和底座；ox,oy = 脖子底端的位置 */
function monitorSide(img: Img, ox: number, oy: number) {
  img.rect(ox - 1, oy - 11, 3, 10, K); img.vline(ox - 2, oy - 10, 8, SCREEN); img.vline(ox - 2, oy - 10, 1, SCREEN_HI); img.vline(ox + 1, oy - 10, 8, KS); // 薄板 + 屏幕边 + 后壳高光
  img.rect(ox - 1, oy - 1, 2, 2, K); img.hline(ox - 4, oy + 1, 8, K); // 脖子 + 底座
}
/** 竖放的书桌（1×2）：画成朝西——抽屉在西边（左），桌面是一条往上延伸的长桌面，南端是侧板和两条腿 */
function deskSideRaw(pc: boolean): Img {
  const oy = pc ? 11 : 0, img = new Img(16, 32 + oy);
  img.rect(0, oy, 16, 17, W[3]); img.hline(0, oy, 16, W[4]); img.vline(15, oy + 1, 16, W[2]); img.hline(0, oy + 16, 16, W[2]);
  for (const y of [oy + 6, oy + 11]) img.hline(4, y, 10, W[2]); // 木纹（沿长边）
  // 西边的两个抽屉脸（从侧面看是窄窄的一条，带小拉手）
  img.rect(0, oy + 2, 3, 6, W[1]); img.rect(0, oy + 9, 3, 6, W[1]); img.vline(3, oy + 2, 13, W[2]); img.hline(0, oy + 2, 3, W[2]); img.hline(0, oy + 9, 3, W[2]); img.set(1, oy + 5, W[4]); img.set(1, oy + 12, W[4]);
  // 南端侧板：桌面下的边框 + 嵌板 + 两条腿
  img.rect(0, oy + 17, 16, 10, W[2]); img.hline(0, oy + 17, 16, W[1]);
  img.rect(2, oy + 19, 12, 6, W[1]); img.hline(2, oy + 19, 12, W[0]); img.hline(2, oy + 24, 12, W[3]); img.vline(2, oy + 20, 4, W[0]);
  img.rect(0, oy + 27, 3, 5, W[0]); img.rect(13, oy + 27, 3, 5, W[0]);
  if (pc) monitorSide(img, 9, oy + 3);
  else { img.rect(6, 3, 6, 3, PAPER); img.rect(7, 9, 5, 4, RED); } // 和正面一样，桌上随手放着本子和书
  return img;
}
/** 书桌背面（朝北）：和正面同样的外形，只是看到的是背板（竖木条）；电脑桌看到显示器后壳和一根垂下来的线 */
function deskBackRaw(pc: boolean): Img {
  const img = new Img(32, 26);
  img.rect(0, 6, 32, 6, W[3]); img.hline(0, 6, 32, W[4]); img.hline(0, 11, 32, W[2]);
  img.rect(1, 12, 30, 10, W[2]); img.rect(2, 13, 28, 8, W[1]); img.hline(2, 13, 28, W[2]);
  for (let x = 6; x < 30; x += 5) img.vline(x, 14, 7, W[0]); // 背板的木条缝
  img.rect(1, 22, 3, 3, W[0]); img.rect(28, 22, 3, 3, W[0]);
  if (pc) {
    img.rect(10, 0, 12, 8, KS); img.hline(10, 0, 12, M[2]); img.vline(10, 1, 7, K); img.vline(21, 1, 7, K); // 后壳
    img.hline(13, 3, 6, KD); img.hline(13, 5, 6, KD); img.rect(14, 8, 4, 2, K); // 散热孔、脖子
    img.vline(24, 9, 12, KD); img.set(23, 20, KD); img.set(25, 20, KD); // 垂下来的线
  } else { img.rect(22, 3, 6, 3, PAPER); img.rect(5, 2, 5, 4, RED); }
  return img;
}

// ------------------------------------------------------------------ 小木桌：table2，2×1，lift 12（原图 32×30：桌面 0..19，边框 20..25，腿 26..29）
function table2SideRaw(): Img {
  const img = new Img(16, 34);
  img.rect(0, 0, 16, 24, W[3]); img.hline(0, 0, 16, W[4]); img.vline(0, 1, 23, W[4]); img.vline(15, 1, 23, W[2]);
  img.rect(2, 3, 6, 3, PAPER); img.rect(8, 15, 6, 4, BLUE); img.rect(3, 18, 5, 3, RED); // 桌上的东西
  img.rect(0, 24, 16, 6, W[2]); img.hline(0, 24, 16, W[1]); img.hline(0, 29, 16, W[1]); // 南端边框
  img.rect(2, 26, 12, 2, W[1]); // 侧面的横撑
  img.rect(2, 30, 3, 4, W[0]); img.rect(11, 30, 3, 4, W[0]);
  return img;
}
function table2BackRaw(): Img {
  const img = new Img(32, 30);
  img.rect(0, 0, 32, 20, W[3]); img.hline(0, 0, 32, W[4]);
  img.rect(10, 2, 6, 3, PAPER); img.rect(21, 4, 7, 4, RED); img.rect(5, 5, 6, 4, BLUE);
  img.rect(0, 20, 32, 6, W[2]); img.hline(0, 25, 32, W[1]);
  for (let x = 4; x < 30; x += 6) img.vline(x, 21, 4, W[1]); // 背面的竖板条
  img.rect(2, 26, 3, 4, W[0]); img.rect(27, 26, 3, 4, W[0]);
  return img;
}

// ------------------------------------------------------------------ 浅色书桌 / 长桌：dc_dtable（2×2，原图 32×46）、dc_dtable3（3×2，原图 48×46）；lift 0
/** 浅色桌：w 宽，N 行深，H 高；变体 style：back = 背面（背板条 + 横撑）、drawer = 侧面带抽屉、rail = 侧面带横撑 */
function lightTable(w: number, h: number, style: 'back' | 'drawer' | 'rail', grain: 'v' | 'h'): Img {
  const img = new Img(w, h), top = h - 10;
  img.rect(0, 0, w, top, LT[2]); img.hline(0, 0, w, LT[3]); img.hline(0, 1, w, LT[3]);
  if (grain === 'v') for (let x = 7; x < w - 2; x += 11) img.vline(x, 3, top - 6, LT[1]);
  else for (let y = 5; y < top - 2; y += 7) img.hline(2, y, w - 4, LT[1]); // 木纹转成横向
  img.rect(0, top, w, 5, LT[1]); img.hline(0, top, w, LT[3]); img.hline(0, top + 4, w, LT[0]);
  img.rect(2, top + 5, 3, 5, W[1]); img.rect(w - 5, top + 5, 3, 5, W[1]);
  if (style === 'back') { for (let x = 6; x < w - 5; x += 4) img.vline(x, top + 1, 3, LT[0]); img.rect(5, top + 7, w - 10, 2, W[1]); img.hline(5, top + 7, w - 10, W[2]); }
  else if (style === 'drawer') { const dx = Math.floor(w / 2) - 7; img.rect(dx, top + 1, 14, 3, LT[2]); img.hline(dx, top + 1, 14, LT[3]); img.rect(dx + 6, top + 2, 2, 1, W[1]); img.rect(Math.floor(w / 2) - 1, top + 5, 3, 4, W[0]); }
  else { img.rect(5, top + 7, w - 10, 2, W[1]); img.hline(5, top + 7, w - 10, W[2]); }
  return img;
}

// ------------------------------------------------------------------ 笔记本电脑 laptop（1×1，原图 14×12，屏幕朝南）
/** 朝北：用的人坐在北边，屏幕朝北——南边看到的是盖板的背面（银灰、中间一个小标），键盘在盖板后面只露出一条 */
function laptopBack(): Img {
  const img = new Img(14, 12);
  img.rect(1, 0, 12, 3, c('#3a3f4c')); for (let x = 2; x < 12; x += 2) img.set(x, 1, c('#8a91a2')); // 盖板后面露出的键盘一条
  img.rect(0, 3, 14, 8, M[2]); img.hline(0, 3, 14, M[3]); img.hline(0, 10, 14, M[1]); img.set(6, 6, c('#f4f6fa')); img.set(7, 6, c('#f4f6fa')); img.set(6, 7, c('#f4f6fa')); img.set(7, 7, c('#f4f6fa')); // 小标
  return img;
}
/** 朝西：屏幕朝左——盖板侧立在左边（一条薄板，内侧是屏幕），键盘面板往右铺开 */
function laptopWest(): Img {
  const img = new Img(14, 12);
  img.rect(1, 0, 3, 8, M[1]); img.vline(1, 1, 6, SCREEN); img.vline(1, 1, 1, SCREEN_HI); img.vline(3, 0, 8, M[2]); // 盖板 + 屏幕边
  img.rect(0, 7, 14, 4, M[3]); img.hline(0, 7, 14, c('#e4e7ee')); img.hline(0, 10, 14, M[1]);
  for (let x = 5; x < 13; x += 2) { img.set(x, 8, M[1]); img.set(x + 1, 9, M[1]); } // 键帽
  return img;
}

// ------------------------------------------------------------------ 台式电脑 dc_pc（1×1，原图 16×14：显示器朝南，键盘在前）
/** 朝北：显示器后壳朝南，键盘在显示器北边，只在上沿露出一条 */
function pcBack(): Img {
  const img = new Img(16, 14);
  img.rect(1, 0, 14, 3, c('#c9ccd6')); for (let x = 2; x < 14; x += 2) img.set(x, 1, c('#8f95a6')); // 键盘一条
  img.rect(2, 3, 12, 8, KS); img.hline(2, 3, 12, M[2]); img.vline(2, 4, 7, K); img.vline(13, 4, 7, K);
  img.hline(5, 6, 6, KD); img.hline(5, 8, 6, KD); img.set(8, 5, c('#58d058')); // 散热孔 + 电源灯
  img.rect(7, 11, 2, 2, K); img.hline(4, 13, 8, K); img.vline(12, 11, 3, KD); // 脖子、底座、线
  return img;
}
/** 朝西：屏幕朝左，显示器是一块薄板，键盘在它的西边（前面） */
function pcWest(): Img {
  const img = new Img(16, 14);
  img.rect(7, 0, 3, 10, K); img.vline(6, 1, 8, SCREEN); img.vline(6, 1, 1, SCREEN_HI); img.vline(9, 1, 9, KS);
  img.rect(7, 10, 2, 2, K); img.hline(4, 12, 9, K); // 脖子、底座
  img.rect(0, 9, 5, 4, c('#c9ccd6')); img.hline(0, 9, 5, c('#eef0f4')); for (let y = 10; y < 13; y += 2) img.set(2, y, c('#8f95a6')); img.hline(0, 12, 5, c('#8f95a6')); // 键盘（从侧面看是一小块）
  return img;
}

export const TABLE_VIEWS: Record<string, ViewMap> = {
  desk: { ...side(deskSideRaw(false), 1, 2), 180: () => fin(deskBackRaw(false), 2, 1) },
  deskpc: { ...side(deskSideRaw(true), 1, 2), 180: () => fin(deskBackRaw(true), 2, 1) },
  table2: { ...side(table2SideRaw(), 1, 2), 180: () => fin(table2BackRaw(), 2, 1) },
  dc_dtable: { 90: () => fin(lightTable(32, 46, 'drawer', 'h'), 2, 2), 180: () => fin(lightTable(32, 46, 'back', 'v'), 2, 2), 270: () => fin(lightTable(32, 46, 'rail', 'h'), 2, 2) },
  // 3×2 → 2×3：桌面 56 高（0..45 是桌面，向南一行低 8px，正好托住抬高后的小件），边框 46..50，腿 51..55
  dc_dtable3: { 90: () => fin(lightTable(32, 56, 'drawer', 'h'), 2, 3), 180: () => fin(lightTable(48, 46, 'back', 'v'), 3, 2), 270: () => fin(lightTable(32, 56, 'rail', 'h'), 2, 3) },
  laptop: { 90: () => fin(laptopWest(), 1, 1), 180: () => fin(laptopBack(), 1, 1), 270: () => fin(mirror(laptopWest()), 1, 1) },
  dc_pc: { 90: () => fin(pcWest(), 1, 1), 180: () => fin(pcBack(), 1, 1), 270: () => fin(mirror(pcWest()), 1, 1) },
};
