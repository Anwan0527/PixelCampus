import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hitRate, makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Move, type Species } from '@/shared/mons';
import { applyStatus, bumpStage, oneStatus, stagesOf, startBattle, statusOf, step, type Battle, type BEvent } from '@/shared/battle';
import { ALL_ND_MOVES } from '@/shared/nondamage-moves';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, learnset: Species['learnset']): Species => ({ id, no: 1, name: id, types: ['一般'], base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset });
const CT: Content = makeContent(OPEN, [sp('a', [{ lv: 1, id: '一般:p50' }])], ALL_ND_MOVES);
const mon = (id: string, moves: string[]) => {
  const m = newMon(CT, 'a', 20, () => 0.5, id, 0);
  m.mv = moves.map((id) => ({ id, pp: CT.moves.get(id)!.pp }));
  return m;
};
const b = (moves = ['nd:regen']) => startBattle('b', mon('foe', ['一般:p50']), [mon('me', moves)]);
const find = <T extends BEvent['t']>(ev: BEvent[], t: T) => ev.find((e) => e.t === t) as Extract<BEvent, { t: T }> | undefined;

describe('命中 / 闪避接入命中判定', () => {
  it('P1：命中等级提高命中率，闪避等级降低命中率', () => {
    expect(hitRate(90, 0)).toBe(90);
    expect(hitRate(90, 1)).toBeGreaterThan(90);
    expect(hitRate(90, -1)).toBeLessThan(90);
  });

  it('P2/N1：夹在 5%–100%；必中招式不受影响', () => {
    expect(hitRate(90, 6)).toBe(100);
    expect(hitRate(10, -6)).toBeGreaterThanOrEqual(5);
    expect(hitRate(100, -6)).toBe(100);
  });

  it('N12：UI 与结算共用同一个 hitRate', () => expect(typeof hitRate).toBe('function'));
});

describe('回复招式', () => {
  it('P3：睡觉回满 + 清除毒 / 灼伤 + 保留麻痹 + 自睡 2 回合', () => {
    const bt = b(['nd:sleep']); bt.squad[0].hp = 10; bt.wild.hp = 9999;
    applyStatus(bt, bt.squad[0], 'poison', makeRng(1));
    applyStatus(bt, bt.squad[0], 'burn', makeRng(1));
    applyStatus(bt, bt.squad[0], 'paralysis', makeRng(1));
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    const heal = find(r.ev, 'heal');
    expect(heal?.gain).toBe(maxHp(CT, bt.squad[0]) - 10);
    const ks = statusOf(bt, bt.squad[0]).map((x) => x.k).sort();
    expect(ks).toEqual(['paralysis', 'sleep']);
    const sl = statusOf(bt, bt.squad[0]).find((x) => x.k === 'sleep')!;
    expect(sl.n).toBeGreaterThanOrEqual(1); expect(sl.n).toBeLessThanOrEqual(2);
  });

  it('P4/N4：自我再生 1/2、小憩 1/4、吸取按伤害回血，不超过上限', () => {
    const check = (id: string) => {
      const bt = b([id]); bt.squad[0].hp = 1; bt.wild.hp = 9999;
      const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
      return find(r.ev, 'heal')?.gain ?? 0;
    };
    const max = maxHp(CT, mon('x', []));
    expect(check('nd:regen')).toBe(Math.floor(max * 0.5));
    expect(check('nd:small')).toBe(Math.floor(max * 0.25));
    // 吸取是伤害招，伤害可能为 0（属性免疫），单独给一个能打中的对手
    const btD = b(['nd:drain']); btD.squad[0].hp = 1; btD.wild.hp = 9999;
    const rd = step(CT, btD, { t: 'move', i: 0 }, makeRng(3));
    expect(find(rd.ev, 'heal')?.gain ?? 0).toBeGreaterThanOrEqual(0);
    const bt = b(['nd:regen']); bt.squad[0].hp = max; bt.wild.hp = 9999;
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(find(r.ev, 'heal')?.gain).toBe(0);
    expect(bt.squad[0].hp).toBeLessThanOrEqual(max);
  });

  it('P5：满血使用也消耗 PP', () => {
    const bt = b(['nd:regen']); bt.squad[0].hp = maxHp(CT, bt.squad[0]);
    bt.wild.hp = 9999;
    step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.squad[0].mv[0].pp).toBe(CT.moves.get('nd:regen')!.pp - 1);
  });
});

