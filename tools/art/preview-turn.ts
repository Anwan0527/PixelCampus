/**
 * 看图：把能转向的家具每个朝向并排画出来（npx tsx tools/art/preview-turn.ts [k1,k2,…] [输出名]），输出到 .cache/preview/<输出名，默认 turn>.png（放大 4 倍）。
 * 每一行：精灵名 | 0（原图）| 90 | 180 | 270；灰色方框 = 脚印（转向后的占地），用来核对精灵和格子对得上。
 */
import { Img } from './px.ts';
import { join } from 'node:path';
import { CACHE } from '../paths.ts';
import { TURN_VIEWS } from './turn.ts';
import { FURNITURE } from './furniture.ts';
import { OFFICE_FURNITURE } from './furniture-office.ts';
import { DORM_FURNITURE } from './furniture-dorm.ts';
import { DECOR_FURNITURE } from './furniture-decor.ts';
import { rotInfo } from '../../src/shared/interior.ts';

const ALL = { ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE };
const only = process.argv[2]?.split(',');
const keys = Object.keys(TURN_VIEWS).filter((k) => !only || only.includes(k));
const cell = 80, pad = 4, rows = keys.length;
const sheet = new Img(cell * 4 + pad * 5, Math.max(1, rows) * (cell + pad) + pad);
for (let j = 0; j < sheet.h; j++) for (let i = 0; i < sheet.w; i++) sheet.set(i, j, ((i >> 3) + (j >> 3)) & 1 ? [200, 170, 130, 255] : [190, 160, 120, 255]);
keys.forEach((k, row) => {
  const views = TURN_VIEWS[k], base = (views[0] ?? ALL[k])();
  ([0, 90, 180, 270] as const).forEach((r, col) => {
    const f = r === 0 ? base : views[r]?.(); if (!f) return;
    const ri = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 0), ox = pad + col * (cell + pad) + 8, oy = pad + row * (cell + pad) + cell - f.img.h - 6;
    // 脚印框
    for (let x = 0; x < ri.fw * 16; x++) { sheet.set(ox + ri.mx + x, oy + ri.my, [255, 255, 255, 120]); sheet.set(ox + ri.mx + x, oy + ri.my + ri.fh * 16 - 1, [255, 255, 255, 120]); }
    for (let y = 0; y < ri.fh * 16; y++) { sheet.set(ox + ri.mx, oy + ri.my + y, [255, 255, 255, 120]); sheet.set(ox + ri.mx + ri.fw * 16 - 1, oy + ri.my + y, [255, 255, 255, 120]); }
    sheet.blit(f.img, ox, oy);
  });
});
const out = process.argv[3] ?? 'turn'; // 几个人同时看图时各用各的输出名，免得互相覆盖
await sheet.savePreview(join(CACHE, 'preview', `${out}.png`), 4);
console.log(keys.join(' '));
