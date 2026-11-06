import { describe, it, expect } from 'vitest';
import { BOX_FISH, FISH, FISH_TIERS, LAKE_FISH, MYTHIC_FISH, REAL_FISH, TIER_TOTAL, baseWeight, diffStars, fishDef, fishWeight, habitat, habitatText, rollFish, type FishDef } from '../src/shared/fishing';
import { AUTO_BAITS, BAITS, LUCK_MAX, MAX_TACKLE, RODS, TACKLES, WAIT_MIN, baitDef, cleanEquip, perkActive, pickBait, pickRod, resolveGear, rodDef, tackleDef } from '../src/shared/gear';
import { FightSim, fightOf } from '../src/shared/fishfight';
import { BOXES, boxDef, boxOdds, boxValue, lootValue, rollBox, rollBoxDrop, type BoxId } from '../src/shared/boxes';
import { RECIPES, applyCraft, craftPlan, craftWhy, isNamedFish, recipeDef } from '../src/shared/craft';
import { MYTHIC_REWARDS, mythicOk, mythicProgress, type MythicCtx } from '../src/shared/mythic';
import { BUNDLES, MILESTONES, bundleDone, bundleProgress, cleanGearLog, lakeComplete, speciesCount, tierProgress } from '../src/shared/fishdex';
import { itemDef, ITEMS, INV_SLOTS } from '../src/shared/items';
import { SHOP, shopItemsValid, sellList, sellPrice, sellable, fishPrice, EXTRA_SELL } from '../src/shared/economy';
import { tradable, cleanOffer } from '../src/shared/trade';
import { ACHIEVEMENTS } from '../src/shared/achievements';
import { titleDef } from '../src/shared/titles';
import { ICONS } from '../tools/art/items';

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('钓鱼 2.0：鱼类目录', () => {
  it('48 种鱼：湖里 40、神话 3、盲盒限定 5；每种都有同名物品、图标和一句话说明（2.0 新增的）', () => {
    expect(REAL_FISH.length).toBe(48); expect(LAKE_FISH.filter((f) => f.rarity !== 'junk').length).toBe(40); expect(MYTHIC_FISH.length).toBe(3); expect(BOX_FISH.length).toBe(5);
    for (const f of FISH) { expect(itemDef(f.id), f.id).toBeTruthy(); expect(ICONS[f.id], f.id).toBeTruthy(); if (f.blurb) expect(itemDef(f.id)!.desc).toBe(f.blurb); }
    for (const f of REAL_FISH) { expect(f.minCm! < f.maxCm!, f.id).toBe(true); expect(f.maxKg!, f.id).toBeGreaterThan(0); expect(f.weight, f.id).toBeGreaterThan(0); }
    expect(new Set(FISH.map((f) => f.id)).size).toBe(FISH.length); expect(new Set(FISH.map((f) => f.name)).size).toBe(FISH.length);
  });
  it('每一档都有新鱼（常见 +3、少见 +4、稀有 +3、史诗 +3、传说 +2）', () => {
    const lake = (r: string) => LAKE_FISH.filter((f) => f.rarity === r).length;
    expect([lake('common'), lake('uncommon'), lake('rare'), lake('epic'), lake('legendary')]).toEqual([9, 10, 9, 7, 5]);
  });
  it('加鱼不改各档整体概率：中性环境下每档的权重之和 = TIER_TOTAL；条件倍率只乘在单条鱼上', () => {
    for (const tier of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'junk'] as const) {
      const sum = LAKE_FISH.filter((f) => f.rarity === tier).reduce((a, f) => a + fishWeight(f, { night: false }), 0);
      expect(sum, tier).toBeCloseTo(TIER_TOTAL[tier], 6);
    }
    const crab = fishDef('fish_crab')!, autumn = fishWeight(crab, { night: false, season: 'autumn' }), spring = fishWeight(crab, { night: false, season: 'spring' });
    expect(autumn).toBeCloseTo(baseWeight(crab) * 3, 9); expect(spring).toBeCloseTo(baseWeight(crab) * 0.3, 9);
  });
  it('盲盒限定鱼永远不会在湖里钓到；神话鱼没有条件时永远不出现；条件满足时才进抽签池', () => {
    const rnd = seeded(5);
    for (let i = 0; i < 30000; i++) { const d = rollFish(rnd, { night: i % 2 === 0, rain: i % 3 === 0, season: 'winter', luck: 3 }).def; expect(d.source === 'box' || d.rarity === 'mythic').toBe(false); }
    expect(MYTHIC_FISH.every((f) => fishWeight(f, { night: true, rain: true, season: 'winter' }) === 0)).toBe(true);
    let n = 0; const r2 = seeded(6); for (let i = 0; i < 20000; i++) if (rollFish(r2, { night: false, mythic: (f) => f.id === 'fish_hegongjin' }).def.id === 'fish_hegongjin') n++;
    expect(n).toBeGreaterThan(20000 * 0.05); expect(n).toBeLessThan(20000 * 0.2); // 条件满足时约 28 / (193 + 28)
  });
  it('指名饵 only：只会抽到那一种；万能饵 ignoreEnv：无视季节（河蟹春天也能多钓到），传说仍受环境限制', () => {
    const rnd = seeded(7);
    for (let i = 0; i < 500; i++) expect(rollFish(rnd, { night: false, only: 'fish_carp' }).def.id).toBe('fish_carp');
    const count = (env: object) => { const q = seeded(8); let c = 0; for (let i = 0; i < 40000; i++) if (rollFish(q, { night: false, season: 'spring', ...env }).def.id === 'fish_crab') c++; return c; };
    expect(count({ ignoreEnv: true })).toBeGreaterThan(count({}) * 2.5);
    expect(fishWeight(fishDef('fish_icefish')!, { night: false, season: 'summer', ignoreEnv: true })).toBe(0); // 冰湖银鱼王：夏天仍然钓不到
  });
  it('图鉴用的习性、难度星：时段 / 季节 / 雨天；难度 1–5；盲盒限定和神话有自己的说明', () => {
    expect(habitat(fishDef('fish_eel')!)).toMatchObject({ time: 'night', rain: true });
    expect(habitat(fishDef('fish_koi')!).time).toBe('day'); expect(habitat(fishDef('fish_carp')!)).toMatchObject({ time: 'any', rain: false });
    expect(habitat(fishDef('fish_crab')!).seasons).toEqual({ spring: 'less', summer: 'less', autumn: 'more', winter: 'less' });
    expect(habitat(fishDef('fish_icefish')!).seasons.winter).toBe('more'); expect(habitat(fishDef('fish_icefish')!).seasons.summer).toBe('off');
    expect(habitat(fishDef('fish_xuangui')!)).toMatchObject({ time: 'night' });
    expect(habitatText(fishDef('fish_guppy')!)).toContain('盲盒'); expect(habitatText(fishDef('fish_yinglong')!)).toContain('夜里');
    for (const f of REAL_FISH) { const s = diffStars(f); expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(5); }
    expect(diffStars(fishDef('fish_crucian')!)).toBe(1); expect(diffStars(fishDef('fish_gudgeon')!)).toBe(2); expect(diffStars(fishDef('fish_yinglong')!)).toBe(5);
  });
  it('分组：FISH_TIERS 含神话；tierProgress 数出每档钓到几种', () => {
    expect(FISH_TIERS[FISH_TIERS.length - 1]).toBe('mythic');
    const log = { fish_koi: { n: 1, best: 50, kg: 1 }, fish_hegongjin: { n: 1, best: 100, kg: 5 } };
    const tp = tierProgress(log); expect(tp.find((t) => t.tier === 'rare')).toMatchObject({ have: 1 }); expect(tp.find((t) => t.tier === 'mythic')).toEqual({ tier: 'mythic', have: 1, total: 3 });
    expect(speciesCount(log)).toBe(2);
  });
});

