import { describe, it, expect } from 'vitest';
import { LEVEL_ACH, MAX_LEVEL, RECIPE_LEVEL, ROUTES, XP_BASE, XP_OVER_RATE, XP_SOFT_CAP, applySoftCap, barBonus, catchXp, cleanFx, cumXp, emptyFx, levelOf, levelReward, newSpeciesXp, retroXp, routeBonus, routeSlots } from '../src/shared/fishlevel';
import { fishDef, REAL_FISH } from '../src/shared/fishing';
import { RECIPES, craftWhy, recipeDef } from '../src/shared/craft';
import { FISH_GEAR_IDS, SHOP, marketMul, sellList, sellPrice } from '../src/shared/economy';
import { resolveGear } from '../src/shared/gear';
import { ACHIEVEMENTS } from '../src/shared/achievements';
import { titleDef } from '../src/shared/titles';
import { PROTECTED, RELEASE_ACH, isProtected, releaseReward } from '../src/shared/release';
import { itemDef } from '../src/shared/items';
import { fishPrice } from '../src/shared/economy';

describe('钓鱼等级：曲线与经验', () => {
  it('曲线：10 级 8050、30 级 94200（第一版的 4.4 倍）；levelOf 与 cumXp 互为逆；满级封顶', () => {
    expect(cumXp(1)).toBe(0); expect(cumXp(2)).toBe(100); expect(cumXp(5)).toBe(1450); expect(cumXp(10)).toBe(8050); expect(cumXp(20)).toBe(38750); expect(cumXp(30)).toBe(94200);
    for (let L = 1; L <= MAX_LEVEL; L++) { expect(levelOf(cumXp(L)).lv).toBe(L); if (L > 1) expect(levelOf(cumXp(L) - 1).lv).toBe(L - 1); if (L > 1) expect(cumXp(L)).toBeGreaterThan(cumXp(L - 1)); }
    expect(levelOf(10 ** 9).lv).toBe(30); expect(levelOf(10 ** 9).need).toBe(0); expect(levelOf(-5).lv).toBe(1); expect(levelOf(NaN).lv).toBe(1);
    const l = levelOf(cumXp(6) + 100); expect(l).toMatchObject({ lv: 6, into: 100, need: cumXp(7) - cumXp(6) }); expect(l.frac).toBeCloseTo(100 / l.need, 9);
  });
  it('一条鱼的经验：按稀有度；完美 +50%（至少 +1）；新种类额外（max(5, 基础×2)，神话 +200）；杂物 0；双钓两条都算', () => {
    expect(XP_BASE).toMatchObject({ common: 1, uncommon: 2, rare: 5, epic: 12, legendary: 30, mythic: 100, junk: 0 });
    const carp = fishDef('fish_carp')!, koi = fishDef('fish_koi')!, myth = fishDef('fish_yinglong')!, junk = fishDef('junk_boot')!;
    expect(catchXp(carp)).toEqual({ base: 1, perfect: 0, isNew: 0, capped: 1 }); expect(catchXp(carp, { perfect: true }).perfect).toBe(1); // 1 的 50% 向下取整 0，至少 +1
    expect(catchXp(koi, { perfect: true })).toMatchObject({ base: 5, perfect: 2, capped: 7 }); expect(catchXp(koi, { isNew: true }).isNew).toBe(10); expect(newSpeciesXp(carp)).toBe(5);
    expect(catchXp(myth, { isNew: true, perfect: true })).toMatchObject({ base: 100, perfect: 50, isNew: 200 }); expect(newSpeciesXp(myth)).toBe(200);
    expect(catchXp(junk, { perfect: true, isNew: true })).toEqual({ base: 0, perfect: 0, isNew: 0, capped: 0 }); expect(catchXp(koi, { n: 2 })).toMatchObject({ base: 10, capped: 10 });
  });
  it('每日软上限：前 600 全额、超出 ×0.4；跨过 600 的那一次分段算；零头累积（常见鱼超过后不是永远 0）；换日从 0 重新算', () => {
    expect(XP_SOFT_CAP).toBe(600); expect(XP_OVER_RATE).toBe(0.4);
    expect(applySoftCap(0, 100)).toEqual({ granted: 100, raw: 100 }); expect(applySoftCap(590, 20)).toEqual({ granted: 10 + Math.floor(10 * 0.4), raw: 610 }); expect(applySoftCap(600, 10)).toEqual({ granted: 4, raw: 610 });
    let raw = 600, got = 0; for (let i = 0; i < 1000; i++) { const r = applySoftCap(raw, 1); raw = r.raw; got += r.granted; } expect(got).toBe(400); // 超出 1000 点 → 400
    let raw2 = 0, got2 = 0; for (let i = 0; i < 700; i++) { const r = applySoftCap(raw2, 1); raw2 = r.raw; got2 += r.granted; } expect(got2).toBe(600 + 40);
    expect(applySoftCap(0, 0).granted).toBe(0); expect(applySoftCap(-5, 3)).toEqual({ granted: 3, raw: 3 });
  });
  it('狂钓党的节奏：一天 500 条（平均 1.7 经验）≈ 700 点，10 级约 12 天；一天 100 条约 170 点', () => {
    const day = (casts: number) => { const raw = Math.round(casts * 1.7); return applySoftCap(0, raw).granted; };
    expect(day(500)).toBeGreaterThan(650); expect(day(500)).toBeLessThan(750); expect(day(100)).toBe(170);
    expect(cumXp(10) / day(500)).toBeGreaterThan(10); expect(cumXp(10) / day(500)).toBeLessThan(13);
  });
});

