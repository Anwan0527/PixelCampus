import { describe, it, expect } from 'vitest';
import { availableNow, bundleViews, fishGroups, fishHint, gearRows, gearSummary, milestoneViews, mythicChecks } from '../src/ui/fishdexModel';
import { emptyGearLog } from '../src/shared/fishdex';
import { fishDef } from '../src/shared/fishing';
import { resolveGear } from '../src/shared/gear';

const log = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { n: 1, best: 30, kg: 1 }]));

describe('图鉴数据整理：鱼类分组、剪影、筛选', () => {
  it('分组顺序：常见 → 传说、神话、盲盒限定；每组 have / total 是未筛选的数字', () => {
    const g = fishGroups(log(['fish_carp', 'fish_koi', 'fish_hegongjin', 'fish_guppy']));
    expect(g.map((x) => x.id)).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'box']);
    expect(g.find((x) => x.id === 'common')).toMatchObject({ have: 1, total: 9 }); expect(g.find((x) => x.id === 'mythic')).toMatchObject({ have: 1, total: 3 }); expect(g.find((x) => x.id === 'box')).toMatchObject({ have: 1, total: 5 });
    expect(g.find((x) => x.id === 'rare')!.rows.find((r) => r.def.id === 'fish_koi')!.known).toBe(true);
    expect(g.find((x) => x.id === 'rare')!.rows.every((r) => r.def.source !== 'box')).toBe(true); // 盲盒限定的稀有鱼不混进湖里的稀有
  });
  it('筛选：只看没钓到的 / 某个季节 / 夜里 / 雨天；筛选不改 total', () => {
    const all = fishGroups({}), un = fishGroups(log(['fish_carp']), { unseenOnly: true });
    expect(un.find((x) => x.id === 'common')!.rows.some((r) => r.def.id === 'fish_carp')).toBe(false); expect(un.find((x) => x.id === 'common')!.total).toBe(9);
    const winter = fishGroups({}, { season: 'winter' }).flatMap((x) => x.rows.map((r) => r.def.id)); expect(winter).toContain('fish_icefish');
    const spring = fishGroups({}, { season: 'spring' }).flatMap((x) => x.rows.map((r) => r.def.id)); expect(spring).not.toContain('fish_icefish'); // 冰湖银鱼王春天出现不了
    const night = fishGroups({}, { time: 'night' }).flatMap((x) => x.rows.map((r) => r.def.id)); expect(night).toContain('fish_snakehead'); expect(night).not.toContain('fish_koi'); expect(night).toContain('fish_carp'); // 全天的鱼夜里也能钓
    const rain = fishGroups({}, { rain: true }).flatMap((x) => x.rows.map((r) => r.def.id)); expect(rain).toContain('fish_loach'); expect(rain).not.toContain('fish_carp');
    expect(all.reduce((a, x) => a + x.rows.length, 0)).toBe(48);
  });
  it('"怎么得到"的提示：盲盒限定 / 神话 / 普通', () => {
    expect(fishHint(fishDef('fish_guppy')!)).toContain('盲盒'); expect(fishHint(fishDef('fish_yinglong')!)).toContain('神话'); expect(fishHint(fishDef('fish_carp')!)).toBe('还没钓到');
  });
});

describe('图鉴数据整理："现在能钓到什么"', () => {
  it('夜里黑鱼更靠前；冬天才有银鱼王；盲盒限定、神话、杂物不在里面；机会从高到低；标出钓没钓到', () => {
    const night = availableNow({ night: true, rain: false, season: 'autumn' }, log(['fish_snakehead'])), day = availableNow({ night: false, rain: false, season: 'autumn' }, {});
    const pos = (l: typeof night, id: string) => l.findIndex((r) => r.def.id === id);
    expect(pos(night, 'fish_snakehead')).toBeLessThan(pos(day, 'fish_snakehead')); expect(night.find((r) => r.def.id === 'fish_snakehead')!.known).toBe(true);
    expect(day.some((r) => r.def.id === 'fish_icefish')).toBe(false); expect(availableNow({ night: false, season: 'winter' }, {}).some((r) => r.def.id === 'fish_icefish')).toBe(true);
    for (const r of day) { expect(r.def.source).not.toBe('box'); expect(r.def.rarity).not.toBe('mythic'); expect(r.def.rarity).not.toBe('junk'); }
    for (let i = 1; i < day.length; i++) expect(day[i - 1].pct).toBeGreaterThanOrEqual(day[i].pct);
    expect(day[0].label).toBe('常见'); expect(day[day.length - 1].label).toBe('稀少'); expect(day.every((r) => r.pct > 0)).toBe(true);
  });
  it('河蟹秋天"常见"一档、春天掉到"稀少"', () => {
    const l = (season: 'spring' | 'autumn') => availableNow({ night: false, season }, {}).find((r) => r.def.id === 'fish_crab')!;
    expect(l('autumn').pct).toBeGreaterThan(l('spring').pct * 5);
  });
});

