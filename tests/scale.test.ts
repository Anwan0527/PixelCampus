import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEN } from '../tools/paths.ts';
import { loadTerrain, loadBuildings, loadPois } from '../tools/world/blueprint-load.ts';
import { scaleTerrain, scaleBuildings, scalePois } from '../tools/world/scale.ts';

describe('世界放大（scale.ts）', () => {
  const T = loadTerrain(), Bd = loadBuildings(), Po = loadPois();
  it('S=1 原样返回', () => { expect(scaleTerrain(T, 1)).toBe(T); expect(scaleBuildings(Bd, 1)).toBe(Bd); expect(scalePois(Po, 1)).toBe(Po); });
  it('S=2：几何 ×2，层数/风格不变', () => {
    const lib = Bd.find((b) => b.id === 'library')!, lib2 = scaleBuildings(Bd, 2).find((b) => b.id === 'library')!;
    lib.wings.forEach((w, i) => { expect(lib2.wings[i].x).toBeCloseTo(w.x * 2); expect(lib2.wings[i].w).toBeCloseTo(w.w * 2); expect(lib2.wings[i].d).toBeCloseTo(w.d * 2); });
    expect(lib2.f).toBe(lib.f); expect(lib2.style).toBe(lib.style);
  });
  it('S=2：门宽（像素设计）不变，门中心随比例移动', () => {
    const w0 = Bd.find((b) => b.id === 'library')!.wings.find((w) => w.door)!, w2 = scaleBuildings(Bd, 2).find((b) => b.id === 'library')!.wings.find((w) => w.door)!;
    expect(w2.door!.tw).toBe(w0.door!.tw);
    expect((w2.door!.tx + w2.door!.tw / 2) / 2).toBeCloseTo(w0.door!.tx + w0.door!.tw / 2);
  });
  it('S=2：fixed 的门卫亭尺寸不变，只移动中心', () => {
    const g0 = Bd.find((b) => b.id === 'gate-s-w')!.wings[0], g2 = scaleBuildings(Bd, 2).find((b) => b.id === 'gate-s-w')!.wings[0];
    expect(g2.w).toBe(g0.w); expect(g2.d).toBe(g0.d); expect(g2.x + g2.w / 2).toBeCloseTo((g0.x + g0.w / 2) * 2);
  });
  it('S=2：道路加宽 ×2，但标线粗细（像素）不变', () => {
    const road = T.shapes.find((s) => s.kind === 'stroke' && s.mat === 'asphalt') as any, line = T.shapes.find((s) => s.kind === 'stroke' && s.mat === 'line') as any;
    const T2 = scaleTerrain(T, 2);
    const r2 = T2.shapes.find((s) => s.kind === 'stroke' && s.mat === 'asphalt') as any, l2 = T2.shapes.find((s) => s.kind === 'stroke' && s.mat === 'line') as any;
    expect(r2.w).toBeCloseTo(road.w * 2); expect(l2.w).toBeCloseTo(line.w);
  });
  it('S=2：摆放间距与密度不变（保持画面节奏），坐标 ×2', () => {
    const row = T.scatter.find((e) => e.kind === 'row') as any, row2 = scaleTerrain(T, 2).scatter.find((e) => e.kind === 'row') as any;
    expect(row2.spacing).toBe(row.spacing); expect(row2.pts[0][0]).toBeCloseTo(row.pts[0][0] * 2);
  });
  it('放大专属条目（minS）存在', () => { expect(T.scatter.filter((e) => e.minS === 2).length).toBeGreaterThan(10); });
});

const f = join(GEN, 'world.json');
describe.skipIf(!existsSync(f))('全校 S=2 产物', () => {
  const W = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  it('比例为 2，世界 704×544 格，建筑图集分页且每页 ≤ 4096 高', () => {
    expect(W.scale).toBe(2); expect(W.width).toBe(704); expect(W.height).toBe(544);
    expect(W.atlases.buildingPages).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < W.atlases.buildingPages; i++) expect(JSON.parse(readFileSync(join(GEN, `atlas-buildings-${i}.json`), 'utf8')).meta.size.h).toBeLessThanOrEqual(4096);
  });
  it('每个翼体都有页号，且页号合法', () => {
    for (const b of W.buildings) for (const w of b.wings) { expect(typeof w.pg, `${b.id}/${w.k}`).toBe('number'); expect(w.pg).toBeLessThan(W.atlases.buildingPages); }
  });
  it('地面块数量覆盖全校（≥ 90）', () => { expect((W.chunks ?? []).length).toBeGreaterThanOrEqual(90); });
  it('摆件数量在合理范围（7k~25k），且放大后每帧只创建视野内的（由 Streamer 保证）', () => { expect(W.objects.length).toBeGreaterThan(7000); expect(W.objects.length).toBeLessThan(25000); });
});
