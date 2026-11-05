/**
 * 共享单车（小黄车）：黄色车架 + 黄色车筐 + 黑色车座 + 实心感的轮子。只画通用的"共享单车"形态，
 * 不画任何品牌标志。骑行时骑手是人物精灵（只留上半身），自行车分两层叠在骑手前后：
 *   bike_{dir}_{帧}   骑手身后的一层：车架、车轮、踩踏的腿（4 帧 = 曲柄转一圈）
 *   bikef_down_{帧}   只有朝下（正面）时才需要：骑手身前的一层（前轮、车把、车筐）
 *   bike_parked_r/l   停放的空车（带脚撑），摆在车架旁
 * 每帧 30×22（含 1px 描边），脚点 = (16, 21)。朝左由朝右镜像得到。
 */
import { Img, hex, type RGBA } from './px.ts';

export type BikeDir = 'down' | 'up' | 'left' | 'right';
export const BIKE_W = 30, BIKE_H = 22, BIKE_AX = 16, BIKE_AY = 21;

const Y = { base: hex('#ffc800'), light: hex('#ffe566'), shade: hex('#d99a00'), dark: hex('#a26a00') };
const TYRE = hex('#2b2b36'), RIM = hex('#cfd3de'), DISC = hex('#8b92a4'), SPOKE = hex('#e4e7ee');
const SADDLE = hex('#2a2630'), SADDLE_HI = hex('#5a5668'), STEEL = hex('#6a7084'), STEEL_L = hex('#a6adbd');
const LEG = hex('#3d4258'), LEG_FAR = hex('#2a2e40'), SHOE = hex('#2a2430'), SHOE_HI = hex('#8a8498');

function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: RGBA, thick = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    img.set(x0, y0, c);
    if (thick > 1) { if (dx >= -dy) img.set(x0, y0 + 1, c); else img.set(x0 + 1, y0, c); }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 侧视车轮：胎 → 圈 → 盘面 → 随帧转动的辐条 → 轴 */
function wheel(img: Img, cx: number, cy: number, f: number) {
  img.ellipse(cx, cy, 5.5, 5.5, TYRE);
  img.ellipse(cx, cy, 4.2, 4.2, RIM);
  img.ellipse(cx, cy, 3.4, 3.4, DISC);
  const a0 = (f * Math.PI) / 8; // 4 帧转 1/4 圈：辐条 4 根，对称，所以看起来是连续转动
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    line(img, cx, cy, cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4, SPOKE);
  }
  img.set(cx, cy, Y.base);
}

/** 正/背视车轮：窄窄的一条 */
function wheelThin(img: Img, cx: number, cy: number, f: number) {
  img.ellipse(cx, cy, 1.9, 5.5, TYRE);
  img.rect(cx - 1, cy - 4, 2, 8, DISC);
  for (let y = cy - 4 + (f % 2); y < cy + 4; y += 2) img.set(cx, y, SPOKE);
}

function basketSide(img: Img, x0: number, y0: number) {
  img.rect(x0, y0, 7, 5, Y.shade);
  img.rect(x0 + 1, y0 + 1, 5, 3, Y.base);
  for (let x = x0 + 2; x < x0 + 6; x += 2) img.vline(x, y0 + 1, 3, Y.shade);
  img.hline(x0, y0, 7, Y.light);
  img.hline(x0, y0 + 4, 7, Y.dark);
}

