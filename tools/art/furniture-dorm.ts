/**
 * 宿舍家具：单人床、被子（睡觉时盖在人身上的遮挡层）、衣柜、宝箱。
 * 约定同 furniture.ts：脚印 fw×fh（tile，16px），精灵左缘 = 脚印左缘、精灵底边 = 脚印底缘，精灵可以向上超出脚印。
 */
import { Img, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const BLK: RGBA[] = ['#2f5f9a', '#3f78c0', '#5f98cc', '#9cc4e8'].map((c) => hex(c)); // 蓝色被子
const SHEET: RGBA[] = ['#d8d2c0', '#ece7d8', '#f8f5ea'].map((c) => hex(c)); // 床单/枕头
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });

/** 床头板 + 枕头 + 床单（被子另画，见 dbed_cover） */
function bedBase(img: Img) {
  // 床头板（超出脚印往上 8 像素）
  img.rect(0, 0, 32, 10, W[2]); img.hline(0, 0, 32, W[4]); img.rect(2, 2, 28, 6, W[1]); img.hline(2, 2, 28, W[3]);
  // 床垫/床单
  img.rect(0, 10, 32, 46, SHEET[1]); img.hline(0, 10, 32, SHEET[0]); img.vline(0, 10, 46, SHEET[0]); img.vline(31, 10, 46, SHEET[0]);
  // 枕头
  img.rect(5, 12, 22, 9, SHEET[2]); img.hline(5, 12, 22, hex('#ffffff')); img.hline(5, 20, 22, SHEET[0]); img.vline(5, 13, 7, SHEET[0]); img.vline(26, 13, 7, SHEET[0]);
  // 床脚板
  img.rect(0, 52, 32, 4, W[2]); img.hline(0, 52, 32, W[4]); img.rect(0, 55, 32, 1, W[0]);
}
/** 被子：从胸口往下盖到床尾，上沿有一道翻折的白边 */
function bedCover(img: Img) {
  img.rect(1, 24, 30, 28, BLK[1]); img.rect(1, 24, 30, 3, SHEET[2]); img.hline(1, 27, 30, SHEET[0]);
  for (let y = 31; y < 52; y += 6) img.hline(2, y, 28, BLK[2]); // 格子被面
  for (let x = 6; x < 30; x += 8) img.vline(x, 28, 24, BLK[2]);
  img.vline(1, 27, 25, BLK[0]); img.vline(30, 27, 25, BLK[0]); img.hline(1, 51, 30, BLK[0]);
  img.rect(0, 52, 32, 4, W[2]); img.hline(0, 52, 32, W[4]); img.rect(0, 55, 32, 1, W[0]); // 床脚板也要盖在人前面
}

/** 单人床（2×3 格脚印，床头朝北靠墙） */
export function dbed(): Furn {
  const img = new Img(32, 56);
  bedBase(img);
  img.rect(1, 24, 30, 28, BLK[1]); img.rect(1, 24, 30, 3, SHEET[2]); img.hline(1, 27, 30, SHEET[0]);
  for (let y = 31; y < 52; y += 6) img.hline(2, y, 28, BLK[2]);
  for (let x = 6; x < 30; x += 8) img.vline(x, 28, 24, BLK[2]);
  img.vline(1, 27, 25, BLK[0]); img.vline(30, 27, 25, BLK[0]); img.hline(1, 51, 30, BLK[0]);
  return f(img, 2, 3);
}
/** 被子遮挡层：和床一样大，只有被子和床脚板有像素；睡觉时盖在人身上，人的脑袋露在枕头上 */
export function dbedCover(): Furn {
  const img = new Img(32, 56);
  bedCover(img);
  return f(img, 2, 3);
}

/** 衣柜（2×1 格脚印）：深木色双开门，门上有长拉手和一面小镜子 */
export function dwardrobe(): Furn {
  const img = new Img(32, 54);
  img.rect(0, 0, 32, 54, W[1]); img.hline(0, 0, 32, W[3]); img.rect(0, 0, 32, 4, W[2]); img.hline(0, 3, 32, W[0]);
  for (let i = 0; i < 2; i++) {
    const x = 2 + i * 14;
    img.rect(x, 6, 14, 42, W[2]); img.rect(x + 1, 7, 12, 40, W[3]); img.hline(x + 1, 7, 12, W[4]);
    img.rect(x + 3, 10, 8, 14, W[2]); img.rect(x + 4, 11, 6, 12, i === 0 ? hex('#a9d0e0') : W[3]); // 左门上半有一面小镜子
    img.rect(i ? x + 2 : x + 11, 26, 1, 8, M[3]);
  }
  img.vline(15, 6, 42, W[0]); img.vline(16, 6, 42, W[0]);
  img.rect(0, 50, 32, 4, W[0]); img.hline(0, 49, 32, W[0]);
  return f(img, 2, 1);
}

/** 宝箱（1×1）：木箱 + 金属包角 + 锁扣 */
export function dchest(): Furn {
  const img = new Img(16, 20);
  img.rect(1, 6, 14, 13, W[2]); img.hline(1, 6, 14, W[4]); img.rect(2, 8, 12, 9, W[3]);
  // 圆弧盖
  img.rect(1, 2, 14, 5, W[3]); img.hline(2, 1, 12, W[4]); img.hline(2, 2, 12, W[4]); img.rect(1, 3, 14, 3, W[2]); img.hline(1, 6, 14, W[0]);
  // 金属包带和包角
  for (const x of [3, 11]) { img.rect(x, 1, 2, 18, hex('#c9a43c')); img.vline(x, 1, 18, hex('#f0d56a')); }
  img.rect(1, 17, 14, 2, M[1]); img.hline(1, 6, 14, M[2]);
  img.rect(6, 7, 4, 5, hex('#c9a43c')); img.rect(7, 9, 2, 2, W[0]); // 锁扣
  return f(img, 1, 1);
}

/** 门牌（墙面挂件，5×0 格）：木框 + 米色底，两根挂绳；上面的字由宿舍场景按房主起的名字现写 */
export function dsign(): Furn {
  const img = new Img(80, 18);
  img.vline(12, 0, 3, M[1]); img.vline(67, 0, 3, M[1]); // 挂绳
  img.rect(0, 3, 80, 15, W[2]); img.hline(0, 3, 80, W[4]); img.hline(0, 17, 80, W[0]);
  img.rect(2, 5, 76, 11, hex('#ead7a4')); img.hline(2, 5, 76, hex('#f6e8c0')); img.hline(2, 15, 76, hex('#cdb77c'));
  img.rect(3, 6, 2, 2, W[1]); img.rect(75, 6, 2, 2, W[1]); // 钉子
  return f(img, 5, 0);
}

export const DORM_FURNITURE: Record<string, () => Furn> = { dbed, dbed_cover: dbedCover, dwardrobe, dchest, dsign };
export const DORM_INFO: Record<string, { name: string; cat: '桌椅' | '柜子电器' | '墙面挂件' | '其他' }> = {
  dbed: { name: '单人床', cat: '柜子电器' }, dbed_cover: { name: '被子（睡觉时盖住人，别摆）', cat: '其他' }, dwardrobe: { name: '衣柜', cat: '柜子电器' }, dchest: { name: '宝箱', cat: '柜子电器' }, dsign: { name: '门牌（房主可改名）', cat: '墙面挂件' },
};
