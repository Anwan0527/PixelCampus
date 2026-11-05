/** 把卫星图按世界 tile 网格裁成带坐标格线的视图，用于描图与蓝图叠加校验。 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { satPxPerTile, tileToSat, WORLD } from './geo.ts';

const SAT_FILE = fileURLToPath(new URL('../../.cache/satellite_z18.png', import.meta.url));

export interface ViewOpts {
  x: number; y: number; w: number; h: number;   // tile 矩形
  scale?: number;                                // 每 tile 的输出像素
  overlaySvg?: (px: (tx: number) => number, py: (ty: number) => number, scale: number) => string; // 叠加内容（蓝图）
  grid?: boolean;
  out: string;
}

export async function renderView(o: ViewOpts) {
  const s = o.scale ?? 9;
  const [sx, sy] = tileToSat(o.x, o.y);
  const sw = o.w * satPxPerTile, sh = o.h * satPxPerTile;
  const left = Math.max(0, Math.round(sx)), top = Math.max(0, Math.round(sy));
  const base = sharp(SAT_FILE).extract({ left, top, width: Math.round(sw), height: Math.round(sh) })
    .resize(o.w * s, o.h * s, { kernel: 'lanczos3' });
  const W = o.w * s, H = o.h * s;
  const px = (tx: number) => (tx - o.x) * s, py = (ty: number) => (ty - o.y) * s;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Menlo,monospace" font-size="11">`;
  if (o.grid !== false) {
    for (let tx = Math.ceil(o.x / 5) * 5; tx <= o.x + o.w; tx += 5) {
      const major = tx % 10 === 0;
      svg += `<line x1="${px(tx)}" y1="0" x2="${px(tx)}" y2="${H}" stroke="${major ? '#ffe600' : '#ffffff'}" stroke-opacity="${major ? 0.55 : 0.22}" stroke-width="1"/>`;
      if (major) svg += `<text x="${px(tx) + 2}" y="11" fill="#ffe600" stroke="#000" stroke-width="2.5" paint-order="stroke">${tx}</text>`;
    }
    for (let ty = Math.ceil(o.y / 5) * 5; ty <= o.y + o.h; ty += 5) {
      const major = ty % 10 === 0;
      svg += `<line x1="0" y1="${py(ty)}" x2="${W}" y2="${py(ty)}" stroke="${major ? '#ffe600' : '#ffffff'}" stroke-opacity="${major ? 0.55 : 0.22}" stroke-width="1"/>`;
      if (major) svg += `<text x="2" y="${py(ty) - 2}" fill="#ffe600" stroke="#000" stroke-width="2.5" paint-order="stroke">${ty}</text>`;
    }
    for (let tx = Math.ceil(o.x / 20) * 20; tx <= o.x + o.w; tx += 20)
      for (let ty = Math.ceil(o.y / 20) * 20; ty <= o.y + o.h; ty += 20)
        svg += `<text x="${px(tx) + 3}" y="${py(ty) + 12}" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke" font-size="10">${tx},${ty}</text>`;
  }
  if (o.overlaySvg) svg += o.overlaySvg(px, py, s);
  svg += '</svg>';
  await base.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(o.out);
}

export const WORLD_SIZE = { w: WORLD.widthTiles, h: WORLD.heightTiles };
