import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, typeMult, type Content, type ElementPack } from '../src/shared/mons';
import type { BEvent } from '../src/shared/battle';
import {
  effectText, fastDelay, filterLearnable, hpText, learnLogText, moveView, readFast, summaryRows, writeFast,
} from '../src/ui/monBattleHelpers';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const CT: Content = makeContent(OPEN, []);

describe('effectText / moveView', () => {
  it('倍率文字阈值', () => {
    expect(effectText(0)).toBe('无效');
    expect(effectText(2)).toBe('克制');
    expect(effectText(4)).toBe('克制');
    expect(effectText(0.5)).toBe('削弱');
    expect(effectText(0.25)).toBe('削弱');
    expect(effectText(1)).toBe('');
  });
  it('与 typeMult 的已知事实一致', () => {
    const cases: [string, string[], number][] = [
      ['水', ['火'], 2], ['电', ['地面'], 0], ['一般', ['幽灵'], 0],
      ['草', ['火', '飞行'], 0.25], ['水', ['火', '地面'], 4],
    ];
    for (const [atk, def, mult] of cases) {
      expect(typeMult(CT.elements, atk, def)).toBe(mult);
      expect(effectText(mult)).toBe(mult === 0 ? '无效' : mult >= 2 ? '克制' : '削弱');
    }
  });
  it('moveView 字段齐全，克制按对手属性算', () => {
    const v = moveView(CT, CT.moves.get('水:p50')!, 7, ['火', '地面']);
    expect(v).toMatchObject({ name: '水·冲击', type: '水', typeName: '水', cat: '物理', power: 50, acc: 100, pp: 7, maxPp: 25, effect: '克制' });
  });
});

describe('hpText', () => {
  it('正常血量', () => expect(hpText(12, 30)).toBe('12/30'));
  it('max = 0 不出现 NaN / Infinity', () => {
    expect(hpText(10, 0)).toBe('10/1');
    expect(hpText(10, 0)).not.toMatch(/NaN|Infinity/);
  });
});

describe('learnLogText', () => {
  it('技能满的文案', () => {
    expect(learnLogText('焰尾', '水冲击', true)).toBe('焰尾 想学会 水冲击，但技能已满；可在精灵面板更换');
  });
  it('正常学会的文案', () => {
    expect(learnLogText('焰尾', '水冲击', false)).toBe('焰尾 学会了 水冲击！');
  });
});

describe('summaryRows', () => {
  const labels = { mon: () => '焰尾', move: () => '水冲击', species: () => '湖鲸', foe: '湖鲸' };
  const ev: BEvent[] = [
    { t: 'xp', i: 0, gain: 12 },
    { t: 'level', i: 0, lv: 8 },
    { t: 'evolve', i: 0, to: 'o02' },
    { t: 'learn', i: 0, move: '水:p50', full: true },
    { t: 'caught' },
  ];
  it('经验 / 升级 / 进化 / 学招 / 收服各一行', () => {
    expect(summaryRows(ev, labels)).toEqual([
      '焰尾 获得 12 点经验',
      '焰尾 升到了 Lv.8！',
      '湖鲸 进化完成',
      '焰尾 想学会 水冲击，但技能已满；可在精灵面板更换',
      '收服了 湖鲸',
    ]);
  });
  it('空事件返回空数组', () => expect(summaryRows([], labels)).toEqual([]));
  it('同一事件只出现一次', () => {
    const rows = summaryRows([{ t: 'xp', i: 0, gain: 5 }], labels);
    expect(rows.filter((r) => r.includes('5 点经验'))).toHaveLength(1);
  });
});

describe('filterLearnable', () => {
  it('去掉未知 id、当前已带、重复项，保留顺序', () => {
    const mv = [{ id: '水:s50', pp: 25 }];
    expect(filterLearnable(['水:p50', 'nope', '水:p50', '水:s50'], CT, mv)).toEqual(['水:p50']);
  });
  it('undefined / 空列表返回空数组', () => {
    expect(filterLearnable(undefined, CT, [])).toEqual([]);
    expect(filterLearnable([], CT, [])).toEqual([]);
  });
});

describe('快进', () => {
  it('开启为 35%，下限 80ms；关闭原样', () => {
    expect(fastDelay(400, true)).toBe(140);
    expect(fastDelay(100, true)).toBe(80);
    expect(fastDelay(400, false)).toBe(400);
  });
  it('偏好读写往返', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    writeFast(true, storage); expect(readFast(storage)).toBe(true);
    writeFast(false, storage); expect(readFast(storage)).toBe(false);
  });
  it('storage 抛异常时默认关闭、写入不抛', () => {
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(readFast(bad)).toBe(false);
    expect(() => writeFast(true, bad)).not.toThrow();
  });
});
