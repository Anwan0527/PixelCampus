import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, type Content, type ElementPack, type Mon, type Species } from '../src/shared/mons';
import {
  cleanMon, cleanMonSave, evolutionLine, learnMove, learnableMap, learnableMoves, type MonSave,
} from '../src/shared/monbox';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;

const sp = (id: string, types: string[], base: Species['base'], extra: Partial<Species> = {}): Species =>
  ({ id, no: 1, name: id, types, base, catch: 0.3, ...extra });

const SPECIES: Species[] = [
  sp('a1', ['火'], [60, 70, 50, 70, 50, 70], {
    chain: ['a1', 'a2', 'a3'], evo: { to: 'a2', lv: 10 },
    learnset: [{ lv: 1, id: '火:p50' }, { lv: 5, id: '火:s50' }, { lv: 10, id: '火:p85' }, { lv: 15, id: '一般:p50' }],
  }),
  sp('a2', ['火'], [70, 80, 60, 80, 60, 80], {
    chain: ['a1', 'a2', 'a3'], evo: { to: 'a3', lv: 20 },
    learnset: [{ lv: 1, id: '火:p50' }, { lv: 5, id: '火:s50' }, { lv: 10, id: '火:p85' }, { lv: 12, id: '一般:p50' }, { lv: 18, id: '火:s85' }],
  }),
  sp('a3', ['火'], [80, 90, 70, 90, 70, 90], {
    chain: ['a1', 'a2', 'a3'],
    learnset: [{ lv: 1, id: '火:p50' }, { lv: 25, id: '一般:s50' }, { lv: 30, id: '火:p85' }],
  }),
  sp('b1', ['一般'], [50, 50, 50, 50, 50, 50], { learnset: [{ lv: 1, id: '一般:p50' }] }),
];
const CT: Content = makeContent(OPEN, SPECIES);

const mon = (id: string, spId: string, lv: number, moves: string[]): Mon => ({
  id, sp: spId, lv, xp: 0, hp: 1, iv: [0, 0, 0, 0, 0, 0],
  mv: moves.map((m) => ({ id: m, pp: CT.moves.get(m)!.pp })), at: 0,
});
const save = (...mons: Mon[]): MonSave => ({ sq: mons, bx: [], dex: {}, starter: true, n: 1 });

describe('evolutionLine', () => {
  it('只取当前阶段 + 已经过的前序阶段，不含未来阶段', () => {
    const a1 = CT.species.get('a1')!, a2 = CT.species.get('a2')!, a3 = CT.species.get('a3')!;
    expect(evolutionLine(CT, a1).map((s) => s.id)).toEqual(['a1']);
    expect(evolutionLine(CT, a2).map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(evolutionLine(CT, a3).map((s) => s.id)).toEqual(['a1', 'a2', 'a3']);
  });
  it('没有 chain 的物种就是自己', () => {
    expect(evolutionLine(CT, CT.species.get('b1')!).map((s) => s.id)).toEqual(['b1']);
  });
});

describe('learnableMoves', () => {
  it('并当前 + 前序阶段的等级表，排除当前技能，按学习等级排序', () => {
    const m = mon('m1', 'a2', 20, ['火:p50']);
    expect(learnableMoves(CT, m)).toEqual(['火:s50', '火:p85', '一般:p50', '火:s85']);
  });
  it('未到等级不出现；同级边界包含', () => {
    expect(learnableMoves(CT, mon('m1', 'a2', 9, []))).toEqual(['火:p50', '火:s50']);
    expect(learnableMoves(CT, mon('m1', 'a2', 5, []))).toEqual(['火:p50', '火:s50']);
  });
  it('未来阶段独有的技能不出现', () => {
    const m = mon('m1', 'a2', 30, []);
    expect(learnableMoves(CT, m)).not.toContain('一般:s50');
  });
  it('当前 mv 里的技能不出现', () => {
    const m = mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']);
    expect(learnableMoves(CT, m)).toEqual(['火:s85']);
  });
  it('不同阶段的重复技能只出现一次', () => {
    const m = mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '火:s85']);
    const list = learnableMoves(CT, m);
    expect(list).toEqual(['一般:p50']);
    expect(new Set(list).size).toBe(list.length);
  });
  it('没有任何可学技能时返回空数组', () => {
    expect(learnableMoves(CT, mon('m1', 'b1', 1, ['一般:p50']))).toEqual([]);
  });
});

