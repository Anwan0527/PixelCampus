/**
 * 对战边界：同归于尽判负、Lv28+ 至少有一个伤害招。
 * 这两条都是实机自测时暴露的：野生/猫战 AI 会主动选高威力反伤招，
 * 把玩家和对手一起带走；而技能库第 5/6 号招都是变化招，导致 Lv28+ 的精灵打不出伤害。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, movesAtLevel, newMon, type Content, type ElementPack, type Move, type Species } from '@/shared/mons';
import { startBattle, step } from '@/shared/battle';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;

const sp = (id: string, types: string[], base: Species['base'], learnset: Species['learnset']): Species => ({ id, no: 1, name: id, types, base, catch: 0.3, learnset });
const CT: Content = makeContent(OPEN, [
  // 玩家快、对手慢，保证玩家先手
  sp('me', ['水'], [100, 100, 100, 100, 100, 200], [{ lv: 1, id: '一般:p50' }]),
  sp('foe', ['草'], [100, 100, 100, 100, 100, 1], [{ lv: 1, id: '一般:p50' }]),
]);

describe('同归于尽', () => {
  it('反伤把自己也带走时判负（不算胜利、不给经验）', () => {
    const recoil: Move = { id: 't:recoil', name: '反伤', type: '一般', cat: 'physical', power: 200, acc: 100, pp: 10, recoil: 0.5 };
    const ct: Content = { ...CT, moves: new Map(CT.moves).set(recoil.id, recoil) };
    const me = newMon(ct, 'me', 20, () => 0.5, 'me1', 0);
    const foe = newMon(ct, 'foe', 20, () => 0.5, 'foe1', 0);
    me.mv = [{ id: recoil.id, pp: 10 }];
    me.hp = 1; foe.hp = 1;
    const b = startBattle('b', foe, [me], 0);
    const r = step(ct, b, { t: 'move', i: 0 }, makeRng(1));
    expect(r.ok).toBe(true);
    expect(me.hp).toBe(0); // 反伤把自己打死了
    expect(foe.hp).toBe(0);
    expect(b.result).toBe('lose');
    expect(r.ev.some((e) => e.t === 'xp')).toBe(false);
  });
});

describe('Lv28+ 的招式', () => {
  it('学到全是变化招时，至少保留一个威力最高的伤害招', () => {
    // 模仿技能库：前 4 个是伤害招，第 5/6 个是变化招
    const learnset = [
      { lv: 1, id: '一般:p50' }, { lv: 8, id: '一般:p70' }, { lv: 15, id: '一般:p100' }, { lv: 20, id: '一般:s100' },
      { lv: 28, id: 'nd:guard' }, { lv: 28, id: 'nd:iron' },
    ] as const;
    const ct = makeContent(OPEN, [sp('x', ['一般'], [100, 100, 100, 100, 100, 100], learnset)]);
    const moves = movesAtLevel(ct, ct.species.get('x')!, 30);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => (ct.moves.get(m.id)?.power ?? 0) > 0)).toBe(true);
    // 低的等级不受影响
    const low = movesAtLevel(ct, ct.species.get('x')!, 5);
    expect(low.map((m) => m.id)).toEqual(['一般:p50']);
  });
});
