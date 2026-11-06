/**
 * 宿舍装饰家具（商店里卖的，目录在 src/shared/decor.ts）：书桌/长桌、电竞椅、懒人沙发、鞋柜、衣帽架、电视柜、鱼缸、落地灯、大熊、吉他、
 * 四块地毯、挂钟/风景画/竖幅画/校旗/海报、台灯和仙人掌。
 * 约定同 furniture.ts：脚印 fw×fh（tile，16px）= 精灵底部的 fw*16 × fh*16；精灵可以向上超出脚印；fh = 0 的是墙面挂件。
 * 画完统一描边（描边会让图四周各多 1px）。
 */
import { Img, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const c = (s: string): RGBA => hex(s);
const LT: RGBA[] = ['#b98350', '#d6a56c', '#e8c288', '#f6e0b0'].map(c); // 浅色木头
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });

/** 干净的浅色木桌（桌面空着，给小件用）：桌面 + 前沿 + 两条腿；比脚印往上高出 14px */
function cleanTable(fw: number, fh: number): Furn {
  const w = fw * 16, h = fh * 16 + 14, img = new Img(w, h);
  img.rect(0, 0, w, h - 10, LT[2]); img.hline(0, 0, w, LT[3]); img.hline(0, 1, w, LT[3]);
  for (let x = 7; x < w - 2; x += 11) img.vline(x, 3, h - 16, LT[1]);
  img.rect(0, h - 10, w, 5, LT[1]); img.hline(0, h - 10, w, LT[3]); img.hline(0, h - 6, w, LT[0]);
  img.rect(2, h - 5, 3, 5, W[1]); img.rect(w - 5, h - 5, 3, 5, W[1]); img.rect(w / 2 - 1, h - 5, 3, 4, W[0]);
  return f(img, fw, fh);
}

