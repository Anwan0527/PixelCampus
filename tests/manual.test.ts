import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simplifyShapes, simplifyManual, compactBaked, emptyManual, emptyBaked, appendLayer, isManualEmpty, validateBaked, validateManual, rowPoints, manualSpriteKey, wingFromSpec, MANUAL_MATS, MANUAL_TREES, MANUAL_PROPS, type ManualFile } from '../src/shared/manual';
import { scaleBuildings } from '../tools/world/scale.ts';
import { CACHE } from '../tools/paths.ts';
import { DATA, GEN } from '../tools/paths.ts';

const good = (): ManualFile => ({
  version: 1,
  shapes: [{ id: 's1', kind: 'rect', mat: 'plaza', x: 10, y: 10, w: 4, h: 2 }, { id: 's2', kind: 'poly', mat: 'lawn', pts: [[1, 1], [5, 1], [5, 4]] }],
  objects: [{ id: 'o1', k: 'oakS', x: 12.5, y: 11 }],
  rows: [{ id: 'r1', k: 'lamp', pts: [[0, 0], [20, 0]], spacing: 5 }],
  erase: [{ id: 'e1', rect: [1, 1, 2, 2], what: 'trees' }],
});

describe('手动层（地图编辑器保存的 data/campus/manual.json）', () => {
  it('空的手动层合法；合法的样例通过校验', () => {
    expect(validateManual(emptyManual())).toEqual([]);
    expect(validateManual(good())).toEqual([]);
  });
  it('各种坏数据都会被拒绝', () => {
    const bad = (f: (m: ManualFile) => void) => { const m = good(); f(m); return validateManual(m); };
    expect(bad((m) => { m.version = 2; }).length).toBeGreaterThan(0);
    expect(bad((m) => { (m.shapes[0] as any).mat = 'lava'; }).length).toBeGreaterThan(0);
    expect(bad((m) => { (m.shapes[0] as any).w = -1; }).length).toBeGreaterThan(0);
    expect(bad((m) => { (m.shapes[1] as any).pts = [[1, 1], [2, 2]]; }).length).toBeGreaterThan(0);   // 多边形至少 3 个点
    expect(bad((m) => { m.objects[0].k = 'dragon'; }).length).toBeGreaterThan(0);
    expect(bad((m) => { m.objects[0].x = 9999; }).length).toBeGreaterThan(0);                          // 出界
    expect(bad((m) => { m.rows[0].spacing = 0.01; }).length).toBeGreaterThan(0);
    expect(bad((m) => { m.erase[0].what = 'everything' as any; }).length).toBeGreaterThan(0);
    expect(bad((m) => { m.objects.push({ ...m.objects[0] }); }).length).toBeGreaterThan(0);            // id 重复
    expect(validateManual(null).length).toBeGreaterThan(0);
  });
  it('沿线取点：含两端、间距均匀、折线只算一次拐点', () => {
    expect(rowPoints([[0, 0], [10, 0]], 5)).toEqual([[0, 0], [5, 0], [10, 0]]);
    const bent = rowPoints([[0, 0], [10, 0], [10, 10]], 5);
    expect(bent.length).toBe(5);
    expect(bent[2]).toEqual([10, 0]);
  });
  it('物件对应的精灵名是确定的，调色板里的每种都能解析出一个精灵名', () => {
    for (const e of [...MANUAL_TREES, ...MANUAL_PROPS]) {
      const k = manualSpriteKey(e.k, 12.5, 7.25);
      expect(k.startsWith(e.k)).toBe(true);
      expect(manualSpriteKey(e.k, 12.5, 7.25)).toBe(k);
    }
    expect(MANUAL_MATS.length).toBeGreaterThan(10);
  });
  it('仓库里的 manual.json 合法', () => {
    const f = join(DATA, 'manual.json');
    expect(existsSync(f)).toBe(true);
    expect(validateManual(JSON.parse(readFileSync(f, 'utf8')))).toEqual([]);
  });
  it.skipIf(!existsSync(join(GEN, 'world.json')))('调色板里的每种精灵都在生成的道具图集里（手动摆出来不会没图）', () => {
    const frames = JSON.parse(readFileSync(join(GEN, 'atlas-props.json'), 'utf8')).frames as Record<string, unknown>;
    for (const e of [...MANUAL_TREES, ...MANUAL_PROPS]) for (const [x, y] of [[0, 0], [3.5, 9.25], [100, 200.5], [7.125, 1]]) expect(frames[manualSpriteKey(e.k, x, y)], `${e.k} @ ${x},${y}`).toBeTruthy();
  });

  it('建筑：校验（手改过的建筑、新建筑、删除）', () => {
    const b = (f: (m: ManualFile) => void) => { const m = good(); m.buildings = [{ id: 'nb1', name: '新楼', kind: 'teaching', wings: [{ x: 10, y: 10, w: 8, d: 4, f: 4, style: 'brick', door: { tx: 3, tw: 2, main: true } }] }]; f(m); return validateManual(m); };
    expect(b(() => {})).toEqual([]);
    expect(b((m) => { m.buildings![0].wings = []; }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings![0].wings[0].w = 0; }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings![0].wings[0].style = 'gold'; }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings![0].kind = 'castle'; }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings![0].wings[0].x = 9999; }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings!.push({ ...m.buildings![0] }); }).length).toBeGreaterThan(0);                       // id 重复
    expect(b((m) => { m.buildings![0].wings = Array.from({ length: 30 }, (_, i) => ({ x: 10 + i, y: 10, w: 1, d: 2, f: 4 })); })).toEqual([]);   // 融合后的楼可以有几十段翼体
    expect(b((m) => { m.buildings![0].wings = Array.from({ length: 49 }, (_, i) => ({ x: 10 + i, y: 10, w: 1, d: 2 })); }).length).toBeGreaterThan(0);
    expect(b((m) => { m.buildings![0].wings[0].door!.tw = 20; }).length).toBeGreaterThan(0);                              // 门太宽
    expect(b((m) => { m.buildings = [{ id: 'library', name: '图书馆', kind: 'library', delete: true, wings: [] }]; })).toEqual([]);   // 删除不要求翼体
  });
  it.skipIf(!existsSync(join(CACHE, 'editor-buildings.json')))('建筑：编辑器导出的数据还原成手动层再放大，和原来的翼体一模一样（编辑器里"拿起来再放下"不会让楼变形）', () => {
    const j = JSON.parse(readFileSync(join(CACHE, 'editor-buildings.json'), 'utf8')) as { scale: number; buildings: { id: string; name: string; kind: string; fixed?: boolean; wings: Record<string, any>[] }[] };
    expect(j.buildings.length).toBeGreaterThan(80); // 2026-11-04 一、二社区按校园模型合并成 A–E 栋后从 101 降到 86
    for (const b of j.buildings) {
      const def = { id: b.id, name: b.name, kind: b.kind as any, fixed: b.fixed, ground: true, style: 'brick' as const, f: 4, wings: b.wings.map((g) => wingFromSpec(g, j.scale, b.fixed)) as any };
      const back = scaleBuildings([def], j.scale)[0].wings;
      back.forEach((w, i) => {
        const g = b.wings[i];
        for (const k of ['x', 'y', 'w', 'd'] as const) expect(Math.abs((w as any)[k] - g[k]), `${b.id} 翼${i} ${k}`).toBeLessThan(1e-3);
        if (g.door) expect(Math.abs(w.door!.tx - g.door.tx), `${b.id} 翼${i} 门`).toBeLessThan(1e-3);
      });
    }
  });
  it('并入（bake）：追加成新的一层、顺序不变、原对象不被改动；空的手动层不用并入', () => {
    const baked = appendLayer(emptyBaked(), good(), '2026-11-03T10:00');
    expect(baked.layers.length).toBe(1);
    expect(validateBaked(baked)).toEqual([]);
    const m2 = good(); m2.objects[0].id = 'o2'; m2.shapes.forEach((s, i) => { s.id = `x${i}`; }); m2.rows[0].id = 'r2'; m2.erase[0].id = 'e2';
    const two = appendLayer(baked, m2, '2026-11-04T10:00');
    expect(two.layers.map((l) => l.at)).toEqual(['2026-11-03T10:00', '2026-11-04T10:00']);
    expect(two.layers[0]).toEqual(baked.layers[0]);
    expect(isManualEmpty(emptyManual())).toBe(true);
    expect(isManualEmpty(good())).toBe(false);
    expect(validateBaked({ version: 1 }).length).toBeGreaterThan(0);
    expect(validateBaked({ version: 1, layers: [{ ...good(), objects: [{ id: 'o1', k: 'dragon', x: 1, y: 1 }] }] }).length).toBeGreaterThan(0);
  });
  it('仓库里的 baked.json 合法（没有就是空的）', () => {
    const f = join(DATA, 'baked.json');
    if (existsSync(f)) expect(validateBaked(JSON.parse(readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('整理：被后涂的矩形完全盖住的旧图形会被去掉（一块盖住、几块拼起来盖住都算），部分盖住或先后顺序反了的保留', () => {
    const R = (id: string, x: number, y: number, w: number, h: number, mat = 'lawn') => ({ id, kind: 'rect' as const, mat: mat as any, x, y, w, h });
    // 旧的小块被后来的大块盖住 → 去掉
    expect(simplifyShapes([R('a', 10, 10, 2, 2), R('b', 9, 9, 6, 6, 'plaza')]).map((s) => s.id)).toEqual(['b']);
    // 先涂大块、后涂小块 → 都要保留（小块在大块上面，有贡献）
    expect(simplifyShapes([R('b', 9, 9, 6, 6), R('a', 10, 10, 2, 2, 'plaza')]).map((s) => s.id)).toEqual(['b', 'a']);
    // 两块拼起来才盖住 → 去掉
    expect(simplifyShapes([R('a', 10, 10, 4, 2), R('l', 9, 9, 3, 5), R('r', 12, 9, 3, 5)]).map((s) => s.id)).toEqual(['l', 'r']);
    // 只盖住一部分 → 保留
    expect(simplifyShapes([R('a', 10, 10, 4, 4), R('b', 12, 12, 6, 6)]).map((s) => s.id)).toEqual(['a', 'b']);
    // 椭圆/多边形/折线按外接矩形判断（保守）
    const E = { id: 'e', kind: 'ellipse' as const, mat: 'lawn' as any, cx: 11, cy: 11, rx: 1, ry: 1 };
    expect(simplifyShapes([E, R('b', 9, 9, 6, 6)]).map((s) => s.id)).toEqual(['b']);
    expect(simplifyShapes([E, R('b', 11, 11, 6, 6)]).map((s) => s.id)).toEqual(['e', 'b']);
    // 后面的非矩形不能当盖子
    expect(simplifyShapes([R('a', 10, 10, 2, 2), { id: 'p', kind: 'poly' as const, mat: 'lawn' as any, pts: [[0, 0], [30, 0], [30, 30]] }]).map((s) => s.id)).toEqual(['a', 'p']);
  });
  it('整理：重复物件、被包住的擦除；并入各层时后面的层盖住前面层的图形', () => {
    const m = good(); m.objects.push({ ...m.objects[0], id: 'o2' }); m.objects.push({ ...m.objects[0], id: 'o3', x: 99 });
    m.erase.push({ id: 'e2', rect: [1.5, 1.5, 1, 1], what: 'trees' }, { id: 'e3', rect: [0, 0, 10, 10], what: 'all' }); // e1(1,1,2,2,trees) 与 e2 都在 e3 里面
    const r = simplifyManual(m);
    expect(r.removed).toEqual({ shapes: 0, objects: 1, erase: 2 });
    expect(r.m.erase.map((e) => e.id)).toEqual(['e3']);
    expect(validateManual(r.m)).toEqual([]);
    const l1 = { ...emptyManual(), shapes: [{ id: 'a', kind: 'rect' as const, mat: 'lawn' as any, x: 1, y: 1, w: 2, h: 2 }, { id: 'k', kind: 'rect' as const, mat: 'lawn' as any, x: 50, y: 50, w: 2, h: 2 }] };
    const l2 = { ...emptyManual(), shapes: [{ id: 'b', kind: 'rect' as const, mat: 'plaza' as any, x: 0, y: 0, w: 10, h: 10 }] };
    const c = compactBaked({ version: 1, layers: [l1, l2] });
    expect(c.layers[0].shapes.map((s) => s.id)).toEqual(['k']);
    expect(c.layers[1].shapes.map((s) => s.id)).toEqual(['b']);
  });
});