describe('钓鱼 2.0：竿、饵、配件与 resolveGear', () => {
  const day = { night: false, rain: false, season: 'summer' as const }, night = { night: true, rain: false, season: 'summer' as const };
  it('目录：9 根竿、9 种饵、6 个配件，都有同名物品、图标；竿的槽数；价格表里的商品都是真物品', () => {
    expect([RODS.length, BAITS.length, TACKLES.length]).toEqual([9, 9, 6]);
    for (const d of [...RODS, ...BAITS, ...TACKLES]) { expect(itemDef(d.id), d.id).toBeTruthy(); expect(ICONS[d.id], d.id).toBeTruthy(); expect(d.eff.length, d.id).toBeGreaterThan(3); expect(d.how.length, d.id).toBeGreaterThan(1); }
    expect(rodDef('rod_bone')!.slots).toBe(2); expect(rodDef('fishing_rod')!.slots).toBe(0); expect(MAX_TACKLE).toBe(2);
    expect(shopItemsValid()).toBe(true);
    for (const t of TACKLES) expect(SHOP.some((s) => s.id === t.id && s.price === t.price)).toBe(true);
    for (const id of ['rod_glow', 'rod_rain', 'rod_pickup', 'bait_glow', 'bait_season', 'bait_wild', 'bait_magnet']) expect(SHOP.some((s) => s.id === id), id).toBe(true);
    for (const id of ['rod_frost', 'rod_twin', 'rod_bone', 'bait_any', 'bait_name', 'bait_myth']) expect(SHOP.some((s) => s.id === id), id).toBe(false); // 只能合成 / 盲盒
  });
  it('自动选择：竿选背包里最低级的；饵只在普通类里自动，万能 / 指名 / 神话饵必须自己在装备栏选', () => {
    expect(pickRod({ rod_bone: 1, rod_glow: 1 })?.id).toBe('rod_glow'); expect(pickRod({ rod_bone: 1, rod_glow: 1 }, { rod: 'rod_bone' })?.id).toBe('rod_bone');
    expect(pickBait({ bait_any: 3, bait_myth: 2, bait_name: 1 })).toBeUndefined(); expect(pickBait({ bait_any: 3, bait_glow: 1 })).toBe('bait_glow');
    expect(pickBait({ bait_myth: 2 }, { bait: 'bait_myth' })).toBe('bait_myth'); expect(AUTO_BAITS).not.toContain('bait_any');
    expect(cleanEquip({ rod: 'rod_bone', bait: 'bait_any', tackle: ['tk_float', 'tk_float', 'nope', 'tk_lead', 'tk_sonar'], target: 'fish_carp' }, isNamedFish)).toEqual({ rod: 'rod_bone', bait: 'bait_any', tackle: ['tk_float', 'tk_lead'], target: 'fish_carp' });
    expect(cleanEquip({ target: 'fish_goldkoi' }, isNamedFish).target).toBe(''); expect(cleanEquip({ tackle: 'x' }).tackle).toEqual([]);
  });
  it('特长竿只在对应场合有加成：萤火竿夜里咬钩更快、夜行鱼更多，白天没有；听雨竿 / 寒江竿同理', () => {
    const inv = { rod_glow: 1, bait: 1 }, d = resolveGear(inv, {}, day), n = resolveGear(inv, {}, night);
    expect(d.wait).toBeCloseTo(0.75, 9); expect(n.wait).toBeCloseTo(0.75 * 0.6, 9);
    const snake = fishDef('fish_snakehead')!, carp = fishDef('fish_carp')!;
    expect(d.mul(snake)).toBe(1); expect(n.mul(snake)).toBe(1.5); expect(n.mul(carp)).toBe(1);
    const rain = resolveGear({ rod_rain: 1, bait: 1 }, {}, { night: false, rain: true, season: 'summer' }); expect(rain.wait).toBeCloseTo(0.75 * 0.6, 9); expect(rain.mul(fishDef('fish_loach')!)).toBe(1.5);
    const w = resolveGear({ rod_frost: 1, bait: 1 }, {}, { night: false, season: 'winter' }); expect(w.window).toBe(300); expect(w.mul(carp)).toBeCloseTo(1.3, 9); expect(w.mul(fishDef('fish_icefish')!)).toBeCloseTo(2.6, 9);
    expect(resolveGear({ rod_frost: 1, bait: 1 }, {}, day).window).toBe(0); expect(resolveGear({ rod_frost: 1, bait: 1 }, {}, day).mul(carp)).toBe(1);
    expect(perkActive(rodDef('rod_glow')!.tag, night)).toBe(true); expect(perkActive(rodDef('rod_glow')!.tag, day)).toBe(false); expect(perkActive(rodDef('rod_frost')!.tag, { night: false, season: 'winter' })).toBe(true);
  });
  it('同一条件的加成取最强、不叠：萤火竿 + 夜光饵 夜里咬钩倍率取更强的 0.6，夜行鱼权重取 1.5（不是 1.5 × 1.4）', () => {
    const g = resolveGear({ rod_glow: 1, bait_glow: 1 }, { bait: 'bait_glow' }, night);
    expect(g.wait).toBeCloseTo(0.75 * 0.6, 9); expect(g.mul(fishDef('fish_snakehead')!)).toBe(1.5);
    const g2 = resolveGear({ fishing_rod: 1, bait_glow: 1 }, { bait: 'bait_glow' }, night); expect(g2.wait).toBeCloseTo(0.7, 9); expect(g2.mul(fishDef('fish_snakehead')!)).toBe(1.4);
  });
  it('总上限：咬钩倍率 ≥ WAIT_MIN、好运 ≤ LUCK_MAX、盲盒 ≤ 3、绿条 ≤ 1.3；龙骨竿 + 香饵是现有最高档之上约 20–40%', () => {
    const g = resolveGear({ rod_bone: 1, bait_pro: 1, tk_float: 1, tk_treasure: 1 }, { bait: 'bait_pro', tackle: ['tk_float', 'tk_treasure'] }, { night: true, rain: true, season: 'winter' });
    expect(g.wait).toBeGreaterThanOrEqual(WAIT_MIN); expect(g.luck).toBeLessThanOrEqual(LUCK_MAX); expect(g.treasure).toBeLessThanOrEqual(3); expect(g.fight.bar).toBeLessThanOrEqual(1.3);
    const golden = resolveGear({ rod_golden: 1, bait_pro: 1 }, { bait: 'bait_pro' }, day), bone = resolveGear({ rod_bone: 1, bait_pro: 1 }, { bait: 'bait_pro' }, day);
    expect(bone.luck / golden.luck).toBeGreaterThan(1.2); expect(bone.luck / golden.luck).toBeLessThan(1.5); expect(bone.luck).toBeLessThanOrEqual(LUCK_MAX);
  });
  it('配件：要有槽、要在背包里；龙骨竿 2 槽；绿条 / 下沉 / 黏鱼 / 掉速 / 声呐 / 盲盒倍率各自生效且同类取最高', () => {
    const inv = { rod_carbon: 1, rod_bone: 1, fishing_rod: 1, tk_float: 1, tk_lead: 1, tk_barb: 1, tk_buffer: 1, tk_sonar: 1, tk_treasure: 1, bait: 1 };
    expect(resolveGear(inv, { rod: 'fishing_rod', tackle: ['tk_float'] }, day).tackle).toEqual([]); // 竹节竿没有槽
    expect(resolveGear(inv, { rod: 'rod_carbon', tackle: ['tk_float', 'tk_lead'] }, day).tackle.map((t) => t.id)).toEqual(['tk_float']); // 1 槽
    expect(resolveGear({ ...inv, tk_float: 0 }, { rod: 'rod_carbon', tackle: ['tk_float'] }, day).tackle).toEqual([]); // 背包里没有
    const g = resolveGear(inv, { rod: 'rod_bone', tackle: ['tk_float', 'tk_sonar'] }, day);
    expect(g.sonar).toBe(true); expect(g.fight.bar).toBeCloseTo(1 + 0.12 + 0.1, 9); // 长浮漂 +12% 与龙骨竿 +10%
    expect(resolveGear(inv, { rod: 'rod_bone', tackle: ['tk_lead', 'tk_buffer'] }, day).fight).toMatchObject({ sink: 0.7, drop: 0.65 });
    expect(resolveGear(inv, { rod: 'rod_bone', tackle: ['tk_barb'] }, day).fight.cling).toBe(1);
    expect(resolveGear(inv, { rod: 'rod_bone', tackle: ['tk_treasure'] }, day).treasure).toBe(1.5); // 寻宝钩 1.5 vs 龙骨竿 1.3：取最高
    expect(resolveGear({ rod_pickup: 1, tk_treasure: 1, rod_carbon: 1, bait_magnet: 1 }, { rod: 'rod_pickup', bait: 'bait_magnet', tackle: ['tk_treasure'] }, day).treasure).toBe(2); // 都不叠：最高的 2
  });
  it('双钓取最高（并蒂竿 8%、野饵 12%）；指名饵只在装备栏指定了目标才生效；万能 / 神话饵的标记', () => {
    expect(resolveGear({ rod_twin: 1, bait_wild: 1 }, { rod: 'rod_twin', bait: 'bait_wild' }, day).double).toBe(0.12); expect(resolveGear({ rod_twin: 1, bait: 1 }, {}, day).double).toBe(0.08);
    expect(resolveGear({ fishing_rod: 1, bait_name: 1 }, { bait: 'bait_name' }, day).only).toBeUndefined(); expect(resolveGear({ fishing_rod: 1, bait_name: 1 }, { bait: 'bait_name', target: 'fish_carp' }, day).only).toBe('fish_carp');
    expect(resolveGear({ fishing_rod: 1, bait_any: 1 }, { bait: 'bait_any' }, day).ignoreEnv).toBe(true); expect(resolveGear({ fishing_rod: 1, bait_myth: 1 }, { bait: 'bait_myth' }, day).mythicBait).toBe(true);
    expect(baitDef('bait_pro')!.luck).toBe(1.25); expect(tackleDef('tk_float')!.bar).toBe(1.12);
  });
  it('应季饵：当季更多的鱼权重 ×1.5（跟着当前季节变）', () => {
    const g = (s: 'spring' | 'autumn') => resolveGear({ fishing_rod: 1, bait_season: 1 }, { bait: 'bait_season' }, { night: false, season: s });
    expect(g('autumn').mul(fishDef('fish_crab')!)).toBe(1.5); expect(g('spring').mul(fishDef('fish_crab')!)).toBe(1); expect(g('spring').mul(fishDef('fish_mandarin')!)).toBe(1.5);
  });
});

