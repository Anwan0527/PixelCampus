import { describe, it, expect } from 'vitest';
import { HELD, HELD_MAX, cleanHeld, heldDef } from '../src/shared/held';
import { HELD_ART, buildHeld } from '../src/art/held';
import { COAT_COUNT, COAT_LABELS, COAT_NAMES, COAT_RARITY } from '../src/shared/cats';
import { RARITY_COLORS, RARITY_NAMES } from '../src/shared/fishing';
import { CAT_PRESETS } from '../tools/art/cat-rig';

describe('手持物', () => {
  it('编号从 1 连续，key 唯一，每件都有三个视角的图', () => {
    expect(HELD.map((h) => h.id)).toEqual(Array.from({ length: HELD_MAX }, (_, i) => i + 1));
    expect(new Set(HELD.map((h) => h.key)).size).toBe(HELD.length);
    const frames = buildHeld();
    for (const h of HELD) { expect(HELD_ART[h.key], h.key).toBeTruthy(); for (const v of ['down', 'right', 'up']) { const f = frames[`held_${h.key}_${v}`]; expect(f, `${h.key}_${v}`).toBeTruthy(); expect(f.w).toBeGreaterThan(3); expect(f.w).toBeLessThanOrEqual(14); expect(f.h).toBeLessThanOrEqual(14); } }
  });
  it('图里每一行等宽（否则像素会错位）', () => {
    for (const [k, a] of Object.entries(HELD_ART)) for (const v of ['down', 'right', 'up'] as const) expect(new Set(a[v].map((r) => r.length)).size, `${k}_${v}`).toBe(1);
  });
  it('cleanHeld：只接受 0–HELD_MAX 的整数，别的一律当放下', () => {
    for (let i = 0; i <= HELD_MAX; i++) expect(cleanHeld(i)).toBe(i);
    for (const bad of [-1, HELD_MAX + 1, 1.5, '2', null, undefined, NaN, {}, []]) expect(cleanHeld(bad)).toBe(0);
    expect(heldDef(2)?.key).toBe('tea'); expect(heldDef(0)).toBeUndefined();
  });
});

describe('猫图鉴的毛色数据', () => {
  it('毛色名、稀有度、预置毛色、名字表数量一致，稀有度都有名字和颜色', () => {
    expect(COAT_LABELS.length).toBe(COAT_COUNT); expect(COAT_RARITY.length).toBe(COAT_COUNT); expect(CAT_PRESETS.length).toBe(COAT_COUNT);
    COAT_RARITY.forEach((r) => { expect(RARITY_NAMES[r]).toBeTruthy(); expect(RARITY_COLORS[r]).toBeTruthy(); });
    COAT_LABELS.forEach((l, i) => expect(l.startsWith(CAT_PRESETS[i].name), `毛色 ${i}: ${l} / ${CAT_PRESETS[i].name}`).toBe(true));
    expect(COAT_NAMES.every((n) => n.length > 0)).toBe(true);
  });
});
