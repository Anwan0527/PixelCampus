/** 预览 Rig 原型：npx tsx tools/art/preview-rig.ts [k...]（k = 分辨率倍数，默认 1 和 2）→ .cache/preview/rig-*.png（k=2 的带 -hd 后缀） */
import { join } from 'node:path';
import { Img, Rng, hex } from './px.ts';
import { ANIMS, DYE_COLORS, HAIR_COLORS, PORTRAIT, SKIN_COLORS, frameMeta, renderFrame, renderPortrait, type Look } from './char-rig.ts';
import { CACHE } from '../paths.ts';

const bg = (img: Img, a = hex('#8fbf6a'), b = hex('#86b862')) => { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.set(x, y, (x + y * 2) % 13 === 0 ? b : a); };
export const HERO: Look = { skin: 1, hair: 'long', fringe: 'part', hairColor: '#5a3a24', top: 'hoodie', topColor: '#3f78c0', top2: '#e8e4da', bottom: 'jeans', bottomColor: '#3f6aa8', shoes: 'sneaker', bag: true, lanyard: true };
type V = 'down' | 'up' | 'right';
const argK = process.argv.slice(2).map(Number).filter(Boolean);

for (const k of argK.length ? argK : [1, 2]) {
  const M = frameMeta(k), cw = M.w + 2, ch = M.h + 2, sfx = k === 1 ? '' : '-hd', S = (b: number) => Math.max(1, Math.round(b / k));   // S(b)：k=1 的放大倍数 b → 不同 k 的预览在屏幕上大小相当
  const out = (n: string) => join(CACHE, 'preview', `rig-${n}${sfx}.png`);
  const v = (o: Partial<Look>): Look => ({ ...HERO, ...o });
  const vs = (o: Partial<Look>): Look => ({ ...HERO, hair: 'short', fringe: 'side', ...o });
  const frame = (l: Look, anim = 'idle', i = 0, view: V = 'down') => renderFrame(l, ANIMS.find((a) => a.id === anim)!.frames[i], view, i, k);

  // 动作联系表
  {
    const look = { ...HERO, hair: 'short' as const, fringe: 'side' as const };
    const maxCols = Math.max(...ANIMS.map((a) => a.views.length * a.frames.length));
    const sheet = new Img(cw * maxCols + 4, ch * ANIMS.length + 4); bg(sheet);
    ANIMS.forEach((a, r) => { let c = 0; for (const vw of a.views) a.frames.forEach((pose, i) => { sheet.blit(renderFrame(look, pose, vw, i, k), 2 + c * cw, 2 + r * ch); c++; }); });
    await sheet.savePreview(out('actions'), S(4));
  }
  const row = async (looks: Look[], name: string, anim = 'idle', i = 0, view: V = 'down', scale = S(6)) => {
    const sheet = new Img(looks.length * cw + 4, ch + 4); bg(sheet);
    looks.forEach((l, n) => sheet.blit(frame(l, anim, i, view), 2 + n * cw, 2));
    await sheet.savePreview(out(name), scale);
  };
  const hairs = ['buzz', 'short', 'bob', 'long', 'wavy', 'ponytail', 'twin', 'bun', 'twinbun', 'braid'] as const;
  await row(hairs.map((h) => v({ hair: h, fringe: 'side' })), 'hair-front');
  await row(hairs.map((h) => v({ hair: h, fringe: 'side' })), 'hair-back', 'idle', 0, 'up');
  await row(hairs.map((h) => v({ hair: h, fringe: 'side' })), 'hair-side', 'idle', 0, 'right');
  await row((['none', 'blunt', 'side', 'part', 'airy'] as const).map((f) => v({ fringe: f, hair: 'bob' })), 'fringe');
  await row(['tee', 'hoodie', 'sweater', 'shirt', 'jacket', 'cardigan', 'labcoat', 'jersey'].map((t, i) => vs({ top: t as Look['top'], topColor: ['#d96a58', '#3f78c0', '#e8dcc0', '#5a88c8', '#4a7a5a', '#8a5aa8', '#f2eee4', '#e8923a'][i], top2: ['#e8e4da', '#e8e4da', '#c4503c', '#e8e4da', '#e8e4da', '#f2eee4', '#e8e4da', '#fff'][i], lanyard: false, bag: false })), 'tops');
  await row(['jeans', 'wide', 'sport', 'shorts', 'skirt', 'longskirt'].map((b) => vs({ bottom: b as Look['bottom'], bottomColor: { jeans: '#3f6aa8', wide: '#6a6a78', sport: '#2a2a34', shorts: '#b89e66', skirt: '#8a5aa8', longskirt: '#7a4a58' }[b]!, sock: b === 'shorts' || b === 'skirt', top: 'tee', topColor: '#f2eee4', bag: false, lanyard: false })), 'bottoms');
  await row(['sneaker', 'boots', 'canvas', 'loafer'].map((s) => vs({ shoes: s as Look['shoes'], bottom: 'shorts', bottomColor: '#4a5a78', sock: s !== 'boots' })), 'shoes');
  await row(['cap', 'beanie', 'bucket', 'beret'].map((h, i) => vs({ hat: h as Look['hat'], hatColor: ['#3a5fa0', '#c4503c', '#e8dcc0', '#8a2f46'][i] })), 'hats');
  await row([vs({ glasses: 'round' }), vs({ glasses: 'sun' }), vs({ headphones: true }), vs({ mask: true }), vs({ scarf: '#c4503c' }), vs({ freckles: true }), vs({ lanyard: false, bag: false })], 'acc');

  // 眼镜与眼睛特写：5 种 × 4 肤色 × 4 种瞳色，每格左正面右侧面
  {
    const kinds = [undefined, 'round', 'square', 'sun', 'aviator'] as const, skins = [0, 2, 5, 7], eyeC = ['#5a3a2a', '#3a6a9a', '#3a7a4a', '#7a4a8a'];
    const sheet = new Img(kinds.length * 2 * cw + 4, skins.length * ch + 4); bg(sheet);
    skins.forEach((sk, r) => kinds.forEach((g, c) => {
      const l = vs({ skin: sk, glasses: g, bag: false, lanyard: false, eyeColor: eyeC[r], hairColor: ['#2f2430', '#5a3a24', '#d8a84e', '#a8402f'][r], fringe: r === 1 ? 'part' : 'side' });
      sheet.blit(frame(l), 2 + c * cw * 2, 2 + r * ch);
      sheet.blit(frame(l, 'idle', 0, 'right'), 2 + c * cw * 2 + cw, 2 + r * ch);
    }));
    await sheet.savePreview(out('glasses'), S(8));
    // 眼睛状态：睁眼 / 眨眼 / 笑 / 难过 / 张嘴
    const st = new Img(5 * cw + 4, ch + 4); bg(st);
    const eyesSeq: [string, number][] = [['idle', 0], ['idle', 2], ['wave', 0], ['sad', 0], ['laugh', 0]];
    eyesSeq.forEach(([a, i], n) => st.blit(frame(vs({ fringe: 'part', hairColor: '#2f2430' }), a, i), 2 + n * cw, 2));
    await st.savePreview(out('eyes'), S(10));
  }
  // 脖子与肩线
  {
    const hs = ['short', 'bob', 'long', 'wavy', 'twin', 'braid'] as const;
    const neck = new Img(hs.length * cw + 4, ch * 2 + 4); bg(neck);
    hs.forEach((h, i) => (['tee', 'sweater'] as const).forEach((t, r) => neck.blit(frame(v({ hair: h, fringe: 'part', top: t, topColor: t === 'tee' ? '#f2eee4' : '#d96a58', bag: false, lanyard: false })), 2 + i * cw, 2 + r * ch)));
    await neck.savePreview(out('neck'), S(8));
  }
  // 随机 48 + 发色
  {
    const rng = new Rng(20261102), pick = <T,>(a: readonly T[]) => rng.pick(a);
    const randomLook = (): Look => ({
      skin: rng.int(SKIN_COLORS.length), hair: pick(hairs), fringe: pick(['none', 'blunt', 'side', 'part', 'airy'] as const), hairColor: pick(HAIR_COLORS), tipColor: rng.chance(0.2) ? pick(HAIR_COLORS.slice(12)) : undefined,
      top: pick(['tee', 'hoodie', 'sweater', 'shirt', 'jacket', 'cardigan', 'labcoat', 'jersey'] as const), topColor: pick(DYE_COLORS), top2: pick(DYE_COLORS),
      bottom: pick(['jeans', 'wide', 'sport', 'shorts', 'skirt', 'longskirt'] as const), bottomColor: pick(DYE_COLORS), shoes: pick(['sneaker', 'boots', 'canvas', 'loafer'] as const), sock: rng.chance(0.5),
      hat: rng.chance(0.25) ? pick(['cap', 'beanie', 'bucket', 'beret'] as const) : undefined, hatColor: pick(DYE_COLORS),
      glasses: rng.chance(0.3) ? pick(['round', 'square', 'sun', 'aviator'] as const) : undefined, headphones: rng.chance(0.12), scarf: rng.chance(0.12) ? pick(DYE_COLORS) : undefined,
      bag: rng.chance(0.35), lanyard: rng.chance(0.35), freckles: rng.chance(0.2), eyeColor: pick(['#5a3a2a', '#3a2a22', '#3a6a9a', '#3a7a4a', '#7a4a8a', '#8a6a2a']),
    });
    const cols = 12, rows = 4, sheet = new Img(cols * cw + 4, rows * ch + 4); bg(sheet);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sheet.blit(frame(randomLook()), 2 + c * cw, 2 + r * ch);
    await sheet.savePreview(out('random48'), S(3));
    const hc = new Img(24 * cw + 4, ch * 2 + 4); bg(hc);
    HAIR_COLORS.forEach((c, i) => { hc.blit(frame(v({ hairColor: c, hair: 'long', fringe: 'part' })), 2 + i * cw, 2); hc.blit(frame(v({ hairColor: c, hair: 'twin', fringe: 'blunt', tipColor: HAIR_COLORS[12 + ((i + 5) % 12)] })), 2 + i * cw, 2 + ch); });
    await hc.savePreview(out('haircolors'), S(3));
  }
  console.log('done k=' + k, M);
}

