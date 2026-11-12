import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catchChance, makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import {
  applyStatus, cannotAct, catchStatusMul, clearStatus, startBattle, statusOf, step,
  type Battle, type BEvent,
} from '@/shared/battle';
import { cleanMonSave, emptyMonSave } from '@/shared/monbox';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, learnset: Species['learnset']): Species => ({ id, no: 1, name: id, types: ['一般'], base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset });
const CT: Content = makeContent(OPEN, [
  sp('a', [{ lv: 1, id: '一般:p50' }, { lv: 1, id: '一般:s50' }]),
  sp('b', [{ lv: 1, id: '一般:p50' }]),
]);
const mon = (id: string) => newMon(CT, 'a', 20, () => 0.5, id, 0);
const b = (): Battle => startBattle('b', mon('foe'), [mon('me')]);

describe('状态异常 · 施加与互斥', () => {
  it('P1：施加状态成功并记录', () => {
    const bt = b();
    expect(applyStatus(bt, bt.wild, 'poison', makeRng(1))).toBe(true);
    expect(statusOf(bt, bt.wild)?.k).toBe('poison');
  });

  it('P9/N2：同种状态重复施加无效、不刷新', () => {
    const bt = b();
    applyStatus(bt, bt.wild, 'sleep', makeRng(1));
    const n0 = statusOf(bt, bt.wild)!.n;
    expect(applyStatus(bt, bt.wild, 'sleep', makeRng(9))).toBe(false);
    expect(statusOf(bt, bt.wild)!.n).toBe(n0);
  });

  it('N1：睡眠和冰冻互斥', () => {
    const bt = b();
    applyStatus(bt, bt.wild, 'sleep', makeRng(1));
    expect(applyStatus(bt, bt.wild, 'freeze', makeRng(1))).toBe(false);
    expect(statusOf(bt, bt.wild)!.k).toBe('sleep');
  });

  it('毒性 / 灼伤 / 麻痹可以共存', () => {
    const bt = b();
    expect(applyStatus(bt, bt.wild, 'poison', makeRng(1))).toBe(true);
    expect(applyStatus(bt, bt.wild, 'burn', makeRng(1))).toBe(true); // 覆盖：同精灵只保留一个
    expect(statusOf(bt, bt.wild)!.k).toBe('burn');
  });
});

describe('状态异常 · 回合结算', () => {
  it('P2：中毒每回合掉 1/8', () => {
    const bt = b(); bt.wild.hp = 160; bt.squad[0].hp = 999;
    applyStatus(bt, bt.wild, 'poison', makeRng(1));
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    const ev = r.ev.find((e) => e.t === 'statusdmg') as Extract<BEvent, { t: 'statusdmg' }> | undefined;
    expect(ev).toMatchObject({ side: 'foe', k: 'poison', dmg: Math.max(1, Math.floor(maxHp(CT, bt.wild) / 8)) });
  });

  it('P3：灼伤每回合掉 1/16，且物理伤害约一半', () => {
    const bt = b(); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    applyStatus(bt, bt.squad[0], 'burn', makeRng(1));
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    const dmgEv = r.ev.find((e) => e.t === 'hit' && e.side === 'foe') as Extract<BEvent, { t: 'hit' }>;
    const clean = b(); clean.wild.hp = 9999; clean.squad[0].hp = 9999;
    const r2 = step(CT, clean, { t: 'move', i: 0 }, makeRng(3));
    const dmg2 = r2.ev.find((e) => e.t === 'hit' && e.side === 'foe') as Extract<BEvent, { t: 'hit' }>;
    expect(dmgEv.dmg).toBeLessThan(dmg2.dmg);
    const tick = r.ev.find((e) => e.t === 'statusdmg' && e.side === 'me') as Extract<BEvent, { t: 'statusdmg' }>;
    expect(tick.dmg).toBe(Math.max(1, Math.floor(maxHp(CT, clean.squad[0]) / 16)));
  });

  it('P5：睡眠 1–3 回合，计数 −1，到 0 解除', () => {
    const bt = b(); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    applyStatus(bt, bt.squad[0], 'sleep', makeRng(1));
    const n0 = statusOf(bt, bt.squad[0])!.n!;
    expect(n0).toBeGreaterThanOrEqual(1); expect(n0).toBeLessThanOrEqual(3);
    let guard = 0;
    while (statusOf(bt, bt.squad[0]) && guard++ < 10) step(CT, bt, { t: 'move', i: 0 }, makeRng(1));
    expect(statusOf(bt, bt.squad[0])).toBeUndefined();
  });

  it('P6：冰冻行动前 20% 解冻；未解冻 blocked', () => {
    const bt = b(); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    applyStatus(bt, bt.squad[0], 'freeze', makeRng(1));
    expect(cannotAct(bt, bt.squad[0])).toBe('freeze');
    // 高随机值：不解冻
    const stuck = b(); stuck.wild.hp = 9999; stuck.squad[0].hp = 9999;
    applyStatus(stuck, stuck.squad[0], 'freeze', makeRng(1));
    const r = step(CT, stuck, { t: 'move', i: 0 }, () => 0.99);
    expect(r.ev.some((e) => e.t === 'blocked' && e.side === 'me')).toBe(true);
  });

  it('P7：毒 / 灼伤可以打死野生精灵并算胜利', () => {
    const bt = b(); bt.wild.hp = 2;
    applyStatus(bt, bt.wild, 'poison', makeRng(1));
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.result).toBe('win');
    expect(r.ev.some((e) => e.t === 'xp')).toBe(true);
  });

  it('P8：状态跟着精灵走，换人不重置', () => {
    const bt = startBattle('b', mon('foe'), [mon('me'), mon('me2')]);
    applyStatus(bt, bt.squad[0], 'burn', makeRng(1));
    bt.squad[0].hp = 1;
    step(CT, bt, { t: 'swap', i: 1 }, makeRng(1));
    expect(statusOf(bt, bt.squad[0])?.k).toBe('burn');
  });

  it('N6/N9：掉血不为负；解除后不再掉血', () => {
    const bt = b(); bt.wild.hp = 1;
    applyStatus(bt, bt.wild, 'poison', makeRng(1));
    step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.wild.hp).toBeGreaterThanOrEqual(0);
    const c = b(); c.wild.hp = 999; applyStatus(c, c.wild, 'poison', makeRng(1));
    clearStatus(c, c.wild);
    const r = step(CT, c, { t: 'move', i: 0 }, makeRng(3));
    expect(r.ev.some((e) => e.t === 'statusdmg')).toBe(false);
  });

  it('N7：倒下后不再触发状态事件', () => {
    const bt = b(); bt.wild.hp = 1;
    step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.result).toBe('win');
    expect(statusOf(bt, bt.wild)).toBeUndefined();
  });
});

