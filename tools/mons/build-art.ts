/**
 * 把开放包精灵的美术（data/mons/art/ 里的 Zoonami CC0 怪物包）整理成游戏用的文件：
 *   public/assets/generated/mons/<物种id>-front.png / -back.png / -front-alt.png / -back-alt.png（64×64）
 * 只处理开放包；本地包（data/mons/packs/local-*）不在这里生成，所以不会进构建产物、不会被部署。
 *   用法：npx tsx tools/mons/build-art.ts      （npm run assets 会自动调用）
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEN, ROOT } from '../paths';

const SRC = join(ROOT, 'data', 'mons', 'art', 'zoonami-50-monsters-2d', 'Monsters');
const OUT = join(GEN, 'mons');
const species = JSON.parse(readFileSync(join(ROOT, 'data', 'mons', 'packs', 'open', 'species.json'), 'utf8')) as { id: string; art: { pack: string; n: number } }[];

mkdirSync(OUT, { recursive: true });
let n = 0;
for (const s of species) {
  for (const side of ['Front', 'Back'] as const) {
    for (const alt of [false, true]) {
      const from = join(SRC, alt ? 'Alternative Colors' : 'Normal Colors', `Monster #${s.art.n} ${side} ${alt ? 'Alternative' : 'Normal'} Color Palette.png`);
      if (!existsSync(from)) throw new Error(`缺少精灵图：${from}`);
      copyFileSync(from, join(OUT, `${s.id}-${side.toLowerCase()}${alt ? '-alt' : ''}.png`)); n++;
    }
  }
}
console.log(`✓ 精灵美术：${species.length} 只，${n} 张 → ${OUT}`);
