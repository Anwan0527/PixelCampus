import { describe, it, expect } from 'vitest';
import { APP_FIELDS, APP_LEN, FLAG, IDX, appKey, parseAppearance, randomAppearance, sameApp } from '../src/shared/appearance';
import { validateProfile } from '../src/shared/profile';
import { toPublic } from '../src/shared/protocol';
import { ANIMS, PRESET_LOOKS, appToLook, buildAnim, lookToApp, presetApp, renderFrame, renderPortrait, PORTRAIT, frameMeta } from '../src/art/char-rig';
import { Img } from '../tools/art/px';

const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const touchesEdge = (img: Img) => { for (let x = 0; x < img.w; x++) for (const y of [0, img.h - 1]) if (img.alpha(x, y) > 70) return true; for (let y = 0; y < img.h; y++) for (const x of [0, img.w - 1]) if (img.alpha(x, y) > 70) return true; return false; };

describe('外观数据 shared/appearance', () => {
  it('长度与各项取值个数固定（改它会让老档案失效，要同步考虑兼容）', () => {
    expect(APP_LEN).toBe(17);
    expect(APP_FIELDS.map((f) => f[1])).toEqual([8, 6, 10, 5, 24, 25, 8, 24, 24, 6, 24, 4, 5, 24, 5, 128, 25]);
    expect(IDX.flags).toBe(15);
  });
  it('parseAppearance：合法通过（返回副本）；长度不对、非整数、越界、非数组一律 undefined', () => {
    const ok = new Array(APP_LEN).fill(0);
    const p = parseAppearance(ok); expect(p).toEqual(ok); expect(p).not.toBe(ok);
    expect(parseAppearance(ok.slice(1))).toBeUndefined();
    expect(parseAppearance([...ok, 0])).toBeUndefined();
    for (let i = 0; i < APP_LEN; i++) {
      const hi = ok.slice(); hi[i] = APP_FIELDS[i][1]; expect(parseAppearance(hi), `项 ${i} 越上界`).toBeUndefined();
      const lo = ok.slice(); lo[i] = -1; expect(parseAppearance(lo), `项 ${i} 负数`).toBeUndefined();
      const fr = ok.slice(); fr[i] = 0.5; expect(parseAppearance(fr)).toBeUndefined();
      const st = ok.slice() as unknown[]; st[i] = '1'; expect(parseAppearance(st)).toBeUndefined();
    }
    for (const bad of [null, undefined, 5, 'abc', {}, { length: 17 }]) expect(parseAppearance(bad)).toBeUndefined();
  });
  it('每一项取到最大值也合法（上界是闭的）', () => {
    expect(parseAppearance(APP_FIELDS.map((f) => f[1] - 1))).toBeTruthy();
  });
  it('随机外观永远合法、并且互相不同', () => {
    const r = rng(7), seen = new Set<string>();
    for (let i = 0; i < 500; i++) { const a = randomAppearance(r); expect(parseAppearance(a), JSON.stringify(a)).toBeTruthy(); seen.add(appKey(a)); }
    expect(seen.size).toBeGreaterThan(480);
  });
  it('appKey 稳定、sameApp 判断相等', () => {
    const a = randomAppearance(rng(1)), b = a.slice();
    expect(appKey(a)).toBe(appKey(b)); expect(sameApp(a, b)).toBe(true);
    b[IDX.hairColor] = (b[IDX.hairColor] + 1) % 24; expect(appKey(a)).not.toBe(appKey(b)); expect(sameApp(a, b)).toBe(false);
    expect(sameApp(undefined, undefined)).toBe(true); expect(sameApp(a, undefined)).toBe(false);
  });
});