/** 电竞椅：黑色高靠背带红边，五星脚 */
function gamechair(): Furn {
  const img = new Img(16, 24), K = [c('#2b2e38'), c('#3d4252'), c('#565d70')], R = [c('#a8322a'), c('#d4483c')];
  img.rect(3, 0, 10, 13, K[1]); img.rect(3, 0, 10, 2, R[1]); img.vline(3, 2, 11, R[0]); img.vline(12, 2, 11, R[0]); img.rect(6, 4, 4, 5, K[2]); img.hline(4, 2, 8, K[0]);
  img.rect(1, 11, 3, 5, K[0]); img.rect(12, 11, 3, 5, K[0]); // 扶手
  img.rect(2, 13, 12, 6, K[2]); img.hline(2, 13, 12, c('#7a8299')); img.hline(2, 18, 12, K[0]);
  img.rect(7, 19, 2, 3, M[1]); img.hline(2, 22, 12, M[1]); img.set(2, 23, M[0]); img.set(13, 23, M[0]); img.set(7, 23, M[0]); img.set(8, 23, M[0]);
  return f(img, 1, 1);
}
/** 懒人沙发：橙色的软团 */
function beanbag(): Furn {
  const img = new Img(16, 14), O = [c('#b8601e'), c('#e08a2e'), c('#f4b25a'), c('#fbd48a')];
  img.ellipse(8, 8, 7.5, 5.5, O[1]); img.ellipse(8, 5, 6, 3.5, O[2]); img.ellipse(7, 4, 3, 1.5, O[3]);
  img.hline(2, 12, 12, O[0]); img.hline(3, 13, 10, O[0]); img.vline(8, 5, 5, O[0]); img.set(5, 9, O[0]); img.set(11, 9, O[0]);
  return f(img, 1, 1);
}
/** 鞋柜（2×1）：浅木柜，两扇门 + 把手，柜面上一盆小草 */
function shoebox(): Furn {
  const img = new Img(32, 24);
  img.rect(0, 6, 32, 18, LT[1]); img.rect(0, 6, 32, 3, LT[3]); img.hline(0, 9, 32, LT[0]);
  for (let i = 0; i < 2; i++) { const x = 2 + i * 15; img.rect(x, 11, 13, 10, LT[2]); img.hline(x, 11, 13, LT[3]); img.hline(x, 20, 13, LT[0]); img.rect(i ? x + 2 : x + 10, 15, 1, 3, W[1]); }
  img.rect(2, 22, 3, 2, W[0]); img.rect(27, 22, 3, 2, W[0]);
  img.rect(22, 3, 6, 4, c('#a05a3a')); img.rect(23, 0, 4, 4, PAL.leaf[3]); img.set(24, 0, PAL.leaf[5]); img.set(26, 1, PAL.leaf[1]); // 小草
  img.rect(5, 4, 8, 2, c('#d8d8e0')); img.rect(5, 3, 5, 1, c('#e86a6a')); // 一双鞋
  return f(img, 2, 1);
}
/** 衣帽架：一根立杆、三个钩子，挂着藏青外套和一顶红帽子 */
function coatrack(): Furn {
  const img = new Img(16, 36);
  img.rect(7, 3, 2, 31, W[2]); img.vline(7, 3, 31, W[3]); img.rect(4, 32, 8, 2, W[1]); img.hline(4, 32, 8, W[3]); img.rect(3, 34, 10, 2, W[0]);
  img.hline(4, 3, 8, W[2]); img.set(4, 2, W[2]); img.set(11, 2, W[2]); img.hline(5, 8, 6, W[2]);
  img.rect(10, 5, 5, 3, c('#c4503c')); img.rect(11, 3, 3, 3, c('#d4483c')); img.hline(10, 7, 5, c('#8a2a22')); // 帽子
  img.rect(0, 9, 7, 17, c('#2f4a7a')); img.rect(0, 9, 7, 2, c('#3f5f98')); img.vline(6, 11, 15, c('#223a62')); img.set(3, 14, c('#e0c050')); img.set(3, 18, c('#e0c050')); // 外套
  return f(img, 1, 1);
}
/** 电视柜（2×1）：黑色电视机放在木柜上，屏幕里是彩条 */
function tv(): Furn {
  const img = new Img(32, 34), K = c('#23262f');
  img.rect(2, 0, 28, 21, K); img.rect(3, 1, 26, 18, c('#4a78b0'));
  const bars = ['#e8584a', '#f2c230', '#58b24d', '#3f9ad8', '#8a5aa8', '#e8e4da'].map(c);
  for (let i = 0; i < 6; i++) img.rect(3 + i * 4, 1, 4, 14, bars[i]);
  img.rect(3, 15, 26, 4, c('#2a3a5a')); img.hline(3, 1, 26, c('#bcd8f0')); img.rect(24, 19, 3, 1, c('#58d058')); // 电源灯
  img.rect(12, 21, 8, 2, K);
  img.rect(0, 23, 32, 11, LT[1]); img.rect(0, 23, 32, 2, LT[3]); img.hline(0, 25, 32, LT[0]);
  img.rect(2, 27, 13, 6, LT[2]); img.rect(17, 27, 13, 6, LT[2]); img.rect(13, 29, 2, 2, W[1]); img.rect(17, 29, 2, 2, W[1]);
  return f(img, 2, 1);
}
/** 观赏鱼缸（2×1）：木柜上一只带灯的大玻璃缸，里面有沙、水草和两条小金鱼 */
function tank(): Furn {
  const img = new Img(32, 34);
  img.rect(0, 0, 32, 4, M[1]); img.hline(0, 0, 32, M[3]); img.rect(4, 3, 24, 1, c('#fff2c0')); // 灯条
  img.rect(0, 4, 32, 20, c('#a8d8ec')); img.rect(1, 5, 30, 18, c('#4a98c8')); img.rect(1, 5, 30, 3, c('#6fb8e0')); img.hline(2, 12, 8, c('#9ad4f0')); img.hline(18, 16, 10, c('#9ad4f0'));
  img.rect(1, 20, 30, 3, c('#d8c08a')); img.hline(1, 20, 30, c('#ecd9a8')); // 沙
  for (const x of [4, 26]) { img.vline(x, 12, 8, PAL.leaf[3]); img.vline(x + 1, 14, 6, PAL.leaf[2]); img.vline(x - 1, 15, 5, PAL.leaf[4]); }
  const fish = (x: number, y: number, flip: boolean) => { img.rect(x, y, 5, 3, c('#f08a2a')); img.set(flip ? x + 5 : x - 1, y + 1, c('#f08a2a')); img.set(flip ? x + 5 : x - 1, y, c('#e0601a')); img.set(flip ? x + 1 : x + 3, y, c('#2a1f2e')); };
  fish(10, 9, false); fish(20, 14, true);
  img.set(15, 18, c('#d8f0ff')); img.set(16, 16, c('#d8f0ff'));
  img.rect(0, 24, 32, 10, LT[1]); img.rect(0, 24, 32, 2, LT[3]); img.hline(0, 26, 32, LT[0]);
  img.rect(2, 28, 13, 5, LT[2]); img.rect(17, 28, 13, 5, LT[2]);
  return f(img, 2, 1);
}
/** 落地灯：暖黄灯罩 + 细杆 + 圆底 */
function lamp(): Furn {
  const img = new Img(16, 36), Y = [c('#e8b84a'), c('#f6d66a'), c('#fff0a8')];
  img.rect(4, 0, 8, 3, Y[1]); img.rect(3, 3, 10, 4, Y[1]); img.rect(2, 7, 12, 4, Y[0]); img.hline(4, 0, 8, Y[2]); img.vline(5, 1, 9, Y[2]); img.hline(2, 10, 12, c('#b8902a'));
  img.rect(7, 11, 2, 21, M[2]); img.vline(7, 11, 21, M[3]); img.rect(4, 32, 8, 2, M[1]); img.hline(4, 32, 8, M[3]); img.rect(5, 34, 6, 2, M[0]);
  return f(img, 1, 1);
}
/** 大熊玩偶：坐着的棕熊，脖子上系一个红领结 */
function bear(): Furn {
  const img = new Img(16, 20), B = [c('#7a4a2a'), c('#a06a3e'), c('#c48a56'), c('#e0b078')];
  img.ellipse(4, 4, 2.4, 2.4, B[1]); img.ellipse(12, 4, 2.4, 2.4, B[1]); img.set(4, 4, B[3]); img.set(12, 4, B[3]);
  img.ellipse(8, 8, 6, 5.4, B[2]); img.ellipse(8, 10, 3, 2.2, B[3]);
  img.set(5, 7, c('#2a1f2e')); img.set(11, 7, c('#2a1f2e')); img.set(8, 9, c('#2a1f2e')); img.hline(7, 11, 3, B[0]);
  img.ellipse(8, 16, 6, 3.6, B[2]); img.rect(2, 16, 3, 3, B[1]); img.rect(11, 16, 3, 3, B[1]); img.rect(5, 18, 2, 2, B[1]); img.rect(9, 18, 2, 2, B[1]);
  img.rect(6, 13, 4, 2, c('#d4483c')); img.set(5, 13, c('#d4483c')); img.set(10, 13, c('#d4483c')); img.set(8, 13, c('#8a2a22'));
  return f(img, 1, 1);
}
/** 吉他：靠着立在地上，红棕色琴身、深色指板 */
function guitar(): Furn {
  const img = new Img(16, 32), G = [c('#7a3a1e'), c('#a85a2a'), c('#d4803c'), c('#f0a860')];
  img.rect(7, 0, 3, 3, c('#2a1f2e')); img.set(6, 1, c('#e8e4da')); img.set(10, 1, c('#e8e4da')); // 琴头
  img.rect(7, 3, 2, 14, c('#3a2a22')); img.vline(8, 3, 14, c('#5a4034'));
  img.ellipse(8, 19, 4.2, 3.4, G[1]); img.ellipse(8, 25, 5.8, 4.6, G[1]); img.hline(5, 21, 6, G[1]);
  img.ellipse(7, 23, 2.2, 2.2, G[3]); img.ellipse(8, 25, 1.7, 1.7, c('#2a1f2e')); // 音孔
  img.rect(6, 28, 4, 1, c('#e8e4da')); img.vline(5, 22, 7, G[0]); img.vline(11, 22, 7, G[0]); img.hline(5, 29, 6, G[0]);
  return f(img, 1, 1);
}

