/** 与地图无关的美术：人物、小猫、共享单车、物品图标图集。 npm run assets:art */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANIMS, buildAll, frameMeta, LIE_META, PRESET_LOOKS, renderPortrait } from './char-rig.ts';
import { buildHeld } from '../../src/art/held.ts';
import { pack, type PackItem } from './pack.ts';
import { GEN } from '../paths.ts';
import { CAT_ANIMS, CAT_FRAME, CAT_FRONT_ANIMS, CAT_PRESETS, renderCat, renderCatFront } from './cat-rig.ts';
import { BIRD_ANIMS, BIRD_FRAME, BIRD_LOOKS, renderBird } from './birds.ts';
import { buildBikes, BIKE_AX, BIKE_AY, BIKE_H, BIKE_W, RIDER } from './bikes.ts';
import { buildItemIcon, ICONS } from './items.ts';

const items: PackItem[] = [];
{
  // 人物：12 个预置造型 × Rig 动作（待机/走/跑/挥手/欢呼/跳舞/思考/大笑/难过/坐），地图用 1 倍分辨率
  const M = frameMeta(1);
  PRESET_LOOKS.forEach((look, n) => { for (const [k, img] of Object.entries(buildAll(look, 1))) items.push({ key: `c${n}_${k}`, img }); });
  const atlas = pack(items, 1024);
  // 旧版帧名 c{n}_{dir}_0（站立帧）保留为别名，指向待机第 0 帧：学生证头像、行人初始帧等都在用
  PRESET_LOOKS.forEach((_, n) => { for (const d of ['down', 'up', 'left', 'right']) atlas.json.frames[`c${n}_${d}_0`] = atlas.json.frames[`c${n}_idle_${d}_0`]; });
  await atlas.img.save(join(GEN, 'atlas-chars.png'));
  writeFileSync(join(GEN, 'atlas-chars.json'), JSON.stringify(atlas.json));
  const anims = Object.fromEntries(ANIMS.map((a) => [a.id, { fps: a.fps, loop: a.loop, n: a.frames.length, views: a.views.flatMap((v) => (v === 'right' ? ['right', 'left'] : [v])) }]));
  writeFileSync(join(GEN, 'chars-meta.json'), JSON.stringify({ w: M.w, h: M.h, ax: M.ax, ay: M.ay, lie: LIE_META, count: PRESET_LOOKS.length, anims }));
  console.log('人物图集完成：', PRESET_LOOKS.length, '个外观，', items.length, '帧，每帧', M.w, '×', M.h);
}

// 证件照（学生证 / 头像 / 资料卡）：2 倍分辨率的半身像，透明底，p{n}_neutral / p{n}_smile
{
  const ps: PackItem[] = [];
  PRESET_LOOKS.forEach((look, n) => { for (const expr of ['neutral', 'smile'] as const) ps.push({ key: `p${n}_${expr}`, img: renderPortrait(look, { bg: null, expr }) }); });
  const a = pack(ps, 512);
  await a.img.save(join(GEN, 'atlas-portraits.png'));
  writeFileSync(join(GEN, 'atlas-portraits.json'), JSON.stringify(a.json));
  console.log('证件照图集完成：', ps.length, '张');
}

// 手持物（书/奶茶/咖啡/手机/篮球/相机）
{
  const hs = Object.entries(buildHeld()).map(([key, img]): PackItem => ({ key, img }));
  const a = pack(hs, 256);
  await a.img.save(join(GEN, 'atlas-held.png'));
  writeFileSync(join(GEN, 'atlas-held.json'), JSON.stringify(a.json));
  console.log('手持物图集完成：', hs.length, '帧');
}

