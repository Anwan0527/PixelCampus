/** 看图：把宿舍装饰家具拼成一张大图（npx tsx tools/art/preview-decor.ts），输出到 .cache/preview/decor.png */
import { Img } from './px.ts';
import { DECOR_FURNITURE } from './furniture-decor.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const list = Object.entries(DECOR_FURNITURE).map(([k, mk]) => ({ k, img: mk().img }));
const W = 360, pad = 6;
let x = pad, y = pad, rowH = 0; const place: { img: Img; x: number; y: number }[] = [];
for (const { img } of list) { if (x + img.w + pad > W) { x = pad; y += rowH + pad; rowH = 0; } place.push({ img, x, y }); x += img.w + pad; rowH = Math.max(rowH, img.h); }
const sheet = new Img(W, y + rowH + pad);
for (let j = 0; j < sheet.h; j++) for (let i = 0; i < sheet.w; i++) sheet.set(i, j, (i >> 3) + (j >> 3) & 1 ? [200, 170, 130, 255] : [190, 160, 120, 255]);
for (const p of place) sheet.blit(p.img, p.x, p.y);
await sheet.savePreview(join(CACHE, 'preview', 'decor.png'), 3);
console.log(list.map((l) => `${l.k}:${l.img.w}x${l.img.h}`).join(' '));
