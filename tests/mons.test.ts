import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MON, calcDamage, calcStats, catchChance, genMoves, learnsetOf, levelForXp, makeContent, makeRng, maxHp, monStats, movesAtLevel,
  newMon, restore, typeMult, xpForLevel, xpGain, type Content, type ElementPack, type Mon, type Species,
} from '../src/shared/mons';
import { gainXp, runChance, startBattle, step, type Battle, type BEvent } from '../src/shared/battle';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const json = <T>(p: string): T => JSON.parse(readFileSync(f(p), 'utf8')) as T;
const OPEN = json<ElementPack>('../data/mons/packs/open/elements.json');
const T18 = json<{ order: string[]; chart: ElementPack['chart'] }>('../data/mons/typechart-18.json');
const LOCAL = f('../data/mons/packs/local-pokedex/species.json');
const PACK18: ElementPack = { id: 't18', normal: '一般', elements: T18.order.map((id) => ({ id, name: id, color: '#888' })), chart: T18.chart };

const sp = (id: string, types: string[], base: Species['base'], extra: Partial<Species> = {}): Species => ({ id, no: 1, name: id, types, base, catch: 0.3, ...extra });
const FIX: Species[] = [
  sp('fire1', ['火'], [60, 70, 50, 70, 50, 70]),
  sp('water1', ['水'], [60, 70, 50, 70, 50, 60]),
  sp('wood1', ['草', '飞行'], [60, 60, 60, 60, 60, 50]),
  sp('norm1', ['一般'], [60, 60, 60, 60, 60, 60]),
];
const CT: Content = makeContent(OPEN, FIX);
const mon = (spId: string, lv: number, seed = 1, id = 'm1') => newMon(CT, spId, lv, makeRng(seed), id, 0);

