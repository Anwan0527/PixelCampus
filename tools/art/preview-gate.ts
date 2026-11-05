/** 南门/广场小品样片：.cache/preview/gate.png */
import { Img } from './px.ts';
import { PAL } from './palette.ts';
import * as P from './props.ts';
import * as N from './nature.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';
const sheet = new Img(760, 150);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x * 7 + y * 13) % 11 === 0 ? PAL.grass[3] : PAL.grass[2]);
let x = 6;
const put = (s: N.Sprite) => { sheet.blit(s.img, x, 140 - s.ay); x += s.img.w + 8; };
[P.lampGold(), P.wallH(), P.wallH(), P.pier(), P.fenceIron(), P.fenceIron(), P.nameStone(), P.bollard(), P.bollard(), P.railV(), P.flagpole(), P.boulder(), N.maple(3), P.lamp(), P.bench()].forEach(put);
const flags = P.flagFrames(); flags.forEach((f, i) => sheet.blit(f, 6 + i * 32, 6));
await sheet.savePreview(join(CACHE, 'preview', 'gate.png'), 2);
