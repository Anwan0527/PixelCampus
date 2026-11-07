import { describe, expect, it } from 'vitest';
import { bedSpots, dormCatHome } from '../src/systems/dormcats';
import { decorDef, layError, defaultLay } from '../src/shared/decor';

describe('宿舍里养的猫（客户端纯逻辑）', () => {
  it('猫窝的位置：每个猫窝一个，脚点落在窝的下半部；只认「宿舍猫窝」', () => {
    const lay = [...defaultLay(), { d: 'dc_catbed', x: 3, y: 8 }, { d: 'dc_catbed', x: 5, y: 9 }];
    expect(bedSpots(lay)).toEqual([{ x: 3 * 16 + 8, y: 8 * 16 + 13 }, { x: 5 * 16 + 8, y: 9 * 16 + 13 }]);
    expect(bedSpots(defaultLay())).toEqual([]);
  });
  it('分家：有猫窝住猫窝，没有（窝被收回了）就在空地附近错开站', () => {
    const beds = [{ x: 56, y: 141 }], fb = { x: 128, y: 96 };
    expect(dormCatHome(0, beds, fb)).toEqual({ x: 56, y: 141, bed: true });
    const a = dormCatHome(1, beds, fb), b = dormCatHome(2, beds, fb);
    expect(a.bed).toBe(false); expect(b.bed).toBe(false); expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
  it('猫窝是能走上去的低矮家具：占一格、不和别的地面家具重叠，但人和猫不被它挡路（collision 里不标记）', () => {
    const def = decorDef('dc_catbed')!;
    expect(def.walk).toBe(true); expect(def.kind).toBe('floor');
    expect(layError([...defaultLay(), { d: 'dc_catbed', x: 3, y: 8 }])).toBeNull();
    expect(layError([...defaultLay(), { d: 'dc_catbed', x: 3, y: 8 }, { d: 'dc_stool', x: 3, y: 8 }])).toContain('已经有家具'); // 仍占格
  });
});
