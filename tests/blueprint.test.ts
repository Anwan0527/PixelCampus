import { describe, it, expect } from 'vitest';
import { loadTerrain, loadBuildings, loadPois, loadGeo } from '../tools/world/blueprint-load.ts';
import { MaterialMap, paintShapes } from '../tools/world/terrain.ts';

const geo = loadGeo();
const TW = geo.world.widthTiles, TH = geo.world.heightTiles;
const terrain = loadTerrain();
const buildings = loadBuildings();
const pois = loadPois();

describe('蓝图数据完整性', () => {
  it('建筑 id 唯一、翼体尺寸合法、层数合理', () => {
    const ids = new Set<string>();
    for (const b of buildings) {
      expect(ids.has(b.id), `重复 id ${b.id}`).toBe(false); ids.add(b.id);
      expect(b.wings.length).toBeGreaterThan(0);
      for (const w of b.wings) {
        expect(w.w).toBeGreaterThan(1); expect(w.d).toBeGreaterThan(1);
        expect(w.x).toBeGreaterThanOrEqual(0); expect(w.y).toBeGreaterThanOrEqual(0);
        expect(w.x + w.w).toBeLessThanOrEqual(TW); expect(w.y + w.d).toBeLessThanOrEqual(TH);
        const f = w.f ?? b.f ?? 4; expect(f).toBeGreaterThanOrEqual(1); expect(f).toBeLessThanOrEqual(8);
        if (w.door) { expect(w.door.tx).toBeGreaterThanOrEqual(0); expect(w.door.tx + w.door.tw).toBeLessThanOrEqual(w.w + 0.01); }
      }
    }
  });
  it('POI 都在世界范围内且有名称', () => {
    for (const p of pois) { expect(p.name.length).toBeGreaterThan(0); expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(TW); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(TH); }
    expect(pois.some((p) => p.kind === 'spawn')).toBe(true);
  });
  it('主要建筑不压在水面上', () => {
    const mm = new MaterialMap(TW, TH); paintShapes(mm, terrain.shapes);
    const bad: string[] = [];
    for (const b of buildings) for (const w of b.wings) {
      if (w.rot) continue;
      if (mm.tile(w.x + w.w / 2, w.y + w.d / 2) === 'water') bad.push(b.name);
    }
    expect(bad).toEqual([]);
  });
  it('蓝图不依赖未登记的 OSM way', () => {
    // loadTerrain 在引用缺失 way 时会抛错；能走到这里即通过
    expect(terrain.shapes.filter((s) => s.kind === 'stroke' && s.osm !== undefined).length).toBeGreaterThan(5);
  });
});