describe('钓鱼等级：奖励、路线、档案、折算', () => {
  it('升级奖励：每级 20×级 币（最多 400）；6 级前鱼饵、之后香饵；关键级带成就；绿条加成累计最多 5%', () => {
    expect(levelReward(2)).toEqual({ coins: 40, items: [{ id: 'bait', n: 5 }] }); expect(levelReward(7).items).toEqual([{ id: 'bait_pro', n: 3 }]); expect(levelReward(30).coins).toBe(400); expect(levelReward(25).coins).toBe(400);
    expect(levelReward(5).ach).toBe('fishlv_5'); expect(levelReward(6).ach).toBeUndefined();
    expect([1, 3, 4, 7, 8, 13, 14, 21, 22, 30].map(barBonus)).toEqual([0, 0, 0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.05, 0.05]);
    let total = 0; for (let L = 2; L <= 30; L++) total += levelReward(L).coins; expect(total).toBe(8180); // 到 30 级累计约 8000 币
  });
  it('等级成就：6 档都有、带称号和币；放生成就 3 档', () => {
    for (const [lv, id] of Object.entries(LEVEL_ACH)) { const a = ACHIEVEMENTS.find((x) => x.id === id)!; expect(a, id).toBeTruthy(); expect(titleDef(a.title)?.name, id).toBeTruthy(); expect([5, 10, 15, 20, 25, 30]).toContain(Number(lv)); }
    for (const r of RELEASE_ACH) { const a = ACHIEVEMENTS.find((x) => x.id === r.ach)!; expect(a, r.ach).toBeTruthy(); expect(titleDef(a.title)).toBeTruthy(); }
  });
  it('路线：5 级 1 个槽、10 级 2 个槽；渔夫 +10%（最多 +20%）、寻宝 ×1.3（两个 ×1.6）；没选 / 槽没开不算', () => {
    expect([1, 4, 5, 9, 10, 30].map(routeSlots)).toEqual([0, 0, 1, 1, 2, 2]); expect(ROUTES).toEqual(['fisher', 'finder']);
    expect(routeBonus(['fisher', 'fisher'], 10)).toEqual({ sell: 0.2, treasure: 1 }); expect(routeBonus(['fisher', 'fisher'], 5).sell).toBeCloseTo(0.1, 9); expect(routeBonus(['finder', 'finder'], 10).treasure).toBeCloseTo(1.6, 9);
    expect(routeBonus(['fisher', 'finder'], 10)).toMatchObject({ treasure: 1.3 }); expect(routeBonus(['fisher', ''], 10).sell).toBeCloseTo(0.1, 9); expect(routeBonus(['fisher', 'fisher'], 4)).toEqual({ sell: 0, treasure: 1 });
  });
  it('档案清洗：缺字段补默认、路线只认两种、数字收敛、xd 只留合法的', () => {
    expect(cleanFx(null)).toBeUndefined(); expect(cleanFx({})).toEqual({ xp: 0, rt: ['', ''], rel: 0, wk: 0 });
    expect(cleanFx({ xp: 123.9, rt: ['finder', 'hack'], rel: -2, wk: 3, xd: { day: 20400, n: 50.5 } })).toEqual({ xp: 123, rt: ['finder', ''], rel: 0, wk: 3, xd: { day: 20400, n: 50 } });
    expect(cleanFx({ xp: 1, xd: { day: 'x', n: 3 } })!.xd).toBeUndefined(); expect(emptyFx()).toEqual({ xp: 0, rt: ['', ''], rel: 0, wk: 0 });
  });
  it('老玩家折算：每条鱼的基础经验 + 完美次数 + 每个已有种类的新种类奖励；没有记录 = 0', () => {
    expect(retroXp({})).toBe(0);
    expect(retroXp({ fish_carp: { n: 10, best: 40, kg: 1 } })).toBe(10 + 5);
    expect(retroXp({ fish_koi: { n: 2, best: 40, kg: 1, perfect: 1 } })).toBe(2 * 5 + 2 + 10);
    const all = Object.fromEntries(REAL_FISH.map((f) => [f.id, { n: 1, best: 1, kg: 0 }])); expect(retroXp(all)).toBeGreaterThan(1900); expect(retroXp(all)).toBeLessThan(2100); // 图鉴全收（每种 1 条）接近 2000 点
  });
});