/** 证件照：不同发型/眼镜/表情/底色，×5 */
{
  const hv = (o: Partial<Look>): Look => ({ ...HERO, bag: false, lanyard: true, ...o });
  const list: [Look, 'neutral' | 'smile' | 'happy', string][] = [
    [hv({ hair: 'long', fringe: 'part' }), 'smile', '#cfe3f2'], [hv({ hair: 'short', fringe: 'side', skin: 2, glasses: 'round', hairColor: '#2f2430' }), 'neutral', '#f2d8d0'],
    [hv({ hair: 'twin', fringe: 'blunt', hairColor: '#e87aa0', skin: 0, tipColor: '#b88ae0' }), 'happy', '#d8e8cc'], [hv({ hair: 'bob', fringe: 'airy', hairColor: '#d8a84e', skin: 4, eyeColor: '#3a6a9a' }), 'smile', '#e8dcf2'],
    [hv({ hair: 'short', fringe: 'part', glasses: 'sun', skin: 5, hairColor: '#1c1620', top: 'jacket', topColor: '#4a7a5a' }), 'neutral', '#f4e6c0'], [hv({ hair: 'wavy', fringe: 'part', hairColor: '#a8402f', glasses: 'aviator', skin: 1, top: 'sweater', topColor: '#e8dcc0' }), 'smile', '#cfe3f2'],
    [hv({ hair: 'bun', fringe: 'blunt', hairColor: '#5a3a24', glasses: 'square', skin: 7, top: 'labcoat', topColor: '#f2eee4' }), 'smile', '#d8e8cc'], [hv({ hair: 'braid', fringe: 'side', hairColor: '#8a5a2b', skin: 3, eyeColor: '#3a7a4a', top: 'cardigan', topColor: '#8a5aa8' }), 'happy', '#f2d8d0'],
  ];
  const pw = PORTRAIT.w + 4, sheet = new Img(list.length * pw + 4, PORTRAIT.h + 8); bg(sheet, hex('#efe8d8'), hex('#e8e0cc'));
  list.forEach(([l, e, b], i) => sheet.blit(renderPortrait(l, { expr: e, bg: b }), 4 + i * pw, 4));
  await sheet.savePreview(join(CACHE, 'preview', 'rig-portraits-hd.png'), 5);
}

/** 新姿势（蹲下伸手 / 钓鱼 / 咬钩 / 坐）：每行一个动作，帧按 视角 × 帧 排开（×6） */
{
  const k = 1, M = frameMeta(k), cw = M.w + 2, ch = M.h + 2, ids = ['crouch', 'fish', 'fish_bite', 'sit'];
  const look = { ...HERO, hair: 'short' as const, fringe: 'side' as const, bag: false };
  const sheet = new Img(cw * 8 + 4, ch * ids.length + 4); bg(sheet);
  ids.forEach((id, r) => { const a = ANIMS.find((x) => x.id === id)!; let c = 0; for (const v of a.views) a.frames.forEach((pose, i) => { sheet.blit(renderFrame(look, pose, v, i, k), 2 + c * cw, 2 + r * ch); c++; }); });
  await sheet.savePreview(join(CACHE, 'preview', 'rig-new-poses.png'), 6);
}
