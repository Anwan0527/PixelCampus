/** 预览水禽：第一张 = 每种外观 × 每个动作的第 0 帧；第二张 = 公绿头鸭与白天鹅的所有帧。放大 N 倍 → .cache/preview/birds*.png。 npx tsx tools/art/preview-birds.ts */
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Img } from './px.ts';
import { BIRD_ANIMS, BIRD_FRAME, BIRD_LOOKS, renderBird } from './birds.ts';
import { ROOT } from '../paths.ts';

const S = 3, cw = BIRD_FRAME.w, ch = BIRD_FRAME.h;
const water = (w: number, h: number) => { const im = new Img(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.set(x, y, [88, 150, 180, 255]); return im; };
const up = (sheet: Img) => { const big = new Img(sheet.w * S, sheet.h * S); for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) big.set(x, y, sheet.get(Math.floor(x / S), Math.floor(y / S))); return big; };
mkdirSync(join(ROOT, '.cache/preview'), { recursive: true });
{
  const sheet = water(BIRD_ANIMS.length * cw + 2, BIRD_LOOKS.length * ch + 2);
  BIRD_LOOKS.forEach((L, k) => BIRD_ANIMS.forEach((a, i) => sheet.blit(renderBird(L, a.frames[0], a.view ?? 'side'), 1 + i * cw, 1 + k * ch)));
  await up(sheet).save(join(ROOT, '.cache/preview/birds.png'));
}
{
  const side = BIRD_ANIMS.filter((a) => !a.view), cols = 4;
  const sheet = water(cols * cw + 2, 2 * side.length * ch + 2);
  [0, 3].forEach((k, n) => side.forEach((a, r) => a.frames.forEach((p, i) => sheet.blit(renderBird(BIRD_LOOKS[k], p), 1 + i * cw, 1 + (n * side.length + r) * ch))));
  await up(sheet).save(join(ROOT, '.cache/preview/birds2.png'));
}
console.log('ok');
