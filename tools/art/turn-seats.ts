/**
 * 座椅 / 软装的转向贴图：木椅（含朝北的木椅）、电竞椅、双人沙发、大熊玩偶、吉他。
 * 每个朝向都是按真实形状单独画的：背面看到椅背板 / 沙发背 / 后脑勺 / 琴背，侧面看到椅面和靠背的侧影 / 扶手端面 / 侧脸 / 很薄的琴身。
 * 朝向约定见 turn.ts：90 = 朝西，180 = 朝北（背对镜头），270 = 朝东。朝东和朝西是同一个侧影左右翻过来（靠背 / 脸总在对应的一侧），
 * 每一面的细节（扶手、耳朵、琴颈的斜度）都是按那一面重新画的，不是把正面转 90 度。
 */
import { Img, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import { chair, type Furn } from './furniture.ts';
import type { ViewMap } from './turn.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const c = (s: string): RGBA => hex(s);
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });
/** 左右翻转（朝东 → 朝西的侧影） */
function mirror(img: Img): Img {
  const o = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.set(img.w - 1 - x, y, img.get(x, y));
  return o;
}
type Dir = 'S' | 'W' | 'N' | 'E';
/** 要朝东画好的侧影（朝西 = 翻转）：画函数只画朝东 */
const side = (draw: () => Img, dir: 'W' | 'E', fw: number, fh: number): Furn => f(dir === 'E' ? draw() : mirror(draw()), fw, fh);

// ---------------------------------------------------------------- 木椅（14×22，脚印 1×1）
function chairBack(): Img { // 朝北：背对镜头，一整块椅背板（竖条纹），两根后立柱一直通到地，椅面只露出一条前沿
  const img = new Img(14, 22);
  img.rect(1, 2, 12, 12, W[2]); img.hline(1, 2, 12, W[4]); img.hline(1, 3, 12, W[3]);
  img.rect(3, 5, 8, 7, W[3]); for (const x of [5, 8]) img.vline(x, 5, 7, W[1]); img.hline(3, 11, 8, W[2]);
  img.rect(1, 3, 2, 17, W[1]); img.rect(11, 3, 2, 17, W[1]); img.vline(1, 3, 17, W[2]); img.vline(11, 3, 17, W[2]); // 后立柱
  img.rect(1, 14, 12, 3, W[3]); img.hline(1, 14, 12, W[4]); img.hline(1, 16, 12, W[0]); // 椅面后沿
  img.rect(2, 17, 2, 4, W[0]); img.rect(10, 17, 2, 4, W[0]); img.rect(5, 17, 4, 1, W[1]); // 腿和横档
  return img;
}
function chairSideE(): Img { // 朝东：靠背在左（西）侧，椅面向右伸出去，两条腿，椅面下有横档
  const img = new Img(14, 22);
  img.rect(1, 2, 3, 13, W[2]); img.vline(1, 2, 13, W[3]); img.hline(1, 2, 3, W[4]); // 靠背侧影（略有厚度）
  img.rect(2, 4, 1, 7, W[1]); // 靠背上的软垫缝
  img.rect(1, 10, 12, 4, W[3]); img.hline(1, 10, 12, W[4]); img.hline(1, 13, 12, W[0]); // 椅面
  img.rect(1, 14, 3, 7, W[1]); img.vline(1, 14, 7, W[2]); // 后腿（靠背立柱延下来）
  img.rect(10, 14, 2, 7, W[0]); img.vline(10, 14, 7, W[1]); // 前腿
  img.rect(4, 17, 6, 1, W[1]); // 横档
  return img;
}
function chairView(dir: Dir): Furn {
  if (dir === 'S') return chair('down');
  if (dir === 'N') return f(chairBack(), 1, 1);
  return side(chairSideE, dir, 1, 1);
}

