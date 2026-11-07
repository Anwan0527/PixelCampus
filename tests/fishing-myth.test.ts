import { describe, expect, it } from 'vitest';
import { FISH, rollFish, fishWeight, type FishEnv } from '../src/shared/fishing';
import { BAITS, resolveGear } from '../src/shared/gear';
import { itemDef } from '../src/shared/items';

const seq = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const HIGH = new Set(['epic', 'legendary', 'mythic']);

describe('神话饵：只钓史诗及以上', () => {
  it('神话饵解析出 mythicBait 标记；说明里写明只钓史诗及以上', () => {
    const g = resolveGear({ fishing_rod: 1, bait_myth: 1 }, { rod: '', bait: 'bait_myth' } as never, { night: false, rain: false, season: 'spring' } as never);
    expect(g.bait?.id).toBe('bait_myth'); expect(g.mythicBait).toBe(true);
    expect(BAITS.find((b) => b.id === 'bait_myth')!.eff).toContain('史诗');
    expect(itemDef('bait_myth')!.desc).toContain('史诗');
  });
  it('抽 20000 次：从不出稀有及以下的鱼、杂物；史诗和传说都有', () => {
    const rnd = seq(7), seen = new Set<string>();
    for (const env of [{ night: false }, { night: true, rain: true, season: 'winter' }, { night: true, season: 'summer' }, { night: false, season: 'spring', luck: 1.4 }] as FishEnv[]) {
      for (let i = 0; i < 5000; i++) { const { def } = rollFish(rnd, { ...env, floor: 'epic' }); expect(HIGH.has(def.rarity), `${def.id} ${def.rarity}`).toBe(true); seen.add(def.rarity); }
    }
    expect(seen.has('epic')).toBe(true); expect(seen.has('legendary')).toBe(true);
  });
  it('神话鱼条件满足时仍然可以抽到（神话饵本来的作用保留）', () => {
    const rnd = seq(3), myth = FISH.filter((f) => f.rarity === 'mythic')[0];
    let hit = 0;
    for (let i = 0; i < 4000; i++) { const { def } = rollFish(rnd, { night: false, floor: 'epic', mythic: (f) => f.id === myth.id }); if (def.id === myth.id) hit++; }
    expect(hit).toBeGreaterThan(0);
  });
  it('没有 floor 时行为不变（普通饵照旧能抽到常见鱼 / 杂物）', () => {
    const rnd = seq(11), r = new Set<string>();
    for (let i = 0; i < 3000; i++) r.add(rollFish(rnd, { night: false }).def.rarity);
    expect(r.has('common')).toBe(true); expect(r.has('junk')).toBe(true);
    expect(fishWeight(FISH.find((f) => f.id === 'fish_crucian')!, { night: false, floor: 'epic' })).toBe(0);
    expect(fishWeight(FISH.find((f) => f.id === 'fish_crucian')!, { night: false })).toBeGreaterThan(0);
  });
  it('兜底：环境把史诗以上全压成 0 时，放宽环境倍率再抽，仍然只出史诗以上，不会卡死', () => {
    const rnd = seq(5);
    for (let i = 0; i < 500; i++) { const { def } = rollFish(rnd, { night: false, floor: 'epic', mul: () => 0 }); expect(HIGH.has(def.rarity), def.id).toBe(true); expect(def.source).not.toBe('box'); }
  });
});
