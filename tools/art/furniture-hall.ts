/**
 * 餐厅 / 超市 / 教学楼用的家具：窗口招牌（墙面木牌，字由室内数据写）、货架、冷柜、自动售货机、饮水机、公告栏。
 * 约定同 furniture.ts：脚印 fw×fh（tile，16px），精灵左缘 = 脚印左缘、精灵底边 = 脚印底缘，精灵可以向上超出脚印；fh = 0 是墙面挂件。
 * 全部程序化生成，不使用任何外部素材。
 */
import { Img, Rng, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });
const PRODUCT: RGBA[] = ['#c4503c', '#e0a53a', '#3f9a58', '#3f6fae', '#8a5aa8', '#e8e4da', '#d98a4a', '#2f7a8a', '#b34a3c', '#f2c94c'].map((c) => hex(c));
const lighten = (c: RGBA, k: number): RGBA => [Math.min(255, c[0] + k), Math.min(255, c[1] + k), Math.min(255, c[2] + k), 255];

/** 窗口招牌（墙上的木牌，n 格宽）：奶白底 + 木框，字由室内数据里的 text 盖在上面 */
export function plaque(n: number): Furn {
  const w = n * 16 + 2, img = new Img(w, 14);
  img.rect(0, 0, w, 13, W[1]); img.rect(1, 1, w - 2, 11, hex('#f6ecd0')); img.hline(1, 1, w - 2, hex('#fffaf0')); img.hline(1, 11, w - 2, hex('#d9c9a0')); img.rect(2, 12, 2, 2, W[0]); img.rect(w - 4, 12, 2, 2, W[0]);
  return f(img, n, 0);
}
/** 货架（n 格宽）：灰白色金属架，三层商品 */
export function goodsShelf(n: number, seed = 1): Furn {
  const w = n * 16, h = 38, img = new Img(w, h), rng = new Rng(seed * 17 + n);
  img.rect(0, 0, w, h, hex('#c9ced6')); img.hline(0, 0, w, hex('#eef0f4')); img.rect(0, h - 4, w, 4, hex('#8f95a6'));
  for (const sy of [2, 13, 24]) {
    img.rect(1, sy + 9, w - 2, 2, hex('#8f95a6')); img.hline(1, sy + 9, w - 2, hex('#b8bcc8'));
    let x = 2;
    while (x < w - 3) {
      const bw = 3 + rng.int(4), bh = 5 + rng.int(4), c = rng.pick(PRODUCT);
      img.rect(x, sy + 9 - bh, bw, bh, c); img.hline(x, sy + 9 - bh, bw, lighten(c, 50)); if (bw > 4) img.hline(x + 1, sy + 9 - Math.floor(bh / 2), bw - 2, hex('#f6f7fa'));
      x += bw + (rng.chance(0.2) ? 2 : 0);
    }
  }
  img.vline(0, 0, h, hex('#8f95a6')); img.vline(w - 1, 0, h, hex('#8f95a6'));
  return f(img, n, 1);
}
/** 冷柜（n 格宽）：白色柜身 + 蓝色玻璃门，里面是饮料和冰淇淋 */
export function freezer(n: number): Furn {
  const w = n * 16, h = 34, img = new Img(w, h), rng = new Rng(n * 7 + 3);
  img.rect(0, 0, w, h, hex('#e6e8ee')); img.hline(0, 0, w, hex('#ffffff')); img.rect(0, h - 4, w, 4, hex('#8f95a6'));
  img.rect(0, 2, w, 3, hex('#4fb0dc')); img.hline(0, 2, w, hex('#b5e6f5')); // 灯箱条
  for (let x = 2; x < w - 4; x += 15) {
    const gw = Math.min(13, w - x - 2); img.rect(x, 7, gw, 22, hex('#9fd3ea')); img.hline(x, 7, gw, hex('#d6eef8')); img.vline(x + gw - 1, 7, 22, hex('#6aa9c8'));
    for (const sy of [10, 18, 25]) { img.hline(x, sy + 3, gw, hex('#7fb4cf')); for (let bx = x + 1; bx < x + gw - 2; bx += 3) img.rect(bx, sy - 3 + 3, 2, 4, rng.pick(PRODUCT)); }
    img.rect(x + gw - 3, 14, 1, 7, hex('#4a5060')); // 把手
  }
  return f(img, n, 1);
}
/** 自动售货机（1×1，高）：红色机身 + 玻璃展示窗 + 取货口 */
export function vending(): Furn {
  const img = new Img(16, 38), rng = new Rng(11);
  img.rect(0, 0, 16, 37, hex('#b33a32')); img.hline(0, 0, 16, hex('#d9625a')); img.vline(0, 0, 37, hex('#8f2a24'));
  img.rect(2, 3, 12, 20, hex('#cfe8f4')); img.hline(2, 3, 12, hex('#eef8fc'));
  for (const sy of [5, 11, 17]) { img.hline(2, sy + 4, 12, hex('#8fb4c8')); for (let x = 3; x < 13; x += 3) img.rect(x, sy, 2, 4, rng.pick(PRODUCT)); }
  img.rect(11, 25, 3, 5, hex('#2c2f3a')); img.rect(3, 27, 6, 7, hex('#2c2f3a')); img.hline(3, 27, 6, hex('#454a5a')); // 按钮 + 取货口
  img.hline(0, 36, 16, hex('#6e1f1a'));
  return f(img, 1, 1);
}
/** 饮水机（1×1）：白色机身 + 蓝色水桶 */
export function waterDisp(): Furn {
  const img = new Img(14, 32);
  img.ellipse(7, 6, 5, 6, hex('#8fcdf0')); img.ellipse(7, 5, 4, 5, hex('#b9e3f8')); img.rect(5, 11, 4, 2, hex('#6aa9c8'));
  img.rect(1, 13, 12, 17, hex('#f2f3f6')); img.vline(1, 13, 17, hex('#c4c8d2')); img.hline(1, 13, 12, hex('#ffffff'));
  img.rect(3, 16, 3, 3, hex('#4fb0dc')); img.rect(8, 16, 3, 3, hex('#e0623a')); img.rect(4, 21, 6, 5, hex('#c4c8d2')); img.rect(5, 26, 4, 1, hex('#8f95a6'));
  img.rect(1, 30, 12, 2, hex('#8f95a6'));
  return f(img, 1, 1);
}
/** 公告栏（墙上，n 格宽）：软木板 + 木框 + 几张钉着的纸 */
export function noticeBoard(n: number): Furn {
  const w = n * 16, h = 28, img = new Img(w, h), rng = new Rng(n * 5 + 2);
  img.rect(0, 0, w, h, W[1]); img.rect(2, 2, w - 4, h - 4, hex('#c28d58')); img.hline(2, 2, w - 4, hex('#d9a56e'));
  for (let x = 4; x < w - 12; x += 11 + rng.int(3)) {
    const pw = 7 + rng.int(3), ph = 8 + rng.int(5), py = 4 + rng.int(8), c = rng.pick<RGBA>([hex('#f6f8fa'), hex('#fff1b8'), hex('#ffd6dc'), hex('#d4ecff')]);
    img.rect(x, py, pw, ph, c); img.hline(x + 1, py + 3, pw - 2, hex('#8a8f9c')); img.hline(x + 1, py + 5, pw - 3, hex('#8a8f9c')); img.set(x + Math.floor(pw / 2), py, hex('#c4503c'));
  }
  return f(img, n, 0);
}

