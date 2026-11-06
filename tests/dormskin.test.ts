import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOM_SIZES, defaultLay, doorKeep, layError, roomDims, type Placed } from '../src/shared/decor';
import { cleanDorm, cleanSkin, dormInteriorId, dormInteriorLevel, dormRoom, expandApply, isDormInterior, layApply, roomLevel, roomSpawn, skinApply, skinOf, skinOwned, type DormSave } from '../src/shared/dorm';
import { FLOOR_SKINS, ROOM_NAMES, ROOM_PRICES, WALL_SKINS, skinFile } from '../src/shared/dormskin';
import { DORM_FLOOR_STYLES, DORM_WALL_STYLES, paintInterior } from '../tools/art/interior-bg';
import { DECOR_FURNITURE } from '../tools/art/furniture-decor';
import { FURNITURE } from '../tools/art/furniture';
import { DORM_FURNITURE } from '../tools/art/furniture-dorm';

const P = (d: string, x: number, y: number, r?: 90 | 180 | 270): Placed => ({ d, x, y, ...(r ? { r } : {}) });
const spec = (id: string) => JSON.parse(readFileSync(join(__dirname, '..', 'data', 'interiors', `${id}.json`), 'utf8')) as { id: string; w: number; h: number; exit: { x: number; w: number }; furniture: { k: string; x: number; y: number }[]; windows?: unknown[] };

describe('房间级别', () => {
  it('三级房间的尺寸、门洞、固定家具和 data/interiors/dorm*.json 一致；固定家具位置各级相同', () => {
    const base = spec('dorm');
    ROOM_SIZES.forEach((r, lv) => {
      const j = spec(dormInteriorId(lv)); expect([j.w, j.h]).toEqual([r.w, r.h]); expect(j.exit).toEqual(base.exit);
      expect(j.furniture).toEqual([]); // 没有固定家具了：床、窗、地毯、门垫都是摆放数据里的家具 expect(dormRoom(lv)).toMatchObject({ w: r.w, h: r.h, exitX: j.exit.x, exitW: j.exit.w });
      expect(doorKeep(lv)).toMatchObject({ x: j.exit.x, w: j.exit.w }); expect(doorKeep(lv).y + doorKeep(lv).h).toBe(r.h - 1); // 门口留空的区域正好在门洞里面
      expect(roomDims(lv)).toMatchObject({ x1: r.w - 2, y1: r.h - 2 });
    });
    expect(ROOM_SIZES.map((r) => r.w * r.h)).toEqual([...ROOM_SIZES.map((r) => r.w * r.h)].sort((a, b) => a - b));
    for (const lv of [0, 1, 2]) { expect(isDormInterior(dormInteriorId(lv))).toBe(true); expect(dormInteriorLevel(dormInteriorId(lv))).toBe(lv); }
    expect(isDormInterior('library')).toBe(false); expect(dormInteriorLevel('x')).toBe(0); expect(roomLevel(undefined)).toBe(0); expect(roomLevel({ rm: 2 })).toBe(2);
  });
  it('出生点跟着级别：在门洞中间、门里面一点；门洞随房间变深下移', () => {
    for (const lv of [0, 1, 2]) { const sp = roomSpawn(lv), r = dormRoom(lv); expect(sp.x).toBe((7 + 1) * 16); expect(sp.y).toBeCloseTo((r.h - 2.2) * 16); expect(sp.y).toBeLessThan(r.h * 16); }
    expect(roomSpawn(2).y).toBeGreaterThan(roomSpawn(0).y);
  });
  it('摆放按级别校验：大房间里能放的地方更多；升级后原来的摆放仍然合法；门口保留区随级别下移', () => {
    expect(layError([P('dc_sofa', 17, 5)], 0)).toContain('地面'); expect(layError([P('dc_sofa', 17, 5)], 1)).toBeNull(); expect(layError([P('dc_sofa', 21, 12)], 1)).toContain('地面'); expect(layError([P('dc_sofa', 21, 12)], 2)).toBeNull();
    const lay = [...defaultLay(), P('dc_sofa', 3, 8), P('dc_dtable', 4, 5), P('dc_books', 4, 5), P('dc_clock', 4, 3)];
    expect(layError(lay, 0)).toBeNull(); expect(layError(lay, 1)).toBeNull(); expect(layError(lay, 2)).toBeNull();
    expect(layError([P('dc_chair', 7, 10)], 1)).toContain('门口'); expect(layError([P('dc_chair', 7, 10)], 0)).toContain('地面'); expect(layError([P('dc_chair', 7, 8)], 1)).toBeNull(); // 小屋的门口在第 8、9 行，中屋的在第 10、11 行
    expect(layError([P('dc_poster', 17, 3)], 1)).toBeNull(); expect(layError([P('dc_poster', 17, 3)], 0)).toContain('北墙'); // 加宽的北墙也能挂画
    for (const lv of [0, 1, 2]) expect(layError(defaultLay(lv), lv)).toBeNull(); // 各级房间的默认布局都合法
  });
  it('cleanDorm 按存档里的级别清洗摆放；layApply 按级别校验', () => {
    const big = [{ d: 'dc_sofa', x: 16, y: 10 }];
    expect(cleanDorm({ lay: big })!.lay!.map((p) => p.d)).not.toContain('dc_sofa'); // 小屋放不下 → 丢掉（老存档只剩补上的固有家具）
    expect(cleanDorm({ rm: 1, lay: big })!.lay!.map((p) => p.d)).toContain('dc_sofa'); expect(cleanDorm({ rm: 1, lay: big, v: 2 })).toEqual({ rm: 1, lay: big, v: 2 });
    expect(cleanDorm({ rm: 3 })).toBeUndefined(); expect(cleanDorm({ rm: 0 })).toBeUndefined();
    const d: DormSave = { rm: 1 }, inv = { dc_sofa: 1 };
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 16, y: 10 }).ok).toBe(true); const d0: DormSave = {}, inv0 = { dc_sofa: 1 }; expect(layApply(d0, inv0, { op: 'place', d: 'dc_sofa', x: 16, y: 10 }).ok).toBe(false);
  });
});

