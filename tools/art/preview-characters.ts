import { Img } from './px.ts';
import { buildCharacter, LOOKS, DIRS } from './characters.ts';
import { PAL } from './palette.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';
const cell = 21, rowH = 37;
const sheet = new Img(cell * 16 + 8, rowH * 5 + 8);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x + y * 2) % 13 === 0 ? PAL.grass[3] : PAL.grass[2]);
LOOKS.slice(0, 5).forEach((look, r) => {
  const ch = buildCharacter(look);
  DIRS.forEach((d, di) => { for (let f = 0; f < 4; f++) sheet.blit(ch.frames[`${d}_${f}`], 4 + (di * 4 + f) * cell, 4 + r * rowH); });
});
await sheet.savePreview(join(CACHE, 'preview', 'characters.png'), 5);
const sheet2 = new Img(cell * 10 + 8, 44);
for (let y = 0; y < sheet2.h; y++) for (let x = 0; x < sheet2.w; x++) sheet2.set(x, y, (x + y * 2) % 13 === 0 ? PAL.grass[3] : PAL.grass[2]);
LOOKS.forEach((look, i) => sheet2.blit(buildCharacter(look).frames['down_0'], 4 + i * cell, 4));
await sheet2.savePreview(join(CACHE, 'preview', 'characters-all.png'), 6);
