/** 广场两座大型建筑样片：.cache/preview/plaza.png */
import { Img } from './px.ts';
import { PAL } from './palette.ts';
import { shop, campusWall } from './plaza.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';
const a = shop(), b = campusWall();
const sheet = new Img(a.img.w + b.img.w + 40, Math.max(a.img.h, b.img.h) + 20);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x * 7 + y * 13) % 11 === 0 ? PAL.plaza[1] : PAL.plaza[2]);
sheet.blit(a.img, 10, sheet.h - 10 - a.img.h); sheet.blit(b.img, a.img.w + 30, sheet.h - 10 - b.img.h);
await sheet.savePreview(join(CACHE, 'preview', 'plaza.png'), 3);
