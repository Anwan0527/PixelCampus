/**
 * 柜架 / 电器 / 衣柜 / 宝箱 的转向贴图（登记规则见 turn.ts）：书架、双门柜、鞋柜、冰箱、衣帽架、电视柜、鱼缸、衣柜、宝箱。
 * 90 = 朝西，180 = 朝北（背对镜头，看到背板 / 后壳），270 = 朝东。每个面都是照真实形状重新画的：
 *  - 背面：素背板、木板缝、压缩机栅格、电视后壳和线缆、铰链……顶上的摆件左右对调（从后面看左右是反的）；
 *  - 侧面（竖放，占地宽高互换）：只看得到一块窄窄的侧板，家具长的那一边朝北延伸，顶面每多一行占地露出 8px（和桌面小件的约定一致）；
 *    正面那一侧留一条「门边」，朝西时在左、朝东时在右，一眼看得出它朝哪边；顶上的摆件按真实位置摆到南 / 北端。
 * 光从左上来：左边亮、右边暗，和原图一致。
 */
import { Img, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Furn } from './furniture.ts';
import type { ViewMap } from './turn.ts';

const OUT = PAL.outline, W = PAL.wood, M = PAL.metal;
const c = (s: string): RGBA => hex(s);
const f = (img: Img, fw: number, fh: number): Furn => ({ img: img.outlined(OUT), fw, fh });
const LT: RGBA[] = ['#b98350', '#d6a56c', '#e8c288', '#f6e0b0'].map(c);
type Side = 'l' | 'r'; // 正面（门）在侧面图的哪一边：朝西在左，朝东在右

/** 侧板用的一组颜色 */
interface EndPal { top: RGBA; topHi: RGBA; topLo: RGBA; face: RGBA; hi: RGBA; lo: RGBA; edge: RGBA; edgeHi: RGBA }
interface End { img: Img; topY: number; topH: number; faceY: number; faceH: number }
/**
 * 侧面的箱体：宽 16（家具的进深），下面是侧板，上面是顶面（家具长 len 像素，朝北多出 (len/16-1)*8px + lip 的顶面）；
 * H = 原图正面高度，lip = 原图正面顶上那一条的高度。rise = 顶面上方留给摆件（植物、电视）的空间。
 */
function endBlock(len: number, H: number, lip: number, p: EndPal, front: Side, rise = 0): End {
  const extra = (len / 16 - 1) * 8, topH = extra + lip, faceH = H - lip, topY = rise, faceY = rise + topH;
  const img = new Img(16, rise + topH + faceH);
  img.rect(0, topY, 16, topH, p.top); img.hline(0, topY, 16, p.topHi);
  for (let x = 4; x < 15; x += 5) if (topH >= 6) img.vline(x, topY + 2, topH - 3, p.topLo); // 顺着长边的木纹
  img.rect(0, faceY, 16, faceH, p.face); img.hline(0, faceY, 16, p.hi);
  img.vline(0, faceY, faceH, p.hi); img.vline(15, faceY, faceH, p.lo); img.hline(0, faceY + faceH - 1, 16, p.lo);
  const fx = front === 'l' ? 0 : 13; // 门边：正面那一侧 3px 宽，顶面和侧板上下贯通
  img.rect(fx, topY, 3, topH + faceH, p.edge); img.vline(front === 'l' ? 0 : 15, topY, topH + faceH, front === 'l' ? p.edgeHi : p.lo);
  img.vline(front === 'l' ? 3 : 12, faceY, faceH, p.lo);
  return { img, topY, topH, faceY, faceH };
}
/** 板条背板：底色 + 木板缝（每 every 像素一条）+ 上沿一圈亮边 */
function planks(img: Img, x: number, y: number, w: number, h: number, base: RGBA, seam: RGBA, hi: RGBA, every = 8) {
  img.rect(x, y, w, h, base); img.hline(x, y, w, hi);
  for (let i = every - 1; i < w - 1; i += every) img.vline(x + i, y + 1, h - 1, seam);
}

