/**
 * 室内家具精灵（16px 网格）。每件家具：脚印 fw×fh(tile) + 精灵(可向上超出脚印)。
 * 放置约定：精灵左边缘 = 脚印左缘，精灵底边 = 脚印底缘。
 */
import { Img, Rng, hash2, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import { hex } from './px.ts';

export interface Furn { img: Img; fw: number; fh: number }
const W = PAL.wood, OUT = PAL.outline;
const BOOKS: RGBA[] = ['#b34a3c', '#3f6fae', '#3f9a58', '#e0a53a', '#8a5aa8', '#e8e4da', '#c4503c', '#2f7a8a', '#d98a4a'].map((c) => hex(c));
const soft = (img: Img, cx: number, cy: number, rx: number, ry: number) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1 && img.alpha(x, y) === 0) img.set(x, y, [28, 36, 66, 40]);
  }
};

export function shelf(n: number, seed = 1): Furn {
  const w = n * 16, h = 34;
  const img = new Img(w, h);
  img.rect(0, 0, w, h, W[1]);
  img.rect(1, 1, w - 2, h - 3, W[0]);
  const rng = new Rng(seed * 31 + n);
  for (const sy of [2, 13, 24]) { // 三层
    img.rect(1, sy + 9, w - 2, 2, W[2]);
    let x = 2;
    while (x < w - 3) {
      const bw = 2 + rng.int(3), bh = 6 + rng.int(4);
      const c = rng.pick(BOOKS);
      img.rect(x, sy + 9 - bh, bw, bh, c); img.vline(x, sy + 9 - bh, bh, [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40), 255]);
      x += bw + (rng.chance(0.15) ? 2 : 0);
    }
  }
  img.rect(0, h - 3, w, 3, W[1]); img.hline(0, 0, w, W[3]);
  return { img: img.outlined(OUT), fw: n, fh: 1 };
}

