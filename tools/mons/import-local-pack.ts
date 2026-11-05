/**
 * 把本机下载的"图鉴素材包"（参考资料/pokedex-main）转成精灵内容包 data/mons/packs/local-pokedex/。
 *   用法：npx tsx tools/mons/import-local-pack.ts [素材包目录]
 * 本地包只放本机：目录已在 .gitignore，deploy.sh 发现构建产物里带 mons/local-* 会中止部署。
 * 转换内容：
 *   - pokemon.json → species.json（精简字段；种族值拆成数组；捕捉率转成 0~1 的小数；进化链转成物种 id 列表）
 *   - 文本里的"宝可梦"三个字一律替换成"精灵"（原文件不改，只改转换后的副本）
 *   - 复制 96×96 的正面/背面/闪光精灵图到 sprites/（不复制 gif 与大图）
 *   - 复制 18 属性相克表（data/mons/typechart-18.json）作为本包的 elements.json
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../paths';

const SRC = process.argv[2] ?? join(ROOT, '参考资料', 'pokedex-main');
const OUT = join(ROOT, 'data', 'mons', 'packs', 'local-pokedex');

interface Raw {
  id: number; name: string; name_en: string; height: number; weight: number; type1: string; type2: string;
  ability1: string; ability2: string; abilityHide: string; ability1_desc: string; ability2_desc: string; abilityHide_desc: string;
  generation: number; catchRate: string; desc: string; chain: string; stat: string;
}

/** 替换品牌词：句子里直接删掉会读不通，所以换成本项目的叫法"精灵" */
export const scrub = (s: string): string => s.replaceAll('宝可梦', '精灵');
const sid = (no: number) => `n${String(no).padStart(3, '0')}`;

function main() {
  if (!existsSync(join(SRC, 'pokemon.json'))) { console.error(`✗ 找不到 ${join(SRC, 'pokemon.json')}`); process.exit(1); }
  const raw = JSON.parse(readFileSync(join(SRC, 'pokemon.json'), 'utf8')) as Raw[];
  const species = raw.map((r) => {
    const base = r.stat.split(',').map(Number);
    if (base.length !== 6 || base.some((n) => !Number.isFinite(n))) throw new Error(`种族值异常：#${r.id} ${r.stat}`);
    const abilities = [[r.ability1, r.ability1_desc], [r.ability2, r.ability2_desc], [r.abilityHide, r.abilityHide_desc]]
      .filter(([n]) => n && n !== '-').map(([n, d]) => ({ name: scrub(n), desc: scrub(d || '') }));
    return {
      id: sid(r.id), no: r.id, name: scrub(r.name), nameEn: r.name_en, gen: r.generation,
      types: [r.type1, r.type2].filter((t) => t && t !== '-'),
      base, catch: Math.max(0.005, parseFloat(r.catchRate) / 100 || 0.059),
      height: r.height, weight: r.weight, desc: scrub(r.desc),
      chain: r.chain.split(',').map((n) => sid(Number(n))), abilities,
    };
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'species.json'), JSON.stringify(species));
  const tc = JSON.parse(readFileSync(join(ROOT, 'data', 'mons', 'typechart-18.json'), 'utf8')) as { order: string[]; chart: Record<string, Record<string, number>> };
  writeFileSync(join(OUT, 'elements.json'), JSON.stringify({ id: 'local-pokedex', name: '本地包（18 属性）', normal: '一般', elements: tc.order.map((id) => ({ id, name: id, color: '#888888' })), chart: tc.chart }, null, 1));
  let copied = 0;
  for (const [from, to] of [['forward', 'front'], ['back', 'back'], ['shiny-forward', 'shiny-front'], ['shiny-back', 'shiny-back']] as const) {
    mkdirSync(join(OUT, 'sprites', to), { recursive: true });
    for (const r of raw) {
      const f = join(SRC, 'images', 'sprite', from, `${r.id}.png`);
      if (existsSync(f)) { copyFileSync(f, join(OUT, 'sprites', to, `${sid(r.id)}.png`)); copied++; }
    }
  }
  const left = JSON.stringify(species).includes('宝可梦');
  writeFileSync(join(OUT, 'pack.json'), JSON.stringify({ id: 'local-pokedex', kind: 'local', note: '本机素材包转换而来，仅供本机开发；不入库、不部署', species: species.length, sprites: copied }, null, 1));
  console.log(`✓ ${species.length} 个物种，${copied} 张精灵图 → ${OUT}；转换后文本里残留"宝可梦"：${left ? '有！' : '无'}`);
}
if (process.argv[1]?.endsWith('import-local-pack.ts')) main();
