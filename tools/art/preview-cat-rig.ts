/** 预览猫 Rig 原型：npx tsx tools/art/preview-cat-rig.ts → .cache/preview/catrig-*.png */
import { join } from 'node:path';
import { Img, hex } from './px.ts';
import { CAT_ANIMS, CAT_FRAME, CAT_FRONT_ANIMS, CAT_PRESETS, PAIR_ANIMS, PAIR_FRAME, renderCat, renderCatFront, renderPair, type CatLook } from './cat-rig.ts';
import { CACHE } from '../paths.ts';

const bg = (img: Img, a = hex('#8fbf6a'), b = hex('#86b862')) => { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.set(x, y, (x + y * 2) % 13 === 0 ? b : a); };
const out = (n: string) => join(CACHE, 'preview', `catrig-${n}.png`);
const cw = CAT_FRAME.w + 2, ch = CAT_FRAME.h + 2;
const orange = CAT_PRESETS[0].look, tabby = CAT_PRESETS[6].look;

/** 动作联系表：每行一个动作，帧横排（×5） */
async function actions(look: CatLook, file: string) {
  const cols = Math.max(...CAT_ANIMS.map((a) => a.frames.length));
  const sheet = new Img(cols * cw + 4, CAT_ANIMS.length * ch + 4); bg(sheet);
  CAT_ANIMS.forEach((a, r) => a.frames.forEach((p, i) => sheet.blit(renderCat(look, p).img, 2 + i * cw, 2 + r * ch)));
  await sheet.savePreview(out(file), 5);
}
await actions(orange, 'actions-orange');
await actions(CAT_PRESETS[3].look, 'actions-calico');

/** 毛色图鉴：20 种，每种 坐 / 走 / 睡 三个姿势 */
{
  const poses = [CAT_ANIMS.find((a) => a.id === 'sit')!.frames[0], CAT_ANIMS.find((a) => a.id === 'walk')!.frames[1], CAT_ANIMS.find((a) => a.id === 'sleep_curl')!.frames[0]];
  const cols = 5, rows = Math.ceil(CAT_PRESETS.length / cols), cell = cw * 3;
  const sheet = new Img(cols * cell + 4, rows * ch + 4); bg(sheet);
  CAT_PRESETS.forEach((c, n) => poses.forEach((p, i) => sheet.blit(renderCat(c.look, p).img, 2 + (n % cols) * cell + i * cw, 2 + Math.floor(n / cols) * ch)));
  await sheet.savePreview(out('coats'), 4);
}
console.log('done', CAT_FRAME);

/** 放大看细节（×9）：选一批动作的每一帧 */
{
  const ids = ['walk', 'sit', 'lick_paw', 'groom', 'scratch', 'yawn', 'stretch', 'pounce', 'arch'];
  const picks: [string, number][] = [];
  for (const id of ids) { const a = CAT_ANIMS.find((x) => x.id === id)!; a.frames.forEach((_, i) => { if (i < 5) picks.push([id, i]); }); }
  const cols = 10, rows = Math.ceil(picks.length / cols);
  const sheet = new Img(cols * cw + 4, rows * ch + 4); bg(sheet);
  picks.forEach(([id, i], n) => sheet.blit(renderCat(CAT_PRESETS[6].look, CAT_ANIMS.find((x) => x.id === id)!.frames[i]).img, 2 + (n % cols) * cw, 2 + Math.floor(n / cols) * ch));
  await sheet.savePreview(out('zoom'), 8);
}

/** 正面 / 背面：每行一个动作，下方一行是 8 种毛色的正面坐姿 */
{
  const cols = Math.max(...CAT_FRONT_ANIMS.map((a) => a.frames.length));
  const sheet = new Img(cols * cw + 4, (CAT_FRONT_ANIMS.length + 2) * ch + 4); bg(sheet);
  CAT_FRONT_ANIMS.forEach((a, r) => a.frames.forEach((c, i) => sheet.blit(renderCatFront(CAT_PRESETS[6].look, c, a.back).img, 2 + i * cw, 2 + r * ch)));
  const sitC = CAT_FRONT_ANIMS.find((a) => a.id === 'sit_down')!.frames[0];
  [0, 1, 2, 3, 6, 10, 16, 17, 18, 19].forEach((n, i) => sheet.blit(renderCatFront(CAT_PRESETS[n].look, sitC).img, 2 + (i % 5) * cw, 2 + (CAT_FRONT_ANIMS.length + Math.floor(i / 5)) * ch));
  const wider = new Img(Math.max(sheet.w, 10 * cw + 4), sheet.h); bg(wider); wider.blit(sheet, 0, 0);
  await wider.savePreview(out('front'), 8);
}