describe('钓鱼等级：配方门槛、卖价加成、绿条与盲盒、放生', () => {
  it('配方门槛：每个配方都有 minLevel（和 RECIPE_LEVEL 一致）；等级不够被拒并说明；够了就过；新增两个自制饵', () => {
    for (const r of RECIPES) expect(r.minLevel, r.id).toBe(RECIPE_LEVEL[r.id]);
    expect(recipeDef('pro_bait')!.out).toEqual({ id: 'bait_pro', n: 2 }); expect(recipeDef('glow_bait')!.out).toEqual({ id: 'bait_glow', n: 2 });
    const myth = recipeDef('myth_bait')!, inv = { dragon_scale: 1, pearl: 1, fish_eel: 1 };
    expect(craftWhy(inv, 0, myth, undefined, 9)).toContain('10 级'); expect(craftWhy(inv, 0, myth, undefined, 10)).toBeNull(); expect(craftWhy(inv, 0, myth)).toBeNull(); // 不传等级 = 不检查
    expect(craftWhy({ bait: 3, fish_gudgeon: 2 }, 0, recipeDef('pro_bait')!, undefined, 7)).toBeNull(); expect(craftWhy({ bait: 3, fish_gudgeon: 2 }, 0, recipeDef('pro_bait')!, undefined, 6)).toContain('7 级');
    expect(craftWhy({ bait: 3, fish_shrimp: 1 }, 0, recipeDef('glow_bait')!, undefined, 13)).toContain('不够'); expect(craftWhy({ bait: 3, fish_shrimp: 2 }, 0, recipeDef('glow_bait')!, undefined, 13)).toBeNull();
    for (const r of RECIPES) expect(itemDef(r.out.id)).toBeTruthy();
  });
  it('卖价加成：只作用于鱼和钓上来的杂物；垃圾桶翻出的东西、珍珠、小宝物不加；上限由路线保证', () => {
    const d = 20000;
    expect(sellPrice('fish_carp', d, 0.2)).toBe(Math.max(1, Math.round(fishPrice(fishDef('fish_carp')!) * marketMul(d, 'fish_carp') * 1.2)));
    expect(sellPrice('fish_koi', d, 0.2)).toBeGreaterThan(sellPrice('fish_koi', d)); expect(sellPrice('junk_boot', d, 0.2)).toBeGreaterThanOrEqual(sellPrice('junk_boot', d));
    expect(sellPrice('bin_usb', d, 0.2)).toBe(999); expect(sellPrice('trash_cup', d, 0.2)).toBe(1); expect(sellPrice('pearl', d, 0.2)).toBe(120);
    const l = sellList({ fish_koi: 1 }, d, 0.1); expect(l[0].price).toBe(sellPrice('fish_koi', d, 0.1)); expect(sellPrice('fish_koi', d, -1)).toBe(sellPrice('fish_koi', d)); // 负数当 0
    expect(fishPrice(fishDef('fish_koi')!)).toBeGreaterThan(0);
  });
  it('resolveGear 接等级加成：绿条 +2%…（仍受 +30% 总上限）、寻宝路线盲盒 ×1.3（仍受 ×3 上限）', () => {
    const inv = { fishing_rod: 1, bait: 1 }, env = { night: false };
    expect(resolveGear(inv, {}, env, { bar: 0.05 }).fight.bar).toBeCloseTo(1.05, 9); expect(resolveGear(inv, {}, env).fight.bar).toBe(1);
    expect(resolveGear(inv, {}, env, { treasure: 1.3 }).treasure).toBeCloseTo(1.3, 9);
    const big = resolveGear({ rod_bone: 1, bait_magnet: 1, tk_treasure: 1, tk_float: 1 }, { bait: 'bait_magnet', tackle: ['tk_treasure', 'tk_float'] }, env, { bar: 0.05, treasure: 1.6 }); expect(big.treasure).toBeLessThanOrEqual(3); expect(big.fight.bar).toBeLessThanOrEqual(1.3);
  });
  it('钓具摊卖的：全部鱼饵、商店鱼竿、配件；不含猫粮猫窝零食包', () => {
    for (const id of ['fishing_rod', 'rod_carbon', 'rod_golden', 'rod_glow', 'rod_rain', 'rod_pickup', 'bait', 'bait_pro', 'bait_glow', 'bait_season', 'bait_wild', 'bait_magnet', 'tk_float', 'tk_sonar', 'tk_treasure']) expect(FISH_GEAR_IDS.has(id), id).toBe(true);
    for (const id of ['cat_food', 'cat_treat', 'cat_bed', 'mon_ball']) expect(FISH_GEAR_IDS.has(id), id).toBe(false);
    expect(SHOP.filter((s) => FISH_GEAR_IDS.has(s.id)).length).toBe(FISH_GEAR_IDS.size);
  });
  it('放生：保护动物名单都是真鱼；奖励 = 卖价约 25%（至少 5）+ 基础经验 50%（至少 1）；非保护动物 / 杂物没有奖励', () => {
    expect(Object.keys(PROTECTED).sort()).toEqual(['fish_paddlefish', 'fish_salamander', 'fish_sturgeon', 'fish_sucker']);
    for (const id of Object.keys(PROTECTED)) { expect(fishDef(id), id).toBeTruthy(); expect(isProtected(id)).toBe(true); expect(PROTECTED[id].length).toBeGreaterThan(10); }
    const r = releaseReward('fish_sucker')!; expect(r.coins).toBe(Math.max(5, Math.floor(fishPrice(fishDef('fish_sucker')!) * 0.25))); expect(r.xp).toBe(6);
    expect(releaseReward('fish_paddlefish')!.xp).toBe(15); expect(releaseReward('fish_carp')).toBeNull(); expect(releaseReward('junk_boot')).toBeNull(); expect(isProtected('constructor')).toBe(false); expect(isProtected(undefined)).toBe(false);
    expect(RELEASE_ACH.map((x) => x.n)).toEqual([5, 20, 50]);
  });
});