/** 侧视（朝右）：riderLegs = 带不带骑手的腿；parked = 停放（脚撑，无腿） */
function side(f: number, o: { legs: boolean; parked?: boolean }): Img {
  const img = new Img(BIKE_W - 2, BIKE_H - 2); // 描边前 28×20，脚点在底边
  const wy = 14.5, rear = 6.5, front = 22.5, bb: [number, number] = [13.5, 15];
  const th = f * (Math.PI / 2); // 曲柄角度
  const pedal = (a: number): [number, number] => [bb[0] + Math.cos(a) * 3, bb[1] + Math.sin(a) * 3];
  const hip: [number, number] = [11.5, 7.5];
  const leg = (a: number, c: RGBA, shoe: boolean) => {
    const p = pedal(a), k: [number, number] = [(hip[0] + p[0]) / 2 + 2, (hip[1] + p[1]) / 2 - 1];
    line(img, hip[0], hip[1], k[0], k[1], c, 2); line(img, k[0], k[1], p[0], p[1] - 1, c, 2);
    img.rect(Math.round(p[0]) - 1, Math.round(p[1]), 4, 2, SHOE); if (shoe) img.hline(Math.round(p[0]) - 1, Math.round(p[1]), 4, SHOE_HI);
  };
  if (o.legs) leg(th + Math.PI, LEG_FAR, false);
  // 车轮
  wheel(img, rear, wy, f); wheel(img, front, wy, f);
  // 后挡泥板（黄）与后锁
  for (let a = 200; a <= 340; a += 12) img.set(Math.round(rear + Math.cos((a * Math.PI) / 180) * 6.6), Math.round(wy + Math.sin((a * Math.PI) / 180) * 6.6), Y.shade);
  img.rect(1, 8, 4, 3, hex('#3a3f4c')); img.hline(1, 8, 4, STEEL); img.set(4, 9, hex('#5fe08a'));
  // 车架：座管、链条架、座架、下管、前叉、车把
  line(img, bb[0], bb[1], 11.5, 8.5, Y.base, 2);
  line(img, bb[0], bb[1], rear, wy, Y.shade);
  line(img, 11, 10, rear, wy, Y.shade);
  line(img, 20.5, 9.5, bb[0] + 1, bb[1] - 0.5, Y.base, 2);
  line(img, 20.5, 8.5, front, wy, Y.base, 2);
  img.rect(19, 7, 3, 3, Y.base); img.hline(19, 7, 3, Y.light); // 头管
  line(img, 20, 6.5, 18, 5, STEEL_L); img.rect(16, 4, 3, 2, hex('#2a2630')); // 车把与握把
  // 车座
  img.rect(8, 6, 7, 2, SADDLE); img.hline(8, 6, 7, SADDLE_HI); img.set(15, 7, SADDLE);
  // 车筐
  basketSide(img, 21, 4);
  img.hline(21, 9, 2, STEEL);
  // 曲柄、踏板
  const p1 = pedal(th); line(img, bb[0], bb[1], p1[0], p1[1], STEEL_L); img.set(Math.round(bb[0]), Math.round(bb[1]), Y.dark);
  if (o.legs) leg(th, LEG, true);
  if (o.parked) { line(img, 10, 17, 8, 19.5, STEEL); img.hline(7, 19, 3, STEEL); } // 脚撑
  return img;
}

/** 正视（朝下）：返回 [骑手身后一层, 骑手身前一层] */
function front(f: number): [Img, Img] {
  const back = new Img(BIKE_W - 2, BIKE_H - 2), fr = new Img(BIKE_W - 2, BIKE_H - 2);
  const cx = 14, th = f * (Math.PI / 2);
  const yl = 14 + Math.round(Math.cos(th) * 2.6), yr = 14 - Math.round(Math.cos(th) * 2.6); // 左右踏板上下交替
  const leg = (hx: number, px: number, py: number, c: RGBA) => { line(back, hx, 8, px, py - 1, c, 2); back.rect(px - 1, py, 4, 2, SHOE); back.hline(px - 1, py, 4, SHOE_HI); };
  leg(11, 9, yl, LEG); leg(17, 18, yr, LEG);
  line(back, cx, 8, cx, 15, Y.base, 2); // 座管/车架
  back.rect(cx - 3, 6, 7, 2, SADDLE); back.hline(cx - 3, 6, 7, SADDLE_HI);
  back.rect(cx - 1, 14, 3, 2, Y.dark); // 中轴
  // 前一层：前轮、车把、车筐
  wheelThin(fr, cx, 14.5, f);
  fr.rect(cx - 1, 8, 3, 4, Y.base); fr.vline(cx - 1, 8, 4, Y.light); // 前叉
  fr.rect(5, 6, 19, 2, Y.base); fr.hline(5, 6, 19, Y.light); fr.rect(3, 5, 3, 4, SADDLE); fr.rect(23, 5, 3, 4, SADDLE); // 车把 + 握把
  fr.rect(9, 8, 11, 6, Y.shade); fr.rect(10, 9, 9, 4, Y.base);
  for (let x = 11; x < 19; x += 2) fr.vline(x, 9, 4, Y.shade);
  fr.hline(9, 8, 11, Y.light); fr.hline(9, 13, 11, Y.dark);
  return [back, fr];
}