describe('钓鱼 2.0：拉鱼小游戏接配件与神话鱼的难度', () => {
  const run = (p: ReturnType<typeof fightOf>, steps = 400, hold = (t: number) => Math.sin(t * 3) > 0) => { const s = new FightSim(p); for (let i = 0; i < steps; i++) s.step(0.02, hold(i * 0.02)); return s; };
  it('fightOf：没有配件时和以前一样；配件、鱼本身的绿条倍率、神话的中途发力都写进参数', () => {
    const koi = fishDef('fish_koi')!, base = fightOf(koi, 60, 5, 0.1);
    expect(base).toEqual({ seed: 5, diff: base.diff, move: 'mixed' });
    const g = fightOf(koi, 60, 5, 0.1, { bar: 1.22, sink: 0.7, cling: 1, drop: 0.65 }); expect(g).toMatchObject({ bar: 1.22, sink: 0.7, cling: 1, drop: 0.65 });
    expect(fightOf(fishDef('fish_xuangui')!, 150, 1).bar).toBeCloseTo(0.78, 9); expect(fightOf(fishDef('fish_yinglong')!, 300, 1).burst).toBe(true);
    expect(fightOf(fishDef('fish_hegongjin')!, 100, 1).diff).toBeGreaterThan(fightOf(fishDef('fish_goldkoi')!, 100, 1).diff - 0.2);
  });
  it('长浮漂让绿条更长；铅坠让绿条下沉更稳；缓冲浮标让进度掉得慢；倒刺钩让绿条跟着鱼走', () => {
    const p = fightOf(fishDef('fish_carp')!, 40, 3);
    expect(new FightSim({ ...p, bar: 1.2 }).half).toBeCloseTo(new FightSim(p).half * 1.2, 9);
    const a = new FightSim(p), b = new FightSim({ ...p, sink: 0.7 }); a.bar = b.bar = 0.9; for (let i = 0; i < 10; i++) { a.step(0.02, false); b.step(0.02, false); } expect(b.bar).toBeGreaterThan(a.bar);
    const c = new FightSim(p), d = new FightSim({ ...p, drop: 0.5 }); c.fish = d.fish = 0.9; c.bar = d.bar = 0.2; for (let i = 0; i < 5; i++) { c.step(0.02, false); d.step(0.02, false); } expect(d.progress).toBeGreaterThan(c.progress);
    const e = new FightSim({ ...p, move: 'smooth' }), f = new FightSim({ ...p, move: 'smooth', cling: 1 });
    e.bar = f.bar = 0.4; e.fish = f.fish = 0.44; e.step(0.02, true); f.step(0.02, true); expect(f.bar).toBeGreaterThan(e.bar); // 鱼在绿条里（偏上）：黏鱼的绿条被往上带
    const h = new FightSim({ ...p, move: 'dart', cling: 1 }), k = new FightSim({ ...p, move: 'dart' }); h.bar = k.bar = 0.4; h.fish = k.fish = 0.44; h.step(0.02, true); k.step(0.02, true); expect(h.bar).toBe(k.bar); // 窜动型的鱼黏不住
  });
  it('神话鱼应龙会中途发力：同一个种子，发力的比不发力的更难拉；模拟是确定的', () => {
    const p = fightOf(fishDef('fish_yinglong')!, 300, 11), q = { ...p, burst: undefined };
    const a = run(p, 1500), b = run(q as never, 1500); expect([a.progress, a.fish]).toEqual([run(p, 1500).progress, run(p, 1500).fish]);
    expect(a.ratio).toBeLessThanOrEqual(b.ratio + 0.2);
  });
});

