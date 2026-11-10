import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, xpForLevel, type Content, type ElementPack, type Mon, type Species } from '../src/shared/mons';
import { evolveCheck, gainXp, type BEvent } from '../src/shared/battle';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, extra: Partial<Species>): Species =>
  ({ id, no: 1, name: id, types: ['火'], base: [60, 70, 50, 70, 50, 70], catch: 0.3, ...extra });
const SPECIES: Species[] = [
  sp('c1', { learnset: [{ lv: 1, id: '火:p50' }, { lv: 7, id: '火:s85' }] }),
  sp('e1', { evo: { to: 'e2', lv: 10 }, learnset: [{ lv: 1, id: '火:p50' }] }),
  sp('e2', { learnset: [{ lv: 1, id: '火:p50' }, { lv: 10, id: '火:s85' }] }),
];
const CT: Content = makeContent(OPEN, SPECIES);
const four = ['火:p50', '火:s50', '火:p85', '一般:p50'];
const mon = (id: string, spId: string, lv: number): Mon => ({
  id, sp: spId, lv, xp: xpForLevel(lv), hp: 1, iv: [0, 0, 0, 0, 0, 0],
  mv: four.map((m) => ({ id: m, pp: CT.moves.get(m)!.pp })), at: 0,
});

describe('升级 / 进化时的满技能提示', () => {
  it('升级想学新技能但技能满：发 learn{full:true}，mv 不增加', () => {
    const m = mon('m1', 'c1', 6);
    const before = m.mv.map((x) => x.id);
    const ev: BEvent[] = [];
    gainXp(CT, m, 0, xpForLevel(7) - m.xp, ev);
    expect(m.lv).toBe(7);
    expect(ev.some((e) => e.t === 'learn' && e.move === '火:s85' && e.full)).toBe(true);
    expect(m.mv.map((x) => x.id)).toEqual(before);
  });

  it('进化想学新技能但技能满：发 learn{full:true}，mv 不增加', () => {
    const m = mon('m1', 'e1', 10);
    const before = m.mv.map((x) => x.id);
    const ev: BEvent[] = [];
    evolveCheck(CT, m, 0, ev);
    expect(m.sp).toBe('e2');
    expect(ev.some((e) => e.t === 'evolve')).toBe(true);
    expect(ev.some((e) => e.t === 'learn' && e.move === '火:s85' && e.full)).toBe(true);
    expect(m.mv.map((x) => x.id)).toEqual(before);
  });
});
