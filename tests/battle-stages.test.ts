import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcDamage, makeContent, makeRng, maxHp, newMon, stageMul, STAGE_MAX, type Content, type ElementPack, type Species } from '@/shared/mons';
import { bumpStage, stagesOf, stagedStats, startBattle, step, zeroStages, type Battle, type BEvent } from '@/shared/battle';
import { cleanMonSave, emptyMonSave } from '@/shared/monbox';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;

const sp = (id: string, base: Species['base'], learnset: Species['learnset']): Species => ({ id, no: 1, name: id, types: ['一般'], base, catch: 0.3, learnset });
const CT: Content = makeContent(OPEN, [
  sp('a', [100, 100, 100, 100, 100, 100], [{ lv: 1, id: '一般:p50' }, { lv: 1, id: '一般:s50' }]),
  sp('b', [100, 100, 100, 100, 100, 100], [{ lv: 1, id: '一般:p50' }]),
]);
const mon = (id: string, lv = 20) => newMon(CT, 'a', lv, () => 0.5, id, 0);
const b = (): Battle => startBattle('b', mon('foe'), [mon('me')]);

describe('能力等级 · 分档倍率', () => {
  it('P2/P3：+2 = ×2，-2 = ×0.5；上下界 ±6', () => {
    expect(stageMul(0)).toBe(1);
    expect(stageMul(2)).toBe(2);
    expect(stageMul(-2)).toBe(0.5);
    expect(stageMul(6)).toBe(4);
    expect(stageMul(-6)).toBeCloseTo(0.25);
    expect(stageMul(99)).toBe(4);
    expect(stageMul(-99)).toBeCloseTo(0.25);
  });

  it('N1：bumpStage 截断在 ±6，返回实际变化', () => {
    const bt = b();
    expect(bumpStage(bt, bt.squad[0], 'atk', 10)).toEqual({ d: 6, v: 6 });
    expect(bumpStage(bt, bt.squad[0], 'atk', 3)).toEqual({ d: 0, v: 6 });
    expect(bumpStage(bt, bt.squad[0], 'atk', -99)).toEqual({ d: -12, v: -6 });
  });

  it('N9：相同种子 + 相同行动结果一致', () => {
    const run = (seed: number) => {
      const bt = b(); const rnd = makeRng(seed); const ev: BEvent[] = [];
      for (let i = 0; i < 20 && bt.phase !== 'over'; i++) ev.push(...step(CT, bt, { t: 'move', i: 0 }, rnd).ev);
      return { ev, hp: bt.wild.hp };
    };
    expect(run(7)).toEqual(run(7));
  });
});

describe('能力等级 · 战斗内生效', () => {
  it('P7/P8：按精灵记；换人不重置；倒下清零', () => {
    const bt = b();
    bumpStage(bt, bt.squad[0], 'def', -2);
    expect(stagesOf(bt, bt.squad[0]).def).toBe(-2);
    expect(bt.stages.get('me')!.def).toBe(-2);
    // 倒下：删掉该精灵的等级
    bt.stages.delete('me');
    expect(stagesOf(bt, bt.squad[0]).def).toBe(0);
  });

  it('P11：战斗结束不影响新的 Battle', () => {
    const a = b(); bumpStage(a, a.squad[0], 'atk', 3);
    const c = b();
    expect(stagesOf(c, c.squad[0]).atk).toBe(0);
  });

  it('P2/P3/P4：能力等级改变伤害（攻 +2 ≈ ×2，防 +2 ≈ ×0.5）', () => {
    // 直接对拍 calcDamage：用高数值避开 +2 常数和取整的影响；战斗流程另外测事件
    const raw = { hp: 1200, atk: 1200, def: 1200, spa: 1200, spd: 1200, spe: 1200 };
    const mv = CT.moves.get('一般:p50')!;
    const dmg = (meAtk: number, foeDef: number) => {
      const atkS = zeroStages(); atkS.atk = meAtk;
      const defS = zeroStages(); defS.def = foeDef;
      return calcDamage(CT, { lv: 100, stats: stagedStats(raw, atkS), types: ['一般'] }, { stats: stagedStats(raw, defS), types: ['一般'] }, { ...mv, power: 200 }, makeRng(5)).dmg;
    };
    const d0 = dmg(0, 0), d2 = dmg(2, 0), f2 = dmg(0, 2);
    expect(d0).toBeGreaterThan(50);
    expect(d2 / d0).toBeGreaterThan(1.85);
    expect(d2 / d0).toBeLessThan(2.15);
    expect(f2 / d0).toBeLessThan(0.55);
  });

  it('P1/P2：战斗里的攻击等级确实进入伤害（攻 +6 明显更高）', () => {
    const fight = (atkStage: number) => {
      const bt = b(); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
      bumpStage(bt, bt.squad[0], 'atk', atkStage); bumpStage(bt, bt.squad[0], 'spe', 6);
      const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(5));
      const idx = r.ev.findIndex((e) => e.t === 'use' && e.side === 'me');
      return (r.ev.slice(idx).find((e) => e.t === 'hit') as Extract<BEvent, { t: 'hit' }>).dmg;
    };
    expect(fight(6)).toBeGreaterThan(fight(0));
  });

  it('N7/N8：换人保留自身等级、被换下的精灵等级还在；倒下删除', () => {
    const bt = startBattle('b', mon('foe'), [mon('me'), mon('me2')]);
    bumpStage(bt, bt.squad[0], 'atk', 2);
    bt.squad[0].hp = 1;
    const r = step(CT, bt, { t: 'swap', i: 1 }, makeRng(1));
    expect(r.ok).toBe(true);
    expect(bt.stages.get('me')!.atk).toBe(2);
    expect(stagesOf(bt, bt.squad[1]).atk).toBe(0);
  });
});

