/**
 * 图书馆广场的两座大型建筑（尺寸比普通小品大得多，16 格宽）：校园商店、校园墙。
 * 门头/牌面上的字由客户端用像素字体叠上去（见地图蓝图里的 label），这里只画好深色木牌的位置。
 * 都是代码生成、确定性的。
 */
import { Img, hash2, hex, shade, mix, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Sprite } from './nature.ts';

const shadowOf = (img: Img, cx: number, cy: number, rx: number, ry: number) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1 && img.alpha(x, y) === 0) img.set(x, y, [28, 36, 66, 52]);
  }
};

/** 商店：256×172（外加描边），门头牌面中心离脚点 94 px（x 居中） */
export const SHOP_W = 256, SHOP_H = 172;
export function shop(): Sprite {
  const W = SHOP_W, H = SHOP_H, img = new Img(W, H);
  const wall = hex('#efe2c4'), wallD = hex('#d8c6a0'), wallL = hex('#f8efd8'), wood = PAL.wood, glassC = hex('#2a3a4c');
  const roofA = hex('#b5553a'), roofB = hex('#9a4630'), roofC = hex('#c8694a'), roofD = hex('#7a3626');
  // ---- 屋顶（歇山式的正面坡）：y 0~60，往下逐渐变宽；一排排瓦
  for (let y = 0; y < 60; y++) {
    const inset = Math.round((59 - y) * 0.3), x0 = inset, x1 = W - inset;
    const row = Math.floor(y / 6), off = (row % 2) * 4;
    for (let x = x0; x < x1; x++) {
      const seam = (x + off) % 8 === 0, edge = y % 6 === 5;
      img.set(x, y, edge ? roofD : seam ? roofB : (x + off) % 8 < 3 ? roofC : roofA);
    }
  }
  img.rect(14, 0, W - 28, 5, roofD); img.rect(14, 0, W - 28, 2, roofB);                 // 屋脊
  for (let x = 14; x < W - 14; x += 10) img.rect(x, 5, 6, 2, roofD);                       // 脊下的瓦当
  img.rect(0, 58, W, 4, roofD); img.rect(0, 58, W, 1, roofC);                              // 屋檐
  // 小烟囱 + 天窗
  img.rect(164, 18, 28, 20, wall); img.rect(164, 18, 28, 2, wallL); img.rect(166, 22, 24, 14, glassC); img.rect(172, 22, 1, 14, wood[3]); img.rect(184, 22, 1, 14, wood[3]);
  for (let x = 160; x < 196; x += 2) img.set(x, 16 + (x % 4 === 0 ? 0 : 1), roofD);
  img.rect(62, 16, 28, 22, wall); img.rect(62, 16, 28, 2, wallL); img.rect(64, 20, 24, 16, glassC); img.rect(75, 20, 2, 16, wood[3]);
  // ---- 门头木牌（牌面字由客户端写上）：y 62~86
  img.rect(48, 62, 160, 24, wood[1]); img.rect(48, 62, 160, 2, wood[3]); img.rect(48, 84, 160, 2, wood[0]); img.rect(48, 62, 3, 24, wood[3]); img.rect(205, 62, 3, 24, wood[0]);
  img.rect(53, 66, 150, 16, hex('#4a2c1a')); img.rect(53, 66, 150, 1, hex('#2e1a10'));
  for (const x of [56, 198]) { img.set(x, 69, hex('#e0b34a')); img.set(x, 79, hex('#e0b34a')); }
  // ---- 墙面：y 86~160，米色，木柱，下部踢脚
  img.rect(0, 86, W, 74, wall);
  for (let y = 86; y < 160; y++) for (let x = 0; x < W; x++) { const h = hash2(x, y, 77); if (h < 0.05) img.set(x, y, wallD); else if (h > 0.97) img.set(x, y, wallL); }
  img.rect(0, 150, W, 10, wallD); img.rect(0, 150, W, 1, hex('#bfae88'));
  for (const x of [0, 124, 248]) { img.rect(x, 86, 8, 74, wood[2]); img.rect(x, 86, 2, 74, wood[3]); img.rect(x + 6, 86, 2, 74, wood[1]); }
  // ---- 条纹遮阳篷：y 86~104，红白相间，下沿扇形
  for (let x = 0; x < W; x++) {
    const red = Math.floor(x / 8) % 2 === 0;
    img.rect(x, 86, 1, 14, red ? hex('#c4443a') : hex('#f4ead0'));
    const scallop = 100 + (Math.abs((x % 8) - 3.5) < 2.5 ? 3 : 0) + (Math.abs((x % 8) - 3.5) < 1.2 ? 1 : 0);
    for (let y = 100; y < scallop; y++) img.set(x, y, red ? hex('#a8342c') : hex('#e0d3b2'));
  }
  img.rect(0, 86, W, 2, hex('#7e2f2a'));
  // ---- 两扇橱窗：y 108~148
  const windowAt = (x0: number, kind: number) => {
    img.rect(x0 - 3, 106, 86, 46, wood[1]); img.rect(x0 - 3, 106, 86, 2, wood[3]); img.rect(x0 - 3, 150, 86, 2, wood[0]);
    img.rect(x0, 109, 80, 40, glassC);
    // 货架两层
    for (const sy of [123, 137]) { img.rect(x0, sy, 80, 3, wood[3]); img.hline(x0, sy, 80, wood[4]); }
    const cs = ['#e0553a', '#3f78c0', '#f0c040', '#3f9a58', '#e8e4da', '#c98adf', '#f08ab0'];
    for (let r = 0; r < 3; r++) {
      const base = 123 + (r - 1) * 14 - (r === 0 ? 1 : 0);
      for (let i = 0; i < 9; i++) {
        const x = x0 + 3 + i * 8, c = hex(cs[Math.floor(hash2(i, r, kind * 11) * cs.length)]), tall = 5 + Math.floor(hash2(i, r + 4, kind) * 6);
        const y = (r === 0 ? 122 : r === 1 ? 136 : 149) - tall;
        if (y < 110) continue;
        if (kind === 0 && r === 1) { img.ellipse(x + 3, y + 3, 3.5, 2.2, c); img.set(x + 6, y + 2, c); img.set(x + 6, y + 4, c); img.set(x + 1, y + 2, hex('#101820')); } // 鱼
        else if (kind === 1 && r === 0) { img.rect(x, y + 2, 5, tall - 2, c); img.rect(x + 1, y, 3, 2, shade(c, 0.7)); }                                       // 瓶罐
        else { img.rect(x, y, 6, tall, c); img.rect(x, y, 6, 1, shade(c, 1.25)); img.rect(x + 5, y, 1, tall, shade(c, 0.7)); }
      }
    }
    img.rect(x0, 109, 80, 3, [255, 255, 255, 30]); img.rect(x0 + 8, 109, 6, 40, [255, 255, 255, 22]); img.rect(x0 + 20, 109, 2, 40, [255, 255, 255, 18]); // 玻璃反光
  };
  windowAt(22, 0); windowAt(154, 1);
  // ---- 双开木门：x 108~148，y 106~160，上半是玻璃
  img.rect(105, 104, 46, 56, wood[1]); img.rect(105, 104, 46, 2, wood[3]); img.rect(105, 104, 2, 56, wood[3]); img.rect(149, 104, 2, 56, wood[0]);
  for (const dx of [0, 21]) {
    img.rect(108 + dx, 108, 19, 50, wood[2]); img.rect(108 + dx, 108, 19, 1, wood[4]);
    img.rect(111 + dx, 111, 13, 22, glassC); img.rect(111 + dx, 111, 13, 3, [255, 255, 255, 40]); img.rect(116 + dx, 111, 1, 22, wood[2]);
    img.rect(111 + dx, 137, 13, 16, wood[1]); img.rect(112 + dx, 138, 11, 14, wood[3]); img.rect(115 + dx, 141, 5, 8, wood[2]);
  }
  img.rect(127, 108, 2, 50, wood[0]); img.rect(124, 132, 2, 5, hex('#e0b34a')); img.rect(130, 132, 2, 5, hex('#e0b34a'));
  // 门楣上的小金币招牌
  img.ellipse(128, 97, 8, 5, hex('#f0c040')); img.ellipse(128, 97, 6.2, 3.6, hex('#e0a52a')); img.rect(126, 94, 4, 6, hex('#fff0a0')); img.rect(125, 96, 6, 2, hex('#f0c040'));
  // ---- 门前台阶、两侧木桶和花
  img.rect(96, 160, 64, 4, PAL.stone[3]); img.rect(96, 160, 64, 1, PAL.stone[4]); img.rect(100, 164, 56, 4, PAL.stone[2]); img.rect(100, 164, 56, 1, PAL.stone[3]);
  img.rect(0, 160, W, 4, PAL.stone[2]); img.rect(0, 160, W, 1, PAL.stone[4]); img.rect(0, 163, W, 1, PAL.stone[0]);
  for (const bx of [60, 176]) { // 木桶 + 花
    img.rect(bx, 148, 16, 12, wood[2]); img.rect(bx, 148, 16, 2, wood[4]); img.rect(bx, 153, 16, 1, wood[0]); img.rect(bx, 157, 16, 1, wood[0]); img.rect(bx + 1, 148, 2, 12, wood[3]);
    for (let i = 0; i < 6; i++) { img.rect(bx + 1 + i * 2.6, 143 - (i % 2) * 2, 2, 6, hex('#3f9a58')); }
    for (const [fx, fy, c] of [[bx + 3, 141, '#f08ab0'], [bx + 8, 139, '#f6df8a'], [bx + 12, 142, '#e0553a']] as [number, number, string][]) { img.rect(fx, fy, 3, 3, hex(c)); img.set(fx + 1, fy + 1, hex('#fff6d8')); }
  }
  // 门口旁的"鱼货"木箱（左）和价目小黑板（右）
  img.rect(12, 144, 22, 16, wood[2]); img.rect(12, 144, 22, 2, wood[4]); img.rect(12, 150, 22, 1, wood[0]); img.rect(12, 156, 22, 1, wood[0]);
  for (let i = 0; i < 4; i++) { img.ellipse(17 + i * 5, 143, 3, 1.8, hex(i % 2 ? '#8fb7d8' : '#e9edf2')); img.set(20 + i * 5, 143, hex('#e07a4a')); }
  img.rect(214, 130, 26, 30, wood[1]); img.rect(216, 132, 22, 24, hex('#2f3a34')); img.rect(214, 130, 26, 2, wood[3]);
  for (let i = 0; i < 4; i++) { img.hline(219, 136 + i * 5, 12 - (i % 2) * 3, hex('#e8e4da')); img.rect(233, 136 + i * 5, 3, 1, hex('#f0c040')); }
  img.rect(218, 158, 3, 4, wood[0]); img.rect(233, 158, 3, 4, wood[0]);
  const out = img.outlined(PAL.outlineBrick);
  shadowOf(out, W / 2 + 1, H + 1, W / 2 + 4, 3.5);
  // 脚点在图的底边（含描边 +1）；脚点下方 3 像素的影子
  return { img: out, ax: out.w / 2, ay: H + 1, block: { x: -W / 2, y: -64, w: W, h: 64 } };
}

