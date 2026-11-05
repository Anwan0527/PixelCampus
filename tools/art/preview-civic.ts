/** civic 风格样片（图书馆南翼 / 综合服务中心 / 会议中心 / 门卫室）：.cache/preview/civic.png */
import { Img } from './px.ts';
import { PAL } from './palette.ts';
import { renderWing, type WingSpec } from './buildings.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const sheet = new Img(920, 300);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x * 7 + y * 13) % 11 === 0 ? PAL.grass[3] : PAL.grass[2]);
const specs: WingSpec[] = [
  { x: 1, y: 10, w: 36, d: 8, f: 5, style: 'civic', seed: 1, door: { tx: 16, tw: 4, main: true } },
  { x: 39, y: 10, w: 22, d: 3, f: 4, style: 'civic', seed: 2, door: { tx: 9.5, tw: 3, main: true } },
  { x: 1, y: 17.5, w: 3, d: 2, f: 1, style: 'civic', seed: 3 },
  { x: 6, y: 17.5, w: 3, d: 2, f: 1, style: 'civic', seed: 4 },
  { x: 40, y: 17.5, w: 14, d: 5, f: 2, style: 'hall', seed: 5, roof: 'seam', roofTone: 5, door: { tx: 5.5, tw: 3, main: true } },
];
for (const sp of specs) { const w = renderWing(sp); sheet.blit(w.img, sp.x * 16, 8 + (w.py - (sp.y * 16 - w.wallH - 1)) + 40 + (sp.y > 15 ? 70 : 0)); }
await sheet.savePreview(join(CACHE, 'preview', 'civic.png'), 2);