// 小猫（游戏里现有小猫的毛色编号不变）× Rig 动作；全部 20 种毛色用 CATS_ALL=1 生成（做图鉴时用）
{
  const coats = CAT_PRESETS.length;
  const cats: PackItem[] = [];
  for (let c = 0; c < coats; c++) {
    const look = CAT_PRESETS[c].look;
    for (const a of CAT_ANIMS) a.frames.forEach((p, i) => cats.push({ key: `cat${c}_${a.id}_${i}`, img: renderCat(look, p).img }));
    for (const a of CAT_FRONT_ANIMS) a.frames.forEach((p, i) => cats.push({ key: `cat${c}_${a.id}_${i}`, img: renderCatFront(look, p, a.back).img }));
  }
  const a = pack(cats, 2048); // 图集高度要 ≤ 4096（老手机显卡的纹理上限），之前 1024 宽排出来 4142 高，超限的设备上小猫会变成黑方块
  for (let c = 0; c < coats; c++) for (let i = 0; i < 2; i++) a.json.frames[`cat${c}_sleep_${i}`] = a.json.frames[`cat${c}_sleep_curl_${i}`];   // 旧版帧名
  await a.img.save(join(GEN, 'atlas-cats.png'));
  writeFileSync(join(GEN, 'atlas-cats.json'), JSON.stringify(a.json));
  const anims = Object.fromEntries([...CAT_ANIMS.map((x) => [x.id, { fps: x.fps, loop: x.loop, n: x.frames.length }]), ...CAT_FRONT_ANIMS.map((x) => [x.id, { fps: x.fps, loop: x.loop, n: x.frames.length }])]);
  writeFileSync(join(GEN, 'cats-meta.json'), JSON.stringify({ w: CAT_FRAME.w, h: CAT_FRAME.h, ax: CAT_FRAME.ax, ay: CAT_FRAME.ay, coats, anims }));
  console.log('小猫图集完成：', coats, '种毛色，', cats.length, '帧');
}
// 水禽（精工湖的鸭子和天鹅）：5 种外观 × 侧视 / 正面 / 背面动作
{
  const birds: PackItem[] = [];
  BIRD_LOOKS.forEach((look, k) => { for (const a of BIRD_ANIMS) a.frames.forEach((p, i) => birds.push({ key: `bird${k}_${a.id}_${i}`, img: renderBird(look, p, a.view ?? 'side') })); });
  const a = pack(birds, 1024);
  await a.img.save(join(GEN, 'atlas-birds.png'));
  writeFileSync(join(GEN, 'atlas-birds.json'), JSON.stringify(a.json));
  const anims = Object.fromEntries(BIRD_ANIMS.map((x) => [x.id, { fps: x.fps, loop: x.loop, n: x.frames.length }]));
  writeFileSync(join(GEN, 'birds-meta.json'), JSON.stringify({ w: BIRD_FRAME.w, h: BIRD_FRAME.h, ax: BIRD_FRAME.ax, ay: BIRD_FRAME.ay, kinds: BIRD_LOOKS.length, anims }));
  console.log('水禽图集完成：', BIRD_LOOKS.length, '种外观，', birds.length, '帧');
}
// 共享单车：骑行 4 向 × 4 帧 + 停放
{
  const bikes = Object.entries(buildBikes()).map(([key, img]): PackItem => ({ key, img }));
  const a = pack(bikes, 512);
  await a.img.save(join(GEN, 'atlas-bikes.png'));
  writeFileSync(join(GEN, 'atlas-bikes.json'), JSON.stringify(a.json));
  writeFileSync(join(GEN, 'bikes-meta.json'), JSON.stringify({ w: BIKE_W, h: BIKE_H, ax: BIKE_AX, ay: BIKE_AY, rider: RIDER }));
  console.log('单车图集完成：', bikes.length, '帧');
}
// 物品图标
{
  const items = Object.keys(ICONS).map((id): PackItem => ({ key: `item_${id}`, img: buildItemIcon(id) }));
  const a = pack(items, 256);
  await a.img.save(join(GEN, 'atlas-items.png'));
  writeFileSync(join(GEN, 'atlas-items.json'), JSON.stringify(a.json));
  console.log('物品图集完成：', items.length, '个图标');
}