// ---------------------------------------------------------------- 电竞椅（16×24，脚印 1×1）
const K = [c('#2b2e38'), c('#3d4252'), c('#565d70')], R = [c('#a8322a'), c('#d4483c')], KL = c('#7a8299');
function gameBack(): Img { // 背面：高靠背的背板（黑面红边），头枕后面的一块，椅面只露出下沿，五星脚
  const img = new Img(16, 24);
  img.rect(3, 0, 10, 15, K[1]); img.rect(3, 0, 10, 2, R[1]); img.vline(3, 2, 13, R[0]); img.vline(12, 2, 13, R[0]); img.hline(4, 2, 8, K[0]);
  img.rect(5, 3, 6, 4, K[2]); img.hline(5, 3, 6, KL); img.rect(5, 8, 6, 5, K[0]); img.hline(6, 10, 4, K[2]); // 头枕背面 + 腰靠的缝线
  img.vline(8, 8, 5, K[1]);
  img.rect(1, 11, 3, 5, K[0]); img.rect(12, 11, 3, 5, K[0]); // 扶手侧面
  img.rect(3, 15, 10, 4, K[2]); img.hline(3, 15, 10, KL); img.hline(3, 18, 10, K[0]);
  img.rect(7, 19, 2, 3, M[1]); img.hline(2, 22, 12, M[1]); img.set(2, 23, M[0]); img.set(13, 23, M[0]); img.set(7, 23, M[0]); img.set(8, 23, M[0]);
  return img;
}
function gameSideE(): Img { // 朝东：靠背微微后仰（上端往左），头枕突出，扶手从靠背伸向前方，座面前高后低，一根气杆和五星脚
  const img = new Img(16, 24);
  const back = [[2, 3], [2, 3], [3, 4], [3, 4], [3, 4], [3, 4], [3, 5], [4, 5], [4, 5], [4, 6], [4, 6], [4, 6], [5, 7]]; // 每行（y = 0…）靠背的 [左, 右]
  back.forEach(([l, r], y) => { img.hline(l, y, r - l + 1, K[1]); });
  img.rect(1, 0, 2, 6, K[2]); img.vline(1, 0, 6, KL); img.hline(1, 0, 2, R[1]); // 头枕（向前凸出的小枕）
  img.vline(6, 3, 9, R[1]); img.vline(7, 6, 6, R[0]); // 靠背前缘的红边
  img.rect(4, 13, 10, 4, K[2]); img.hline(4, 13, 10, KL); img.hline(4, 16, 10, K[0]); // 座面
  img.rect(4, 9, 9, 2, K[0]); img.hline(4, 9, 9, K[1]); img.rect(11, 11, 2, 3, K[0]); // 扶手 + 立杆
  img.rect(7, 17, 2, 3, M[1]); img.vline(7, 17, 3, M[2]);
  img.hline(2, 20, 12, M[1]); img.hline(3, 21, 10, M[0]); img.set(2, 21, M[0]); img.set(13, 21, M[0]); // 五星脚（斜着看是一条）
  img.rect(1, 21, 3, 2, K[0]); img.rect(12, 21, 3, 2, K[0]); img.rect(7, 21, 2, 2, K[0]); // 脚轮
  return img;
}
function gameChairView(dir: Dir): Furn | null {
  if (dir === 'N') return f(gameBack(), 1, 1);
  if (dir === 'E' || dir === 'W') return side(gameSideE, dir, 1, 1);
  return null;
}

// ---------------------------------------------------------------- 双人沙发（酒红色）
const SO = [c('#7a3f5a'), c('#9a5878'), c('#b97294')];
function sofaBack(): Img { // 朝北（2×1）：沙发背——一整面带缝线的软靠背，两头是扶手的外侧面，下面两只脚
  const img = new Img(32, 24);
  img.rect(0, 2, 32, 17, SO[1]); img.hline(2, 2, 28, SO[2]); img.rect(0, 3, 32, 1, SO[2]);
  for (const x of [10, 21]) { img.vline(x, 5, 13, SO[0]); img.vline(x + 1, 5, 13, SO[2]); } // 靠垫的缝
  img.hline(2, 17, 28, SO[0]); // 靠背和座面的接缝
  img.rect(0, 8, 4, 12, SO[0]); img.rect(28, 8, 4, 12, SO[0]); img.vline(1, 9, 10, SO[1]); img.vline(30, 9, 10, SO[1]); // 两头扶手外侧
  img.rect(0, 19, 32, 2, SO[0]); img.hline(0, 19, 32, SO[1]);
  img.rect(2, 21, 3, 3, W[0]); img.rect(27, 21, 3, 3, W[0]);
  return img;
}
function sofaSideE(): Img { // 朝东（1×2，16×40，脚印 16×32 在下面）：靠背在西侧，两只座垫沿南北排，北头的扶手露出顶面，南头扶手的端面正对镜头
  const img = new Img(16, 40);
  img.rect(0, 2, 16, 7, SO[1]); img.hline(0, 2, 16, SO[2]); img.hline(0, 8, 16, SO[0]); img.rect(1, 3, 14, 1, SO[2]); // 北头扶手（顶面 + 向着镜头的一面）
  img.rect(0, 9, 5, 22, SO[0]); img.vline(1, 9, 22, SO[1]); img.vline(2, 9, 22, SO[2]); // 靠背：顶面细窄，立在西边
  img.rect(5, 9, 10, 10, SO[1]); img.hline(5, 9, 10, SO[2]); img.hline(5, 18, 10, SO[0]); // 座垫 A
  img.rect(5, 20, 10, 10, SO[1]); img.hline(5, 20, 10, SO[2]); img.hline(5, 29, 10, SO[0]); // 座垫 B
  img.vline(15, 9, 21, SO[0]); // 座垫前沿
  img.rect(0, 30, 16, 4, SO[1]); img.hline(0, 30, 16, SO[2]); // 南头扶手顶面
  img.rect(0, 34, 16, 5, SO[0]); img.rect(2, 35, 12, 3, SO[1]); img.hline(2, 35, 12, SO[2]); // 扶手端面（正对镜头）
  img.rect(1, 38, 3, 2, W[0]); img.rect(12, 38, 3, 2, W[0]);
  return img;
}

