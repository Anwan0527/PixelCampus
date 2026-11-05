import { describe, it, expect } from 'vitest';
import { capsulePoly, emptyManual, expandField, fenceCells, FIELD_KINDS, isManualEmpty, validateManual, MANUAL_MATS, MANUAL_PROPS, type ManualField, type ManualFile } from '../src/shared/manual';

const field = (kind: string, o: Partial<ManualField> = {}): ManualField => ({ id: 'f1', kind, x: 20, y: 30, w: 13, h: 20, ...o });
const withM = (f: (m: ManualFile) => void) => { const m = emptyManual(); f(m); return m; };

describe('运动场地模板（手动层 fields）', () => {
  it('四种模板都能展开：图形都在场地矩形内，材质合法', () => {
    const mats = new Set(MANUAL_MATS.map((m) => m.mat));
    for (const k of FIELD_KINDS) {
      const f = field(k.k, { w: k.size[0], h: k.size[1] }), ex = expandField(f);
      expect(ex.shapes.length, k.k).toBeGreaterThan(2);
      for (const s of ex.shapes) {
        expect(mats.has(s.mat), `${k.k} ${s.mat}`).toBe(true);
        const pts = s.kind === 'rect' ? [[s.x, s.y], [s.x + s.w, s.y + s.h]] : s.kind === 'poly' || s.kind === 'stroke' ? s.pts : [];
        for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(f.x - 0.2); expect(x).toBeLessThanOrEqual(f.x + f.w + 0.2); expect(y).toBeGreaterThanOrEqual(f.y - 0.2); expect(y).toBeLessThanOrEqual(f.y + f.h + 0.2); }
      }
    }
  });
  it('足球场：球场草 + 白线 + 两个球门（在长边两头）；篮球场：两个篮架', () => {
    const soccer = expandField(field('soccer'));
    expect(soccer.shapes[0]).toMatchObject({ kind: 'rect', mat: 'pitch' });
    expect(soccer.shapes.filter((s) => s.kind === 'stroke' && s.mat === 'line').length).toBeGreaterThanOrEqual(7);
    expect(soccer.objects.filter((o) => o.k === 'goal')).toHaveLength(2);
    const [g0, g1] = soccer.objects; expect(g0.x).toBeCloseTo(g1.x); expect(Math.abs(g1.y - g0.y)).toBeGreaterThan(15); // 竖着的球场：球门在上下两头、x 居中
    expect(expandField(field('basketball', { w: 6, h: 11 })).objects.filter((o) => o.k === 'hoop')).toHaveLength(2);
    expect(expandField(field('soccer', { goals: false })).objects.filter((o) => o.k === 'goal')).toHaveLength(0);
  });
  it('横着的球场（宽 > 高）长轴沿 x：球门在左右两头', () => {
    const ex = expandField(field('soccer', { w: 20, h: 13 }));
    const [g0, g1] = ex.objects; expect(g0.y).toBeCloseTo(g1.y); expect(Math.abs(g1.x - g0.x)).toBeGreaterThan(15);
  });
  it('围栏沿矩形四边，gate 那一侧留 2 格缺口；灯杆在四角', () => {
    const ex = expandField(field('soccer', { fence: true, gate: 'S', lights: true }));
    expect(ex.fences).toHaveLength(5); // 三条整边 + 南边被缺口分成两段
    const south = ex.fences.filter((f) => f.pts.every(([, y]) => y === 50));
    expect(south).toHaveLength(2);
    const gap = Math.min(...south.map((f) => Math.max(...f.pts.map((p) => p[0])))) ; const gap2 = Math.max(...south.map((f) => Math.min(...f.pts.map((p) => p[0]))));
    expect(gap2 - gap).toBeCloseTo(2);
    expect(ex.objects.filter((o) => o.k === 'floodlight')).toHaveLength(4);
    expect(expandField(field('soccer')).fences).toHaveLength(0);
  });
  it('跑道形（capsulePoly）：闭合多边形落在矩形内，竖/横两种方向', () => {
    for (const [w, h] of [[10, 22], [22, 10]]) {
      const pts = capsulePoly(5, 6, w, h);
      for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(5 - 1e-6); expect(x).toBeLessThanOrEqual(5 + w + 1e-6); expect(y).toBeGreaterThanOrEqual(6 - 1e-6); expect(y).toBeLessThanOrEqual(6 + h + 1e-6); }
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(w, 1); expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(h, 1);
    }
  });
});

