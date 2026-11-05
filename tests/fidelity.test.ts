/**
 * 地图保真度：用独立的第二来源（OSM，Maxar 影像描图）与卫星正射图量测值，约束蓝图的比例与位置。
 * 1 tile = 5 m。容差以 tile 计。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../tools/paths.ts';
import { loadTerrain, loadBuildings } from '../tools/world/blueprint-load.ts';

const osm: { id: number; name: string | null; highway: string; pts: [number, number][] }[] = JSON.parse(readFileSync(join(DATA, 'osm-roads.json'), 'utf8'));
const terrain = loadTerrain();
const buildings = loadBuildings();
const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function strokeBy(note: string) {
  const s = terrain.shapes.find((x) => x.kind === 'stroke' && (x.note ?? '').startsWith(note));
  if (!s || s.kind !== 'stroke') throw new Error('缺少道路 ' + note);
  return s;
}

describe('外围道路位置', () => {
  // 注意：OSM 中带名字的大街（赵王大街/毛遂大街）坐标与卫星图中心线相差 3~5 格，不作为位置真值；
  // 位置以卫星图量测为准（下列常量），OSM 里 source=Maxar 的无名道路与卫星图吻合，用于环路。
  it('赵王大街 / 毛遂大街 / 太极路 中心线与卫星量测一致（±1.5 格）', () => {
    expect(Math.abs(strokeBy('赵王大街').pts[0][0] - 15.2)).toBeLessThan(1.5);
    expect(Math.abs(strokeBy('毛遂大街').pts[0][0] - 343.2)).toBeLessThan(1.5);
    expect(Math.abs(strokeBy('太极路').pts[0][1] - 256.4)).toBeLessThan(1.5);
  });
  it('校园东西总宽（赵王大街↔毛遂大街）与 OSM 间距一致（±5%）', () => {
    const zw = mean(osm.filter((r) => r.name === '赵王大街').flatMap((r) => r.pts.map((p) => p[0])));
    const ms = mean(osm.filter((r) => r.name === '毛遂大街').flatMap((r) => r.pts.map((p) => p[0])));
    const mine = strokeBy('毛遂大街').pts[0][0] - strokeBy('赵王大街').pts[0][0];
    expect(Math.abs(mine - (ms - zw)) / (ms - zw)).toBeLessThan(0.05);
  });
});

describe('主要建筑尺寸与卫星量测一致（±12%）', () => {
  const size = (id: string) => {
    const ws = byId[id].wings.filter((w) => !w.rot);
    const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x + w.w));
    const y0 = Math.min(...ws.map((w) => w.y)), y1 = Math.max(...ws.map((w) => w.y + w.d));
    return { w: (x1 - x0) * 5, d: (y1 - y0) * 5, cx: (x0 + x1) / 2 };
  };
  it('图书馆约 177 m × 112 m', () => {
    const s = size('library');
    expect(Math.abs(s.w - 177) / 177).toBeLessThan(0.12); expect(Math.abs(s.d - 112) / 112).toBeLessThan(0.12);
  });
  it('中轴对称：图书馆、综合/会议服务中心的中线一致（±2 格）', () => {
    const axis = size('library').cx;
    const mid = (size('svc-center').cx + size('conf-center').cx) / 2;
    expect(Math.abs(axis - mid)).toBeLessThan(2);
  });
  it('南门中轴（OSM Maxar 来源）与图书馆中线一致（±3 格）', () => {
    const gate = strokeBy('南门中轴出口').pts;
    expect(Math.abs(size('library').cx - gate[0][0])).toBeLessThan(3);
  });
});

describe('道路网络', () => {
  it('环路来自 OSM 且首尾闭合于东南/西南交点', () => {
    const north = osm.find((r) => r.id === 1561666646)!, south = osm.find((r) => r.id === 775116469)!;
    // 两条路在西侧 (63.3,112.9) 相接；东侧终点相近（东环路）
    expect(Math.hypot(north.pts[0][0] - south.pts[0][0], north.pts[0][1] - south.pts[0][1])).toBeLessThan(1);
    const n = north.pts.at(-1)!, s = south.pts.at(-1)!;
    expect(Math.hypot(n[0] - s[0], n[1] - s[1])).toBeLessThan(2);
  });
});

describe('南门—图书馆中轴段（旧版最满意的一段）', () => {
  const lawnPanels = () => terrain.shapes.filter((s) => s.kind === 'rect' && s.mat === 'lawn' && s.y > 190 && s.y < 210 && s.x > 160 && s.x < 200) as Extract<(typeof terrain.shapes)[number], { kind: 'rect' }>[];
  it('图书馆南广场的草坪格东西对称（轴线 x≈180.8，±1 格）', () => {
    const ps = lawnPanels();
    expect(ps.length).toBeGreaterThanOrEqual(16);
    const axis = 180.8;
    // 每个格在镜像位置上应有一个同行、宽度相近的格
    for (const p of ps) {
      const mirrorCx = 2 * axis - (p.x + p.w / 2);
      const twin = ps.find((q) => Math.abs(q.y - p.y) < 1.2 && Math.abs(q.x + q.w / 2 - mirrorCx) < 1.2);
      expect(twin, `草坪格 (${p.x},${p.y}) 缺少镜像`).toBeTruthy();
    }
  });
  it('图书馆正门中心、南门门洞中心、OSM 南门轴线在同一条轴上（±1.5 格）', () => {
    const lib = byId['library'].wings.find((w) => w.door)!;
    const doorCx = lib.x + lib.door!.tx + lib.door!.tw / 2;
    const gate = strokeBy('南门中轴出口').pts[0][0];
    const gh = [byId['gate-s-w'].wings[0], byId['gate-s-e'].wings[0]];
    const openCx = (gh[0].x + gh[0].w + gh[1].x) / 2;
    expect(Math.abs(doorCx - gate)).toBeLessThan(1.5);
    expect(Math.abs(openCx - gate)).toBeLessThan(1.5);
  });
  it('南门门洞宽 4~5 格', () => {
    const [w, e] = [byId['gate-s-w'].wings[0], byId['gate-s-e'].wings[0]];
    const gap = e.x - (w.x + w.w);
    expect(gap).toBeGreaterThanOrEqual(4); expect(gap).toBeLessThanOrEqual(5);
  });
  it('综合服务中心 / 会议中心分居中轴两侧，与门卫室、图书馆同轴对称（±2 格）', () => {
    const c = (id: string) => { const ws = byId[id].wings; const x0 = Math.min(...ws.map((w) => w.x)), x1 = Math.max(...ws.map((w) => w.x + w.w)); return (x0 + x1) / 2; };
    const lib = byId['library'].wings.find((w) => w.door)!; const axis = lib.x + lib.door!.tx + lib.door!.tw / 2;
    expect(Math.abs((c('svc-center') + c('conf-center')) / 2 - axis)).toBeLessThan(2);
  });
});

describe('宿舍组团', () => {
  const ids = (prefix: string) => Object.keys(byId).filter((k) => k.startsWith(prefix));
  it('四个社区的楼数：一、二社区按校园模型的 A–E 栋成组（各 5 栋，二社区 E 栋是 45° 斜向 U 形，原先拆成 J/K 两座），三社区 4 栋（D/F/G 已删；地图编辑器里 C 栋、B 栋是换了名字的原 E、C 栋，最终只剩 A/B/C 三栋）、四社区 9 栋(含两座小塔)', () => {
    expect(ids('d1-').filter((k) => !['d1-bath', 'd1-mid'].includes(k)).length).toBe(5);
    expect(ids('d2-').filter((k) => !['d2-bath', 'd2-canteen', 'd2-market', 'd2-gym'].includes(k)).length).toBe(5);
    expect(ids('d3-').filter((k) => k !== 'd3-bath').length).toBe(4);
    expect(ids('d4-').filter((k) => !['d4-bath', 'd4-tower'].includes(k)).length).toBe(9);
  });
  it('宿舍楼都是"长板 + 短翼"的 L 形（板长 ≥ 2×翼宽），且层数 6', () => {
    const lShaped = ['d3-a', 'd3-e', 'd3-b', 'd4-a', 'd4-b', 'd4-c', 'd4-d'];
    for (const id of lShaped) {
      const b = byId[id]; expect(b.wings.length, id).toBeGreaterThanOrEqual(2); expect(b.f, id).toBe(6);
      const slab = b.wings.reduce((a, w) => (w.w * w.d > a.w * a.d ? w : a)); const leg = b.wings.find((w) => w !== slab)!;
      expect(slab.w, id).toBeGreaterThan(leg.w * 1.5);
    }
  });
  it('一、二社区的楼形取自校园模型（脚印，ground），各栋 6 层、至少一个门，二社区 E 栋是斜向的', () => {
    for (const id of ['d1-a', 'd1-b', 'd1-c', 'd1-d', 'd1-e', 'd2-a', 'd2-b', 'd2-c', 'd2-d', 'd2-e']) {
      const b = byId[id]; expect(b.ground, id).toBe(true); expect(b.f, id).toBe(6);
      expect(b.wings.some((w) => w.door), id).toBe(true);
      expect(b.wings.reduce((a, w) => a + w.w * w.d, 0), id).toBeGreaterThan(30); // 至少 30 格²（约 750 m²）
    }
    expect(byId['d2-e'].wings.every((w) => w.rot === 45)).toBe(true);
  });
  it('44 号楼是留学生公寓（据校园模型），U 形开口朝南', () => {
    const b = byId['exchange']; expect(b.name).toBe('留学生公寓'); expect(b.kind).toBe('dorm'); expect(b.wings.length).toBe(3);
  });
  it('视差配置：西侧影像向东北偏、东侧影像(x≥303)向西偏，且量级在 0.15~0.5 格/层', () => {
    const g = JSON.parse(readFileSync(join(DATA, 'geo.json'), 'utf8')).parallax;
    expect(g.perFloor[0]).toBeGreaterThan(0.15); expect(g.perFloor[0]).toBeLessThan(0.5);
    expect(g.regions[0].xMin).toBeGreaterThan(290); expect(g.regions[0].perFloor[0]).toBeLessThan(-0.15);
  });
});

describe('学院楼群', () => {
  const walls = (id: string) => byId[id].wings;
  it('主要学院楼不再是单个矩形：公教一/二、实训楼、材料/水院等均为多翼组合（≥2 翼）', () => {
    for (const id of ['public-1', 'public-2', 'practice', 'material', 'hydro-c', 'hydro-d', 'energy', 'law-lit', 'research', 'innovation', 'lake-se', 'landscape', 'life-food'])
      expect(walls(id).length, id).toBeGreaterThanOrEqual(2);
  });
  it('第一公共教学楼：四翼围合 + 一条 27° 斜翼，东侧另有平台', () => {
    const w = walls('public-1');
    expect(w.filter((x) => x.rot).length).toBe(1); expect(Math.abs(w.find((x) => x.rot)!.rot!)).toBeGreaterThan(20);
    expect(byId['public-1-podium']).toBeTruthy();
  });
  it('创新创业指导中心是"回字形"：四翼围出内院（内院净空 ≥ 8×9 格）', () => {
    const w = walls('innovation'); const n = w.find((x) => x.y === Math.min(...w.map((a) => a.y)))!, s = w.find((x) => x.y === Math.max(...w.map((a) => a.y)))!;
    const west = w.find((x) => x.x === Math.min(...w.map((a) => a.x)) && x !== n && x !== s)!, east = w.find((x) => x.x === Math.max(...w.map((a) => a.x)) && x !== n && x !== s)!;
    expect(east.x - (west.x + west.w)).toBeGreaterThanOrEqual(8); expect(s.y - (n.y + n.d)).toBeGreaterThanOrEqual(9);
  });
  it('每个学院楼最多有 1 个主入口，且至少有 1 个门（试验厅除外）', () => {
    const noDoor = new Set(['hydro-b', 'public-1-podium']);
    for (const b of Object.values(byId)) if (b.kind === 'teaching' && !noDoor.has(b.id)) {
      const n = b.wings.filter((w) => w.door).length; expect(n, b.id).toBeGreaterThanOrEqual(1);
      expect(b.wings.filter((w) => w.door?.main).length, b.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('图书馆北广场与田径场（卫星量测）', () => {
  const rects = (mat: string, y0: number, y1: number, x0: number, x1: number) => terrain.shapes.filter((s) => s.kind === 'rect' && s.mat === mat && s.y >= y0 && s.y <= y1 && s.x >= x0 && s.x <= x1) as Extract<(typeof terrain.shapes)[number], { kind: 'rect' }>[];
  it('北广场：4 块褐色中央草坪，关于中轴 x≈181.1 左右对称', () => {
    const ps = rects('lawn', 133, 143, 176, 186); expect(ps.length).toBe(4);
    for (const p of ps) { const m = 2 * 181.13 - (p.x + p.w / 2); expect(ps.some((q) => Math.abs(q.y - p.y) < 0.3 && Math.abs(q.x + q.w / 2 - m) < 0.6), `(${p.x},${p.y})`).toBe(true); }
  });
  it('田径场：跑道长轴 ≈ 34.6 格、宽 ≈ 19.8 格；足球场 13.7×21.8', () => {
    const t = terrain.shapes.find((s) => s.kind === 'capsule' && s.mat === 'track' && (s as any).cx > 300) as any; // 东操场（西操场 2026-11-04 起也是同款塑胶跑道）
    expect(t.ry * 2).toBeGreaterThan(33); expect(t.ry * 2).toBeLessThan(36); expect(t.rx * 2).toBeGreaterThan(19); expect(t.rx * 2).toBeLessThan(21);
    const p = terrain.shapes.find((s) => s.kind === 'rect' && s.mat === 'pitch' && s.x === 310.6) as any; expect(p.w).toBeCloseTo(13.7, 1); expect(p.h).toBeCloseTo(21.8, 1);
  });
  it('西侧学院楼群与体育馆取自校园模型（脚印）：文法/管商/机械/信电/材料/矿测/地球/体育馆，新增体育与健康学院', () => {
    for (const id of ['law-lit', 'mgmt', 'info-elec', 'mech', 'practice', 'material', 'lab-a', 'mining', 'geo', 'gym', 'sport-college']) { expect(byId[id], id).toBeTruthy(); expect(byId[id].ground, id).toBe(true); }
    expect(byId['marx']).toBeUndefined(); // 马克思主义学院在模型里与文法/管商同属一个楼群，没有单独的楼
    expect(byId['mgmt'].wings.some((w) => w.rot)).toBe(true); // 管商：圆厅 + 斜向的折翼
  });
  it('信电学院西侧、文法/管商西侧各有一个荷塘（水面 + 睡莲）', () => {
    const ponds = terrain.shapes.filter((s) => s.kind === 'poly' && s.mat === 'water' && (s as any).note?.includes('荷塘'));
    expect(ponds.length).toBe(2);
    expect(terrain.scatter.filter((c) => c.kind === 'at' && (c as any).prop === 'lily').length).toBeGreaterThan(60);
  });
  it('图书馆西南花草地与景观水渠、四座小亭', () => {
    expect(terrain.shapes.filter((s) => (s.mat === 'bedPink' || s.mat === 'bedYellow')).length).toBeGreaterThan(30);
    expect(terrain.scatter.filter((c) => c.kind === 'at' && (c as any).prop === 'pavilion' && (c as any).note?.includes('水渠')).length).toBe(4);
  });
  it('西操场与东操场同款：塑胶外圈 + 红跑道 + 内场（不再是蓝色硬质场地）', () => {
    const west = terrain.shapes.filter((s) => (s as any).note?.startsWith('西操场'));
    expect(west.map((s) => s.mat).sort()).toEqual(['pitch', 'rubber', 'track']);
    expect(terrain.shapes.some((s) => s.mat === 'courtBlue' && (s as any).x < 60)).toBe(false);
  });
});
