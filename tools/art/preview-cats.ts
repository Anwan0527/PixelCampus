import { Img } from './px.ts';
import { buildCat, COATS, POSES } from './cats.ts';
import { PAL } from './palette.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const cw = 30, ch = 25, cols = POSES.reduce((n, p) => n + p.frames, 0);
const sheet = new Img(cw * cols + 8, ch * COATS.length + 8);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x + y * 2) % 13 === 0 ? PAL.grass[3] : PAL.grass[2]);
COATS.forEach((_, c) => {
  let i = 0;
  for (const { pose, frames } of POSES) for (let f = 0; f < frames; f++) sheet.blit(buildCat(c, pose, f), 4 + i++ * cw, 4 + c * ch);
});
await sheet.savePreview(join(CACHE, 'preview', 'cats.png'), 6);