// ------------------------------------------------------------------ 书架（2 / 3 格宽，原图 n*16 × 34）
function shelfBack(n: number): Furn {
  const w = n * 16, h = 34, img = new Img(w, h);
  img.rect(0, 0, w, h, W[2]); img.rect(0, 0, w, 2, W[3]); img.hline(0, 0, w, W[4]); // 上沿
  planks(img, 2, 3, w - 4, 28, W[1], W[0], W[2]);
  for (const y of [11, 22]) { img.hline(2, y, w - 4, W[0]); img.hline(2, y + 1, w - 4, W[2]); } // 横撑：背板后面隐约的搁板位置
  img.rect(0, 31, w, 3, W[1]); img.hline(0, 31, w, W[2]); img.hline(0, 33, w, W[0]);
  return f(img, n, 1);
}
function shelfEnd(n: number, front: Side): Furn {
  const P: EndPal = { top: W[3], topHi: W[4], topLo: W[2], face: W[1], hi: W[2], lo: W[0], edge: W[2], edgeHi: W[3] };
  const e = endBlock(n * 16, 34, 3, P, front), img = e.img, px = front === 'l' ? 5 : 2, y = e.faceY;
  img.rect(px, y + 2, 9, e.faceH - 8, W[2]); img.hline(px, y + 2, 9, W[3]); img.vline(px + 8, y + 3, e.faceH - 9, W[1]); // 嵌板
  for (const g of [10, 21]) img.hline(px + 1, y + g, 7, W[1]); // 搁板的位置，嵌板上两道浅槽
  img.rect(0, y + e.faceH - 3, 16, 3, W[1]); img.hline(0, y + e.faceH - 3, 16, W[2]); img.hline(0, y + e.faceH - 1, 16, W[0]); // 踢脚
  return f(img, 1, n);
}

// ------------------------------------------------------------------ 双门柜（米黄色铁皮柜，32×36）
const CB = { body: c('#d9cf9e'), hi: c('#ece4b8'), panel: c('#cfc593'), seam: c('#b8ae7c'), doorUp: c('#a8b8b0'), doorLo: c('#c9bf8c'), low: c('#8a7f58') };
function cab2Back(): Furn {
  const img = new Img(32, 36);
  img.rect(0, 0, 32, 36, CB.body); img.hline(0, 0, 32, CB.hi);
  img.rect(1, 2, 30, 32, CB.panel); img.vline(10, 2, 32, CB.seam); img.vline(21, 2, 32, CB.seam); img.hline(1, 19, 30, CB.seam); img.hline(1, 20, 30, CB.hi); // 背板分块、横梁
  for (const x of [5, 26]) { img.rect(x, 5, 3, 2, CB.low); img.set(x + 1, 5, c('#5a5238')); } // 走线孔
  for (const [x, y] of [[3, 3], [28, 3], [3, 31], [28, 31]] as const) img.set(x, y, CB.low); // 螺丝
  img.hline(0, 35, 32, CB.low);
  return f(img, 2, 1);
}
function cab2End(front: Side): Furn {
  const P: EndPal = { top: c('#e0d6a6'), topHi: c('#f2ecc4'), topLo: CB.panel, face: CB.body, hi: CB.hi, lo: CB.low, edge: CB.doorLo, edgeHi: c('#e0d6a6') };
  const e = endBlock(32, 36, 2, P, front), img = e.img, px = front === 'l' ? 5 : 2, y = e.faceY;
  img.rect(front === 'l' ? 0 : 13, y, 3, 18, CB.doorUp); img.vline(front === 'l' ? 0 : 15, y, 18, c('#c4d2cb')); // 上半门板的边
  img.rect(px, y + 2, 9, e.faceH - 6, CB.panel); img.hline(px, y + 2, 9, CB.hi); img.vline(px + 8, y + 3, e.faceH - 7, CB.seam); img.hline(px + 1, y + 17, 7, CB.seam); // 侧嵌板
  return f(img, 1, 2);
}

