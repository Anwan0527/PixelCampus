import { describe, it, expect } from 'vitest';
import { DECOR, footOf, type Rot } from '../src/shared/decor';
import { TURN_VIEWS } from '../tools/art/turn';
import { rotInfo } from '../src/shared/interior';
import { FURNITURE } from '../tools/art/furniture';
import { OFFICE_FURNITURE } from '../tools/art/furniture-office';
import { DORM_FURNITURE } from '../tools/art/furniture-dorm';
import { DECOR_FURNITURE } from '../tools/art/furniture-decor';

const ART = { ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE } as Record<string, () => { img: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }; fw: number; fh: number }>;
const solid = (img: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++; return n; };

describe('家具转向贴图（每个朝向单独设计）', () => {
  const faced = DECOR.filter((d) => d.face);
  it('每件有朝向的家具，90/180/270 都有贴图；没有朝向的家具不登记', () => {
    for (const d of faced) for (const r of [90, 180, 270] as const) expect(TURN_VIEWS[d.k]?.[r], `${d.id}@${r}`).toBeTypeOf('function');
    const ks = new Set(faced.map((d) => d.k)); for (const k of Object.keys(TURN_VIEWS)) expect(ks.has(k), `${k} 不该登记`).toBe(true);
  });
  it('贴图的占地 = 转向后的占地；精灵装得下脚印；精灵不是空的；各朝向不是同一张图', () => {
    for (const d of faced) {
      const views = TURN_VIEWS[d.k], base = (views[0] ?? ART[d.k])();
      expect([base.fw, base.fh], `${d.id}@0`).toEqual([d.fw, d.fh]);
      const sigs = new Set<string>();
      for (const r of [0, 90, 180, 270] as const) {
        const f = r === 0 ? base : views[r]!(), foot = footOf(d, r);
        expect([f.fw, f.fh], `${d.id}@${r} 占地`).toEqual([foot.fw, foot.fh]);
        const ri = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 0);
        if (d.kind !== 'top') { expect(f.img.w, `${d.id}@${r} 宽`).toBeGreaterThanOrEqual(f.fw * 16 - 2); expect(f.img.h, `${d.id}@${r} 高`).toBeGreaterThanOrEqual(f.fh * 16 - 2); expect(ri.my, `${d.id}@${r}`).toBeGreaterThanOrEqual(-2); } // 桌面小件的图比脚印小，不查
        expect(ri.h, `${d.id}@${r}`).toBe(f.img.h); expect(solid(f.img), `${d.id}@${r} 空图`).toBeGreaterThan(50);
        sigs.add(Buffer.from(f.img.data).toString('base64') + f.img.w + 'x' + f.img.h);
      }
      expect(sigs.size, `${d.id} 四个朝向至少要有 3 种不同的图`).toBeGreaterThanOrEqual(3);
    }
  });
  it('base=180 的木椅（朝北）从北开始转：它的 0 和「木椅」的 180 都是朝北', () => {
    const up = DECOR.find((d) => d.id === 'dc_chairup')!, chair = DECOR.find((d) => d.id === 'dc_chair')!;
    const a = (TURN_VIEWS[up.k][0] ?? ART[up.k])(), b = TURN_VIEWS[chair.k][180]!();
    expect(Buffer.from(a.img.data).equals(Buffer.from(b.img.data)) && a.img.w === b.img.w).toBe(true);
    const r = (up.base ?? 0) as Rot; expect(r).toBe(180);
  });
});
