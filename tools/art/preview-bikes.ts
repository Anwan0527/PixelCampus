import { Img } from './px.ts';
import { buildBikes, BIKE_AX, BIKE_AY, RIDER } from './bikes.ts';
import { buildCharacter, LOOKS } from './characters.ts';
import { PAL } from './palette.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const bikes = buildBikes();
const cell = 40, rows = 3;
const sheet = new Img(cell * 16 + 8, 48 * rows + 8);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (x + y * 2) % 13 === 0 ? PAL.grass[3] : PAL.grass[2]);
// 第 1 行：4 个朝向 × 4 帧 骑行合成（骑手 look 0 / 1 / 3 轮换）
[0, 1, 3].forEach((lk, r) => {
  const ch = buildCharacter(LOOKS[lk]);
  ['down', 'up', 'left', 'right'].forEach((d, di) => {
    for (let f = 0; f < 4; f++) {
      const ox = 4 + (di * 4 + f) * cell + 6, oy = 4 + r * 48 + 6; // 脚点位置
      const fy = oy + 26;
      const back = bikes[`bike_${d}_${f}`];
      sheet.blit(back, ox + 15 - BIKE_AX, fy - BIKE_AY);
      const fr = ch.frames[`${d}_0`];
      const rider = fr.crop(0, 0, fr.w, RIDER.crop);
      sheet.blit(rider, ox + 15 - ch.ax + RIDER.dx[d as 'down'], fy - (ch.ay + 1) - RIDER.dy);
      if (d === 'down') sheet.blit(bikes[`bikef_down_${f}`], ox + 15 - BIKE_AX, fy - BIKE_AY);
    }
  });
});
// 停放的车
sheet.blit(bikes['bike_parked_r'], 4, 4 + 3 * 48 - 40);
await sheet.savePreview(join(CACHE, 'preview', 'bikes.png'), 5);
await bikes['bike_parked_r'].savePreview(join(CACHE, 'preview', 'bike-parked.png'), 12, '#66ad45');
console.log('char frame', buildCharacter(LOOKS[0]).frames['down_0'].w, buildCharacter(LOOKS[0]).frames['down_0'].h, 'ay', buildCharacter(LOOKS[0]).ay);
