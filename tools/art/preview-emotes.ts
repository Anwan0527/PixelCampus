/** 预览 2026-11 新增的表情姿势：npx tsx tools/art/preview-emotes.ts [造型编号…] → .cache/preview/emotes-*.png（每行一个动作的全部帧，躺下是横画布单独一行） */
import { join } from 'node:path';
import { Img, hex } from './px.ts';
import { ANIMS, LIE_META, PRESET_LOOKS, frameMeta, renderFrame, renderLie } from './char-rig.ts';
import { CACHE } from '../paths.ts';

const NEW = ['cry', 'angry', 'shy', 'bow', 'clap', 'yawn', 'stretch', 'peace', 'daze', 'shrug', 'shock', 'sitg'];
const M = frameMeta(1), cw = M.w + 2, ch = M.h + 2;
const bg = (img: Img) => { const a = hex('#8fbf6a'), b = hex('#86b862'); for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.set(x, y, (x + y * 2) % 13 === 0 ? b : a); };
const looks = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
for (const n of looks.length ? looks : [0, 1, 3]) {
  const look = PRESET_LOOKS[n];
  const cols = Math.max(...NEW.map((id) => ANIMS.find((a) => a.id === id)!.frames.length));
  const sheet = new Img(cw * cols + 4, ch * NEW.length + 4); bg(sheet);
  NEW.forEach((id, r) => { const a = ANIMS.find((x) => x.id === id)!; a.frames.forEach((pose, i) => sheet.blit(renderFrame(look, pose, 'down', i, 1), 2 + i * cw, 2 + r * ch)); });
  await sheet.savePreview(join(CACHE, 'preview', `emotes-${n}.png`), 5);
  const lie = ANIMS.find((a) => a.id === 'lie')!, ls = new Img((LIE_META.w + 2) * 2 + 4, LIE_META.h + 6); bg(ls);
  lie.frames.forEach((pose, i) => ls.blit(renderLie(look, pose, i), 2 + i * (LIE_META.w + 2), 2));
  await ls.savePreview(join(CACHE, 'preview', `emotes-lie-${n}.png`), 6);
}
console.log('预览已输出到 .cache/preview/emotes-*.png');