// ---- 地毯：画满整个脚印，格子/条纹/圆形/爪印
function rugRed(): Furn {
  const img = new Img(48, 32), R = [c('#8a2a22'), c('#b34a3c'), c('#d4604a')], C = c('#f0e2c0');
  img.rect(0, 0, 48, 32, R[1]); img.rect(0, 0, 48, 2, C); img.rect(0, 30, 48, 2, C); img.rect(0, 0, 2, 32, C); img.rect(46, 0, 2, 32, C);
  for (let x = 6; x < 46; x += 8) img.vline(x, 2, 28, R[0]); for (let y = 6; y < 30; y += 8) img.hline(2, y, 44, R[0]);
  for (let x = 10; x < 46; x += 8) img.vline(x, 2, 28, R[2]); for (let y = 10; y < 30; y += 8) img.hline(2, y, 44, R[2]);
  for (let x = 0; x < 48; x += 4) { img.set(x, 0, R[0]); img.set(x + 1, 31, R[0]); }
  return f(img, 3, 2);
}
function rugBlue(): Furn {
  const img = new Img(64, 32), B = [c('#2f4f8a'), c('#4a72b4'), c('#cfe0f4')];
  img.rect(0, 0, 64, 32, B[2]);
  for (let y = 0; y < 32; y += 8) { img.rect(0, y, 64, 4, B[1]); img.hline(0, y, 64, B[0]); }
  img.rect(0, 0, 2, 32, B[0]); img.rect(62, 0, 2, 32, B[0]); img.rect(2, 0, 2, 32, B[2]); img.rect(60, 0, 2, 32, B[2]);
  for (let y = 1; y < 32; y += 4) { img.set(0, y, B[2]); img.set(63, y, B[2]); }
  return f(img, 4, 2);
}
function rugRound(): Furn {
  const img = new Img(48, 48), P = [c('#b89a5a'), c('#dcc488'), c('#f0e2b8'), c('#c8704a')];
  img.ellipse(24, 24, 24, 24, P[0]); img.ellipse(24, 24, 22.4, 22.4, P[1]); img.ellipse(24, 24, 18, 18, P[3]); img.ellipse(24, 24, 16, 16, P[2]); img.ellipse(24, 24, 9, 9, P[1]); img.ellipse(24, 24, 4.5, 4.5, P[3]);
  for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; img.set(Math.round(24 + Math.cos(t) * 23), Math.round(24 + Math.sin(t) * 23), P[0]); }
  return f(img, 3, 3);
}
function rugPaw(): Furn {
  const img = new Img(32, 32), P = [c('#d8708a'), c('#f0a0b8'), c('#fde0ea')];
  img.rect(0, 0, 32, 32, P[1]); img.rect(0, 0, 32, 2, P[0]); img.rect(0, 30, 32, 2, P[0]); img.rect(0, 0, 2, 32, P[0]); img.rect(30, 0, 2, 32, P[0]);
  img.ellipse(16, 21, 6.5, 5, P[2]); for (const [x, y] of [[8, 12], [13, 8], [19, 8], [24, 12]] as const) img.ellipse(x, y, 2.6, 3.2, P[2]);
  return f(img, 2, 2);
}