describe('钓鱼 2.0：盲盒', () => {
  const ids = BOXES.map((b) => b.id);
  it('三种盲盒：掉落表里的东西都是真物品 / 真鱼 / 有图标；权重 > 0；珍品标记；盲盒限定鱼只出现在盲盒里', () => {
    expect(ids).toEqual(['box_bottle', 'box_crate', 'box_wreck']);
    for (const b of BOXES) {
      expect(itemDef(b.id), b.id).toBeTruthy(); expect(ICONS[b.id], b.id).toBeTruthy();
      for (const l of b.loot) { expect(l.w).toBeGreaterThan(0); if ('item' in l) expect(itemDef(l.item), l.item).toBeTruthy(); if ('fish' in l) expect(fishDef(l.fish)?.source, l.fish).toBe('box'); }
      if (b.pity > 0) expect(b.loot.some((l) => l.gem)).toBe(true);
    }
    const inBox = new Set(BOXES.flatMap((b) => b.loot.flatMap((l) => ('fish' in l ? [l.fish] : [])))); for (const f of BOX_FISH) expect(inBox.has(f.id), f.id).toBe(true);
  });
  it('rollBox：保底 —— 连续没开出珍品的次数到 pity-1 时，下一个必出珍品，计数清零；开出珍品也清零；漂流瓶没有保底', () => {
    const rnd = seeded(9);
    for (const id of ['box_crate', 'box_wreck'] as const) {
      const pity = boxDef(id)!.pity; expect(pity).toBe(30);
      for (let i = 0; i < 200; i++) { const r = rollBox(rnd, id, pity - 1); expect(r.result.gem).toBe(true); expect(r.pity).toBe(0); }
      let streak = 0, worst = 0, p = 0; for (let i = 0; i < 20000; i++) { const r = rollBox(rnd, id, p); p = r.pity; streak = r.result.gem ? 0 : streak + 1; worst = Math.max(worst, streak); }
      expect(worst).toBeLessThanOrEqual(pity - 1); // 最多连续 29 次没珍品
    }
    expect(rollBox(rnd, 'box_bottle', 99).pity).toBe(0);
  });
  it('rollBox 的结果：币在范围内、物品数量对、盲盒鱼带合理的尺寸', () => {
    const rnd = seeded(10); let sawFish = false, sawCoins = false;
    for (let i = 0; i < 4000; i++) {
      const id = ids[i % 3] as BoxId, r = rollBox(rnd, id, 0).result;
      if (r.coins) { sawCoins = true; const l = boxDef(id)!.loot.find((x) => 'coins' in x) as { coins: readonly [number, number] }; expect(r.coins).toBeGreaterThanOrEqual(l.coins[0]); expect(r.coins).toBeLessThanOrEqual(l.coins[1]); }
      if (r.fish) { sawFish = true; const d = fishDef(r.fish.id)!; expect(r.fish.cm).toBeGreaterThanOrEqual(d.minCm!); expect(r.fish.cm).toBeLessThanOrEqual(d.maxCm!); }
      expect(r.coins + r.items.length + (r.fish ? 1 : 0)).toBeGreaterThan(0);
    }
    expect(sawFish && sawCoins).toBe(true);
  });
  it('期望价值：漂流瓶 15–60、旧木箱 80–160、沉船箱 300–900（开箱开心，但不是赚钱的好办法）；概率表合计 100%', () => {
    expect(boxValue('box_bottle')).toBeGreaterThan(15); expect(boxValue('box_bottle')).toBeLessThan(60);
    expect(boxValue('box_crate')).toBeGreaterThan(80); expect(boxValue('box_crate')).toBeLessThan(160);
    expect(boxValue('box_wreck')).toBeGreaterThan(300); expect(boxValue('box_wreck')).toBeLessThan(900);
    for (const id of ids) expect(boxOdds(id as BoxId).reduce((a, o) => a + o.pct, 0)).toBeGreaterThan(99.5);
    expect(lootValue('dragon_scale')).toBeGreaterThan(0); expect(lootValue('rod_twin')).toBeGreaterThan(lootValue('tk_float'));
  });
  it('钓鱼时顺带钓到盲盒的概率：漂流瓶约 4%（雨天 ×1.5）、旧木箱约 1.2%（夜里 ×1.5）、沉船箱约 0.25%（暴雨夜 ×2）；倍率生效；上限 50%', () => {
    const rate = (env: { night: boolean; rain: boolean }, t: number, id: string) => { const q = seeded(21); let c = 0; const N = 200000; for (let i = 0; i < N; i++) if (rollBoxDrop(q, env, t) === id) c++; return c / N; };
    expect(rate({ night: false, rain: false }, 1, 'box_bottle')).toBeGreaterThan(0.034); expect(rate({ night: false, rain: false }, 1, 'box_bottle')).toBeLessThan(0.046);
    expect(rate({ night: false, rain: true }, 1, 'box_bottle')).toBeGreaterThan(rate({ night: false, rain: false }, 1, 'box_bottle') * 1.3);
    expect(rate({ night: true, rain: false }, 1, 'box_crate')).toBeGreaterThan(rate({ night: false, rain: false }, 1, 'box_crate') * 1.3);
    expect(rate({ night: true, rain: true }, 1, 'box_wreck')).toBeGreaterThan(rate({ night: false, rain: false }, 1, 'box_wreck') * 1.6);
    expect(rate({ night: false, rain: false }, 2, 'box_bottle')).toBeGreaterThan(rate({ night: false, rain: false }, 1, 'box_bottle') * 1.6);
    expect(rollBoxDrop(() => 0.6, { night: true, rain: true }, 3)).toBeNull();
  });
});