/** 体型 / 长毛 / 耳型 / 尾型 / 配饰：同一只狸花，坐姿 + 走 + 正面 */
{
  const base = CAT_PRESETS[6].look;
  const variants: [string, CatLook][] = [['普通', base], ['胖', { ...base, build: 'chonky' }], ['修长', { ...base, build: 'slim' }], ['奶猫', { ...base, build: 'kitten' }], ['长毛', { ...base, fur: 'long', tail: 'fluffy' }],
    ['折耳', { ...base, ear: 'fold' }], ['短尾', { ...base, tail: 'bob' }], ['项圈', { ...base, acc: 'collar' }], ['铃铛', { ...base, acc: 'bell', accColor: '#3a8ad0' }], ['蝴蝶结', { ...base, acc: 'bow', accColor: '#e870a0' }], ['围巾', { ...base, acc: 'scarf', accColor: '#c4503c' }], ['异瞳', { ...CAT_PRESETS[18].look }]];
  const sit = CAT_ANIMS.find((a) => a.id === 'sit')!.frames[0], walk = CAT_ANIMS.find((a) => a.id === 'walk')!.frames[1], sitF = CAT_FRONT_ANIMS.find((a) => a.id === 'sit_down')!.frames[0];
  const sheet = new Img(variants.length * cw + 4, ch * 3 + 4); bg(sheet);
  variants.forEach(([, l], i) => { sheet.blit(renderCat(l, sit).img, 2 + i * cw, 2); sheet.blit(renderCat(l, walk).img, 2 + i * cw, 2 + ch); sheet.blit(renderCatFront(l, sitF).img, 2 + i * cw, 2 + ch * 2); });
  await sheet.savePreview(out('variants'), 6);
}

/** 补全的动作：只看新增的侧视动作（狸花 / 三花）、正面蹭腿与踩奶、两猫互动 */
{
  const newIds = ['rub', 'knead', 'roll', 'shake_water', 'shake_snow', 'chase_tail', 'carry_fish', 'carry_leaf', 'jump_up', 'jump_down', 'look_back'];
  const cols = 6, sheet = new Img(cols * cw * 2 + 4, newIds.length * ch + 4); bg(sheet);
  newIds.forEach((id, r) => { const a = CAT_ANIMS.find((x) => x.id === id)!; a.frames.forEach((p, i) => { if (i < cols) { sheet.blit(renderCat(CAT_PRESETS[6].look, p).img, 2 + i * cw, 2 + r * ch); } }); });
  newIds.forEach((id, r) => { const a = CAT_ANIMS.find((x) => x.id === id)!; a.frames.forEach((p, i) => { if (i < cols) sheet.blit(renderCat(CAT_PRESETS[3].look, p).img, 2 + (cols + i) * cw, 2 + r * ch); }); });
  await sheet.savePreview(out('new-actions'), 6);
  const fr = CAT_FRONT_ANIMS.filter((a) => a.id === 'rub_down' || a.id === 'knead_down');
  const s2 = new Img(6 * cw * 2 + 4, fr.length * ch + 4); bg(s2);
  fr.forEach((a, r) => a.frames.forEach((c, i) => { s2.blit(renderCatFront(CAT_PRESETS[0].look, c).img, 2 + i * cw, 2 + r * ch); s2.blit(renderCatFront(CAT_PRESETS[17].look, c).img, 2 + (6 + i) * cw, 2 + r * ch); }));
  await s2.savePreview(out('new-front'), 6);
  const pw = PAIR_FRAME.w + 2, s3 = new Img(4 * pw + 4, PAIR_ANIMS.length * ch + 4); bg(s3);
  const pairs: [CatLook, CatLook][] = [[CAT_PRESETS[0].look, CAT_PRESETS[9].look], [CAT_PRESETS[2].look, CAT_PRESETS[1].look], [CAT_PRESETS[6].look, CAT_PRESETS[7].look], [CAT_PRESETS[3].look, CAT_PRESETS[5].look]];
  PAIR_ANIMS.forEach((a, r) => a.frames.forEach((f, i) => { if (i < 4) s3.blit(renderPair(pairs[r][0], pairs[r][1], f), 2 + i * pw, 2 + r * ch); }));
  await s3.savePreview(out('pairs'), 6);
}