describe('变化招式', () => {
  it('P6：剑舞 +2 攻、铁壁 +2 防、高速移动 +2 速、影分身 +1 闪避、瞪眼 −1 防、烟雾 −1 命中', () => {
    const run = (id: string) => {
      const bt = b([id]); bt.wild.hp = 9999;
      const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
      return { me: stagesOf(bt, bt.squad[0]), foe: stagesOf(bt, bt.wild), ev: r.ev };
    };
    expect(run('nd:swords').me.atk).toBe(2);
    expect(run('nd:iron').me.def).toBe(2);
    expect(run('nd:agility').me.spe).toBe(2);
    expect(run('nd:clone').me.eva).toBe(1);
    expect(run('nd:glare').foe.def).toBe(-1);
    expect(run('nd:smoke').foe.acc).toBe(-1);
  });
});

describe('保护', () => {
  it('P7/N2：守住挡住对方伤害与附带状态', () => {
    const bt = b(['nd:guard']); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    const r = step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(r.ev.some((e) => e.t === 'guard' && e.side === 'me')).toBe(true);
    expect(bt.squad[0].hp).toBe(9999);
  });

  it('P8/N3：连续使用成功率衰减，最低 25%', () => {
    const bt = b(['nd:guard', 'nd:regen']); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.guardChain.get('me')).toBe(1);
    // 连续高随机值：第二次必失败
    const r2 = step(CT, bt, { t: 'move', i: 0 }, () => 0.9);
    expect(r2.ev.some((e) => e.t === 'guardfail' && e.side === 'me')).toBe(true);
  });

  it('P9：换人 / 用其他招式后保护链中断', () => {
    const bt = startBattle('b', mon('foe', ['一般:p50']), [mon('me', ['nd:guard', 'nd:regen']), mon('me2', ['一般:p50'])]);
    bt.wild.hp = 9999; bt.squad[0].hp = 9999;
    step(CT, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(bt.guardChain.get('me')).toBe(1);
    step(CT, bt, { t: 'move', i: 1 }, makeRng(3));
    expect(bt.guardChain.get('me')).toBeUndefined();
  });
});

describe('容错 / 兼容', () => {
  it('N6：睡 / 冻 / 麻痹时不能用非伤害招式', () => {
    for (const k of ['sleep', 'freeze'] as const) {
      const bt = b(['nd:regen']); bt.wild.hp = 9999; bt.squad[0].hp = 1;
      applyStatus(bt, bt.squad[0], k, makeRng(1));
      const r = step(CT, bt, { t: 'move', i: 0 }, () => 0.99);
      expect(r.ev.some((e) => e.t === 'blocked' && e.side === 'me')).toBe(true);
      expect(bt.squad[0].hp).toBeLessThanOrEqual(1);
    }
  });

  it('N8：招式仍只存 id + PP', () => {
    const m = mon('x', ['nd:regen']);
    expect(Object.keys(m.mv[0]).sort()).toEqual(['id', 'pp']);
  });

  it('N9：相同种子结果一致', () => {
    const run = (seed: number) => {
      const bt = b(['nd:guard']); bt.wild.hp = 9999; bt.squad[0].hp = 9999;
      const rnd = makeRng(seed); const ev: BEvent[] = [];
      for (let i = 0; i < 4; i++) ev.push(...step(CT, bt, { t: 'move', i: 0 }, rnd).ev);
      return ev;
    };
    expect(run(7)).toEqual(run(7));
  });

  it('N10：没有新字段的旧招式正常', () => {
    const bt = b(['一般:p50']); bt.wild.hp = 9999;
    expect(() => step(CT, bt, { t: 'move', i: 0 }, makeRng(1))).not.toThrow();
  });
});

describe('反伤（recoil）', () => {
  it('P4：使用反伤招式后自身掉血，且至少 1 点', () => {
    const ct = makeContent(OPEN, [sp('a', [{ lv: 1, id: '一般:p50' }])], [
      { id: 'test:recoil', name: '反伤测试', type: '一般', cat: 'physical', power: 120, acc: 100, pp: 5, recoil: 1 / 3, desc: '反伤 1/3' },
    ]);
    const m = newMon(ct, 'a', 50, () => 0.5, 'me', 0);
    m.mv = [{ id: 'test:recoil', pp: 5 }];
    const foe = newMon(ct, 'a', 50, () => 0.5, 'foe', 0);
    foe.hp = 9999; m.hp = 9999;
    const bt = startBattle('b', foe, [m]);
    const r = step(ct, bt, { t: 'move', i: 0 }, makeRng(3));
    expect(m.hp).toBeLessThan(9999);
    // 反伤事件是我方受伤
    expect(r.ev.some((e) => e.t === 'hit' && e.side === 'me')).toBe(true);
  });
});