describe('图鉴数据整理：神话条件、装备图鉴、册页、里程碑、装备摘要', () => {
  it('神话鱼的条件逐条对照现在的环境和正在用的竿 / 饵', () => {
    const f = fishDef('fish_hegongjin')!;
    const ok = mythicChecks(f, { night: false, rain: false, season: 'spring' }, { rod: 'rod_carbon', bait: 'bait_pro' }, { fish_koi: { n: 20, best: 1, kg: 1 } }); expect(ok.every((c) => c.ok)).toBe(true);
    const no = mythicChecks(f, { night: true, rain: false, season: 'summer' }, { rod: 'fishing_rod', bait: 'bait' }, {}); expect(no.filter((c) => c.ok).length).toBe(0);
  });
  it('鱼竿 / 饵 / 配件行：背包里有或拥有过算拥有；特长场合当前满足就 active；饵显示用过几次', () => {
    const gd = emptyGearLog(); gd.rods.rod_bone = 1; gd.baits.bait_pro = 3;
    const rods = gearRows('rods', { rod_glow: 1 }, gd, { night: true }), glow = rods.find((r) => r.id === 'rod_glow')!;
    expect(rods.length).toBe(9); expect(glow).toMatchObject({ owned: true, active: true, tag: '夜里' }); expect(rods.find((r) => r.id === 'rod_bone')).toMatchObject({ owned: true, note: '拥有过' }); expect(rods.find((r) => r.id === 'rod_rain')).toMatchObject({ owned: false, active: false });
    expect(gearRows('rods', { rod_glow: 1 }, gd, { night: false }).find((r) => r.id === 'rod_glow')!.active).toBe(false);
    expect(gearRows('baits', {}, gd, { night: false }).find((r) => r.id === 'bait_pro')).toMatchObject({ owned: true, note: '用过 3 次' }); expect(gearRows('tackles', { tk_float: 1 }, gd, { night: false }).length).toBe(6);
  });
  it('册页：进度、集齐、已领；里程碑', () => {
    const gd = emptyGearLog(); gd.claimed.push('b_winter');
    const v = bundleViews(log(['fish_icefish', 'fish_silverling', 'fish_sturgeon', 'fish_loach']), gd, (id) => id);
    expect(v.find((b) => b.id === 'b_winter')).toMatchObject({ have: 3, need: 3, done: true, claimed: true }); expect(v.find((b) => b.id === 'b_rain')).toMatchObject({ have: 1, done: false, claimed: false });
    expect(v.find((b) => b.id === 'b_winter')!.reward).toContain('300');
    expect(milestoneViews(log(Array.from({ length: 12 }, (_, i) => ['fish_crucian', 'fish_carp', 'fish_grass', 'fish_gudgeon', 'fish_loach', 'fish_shrimp', 'fish_bream', 'fish_snakehead', 'fish_catfish', 'fish_silver', 'fish_bighead', 'fish_crayfish'][i]))).map((m) => m.done)).toEqual([true, false, false, false]);
  });
  it('装备摘要：咬钩快多少、稀有倍率、绿条、双钓、盲盒、声呐、指名；没有加成时是空', () => {
    const day = { night: false, season: 'summer' as const };
    expect(gearSummary(resolveGear({ fishing_rod: 1, bait: 1 }, {}, day))).toEqual([]);
    const s = gearSummary(resolveGear({ rod_bone: 1, bait_wild: 1, tk_float: 1, tk_sonar: 1, tk_buffer: 1 }, { bait: 'bait_wild', tackle: ['tk_float', 'tk_sonar'] }, day));
    expect(s.join(' ')).toContain('咬钩'); expect(s.join(' ')).toContain('绿条 +22%'); expect(s).toContain('声呐'); expect(s.join(' ')).toContain('双钓 12%'); expect(s.join(' ')).toContain('盲盒 ×1.3');
    expect(gearSummary(resolveGear({ fishing_rod: 1, bait_name: 1 }, { bait: 'bait_name', target: 'fish_carp' }, day))).toContain('只钓指定的鱼');
  });
});