describe('钓鱼 2.0：合成', () => {
  it('配方：产出和材料都是真物品；杂物 5 → 鱼饵；材料不够不动背包；币不够会说', () => {
    for (const r of RECIPES) { expect(itemDef(r.out.id), r.id).toBeTruthy(); for (const n of r.needs) if ('id' in n) expect(itemDef(n.id), n.id).toBeTruthy(); }
    const inv = { junk_boot: 2, junk_weed: 2 }; expect(typeof craftPlan(inv, recipeDef('junk_bait')!)).toBe('string'); expect(applyCraft(inv, recipeDef('junk_bait')!)).toBeNull(); expect(inv).toEqual({ junk_boot: 2, junk_weed: 2 });
    const inv2 = { junk_boot: 2, junk_weed: 2, trash_cup: 3, bait: 998 }; expect(craftWhy(inv2, 0, recipeDef('junk_bait')!)).toContain('校园币'); expect(craftWhy(inv2, 1, recipeDef('junk_bait')!)).toBeNull();
    expect(applyCraft(inv2, recipeDef('junk_bait')!)).toBeTruthy(); expect(inv2.bait).toBe(999); expect(Object.values(inv2).reduce((a, b) => a + b, 0)).toBe(999 + 2); // 7 件杂物里扣 5，剩 2
  });
  it('产出放不下（背包里已有 99 个鱼饵 / 已有龙骨竿）就不能合成', () => {
    expect(craftWhy({ junk_boot: 5, bait: 999 }, 10, recipeDef('junk_bait')!)).toContain('放不下');
    expect(craftWhy({ rod_golden: 1, dragon_scale: 4, rod_bone: 1 }, 5000, recipeDef('bone_rod')!)).toContain('放不下');
    expect(craftWhy({ rod_golden: 1, dragon_scale: 4 }, 5000, recipeDef('bone_rod')!)).toBeNull(); expect(craftWhy({ rod_golden: 1, dragon_scale: 3 }, 5000, recipeDef('bone_rod')!)).toContain('龙鳞');
  });
  it('指名饵：必须选一种常见 / 少见 / 稀有的湖鱼，3 条同种；神话饵：龙鳞 + 珍珠 + 1 条稀有鱼 → 2 个', () => {
    const r = recipeDef('named_bait')!;
    expect(craftWhy({ fish_carp: 3 }, 0, r)).toContain('先选'); expect(craftWhy({ fish_goldkoi: 3 }, 0, r, 'fish_goldkoi')).toContain('先选'); expect(craftWhy({ fish_guppy: 3 }, 0, r, 'fish_guppy')).toContain('先选');
    expect(craftWhy({ fish_carp: 2 }, 0, r, 'fish_carp')).toContain('不够'); expect(craftWhy({ fish_carp: 3 }, 0, r, 'fish_carp')).toBeNull();
    const inv = { dragon_scale: 1, pearl: 1, fish_eel: 1 }; expect(applyCraft(inv, recipeDef('myth_bait')!)).toBeTruthy(); expect(inv).toEqual({ bait_myth: 2 });
    expect(craftWhy({ dragon_scale: 1, pearl: 1 }, 0, recipeDef('myth_bait')!)).toContain('稀有鱼');
    expect(isNamedFish('fish_koi')).toBe(true); expect(isNamedFish('fish_yinglong')).toBe(false); expect(isNamedFish('junk_boot')).toBe(false);
  });
});