describe('档案里的外观', () => {
  const base = { gender: 'f' as const, look: 1, name: '小工', college: '机电学院', major: '机械设计', year: 2024, motto: '' };
  it('合法的 app 保留进档案并进入 toPublic；老档案没有 app 照常通过', () => {
    const app = randomAppearance(rng(3));
    const r = validateProfile({ ...base, app }); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.profile.app).toEqual(app); expect(toPublic(r.profile).app).toEqual(app); }
    const r2 = validateProfile(base); expect(r2.ok).toBe(true);
    if (r2.ok) { expect('app' in r2.profile).toBe(false); expect('app' in toPublic(r2.profile)).toBe(false); }
  });
  it('不合法的 app 被丢弃（回退到预置造型），不拒绝整份档案', () => {
    const bad = new Array(APP_LEN).fill(0); bad[IDX.hair] = 99;
    const r = validateProfile({ ...base, app: bad }); expect(r.ok).toBe(true);
    if (r.ok) expect(r.profile.app).toBeUndefined();
    const r2 = validateProfile({ ...base, app: 'x' as unknown as number[] }); expect(r2.ok && r2.profile.app).toBeFalsy();
  });
  it('档案往返（JSON）后 app 不变', () => {
    const app = randomAppearance(rng(9)), r = validateProfile({ ...base, app });
    expect(r.ok).toBe(true);
    if (r.ok) { const again = validateProfile(JSON.parse(JSON.stringify(r.profile))); expect(again.ok && again.profile.app).toEqual(app); }
  });
});

describe('外观 ↔ Look 与渲染', () => {
  it('12 个预置都能映射成合法的外观数组，并能渲染', () => {
    PRESET_LOOKS.forEach((_, n) => { const a = presetApp(n); expect(parseAppearance(a), `预置 ${n}`).toBeTruthy(); const l = appToLook(a); expect(l.hair).toBe(PRESET_LOOKS[n].hair); expect(l.top).toBe(PRESET_LOOKS[n].top); expect(l.skin).toBe(PRESET_LOOKS[n].skin); });
  });
  it('lookToApp 把开关位映射对（耳机/书包/眼镜…）', () => {
    const a = lookToApp({ ...PRESET_LOOKS[4], mask: true, freckles: true, sock: true });
    expect(a[IDX.flags] & FLAG.headphones).toBeTruthy(); expect(a[IDX.flags] & FLAG.bag).toBeTruthy(); expect(a[IDX.flags] & FLAG.mask).toBeTruthy(); expect(a[IDX.flags] & FLAG.freckles).toBeTruthy(); expect(a[IDX.flags] & FLAG.sock).toBeTruthy();
    expect(lookToApp(PRESET_LOOKS[2])[IDX.glasses]).toBe(1);
  });
  it('随机外观的每个动作每一帧：尺寸固定、不为空、不碰画布边缘（找出顶出画布的发型/帽子组合）', () => {
    const r = rng(11), M = frameMeta(1);
    for (let n = 0; n < 40; n++) {
      const look = appToLook(randomAppearance(r));
      for (const a of ANIMS) for (const v of a.views) a.frames.forEach((pose, i) => {
        const img = renderFrame(look, pose, v, i);
        expect([img.w, img.h]).toEqual([M.w, M.h]);
        expect(touchesEdge(img), `${JSON.stringify(look)} ${a.id}_${v}_${i}`).toBe(false);
      });
    }
  });
  it('运行时用的 buildAnim 与构建期一致：同一外观同一动作两次像素相同', () => {
    const look = appToLook(randomAppearance(rng(5))), walk = ANIMS.find((a) => a.id === 'walk')!;
    const a = buildAnim(look, walk, 1), b = buildAnim(look, walk, 1);
    for (const k of Object.keys(a)) expect(Buffer.compare(Buffer.from(a[k].data), Buffer.from(b[k].data)), k).toBe(0);
  });
  it('证件照：任意外观尺寸固定、有内容', () => {
    const r = rng(21);
    for (let n = 0; n < 20; n++) { const p = renderPortrait(appToLook(randomAppearance(r)), { bg: null, expr: n % 2 ? 'smile' : 'neutral' }); expect([p.w, p.h]).toEqual([PORTRAIT.w, PORTRAIT.h]); let c = 0; for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) c++; expect(c).toBeGreaterThan(600); }
  });
});