// ---------------------------------------------------------------- 大熊玩偶（16×20，1×1）
const B = [c('#7a4a2a'), c('#a06a3e'), c('#c48a56'), c('#e0b078')], BD = c('#2a1f2e'), BR = c('#d4483c');
function bearBack(): Img { // 背面：两只耳朵、圆圆的后脑勺（没有脸）、背上一小团圆尾巴、两只脚底
  const img = new Img(16, 20);
  img.ellipse(4, 4, 2.4, 2.4, B[1]); img.ellipse(12, 4, 2.4, 2.4, B[1]); img.set(4, 4, B[0]); img.set(12, 4, B[0]);
  img.ellipse(8, 8, 6, 5.4, B[2]); img.ellipse(8, 7, 3.5, 2.5, B[3]); img.hline(5, 11, 6, B[1]); // 后脑勺高光 + 脖子的阴影
  img.ellipse(8, 16, 6, 3.6, B[2]); img.ellipse(8, 15, 3.5, 1.6, B[3]); img.rect(2, 15, 3, 4, B[1]); img.rect(11, 15, 3, 4, B[1]); // 背上高光 + 两条胳膊
  img.ellipse(8, 17, 1.8, 1.6, B[3]); img.set(8, 17, B[2]); // 尾巴
  img.rect(4, 18, 3, 2, B[1]); img.rect(9, 18, 3, 2, B[1]); img.hline(4, 19, 3, B[0]); img.hline(9, 19, 3, B[0]);
  return img;
}
function bearSideE(): Img { // 朝东：侧脸——一只耳朵、凸出来的口鼻 + 黑鼻头、一只眼，身体坐着、一只胳膊搭在前面、脚朝前伸，背后一个小尾巴
  const img = new Img(16, 20);
  img.ellipse(5, 3.5, 2.4, 2.4, B[1]); img.ellipse(8, 3, 1.9, 2, B[0]); img.set(5, 4, B[3]); // 近耳 + 远耳露出一点
  img.ellipse(8, 8, 5.4, 5.2, B[2]); img.ellipse(6, 6, 2.6, 1.8, B[3]);
  img.ellipse(12, 10, 2.6, 2, B[3]); img.rect(14, 9, 2, 2, BD); img.hline(11, 12, 3, B[0]); // 口鼻 + 鼻头 + 嘴线
  img.set(10, 7, BD); img.set(10, 6, c('#fff0a8')); // 眼睛
  img.ellipse(7, 16, 5.4, 3.6, B[2]); img.ellipse(6, 15, 2.5, 1.5, B[3]);
  img.rect(8, 12, 4, 2, BR); img.set(12, 13, BR); img.set(10, 14, c('#8a2a22')); // 领结的侧面
  img.ellipse(10, 15.5, 2.1, 3, B[1]); img.ellipse(10, 15, 1.1, 1.8, B[2]); // 近侧的胳膊
  img.rect(9, 18, 6, 2, B[1]); img.hline(9, 19, 6, B[0]); img.rect(3, 18, 3, 2, B[0]); // 向前伸的脚 + 后脚
  img.ellipse(1.6, 16.5, 1.7, 1.7, B[3]); img.set(1, 16, B[2]); // 尾巴
  return img;
}

