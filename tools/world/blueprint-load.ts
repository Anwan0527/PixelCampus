/** 读取并合并 data/campus 下的蓝图文件（按文件名排序）。 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../paths.ts';
import { existsSync } from 'node:fs';
import { emptyManual, validateManual, validateBaked, type ManualFile, type BakedFile } from '../../src/shared/manual.ts';
import type { Terrain, BuildingDef, Poi, Shape, Scatter, Block } from '../../src/shared/blueprint.ts';

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

function osmRoads(): Record<number, [number, number][]> {
  const f = join(DATA, 'osm-roads.json');
  try { return Object.fromEntries((readJson<{ id: number; pts: [number, number][] }[]>(f)).map((r) => [r.id, r.pts])); }
  catch { throw new Error('缺少 data/campus/osm-roads.json，请先运行 `npx tsx tools/reference/osm-roads.ts`'); }
}

/** 蓝图条目的稳定 id：文件名#类型序号:内容指纹。文件里的内容改了，旧 id 就对不上（手动层里引用它的"去掉/修改"自动失效，不会误伤别的条目） */
function fnv(str: string): string { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
const bpId = (file: string, kind: 's' | 'c', i: number, o: unknown) => `${file.replace(/\.json$/, '')}#${kind}${i}:${fnv(JSON.stringify(o))}`;
const WALLISH = new Set(['wallH', 'wallV', 'fenceH', 'fenceV', 'pier', 'railV']);
/** 地图编辑器里能看到、能改的蓝图条目分几类（按文件和种类）；其余的（树列、灌木、车位…）编辑器不暴露 */
export function bpCategory(id: string, e: { kind: string; prop?: string }): 'sports' | 'fence' | 'road' | 'plaza' | 'green' | null {
  const file = id.split('#')[0];
  if (e.kind === 'fence' || (e.kind === 'prop' && e.prop && WALLISH.has(e.prop))) return 'fence';
  if (e.kind === 'prop' || e.kind === 'at' || e.kind === 'row' || e.kind === 'cluster' || e.kind === 'grove' || e.kind === 'ring' || e.kind === 'label' || e.kind === 'interact' || e.kind === 'cars') return null;
  if (/^(40|45)-/.test(file)) return 'sports';
  if (/^(20|21|25|26)-/.test(file)) return 'road';
  if (/^(30|31|32|33|34|35)-/.test(file)) return 'plaza';
  if (/^(05|07|12|36)-/.test(file)) return 'green';
  return null;
}

export function loadTerrain(): Terrain {
  const roads = osmRoads();
  const dir = join(DATA, 'terrain');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const t: Terrain = { shapes: [], scatter: [], blocks: [], bounds: { x: 0, y: 0, w: 352, h: 272 } };
  for (const f of files) {
    const j = readJson<Partial<Terrain>>(join(dir, f));
    if (j.bounds) t.bounds = j.bounds;
    ((j.shapes ?? []) as Shape[]).forEach((sh, si) => {
      sh.bp = bpId(f, 's', si, sh);
      if (sh.kind === 'stroke' && sh.osm !== undefined) {
        const way = roads[sh.osm];
        if (!way) throw new Error(`OSM way ${sh.osm} 不在 osm-roads.json 中`);
        sh.pts = sh.osmSlice ? way.slice(sh.osmSlice[0], sh.osmSlice[1] + 1) : way;
      }
      t.shapes.push(sh);
    });
    ((j.scatter ?? []) as Scatter[]).forEach((e, ci) => { e.bp = bpId(f, 'c', ci, e); t.scatter.push(e); });
    t.blocks.push(...((j.blocks ?? []) as Block[]));
  }
  return t;
}
export function loadBuildings(): BuildingDef[] {
  const dir = join(DATA, 'buildings');
  const out: BuildingDef[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) out.push(...readJson<BuildingDef[]>(join(dir, f)));
  const ids = new Set<string>();
  for (const b of out) { if (ids.has(b.id)) throw new Error(`重复的建筑 id: ${b.id}`); ids.add(b.id); }
  return out;
}
export function loadPois(): Poi[] { return readJson<Poi[]>(join(DATA, 'pois.json')); }
export function loadGeo() { return readJson<any>(join(DATA, 'geo.json')); }

/** 手动层（地图编辑器保存的 data/campus/manual.json）；没有这个文件就是空的。不合法直接报错，别带着坏数据编译 */
export function loadManual(): ManualFile {
  const f = process.env.MANUAL_FILE ?? join(DATA, 'manual.json'); // MANUAL_FILE：测试时换一个手动层文件
  if (!existsSync(f)) return emptyManual();
  const j = readJson<ManualFile>(f);
  const errs = validateManual(j);
  if (errs.length) throw new Error(`data/campus/manual.json 不合法：\n${errs.slice(0, 10).join('\n')}`);
  return j;
}

/** 已部署并入基础地图的各层（data/campus/baked.json，由 tools/editor/bake.ts 在部署后追加）；没有这个文件就是空的 */
export function loadBaked(): BakedFile['layers'] {
  const f = process.env.BAKED_FILE ?? join(DATA, 'baked.json'); // BAKED_FILE：测试时换一个文件
  if (!existsSync(f)) return [];
  const j = readJson<BakedFile>(f);
  const errs = validateBaked(j);
  if (errs.length) throw new Error(`data/campus/baked.json 不合法：\n${errs.slice(0, 10).join('\n')}`);
  return j.layers;
}
