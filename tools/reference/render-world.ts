/**
 * 离线渲染：把地面块 + 建筑 + 对象按游戏同样的深度规则合成为一张图（与鸟瞰图/卫星图对比用，不依赖浏览器）。
 * 用法：npx tsx tools/reference/render-world.ts [scale=0.5] [x y w h  (tile 矩形，可选)]
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GEN, CACHE } from '../paths.ts';
import type { WorldFile } from '../../src/shared/world-format.ts';

const world: WorldFile = JSON.parse(readFileSync(join(GEN, 'world.json'), 'utf8'));
const atlas = async (name: string, png = name) => ({ img: sharp(join(GEN, `${png}.png`)), json: JSON.parse(readFileSync(join(GEN, `${name}.json`), 'utf8')).frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }> });
const pA = await atlas('atlas-props', existsSync(join(GEN, `atlas-props-${process.env.SEASON ?? 'summer'}.png`)) ? `atlas-props-${process.env.SEASON ?? 'summer'}` : 'atlas-props');
const bPages = [] as Awaited<ReturnType<typeof atlas>>[];
for (let i = 0; i < (world.atlases.buildingPages ?? 1); i++) bPages.push(await atlas(`atlas-buildings-${i}`));
const bA = bPages[0];
const args = process.argv.slice(2).map(Number);
const scale = args[0] || 0.5;
const [rx, ry, rw, rh] = args.length >= 5 ? args.slice(1, 5) : [0, 0, world.width, world.height];
const T = world.tile, PX = rx * T, PY = ry * T, PW = rw * T, PH = rh * T;

const comps: { input: string | Buffer; left: number; top: number }[] = [];
for (let cy = 0; cy < world.chunk.rows; cy++) for (let cx = 0; cx < world.chunk.cols; cx++) {
  const wx = cx * world.chunk.px, wy = cy * world.chunk.px;
  const x0 = Math.max(wx, PX), y0 = Math.max(wy, PY);
  const x1 = Math.min(wx + world.chunk.px, PX + PW), y1 = Math.min(wy + world.chunk.px, PY + PH);
  if (x1 <= x0 || y1 <= y0) continue;
  const buf = await sharp((([a, b]) => existsSync(a) ? a : b)([join(GEN, 'ground', process.env.SEASON ?? 'summer', `c_${cx}_${cy}.png`), join(GEN, 'ground', `c_${cx}_${cy}.png`)])).extract({ left: x0 - wx, top: y0 - wy, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  comps.push({ input: buf, left: x0 - PX, top: y0 - PY });
}
type Item = { depth: number; frame: { x: number; y: number; w: number; h: number }; src: typeof bA; x: number; y: number; pg?: number };
const items: Item[] = [];
for (const o of world.objects) { const f = pA.json[o.k]?.frame; if (f) items.push({ depth: o.y, frame: f, src: pA, x: o.x - o.ax, y: o.y - o.ay }); }
for (const b of world.buildings) b.wings.forEach((w, i) => { const src = bPages[w.pg ?? 0]; const f = src.json[w.k].frame; items.push({ depth: w.base + i * 0.01, frame: f, src, x: w.x, y: w.y, pg: w.pg ?? 0 }); });
items.sort((a, b) => a.depth - b.depth);
const cache = new Map<string, Buffer>();
for (const it of items) {
  const px = Math.round(it.x) - PX, py = Math.round(it.y) - PY;
  if (px > PW || py > PH || px + it.frame.w < 0 || py + it.frame.h < 0) continue;
  const k = `${it.src === pA ? 'p' : `b${it.pg}`}${it.frame.x},${it.frame.y}`;
  let buf = cache.get(k);
  if (!buf) { buf = await it.src.img.clone().extract({ left: it.frame.x, top: it.frame.y, width: it.frame.w, height: it.frame.h }).png().toBuffer(); cache.set(k, buf); }
  // 与画布求交后裁切（四边都可能越界）
  const l0 = Math.max(0, px), t0 = Math.max(0, py), r0 = Math.min(PW, px + it.frame.w), b0 = Math.min(PH, py + it.frame.h);
  if (r0 <= l0 || b0 <= t0) continue;
  if (l0 !== px || t0 !== py || r0 !== px + it.frame.w || b0 !== py + it.frame.h)
    buf = await sharp(buf).extract({ left: l0 - px, top: t0 - py, width: r0 - l0, height: b0 - t0 }).png().toBuffer();
  comps.push({ input: buf, left: l0, top: t0 });
}
// FOOT=1：叠加建筑占地（碰撞矩形/多边形，红线）与门触发区（黄线），用于和卫星图逐区对位
if (process.env.FOOT === '1') {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">`;
  const X = (t: number) => (t * T - PX).toFixed(1), Y = (t: number) => (t * T - PY).toFixed(1);
  for (const b of world.buildings) {
    const seen = new Set<string>();
    for (const w of b.wings) {
      const key = JSON.stringify(w.block) + JSON.stringify(w.poly ?? 0); if (seen.has(key)) continue; seen.add(key);
      if (w.poly) svg += `<polygon points="${w.poly.map(([a, c]) => `${X(a)},${Y(c)}`).join(' ')}" fill="none" stroke="#ff2030" stroke-width="2"/>`;
      else svg += `<rect x="${X(w.block.x)}" y="${Y(w.block.y)}" width="${(w.block.w * T).toFixed(1)}" height="${(w.block.d * T).toFixed(1)}" fill="none" stroke="#ff2030" stroke-width="2"/>`;
    }
    for (const d of b.doors) svg += `<rect x="${X(d.x)}" y="${Y(d.y)}" width="${(d.w * T).toFixed(1)}" height="${(d.h * T).toFixed(1)}" fill="none" stroke="#ffe000" stroke-width="1.5"/>`;
    svg += `<text x="${X(b.bbox.x)}" y="${Number(Y(b.bbox.y)) - 3}" font-size="${Math.max(9, 11 * scale / 0.75)}" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke" font-family="Menlo,monospace">${b.id}</text>`;
  }
  svg += '</svg>';
  comps.push({ input: Buffer.from(svg), left: 0, top: 0 });
}
const base = sharp({ create: { width: PW, height: PH, channels: 4, background: '#1f3a24' } }).composite(comps).png();
const out = process.env.OUT ?? join(CACHE, args.length >= 5 ? 'world_crop.png' : 'world_overview.png');
await sharp(await base.toBuffer()).resize(Math.round(PW * scale), Math.round(PH * scale), { kernel: scale < 1 ? 'lanczos3' : 'nearest' }).png().toFile(out);
console.log('->', out);