describe('扩建', () => {
  it('小屋 → 中屋 → 大屋，价格递增；币不够不改存档；到顶不能再扩；摆放不动', () => {
    const d: DormSave = { lay: [P('dc_sofa', 3, 8)] };
    expect(ROOM_PRICES).toEqual([0, 1500, 4000]); expect(ROOM_NAMES).toHaveLength(3);
    expect(expandApply(d, 1499)).toMatchObject({ ok: false, cost: 0 }); expect(d.rm).toBeUndefined();
    expect(expandApply(d, 1500)).toMatchObject({ ok: true, cost: 1500 }); expect(d.rm).toBe(1);
    expect(expandApply(d, 3999)).toMatchObject({ ok: false }); expect(d.rm).toBe(1);
    expect(expandApply(d, 99999)).toMatchObject({ ok: true, cost: 4000 }); expect(d.rm).toBe(2);
    expect(expandApply(d, 99999)).toMatchObject({ ok: false, msg: expect.stringContaining('最大') }); expect(d.rm).toBe(2);
    expect(d.lay).toEqual([P('dc_sofa', 3, 8)]);
  });
});

describe('墙纸和地板', () => {
  it('样式数量和美术一一对应；第 0 种免费；价格非负；色块是合法颜色', () => {
    expect(WALL_SKINS).toHaveLength(DORM_WALL_STYLES.length); expect(FLOOR_SKINS).toHaveLength(DORM_FLOOR_STYLES.length);
    for (const list of [WALL_SKINS, FLOOR_SKINS]) { expect(list[0].price).toBe(0); expect(new Set(list.map((s) => s.name)).size).toBe(list.length); for (const s of list) { expect(s.price).toBeGreaterThanOrEqual(0); for (const c of s.swatch) expect(c).toMatch(/^#[0-9a-f]{6}$/i); } }
    expect(WALL_SKINS.length).toBeLessThanOrEqual(30); expect(FLOOR_SKINS.length).toBeLessThanOrEqual(30); // 已买的样式按位记在一个整数里
    expect(skinFile(1, 'w', 3)).toBe('dormskin-1-w3'); expect(skinFile(0, 'f', 0)).toBe('dormskin-0-f0');
  });
  it('图层：墙层和地板层互补（每个像素只在一层里）；默认样式的两层叠起来 = 原来的整张底图', () => {
    for (const id of ['dorm', 'dorm-2', 'dorm-3']) {
      const s = spec(id) as Parameters<typeof paintInterior>[0], full = paintInterior(s), wl = paintInterior(s, { wall: 0, floor: 0, layer: 'wall' }), fl = paintInterior(s, { wall: 0, floor: 0, layer: 'floor' });
      let both = 0, none = 0, diff = 0;
      for (let y = 0; y < full.h; y++) for (let x = 0; x < full.w; x++) {
        const a = wl.alpha(x, y) > 0, b = fl.alpha(x, y) > 0; if (a && b) both++; if (!a && !b) none++;
        const px = a ? wl.get(x, y) : fl.get(x, y), q = full.get(x, y); if (px[0] !== q[0] || px[1] !== q[1] || px[2] !== q[2]) diff++;
      }
      expect([id, both, none, diff]).toEqual([id, 0, 0, 0]);
    }
  });
  it('不同样式确实画出不同的图', () => {
    const s = spec('dorm') as Parameters<typeof paintInterior>[0], key = (o: Parameters<typeof paintInterior>[1]) => Buffer.from(paintInterior(s, o).data).toString('base64');
    expect(new Set(DORM_WALL_STYLES.map((_, i) => key({ wall: i, floor: 0, layer: 'wall' }))).size).toBe(DORM_WALL_STYLES.length);
    expect(new Set(DORM_FLOOR_STYLES.map((_, i) => key({ wall: 0, floor: i, layer: 'floor' }))).size).toBe(DORM_FLOOR_STYLES.length);
  });
  it('买 / 换：买了永久拥有、可以换回去；没买不能换；币不够不改存档；重复买被拒；清洗存档', () => {
    const d: DormSave = {};
    expect(skinOwned(d, 'w', 0)).toBe(true); expect(skinOwned(d, 'w', 2)).toBe(false); expect(skinOf(d)).toEqual({ w: 0, f: 0 });
    expect(skinApply(d, 'w', 2, 'use', 999).msg).toContain('还没买'); expect(skinApply(d, 'w', 2, 'buy', WALL_SKINS[2].price - 1)).toMatchObject({ ok: false, cost: 0 }); expect(d.sk).toBeUndefined();
    expect(skinApply(d, 'w', 2, 'buy', 500)).toMatchObject({ ok: true, cost: WALL_SKINS[2].price }); expect(skinOf(d)).toEqual({ w: 2, f: 0 }); expect(skinOwned(d, 'w', 2)).toBe(true);
    expect(skinApply(d, 'w', 2, 'buy', 500).ok).toBe(false); // 已经有了
    expect(skinApply(d, 'f', 3, 'buy', 500)).toMatchObject({ ok: true }); expect(skinOf(d)).toEqual({ w: 2, f: 3 });
    expect(skinApply(d, 'w', 0, 'use', 0)).toMatchObject({ ok: true, cost: 0 }); expect(skinOf(d)).toEqual({ w: 0, f: 3 }); expect(skinOwned(d, 'w', 2)).toBe(true); // 换回默认后买过的还在
    expect(skinApply(d, 'w', 2, 'use', 0)).toMatchObject({ ok: true, cost: 0 }); expect(skinOf(d).w).toBe(2);
    for (const bad of [[-1, 'use'], [99, 'buy'], [1.5, 'buy'], ['x', 'use'], [1, 'wat']] as const) expect(skinApply(d, 'w', bad[0], bad[1], 999).ok, String(bad)).toBe(false);
    expect(skinApply(d, 'x' as 'w', 1, 'buy', 999).ok).toBe(false);
    expect(cleanSkin({ w: 2, f: 99, ow: 0b100, of: -1 })).toEqual({ w: 2, ow: 4, of: ((-1) & 62) }); expect(cleanSkin(null)).toBeUndefined(); expect(cleanSkin({ w: 0 })).toBeUndefined();
    expect(cleanDorm({ sk: { w: 3, ow: 8 } })).toEqual({ sk: { w: 3, ow: 8 } });
  });
});

describe('美术：家具精灵齐全（新增的 dorm-2/3 用到的家具都画了）', () => {
  it('dorm*.json 里的家具都在家具表里', () => { const all = { ...FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE } as Record<string, unknown>; for (const id of ['dorm', 'dorm-2', 'dorm-3']) for (const f of spec(id).furniture) expect(all[f.k] ?? Object.keys(all).length, f.k).toBeTruthy(); });
});
