/**
 * 把当前蓝图（建筑翼体、道路、水体、场地…）叠加到卫星视图上输出，用于逐区校验描图是否对位。
 * 用法：npx tsx tools/reference/overlay.ts [r c]      例：overlay.ts 2 1   （不带参数输出全部 16 块 + 总览）
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderView } from './views.ts';
import { CACHE } from '../paths.ts';
import { loadTerrain, loadBuildings } from '../world/blueprint-load.ts';
import { readFileSync, existsSync } from 'node:fs';
import { DATA } from '../paths.ts';
const osmRoads: { pts: [number, number][] }[] = existsSync(join(DATA, 'osm-roads.json')) ? JSON.parse(readFileSync(join(DATA, 'osm-roads.json'), 'utf8')) : [];

const terrain = loadTerrain();
const buildings = loadBuildings();
const COL: Record<string, string> = {
  water: '#3fa7ff', asphalt: '#ffffff', path: '#c9c9c9', stone: '#ffd27a', paver: '#ff8a5a', lawn: '#7dff7d', forest: '#2fa84f', dirt: '#c9a066', sand: '#e8d9a0',
  track: '#ff5a5a', pitch: '#4dff4d', courtBlue: '#5a7dff', courtGreen: '#3fd68a', courtRed: '#ff7a5a', roof: '#ffffff', grass: '#7dff7d', line: '#fff', lineY: '#ff0', zebraH: '#fff', zebraV: '#fff',
};

function overlay(px: (x: number) => number, py: (y: number) => number, s: number) {
  let o = '';
  for (const sh of terrain.shapes) {
    const c = COL[sh.mat] ?? '#f0f';
    if (sh.kind === 'rect') o += `<rect x="${px(sh.x)}" y="${py(sh.y)}" width="${sh.w * s}" height="${sh.h * s}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.2" stroke-opacity="0.9"/>`;
    else if (sh.kind === 'poly') o += `<polygon points="${sh.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.2"/>`;
    else if (sh.kind === 'ellipse') o += `<ellipse cx="${px(sh.cx)}" cy="${py(sh.cy)}" rx="${sh.rx * s}" ry="${sh.ry * s}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.2"/>`;
    else if (sh.kind === 'capsule') o += `<rect x="${px(sh.cx - sh.rx)}" y="${py(sh.cy - sh.ry)}" width="${sh.rx * 2 * s}" height="${sh.ry * 2 * s}" rx="${sh.rx * s}" ry="${sh.rx * s}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.2"/>`;
    else if (sh.kind === 'stroke') {
      const pts = sh.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
      o += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-opacity="0.22" stroke-width="${sh.w * s}" stroke-linejoin="round" stroke-linecap="round"/>`;
      o += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-opacity="0.95" stroke-width="1"/>`;
    }
  }
  for (const r of osmRoads) o += `<polyline points="${r.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}" fill="none" stroke="#00ffff" stroke-width="2" stroke-dasharray="6 3"/>`;
  for (const b of terrain.blocks) o += `<rect x="${px(b.x)}" y="${py(b.y)}" width="${b.w * s}" height="${b.h * s}" fill="none" stroke="#f0f" stroke-dasharray="3 2"/>`;
  for (const b of buildings) {
    for (const w of b.wings) {
      if (w.rot) {
        const th = (w.rot * Math.PI) / 180, cx = w.x + w.w / 2, cy = w.y + w.d / 2;
        const pts = [[-w.w / 2, -w.d / 2], [w.w / 2, -w.d / 2], [w.w / 2, w.d / 2], [-w.w / 2, w.d / 2]].map(([x, y]) => `${px(cx + x * Math.cos(th) - y * Math.sin(th))},${py(cy + x * Math.sin(th) + y * Math.cos(th))}`);
        o += `<polygon points="${pts.join(' ')}" fill="#ff2d6a" fill-opacity="0.16" stroke="#ff2d6a" stroke-width="1.6"/>`;
      } else o += `<rect x="${px(w.x)}" y="${py(w.y)}" width="${w.w * s}" height="${w.d * s}" fill="#ff2d6a" fill-opacity="0.16" stroke="#ff2d6a" stroke-width="1.6"/>`;
    }
    const w0 = b.wings[0];
    o += `<text x="${px(w0.x) + 3}" y="${py(w0.y) + 12}" font-size="12" fill="#fff" stroke="#c00" stroke-width="3" paint-order="stroke">${b.name}</text>`;
  }
  return o;
}

const xs = [0, 84, 168, 252], ys = [0, 66, 132, 196];
const out = join(CACHE, 'overlay');
await mkdir(out, { recursive: true });
const arg = process.argv.slice(2).map(Number);
const jobs: [number, number][] = arg.length === 2 ? [[arg[0], arg[1]]] : ys.flatMap((_, r) => xs.map((_, c) => [r, c] as [number, number]));
for (const [r, c] of jobs) await renderView({ x: xs[c], y: ys[r], w: 100, h: 76, scale: 9, overlaySvg: overlay, out: join(out, `ov_r${r}c${c}.png`) });
if (arg.length !== 2) await renderView({ x: 0, y: 0, w: 352, h: 272, scale: 4, overlaySvg: overlay, out: join(out, 'overview.png') });
console.log('overlay done ->', out);
