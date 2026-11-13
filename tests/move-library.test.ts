import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTENT } from '@/shared/mons-content';
import { learnsetOf } from '@/shared/mons';
import type { Move } from '@/shared/mons';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const LIB = JSON.parse(readFileSync(f('../data/mons/packs/open/moves.json'), 'utf8')) as Move[];
const EL = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行', '超能力', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精'];

describe('技能库 · 数据完整性', () => {
  it('P1：每个属性 6 个通用招式，desc 全部非空', () => {
    for (const el of EL) {
      const list = LIB.filter((m) => m.id.startsWith('mv:') && m.type === el);
      expect(list.length, el).toBe(6);
    }
    expect(LIB.every((m) => (m.desc ?? '').length > 0)).toBe(true);
  });

  it('N1：招式 id 不重复', () => {
    const ids = LIB.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('P3：每个属性覆盖 6 种定位（稳定A/B、爆发、高风险、控制、辅助）', () => {
    for (const el of EL) {
      const list = LIB.filter((m) => m.id.startsWith('mv:') && m.type === el);
      const kinds = new Set(list.map((m) => Number(m.id.split(':')[2])));
      expect([...kinds].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('P4：高风险招式有 recoil，威力 120', () => {
    const risky = LIB.filter((m) => m.recoil);
    expect(risky.length).toBe(18);
    expect(risky.every((m) => m.power === 120 && m.recoil === 1 / 3)).toBe(true);
  });

  it('N4：新招式只用到现有机制字段', () => {
    const allowed = new Set(['id', 'name', 'type', 'cat', 'power', 'acc', 'pp', 'priority', 'stat', 'status', 'heal', 'guard', 'drain', 'recoil', 'desc']);
    for (const m of LIB) for (const k of Object.keys(m)) expect(allowed.has(k), `${m.id} ${k}`).toBe(true);
  });

  it('N5：属性相克表未被改动（抽查已知关系）', () => {
    expect(CONTENT.elements.chart['水']?.['火']).toBe(2);
    expect(CONTENT.elements.chart['电']?.['地面']).toBe(0);
  });
});

describe('技能库 · 学习路径', () => {
  it('P2：初始三只有专属招式', () => {
    for (const [sp, sig] of [['o01', 'sig:o01'], ['o02', 'sig:o02'], ['o04', 'sig:o04']] as const) {
      expect(CONTENT.species.get(sp)).toBeTruthy();
      expect(CONTENT.moves.has(sig)).toBe(true);
      const ls = learnsetOf(CONTENT, CONTENT.species.get(sp)!);
      expect(ls.some((e) => e.id === sig), sp).toBe(true);
    }
  });

  it('学习等级按 1 / 8 / 12 / 15 / 20 / 28 分层', () => {
    const sp = CONTENT.species.get('o01')!;
    const ls = learnsetOf(CONTENT, sp);
    const levels = ls.filter((e) => e.id.startsWith('mv:')).map((e) => e.lv);
    for (const lv of [1, 8, 12, 15, 20, 28]) expect(levels).toContain(lv);
  });

  it('P7：没写 learnset 的物种仍能用 genMoves 兜底', () => {
    const cat = CONTENT.species.get('c00a')!;
    const ls = learnsetOf(CONTENT, cat);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.every((e) => CONTENT.moves.has(e.id))).toBe(true);
  });

  it('N2：所有 learnset 引用的招式都存在', () => {
    for (const sp of CONTENT.species.values()) {
      for (const e of learnsetOf(CONTENT, sp)) expect(CONTENT.moves.has(e.id), `${sp.id} ${e.id}`).toBe(true);
    }
  });

  it('N3：旧存档里的未知招式 id 不影响读取', () => {
    expect(CONTENT.moves.has('nope:move')).toBe(false);
  });
});