// ------------------------------------------------------------------ 鞋柜（浅木，32×24，柜面上一盆小草和一双鞋）
function shoeboxBack(): Furn {
  const img = new Img(32, 24);
  img.rect(0, 6, 32, 18, LT[1]); img.rect(0, 6, 32, 3, LT[3]); img.hline(0, 9, 32, LT[0]);
  planks(img, 2, 11, 28, 11, LT[2], LT[1], LT[3], 9); img.hline(2, 21, 28, LT[0]); // 背板
  img.rect(2, 22, 3, 2, W[0]); img.rect(27, 22, 3, 2, W[0]);
  // 小草在左边了（左右对调）
  img.rect(4, 3, 6, 4, c('#a05a3a')); img.rect(5, 0, 4, 4, PAL.leaf[3]); img.set(7, 0, PAL.leaf[5]); img.set(5, 1, PAL.leaf[1]); img.set(8, 1, PAL.leaf[1]);
  // 鞋跟朝着我们：两个鞋跟 + 鞋面一线
  img.rect(19, 4, 4, 2, c('#d8d8e0')); img.rect(24, 4, 3, 2, c('#d8d8e0')); img.hline(19, 3, 8, c('#e86a6a')); img.hline(19, 6, 8, c('#8a8a98'));
  return f(img, 2, 1);
}
function shoeboxEnd(front: Side): Furn {
  const P: EndPal = { top: LT[3], topHi: c('#fff2d0'), topLo: LT[2], face: LT[1], hi: LT[2], lo: LT[0], edge: LT[2], edgeHi: LT[3] };
  const e = endBlock(32, 18, 4, P, front, 8), img = e.img, y = e.faceY, px = front === 'l' ? 5 : 2;
  img.rect(px, y + 1, 9, e.faceH - 5, LT[2]); img.hline(px, y + 1, 9, LT[3]); img.vline(px + 8, y + 2, e.faceH - 6, LT[1]); img.hline(px + 1, y + 6, 7, LT[1]); // 侧嵌板 + 一道层板槽
  img.rect(1, y + e.faceH - 2, 3, 2, W[0]); img.rect(12, y + e.faceH - 2, 3, 2, W[0]); // 柜脚
  // 小草在原来的右端：朝西时右端 = 南端（靠近我们），朝东时是北端；鞋在另一端
  const south = e.topY + e.topH - 2, north = e.topY + 4, plant = front === 'l' ? south : north, shoe = front === 'l' ? north : south;
  const pot = (by: number) => { img.rect(5, by - 2, 6, 3, c('#a05a3a')); img.hline(5, by - 2, 6, c('#c0714a')); img.rect(6, by - 5, 4, 3, PAL.leaf[3]); img.set(7, by - 5, PAL.leaf[5]); img.set(6, by - 4, PAL.leaf[1]); img.set(9, by - 3, PAL.leaf[1]); };
  const shoes = (sy: number) => { for (const x of [3, 9]) { img.rect(x, sy - 4, 4, 5, c('#d8d8e0')); img.vline(x, sy - 4, 5, c('#e86a6a')); img.hline(x, sy, 4, c('#8a8a98')); } };
  if (front === 'l') { shoes(shoe); pot(plant); } else { pot(plant); shoes(shoe); } // 北端的先画，南端的盖在前面
  return f(img, 1, 2);
}