// ---- 墙饰
function clock(): Furn {
  const img = new Img(14, 14);
  img.ellipse(7, 7, 7, 7, W[2]); img.ellipse(7, 7, 6, 6, c('#f6f2e4'));
  for (const [x, y] of [[7, 2], [7, 11], [2, 7], [11, 7]] as const) img.set(x, y, c('#2a1f2e'));
  img.vline(7, 4, 4, c('#2a1f2e')); img.hline(7, 7, 3, c('#c4503c')); img.set(7, 7, c('#2a1f2e'));
  return f(img, 1, 0);
}
function paint1(): Furn {
  const img = new Img(30, 22);
  img.rect(0, 0, 30, 22, W[2]); img.rect(1, 1, 28, 20, W[4]); img.rect(2, 2, 26, 18, c('#8ac4e8'));
  img.rect(2, 12, 26, 8, c('#3f94a8')); img.hline(4, 15, 8, c('#66b4c0')); img.hline(16, 17, 8, c('#66b4c0'));
  img.ellipse(8, 11, 8, 5, c('#58b24d')); img.ellipse(21, 12, 9, 6, c('#3f9644')); img.ellipse(8, 11, 4, 2.5, c('#7fcb62'));
  img.ellipse(22, 6, 2.5, 2.5, c('#fff0a8')); img.hline(5, 5, 6, c('#f4f8fc')); img.hline(14, 8, 5, c('#f4f8fc'));
  return f(img, 2, 0);
}
function paint2(): Furn {
  const img = new Img(14, 22);
  img.rect(0, 0, 14, 22, W[2]); img.rect(1, 1, 12, 20, W[4]); img.rect(2, 2, 10, 18, c('#9ab4c8'));
  img.rect(6, 12, 2, 8, W[0]); for (const [x, y, r] of [[7, 8, 4], [4, 10, 2.5], [10, 10, 2.5]] as const) img.ellipse(x, y, r, r - 0.5, c('#f6d550'));
  img.ellipse(6, 7, 1.5, 1.5, c('#fff0a8')); img.hline(3, 19, 8, c('#d8c08a'));
  return f(img, 1, 0);
}
function pennant(): Furn {
  const img = new Img(14, 26);
  img.rect(0, 0, 14, 2, W[2]); img.hline(0, 0, 14, W[4]); img.set(0, 2, W[1]); img.set(13, 2, W[1]);
  for (let y = 2; y < 25; y++) { const w = Math.max(0, Math.round(14 - (y - 2) * 0.6)), x = Math.floor((14 - w) / 2); img.hline(x, y, w, y % 2 ? c('#c4403a') : c('#d4483c')); }
  img.set(7, 8, c('#fff0a8')); img.hline(5, 9, 5, c('#fff0a8')); img.hline(6, 10, 3, c('#fff0a8')); img.set(7, 11, c('#fff0a8')); img.set(5, 12, c('#fff0a8')); img.set(9, 12, c('#fff0a8')); // 一颗星
  return f(img, 1, 0);
}
function poster(): Furn {
  const img = new Img(14, 20);
  img.rect(0, 0, 14, 20, c('#f6f0d8')); img.rect(0, 0, 14, 4, c('#3f78c0')); img.rect(2, 6, 10, 7, c('#f2c230')); img.ellipse(7, 9, 3, 2.5, c('#d4483c'));
  img.hline(2, 15, 10, c('#8a8f9c')); img.hline(2, 17, 7, c('#8a8f9c'));
  img.rect(5, 0, 4, 2, c('#e8e4d0')); img.set(0, 0, c('#e8e4d0')); img.set(13, 0, c('#e8e4d0')); // 胶带
  return f(img, 1, 0);
}

