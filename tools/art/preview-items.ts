/** 看图：把一批物品图标拼成一张大图（npx tsx tools/art/preview-items.ts [前缀...]，不带参数 = 钓鱼 2.0 新增的全部），输出到 .cache/preview/items.png */
import { Img } from './px.ts';
import { buildItemIcon, ICONS } from './items.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const prefixes = process.argv.slice(2);
const ids = Object.keys(ICONS).filter((id) => (prefixes.length ? prefixes.some((p) => id.startsWith(p)) : /^(rod_|bait_|tk_|box_|relic_|dragon_scale|pearl|fish_)/.test(id)));
const cols = 12, cell = 22, rows = Math.ceil(ids.length / cols);
const sheet = new Img(cols * cell + 4, rows * cell + 4);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x + y) % 2 ? [182, 214, 120, 255] : [170, 204, 110, 255]);
ids.forEach((id, n) => sheet.blit(buildItemIcon(id), 2 + (n % cols) * cell + 2, 2 + Math.floor(n / cols) * cell + 2));
await sheet.savePreview(join(CACHE, 'preview', 'items.png'), 5);
console.log(ids.length, '个图标：', ids.join(' '));