/** 背视（朝上）：骑手挡在前面，只露出握把两端、后轮、挡泥板与后锁 */
function rearView(f: number): Img {
  const img = new Img(BIKE_W - 2, BIKE_H - 2);
  const cx = 14, th = f * (Math.PI / 2);
  const yl = 14 + Math.round(Math.cos(th) * 2.6), yr = 14 - Math.round(Math.cos(th) * 2.6);
  const leg = (hx: number, px: number, py: number, c: RGBA) => { line(img, hx, 8, px, py - 1, c, 2); img.rect(px - 1, py, 4, 2, SHOE); img.hline(px - 1, py, 4, SHOE_HI); };
  leg(11, 9, yl, LEG_FAR); leg(17, 18, yr, LEG_FAR);
  img.rect(3, 5, 3, 4, SADDLE); img.rect(23, 5, 3, 4, SADDLE); img.rect(5, 6, 19, 2, Y.shade); // 车把（握把两端露出来）
  img.rect(cx - 3, 6, 7, 2, SADDLE); img.hline(cx - 3, 6, 7, SADDLE_HI);
  line(img, cx, 8, cx, 15, Y.shade, 2);
  wheelThin(img, cx, 14.5, f);
  img.rect(cx - 2, 8, 5, 3, Y.base); img.hline(cx - 2, 8, 5, Y.light); // 后挡泥板
  img.rect(cx - 2, 11, 5, 3, hex('#3a3f4c')); img.hline(cx - 2, 11, 5, STEEL); img.set(cx, 12, hex('#5fe08a')); // 后锁
  return img;
}

const fin = (raw: Img): Img => {
  const o = raw.outlinedSoft(0.4, [60, 40, 20, 255]);
  const out = new Img(o.w, o.h + 1);
  for (let y = o.h - 3; y < o.h + 1; y++) for (let x = 3; x < o.w - 3; x++) {
    const dx = (x + 0.5 - o.w / 2) / 12.5, dy = (y + 0.5 - (o.h - 0.4)) / 1.7;
    if (dx * dx + dy * dy <= 1) out.set(x, y, [28, 36, 66, dx * dx + dy * dy > 0.5 ? 34 : 62]);
  }
  out.blit(o, 0, 0);
  return out;
};
const mirror = (r: Img): Img => { const m = new Img(r.w, r.h); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.get(r.w - 1 - x, y); if (c[3]) m.set(x, y, c); } return m; };

export interface BikeFrames { frames: Record<string, Img> }
export function buildBikes(): Record<string, Img> {
  const frames: Record<string, Img> = {};
  for (let f = 0; f < 4; f++) {
    const r = fin(side(f, { legs: true }));
    frames[`bike_right_${f}`] = r; frames[`bike_left_${f}`] = mirror(r);
    const [b, fr] = front(f);
    frames[`bike_down_${f}`] = fin(b); frames[`bikef_down_${f}`] = fin(fr);
    frames[`bike_up_${f}`] = fin(rearView(f));
  }
  const parked = fin(side(0, { legs: false, parked: true }));
  frames['bike_parked_r'] = parked; frames['bike_parked_l'] = mirror(parked);
  return frames;
}

/**
 * 骑手摆位（相对"脚点"，像素）：把人物精灵抬高、只留上半身坐在车座上。
 * crop = 保留人物帧顶部多少行（去掉腿和脚）；dy = 抬高多少；dx 按朝向左右错开（侧面时身体在车座上，不在车正中）。
 */
export const RIDER = { crop: 35, dy: 5, dx: { right: -2, left: 2, down: 0, up: 0 } };