// ------------------------------------------------------------------ 冰箱（黑色双门，16×38，本体 x1..14）
const FR = { body: c('#2c2f3a'), hi: c('#454a5a'), dark: c('#14161e'), mid: c('#3a3f4c'), lo: c('#1f222b') };
function fridgeBack(): Furn {
  const img = new Img(16, 38);
  img.rect(1, 0, 14, 37, FR.body); img.hline(1, 0, 14, FR.hi); img.vline(1, 0, 37, FR.mid); img.vline(14, 0, 37, FR.lo);
  for (const x of [4, 7, 10]) img.vline(x, 3, 19, FR.mid); // 冷凝管
  img.hline(3, 3, 9, FR.mid); img.hline(3, 21, 9, FR.mid);
  img.rect(3, 25, 10, 8, FR.dark); for (let y = 26; y < 33; y += 2) img.hline(3, y, 10, FR.mid); // 压缩机散热栅格
  img.rect(11, 22, 2, 2, M[1]); img.set(11, 22, M[3]); // 铭牌
  img.vline(13, 33, 4, FR.dark); // 电源线
  img.rect(1, 36, 14, 1, FR.dark);
  return f(img, 1, 1);
}
function fridgeEnd(front: Side): Furn {
  const img = new Img(16, 38), x0 = front === 'l' ? 3 : 1; // 本体 12 宽，把手那一侧留一格
  img.rect(1, 0, 14, 37, FR.body); img.hline(1, 0, 14, FR.hi); img.vline(1, 0, 37, FR.mid); img.vline(14, 0, 37, FR.lo);
  const fe = front === 'l' ? 1 : 11; // 门边 4px：比侧板稍亮，门缝是一道暗线
  img.rect(fe, 1, 4, 36, FR.mid); img.hline(fe, 14, 4, FR.dark); img.vline(front === 'l' ? fe : fe + 3, 1, 36, front === 'l' ? FR.hi : FR.body);
  const hx = front === 'l' ? 0 : 15; // 把手：从门边上凸出来的一线
  img.rect(hx, 5, 1, 6, M[3]); img.rect(hx, 18, 1, 9, M[3]);
  img.vline(front === 'l' ? 8 : 6, 4, 24, FR.lo); // 侧板上的一道浅槽
  img.rect(front === 'l' ? 5 : 3, 30, 8, 3, FR.mid); // 下面的踢脚板
  img.rect(1, 36, 14, 1, FR.dark);
  return f(img, 1, 1);
}

// ------------------------------------------------------------------ 衣帽架（立杆 + 钩子，外套挂一边、帽子挂另一边，16×36）
const COAT = { a: c('#2f4a7a'), b: c('#3f5f98'), d: c('#223a62'), gold: c('#e0c050') };
const HAT = { a: c('#c4503c'), b: c('#d4483c'), d: c('#8a2a22') };
function rackBase(img: Img) {
  img.rect(7, 3, 2, 31, W[2]); img.vline(7, 3, 31, W[3]); img.rect(4, 32, 8, 2, W[1]); img.hline(4, 32, 8, W[3]); img.rect(3, 34, 10, 2, W[0]);
  img.hline(4, 3, 8, W[2]); img.set(4, 2, W[2]); img.set(11, 2, W[2]); img.hline(5, 8, 6, W[2]);
}
function coatrackBack(): Furn {
  const img = new Img(16, 36); rackBase(img);
  img.rect(1, 5, 5, 3, HAT.a); img.rect(2, 3, 3, 3, HAT.b); img.hline(1, 7, 5, HAT.d); // 帽子换到左边
  img.rect(9, 9, 7, 17, COAT.a); img.rect(9, 9, 7, 2, COAT.b); img.vline(12, 11, 15, COAT.d); img.hline(9, 25, 7, COAT.d); img.rect(10, 9, 5, 1, COAT.d); // 外套的背面：后中缝 + 领口
  img.vline(9, 11, 15, COAT.b); // 袖子的边
  return f(img, 1, 1);
}
function coatrackSide(front: Side): Furn {
  const img = new Img(16, 36);
  const hat = () => { img.rect(6, 3, 4, 3, HAT.b); img.hline(6, 3, 4, c('#e86a5a')); img.rect(4, 6, 8, 2, HAT.a); img.hline(4, 7, 8, HAT.d); }; // 侧面的帽子：帽顶 + 一圈帽檐
  const coat = (x: number, wd: number) => {
    img.rect(x, 9, wd, 17, COAT.a); img.rect(x, 9, wd, 2, COAT.b); img.hline(x, 25, wd, COAT.d);
    img.vline(x + (front === 'l' ? 0 : wd - 1), 11, 15, COAT.b); img.vline(x + (front === 'l' ? wd - 1 : 0), 11, 15, COAT.d);
    const bx = front === 'l' ? x : x + wd - 1; img.set(bx, 14, COAT.gold); img.set(bx, 18, COAT.gold); // 扣子在门襟那一侧
  };
  if (front === 'l') { hat(); rackBase(img); coat(5, 6); } // 朝西：外套在南面（前），帽子在北面（后，被立杆挡了一半）
  else { coat(5, 6); rackBase(img); hat(); }                // 朝东：外套在后面，帽子在前面
  return f(img, 1, 1);
}

