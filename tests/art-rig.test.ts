import { describe, it, expect } from 'vitest';
import { ANIMS, CANVAS, PRESET_LOOKS, PORTRAIT, buildAll, frameMeta, renderFrame, renderPortrait, type Look } from '../tools/art/char-rig';
import { CAT_ANIMS, CAT_FRAME, CAT_FRONT_ANIMS, CAT_PRESETS, PAIR_ANIMS, PAIR_FRAME, renderCat, renderCatFront, renderPair } from '../tools/art/cat-rig';
import { EMOTES } from '../src/shared/emotes';
import { LOOK_CHOICES } from '../src/shared/profile';
import { COAT_COUNT } from '../src/shared/cats';
import { Img } from '../tools/art/px';

const hash = (img: Img) => { let h = 2166136261; for (const b of img.data) { h ^= b; h = Math.imul(h, 16777619); } return h >>> 0; };
const opaque = (img: Img) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++; return n; };
/** 不含脚下投影的不透明像素（投影的 alpha ≤ 62）是否碰到了画布边缘 */
const touchesEdge = (img: Img) => { for (let x = 0; x < img.w; x++) for (const y of [0, img.h - 1]) if (img.alpha(x, y) > 70) return true; for (let y = 0; y < img.h; y++) for (const x of [0, img.w - 1]) if (img.alpha(x, y) > 70) return true; return false; };

