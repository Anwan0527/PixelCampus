import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import { fullSquad, pvpStep, sideOfUid, startPvp, submit, type PvpBattle } from '@/shared/pvp';
import type { BEvent } from '@/shared/battle';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, types: string[]): Species => ({ id, no: 1, name: id, types, base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset: [{ lv: 1, id: '一般:p50' }] });
const CT: Content = makeContent(OPEN, [sp('a', ['一般']), sp('b', ['火'])]);
const mon = (id: string, s = 'a', lv = 20) => newMon(CT, s, lv, () => 0.5, id, 0);

const mk = (): PvpBattle => {
  const a = fullSquad(CT, [mon('a1', 'a'), mon('a2', 'a')]);
  const b = fullSquad(CT, [mon('b1', 'b'), mon('b2', 'b')]);
  return startPvp('pv1', { uid: 1, name: 'A', squad: a }, { uid: 2, name: 'B', squad: b });
};

describe('PvP 共享规则', () => {
  it('P1：开始后双方满血、turn=1', () => {
    const bb = mk();
    expect(bb.turn).toBe(1);
    expect(bb.a.squad[0].hp).toBe(maxHp(CT, bb.a.squad[0]));
    expect(bb.b.squad[0].hp).toBe(maxHp(CT, bb.b.squad[0]));
  });

  it('P3：双方都提交后才结算；只提交一方不推进', () => {
    const bb = mk();
    expect(submit(bb, 1, { t: 'move', i: 0 }).ok).toBe(true);
    expect(pvpStep(CT, bb, makeRng(1)).ok).toBe(false);
    expect(submit(bb, 2, { t: 'move', i: 0 }).ok).toBe(true);
    expect(pvpStep(CT, bb, makeRng(1)).ok).toBe(true);
    expect(bb.turn).toBe(2);
  });

  it('N3：非参战玩家不能提交', () => {
    const bb = mk();
    expect(submit(bb, 99, { t: 'move', i: 0 }).ok).toBe(false);
    expect(sideOfUid(bb, 99)).toBe(null);
  });

  it('N4：同一回合不能重复提交', () => {
    const bb = mk();
    expect(submit(bb, 1, { t: 'move', i: 0 }).ok).toBe(true);
    expect(submit(bb, 1, { t: 'run' }).ok).toBe(false);
  });

  it('N5：对战里不能用零食包', () => {
    const bb = mk();
    expect(submit(bb, 1, { t: 'ball', mul: 1 }).ok).toBe(false);
  });

  it('P4：一方倒下且还有队友 → 自动换人后继续', () => {
    const bb = mk();
    bb.b.squad[0].hp = 1;
    bb.a.squad[0].hp = maxHp(CT, bb.a.squad[0]);
    submit(bb, 1, { t: 'move', i: 0 });
    submit(bb, 2, { t: 'move', i: 0 });
    const ph = () => (bb as unknown as { phase: string }).phase;
    let guard = 0;
    while (ph() !== 'over' && guard++ < 5 && bb.turn < 3) {
      pvpStep(CT, bb, makeRng(guard + 1));
      if (ph() === 'over') break;
      submit(bb, 1, { t: 'move', i: 0 });
      submit(bb, 2, { t: 'move', i: 0 });
    }
    expect(ph()).toBe('choose');
    expect(bb.b.lead).toBe(1);
  });

  it('P6：一方全倒 → 另一方胜利', () => {
    const bb = mk();
    bb.b.squad.forEach((m) => { m.hp = 1; });
    let guard = 0;
    while (bb.phase !== 'over' && guard++ < 20) {
      submit(bb, 1, { t: 'move', i: 0 });
      submit(bb, 2, { t: 'move', i: 0 });
      pvpStep(CT, bb, makeRng(guard));
    }
    expect(bb.phase).toBe('over');
    expect(bb.result?.winner).toBe('a');
  });

  it('P7：逃跑方判负', () => {
    const bb = mk();
    let guard = 0;
    while (bb.phase !== 'over' && guard++ < 30) {
      submit(bb, 1, { t: 'run' });
      submit(bb, 2, { t: 'move', i: 0 });
      pvpStep(CT, bb, makeRng(guard));
    }
    expect(bb.phase).toBe('over');
    expect(bb.result?.winner).toBe('b');
    expect(bb.result?.reason).toBe('fled');
  });

  it('N11：不会双方同时胜利', () => {
    const bb = mk();
    bb.a.squad.forEach((m) => { m.hp = 0; });
    bb.b.squad.forEach((m) => { m.hp = 0; });
    submit(bb, 1, { t: 'move', i: 0 });
    submit(bb, 2, { t: 'move', i: 0 });
    pvpStep(CT, bb, makeRng(1));
    expect(bb.result?.winner).toBe('none');
  });

  it('N9：相同种子结果一致', () => {
    const run = (seed: number) => {
      const bb = mk();
      const rnd = makeRng(seed);
      submit(bb, 1, { t: 'move', i: 0 });
      submit(bb, 2, { t: 'move', i: 0 });
      const r = pvpStep(CT, bb, rnd);
      return { a: r.a, hpA: bb.a.squad[0].hp, hpB: bb.b.squad[0].hp };
    };
    expect(run(7)).toEqual(run(7));
  });

  it('N12：事件里不含 HTML', () => {
    const bb = mk();
    submit(bb, 1, { t: 'move', i: 0 });
    submit(bb, 2, { t: 'move', i: 0 });
    const r = pvpStep(CT, bb, makeRng(1));
    expect(JSON.stringify(r)).not.toMatch(/<[a-z]/i);
  });
});