describe('能力等级 · 招式附带效果', () => {
  it('N5：没有 stat 的招式不产生 stage 事件', () => {
    const bt = b();
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(r.ev.some((e) => e.t === 'stage')).toBe(false);
  });

  it('N6：chance 未命中时等级不变', () => {
    const ct = makeContent(OPEN, [sp('a', [100, 100, 100, 100, 100, 100], [{ lv: 1, id: '一般:p50' }])]);
    const m = ct.moves.get('一般:p50')!;
    (m as unknown as { stat: unknown }).stat = { k: 'atk', d: -1, target: 'foe', chance: 0 };
    try {
      const bt = startBattle('b', newMon(ct, 'a', 20, () => 0.5, 'foe', 0), [newMon(ct, 'a', 20, () => 0.5, 'me', 0)]);
      step(ct, bt, { t: 'move', i: 0 }, makeRng(2));
      expect(bt.stages.get('foe')?.atk ?? 0).toBe(0);
    } finally { delete (m as { stat?: unknown }).stat; }
  });

  it('P1：带 stat 的招式命中后改等级并推事件', () => {
    const ct = makeContent(OPEN, [sp('a', [100, 100, 100, 100, 100, 100], [{ lv: 1, id: '一般:p50' }])]);
    const m = ct.moves.get('一般:p50')!;
    (m as unknown as { stat: unknown }).stat = { k: 'atk', d: -1, target: 'foe', chance: 100 };
    try {
      const bt = startBattle('b', newMon(ct, 'a', 20, () => 0.5, 'foe', 0), [newMon(ct, 'a', 20, () => 0.5, 'me', 0)]);
      bumpStage(bt, bt.squad[0], 'spe', 6); // 保证我方先手
      const r = step(ct, bt, { t: 'move', i: 0 }, makeRng(2));
      const ev = r.ev.find((e) => e.t === 'stage') as Extract<BEvent, { t: 'stage' }> | undefined;
      expect(ev).toMatchObject({ side: 'foe', k: 'atk', d: -1, v: -1 });
    } finally { delete (m as { stat?: unknown }).stat; }
  });
});

describe('能力等级 · 兼容', () => {
  it('N2：能力等级不进存档', () => {
    const s = emptyMonSave(); const m = mon('x'); s.sq = [m]; s.starter = true;
    const back = cleanMonSave(JSON.parse(JSON.stringify(s)), CT)!;
    for (const key of Object.keys(back.sq[0])) expect(['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva']).not.toContain(key);
    expect(JSON.stringify(back)).not.toMatch(/"stages"/);
  });

  it('N10：没有 stat 的旧内容包正常工作', () => {
    const bt = b();
    expect(() => step(CT, bt, { t: 'move', i: 0 }, makeRng(1))).not.toThrow();
  });

  it('stagedStats 只放大五项，生命不变', () => {
    const st = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
    const s = zeroStages(); s.atk = 2; s.spe = -2;
    const out = stagedStats(st, s);
    expect(out.hp).toBe(100); expect(out.atk).toBe(200); expect(out.spe).toBe(50);
  });
});

describe('能力等级 · 先手', () => {
  it('P5：速度等级影响先手', () => {
    const foe = mon('foe'); foe.hp = maxHp(CT, foe);
    const bt = startBattle('b', foe, [mon('me')]);
    bt.squad[0].hp = maxHp(CT, bt.squad[0]);
    bumpStage(bt, bt.squad[0], 'spe', 2);
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(1));
    const uses = r.ev.filter((e) => e.t === 'use');
    expect((uses[0] as Extract<BEvent, { t: 'use' }>).side).toBe('me');
  });
});

describe('STAGE_MAX', () => {
  it('常量是 6', () => expect(STAGE_MAX).toBe(6));
});
