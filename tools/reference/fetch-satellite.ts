/**
 * 下载并拼接校区卫星正射图到 .cache/satellite_z18.png（仅作几何参考，不入库、不分发）。
 * 来源：Esri World Imagery（OSM 社区允许其作为描图底图）。仅请求约 270 张瓦片，限速串行。
 * 用法：npm run ref:fetch
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { SAT } from './geo.ts';

const Z = SAT.z;
const OUT = fileURLToPath(new URL('../../.cache/satellite_z18.png', import.meta.url));
// 范围需与 geo.json 的 x0/y0 一致：经纬度 36.6650..36.6480, 114.5800..114.6020
const X0 = SAT.x0, Y0 = SAT.y0, X1 = 214522, Y1 = 102354;

async function exists(p: string) { try { await access(p); return true; } catch { return false; } }

async function main() {
  if (await exists(OUT)) { console.log('已存在，跳过：', OUT); return; }
  await mkdir(fileURLToPath(new URL('../../.cache/', import.meta.url)), { recursive: true });
  const cols = X1 - X0 + 1, rows = Y1 - Y0 + 1;
  const comps: { input: Buffer; left: number; top: number }[] = [];
  for (let ty = Y0; ty <= Y1; ty++) {
    for (let tx = X0; tx <= X1; tx++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty}/${tx}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'PixelCampusGame-dev (personal project)' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      comps.push({ input: Buffer.from(await res.arrayBuffer()), left: (tx - X0) * 256, top: (ty - Y0) * 256 });
    }
    process.stdout.write(`\r行 ${ty - Y0 + 1}/${rows}`);
  }
  const img = sharp({ create: { width: cols * 256, height: rows * 256, channels: 3, background: '#000' } }).composite(comps).png();
  await writeFile(OUT, await img.toBuffer());
  console.log('\n完成', OUT, cols * 256, 'x', rows * 256);
}
main();
