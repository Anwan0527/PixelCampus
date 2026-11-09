import { describe, expect, it } from 'vitest';
import { applyCraft, craftWhy, recipeDef } from '../src/shared/craft';
import { RECIPE_LEVEL } from '../src/shared/fishlevel';
import { itemDef } from '../src/shared/items';

describe('盲盒合成：3 瓶 → 木箱，3 木箱 → 沉船箱', () => {
  const crate = recipeDef('crate_up')!, wreck = recipeDef('wreck_up')!;
  it('配方存在、不花币、产出是没开的盒子', () => {
    expect(crate.out).toEqual({ id: 'box_crate', n: 1 }); expect(crate.needs).toEqual([{ id: 'box_bottle', n: 3 }]); expect(crate.coins).toBe(0);
    expect(wreck.out).toEqual({ id: 'box_wreck', n: 1 }); expect(wreck.needs).toEqual([{ id: 'box_crate', n: 3 }]); expect(wreck.coins).toBe(0);
    expect(crate.minLevel).toBe(RECIPE_LEVEL.crate_up); expect(wreck.minLevel).toBe(RECIPE_LEVEL.wreck_up);
  });
  it('材料不够 / 等级不够被拒，什么都不扣', () => {
    expect(craftWhy({ box_bottle: 2 }, 0, crate)).toContain('不够');
    expect(craftWhy({ box_bottle: 3 }, 0, crate, undefined, RECIPE_LEVEL.crate_up - 1)).toContain('级');
    const inv = { box_bottle: 2 }; expect(applyCraft(inv, crate)).toBeNull(); expect(inv).toEqual({ box_bottle: 2 });
    expect(craftWhy({ box_crate: 2, box_bottle: 9 }, 0, wreck)).toContain('不够'); // 瓶子不能直接换沉船箱
  });
  it('合成：扣 3 个、得 1 个；多出来的不动；产出堆叠满了拒绝', () => {
    const inv: Record<string, number> = { box_bottle: 7 };
    expect(applyCraft(inv, crate)).toBeTruthy(); expect(inv).toEqual({ box_bottle: 4, box_crate: 1 });
    applyCraft(inv, crate); expect(inv).toEqual({ box_bottle: 1, box_crate: 2 });
    const inv2: Record<string, number> = { box_crate: 3, box_wreck: 5 }; expect(applyCraft(inv2, wreck)).toBeTruthy(); expect(inv2).toEqual({ box_wreck: 6 });
    const full = { box_crate: 3, box_wreck: itemDef('box_wreck')!.stack }; expect(craftWhy(full, 0, wreck)).toContain('放不下');
  });
});