export function desk(pc = false): Furn {
  const img = new Img(32, 26);
  img.rect(0, 6, 32, 6, W[3]); img.hline(0, 6, 32, W[4]); img.hline(0, 11, 32, W[2]);
  img.rect(1, 12, 30, 10, W[2]); img.rect(2, 13, 12, 8, W[1]); img.rect(18, 13, 12, 8, W[1]); img.rect(7, 16, 2, 2, W[4]); img.rect(23, 16, 2, 2, W[4]);
  img.rect(1, 22, 3, 3, W[0]); img.rect(28, 22, 3, 3, W[0]);
  if (pc) { img.rect(10, 0, 12, 8, hex('#2b2e40')); img.rect(11, 1, 10, 6, hex('#5f98cc')); img.rect(14, 8, 4, 2, hex('#2b2e40')); }
  else { img.rect(4, 3, 6, 3, hex('#e8e4da')); img.rect(22, 2, 5, 4, hex('#c4503c')); }
  return { img: img.outlined(OUT), fw: 2, fh: 1 };
}
export function chair(facing: 'down' | 'up' = 'down'): Furn {
  const img = new Img(14, 22);
  if (facing === 'up') { img.rect(1, 12, 12, 7, W[3]); img.rect(2, 19, 2, 3, W[0]); img.rect(10, 19, 2, 3, W[0]); img.rect(1, 12, 12, 1, W[4]); }
  else { img.rect(1, 2, 12, 8, W[2]); img.rect(1, 2, 12, 1, W[4]); img.rect(1, 10, 12, 6, W[3]); img.rect(2, 16, 2, 4, W[0]); img.rect(10, 16, 2, 4, W[0]); }
  return { img: img.outlined(OUT), fw: 1, fh: 1 };
}
export function table(fw: number, fh: number): Furn {
  const w = fw * 16, h = fh * 16 + 14;
  const img = new Img(w, h);
  img.rect(0, 0, w, h - 10, W[3]); img.hline(0, 0, w, W[4]); img.rect(0, h - 10, w, 6, W[2]); img.hline(0, h - 5, w, W[1]);
  img.rect(2, h - 4, 3, 4, W[0]); img.rect(w - 5, h - 4, 3, 4, W[0]);
  img.rect(w / 2 - 3, 2, 6, 3, hex('#e8e4da'));
  img.rect(4, 4, 7, 4, hex('#c4503c')); img.rect(w - 11, 5, 6, 4, hex('#3f6fae'));
  return { img: img.outlined(OUT), fw, fh };
}
export function counter(n: number, food = false): Furn {
  const w = n * 16, h = 34;
  const img = new Img(w, h);
  img.rect(0, 10, w, 24, W[2]); img.rect(0, 10, w, 3, hex('#f2e6c8')); img.hline(0, 13, w, W[1]);
  for (let x = 3; x < w - 4; x += 10) { img.rect(x, 16, 8, 14, W[1]); img.rect(x + 1, 17, 6, 12, W[3]); img.rect(x + 5, 22, 1, 2, hex('#f2e6c8')); }
  if (food) {
    for (let x = 3; x < w - 8; x += 12) { img.rect(x, 3, 9, 7, hex('#cfd3dc')); img.rect(x + 1, 2, 7, 3, rngCol(x)); img.hline(x, 9, 9, hex('#8f96a8')); }
  } else { img.rect(w - 14, 2, 10, 8, hex('#2b2e40')); img.rect(w - 13, 3, 8, 6, hex('#5f98cc')); img.rect(4, 4, 8, 6, hex('#e8e4da')); }
  return { img: img.outlined(OUT), fw: n, fh: 1 };
}
const rngCol = (x: number): RGBA => BOOKS[Math.floor(hash2(x, 3, 9) * BOOKS.length)];
export function plant(): Furn {
  const img = new Img(16, 30);
  img.rect(4, 20, 8, 9, hex('#a05a3a')); img.rect(3, 19, 10, 2, hex('#c0714a')); img.hline(4, 28, 8, hex('#6b3a26'));
  for (const [x, y, r] of [[8, 12, 7], [4, 14, 5], [12, 14, 5], [8, 6, 5]] as const) img.ellipse(x, y, r, r - 1, PAL.leaf[2 + ((x + y) % 2)]);
  img.ellipse(6, 8, 2, 2, PAL.leaf[4]);
  return { img: img.outlined(OUT), fw: 1, fh: 1 };
}
export function sofa(): Furn {
  const img = new Img(32, 24);
  const c = [hex('#7a3f5a'), hex('#9a5878'), hex('#b97294')];
  img.rect(0, 2, 32, 10, c[0]); img.rect(1, 3, 30, 8, c[1]); img.rect(0, 12, 32, 9, c[1]); img.rect(0, 12, 32, 2, c[2]); img.rect(0, 10, 4, 12, c[0]); img.rect(28, 10, 4, 12, c[0]);
  img.rect(2, 21, 3, 3, W[0]); img.rect(27, 21, 3, 3, W[0]);
  return { img: img.outlined(OUT), fw: 2, fh: 1 };
}
export function podium(): Furn {
  const img = new Img(16, 28);
  img.rect(1, 2, 14, 6, W[3]); img.rect(2, 8, 12, 18, W[2]); img.rect(3, 10, 10, 14, W[1]); img.hline(1, 2, 14, W[4]);
  return { img: img.outlined(OUT), fw: 1, fh: 1 };
}
export function cantable(): Furn {
  const img = new Img(32, 40);
  img.rect(0, 4, 32, 14, W[3]); img.hline(0, 4, 32, W[4]); img.rect(0, 18, 32, 4, W[2]); img.rect(3, 22, 3, 6, W[0]); img.rect(26, 22, 3, 6, W[0]);
  img.rect(4, 7, 7, 5, hex('#e8e4da')); img.rect(18, 8, 8, 5, hex('#e0a53a'));
  img.rect(2, 30, 10, 3, W[2]); img.rect(20, 30, 10, 3, W[2]); img.rect(3, 33, 2, 5, W[0]); img.rect(9, 33, 2, 5, W[0]); img.rect(21, 33, 2, 5, W[0]); img.rect(27, 33, 2, 5, W[0]);
  return { img: img.outlined(OUT), fw: 2, fh: 2 };
}
export function bin2(): Furn {
  const img = new Img(12, 16);
  img.rect(1, 2, 10, 13, PAL.metal[2]); img.rect(0, 0, 12, 3, PAL.metal[1]); img.vline(3, 3, 11, PAL.metal[3]);
  return { img: img.outlined(OUT), fw: 1, fh: 1 };
}

export const FURNITURE: Record<string, () => Furn> = {
  shelf1: () => shelf(1, 1), shelf2: () => shelf(2, 2), shelf3: () => shelf(3, 3), shelf4: () => shelf(4, 4),
  desk: () => desk(false), deskpc: () => desk(true),
  chair: () => chair('down'), chairup: () => chair('up'),
  table2: () => table(2, 1), table3: () => table(3, 2), table4: () => table(4, 2),
  counter3: () => counter(3), counter5: () => counter(5), foodcounter5: () => counter(5, true), foodcounter7: () => counter(7, true),
  plant: plant, sofa: sofa, podium: podium, cantable: cantable, bin: bin2,
};
export { soft as _soft };