describe('learnableMap', () => {
  it('按精灵 id 输出非空列表；空的不写', () => {
    const a = mon('a', 'a2', 20, ['火:p50']);
    const b = mon('b', 'b1', 1, ['一般:p50']);
    expect(learnableMap(CT, [a, b])).toEqual({ a: ['火:s50', '火:p85', '一般:p50', '火:s85'] });
  });
});

describe('learnMove', () => {
  it('替换：新技能满 PP，旧技能消失，长度不变', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    const r = learnMove(CT, s, 'm1', '火:s85', 1);
    expect(r.ok).toBe(true);
    const m = s.sq[0];
    expect(m.mv.map((x) => x.id)).toEqual(['火:p50', '火:s85', '火:p85', '一般:p50']);
    expect(m.mv[1].pp).toBe(CT.moves.get('火:s85')!.pp);
    expect(m.mv.length).toBe(4);
  });
  it('空槽：drop = -1 追加，原技能顺序不变', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85']));
    const r = learnMove(CT, s, 'm1', '火:s85', -1);
    expect(r.ok).toBe(true);
    expect(s.sq[0].mv.map((x) => x.id)).toEqual(['火:p50', '火:s50', '火:p85', '火:s85']);
  });
  it('不在可学列表里的技能被拒绝', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    const before = JSON.stringify(s);
    expect(learnMove(CT, s, 'm1', '一般:s50', 0).ok).toBe(false); // a3 的未来技能
    expect(JSON.stringify(s)).toBe(before);
  });
  it('当前已带的技能被拒绝', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    expect(learnMove(CT, s, 'm1', '火:p50', 1).ok).toBe(false);
  });
  it('非法 drop 被拒绝', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    for (const drop of [-2, 99, 1.5, NaN]) expect(learnMove(CT, s, 'm1', '火:s85', drop).ok).toBe(false);
    expect(s.sq[0].mv.map((x) => x.id)).toEqual(['火:p50', '火:s50', '火:p85', '一般:p50']);
  });
  it('满槽时 drop = -1 被拒绝，不会超过技能槽', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    expect(learnMove(CT, s, 'm1', '火:s85', -1).ok).toBe(false);
    expect(s.sq[0].mv.length).toBe(4);
  });
  it('替换后不会产生重复技能 id', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    learnMove(CT, s, 'm1', '火:s85', 0);
    const ids = s.sq[0].mv.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('找不到精灵时拒绝', () => {
    expect(learnMove(CT, save(), 'nope', '火:s85', 0).ok).toBe(false);
  });
  it('学完存盘再读回，mv 不丢', () => {
    const s = save(mon('m1', 'a2', 20, ['火:p50', '火:s50', '火:p85', '一般:p50']));
    learnMove(CT, s, 'm1', '火:s85', 1);
    const back = cleanMonSave(JSON.parse(JSON.stringify(s)), CT)!;
    expect(back.sq[0].mv.map((x) => x.id)).toEqual(['火:p50', '火:s85', '火:p85', '一般:p50']);
    expect(back.sq[0].mv[1].pp).toBe(CT.moves.get('火:s85')!.pp);
  });
});

describe('旧存档兼容', () => {
  it('没有 pend 字段的旧存档能正常读取，mv 不丢', () => {
    const raw = { id: 'm1', sp: 'a1', lv: 5, xp: 125, hp: 20, iv: [1, 2, 3, 4, 5, 6], mv: [{ id: '火:p50', pp: 25 }], at: 0 };
    const m = cleanMon(raw, CT)!;
    expect(m).not.toBeNull();
    expect(m.mv.map((x) => x.id)).toEqual(['火:p50']);
    expect((m as unknown as { pend?: unknown }).pend).toBeUndefined();
  });
});