// ------------------------------------------------------------------ 电视柜（黑色电视放在木柜上，32×34）
const TV = { k: c('#23262f'), k2: c('#2f333f'), k3: c('#3a3f4c'), scr: c('#4a78b0') };
function tvBack(): Furn {
  const img = new Img(32, 34);
  img.rect(2, 0, 28, 21, TV.k); img.hline(2, 0, 28, TV.k3); img.vline(2, 0, 21, TV.k2);
  img.rect(4, 2, 24, 16, TV.k2); img.rect(9, 4, 14, 12, TV.k3); img.hline(9, 4, 14, c('#4a4f60')); // 后壳的鼓包
  for (let y = 6; y < 15; y += 2) img.hline(11, y, 10, TV.k2); // 散热孔
  for (const [x, col] of [[5, '#e8584a'], [8, '#e8e4da'], [11, '#f2c230']] as const) img.rect(x, 18, 2, 2, c(col)); // 接口
  img.rect(12, 21, 8, 2, TV.k); img.vline(6, 20, 8, c('#14161e')); img.vline(9, 20, 6, c('#14161e')); // 线缆垂下来
  img.rect(0, 23, 32, 11, LT[1]); img.rect(0, 23, 32, 2, LT[3]); img.hline(0, 25, 32, LT[0]);
  planks(img, 2, 27, 28, 6, LT[2], LT[1], LT[3], 9);
  img.rect(5, 26, 3, 3, c('#14161e')); img.hline(5, 26, 3, TV.k3); // 柜背板上的走线孔
  return f(img, 2, 1);
}
function tvEnd(front: Side): Furn {
  const P: EndPal = { top: LT[3], topHi: c('#fff2d0'), topLo: LT[2], face: LT[1], hi: LT[2], lo: LT[0], edge: LT[2], edgeHi: LT[3] };
  const e = endBlock(32, 11, 2, P, front, 22), img = e.img, y = e.faceY, px = front === 'l' ? 5 : 2;
  img.rect(px, y + 1, 9, e.faceH - 3, LT[2]); img.hline(px, y + 1, 9, LT[3]); img.vline(px + 8, y + 2, e.faceH - 4, LT[1]); // 柜侧嵌板
  // 电视的侧影：站在顶面中间，屏幕一侧是薄薄的一片，后面是鼓出来的后壳；屏幕朝着正面那一侧
  const by = e.topY + Math.round(e.topH / 2) + 3, h0 = 21, top = by - h0, fx = front === 'l' ? 3 : 8; // fx：屏幕片的 x
  const bx = front === 'l' ? 6 : 3;                                                                       // 后壳在屏幕的另一边
  img.rect(bx, top + 3, 5, h0 - 7, TV.k2); img.hline(bx, top + 3, 5, TV.k3); img.vline(front === 'l' ? bx + 4 : bx, top + 4, h0 - 8, TV.k);
  img.rect(fx, top, 5, h0, TV.k); img.hline(fx, top, 5, TV.k3);
  img.vline(front === 'l' ? fx : fx + 4, top + 1, h0 - 3, TV.scr); // 屏幕的一线蓝光
  img.rect(front === 'l' ? 5 : 4, by - 2, 7, 3, TV.k); // 底座
  return f(img, 1, 2);
}