export const HALL_FURNITURE: Record<string, () => Furn> = {
  plaque3: () => plaque(3), plaque4: () => plaque(4), plaque5: () => plaque(5),
  gshelf2: () => goodsShelf(2, 1), gshelf3: () => goodsShelf(3, 2), freezer3: () => freezer(3), vending, waterdisp: waterDisp,
  notice3: () => noticeBoard(3),
};
export const HALL_INFO: Record<string, { name: string; cat: '食堂' | '超市' | '其他' | '墙面挂件' | '柜子电器'; top?: boolean }> = {
  plaque3: { name: '窗口招牌（3格）', cat: '墙面挂件' }, plaque4: { name: '窗口招牌（4格）', cat: '墙面挂件' }, plaque5: { name: '窗口招牌（5格）', cat: '墙面挂件' },
  gshelf2: { name: '货架2', cat: '超市' }, gshelf3: { name: '货架3', cat: '超市' }, freezer3: { name: '冷柜3', cat: '超市' },
  vending: { name: '自动售货机', cat: '柜子电器' }, waterdisp: { name: '饮水机', cat: '柜子电器' }, notice3: { name: '公告栏', cat: '墙面挂件' },
};
export const HALL_TEXT: Record<string, { mode: 'h' | 'v'; def: string }> = { plaque3: { mode: 'h', def: '窗口' }, plaque4: { mode: 'h', def: '窗口' }, plaque5: { mode: 'h', def: '窗口' } };