describe('属性相克表', () => {
  it('18 属性表与已知事实一致（来源 Showdown typechart）', () => {
    expect(typeMult(PACK18, '水', ['火'])).toBe(2);
    expect(typeMult(PACK18, '电', ['地面'])).toBe(0);
    expect(typeMult(PACK18, '一般', ['幽灵'])).toBe(0);
    expect(typeMult(PACK18, '妖精', ['龙'])).toBe(2);
    expect(typeMult(PACK18, '龙', ['妖精'])).toBe(0);
    expect(typeMult(PACK18, '钢', ['妖精'])).toBe(2);
    expect(typeMult(PACK18, '水', ['火', '地面'])).toBe(4);
    expect(typeMult(PACK18, '草', ['火', '飞行'])).toBe(0.25);
    const all = Object.values(PACK18.chart).flatMap((r) => Object.values(r));
    expect(all.filter((v) => v === 2).length).toBe(51);
    expect(all.filter((v) => v === 0).length).toBe(8);
  });

  it('开放包使用 18 属性表：属性齐全、每种都有克制目标与弱点、普通攻击不被抵抗以外的任何关系', () => {
    const ids = OPEN.elements.map((e) => e.id);
    expect(ids).toEqual(T18.order); expect(OPEN.normal).toBe('一般');
    expect(OPEN.elements.every((e) => /^#[0-9a-f]{6}$/i.test(e.color))).toBe(true);
    for (const e of ids) {
      expect(ids.some((d) => OPEN.chart[e]?.[d] === 2) || e === '一般', `${e} 没有克制目标`).toBe(true);
      expect(ids.some((a) => OPEN.chart[a]?.[e] === 2), `${e} 没有弱点`).toBe(true);
    }
    let lo = 9, hi = 0;
    for (const a of ids) for (const d1 of ids) for (const d2 of ids) if (d1 < d2) { const m = typeMult(OPEN, a, [d1, d2]); lo = Math.min(lo, m); hi = Math.max(hi, m); }
    expect(lo).toBe(0); expect(hi).toBe(4);
  });
});

describe('旧页面容错', () => {
  it('不认识的物种（页面是旧版本、服务器已有新物种）不会让能力值计算抛错，血量上限至少是个正数', () => {
    const m = { id: 'z', sp: 'not-a-species', lv: 7, xp: 343, hp: 3, iv: [1, 2, 3, 4, 5, 6], mv: [], at: 0 };
    expect(() => monStats(CT, m)).not.toThrow(); expect(maxHp(CT, m)).toBeGreaterThan(0);
  });
});

describe('能力值、经验、捕捉', () => {
  it('能力值公式：种族值 45/49、个体 31、50 级 → 生命 120、攻击 69', () => {
    const s = calcStats([45, 49, 49, 65, 65, 45], [31, 31, 31, 31, 31, 31], 50);
    expect(s.hp).toBe(120); expect(s.atk).toBe(69);
  });
  it('经验：立方曲线，升级有上限', () => {
    expect(xpForLevel(10)).toBe(1000);
    expect(levelForXp(999)).toBe(9); expect(levelForXp(1000)).toBe(10);
    expect(levelForXp(10 ** 9)).toBe(MON.LEVEL_CAP);
    expect(xpGain(FIX[0], 14)).toBe(Math.floor((Math.round(370 / 5) * 14) / 7));
    expect(xpGain(FIX[0], 14, 0.5)).toBeLessThan(xpGain(FIX[0], 14));
  });
  it('捕捉：血越少越容易，道具倍率提高成功率，夹在上下限里', () => {
    const s = FIX[0];
    expect(catchChance(s, 100, 100)).toBeCloseTo(0.3);
    expect(catchChance(s, 50, 100)).toBeGreaterThan(catchChance(s, 100, 100));
    expect(catchChance(s, 1, 100)).toBeGreaterThan(catchChance(s, 50, 100));
    expect(catchChance(s, 100, 100, 2)).toBeGreaterThan(catchChance(s, 100, 100, 1));
    expect(catchChance({ ...s, catch: 0.001 }, 100, 100)).toBe(MON.CATCH_FLOOR);
    expect(catchChance({ ...s, catch: 0.9 }, 1, 100, 3)).toBe(MON.CATCH_CEIL);
  });
  it('生成精灵：个体值在范围内、满血、技能不超过 4 个，相同种子相同结果', () => {
    const a = mon('fire1', 20, 7), b = mon('fire1', 20, 7);
    expect(a).toEqual(b);
    expect(a.iv.length).toBe(6); expect(a.iv.every((v) => v >= 0 && v <= MON.MAX_IV)).toBe(true);
    expect(a.hp).toBe(maxHp(CT, a)); expect(a.mv.length).toBeGreaterThanOrEqual(2); expect(a.mv.length).toBeLessThanOrEqual(MON.MOVES_MAX);
    expect(mon('fire1', 99).lv).toBe(MON.LEVEL_CAP);
  });
});

describe('技能与伤害', () => {
  it('每个属性 4 个通用技能；技能表按规则生成且全部存在', () => {
    expect(genMoves(OPEN).length).toBe(18 * 4);
    for (const s of FIX) {
      const ls = learnsetOf(CT, s);
      expect(ls.length).toBeGreaterThanOrEqual(4);
      expect(ls.filter((e) => e.lv === 1).length).toBeGreaterThanOrEqual(2);
      for (const e of ls) expect(CT.moves.has(e.id), e.id).toBe(true);
      expect(new Set(ls.map((e) => e.id)).size).toBe(ls.length);
    }
    expect(movesAtLevel(CT, FIX[2], 30).length).toBe(MON.MOVES_MAX);
  });
  it('伤害：克制 ×2、被克 ×0.5、同属 ×1.5、免疫为 0、至少 1、相同随机序列相同结果', () => {
    const att = { lv: 20, stats: calcStats(FIX[1].base, [15, 15, 15, 15, 15, 15], 20), types: FIX[1].types };
    const defOf = (t: string[]) => ({ stats: calcStats([60, 60, 60, 60, 60, 60], [15, 15, 15, 15, 15, 15], 20), types: t });
    const mv = CT.moves.get('水:p50')!;
    const r1 = calcDamage(CT, att, defOf(['火']), mv, makeRng(3)), r2 = calcDamage(CT, att, defOf(['火']), mv, makeRng(3));
    expect(r1).toEqual(r2);
    expect(r1.mult).toBe(2); expect(r1.stab).toBe(true);
    const weak = calcDamage(CT, att, defOf(['水']), mv, makeRng(3));
    expect(weak.mult).toBe(0.5); expect(weak.dmg).toBeLessThan(r1.dmg);
    expect(calcDamage(CT, att, defOf(['地面']), CT.moves.get('电:p50')!, makeRng(3)).dmg).toBe(0); // 电打地面：免疫
    expect(calcDamage(CT, { ...att, lv: 1, stats: { ...att.stats, atk: 1 } }, defOf(['一般']), CT.moves.get('水:p50')!, makeRng(1)).dmg).toBeGreaterThanOrEqual(1);
  });
});

/** 一场用固定随机序列的战斗 */
const run = (b: Battle, seed: number, pick: (b: Battle, ev: BEvent[]) => Parameters<typeof step>[2], max = 200) => {
  const rnd = makeRng(seed), all: BEvent[] = [];
  for (let i = 0; i < max && b.phase !== 'over'; i++) {
    const r = step(CT, b, pick(b, all), rnd);
    expect(r.ok, r.err).toBe(true); all.push(...r.ev);
  }
  return all;
};
const fight = (b: Battle) => ({ t: 'move' as const, i: 0 });

describe('战斗', () => {
  it('相同种子 + 相同行动 → 事件完全一致（可复盘）', () => {
    const a = run(startBattle('b', mon('fire1', 12, 5, 'w'), [mon('water1', 12, 6, 'a')]), 99, fight);
    const b = run(startBattle('b', mon('fire1', 12, 5, 'w'), [mon('water1', 12, 6, 'a')]), 99, fight);
    expect(a).toEqual(b); expect(a.length).toBeGreaterThan(3);
  });
  it('打赢：野生精灵倒下、给经验、可能升级；输了：队伍全倒', () => {
    const b = startBattle('b', mon('fire1', 3, 5, 'w'), [mon('water1', 20, 6, 'a')]);
    const ev = run(b, 1, fight);
    expect(b.result).toBe('win'); expect(ev.some((e) => e.t === 'xp')).toBe(true); expect(b.squad[0].xp).toBeGreaterThan(xpForLevel(20));
    const c = startBattle('c', mon('fire1', 30, 5, 'w'), [mon('water1', 3, 6, 'a')]);
    run(c, 2, fight); expect(c.result).toBe('lose'); expect(c.squad[0].hp).toBe(0);
  });
  it('首发倒下且队里还有活的 → 先要换人；换人后继续，不能乱出招', () => {
    const b = startBattle('b', mon('fire1', 30, 5, 'w'), [mon('water1', 3, 6, 'a'), mon('water1', 30, 8, 'b')]);
    const rnd = makeRng(4);
    for (let i = 0; i < 60 && b.phase === 'choose'; i++) step(CT, b, { t: 'move', i: 0 }, rnd);
    expect(b.phase).toBe('swap');
    expect(step(CT, b, { t: 'move', i: 0 }, rnd).ok).toBe(false);
    expect(step(CT, b, { t: 'swap', i: 0 }, rnd).ok).toBe(false); // 倒下的那只
    expect(step(CT, b, { t: 'swap', i: 1 }, rnd).ok).toBe(true);
    expect(b.phase).toBe('choose'); expect(b.lead).toBe(1);
  });
  it('捕捉：成功则战斗结束并标记 caught；失败消耗回合，野生精灵反击；倍率不对被拒', () => {
    const win = startBattle('b', mon('fire1', 5, 5, 'w'), [mon('water1', 30, 6, 'a')]);
    win.wild.hp = 1;
    expect(step(CT, win, { t: 'ball', mul: 0 }, makeRng(1)).ok).toBe(false);
    const r = step(CT, win, { t: 'ball', mul: 1000 }, makeRng(1));
    expect(r.ok).toBe(true); expect(win.result).toBe('caught'); expect(win.phase).toBe('over');
    expect(step(CT, win, { t: 'run' }, makeRng(1)).ok).toBe(false);
    const fail = startBattle('b', mon('fire1', 25, 5, 'w'), [mon('water1', 25, 6, 'a')]);
    const f1 = step(CT, fail, { t: 'ball', mul: 0.0001 }, makeRng(1));
    expect(f1.ev.some((e) => e.t === 'break')).toBe(true); expect(f1.ev.some((e) => e.t === 'use' && e.side === 'foe')).toBe(true);
    expect(fail.phase).toBe('choose'); expect(fail.turn).toBe(2);
  });
  it('逃跑：越试越容易；成功即结束', () => {
    expect(runChance(50, 100, 0)).toBeLessThan(runChance(100, 50, 0));
    expect(runChance(50, 100, 3)).toBeGreaterThan(runChance(50, 100, 0));
    const b = startBattle('b', mon('fire1', 20, 5, 'w'), [mon('water1', 20, 6, 'a')]);
    run(b, 3, () => ({ t: 'run' }), 60); expect(b.result === 'fled' || b.result === 'lose').toBe(true);
  });
  it('PP：出招扣 PP，PP 为 0 的技能被拒；全部 PP 为 0 时用"挣扎"', () => {
    const b = startBattle('b', mon('fire1', 30, 5, 'w'), [mon('water1', 30, 6, 'a')]);
    b.wild.hp = 9999;
    const rnd = makeRng(1), m = b.squad[0];
    const before = m.mv[0].pp; step(CT, b, { t: 'move', i: 0 }, rnd); expect(m.mv[0].pp).toBe(before - 1);
    m.mv[0].pp = 0; expect(step(CT, b, { t: 'move', i: 0 }, rnd).ok).toBe(false);
    m.mv.forEach((x) => { x.pp = 0; }); m.hp = maxHp(CT, m);
    const r = step(CT, b, { t: 'move', i: 0 }, rnd); expect(r.ok).toBe(true); expect(r.ev.some((e) => e.t === 'use' && e.move === 'struggle')).toBe(true);
  });
  it('升级：血量上限涨多少、当前血量跟着涨多少；到 7 级学新技能；技能满 4 个只提示', () => {
    const m = mon('fire1', 6, 5, 'a'); m.hp = 5; const hp0 = maxHp(CT, m), ev: BEvent[] = [];
    gainXp(CT, m, 0, xpForLevel(7) - m.xp, ev);
    expect(m.lv).toBe(7); expect(m.hp).toBe(5 + maxHp(CT, m) - hp0);
    expect(ev.some((e) => e.t === 'learn' && !e.full)).toBe(true);
    const n = mon('wood1', 11, 5, 'b'); n.mv = [{ id: '草:p50', pp: 1 }, { id: '草:s50', pp: 1 }, { id: '火:p50', pp: 1 }, { id: '一般:p50', pp: 1 }];
    const ev2: BEvent[] = []; gainXp(CT, n, 0, xpForLevel(12) - n.xp, ev2);
    expect(n.mv.length).toBe(4); expect(ev2.some((e) => e.t === 'learn' && e.full)).toBe(true);
  });
  it('平衡（蒙特卡洛）：同级同能力互打，平均 3~9 回合，先手方胜率不过分偏', () => {
    let turns = 0, wins = 0; const N = 300;
    for (let s = 1; s <= N; s++) {
      const b = startBattle('b', mon('fire1', 20, s, 'w'), [mon('fire1', 20, s + 1000, 'a')]);
      b.wild.iv = b.squad[0].iv.slice(); b.wild.hp = b.squad[0].hp = maxHp(CT, b.wild);
      const pk = makeRng(s + 500); // 双方都随机出招（野生精灵本来就是随机出招），否则胜率反映的是出招策略而不是引擎
      run(b, s, (bb) => ({ t: 'move', i: Math.floor(pk() * bb.squad[0].mv.length) })); turns += b.turn; if (b.result === 'win') wins++;
    }
    expect(turns / N).toBeGreaterThanOrEqual(3); expect(turns / N).toBeLessThanOrEqual(9);
    expect(wins / N).toBeGreaterThan(0.35); expect(wins / N).toBeLessThan(0.65);
  });
  it('恢复：血量与 PP 回满', () => {
    const m = mon('fire1', 20, 5, 'a'); m.hp = 1; m.mv[0].pp = 0; restore(CT, m);
    expect(m.hp).toBe(monStats(CT, m).hp); expect(m.mv[0].pp).toBe(CT.moves.get(m.mv[0].id)!.pp);
  });
});

/** 本地内容包（只在本机存在时才测；仓库里没有，CI 会跳过） */
describe.skipIf(!existsSync(LOCAL))('本地内容包（转换后的图鉴素材）', () => {
  const species = existsSync(LOCAL) ? json<Species[]>('../data/mons/packs/local-pokedex/species.json') : [];
  const els = existsSync(LOCAL) ? json<ElementPack>('../data/mons/packs/local-pokedex/elements.json') : PACK18;
  it('物种数据完整；属性都在相克表里；文本里没有品牌词', () => {
    expect(species.length).toBe(898);
    const ids = new Set(els.elements.map((e) => e.id));
    for (const s of species) {
      expect(s.base.length, s.id).toBe(6); expect(s.types.length, s.id).toBeGreaterThanOrEqual(1);
      for (const t of s.types) expect(ids.has(t), `${s.id} ${t}`).toBe(true);
      expect(s.catch, s.id).toBeGreaterThan(0);
    }
    expect(JSON.stringify(species).includes('宝可梦')).toBe(false);
  });
  it('每个物种都能生成精灵、有至少 2 个 1 级技能，并能打一场完整的战斗', () => {
    const ct = makeContent(els, species);
    for (const s of species) { const m = newMon(ct, s.id, 10, makeRng(s.no), 'x', 0); expect(m.mv.length, s.id).toBeGreaterThanOrEqual(2); }
    const b = startBattle('b', newMon(ct, 'n025', 5, makeRng(1), 'w', 0), [newMon(ct, 'n001', 12, makeRng(2), 'a', 0)]);
    const rnd = makeRng(5); for (let i = 0; i < 100 && b.phase !== 'over'; i++) expect(step(ct, b, { t: 'move', i: 0 }, rnd).ok).toBe(true);
    expect(b.phase).toBe('over');
  });
});

const ART = f('../data/mons/art/zoonami-50-monsters-2d/Monsters/');
describe('开放包（第一版 10 只）', () => {
  type OS = Species & { art: { pack: string; n: number } };
  const sps = json<OS[]>('../data/mons/packs/open/species.json');
  it('10 只；属性合法；18 种属性全部覆盖；种族值与捕捉率合理；名字不重复', () => {
    expect(sps.length).toBe(10);
    const ids = new Set(OPEN.elements.map((e) => e.id)), cov = new Set<string>();
    for (const s of sps) {
      expect(s.types.length).toBeGreaterThanOrEqual(1); expect(s.types.length).toBeLessThanOrEqual(2);
      for (const t of s.types) { expect(ids.has(t), `${s.id} ${t}`).toBe(true); cov.add(t); }
      const bst = s.base.reduce((a, b) => a + b, 0);
      expect(bst, s.id).toBeGreaterThanOrEqual(340); expect(bst, s.id).toBeLessThanOrEqual(460);
      expect(s.catch, s.id).toBeGreaterThan(0.02); expect(s.catch, s.id).toBeLessThanOrEqual(0.3);
    }
    expect(cov.size).toBe(18);
    expect(new Set(sps.map((s) => s.name)).size).toBe(10); expect(new Set(sps.map((s) => s.art.n)).size).toBe(10);
  });
  it('美术文件齐全（正/背/备用配色），并且都能生成精灵与技能', () => {
    const ct = makeContent(OPEN, sps);
    for (const s of sps) {
      for (const side of ['Front', 'Back']) {
        expect(existsSync(`${ART}Normal Colors/Monster #${s.art.n} ${side} Normal Color Palette.png`), `${s.id} ${side}`).toBe(true);
        expect(existsSync(`${ART}Alternative Colors/Monster #${s.art.n} ${side} Alternative Color Palette.png`), `${s.id} ${side} alt`).toBe(true);
      }
      expect(newMon(ct, s.id, 10, makeRng(s.no), 'x', 0).mv.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });
  it.skipIf(!existsSync(LOCAL))('名字与本地素材包里的官方中文名没有重合', () => {
    const official = new Set(json<Species[]>('../data/mons/packs/local-pokedex/species.json').map((s) => s.name));
    for (const s of sps) expect(official.has(s.name), s.name).toBe(false);
  });
});
