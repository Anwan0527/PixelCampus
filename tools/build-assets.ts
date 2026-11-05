/** 一键重建所有生成资源：人物 -> 世界（地面/建筑/对象/碰撞）。 npm run assets */
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.ts';
for (const s of ['tools/art/index.ts', 'tools/world/compile.ts', 'tools/world/interiors.ts', 'tools/mons/build-art.ts', 'tools/mons/cat-art.ts']) {
  const r = spawnSync('npx', ['tsx', s], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
