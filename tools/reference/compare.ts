/**
 * 并排对比：左 = 带格线的卫星图（品红框 = 按斜视角模型预测的屋顶位置，应与卫星里的屋顶重合），
 *           右 = 我们的渲染（红框 = 建筑脚印/碰撞，黄框 = 门触发区）。同一矩形、同一比例。
 * 用法：npx tsx tools/reference/compare.ts <x> <y> <w> <h> [每格像素=14] [输出名=compare]   -> .cache/<输出名>.png
 */
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderView } from './views.ts';
import { CACHE, ROOT, GEN, DATA } from '../paths.ts';
import type { WorldFile } from '../../src/shared/world-format.ts';

const [x, y, w, h] = process.argv.slice(2, 6).map(Number);
const s = Number(process.argv[6] ?? 14);
const name = process.argv[7] ?? 'compare';
const world: WorldFile = JSON.parse(readFileSync(join(GEN, 'world.json'), 'utf8'));
const SC = world.scale ?? 1; // 世界放大倍数：参数 x y w h 始终是原 5m/格 坐标（与卫星/蓝图一致）
const PX = JSON.parse(readFileSync(join(DATA, 'geo.json'), 'utf8')).parallax ?? {};
const parAt = (cx: number): [number, number] => { let p: [number, number] = PX.perFloor ?? [0, 0]; for (const r of PX.regions ?? []) if (cx >= r.xMin) p = r.perFloor; return p; };
const satFile = join(CACHE, `${name}_sat.png`), ourFile = join(CACHE, `${name}_our.png`);

await renderView({
  x, y, w, h, scale: s, out: satFile,
  overlaySvg: (px, py, sc) => {
    let o = '';
    for (const b of world.buildings) {
      const seen = new Set<string>();
      for (const wg of b.wings) {
        const k = JSON.stringify(wg.block); if (seen.has(k)) continue; seen.add(k);
        const par = parAt(wg.block.x / SC + wg.block.w / SC / 2), dx = par[0] * wg.f, dy = par[1] * wg.f;
        const bx = wg.block.x / SC + dx, by = wg.block.y / SC + dy;
        o += `<rect x="${px(bx)}" y="${py(by)}" width="${(wg.block.w / SC) * sc}" height="${(wg.block.d / SC) * sc}" fill="none" stroke="#ff2dd0" stroke-width="2"/>`;
      }
    }
    return o;
  },
});
const r = spawnSync('npx', ['tsx', 'tools/reference/render-world.ts', String(s / (16 * SC)), String(x * SC), String(y * SC), String(w * SC), String(h * SC)], { cwd: ROOT, env: { ...process.env, OUT: ourFile, FOOT: '1' }, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
const W = w * s, H = h * s;
await sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#000' } })
  .composite([{ input: satFile, left: 0, top: 0 }, { input: ourFile, left: W + 8, top: 0 }]).png().toFile(join(CACHE, `${name}.png`));
console.log('->', join(CACHE, `${name}.png`));