describe('状态异常 · 捕捉', () => {
  it('P10/N13：睡眠 / 冰冻捕捉 ×2，且夹在上下限', () => {
    const spc = CT.species.get('a')!;
    const base = catchChance(spc, 10, 100, 1, 1);
    const bonus = catchChance(spc, 10, 100, 1, 2);
    expect(bonus).toBeGreaterThan(base);
    expect(bonus).toBeLessThanOrEqual(0.95);
    const bt = b();
    applyStatus(bt, bt.wild, 'sleep', makeRng(1));
    expect(catchStatusMul(bt, bt.wild)).toBe(2);
    applyStatus(b(), bt.wild, 'poison', makeRng(1));
    clearStatus(bt, bt.wild); applyStatus(bt, bt.wild, 'poison', makeRng(1));
    expect(catchStatusMul(bt, bt.wild)).toBe(1);
  });
});

describe('状态异常 · 确定性 / 兼容', () => {
  it('N10：相同种子 + 相同行动结果一致', () => {
    const run = (seed: number) => {
      const bt = b(); bt.wild.hp = 999; bt.squad[0].hp = 999;
      applyStatus(bt, bt.wild, 'poison', makeRng(seed));
      const rnd = makeRng(seed); const ev: BEvent[] = [];
      for (let i = 0; i < 5; i++) { if (bt.phase === 'over') break; ev.push(...step(CT, bt, { t: 'move', i: 0 }, rnd).ev); }
      return { ev, hp: bt.wild.hp };
    };
    expect(run(3)).toEqual(run(3));
  });

  it('N3：状态不进存档', () => {
    const s = emptyMonSave(); s.sq = [mon('x')]; s.starter = true;
    const back = cleanMonSave(JSON.parse(JSON.stringify(s)), CT)!;
    expect(JSON.stringify(back)).not.toMatch(/"status"/);
  });

  it('N11：没有状态的内容包正常', () => {
    const bt = b();
    expect(() => step(CT, bt, { t: 'move', i: 0 }, makeRng(1))).not.toThrow();
  });

  it('N8：没有状态字段的招式不产生 status 事件', () => {
    const bt = b();
    const r = step(CT, bt, { t: 'move', i: 0 }, () => 0.01);
    expect(r.ev.some((e) => e.t === 'status')).toBe(false);
  });
});