// ---- 小件（摆在桌面上，1×1）
function lampDesk(): Furn {
  const img = new Img(8, 14), Y = [c('#e8b84a'), c('#f6d66a'), c('#fff0a8')];
  img.rect(0, 0, 8, 2, Y[2]); img.rect(0, 2, 8, 4, Y[1]); img.hline(0, 5, 8, Y[0]); img.rect(3, 6, 2, 5, M[2]); img.rect(1, 11, 6, 2, M[1]); img.hline(1, 11, 6, M[3]); img.hline(2, 13, 4, M[0]);
  return f(img, 1, 1);
}
function cactus(): Furn {
  const img = new Img(10, 14), G = [PAL.leaf[1], PAL.leaf[3], PAL.leaf[5]];
  img.rect(2, 8, 6, 6, c('#c0714a')); img.hline(1, 8, 8, c('#d89068')); img.hline(2, 13, 6, c('#8a4a2a'));
  img.rect(3, 1, 4, 8, G[1]); img.vline(4, 1, 8, G[2]); img.vline(6, 2, 7, G[0]); img.rect(0, 4, 3, 2, G[1]); img.rect(0, 2, 2, 3, G[1]); img.rect(7, 5, 3, 2, G[1]); img.rect(8, 3, 2, 3, G[1]);
  img.set(5, 0, c('#ee93b6')); img.set(4, 1, c('#ee93b6')); img.set(6, 1, c('#ee93b6'));
  return f(img, 1, 1);
}

