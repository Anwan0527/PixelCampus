import { fileURLToPath } from 'node:url';
/** 生成 4×4 张带格线的卫星视图到 .cache/views/（描图用）。 npm run ref:view */
import { mkdir } from 'node:fs/promises';
import { renderView } from './views.ts';

const OUT = fileURLToPath(new URL('../../.cache/views/', import.meta.url));
const xs = [0, 84, 168, 252], ys = [0, 66, 132, 196];
await mkdir(OUT, { recursive: true });
for (let r = 0; r < ys.length; r++)
  for (let c = 0; c < xs.length; c++)
    await renderView({ x: xs[c], y: ys[r], w: 100, h: 76, scale: 9, out: `${OUT}sat_r${r}c${c}.png` });
// 全局概览（每 tile 3px）
await renderView({ x: 0, y: 0, w: 352, h: 272, scale: 4, out: `${OUT}overview.png` });
console.log('views done');