/** 校园墙：256×124，牌面中心（挂"校园墙"三个字）离脚点 100 px */
export const WALL_W = 256, WALL_H = 124;
export function campusWall(): Sprite {
  const W = WALL_W, H = WALL_H, img = new Img(W, H);
  const wood = PAL.wood, brick = hex('#b4573f'), brickL = hex('#cc6e50'), brickD = hex('#8e4330'), cap = hex('#4f6a72'), capL = hex('#6f8c94'), capD = hex('#34484e');
  // ---- 顶牌：y 0~24（字由客户端写）
  img.rect(70, 0, 116, 26, wood[1]); img.rect(70, 0, 116, 3, wood[3]); img.rect(70, 23, 116, 3, wood[0]); img.rect(70, 0, 3, 26, wood[3]); img.rect(183, 0, 3, 26, wood[0]);
  img.rect(75, 5, 106, 16, hex('#3a2a4a')); img.rect(75, 5, 106, 1, hex('#241a30'));
  for (const x of [78, 177]) { img.set(x, 8, hex('#f6df8a')); img.set(x, 17, hex('#f6df8a')); }
  img.rect(90, 26, 4, 8, wood[0]); img.rect(162, 26, 4, 8, wood[0]);
  // ---- 瓦顶压檐：y 30~46
  for (let y = 30; y < 44; y++) { const inset = Math.round((43 - y) * 0.25); for (let x = inset; x < W - inset; x++) img.set(x, y, y > 40 ? capD : (x % 8 < 3 ? capL : cap)); }
  img.rect(0, 43, W, 3, capD); img.rect(0, 43, W, 1, capL);
  // ---- 墙身：y 46~108 砖墙，中间嵌一大块软木板
  img.rect(0, 46, W, 62, brick);
  for (let y = 46; y < 108; y++) for (let x = 0; x < W; x++) {
    const rowI = Math.floor((y - 46) / 6), off = (rowI % 2) * 8, mortar = (y - 46) % 6 === 5 || (x + off) % 16 === 0;
    if (mortar) img.set(x, y, brickD); else { const h = hash2(x >> 2, y >> 1, 12); if (h < 0.1) img.set(x, y, brickL); else if (h > 0.92) img.set(x, y, brickD); }
  }
  for (const x of [0, 248]) { img.rect(x, 40, 8, 70, hex('#d9c8a0')); img.rect(x, 40, 2, 70, hex('#efe3c4')); img.rect(x + 6, 40, 2, 70, hex('#b8a47a')); img.rect(x - 1, 38, 10, 4, capD); }
  // 软木板（一大块）
  img.rect(10, 50, W - 20, 54, wood[3]); img.rect(10, 50, W - 20, 2, wood[4]); img.rect(10, 102, W - 20, 2, wood[1]);
  img.rect(13, 54, W - 26, 46, hex('#d6b583'));
  for (let y = 54; y < 100; y++) for (let x = 13; x < W - 13; x++) { const h = hash2(x, y, 41); if (h < 0.07) img.set(x, y, hex('#b88f5c')); else if (h > 0.95) img.set(x, y, hex('#ecd3a6')); }
  // 满墙的便签：错落的大小与颜色，带图钉和"写字"的横线，几张是心形/星星便利贴
  const cs = ['#fbf3dc', '#f4b6c8', '#9ec7ea', '#bfe0b8', '#f6df8a', '#d8c0f0', '#f6c79a'];
  let n = 0;
  for (let row = 0; row < 3; row++) {
    let x = 15 + (row % 2) * 5;
    while (x < W - 40) {
      const nw = 12 + Math.floor(hash2(n, row, 5) * 9), nh = 11 + Math.floor(hash2(n, row, 6) * 6), y = 55 + row * 15 + Math.floor(hash2(n, row, 7) * 3);
      const c = hex(cs[Math.floor(hash2(n, row, 8) * cs.length)]);
      img.rect(x + 1, y + nh, nw, 1, [60, 40, 20, 70]);
      img.rect(x, y, nw, nh, c); img.rect(x, y, nw, 1, shade(c, 1.1));
      if (hash2(n, row, 9) < 0.18) { // 心形
        const hc = hex('#d6405c'); for (const [dx, dy] of [[2, 3], [3, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [3, 6], [4, 6], [5, 6], [4, 7]]) img.set(x + dx, y + dy, hc);
      } else for (let l = 4; l < nh - 1; l += 3) img.hline(x + 2, y + l, nw - 4 - Math.floor(hash2(n, l, 3) * 4), hex('#b9ad92'));
      img.set(x + Math.floor(nw / 2), y + 1, hex('#c4503c'));
      x += nw + 2 + Math.floor(hash2(n, row, 10) * 3); n++;
    }
  }
  // ---- 底座与花坛：y 108~122
  img.rect(0, 108, W, 6, PAL.stone[3]); img.rect(0, 108, W, 1, PAL.stone[4]); img.rect(0, 113, W, 1, PAL.stone[0]);
  for (const bx of [14, 196]) {
    img.rect(bx, 112, 46, 10, hex('#8a5a3a')); img.rect(bx, 112, 46, 2, hex('#a8704a')); img.rect(bx, 119, 46, 1, hex('#5e3c26'));
    for (let i = 0; i < 12; i++) { img.rect(bx + 2 + i * 3.6, 107 + (i % 3), 2, 6, hex('#3f9a58')); }
    for (let i = 0; i < 7; i++) { const c = ['#f08ab0', '#f6df8a', '#e0553a', '#c98adf'][i % 4]; img.rect(bx + 3 + i * 6, 105 + (i % 2) * 3, 3, 3, hex(c)); img.set(bx + 4 + i * 6, 106 + (i % 2) * 3, hex('#fff6d8')); }
  }
  // 中间一张小长椅
  img.rect(100, 111, 56, 4, wood[3]); img.rect(100, 111, 56, 1, wood[4]); img.rect(104, 115, 3, 6, wood[1]); img.rect(149, 115, 3, 6, wood[1]);
  const out = img.outlined(PAL.outlineBrick);
  shadowOf(out, W / 2 + 1, H + 1, W / 2 + 2, 3);
  return { img: out, ax: out.w / 2, ay: H + 1, block: { x: -W / 2, y: -26, w: W, h: 26 } };
}
void mix;