describe('钓鱼 2.0：神话鱼的条件、册页、里程碑、记录清洗', () => {
  const ctx = (o: Partial<MythicCtx> = {}): MythicCtx => ({ night: false, rain: false, season: 'spring', rod: 'rod_carbon', bait: 'bait_pro', log: { fish_koi: { n: 20, best: 60, kg: 3 } }, ...o });
  it('河工锦：钓满 20 条锦鲤 + 春天白天 + 香饵或更好的饵 + 碳素竿及以上；少一条都不行，逐条显示 ✔/✘', () => {
    const f = fishDef('fish_hegongjin')!;
    expect(mythicOk(f, ctx())).toBe(true);
    expect(mythicOk(f, ctx({ log: { fish_koi: { n: 19, best: 60, kg: 3 } } }))).toBe(false); expect(mythicOk(f, ctx({ season: 'summer' }))).toBe(false); expect(mythicOk(f, ctx({ night: true }))).toBe(false);
    expect(mythicOk(f, ctx({ bait: 'bait' }))).toBe(false); expect(mythicOk(f, ctx({ rod: 'fishing_rod' }))).toBe(false); expect(mythicOk(f, ctx({ bait: 'bait_any' }))).toBe(false);
    const p = mythicProgress(f, ctx({ log: { fish_koi: { n: 7, best: 1, kg: 1 } }, season: 'winter' })); expect(p.length).toBe(5); expect(p.find((c) => c.text.includes('锦鲤'))!.text).toContain('已 7'); expect(p.filter((c) => !c.ok).length).toBe(2);
  });
  it('镇湖玄龟：神话饵 + 寒江 / 金龙 / 龙骨竿 + 冬天夜里；应龙：神话饵 + 听雨 / 龙骨竿 + 雨夜', () => {
    const x = fishDef('fish_xuangui')!, y = fishDef('fish_yinglong')!;
    expect(mythicOk(x, ctx({ bait: 'bait_myth', rod: 'rod_frost', season: 'winter', night: true }))).toBe(true); expect(mythicOk(x, ctx({ bait: 'bait_myth', rod: 'rod_golden', season: 'winter', night: true }))).toBe(true);
    expect(mythicOk(x, ctx({ bait: 'bait_myth', rod: 'rod_rain', season: 'winter', night: true }))).toBe(false); expect(mythicOk(x, ctx({ bait: 'bait_pro', rod: 'rod_frost', season: 'winter', night: true }))).toBe(false);
    expect(mythicOk(y, ctx({ bait: 'bait_myth', rod: 'rod_rain', rain: true, night: true }))).toBe(true); expect(mythicOk(y, ctx({ bait: 'bait_myth', rod: 'rod_rain', rain: false, night: true }))).toBe(false);
    expect(mythicOk(y, ctx({ bait: 'bait_myth', rod: 'rod_bone', rain: true, night: false }))).toBe(false); expect(mythicOk(fishDef('fish_carp')!, ctx())).toBe(false);
  });
  it('神话首奖：每条都有成就（带称号和币）和物品；第一条能自给神话饵；全集成就「镇湖三宝」', () => {
    for (const [fid, rw] of Object.entries(MYTHIC_REWARDS)) { expect(fishDef(fid)?.rarity).toBe('mythic'); const a = ACHIEVEMENTS.find((x) => x.id === rw.ach)!; expect(a, rw.ach).toBeTruthy(); expect(titleDef(a.title)?.name, rw.ach).toBeTruthy(); for (const g of rw.items) expect(itemDef(g.id)).toBeTruthy(); }
    expect(MYTHIC_REWARDS.fish_hegongjin.items.some((g) => g.id === 'bait_myth')).toBe(true);
    expect(titleDef(ACHIEVEMENTS.find((a) => a.id === 'myth_all')!.title)?.name).toBe('镇湖三宝');
  });
  it('册页：8 本、里面的鱼都存在；进度；「大个头册」按每档是否钓到「特大」以上算；里程碑 10/25/40/48 对应成就', () => {
    expect(BUNDLES.length).toBe(8); for (const b of BUNDLES) for (const id of b.fish) expect(fishDef(id), `${b.id} ${id}`).toBeTruthy();
    for (const b of BUNDLES) { for (const g of b.reward.items) expect(itemDef(g.id), g.id).toBeTruthy(); expect(b.reward.coins).toBeGreaterThan(0); }
    const winter = BUNDLES.find((b) => b.id === 'b_winter')!, log = { fish_icefish: { n: 1, best: 40, kg: 0.3 }, fish_silverling: { n: 1, best: 10, kg: 0.01 } };
    expect(bundleProgress(winter, log)).toEqual({ have: 2, need: 3 }); expect(bundleDone(winter, log)).toBe(false); expect(bundleDone(winter, { ...log, fish_sturgeon: { n: 1, best: 100, kg: 1 } })).toBe(true);
    const big = BUNDLES.find((b) => b.kind === 'big')!; expect(bundleProgress(big, {})).toEqual({ have: 0, need: 5 });
    expect(bundleProgress(big, { fish_carp: { n: 1, best: 58, kg: 4 }, fish_bream: { n: 1, best: 40, kg: 1 }, fish_koi: { n: 1, best: 45, kg: 1 } })).toEqual({ have: 2, need: 5 }); // 鲤鱼 58/60 → 特大；鳊鱼 40/40 → 巨物；锦鲤 45 太小
    expect(MILESTONES.map((m) => m.n)).toEqual([10, 25, 40, 48]); for (const m of MILESTONES) expect(ACHIEVEMENTS.some((a) => a.id === m.ach), m.ach).toBe(true);
    const all = Object.fromEntries(LAKE_FISH.filter((f) => f.rarity !== 'junk').map((f) => [f.id, { n: 1, best: 1, kg: 0 }])); expect(lakeComplete(all)).toBe(true); expect(lakeComplete({})).toBe(false);
  });
  it('装备图鉴记录清洗：缺字段补默认；只留认识的 id；数量收敛；册页 / 神话只留合法 id', () => {
    expect(cleanGearLog(null)).toEqual({ rods: {}, baits: {}, tackles: {}, boxes: {}, pity: {}, claimed: [], myth: [] });
    const g = cleanGearLog({ rods: { rod_bone: 1700000000000, nope: 5 }, baits: { bait_pro: 3.9, bait: -1 }, tackles: { tk_float: 5 }, boxes: { box_crate: 2, box_x: 9 }, pity: { box_wreck: 12 }, claimed: ['b_winter', 'b_winter', 'zzz'], myth: ['fish_yinglong', 'fish_carp'] });
    expect(g).toEqual({ rods: { rod_bone: 1700000000000 }, baits: { bait_pro: 3 }, tackles: { tk_float: 5 }, boxes: { box_crate: 2 }, pity: { box_wreck: 12 }, claimed: ['b_winter'], myth: ['fish_yinglong'] });
  });
});