export const DECOR_FURNITURE: Record<string, () => Furn> = {
  dc_dtable: () => cleanTable(2, 2), dc_dtable3: () => cleanTable(3, 2), dc_gamechair: gamechair, dc_beanbag: beanbag, dc_shoebox: shoebox, dc_coatrack: coatrack,
  dc_tv: tv, dc_tank: tank, dc_lamp: lamp, dc_bear: bear, dc_guitar: guitar,
  dc_rug_red: rugRed, dc_rug_blue: rugBlue, dc_rug_round: rugRound, dc_rug_paw: rugPaw,
  dc_clock: clock, dc_paint1: paint1, dc_paint2: paint2, dc_pennant: pennant, dc_poster: poster,
  dc_lamp_desk: lampDesk, dc_cactus: cactus,
};
/** 地图编辑器里的家具目录用（名字 + 分类；分类沿用编辑器已有的几类） */
export const DECOR_INFO: Record<string, { name: string; cat: '桌椅' | '柜子电器' | '小件' | '墙面挂件' | '其他' }> = {
  dc_dtable: { name: '书桌（干净）', cat: '桌椅' }, dc_dtable3: { name: '长桌（干净）', cat: '桌椅' }, dc_gamechair: { name: '电竞椅', cat: '桌椅' }, dc_beanbag: { name: '懒人沙发', cat: '桌椅' },
  dc_shoebox: { name: '鞋柜', cat: '柜子电器' }, dc_coatrack: { name: '衣帽架', cat: '柜子电器' }, dc_tv: { name: '电视柜', cat: '柜子电器' }, dc_tank: { name: '观赏鱼缸', cat: '柜子电器' }, dc_lamp: { name: '落地灯', cat: '柜子电器' },
  dc_bear: { name: '大熊玩偶', cat: '其他' }, dc_guitar: { name: '吉他', cat: '其他' },
  dc_rug_red: { name: '红格地毯', cat: '其他' }, dc_rug_blue: { name: '蓝条地毯', cat: '其他' }, dc_rug_round: { name: '圆形地毯', cat: '其他' }, dc_rug_paw: { name: '爪印地毯', cat: '其他' },
  dc_clock: { name: '挂钟', cat: '墙面挂件' }, dc_paint1: { name: '风景画', cat: '墙面挂件' }, dc_paint2: { name: '竖幅画', cat: '墙面挂件' }, dc_pennant: { name: '校旗', cat: '墙面挂件' }, dc_poster: { name: '海报', cat: '墙面挂件' },
  dc_lamp_desk: { name: '台灯', cat: '小件' }, dc_cactus: { name: '仙人掌', cat: '小件' },
};