describe('围栏分格（fenceCells）', () => {
  it('横向用 fenceH、竖向用 fenceV（wall 时 wallV；wallH 只在手动围墙时用），砖柱每隔 every 格和段尾', () => {
    const h = fenceCells([[10, 5], [15, 5]], 4, false);
    expect(h).toHaveLength(5); expect(h.every((c) => c.items[0].k === 'fenceH')).toBe(true);
    expect(h.flatMap((c) => c.items).filter((i) => i.k === 'pier')).toHaveLength(3); // k=0、k=4（每隔 4 格）+ 段尾
    const v = fenceCells([[10, 5], [10, 8]], 4, true);
    expect(v.every((c) => c.items[0].k === 'wallV')).toBe(true);
    expect(fenceCells([[0, 0], [3, 0]], 4, true, false)[0].items[0].k).toBe('fenceH');
    expect(fenceCells([[0, 0], [3, 0]], 4, true, true)[0].items[0].k).toBe('wallH');
  });
  it('斜线按主方向分格，长度取整格数', () => {
    expect(fenceCells([[0, 0], [6, 3]], 4, false)).toHaveLength(7);
  });
});

describe('手动层新字段的校验', () => {
  it('合法的围栏 / 运动场 / 蓝图修改通过，空的手动层仍然是空', () => {
    const m = withM((x) => {
      x.fences = [{ id: 'f1', pts: [[10, 10], [20, 10]], piers: 5, wall: true }];
      x.fields = [field('track', { id: 'fd1', w: 22, h: 36, fence: true, gate: 'N', lights: true })];
      x.bp = { hide: ['40-sports#s4:abc'], edit: { '40-sports#s3:def': { kind: 'rect', mat: 'courtBlue', x: 27, y: 132, w: 21, h: 38 }, '60-landscape#c9:fff': { kind: 'fence', pts: [[1, 1], [5, 1]], piers: 5 } } };
    });
    expect(validateManual(m)).toEqual([]);
    expect(isManualEmpty(m)).toBe(false);
    expect(isManualEmpty(emptyManual())).toBe(true);
    expect(isManualEmpty(withM((x) => { x.bp = { hide: [], edit: {} }; }))).toBe(true);
    expect(isManualEmpty(withM((x) => { x.fields = [field('soccer')]; }))).toBe(false);
  });
  it('坏数据被拒绝', () => {
    const bad = (f: (m: ManualFile) => void) => validateManual(withM(f)).length > 0;
    expect(bad((m) => { m.fields = [field('golf')]; })).toBe(true);
    expect(bad((m) => { m.fields = [field('soccer', { w: 1 })]; })).toBe(true);
    expect(bad((m) => { m.fields = [field('soccer', { gate: 'X' as any })]; })).toBe(true);
    expect(bad((m) => { m.fields = [field('soccer'), field('soccer')]; })).toBe(true); // id 重复
    expect(bad((m) => { m.fences = [{ id: 'f', pts: [[1, 1]] }]; })).toBe(true);
    expect(bad((m) => { m.fences = [{ id: 'f', pts: [[1, 1], [3, 1]], piers: 0 }]; })).toBe(true);
    expect(bad((m) => { m.bp = { hide: [''], edit: {} }; })).toBe(true);
    expect(bad((m) => { m.bp = { hide: [], edit: { x: { kind: 'lava' } } }; })).toBe(true);
    expect(bad((m) => { m.bp = { hide: [], edit: { x: { kind: 'rect', mat: 'lava', x: 1, y: 1, w: 1, h: 1 } } }; })).toBe(true);
    expect(bad((m) => { m.bp = { hide: [], edit: { x: { kind: 'rect', mat: 'lawn', x: 1, y: 1 } } }; })).toBe(true);
  });
  it('折线路的 flat / mark：合法值通过，非法 mark 被拒绝', () => {
    expect(validateManual(withM((m) => { m.shapes = [{ id: 's', kind: 'stroke', mat: 'asphalt', w: 3, pts: [[1, 1], [9, 9]], flat: true, mark: 'center' }]; }))).toEqual([]);
    expect(validateManual(withM((m) => { m.shapes = [{ id: 's', kind: 'stroke', mat: 'asphalt', w: 3, pts: [[1, 1], [9, 9]], mark: 'zigzag' as any }]; })).length).toBeGreaterThan(0);
  });
  it('调色板：球场材质和运动/围墙小品都可以选', () => {
    const mats = MANUAL_MATS.map((m) => m.mat), ks = MANUAL_PROPS.map((p) => p.k);
    for (const m of ['courtBlue', 'courtGreen', 'courtRed', 'pitch', 'track', 'rubber', 'line']) expect(mats).toContain(m);
    for (const k of ['goal', 'hoop', 'bleacher', 'stadium', 'wallH', 'wallV', 'fenceH', 'fenceV', 'pier', 'floodlight']) expect(ks).toContain(k);
  });
});
