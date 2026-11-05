/**
 * 从 OSM Overpass 取校区范围内的 highway，转成世界 tile 坐标，存 data/campus/osm-roads.json。
 * 这是"第二来源"：用于交叉验证蓝图里的道路（OSM 只收录了部分校内主路）。
 * 用法：npx tsx tools/reference/osm-roads.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../paths.ts';
import { lonLatToSat, satToTile } from './geo.ts';

const q = '[out:json][timeout:60];way["highway"](36.6460,114.5780,36.6690,114.6050);out geom;';
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'PixelCampusGame-dev (personal project)' }, body: new URLSearchParams({ data: q }) });
if (!res.ok) throw new Error(`overpass ${res.status}`);
const j: any = await res.json();
const roads = j.elements.map((e: any) => ({
  id: e.id, highway: e.tags.highway, name: e.tags.name ?? null,
  pts: e.geometry.map((p: any) => satToTile(...lonLatToSat(p.lon, p.lat)).map((v) => Math.round(v * 100) / 100)),
}));
writeFileSync(join(DATA, 'osm-roads.json'), JSON.stringify(roads));
console.log('roads:', roads.length);
