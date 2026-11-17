/**
 * IR #11：野生 / 校园猫对战 AI（共享规则）。
 * 只测纯函数：给招、给双方精灵、注入随机源，看选招是否合理、可复盘。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import { FOE_SMART, pickFoeMove, scoreFoeMove, startBattle, type FighterState } from '@/shared/battle';
import type { MonMove, Move } from '@/shared/mons';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;

const sp = (id: string, types: string[]): Species => ({ id, no: 1, name: id, types, base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset: [{ lv: 1, id: '一般:p50' }] });
const CT: Content = makeContent(OPEN, [sp('me-water', ['水']), sp('me-ground', ['地面']), sp('me-ghost', ['幽灵']), sp('foe', ['草'])]);
const state = (): FighterState => ({ stages: new Map(), status: new Map() });

/** 造一只带指定招式的对手 */
function foeWith(moves: MonMove[]) {
  const m = newMon(CT, 'foe', 20, () => 0.5, 'foe1', 0);
  m.mv = moves;
  return m;
}
const target = (spId: string) => newMon(CT, spId, 20, () => 0.5, `me-${spId}`, 0);

describe('对手选招：属性克制', () => {
  it('A1：带着 2 倍克制招时，认真模式下每次都选它', () => {
    const foe = foeWith([{ id: '一般:p50', pp: 10 }, { id: '草:p50', pp: 10 }]);
    const me = target('me-water');
    for (let seed = 1; seed <= 20; seed++) {
      expect(pickFoeMove(CT, state(), foe, me, foe.mv, 1, makeRng(seed))).toBe(1);
    }
  });

  it('A2：0 倍招式（电打地面）不会被选，除非没有别的招', () => {
    const foe = foeWith([{ id: '电:p50', pp: 10 }, { id: '一般:p50', pp: 10 }]);
    const me = target('me-ground');
    for (let seed = 1; seed <= 20; seed++) {
      expect(pickFoeMove(CT, state(), foe, me, foe.mv, 1, makeRng(seed))).toBe(1);
    }
    // 只有一招且是 0 倍：只能用它（不能卡住）
    const only = foeWith([{ id: '电:p50', pp: 10 }]);
    expect(pickFoeMove(CT, state(), only, me, only.mv, 1, makeRng(1))).toBe(0);
  });

  it('评分：2 倍的伤害招分数高于 1 倍的；0 倍是 -Infinity', () => {
    const foe = foeWith([]);
    const water = target('me-water'), ground = target('me-ground');
    const grass = CT.moves.get('草:p50')! as Move, normal = CT.moves.get('一般:p50')! as Move;
    expect(scoreFoeMove(CT, state(), foe, water, grass)).toBeGreaterThan(scoreFoeMove(CT, state(), foe, water, normal));
    expect(scoreFoeMove(CT, state(), foe, ground, CT.moves.get('电:p50')! as Move)).toBe(-Infinity);
  });
});

describe('对手选招：PP 与状态', () => {
  it('A4：PP 为 0 的招不选', () => {
    const foe = foeWith([{ id: '一般:p50', pp: 0 }, { id: '草:p50', pp: 2 }]);
    const me = target('me-water');
    for (let seed = 1; seed <= 10; seed++) {
      expect(pickFoeMove(CT, state(), foe, me, foe.mv, 1, makeRng(seed))).toBe(1);
    }
  });

  it('A3：对手已有同一个状态时，不再选施加该状态的招', () => {
    // 造一个“中毒”招塞进招式表
    const mv: Move = { id: 'test:poison', name: '试毒', type: '毒', cat: 'special', power: 0, acc: 100, pp: 10, status: { s: 'poison', chance: 100 } };
    const ct: Content = { ...CT, moves: new Map(CT.moves).set(mv.id, mv) };
    const foe = foeWith([{ id: 'test:poison', pp: 10 }, { id: '一般:p50', pp: 10 }]);
    const fresh = target('me-water'), poisoned = target('me-water');
    const st = state();
    expect(scoreFoeMove(ct, st, foe, fresh, mv)).toBeGreaterThan(0);
    // 已中毒：这一招被否决，选伤害招
    st.status.set(poisoned.id, [{ k: 'poison', left: 0 } as never]);
    expect(scoreFoeMove(ct, st, foe, poisoned, mv)).toBe(-Infinity);
    expect(pickFoeMove(ct, st, foe, poisoned, foe.mv, 1, makeRng(3))).toBe(1);
  });
});

describe('对手选招：可复盘与难度', () => {
  it('相同种子结果一致', () => {
    const foe = foeWith([{ id: '一般:p50', pp: 10 }, { id: '草:p50', pp: 10 }]);
    const me = target('me-water');
    const run = () => Array.from({ length: 30 }, (_, i) => pickFoeMove(CT, state(), foe, me, foe.mv, FOE_SMART.wild, makeRng(100 + i)));
    expect(run()).toEqual(run());
  });

  it('smart = 0 时退化成随机（两招都会被选到）', () => {
    const foe = foeWith([{ id: '一般:p50', pp: 10 }, { id: '草:p50', pp: 10 }]);
    const me = target('me-water');
    const picks = new Set(Array.from({ length: 60 }, (_, i) => pickFoeMove(CT, state(), foe, me, foe.mv, 0, makeRng(i))));
    expect(picks.size).toBe(2);
  });

  it('难度档：野生 < 猫 < 训练家', () => {
    expect(FOE_SMART.wild).toBeLessThan(FOE_SMART.cat);
    expect(FOE_SMART.cat).toBeLessThanOrEqual(FOE_SMART.trainer);
  });
});

describe('startBattle 的难度缺省', () => {
  it('不传就是野生档；传了按传入的来（校园猫用 0.55）', () => {
    const me = newMon(CT, 'me-water', 20, () => 0.5, 'm1', 0);
    const wild = startBattle('b1', newMon(CT, 'foe', 20, () => 0.5, 'f1', 0), [me]);
    expect(wild.foeSmart).toBeUndefined();
    const cat = startBattle('b2', newMon(CT, 'foe', 20, () => 0.5, 'f2', 0), [me], FOE_SMART.cat);
    expect(cat.foeSmart).toBe(FOE_SMART.cat);
  });
});
