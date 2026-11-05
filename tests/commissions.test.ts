import { describe, it, expect } from 'vitest';
import { COMM_TEMPLATES, WEEK_ALL_REWARD, cleanCommSave, commDelta, dailyCommission, describe as describeComm, emptyCommSave, estimateCasts, weekNo, weeklyCommissions, type CommEvent, type Commission } from '../src/shared/commissions';
import { LAKE_FISH, fishDef } from '../src/shared/fishing';
import { itemDef } from '../src/shared/items';
import { marketDay } from '../src/shared/economy';

const ev = (id: string, o: Partial<Extract<CommEvent, { t: 'catch' }>> = {}): CommEvent => { const def = fishDef(id)!; return { t: 'catch', def, cm: def.minCm ?? 0, perfect: false, night: false, rain: false, season: 'spring', bait: 'bait', n: 1, ...o }; };
const mk = (f: Commission['f'], goal = 1): Commission => ({ id: 'mid', tier: 'mid', name: 't', desc: '', goal, f, reward: { coins: 0, items: [], xp: 0 } });

describe('委托：周编号与抽取', () => {
  it('周一 0 点（东八区）换周：连续 28 天里，周编号只在周一变化，一周 7 天', () => {
    const d0 = marketDay(Date.UTC(2026, 10, 1, 4)); // 2026-11-01 12:00 东八区
    let changes = 0; for (let d = d0; d < d0 + 28; d++) { const wd = new Date(d * 86400e3).getUTCDay(); if (weekNo(d) !== weekNo(d - 1)) { changes++; expect(wd).toBe(1); } }
    expect(changes).toBeGreaterThanOrEqual(3); expect(weekNo(d0 + 7)).toBe(weekNo(d0) + 1);
  });
  it('同一周永远抽出一样的 3 个（中等 / 困难 / 极难，三档类型不重复）；同一天同一个每日委托', () => {
    const a = weeklyCommissions(2900), b = weeklyCommissions(2900);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(a.map((c) => c.tier)).toEqual(['mid', 'hard', 'extreme']); expect(a.map((c) => c.id)).toEqual(['mid', 'hard', 'extreme']);
    expect(JSON.stringify(dailyCommission(20400))).toBe(JSON.stringify(dailyCommission(20400))); expect(dailyCommission(20400).tier).toBe('daily');
    expect(new Set(Array.from({ length: 60 }, (_, i) => weeklyCommissions(2900 + i).map((c) => c.desc).join('|'))).size).toBeGreaterThan(40); // 周周不同
  });
  it('任意 2000 周 / 2000 天：委托合法——有说明、目标 > 0、指名的鱼是湖里的稀有鱼、奖励物品都存在、币在区间里', () => {
    const rare = new Set(LAKE_FISH.filter((f) => f.rarity === 'rare').map((f) => f.id));
    const range: Record<string, [number, number]> = { daily: [40, 80], mid: [300, 450], hard: [600, 900], extreme: [1000, 1500] };
    const check = (c: Commission) => {
      expect(c.desc.length, c.desc).toBeGreaterThan(4); expect(c.goal).toBeGreaterThan(0); expect(c.reward.xp).toBeGreaterThan(0);
      expect(c.reward.coins).toBeGreaterThanOrEqual(range[c.tier][0]); expect(c.reward.coins).toBeLessThanOrEqual(range[c.tier][1]);
      for (const g of c.reward.items) { expect(itemDef(g.id), g.id).toBeTruthy(); expect(g.n).toBeGreaterThan(0); }
      if (c.f.fish && c.f.baits?.[0] === 'bait_name') expect(rare.has(c.f.fish)).toBe(true);
      if (c.f.minPct !== undefined) { const d = fishDef(c.f.fish ?? LAKE_FISH[0].id)!; expect(d.minCm).toBeDefined(); expect(c.f.minPct).toBeLessThanOrEqual(1); }
      if (c.tier === 'daily') expect(c.f.rain).toBeUndefined(); // 每日委托不看天气
    };
    for (let w = 2800; w < 4800; w++) weeklyCommissions(w).forEach(check);
    for (let d = 20000; d < 22000; d++) check(dailyCommission(d));
    expect(WEEK_ALL_REWARD.items.every((g) => !!itemDef(g.id))).toBe(true);
  });
  it('难度回归：最合适环境下完成所需的抛竿数下限——每日 ≥ 5、中等 ≥ 25、困难 ≥ 100（指名类除外）、极难 ≥ 230；没有一个委托是"几十次抛竿就刷完"', () => {
    const floor: Record<string, number> = { daily: 5, mid: 25, hard: 100, extreme: 230 };
    for (const tier of ['daily', 'mid', 'hard', 'extreme'] as const) for (const t of COMM_TEMPLATES[tier]) for (let k = 0; k < 12; k++) {
      let s = k * 977 + 5; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const c: Commission = { ...mk(t.f(rnd), t.goal), tier, id: tier }; const e = estimateCasts(c);
      if (t.kind !== 'named') expect(e, `${tier} ${t.kind}`).toBeGreaterThanOrEqual(floor[tier]);
      expect(Number.isFinite(e), `${tier} ${t.kind}`).toBe(true);
    }
  });
  it('狂钓党一周（3500 次抛竿）：周委托没有只靠堆数量就能完成的——所有周委托的最低抛竿数都比"目标数量"大（要靠条件 / 运气）或目标本身就大', () => {
    for (const tier of ['mid', 'hard', 'extreme'] as const) for (const t of COMM_TEMPLATES[tier]) {
      let s = 3; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const c: Commission = { ...mk(t.f(rnd), t.goal), tier, id: tier };
      // 不带任何条件、goal 只是数量的委托（恰好就是"钓 N 条鱼"）在周委托里不存在
      const hasCond = !!(c.f.night !== undefined || c.f.rain || c.f.season || c.f.minRarity || c.f.baits || c.f.perfect || c.f.fish || c.f.minPct !== undefined || c.f.distinct || c.f.box);
      expect(hasCond, `${tier} ${t.kind}`).toBe(true);
    }
  });
});