describe('人物 Rig', () => {
  it('预置造型数量覆盖档案里所有可选造型（LOOK_CHOICES）', () => {
    const all = [...LOOK_CHOICES.m, ...LOOK_CHOICES.f];
    expect(all.every((n) => Number.isInteger(n) && n >= 0 && n < PRESET_LOOKS.length)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });
  it('每个预置造型的每个动作的每一帧：尺寸 = frameMeta，不为空，不碰画布边缘', () => {
    const M = frameMeta(1);
    PRESET_LOOKS.forEach((look) => {
      for (const a of ANIMS) for (const v of a.views) if (!a.rot) a.frames.forEach((pose, i) => {   // 躺下是横画布（LIE_META），尺寸另测（tests/emotes.test.ts）
        const img = renderFrame(look, pose, v, i);
        expect([img.w, img.h]).toEqual([M.w, M.h]);
        expect(opaque(img)).toBeGreaterThan(200);
        expect(touchesEdge(img), `${a.id}_${v}_${i}`).toBe(false);
      });
    });
  });
  it('渲染是确定性的：同一外观同一动作两次的像素完全一致', () => {
    const look = PRESET_LOOKS[3], a = buildAll(look, 1), b = buildAll(look, 1);
    expect(Object.keys(a)).toEqual(Object.keys(b));
    for (const k of Object.keys(a)) expect(hash(a[k]), k).toBe(hash(b[k]));
  });
  it('buildAll 的键名：每个动作 × 视角（右向自动生成左向）× 帧', () => {
    const keys = Object.keys(buildAll(PRESET_LOOKS[0], 1));
    for (const a of ANIMS) for (const v of a.views) for (let i = 0; i < a.frames.length; i++) {
      expect(keys).toContain(`${a.id}_${v}_${i}`);
      if (v === 'right') expect(keys).toContain(`${a.id}_left_${i}`);
    }
    expect(keys).toContain('idle_down_0');            // 旧版站立帧别名 c{n}_down_0 指向它
  });
  it('脚点：站立帧里最低的鞋底像素行与 frameMeta.ay 的关系固定（所有外观一致），换帽子/发型不影响', () => {
    const lowest = (img: Img) => { for (let y = img.h - 1; y >= 0; y--) for (let x = 0; x < img.w; x++) if (img.alpha(x, y) > 200) return y; return -1; };
    const rows = new Set(PRESET_LOOKS.map((l) => lowest(renderFrame(l, ANIMS[0].frames[0], 'down'))));
    expect(rows.size).toBe(1);
    expect(frameMeta(1).ay - [...rows][0]).toBe(1);   // 最低的不透明行 = 鞋底描边，脚点在它下面 1 行（旧版 16×32 人物也是这个关系）
  });
  it('表情动作用到的姿势动画都存在（emotes.ts 的 pose）', () => {
    for (const e of EMOTES) if (e.pose) { const a = ANIMS.find((x) => x.id === e.pose); expect(a, e.pose).toBeTruthy(); /* 躺下是横画布（右 / 左） */ expect(a!.views).toContain(a!.rot ? 'right' : 'down'); }
  });
  it('2 倍分辨率与证件照：尺寸与不为空', () => {
    const img2 = renderFrame(PRESET_LOOKS[1], ANIMS[0].frames[0], 'down', 0, 2);
    expect([img2.w, img2.h]).toEqual([frameMeta(2).w, frameMeta(2).h]);
    const por = renderPortrait(PRESET_LOOKS[1], { bg: null, expr: 'smile' });
    expect([por.w, por.h]).toEqual([PORTRAIT.w, PORTRAIT.h]);
    expect(opaque(por)).toBeGreaterThan(600);
    expect(CANVAS.ox).toBeGreaterThan(0);
  });
  it('换发色/衣服/眼镜会改变像素，换动作不改变外观的主色', () => {
    const base: Look = PRESET_LOOKS[0], pose = ANIMS[0].frames[0];
    const h0 = hash(renderFrame(base, pose, 'down'));
    expect(hash(renderFrame({ ...base, hairColor: '#e87aa0' }, pose, 'down'))).not.toBe(h0);
    expect(hash(renderFrame({ ...base, top: 'labcoat' }, pose, 'down'))).not.toBe(h0);
    expect(hash(renderFrame({ ...base, glasses: 'sun' }, pose, 'down'))).not.toBe(h0);
  });
});

describe('小猫 Rig', () => {
  it('侧视 / 正面 / 背面每一帧：尺寸 = CAT_FRAME，不为空，不碰画布边缘（24 种预置毛色）', () => {
    for (const c of CAT_PRESETS) {
      for (const a of CAT_ANIMS) a.frames.forEach((p, i) => {
        const { img } = renderCat(c.look, p);
        expect([img.w, img.h]).toEqual([CAT_FRAME.w, CAT_FRAME.h]);
        expect(opaque(img), `${c.name} ${a.id}_${i}`).toBeGreaterThan(40);
        expect(touchesEdge(img), `${c.name} ${a.id}_${i}`).toBe(false);
      });
      for (const a of CAT_FRONT_ANIMS) a.frames.forEach((p, i) => { const { img } = renderCatFront(c.look, p, a.back); expect([img.w, img.h]).toEqual([CAT_FRAME.w, CAT_FRAME.h]); expect(opaque(img), `${c.name} ${a.id}_${i}`).toBeGreaterThan(40); });
    }
  });
  it('确定性：同一毛色同一姿势两次一致；不同毛色不同', () => {
    const p = CAT_ANIMS[0].frames[0];
    expect(hash(renderCat(CAT_PRESETS[6].look, p).img)).toBe(hash(renderCat(CAT_PRESETS[6].look, p).img));
    const hs = new Set(CAT_PRESETS.map((c) => hash(renderCat(c.look, p).img)));
    expect(hs.size).toBe(CAT_PRESETS.length);
  });
  it('动作名不重复；游戏里用到的动作都存在；旧版帧名对应的动作还在', () => {
    const ids = [...CAT_ANIMS.map((a) => a.id), ...CAT_FRONT_ANIMS.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['walk', 'trot', 'run', 'sit', 'sleep_curl', 'sleep_side', 'eat', 'lick_paw', 'groom', 'scratch', 'stretch', 'yawn', 'loaf', 'look_back', 'meow', 'rub', 'knead', 'roll', 'slow_blink', 'shake_water', 'shake_snow', 'walk_down', 'walk_up', 'sit_down', 'sit_up', 'rub_down', 'knead_down', 'slow_blink_down', 'meow_down', 'loaf_down']) expect(ids, id).toContain(id);
  });
  it('锚点：头/嘴/尾尖在画布内', () => {
    for (const a of CAT_ANIMS) a.frames.forEach((p) => { const { anchors } = renderCat(CAT_PRESETS[0].look, p); for (const [x, y] of Object.values(anchors)) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(CAT_FRAME.w + 8); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(CAT_FRAME.h); } });
  });
  it('毛色编号与预置一一对应（0–5 是老猫的橘/黑/白/三花/奶牛/灰，冻结；6 起是第二批）', () => {
    expect(COAT_COUNT).toBe(CAT_PRESETS.length);
    expect(CAT_PRESETS.slice(0, 6).map((c) => c.name)).toEqual(['橘猫', '黑猫', '白猫', '三花', '奶牛', '灰猫']);
  });
  it('两只猫互动：成对渲染尺寸固定，有内容', () => {
    for (const a of PAIR_ANIMS) for (const f of a.frames) { const img = renderPair(CAT_PRESETS[0].look, CAT_PRESETS[1].look, f); expect([img.w, img.h]).toEqual([PAIR_FRAME.w, PAIR_FRAME.h]); expect(opaque(img)).toBeGreaterThan(200); }
  });
});