// ------------------------------------------------------------------ 观赏鱼缸（木柜上一只带灯的玻璃缸，32×34）
const TK = { rim: c('#a8d8ec'), w1: c('#4a98c8'), w2: c('#6fb8e0'), w3: c('#9ad4f0'), sand: c('#d8c08a'), sand2: c('#ecd9a8'), fish: c('#f08a2a'), fish2: c('#e0601a'), eye: c('#2a1f2e') };
function tankBack(): Furn {
  const img = new Img(32, 34);
  img.rect(0, 0, 32, 4, M[1]); img.hline(0, 0, 32, M[3]); img.rect(4, 3, 24, 1, c('#fff2c0')); img.rect(26, 1, 4, 2, M[0]); // 灯罩 + 后面的灯座
  img.rect(0, 4, 32, 20, TK.rim); img.rect(1, 5, 30, 18, c('#3e88b8')); img.rect(1, 5, 30, 3, TK.w1); img.hline(14, 12, 10, TK.w3); img.hline(4, 16, 8, TK.w3);
  img.rect(1, 20, 30, 3, TK.sand); img.hline(1, 20, 30, TK.sand2);
  for (const x of [5, 27]) { img.vline(x, 12, 8, PAL.leaf[3]); img.vline(x - 1, 14, 6, PAL.leaf[2]); img.vline(x + 1, 15, 5, PAL.leaf[4]); } // 水草左右对调
  const fish = (x: number, y: number, flip: boolean) => { img.rect(x, y, 5, 3, TK.fish); img.set(flip ? x + 5 : x - 1, y + 1, TK.fish); img.set(flip ? x + 5 : x - 1, y, TK.fish2); img.set(flip ? x + 1 : x + 3, y, TK.eye); };
  fish(21, 9, true); fish(11, 14, false);
  img.rect(24, 5, 2, 15, c('#2a2f3a')); img.rect(24, 5, 2, 2, c('#565c6c')); // 缸里的过滤吸水管（从后面才看得清）
  img.vline(29, 3, 21, c('#14161e')); // 灯的电线沿缸后面垂下去
  img.rect(0, 24, 32, 10, LT[1]); img.rect(0, 24, 32, 2, LT[3]); img.hline(0, 26, 32, LT[0]);
  planks(img, 2, 28, 28, 5, LT[2], LT[1], LT[3], 9);
  return f(img, 2, 1);
}
function tankEnd(front: Side): Furn {
  const rise = 0, cabH = 10, glassH = 20, hoodH = 3, topH = 8 + 4;
  const h = rise + topH + hoodH + glassH + cabH, img = new Img(16, h);
  const fe = front === 'l' ? 0 : 13;
  // 灯罩顶面（往北延伸）
  img.rect(0, 0, 16, topH, M[2]); img.hline(0, 0, 16, M[3]); for (let x = 4; x < 15; x += 5) img.vline(x, 2, topH - 3, M[1]);
  img.rect(front === 'l' ? 11 : 2, 3, 3, 3, M[0]); img.set(front === 'l' ? 12 : 3, 3, M[1]); // 灯座旋钮
  // 灯罩侧面 + 灯管
  const hy = topH; img.rect(0, hy, 16, hoodH, M[1]); img.hline(0, hy, 16, M[3]); img.rect(2, hy + 2, 12, 1, c('#fff2c0'));
  // 玻璃缸的侧截面：水、沙、水草、一条侧面的鱼
  const gy = hy + hoodH; img.rect(0, gy, 16, glassH, TK.rim); img.rect(1, gy, 14, glassH - 1, TK.w1); img.rect(1, gy, 14, 3, TK.w2);
  img.hline(3, gy + 7, 8, TK.w3); img.hline(5, gy + 12, 7, TK.w3);
  img.rect(1, gy + glassH - 4, 14, 3, TK.sand); img.hline(1, gy + glassH - 4, 14, TK.sand2);
  const px = front === 'l' ? 11 : 3; img.vline(px, gy + 7, 9, PAL.leaf[3]); img.vline(px + 1, gy + 9, 7, PAL.leaf[2]); img.vline(px - 1, gy + 10, 6, PAL.leaf[4]);
  const fxs = front === 'l' ? 3 : 8; img.rect(fxs, gy + 5, 5, 3, TK.fish); img.set(front === 'l' ? fxs - 1 : fxs + 5, gy + 6, TK.fish); img.set(front === 'l' ? fxs - 1 : fxs + 5, gy + 5, TK.fish2); img.set(front === 'l' ? fxs + 1 : fxs + 3, gy + 5, TK.eye); // 鱼头朝着正面
  img.vline(0, gy, glassH, c('#c8ecf8')); img.vline(15, gy, glassH, c('#6aa8c8'));
  img.set(7, gy + 3, c('#d8f0ff')); img.set(8, gy + 1, c('#d8f0ff'));
  // 木柜的侧板
  const cy = gy + glassH; img.rect(0, cy, 16, cabH, LT[1]); img.hline(0, cy, 16, LT[3]); img.hline(0, cy + 2, 16, LT[0]); img.vline(0, cy, cabH, LT[2]); img.vline(15, cy, cabH, LT[0]);
  img.rect(front === 'l' ? 5 : 2, cy + 4, 9, 5, LT[2]); img.hline(front === 'l' ? 5 : 2, cy + 4, 9, LT[3]);
  img.rect(fe, cy, 3, cabH, LT[2]); img.vline(front === 'l' ? 3 : 12, cy, cabH, LT[0]); // 柜门边
  return f(img, 1, 2);
}