// ---------------------------------------------------------------- 吉他（16×32，1×1，靠立）
const G = [c('#7a3a1e'), c('#a85a2a'), c('#d4803c'), c('#f0a860')], DK = c('#2a1f2e'), NK = [c('#3a2a22'), c('#5a4034')];
function guitarBack(): Img { // 背面：琴头背面（没有旋钮的一面，只露出琴颈木头）、琴颈背面一条圆脊、琴背木纹和中间的拼缝、底部的背带扣
  const img = new Img(16, 32);
  img.rect(7, 0, 3, 3, NK[0]); img.vline(8, 0, 3, NK[1]);
  img.rect(7, 3, 2, 14, G[0]); img.vline(8, 3, 14, G[1]); // 琴颈背面（木色，不是指板）
  img.ellipse(8, 19, 4.2, 3.4, G[1]); img.ellipse(8, 25, 5.8, 4.6, G[1]); img.hline(5, 21, 6, G[1]);
  for (const x of [5, 7, 10]) img.vline(x, 18, 11, G[2]); img.vline(8, 17, 12, G[3]); // 木纹 + 中间拼缝
  img.rect(5, 28, 6, 1, G[0]); img.vline(5, 22, 6, G[0]); img.vline(11, 22, 6, G[0]); img.hline(5, 29, 6, G[0]); // 边沿
  img.set(8, 30, c('#e8e4da')); // 背带扣
  return img;
}
function guitarSideE(): Img { // 朝东：斜靠着，从侧面看琴身薄薄一片（面板朝东、背板朝西），琴颈斜斜地向上、向东探出去，琴头歪着
  const img = new Img(16, 32);
  img.rect(10, 0, 4, 3, DK); img.set(14, 1, c('#e8e4da')); img.hline(10, 0, 4, NK[1]); // 琴头（侧面）
  for (let y = 3; y <= 16; y++) { const x = 9 - Math.floor(((y - 3) * 3) / 14); img.hline(x, y, 2, NK[0]); img.set(x + 1, y, NK[1]); } // 琴颈：每行左端随高度均匀往左（斜靠），宽 2
  img.rect(5, 17, 5, 13, G[1]); img.rect(5, 16, 4, 2, G[1]); // 琴身（上半窄一些）
  img.rect(4, 19, 7, 10, G[1]); img.hline(5, 29, 5, G[0]); img.hline(5, 30, 5, G[0]); // 下半宽一些
  img.vline(10, 17, 13, G[3]); img.vline(9, 17, 13, G[2]); // 面板（朝东，受光）
  img.vline(4, 19, 10, G[0]); img.vline(5, 17, 2, G[0]); // 背板（朝西，暗）
  img.rect(5, 17, 1, 12, G[0]); // 琴身侧板的暗边
  img.rect(6, 24, 1, 1, G[3]); // 一点侧面的高光
  img.set(8, 30, c('#e8e4da'));
  return img;
}

export const SEAT_VIEWS: Record<string, ViewMap> = {
  // 木椅：原图朝南（chair），朝北的木椅（chairup）原图 0 也换成同一把椅子的背面，两个物品朝北看起来一样
  chair: { 90: () => chairView('W'), 180: () => chairView('N'), 270: () => chairView('E') },
  chairup: { 0: () => chairView('N'), 90: () => chairView('E'), 180: () => chairView('S'), 270: () => chairView('W') },
  dc_gamechair: { 90: () => gameChairView('W')!, 180: () => gameChairView('N')!, 270: () => gameChairView('E')! },
  sofa: { 90: () => side(sofaSideE, 'W', 1, 2), 180: () => f(sofaBack(), 2, 1), 270: () => side(sofaSideE, 'E', 1, 2) },
  dc_bear: { 90: () => side(bearSideE, 'W', 1, 1), 180: () => f(bearBack(), 1, 1), 270: () => side(bearSideE, 'E', 1, 1) },
  dc_guitar: { 90: () => side(guitarSideE, 'W', 1, 1), 180: () => f(guitarBack(), 1, 1), 270: () => side(guitarSideE, 'E', 1, 1) },
};