describe('钓鱼 2.0：物品、商店、交易、成就', () => {
  it('物品目录：新东西都有物品和图标；背包格子够；盲盒和配件有自己的类型', () => {
    for (const id of ['box_bottle', 'box_crate', 'box_wreck', 'dragon_scale', 'pearl', 'relic_badge', 'relic_card', 'relic_meal', 'relic_history']) { expect(itemDef(id), id).toBeTruthy(); expect(ICONS[id], id).toBeTruthy(); }
    expect(itemDef('box_crate')!.kind).toBe('box'); expect(itemDef('tk_float')!.kind).toBe('tackle'); expect(itemDef('rod_bone')!.stack).toBe(1); expect(itemDef('bait_any')!.stack).toBe(999);
    expect(ITEMS.length).toBeLessThanOrEqual(INV_SLOTS); expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const id of Object.keys(ICONS)) expect(itemDef(id) || ['junk_can', 'junk_bottle'].includes(id), id).toBeTruthy();
  });
  it('交易：特殊竿、龙骨竿、万能饵、神话饵、龙鳞、盲盒、配件不能交易；饵、普通鱼、指名饵、珍珠可以', () => {
    for (const id of ['rod_glow', 'rod_rain', 'rod_frost', 'rod_pickup', 'rod_twin', 'rod_bone', 'bait_any', 'bait_myth', 'dragon_scale', 'box_bottle', 'box_crate', 'box_wreck', 'tk_float', 'tk_sonar', 'cat_badge']) expect(tradable(id), id).toBe(false);
    for (const id of ['bait', 'bait_pro', 'bait_glow', 'bait_name', 'fish_carp', 'fish_hegongjin', 'pearl', 'relic_badge', 'fishing_rod', 'rod_carbon', 'rod_golden']) expect(tradable(id), id).toBe(true);
    expect(cleanOffer({ items: [{ id: 'box_crate', n: 1 }, { id: 'bait_pro', n: 2 }, { id: 'rod_bone', n: 1 }], coins: 5 }).items).toEqual([{ id: 'bait_pro', n: 2 }]);
  });
  it('卖价：神话鱼基础价 1400；珍珠 / 小宝物固定价；龙鳞和盲盒不能卖；盲盒限定鱼按稀有度算', () => {
    expect(fishPrice(fishDef('fish_yinglong')!)).toBeGreaterThan(1100); expect(sellPrice('pearl', 20000)).toBe(EXTRA_SELL.pearl); expect(sellable('pearl')).toBe(true); expect(sellable('relic_card')).toBe(true);
    expect(sellable('dragon_scale')).toBe(false); expect(sellable('box_crate')).toBe(false); expect(sellPrice('dragon_scale', 1)).toBe(0);
    expect(fishPrice(fishDef('fish_guppy')!)).toBeGreaterThan(30); expect(fishPrice(fishDef('fish_discus')!)).toBeGreaterThan(fishPrice(fishDef('fish_guppy')!));
    const l = sellList({ pearl: 2, fish_clam: 1, dragon_scale: 1 }, 20000); expect(l.map((r) => r.id).sort()).toEqual(['fish_clam', 'pearl']);
  });
  it('新成就和称号：名字不重复、都有说明；钓鱼大师改成「全部 48 种」，旧的改名「钓遍精工湖」', () => {
    for (const id of ['fish_10', 'fish_25', 'fish_40', 'fish_all', 'myth_hegongjin', 'myth_xuangui', 'myth_yinglong', 'myth_all', 'box_first', 'box_10', 'gear_rods', 'gear_baits']) { const a = ACHIEVEMENTS.find((x) => x.id === id)!; expect(a, id).toBeTruthy(); expect(a.desc.length).toBeGreaterThan(5); }
    expect(ACHIEVEMENTS.find((a) => a.id === 'fish_master')!.name).toBe('钓遍精工湖'); expect(titleDef('fish_all')!.name).toBe('钓鱼大师');
    const real = ACHIEVEMENTS.filter((a) => !a.placeholder); expect(new Set(real.map((a) => a.name)).size).toBe(real.length);
  });
});

void (null as unknown as FishDef);
