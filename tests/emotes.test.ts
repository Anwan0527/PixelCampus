import { describe, expect, it } from 'vitest';
import { EMOTES, EMOTE_COOLDOWN_MS, EMOTE_GROUPS, emoteBlocked, emoteDef } from '../src/shared/emotes';
import { ANIMS, LIE_META, PRESET_LOOKS, buildAll, frameMeta, renderLie } from '../src/art/char-rig';

describe('表情目录（2026-11 扩充到 23 个）', () => {
  it('编号稳定连续、图标和名字非空、名字不重复、时长合理；老的 9 个编号和含义不变', () => {
    expect(EMOTES.length).toBe(23);
    EMOTES.forEach((e, i) => { expect(e.id).toBe(i); expect(e.icon.length).toBeGreaterThan(0); expect(e.name.length).toBeGreaterThan(0); expect(e.ms).toBeGreaterThanOrEqual(1000); expect(e.ms).toBeLessThanOrEqual(4000); });
    expect(new Set(EMOTES.map((e) => e.name)).size).toBe(EMOTES.length);
    expect(EMOTES.slice(0, 9).map((e) => e.name)).toEqual(['挥手', '爱心', '大笑', '难过', '跳舞', '欢呼', '打盹', '疑惑', '点赞']);
    expect(emoteDef(22)?.name).toBe('坐地'); expect(emoteDef(23)).toBeUndefined(); expect(emoteDef(-1)).toBeUndefined(); expect(emoteDef(1.5)).toBeUndefined(); expect(emoteDef('3')).toBeUndefined();
    expect(EMOTE_COOLDOWN_MS).toBeGreaterThan(0);
  });
  it('主人点名的都有：躺下、坐下（坐地）、转圈圈、哭泣、生气', () => {
    const names = EMOTES.map((e) => e.name);
    for (const n of ['躺下', '坐地', '转圈圈', '痛哭', '生气']) expect(names, n).toContain(n);
  });
  it('持续型表情必须有姿势动画、要求站着；转圈圈要求站着；老表情都不限状态', () => {
    for (const e of EMOTES) { if (e.hold) { expect(e.pose, e.name).toBeTruthy(); expect(e.stand, e.name).toBe(true); } }
    expect(emoteDef(21)).toMatchObject({ hold: true, stand: true, pose: 'lie' });
    expect(emoteDef(20)).toMatchObject({ anim: 'spin', stand: true });
    for (let i = 0; i < 9; i++) expect(EMOTES[i].stand).toBeFalsy();
  });
  it('分组：每个表情恰好出现在一个分组里；按键 1–9 对应的老表情（0–8）在面板里都找得到', () => {
    const all = EMOTE_GROUPS.flatMap((g) => g.ids);
    expect(new Set(all).size).toBe(all.length); expect([...all].sort((a, b) => a - b)).toEqual(EMOTES.map((e) => e.id));
    for (const g of EMOTE_GROUPS) for (const id of g.ids) expect(EMOTES[id].group, `${EMOTES[id].name} 的分组字段和面板分组一致`).toBe(g.id);
  });
  it('状态限制：骑车 / 后座 / 坐椅子 / 钓鱼 / 被牵着时不能躺下、转圈；普通表情不受限；站着可以', () => {
    const lie = emoteDef(21)!, wave = emoteDef(0)!;
    expect(emoteBlocked(lie, {})).toBeNull();
    for (const st of [{ riding: true }, { pax: true }, { sitting: true }, { fishing: true }, { led: true }]) { expect(emoteBlocked(lie, st)).toBeTruthy(); expect(emoteBlocked(wave, st)).toBeNull(); }
  });
});

describe('表情姿势美术', () => {
  it('目录里用到的姿势动画都存在；躺下是横画布（rot=lie），其余新姿势只有正面视角', () => {
    for (const e of EMOTES) if (e.pose) { const a = ANIMS.find((x) => x.id === e.pose); expect(a, e.pose).toBeTruthy(); }
    expect(ANIMS.find((a) => a.id === 'lie')).toMatchObject({ rot: 'lie', views: ['right'] });
    for (const id of ['cry', 'angry', 'shy', 'bow', 'clap', 'yawn', 'stretch', 'peace', 'daze', 'shrug', 'shock', 'sitg']) expect(ANIMS.find((a) => a.id === id)!.views).toEqual(['down']);
  });
  it('新姿势每一帧：尺寸 = frameMeta，不为空，不碰画布边缘（所有预置造型）', () => {
    const M = frameMeta(1), ids = ['cry', 'angry', 'shy', 'bow', 'clap', 'yawn', 'stretch', 'peace', 'daze', 'shrug', 'shock', 'sitg'];
    for (const look of PRESET_LOOKS) for (const id of ids) {
      const keys = buildAll(look, 1);
      const a = ANIMS.find((x) => x.id === id)!;
      a.frames.forEach((_, i) => { const img = keys[`${id}_down_${i}`]; expect([img.w, img.h], `${id}_${i}`).toEqual([M.w, M.h]); let n = 0, edge = false; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.alpha(x, y) > 0) { n++; if (x === 0 || y === 0 || x === img.w - 1) edge = true; } expect(n, `${id}_${i}`).toBeGreaterThan(200); expect(edge, `${id}_${i} 碰到边缘`).toBe(false); });
    }
  });
  it('躺下：尺寸 = LIE_META，每个造型两帧都不为空且左向是右向的镜像；锚点在画布里', () => {
    expect(LIE_META.w).toBeGreaterThan(LIE_META.h); expect(LIE_META.ax).toBeGreaterThan(0); expect(LIE_META.ax).toBeLessThan(LIE_META.w); expect(LIE_META.ay).toBeGreaterThan(0); expect(LIE_META.ay).toBeLessThan(LIE_META.h);
    const lie = ANIMS.find((a) => a.id === 'lie')!;
    for (const look of PRESET_LOOKS) {
      const all = buildAll(look, 1);
      lie.frames.forEach((pose, i) => {
        const r = renderLie(look, pose, i), R = all[`lie_right_${i}`], L = all[`lie_left_${i}`];
        expect([r.w, r.h]).toEqual([LIE_META.w, LIE_META.h]); expect([L.w, L.h]).toEqual([LIE_META.w, LIE_META.h]);
        let n = 0, mirrored = true; for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) { if (R.alpha(x, y) > 0) n++; if (R.alpha(x, y) !== L.alpha(R.w - 1 - x, y)) mirrored = false; }
        expect(n).toBeGreaterThan(300); expect(mirrored).toBe(true);
      });
    }
  });
  it('新表情的脸：生气 / 哭 / 害羞 / 受惊的像素和平常的脸不一样（不是同一张图）', () => {
    const base = buildAll(PRESET_LOOKS[1], 1), sig = (img: { data: Uint8ClampedArray }) => Array.from(img.data).join(',');
    const idle = sig(base['idle_down_0']);
    for (const id of ['cry', 'angry', 'shy', 'shock']) expect(sig(base[`${id}_down_0`]), id).not.toBe(idle);
  });
});
