/**
 * 世界放大：把以"5 米/格"量得的蓝图几何整体放大 S 倍（1 格 = 5/S 米），而不重做数据。
 * 规则：
 *  - 几何（坐标、尺寸、道路宽度、门的位置）×S；
 *  - 按像素设计的东西不变：楼的层高/窗距、树与小品的精灵、**摆放间距与密度**（保持画面节奏）、门宽、标线粗细、
 *    围栏/墙的段数由长度自然翻倍。
 *  - 量自屋顶的坐标仍按 geo.json parallax 换算（视差偏移以米计，所以 perFloor ×S）。
 */
import type { Terrain, BuildingDef, Poi, Shape, Scatter } from '../../src/shared/blueprint.ts';

const P = (p: [number, number], S: number): [number, number] => [p[0] * S, p[1] * S];

function scaleShape(s: Shape, S: number): Shape {
  switch (s.kind) {
    case 'poly': return { ...s, pts: s.pts.map((p) => P(p, S)) };
    case 'rect': return { ...s, x: s.x * S, y: s.y * S, w: s.w * S, h: s.h * S };
    case 'ellipse': case 'capsule': return { ...s, cx: s.cx * S, cy: s.cy * S, rx: s.rx * S, ry: s.ry * S };
    case 'stroke': return { ...s, pts: s.pts.map((p) => P(p, S)), w: s.mat === 'line' ? s.w : s.w * S };
  }
}
function scaleScatter(e: Scatter, S: number): Scatter {
  switch (e.kind) {
    case 'row': return { ...e, pts: e.pts.map((p) => P(p, S)) };
    case 'cluster': return { ...e, poly: e.poly.map((p) => P(p, S)) };
    case 'grove': return { ...e, poly: e.poly.map((p) => P(p, S)) };
    case 'prop': return { ...e, pts: e.pts.map((p) => P(p, S)) };
    case 'at': return { ...e, x: e.x * S, y: e.y * S };
    case 'label': return { ...e, x: e.x * S, y: e.y * S };
    case 'fence': return { ...e, pts: e.pts.map((p) => P(p, S)) };
    case 'ring': return { ...e, cx: e.cx * S, cy: e.cy * S, rx: e.rx * S, ry: e.ry * S };
    case 'interact': return { ...e, rect: [e.rect[0] * S, e.rect[1] * S, e.rect[2] * S, e.rect[3] * S] };
    case 'cars': return { ...e, rect: [e.rect[0] * S, e.rect[1] * S, e.rect[2] * S, e.rect[3] * S] };
  }
}
export function scaleTerrain(t: Terrain, S: number): Terrain {
  if (S === 1) return t;
  return {
    shapes: t.shapes.map((s) => scaleShape(s, S)),
    scatter: t.scatter.map((e) => scaleScatter(e, S)),
    blocks: t.blocks.map((b) => ({ ...b, x: b.x * S, y: b.y * S, w: b.w * S, h: b.h * S })),
    bounds: { x: t.bounds.x * S, y: t.bounds.y * S, w: t.bounds.w * S, h: t.bounds.h * S },
  };
}
export function scaleBuildings(bs: BuildingDef[], S: number): BuildingDef[] {
  if (S === 1) return bs;
  return bs.map((b) => ({
    ...b,
    wings: b.wings.map((w) => b.fixed ? ({ ...w, x: (w.x + w.w / 2) * S - w.w / 2, y: (w.y + w.d / 2) * S - w.d / 2 }) : ({
      ...w, x: w.x * S, y: w.y * S, w: w.w * S, d: w.d * S,
      // 门宽（像素设计）不变，门的中心点按比例移动
      door: w.door ? { ...w.door, tx: (w.door.tx + w.door.tw / 2) * S - w.door.tw / 2 } : undefined,
    })),
  }));
}
export function scalePois(ps: Poi[], S: number): Poi[] {
  if (S === 1) return ps;
  return ps.map((p) => ({ ...p, x: p.x * S, y: p.y * S, r: p.r === undefined ? undefined : p.r * S }));
}