describe('委托：进度判定与描述', () => {
  it('夜里 / 雨天 / 季节 / 稀有度 / 饵 / 完美 / 指定鱼 / 个头：全部满足才计数；双钓数量算两条（完美、个头类只算一次）；杂物不算', () => {
    expect(commDelta(mk({ night: true }), ev('fish_carp', { night: true }))).toBe(1); expect(commDelta(mk({ night: true }), ev('fish_carp'))).toBe(0);
    expect(commDelta(mk({ night: true }), ev('fish_carp', { night: true, n: 2 }))).toBe(2); expect(commDelta(mk({}), ev('junk_boot'))).toBe(0);
    expect(commDelta(mk({ rain: true }), ev('fish_carp', { rain: true }))).toBe(1); expect(commDelta(mk({ season: 'winter' }), ev('fish_carp', { season: 'winter' }))).toBe(1); expect(commDelta(mk({ season: 'winter' }), ev('fish_carp'))).toBe(0);
    expect(commDelta(mk({ minRarity: 'rare' }), ev('fish_carp'))).toBe(0); expect(commDelta(mk({ minRarity: 'rare' }), ev('fish_koi'))).toBe(1); expect(commDelta(mk({ minRarity: 'rare' }), ev('fish_sturgeon'))).toBe(1);
    expect(commDelta(mk({ baits: ['bait_glow', 'bait_wild'] }), ev('fish_carp', { bait: 'bait_wild' }))).toBe(1); expect(commDelta(mk({ baits: ['bait_glow'] }), ev('fish_carp'))).toBe(0);
    expect(commDelta(mk({ perfect: true }), ev('fish_carp', { perfect: true, n: 2 }))).toBe(1); expect(commDelta(mk({ perfect: true }), ev('fish_carp'))).toBe(0);
    expect(commDelta(mk({ fish: 'fish_eel', baits: ['bait_name'] }), ev('fish_eel', { bait: 'bait_name' }))).toBe(1); expect(commDelta(mk({ fish: 'fish_eel' }), ev('fish_koi'))).toBe(0);
    const carp = fishDef('fish_carp')!, big = carp.minCm! + (carp.maxCm! - carp.minCm!) * 0.85;
    expect(commDelta(mk({ minPct: 0.8 }), ev('fish_carp', { cm: Math.ceil(big) }))).toBe(1); expect(commDelta(mk({ minPct: 0.8 }), ev('fish_carp', { cm: carp.minCm! + 1 }))).toBe(0); expect(commDelta(mk({ minPct: 0.8 }), ev('fish_carp', { cm: Math.ceil(big), n: 2 }))).toBe(1);
  });
  it('种类数：同一种只算一次（调用方把种类记进 seen）；开盲盒：open 每个算、gem 只有珍品算；盲盒委托不吃钓鱼事件，反之亦然', () => {
    const c = mk({ distinct: true }, 3); expect(commDelta(c, ev('fish_carp'), [])).toBe(1); expect(commDelta(c, ev('fish_carp'), ['fish_carp'])).toBe(0); expect(commDelta(c, ev('junk_boot'), [])).toBe(0);
    expect(commDelta(mk({ box: 'open' }), { t: 'box', gem: false })).toBe(1); expect(commDelta(mk({ box: 'gem' }), { t: 'box', gem: false })).toBe(0); expect(commDelta(mk({ box: 'gem' }), { t: 'box', gem: true })).toBe(1);
    expect(commDelta(mk({ box: 'open' }), ev('fish_carp'))).toBe(0); expect(commDelta(mk({ night: true }), { t: 'box', gem: true })).toBe(0);
  });
  it('描述：条件写得清楚', () => {
    expect(describeComm({ night: true }, 30, 'week')).toBe('夜里钓到 30 条鱼'); expect(describeComm({ season: 'winter', night: true }, 100, 'week')).toBe('冬天夜里钓到 100 条鱼');
    expect(describeComm({ rain: true, night: true, minRarity: 'rare' }, 50, 'week')).toBe('夜里下雨时钓到 50 条稀有及以上的鱼'); expect(describeComm({ distinct: true }, 12, 'week')).toBe('本周钓到 12 种不同的鱼'); expect(describeComm({ distinct: true }, 4, 'day')).toBe('今天钓到 4 种不同的鱼');
    expect(describeComm({ perfect: true, minRarity: 'rare' }, 20, 'week')).toContain('完美拉鱼 20 次'); expect(describeComm({ box: 'gem' }, 2, 'week')).toContain('珍品'); expect(describeComm({ minPct: 0.95, minRarity: 'uncommon' }, 1, 'week')).toContain('巨物');
    expect(describeComm({ baits: ['bait_glow', 'bait_wild'] }, 10, 'week')).toContain('夜光饵或野饵');
  });
  it('档案清洗：缺字段补默认；只留合法的档名 / 鱼 id；数字收敛', () => {
    expect(cleanCommSave(null)).toBeUndefined(); expect(cleanCommSave({})).toEqual(emptyCommSave(0, 0));
    const c = cleanCommSave({ week: 2900.5, prog: { mid: 7.9, hard: -1, x: 3 }, done: ['mid', 'mid', 'zzz'], claimed: ['hard'], sp: ['fish_carp', 'nope'], d: { day: 20400, prog: 4, done: true, claimed: false, sp: ['fish_koi'] } })!;
    expect(c).toEqual({ week: 2900, prog: { mid: 7 }, done: ['mid'], claimed: ['hard'], sp: ['fish_carp'], d: { day: 20400, prog: 4, done: true, claimed: false, sp: ['fish_koi'] } });
  });
});