// ------------------------------------------------------------------ 衣柜（深木双开门，32×54）
function wardrobeBack(): Furn {
  const img = new Img(32, 54);
  img.rect(0, 0, 32, 54, W[1]); img.hline(0, 0, 32, W[3]); img.rect(0, 0, 32, 4, W[2]); img.hline(0, 3, 32, W[0]);
  planks(img, 2, 6, 28, 42, W[2], W[1], W[3], 7); img.rect(2, 6, 1, 42, W[1]); img.rect(29, 6, 1, 42, W[0]); // 背板
  img.hline(2, 20, 28, W[1]); img.hline(2, 21, 28, W[3]); img.hline(2, 36, 28, W[1]); img.hline(2, 37, 28, W[3]); // 横梁
  img.rect(0, 50, 32, 4, W[0]); img.hline(0, 49, 32, W[0]);
  return f(img, 2, 1);
}
function wardrobeEnd(front: Side): Furn {
  const P: EndPal = { top: W[2], topHi: W[4], topLo: W[1], face: W[1], hi: W[2], lo: W[0], edge: W[3], edgeHi: W[4] };
  const e = endBlock(32, 54, 4, P, front), img = e.img, y = e.faceY, px = front === 'l' ? 5 : 2;
  img.rect(px, y + 3, 9, e.faceH - 12, W[2]); img.hline(px, y + 3, 9, W[3]); img.vline(px + 8, y + 4, e.faceH - 13, W[1]); // 侧嵌板
  img.rect(px + 2, y + 6, 5, 6, W[1]); img.hline(px + 2, y + 6, 5, W[0]); // 一块压花
  img.hline(px + 1, y + 20, 7, W[1]);
  img.rect(front === 'l' ? 0 : 13, y + 20, 1, 8, M[3]); // 门拉手从门边露出一线
  img.rect(0, y + e.faceH - 4, 16, 4, W[0]); img.hline(0, y + e.faceH - 5, 16, W[0]);
  return f(img, 1, 2);
}

