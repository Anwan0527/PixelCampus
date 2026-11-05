/** 带格线的卫星局部特写：npx tsx tools/reference/crop.ts <x> <y> <w> <h> [每格像素=14] -> .cache/views/crop.png */
import { renderView } from './views.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';
const a = process.argv.slice(2).map(Number);
await renderView({ x: a[0], y: a[1], w: a[2], h: a[3], scale: a[4] ?? 14, out: join(CACHE, 'views', 'crop.png') });
