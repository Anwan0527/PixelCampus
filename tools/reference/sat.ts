/** 只出卫星特写（带格线，每 5 格一条）：npx tsx tools/reference/sat.ts <x> <y> <w> <h> <每格像素> <名> -> .cache/<名>.png */
import { renderView } from './views.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';
const [x, y, w, h, s] = process.argv.slice(2, 7).map(Number);
await renderView({ x, y, w, h, scale: s, out: join(CACHE, `${process.argv[7] ?? 'sat'}.png`) });