// ------------------------------------------------------------------ 宝箱（木箱 + 金属包角 + 锁扣，16×20）
const GOLD = c('#c9a43c'), GOLD_HI = c('#f0d56a');
function chestBack(): Furn {
  const img = new Img(16, 20);
  img.rect(1, 6, 14, 13, W[2]); img.hline(1, 6, 14, W[4]); img.rect(2, 8, 12, 9, W[1]); img.hline(2, 8, 12, W[2]); // 后板，素的
  img.rect(1, 2, 14, 5, W[3]); img.hline(2, 1, 12, W[4]); img.hline(2, 2, 12, W[4]); img.rect(1, 3, 14, 3, W[2]); img.hline(1, 6, 14, W[0]);
  for (const x of [3, 11]) { img.rect(x, 1, 2, 18, GOLD); img.vline(x, 1, 18, GOLD_HI); } // 包带
  for (const x of [2, 10]) { img.rect(x, 4, 4, 4, M[2]); img.hline(x, 4, 4, M[3]); img.set(x + 1, 5, W[0]); img.set(x + 2, 6, W[0]); } // 铰链板 + 铆钉
  img.rect(1, 17, 14, 2, M[1]); img.hline(1, 6, 14, M[2]);
  return f(img, 1, 1);
}
function chestSide(front: Side): Furn {
  const img = new Img(16, 20);
  img.rect(1, 6, 14, 13, W[2]); img.hline(1, 6, 14, W[4]); img.rect(3, 8, 10, 9, W[3]); img.hline(3, 8, 10, W[4]); img.vline(12, 9, 8, W[2]); // 侧板 + 嵌板
  // 圆弧盖的侧影
  img.rect(3, 1, 10, 1, W[4]); img.rect(2, 2, 12, 1, W[3]); img.rect(1, 3, 14, 3, W[3]); img.rect(1, 5, 14, 2, W[2]); img.hline(1, 6, 14, W[0]);
  img.hline(3, 1, 10, W[4]); img.vline(1, 3, 3, W[4]);
  img.rect(1, 17, 14, 2, M[1]); img.hline(1, 6, 14, M[2]);
  // 前后两条竖包带（箱子的前后沿）+ 盖上的弧形包带
  for (const x of [1, 12]) { img.rect(x, 7, 3, 12, GOLD); img.vline(x, 7, 12, GOLD_HI); }
  for (const x of [1, 12]) { img.rect(x, 3, 3, 4, GOLD); img.vline(x, 3, 4, GOLD_HI); }
  const lx = front === 'l' ? 0 : 15; img.rect(lx, 8, 1, 5, GOLD); img.set(lx, 8, GOLD_HI); img.set(lx, 10, W[0]); // 前沿上的锁扣露出一线
  return f(img, 1, 1);
}

export const STORAGE_VIEWS: Record<string, ViewMap> = {
  shelf2: { 90: () => shelfEnd(2, 'l'), 180: () => shelfBack(2), 270: () => shelfEnd(2, 'r') },
  shelf3: { 90: () => shelfEnd(3, 'l'), 180: () => shelfBack(3), 270: () => shelfEnd(3, 'r') },
  cab2: { 90: () => cab2End('l'), 180: cab2Back, 270: () => cab2End('r') },
  dc_shoebox: { 90: () => shoeboxEnd('l'), 180: shoeboxBack, 270: () => shoeboxEnd('r') },
  fridge: { 90: () => fridgeEnd('l'), 180: fridgeBack, 270: () => fridgeEnd('r') },
  dc_coatrack: { 90: () => coatrackSide('l'), 180: coatrackBack, 270: () => coatrackSide('r') },
  dc_tv: { 90: () => tvEnd('l'), 180: tvBack, 270: () => tvEnd('r') },
  dc_tank: { 90: () => tankEnd('l'), 180: tankBack, 270: () => tankEnd('r') },
  dwardrobe: { 90: () => wardrobeEnd('l'), 180: wardrobeBack, 270: () => wardrobeEnd('r') },
  dchest: { 90: () => chestSide('l'), 180: chestBack, 270: () => chestSide('r') },
};
