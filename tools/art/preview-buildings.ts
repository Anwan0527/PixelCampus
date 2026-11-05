/** 建筑样片：.cache/preview/buildings.png */
import { Img } from './px.ts';
import { PAL } from './palette.ts';
import { renderWing, type WingSpec } from './buildings.ts';
import * as N from './nature.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const sheet = new Img(900, 420);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) {
  const g = (x * 7 + y * 13) % 11 === 0 ? PAL.grass[3] : (x + y * 3) % 17 === 0 ? PAL.grass[1] : PAL.grass[2];
  sheet.set(x, y, g);
}
const specs: WingSpec[] = [
  { x: 1, y: 6, w: 14, d: 5, f: 5, style: 'brick', seed: 1, door: { tx: 6, tw: 2, main: true } },
  { x: 17, y: 6, w: 10, d: 4, f: 6, style: 'brickPale', seed: 2, door: { tx: 4, tw: 2 } },
  { x: 29, y: 6, w: 12, d: 6, f: 3, style: 'white', seed: 3, roof: 'hip', windows: 'strip', door: { tx: 5, tw: 2, main: true } },
  { x: 43, y: 6, w: 10, d: 5, f: 4, style: 'sand', seed: 4, colonnade: true, door: { tx: 4, tw: 2, main: true } },
];
for (const sp of specs) {
  const w = renderWing(sp);
  sheet.blit(w.img, sp.x * 16 - 8, 20 + (w.py - (sp.y * 16 - w.wallH - 1)) + 50);
}
// 与人物/树比例对照：16×32 的小人（方块）和一棵树
sheet.rect(10, 270, 16, 32, [60, 60, 200, 255]);
const t = N.oak(5, 1); sheet.blit(t.img, 40, 300 - t.ay);
const t2 = N.oak(6, 2); sheet.blit(t2.img, 100, 300 - t2.ay);
await sheet.savePreview(join(CACHE, 'preview', 'buildings.png'), 2);
console.log('ok');
