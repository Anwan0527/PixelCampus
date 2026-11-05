/** 校园小品：路灯、长椅、校石、指示牌、花坛、垃圾桶。 */
import { Img, Rng, hash2, vnoise, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import type { Sprite } from './nature.ts';

const sh = (img: Img, cx: number, cy: number, rx: number, ry: number) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1 && img.alpha(x, y) === 0) img.set(x, y, [28, 36, 66, 52]);
  }
};

export function lamp(): Sprite {
  const m = PAL.metal;
  const img = new Img(12, 40);
  img.rect(5, 12, 2, 24, m[1]); img.vline(5, 12, 24, m[2]); // 杆
  img.rect(3, 35, 6, 3, m[1]); img.hline(3, 35, 6, m[2]); // 底座
  img.rect(2, 4, 8, 8, m[0]); // 灯罩外框
  img.rect(3, 5, 6, 6, PAL.lampGlow); img.rect(3, 5, 6, 2, [255, 248, 214, 255]);
  img.rect(1, 2, 10, 2, m[1]); img.hline(1, 2, 10, m[3]); // 灯帽
  const out = img.outlined(PAL.outline);
  sh(out, 7, 39, 6, 2);
  return { img: out, ax: 7, ay: 39, block: { x: -2, y: -3, w: 4, h: 3 } };
}

export function bench(): Sprite {
  const w = PAL.wood;
  const img = new Img(24, 14);
  img.rect(2, 9, 2, 4, PAL.metal[1]); img.rect(20, 9, 2, 4, PAL.metal[1]);
  img.rect(1, 4, 22, 5, w[3]); img.hline(1, 4, 22, w[4]); img.hline(1, 8, 22, w[1]); img.hline(1, 6, 22, w[2]);
  img.rect(1, 0, 22, 3, w[2]); img.hline(1, 0, 22, w[3]); img.hline(1, 2, 22, w[0]);
  const out = img.outlined(PAL.outline);
  sh(out, 13, 15, 11, 2);
  return { img: out, ax: 13, ay: 15, block: { x: -11, y: -5, w: 22, h: 5 } };
}

export function rock(): Sprite {
  const img = new Img(40, 30);
  const L = [-0.5, -0.7];
  const blobs = [[20, 17, 17, 11], [12, 18, 10, 8], [29, 16, 10, 9], [20, 11, 12, 8]];
  const col: RGBA[] = [[104, 98, 96, 255], [138, 130, 122, 255], [170, 160, 148, 255], [200, 190, 172, 255], [226, 216, 196, 255]];
  for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) {
    let best = -1, bz = -1, bl = 0;
    blobs.forEach(([cx, cy, rx, ry], i) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 1) return;
      const z = Math.sqrt(1 - d2) + cy / 60;
      if (z > bz) { bz = z; best = i; bl = Math.max(0, dx * L[0] + dy * L[1] + Math.sqrt(1 - d2) * 0.5); }
    });
    if (best < 0) continue;
    let t = bl * 4.2 + (hash2(x, y, 3) - 0.5) * 0.9;
    img.set(x, y, col[Math.max(0, Math.min(4, Math.floor(t)))]);
  }
  // 校石上的红字（像素示意）
  for (let k = 0; k < 7; k++) img.set(13 + k * 2, 15 + (k % 2), [176, 52, 40, 255]);
  const out = img.outlined([60, 52, 52, 255]);
  sh(out, 21, 29, 17, 2.4);
  return { img: out, ax: 21, ay: 29, block: { x: -16, y: -9, w: 32, h: 9 } };
}

export function sign(): Sprite {
  const w = PAL.wood;
  const img = new Img(18, 24);
  img.rect(8, 10, 3, 13, w[1]);
  img.rect(1, 1, 16, 11, w[3]); img.hline(1, 1, 16, w[4]); img.hline(1, 11, 16, w[1]);
  for (let x = 3; x < 15; x += 2) img.set(x, 5 + (x % 4 ? 0 : 1), w[0]);
  const out = img.outlined(PAL.outline);
  sh(out, 10, 24, 6, 1.6);
  return { img: out, ax: 10, ay: 24, block: { x: -2, y: -3, w: 4, h: 3 } };
}

export function flowerbed(seed: number): Sprite {
  const rng = new Rng(seed * 11 + 7);
  const img = new Img(34, 18);
  img.rect(0, 4, 34, 13, PAL.stone[2]); img.rect(1, 5, 32, 11, PAL.dirt[1]);
  img.hline(0, 4, 34, PAL.stone[4]); img.hline(0, 16, 34, PAL.stone[0]);
  const cols: RGBA[] = [[238, 147, 182, 255], [246, 213, 80, 255], [247, 248, 250, 255], [143, 180, 240, 255], [232, 100, 90, 255]];
  for (let i = 0; i < 26; i++) {
    const x = 2 + rng.int(30), y = 6 + rng.int(9);
    img.set(x, y + 1, PAL.leaf[2]); img.set(x, y, rng.pick(cols));
  }
  const out = img.outlined(PAL.outline);
  sh(out, 18, 19, 16, 1.8);
  return { img: out, ax: 18, ay: 18, block: { x: -16, y: -10, w: 32, h: 10 } };
}

export function bin(): Sprite {
  // 2026-11-03 放大（原来 8×12 太小不显眼）：14×20 的绿色分类垃圾桶——盖子、横带、竖棱、回收标志，一眼能认出来
  const img = new Img(14, 20);
  const body = hex('#3f8a52'), bodyL = hex('#63b070'), bodyD = hex('#2a5e38'), lid = hex('#8a929a'), lidL = hex('#c4ccd4'), lidD = hex('#5a626a'), band = hex('#e8dcb0'), mark = hex('#f4f4ea');
  img.rect(1, 4, 12, 15, body); img.vline(1, 4, 15, bodyL); img.vline(12, 4, 15, bodyD); img.hline(1, 18, 12, bodyD);
  for (const x of [4, 7, 10]) img.vline(x, 5, 13, bodyD); // 竖棱
  img.rect(1, 9, 12, 2, band); img.hline(1, 10, 12, hex('#b8a878'));
  img.rect(0, 1, 14, 3, lid); img.hline(0, 1, 14, lidL); img.hline(0, 3, 14, lidD); img.rect(5, 0, 4, 2, lidD); img.hline(5, 0, 4, lidL); // 盖子 + 把手
  img.rect(5, 13, 4, 1, mark); img.set(5, 14, mark); img.set(8, 14, mark); img.set(6, 15, mark); img.set(7, 15, mark); img.set(6, 12, mark); img.set(7, 12, mark); // 回收标志（小三角）
  img.rect(2, 19, 3, 1, lidD); img.rect(9, 19, 3, 1, lidD); // 底座
  const out = img.outlined(PAL.outline);
  return { img: out, ax: 8, ay: 21, block: { x: -5, y: -4, w: 10, h: 4 } };
}

// ============================================================ 景观小品（第二批）
const shadow = (img: Img, cx: number, cy: number, rx: number, ry: number) => sh(img, cx, cy, rx, ry);
import { hex } from './px.ts';

/** 围栏（东西向一格）：砖柱 + 铁艺栏杆 */
export function fenceH(): Sprite {
  const img = new Img(16, 15);
  img.rect(0, 1, 16, 1, hex('#3a3f4c')); img.rect(0, 11, 16, 1, hex('#3a3f4c'));
  for (let x = 3; x < 14; x += 3) img.vline(x, 2, 9, hex('#565c6c'));
  img.rect(0, 2, 4, 13, PAL.brick[3]); img.rect(0, 2, 1, 13, PAL.brick[4]); img.rect(3, 2, 1, 13, PAL.brick[1]);
  img.rect(0, 0, 4, 3, PAL.sand[3]); img.hline(0, 0, 4, PAL.sand[4]);
  for (let y = 4; y < 14; y += 3) img.hline(1, y, 2, PAL.mortar);
  const out = img.outlined(PAL.outlineBrick);
  return { img: out, ax: 9, ay: 16, block: { x: -8, y: -3, w: 16, h: 3 } };
}
/** 围栏（南北向一格） */
export function fenceV(): Sprite {
  const img = new Img(6, 17);
  img.rect(1, 0, 2, 11, hex('#565c6c')); img.vline(1, 0, 11, hex('#7b8294'));
  img.rect(0, 9, 4, 8, PAL.brick[3]); img.rect(0, 9, 1, 8, PAL.brick[4]); img.rect(3, 9, 1, 8, PAL.brick[1]);
  img.rect(0, 8, 4, 2, PAL.sand[3]);
  const out = img.outlined(PAL.outlineBrick);
  return { img: out, ax: 4, ay: 18, block: { x: -2, y: -16, w: 4, h: 16 } };
}
export function reed(seed: number): Sprite {
  const rng = new Rng(seed * 13 + 1);
  const img = new Img(14, 20);
  for (let i = 0; i < 7; i++) {
    const x = 1 + rng.int(12), h = 8 + rng.int(10);
    img.vline(x, 20 - h, h, rng.pick([PAL.leaf[1], PAL.leaf[2], PAL.leaf[3]]));
    if (rng.chance(0.55)) { img.rect(x, 20 - h - 3, 2, 4, hex('#7a5233')); img.set(x, 20 - h - 3, hex('#a8794a')); }
  }
  return { img, ax: 7, ay: 20 };
}
export function lily(seed: number): Sprite {
  const rng = new Rng(seed * 29 + 5);
  const img = new Img(18, 9);
  for (let i = 0; i < 3; i++) {
    const cx = 3 + rng.int(12), cy = 3 + rng.int(4);
    img.ellipse(cx, cy, 3.4, 2, PAL.leaf[3]); img.ellipse(cx - 0.5, cy - 0.5, 2.2, 1.2, PAL.leaf[4]); img.set(cx + 2, cy, PAL.water[2]);
    if (rng.chance(0.6)) { img.set(cx, cy - 1, hex('#f8b9d0')); img.set(cx - 1, cy - 1, hex('#fde0ea')); img.set(cx + 1, cy - 1, hex('#f8b9d0')); }
  }
  return { img, ax: 9, ay: 5 };
}
export function pavilion(): Sprite {
  const img = new Img(44, 46);
  const roof = PAL.roofRed, stone = PAL.stone;
  img.rect(4, 36, 36, 8, stone[2]); img.rect(4, 36, 36, 2, stone[4]); img.rect(4, 43, 36, 1, stone[0]);
  for (const x of [7, 17, 25, 35]) { img.rect(x, 18, 3, 19, hex('#a8402f')); img.vline(x, 18, 19, hex('#d0663f')); }
  img.rect(5, 17, 34, 2, hex('#7e2f2a'));
  // 攒尖顶
  for (let y = 0; y < 18; y++) { const half = 5 + Math.floor(y * 1.5); const c = y < 4 ? roof[3] : y < 11 ? roof[2] : roof[1]; img.rect(22 - half, y + 1, half * 2, 1, c); }
  for (let y = 0; y < 18; y += 3) img.hline(22 - (5 + Math.floor(y * 1.5)), y + 2, (5 + Math.floor(y * 1.5)) * 2, roof[0]);
  img.rect(21, 0, 2, 4, hex('#d6a56c'));
  const out = img.outlined(PAL.outlineBrick);
  shadow(out, 23, 45, 20, 2.5);
  return { img: out, ax: 23, ay: 45, block: { x: -17, y: -8, w: 34, h: 8 } };
}
const CAR_COLORS = ['#c4503c', '#3f78c0', '#e8e4da', '#2f3342', '#d6a53a', '#3f9a58', '#8a8fa0'];
export function car(i: number): Sprite {
  const c = hex(CAR_COLORS[i % CAR_COLORS.length]);
  const lt: RGBA = [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40), 255], dk: RGBA = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.62, 255];
  const img = new Img(12, 22);
  img.rect(1, 2, 10, 19, c); img.rect(1, 2, 2, 19, lt); img.rect(9, 2, 2, 19, dk);
  img.rect(2, 4, 8, 5, PAL.glass[2]); img.rect(2, 4, 8, 1, PAL.glass[3]); img.rect(2, 14, 8, 3, PAL.glass[1]);
  img.rect(2, 9, 8, 5, lt); img.rect(1, 19, 10, 2, dk); img.set(2, 20, hex('#ffe9a8')); img.set(9, 20, hex('#ffe9a8'));
  img.rect(0, 5, 1, 3, hex('#2a1f2e')); img.rect(11, 5, 1, 3, hex('#2a1f2e')); img.rect(0, 15, 1, 3, hex('#2a1f2e')); img.rect(11, 15, 1, 3, hex('#2a1f2e'));
  const out = img.outlined(PAL.outline);
  shadow(out, 7, 23, 6, 1.6);
  return { img: out, ax: 7, ay: 23, block: { x: -5, y: -6, w: 10, h: 6 } };
}
export function bikeRack(): Sprite {
  const img = new Img(30, 16);
  img.rect(1, 12, 28, 2, PAL.metal[1]); img.hline(1, 12, 28, PAL.metal[3]);
  const cols = ['#c4503c', '#3f78c0', '#e0a53a', '#3f9a58', '#8a5aa8'];
  for (let i = 0; i < 4; i++) { const x = 3 + i * 7; img.rect(x, 4, 2, 8, hex(cols[i % cols.length])); img.rect(x - 1, 3, 4, 1, PAL.metal[0]); img.rect(x, 12, 2, 2, PAL.metal[0]); img.set(x + 1, 6, hex('#e8e4da')); }
  const out = img.outlined(PAL.outline);
  shadow(out, 16, 16, 14, 1.8);
  return { img: out, ax: 16, ay: 16, block: { x: -14, y: -4, w: 28, h: 4 } };
}
export function noticeBoard(): Sprite {
  const w = PAL.wood;
  const img = new Img(28, 28);
  img.rect(3, 18, 3, 9, w[1]); img.rect(22, 18, 3, 9, w[1]);
  img.rect(0, 1, 28, 18, w[3]); img.rect(1, 2, 26, 16, hex('#e9d8b4'));
  const cs = ['#c4503c', '#3f78c0', '#e0a53a', '#f7f8fa', '#3f9a58'];
  for (let i = 0; i < 7; i++) { const x = 2 + (i % 4) * 6 + (i > 3 ? 2 : 0), y = 3 + Math.floor(i / 4) * 8; img.rect(x, y, 5, 6, hex(cs[i % cs.length])); img.hline(x + 1, y + 2, 3, hex('#e8e4da')); }
  const out = img.outlined(PAL.outline);
  shadow(out, 15, 29, 11, 1.8);
  return { img: out, ax: 15, ay: 29, block: { x: -12, y: -4, w: 24, h: 4 } };
}
/**
 * 留言板（玩家留言收集意见）：64×52。顶上深色木牌（"留言板"三个字由客户端用像素字体写在牌上，
 * 牌面中心离脚点 46 px），下面是钉着各色便签的软木板，两条木腿。
 */
export function messageBoard(): Sprite {
  const w = PAL.wood, W = 64, H = 52, img = new Img(W, H);
  img.rect(8, 44, 5, 8, w[1]); img.rect(51, 44, 5, 8, w[1]); img.rect(8, 44, 1, 8, w[2]); img.rect(51, 44, 1, 8, w[2]);   // 腿
  img.rect(0, 12, W, 33, w[3]); img.rect(0, 12, W, 2, w[4]); img.rect(0, 43, W, 2, w[1]);                                  // 板框
  img.rect(3, 15, W - 6, 27, hex('#d6b583'));                                                                                // 软木
  for (let y = 15; y < 42; y++) for (let x = 3; x < W - 3; x++) { const h = hash2(x, y, 41); if (h < 0.07) img.set(x, y, hex('#b88f5c')); else if (h > 0.95) img.set(x, y, hex('#ecd3a6')); }
  const cs = ['#fbf3dc', '#f4b6c8', '#9ec7ea', '#bfe0b8', '#f6df8a'];
  const notes: [number, number, number, number][] = [[6, 17, 12, 10], [21, 18, 11, 9], [35, 16, 12, 11], [49, 18, 11, 9], [8, 30, 10, 9], [22, 29, 13, 10], [38, 30, 11, 9], [51, 29, 9, 10]];
  notes.forEach(([x, y, nw, nh], i) => {
    img.rect(x, y, nw, nh, hex(cs[i % cs.length])); img.rect(x + 1, y + nh, nw, 1, [60, 40, 20, 70]);
    for (let l = 3; l < nh - 1; l += 3) img.hline(x + 2, y + l, nw - 4, hex('#c9bfa6'));
    img.set(x + Math.floor(nw / 2), y + 1, hex('#c4503c'));                                                                  // 图钉
  });
  img.rect(2, 0, W - 4, 11, w[1]); img.rect(2, 0, W - 4, 2, w[3]); img.rect(2, 9, W - 4, 2, w[0]); img.rect(2, 0, 2, 11, w[3]); img.rect(W - 4, 0, 2, 11, w[0]); // 顶上的木牌
  const out = img.outlined(PAL.outline);
  shadow(out, 33, 53, 28, 3);
  return { img: out, ax: 33, ay: 52, block: { x: -27, y: -6, w: 54, h: 6 } };
}
export function fountain(): Sprite {
  const img = new Img(44, 34);
  img.ellipse(22, 25, 20, 8, PAL.stone[2]); img.ellipse(22, 24, 19, 7, PAL.stone[4]); img.ellipse(22, 24, 16, 5.5, PAL.water[2]); img.ellipse(22, 25, 12, 3.5, PAL.water[3]);
  img.rect(20, 12, 4, 12, PAL.stone[3]); img.rect(20, 12, 1, 12, PAL.stone[4]);
  img.ellipse(22, 11, 6, 2.2, PAL.stone[3]);
  for (const [x, y] of [[22, 4], [20, 6], [24, 6], [18, 9], [26, 9], [22, 7]]) img.set(x, y, PAL.water[4]);
  img.vline(22, 5, 6, PAL.water[3]);
  const out = img.outlined(PAL.outlineStone);
  shadow(out, 23, 33, 19, 2.2);
  return { img: out, ax: 23, ay: 32, block: { x: -17, y: -8, w: 34, h: 8 } };
}
export function monument(): Sprite {
  const img = new Img(20, 42);
  img.rect(1, 34, 18, 6, PAL.stone[2]); img.rect(1, 34, 18, 1, PAL.stone[4]); img.rect(3, 31, 14, 4, PAL.stone[3]);
  img.rect(6, 4, 8, 28, PAL.stone[3]); img.rect(6, 4, 2, 28, PAL.stone[4]); img.rect(12, 4, 2, 28, PAL.stone[1]);
  img.rect(7, 1, 6, 4, PAL.stone[4]); img.rect(8, 0, 4, 2, PAL.stone[4]);
  for (let i = 0; i < 4; i++) img.hline(8, 10 + i * 4, 4, hex('#b34a3c'));
  const out = img.outlined(PAL.outlineStone);
  shadow(out, 11, 42, 9, 2);
  return { img: out, ax: 11, ay: 41, block: { x: -8, y: -6, w: 16, h: 6 } };
}
export function goal(): Sprite {
  const img = new Img(30, 14);
  img.rect(2, 2, 26, 1, PAL.line); img.vline(2, 2, 11, PAL.line); img.vline(27, 2, 11, PAL.line);
  for (let x = 4; x < 27; x += 3) img.vline(x, 3, 8, [230, 230, 230, 110]);
  for (let y = 4; y < 11; y += 3) img.hline(3, y, 24, [230, 230, 230, 110]);
  const out = img.outlined([50, 60, 50, 255]);
  return { img: out, ax: 16, ay: 14, block: { x: -13, y: -2, w: 26, h: 2 } };
}
export function hoop(): Sprite {
  const img = new Img(18, 34);
  img.rect(8, 8, 2, 25, PAL.metal[1]); img.vline(8, 8, 25, PAL.metal[3]);
  img.rect(2, 0, 14, 10, hex('#e8e4da')); img.rect(2, 0, 14, 1, PAL.metal[2]); img.rect(6, 4, 6, 4, hex('#c4503c'));
  img.rect(5, 10, 8, 1, hex('#e0813a')); img.vline(5, 11, 3, [230, 230, 230, 160]); img.vline(12, 11, 3, [230, 230, 230, 160]);
  const out = img.outlined(PAL.outline);
  shadow(out, 10, 34, 6, 1.6);
  return { img: out, ax: 10, ay: 34, block: { x: -2, y: -3, w: 4, h: 3 } };
}
export function gateSign(): Sprite {
  const w = PAL.wood;
  const img = new Img(92, 30);
  img.rect(8, 20, 5, 9, PAL.stone[2]); img.rect(79, 20, 5, 9, PAL.stone[2]);
  img.rect(0, 2, 92, 20, hex('#2f4f66')); img.rect(0, 2, 92, 2, hex('#a8c0d0')); img.rect(0, 20, 92, 2, hex('#1f3646'));
  img.rect(2, 4, 88, 16, hex('#365a74'));
  img.rect(0, 0, 92, 3, PAL.sand[3]); img.hline(0, 0, 92, PAL.sand[4]); img.rect(0, 22, 92, 2, w[1]);
  const out = img.outlined(PAL.outline);
  shadow(out, 47, 31, 40, 2);
  return { img: out, ax: 47, ay: 30, block: { x: -42, y: -4, w: 84, h: 4 } };
}

/**
 * 邯郸市体育中心（椭圆体育场）整体精灵：外环 → 屋盖(放射肋条+明暗) → 内沿 → 看台 → 跑道 → 草坪。
 * 作为一个大精灵放置；脚点 = 椭圆南缘，使人物能走到它南侧的广场前而被它遮挡其北侧。
 */
export function stadium(K = 1): Sprite {
  // 参照卫星图：外环路 → 宽白色屋盖环（约占半径 40%）→ 窄暗看台 → 窄蓝色跑道 → 草坪。开口略偏东。K = 世界放大倍数，所有尺寸 ×K。
  const W = 484 * K, H = 522 * K, cx = W / 2, cy = 258 * K, rx = 240 * K, ry = 256 * K;
  const img = new Img(W, H);
  const ox = 10 * K, oy = 4 * K;
  const q = (x: number, y: number, a: number, b: number, dx = 0, dy = 0) => { const u = (x - cx - dx) / a, v = (y - cy - dy) / b; return u * u + v * v; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (q(x, y, rx, ry) > 1) continue;
    const ang = Math.atan2(y - cy, x - cx);
    const dOuter = q(x, y, rx, ry), dRing = q(x, y, rx - 15 * K, ry - 15 * K), dRoofEdge = q(x, y, rx - 22 * K, ry - 22 * K);
    const dRoofIn = q(x, y, 142 * K, 160 * K, ox, oy), dBowl = q(x, y, 118 * K, 134 * K, ox, oy), dTrack = q(x, y, 96 * K, 110 * K, ox, oy), dField = q(x, y, 66 * K, 80 * K, ox, oy);
    let c: RGBA;
    if (dRing > 1) c = dOuter > 0.95 ? hex('#5f3028') : hex('#a85f4a');
    else if (dRoofIn > 1) {
      const rib = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 120);
      const t = Math.sqrt(dRoofIn), light = Math.cos(ang + 2.3) * 0.5 + 0.5;
      let v = 0.80 + light * 0.17 + (rib % 2 === 0 ? 0.035 : -0.02);
      if (t < 1.05) v -= 0.14;
      if (Math.floor(t * 9) % 4 === 0) v -= 0.045;
      if (dRoofEdge > 1) v += 0.06;
      const base = [224, 230, 240];
      c = [base[0] * v, base[1] * v, base[2] * v + 4, 255].map((n) => Math.max(0, Math.min(255, Math.round(n)))) as RGBA;
    } else if (dBowl > 1) {
      const tier = Math.floor(Math.sqrt(dBowl) * 11);
      c = tier % 2 === 0 ? hex('#2a3f78') : hex('#344c8c');
      if (hash2(x, y, 9) < 0.04) c = hex('#c8ccd8');
    } else if (dTrack > 1) {
      const lane = Math.floor(Math.sqrt(dTrack) * 7);
      c = lane % 2 === 0 ? hex('#2f5fa8') : hex('#3a6cb8');
      if (lane % 3 === 0 && hash2(x, y, 3) < 0.4) c = hex('#e8eef6');
    } else if (dField > 1) c = hex('#2a55a0');
    else c = Math.floor((x + 12 * K) / (11 * K)) % 2 === 0 ? hex('#3f8f3c') : hex('#4aa043');
    img.set(x, y, c);
  }
  const fx = cx + ox, fy = cy + oy, WH = hex('#f2f0e6');
  for (let x = Math.round(fx - 62 * K); x <= Math.round(fx + 62 * K); x++) if (q(x, fy, 66 * K, 80 * K, ox, oy) <= 1) img.set(x, fy, WH);
  for (let a = 0; a < 90 * K; a++) { const t = (a / (90 * K)) * Math.PI * 2; img.set(Math.round(fx + Math.cos(t) * 13 * K), Math.round(fy + Math.sin(t) * 13 * K), WH); }
  for (const sy of [-1, 1]) { for (let x = -30 * K; x <= 30 * K; x++) img.set(Math.round(fx + x), Math.round(fy + sy * 56 * K), WH); for (let y = 56 * K; y <= 76 * K; y++) { img.set(Math.round(fx - 30 * K), Math.round(fy + sy * y), WH); img.set(Math.round(fx + 30 * K), Math.round(fy + sy * y), WH); } }
  const out = img.outlined(hex('#3a2a28'));
  return { img: out, ax: cx + 1, ay: cy + ry + 1 };
}

// ============================================================ 南门 / 图书馆广场（参考旧版风格重做）
const LIME: RGBA[] = ['#9a9680', '#b8b49c', '#d2ceb6', '#e4e0ca', '#f1eedc'].map((c) => hex(c));
const GOLD: RGBA[] = ['#7a5a14', '#b8861f', '#e0b038', '#f6d468', '#fff2b0'].map((c) => hex(c));

function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: RGBA) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) img.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** 金色多头路灯（旧版南门/广场的标志性灯具）。夜里发光点在灯头，高度约 54px */
export function lampGold(): Sprite {
  const img = new Img(22, 66), cx = 11;
  img.rect(cx - 4, 59, 9, 5, LIME[1]); img.rect(cx - 4, 59, 9, 1, LIME[3]); img.rect(cx - 3, 56, 7, 4, LIME[2]); img.hline(cx - 3, 56, 7, LIME[4]);
  img.rect(cx - 1, 15, 3, 42, LIME[3]); img.vline(cx - 1, 15, 42, LIME[4]); img.vline(cx + 1, 15, 42, LIME[1]);
  img.rect(cx - 2, 44, 5, 2, GOLD[2]); img.rect(cx - 2, 24, 5, 2, GOLD[2]);
  const globes: [number, number][] = [[cx, 5], [cx - 7, 9], [cx + 7, 9], [cx - 3.5, 12], [cx + 3.5, 12]];
  for (const [gx, gy] of globes) line(img, cx, 17, Math.round(gx), Math.round(gy) + 3, GOLD[1]);
  for (const [gx, gy] of globes) {
    img.ellipse(gx, gy, 3.2, 3.2, GOLD[2]); img.ellipse(gx - 0.6, gy - 0.7, 1.9, 1.9, GOLD[3]);
    img.set(Math.round(gx) - 1, Math.round(gy) - 1, GOLD[4]); img.set(Math.round(gx) + 2, Math.round(gy) + 1, GOLD[0]);
  }
  const out = img.outlined(hex('#4a3a1c'));
  shadow(out, cx + 1, 64, 6, 1.8);
  return { img: out, ax: cx + 1, ay: 64, block: { x: -2, y: -3, w: 4, h: 3 } };
}

/** 砖墙一段（16px，横向首尾相接）：石帽 + 砖身 + 勒脚 */
export function wallH(): Sprite {
  const img = new Img(16, 22);
  img.rect(0, 0, 16, 3, LIME[3]); img.hline(0, 0, 16, LIME[4]); img.hline(0, 2, 16, LIME[1]);
  for (let y = 3; y < 19; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor((y - 3) / 4), off = (row % 2) * 4;
    const mort = (y - 3) % 4 === 3 || (x + off) % 8 === 7;
    const bk = (Math.floor((x + off) / 8) + row * 3) % 5 === 0;
    img.set(x, y, mort ? PAL.mortar : bk ? PAL.brick[3] : PAL.brick[2]);
  }
  img.hline(0, 19, 16, PAL.brick[0]); img.rect(0, 20, 16, 2, LIME[1]); img.hline(0, 20, 16, LIME[2]);
  const out = img.outlined(PAL.outlineBrick);
  shadow(out, 9, 23, 8, 1.4);
  return { img: out, ax: 9, ay: 23, block: { x: -8, y: -4, w: 16, h: 4 } };
}
/** 墙端/铁栏间的砖柱 */
export function pier(): Sprite {
  const img = new Img(10, 36);
  img.rect(0, 0, 10, 3, LIME[3]); img.hline(0, 0, 10, LIME[4]); img.hline(0, 2, 10, LIME[1]);
  for (let y = 3; y < 31; y++) for (let x = 1; x < 9; x++) {
    const row = Math.floor((y - 3) / 4), off = (row % 2) * 4;
    const mort = (y - 3) % 4 === 3 || (x + off) % 8 === 0;
    img.set(x, y, mort ? PAL.mortar : x < 3 ? PAL.brick[3] : x > 6 ? PAL.brick[1] : PAL.brick[2]);
  }
  img.rect(0, 31, 10, 4, LIME[2]); img.hline(0, 31, 10, LIME[4]);
  const out = img.outlined(PAL.outlineBrick);
  shadow(out, 6, 37, 6, 1.4);
  return { img: out, ax: 6, ay: 36, block: { x: -4, y: -4, w: 8, h: 4 } };
}

/**
 * 校名石：宽 192、高约 76 px（早先版本的 2 倍）。校名由客户端用 24px 像素字体写在碑面上
 * （碑面凹陷区中心离脚点 40 px，见 60-landscape.json 的校名 label）。
 */
export function nameStone(): Sprite {
  const W = 192, H = 78, img = new Img(W, H);
  // 顶盖
  img.rect(6, 0, W - 12, 12, LIME[4]); img.hline(6, 0, W - 12, [255, 255, 255, 255]); img.hline(6, 11, W - 12, LIME[3]);
  // 主体 + 受光/背光边
  img.rect(0, 12, W, 44, LIME[3]); img.rect(0, 12, W, 3, LIME[4]); img.rect(0, 12, 2, 44, LIME[4]); img.rect(W - 8, 12, 8, 44, LIME[1]); img.rect(W - 2, 12, 2, 44, LIME[0]);
  // 砂岩颗粒
  for (let y = 15; y < 56; y++) for (let x = 2; x < W - 8; x++) if (hash2(x, y, 17) < 0.05) img.set(x, y, LIME[2]);
  // 凹陷的碑面（左上暗、右下亮，像刻进去的）
  img.rect(8, 18, W - 22, 32, LIME[3]); img.rect(8, 18, W - 22, 2, LIME[1]); img.rect(8, 18, 2, 32, LIME[1]); img.rect(8, 48, W - 22, 2, LIME[4]); img.rect(W - 16, 18, 2, 32, LIME[4]);
  // 底座
  img.rect(2, 56, W - 4, 14, LIME[1]); img.rect(2, 56, W - 4, 2, LIME[3]); img.rect(2, 66, W - 4, 4, LIME[0]);
  const out = img.outlined(hex('#6a6654'));
  shadow(out, W / 2 + 1, 75, 88, 4.4);
  return { img: out, ax: W / 2 + 1, ay: 75, block: { x: -90, y: -9, w: 180, h: 9 } };
}

/** 石球墩 */
export function bollard(): Sprite {
  const img = new Img(9, 12);
  img.rect(1, 8, 7, 3, LIME[2]); img.hline(1, 8, 7, LIME[4]); img.hline(1, 10, 7, LIME[0]);
  img.ellipse(4.5, 4.2, 3.6, 3.6, LIME[3]); img.ellipse(3.8, 3.4, 2, 2, LIME[4]); img.set(6, 5, LIME[1]); img.set(6, 6, LIME[1]); img.set(5, 6, LIME[1]);
  const out = img.outlined(hex('#6a6654'));
  shadow(out, 6, 13, 4.5, 1.3);
  return { img: out, ax: 6, ay: 12 }; // 石球墩不挡路（2026-11-03：门口的石墩做成无碰撞）
}

/** 校石（庭石）：大块带裂纹的砂岩，底部长苔 */
export function boulder(): Sprite {
  const W = 88, H = 62, img = new Img(W, H);
  const blobs = [[44, 40, 36, 20], [26, 42, 20, 15], [62, 40, 22, 17], [42, 26, 24, 15], [52, 32, 20, 13], [30, 32, 16, 11]];
  const col: RGBA[] = ['#8c7a62', '#a8967a', '#c4b090', '#dccaa6', '#efe0bc', '#fbf0d4'].map((c) => hex(c));
  const L = [-0.5, -0.7];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = -1, bz = -1, bl = 0;
    blobs.forEach(([cx, cy, rx, ry], i) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 1) return;
      const z = Math.sqrt(1 - d2) + cy / 70;
      if (z > bz) { bz = z; best = i; bl = Math.max(0, dx * L[0] + dy * L[1] + Math.sqrt(1 - d2) * 0.55); }
    });
    if (best < 0) continue;
    const t = bl * 4.6 + (hash2(x, y, 5) - 0.5) * 0.9 + (vnoise(x, y, 6, 3) - 0.5) * 0.9;
    img.set(x, y, col[Math.max(0, Math.min(5, Math.floor(t)))]);
  }
  // 裂纹：从上部向下的折线
  const rng = new Rng(77);
  for (let k = 0; k < 4; k++) {
    let x = 26 + rng.int(36), y = 14 + rng.int(8);
    for (let n = 0; n < 16 + rng.int(8); n++) { if (img.alpha(x, y)) img.set(x, y, col[0]); x += rng.int(3) - 1; y += 1; if (img.alpha(x + 1, y)) img.set(x + 1, y, col[1]); }
  }
  for (let x = 6; x < W - 6; x++) for (let y = H - 14; y < H - 4; y++) if (img.alpha(x, y) && hash2(x, y, 31) < 0.07 + (y - (H - 14)) * 0.012) img.set(x, y, PAL.leaf[2]); // 苔
  const out = img.outlined(hex('#4a3a2c'));
  shadow(out, W / 2 + 1, H + 1, 38, 3);
  return { img: out, ax: W / 2 + 1, ay: H, block: { x: -34, y: -12, w: 68, h: 12 } };
}

/** 升旗台 + 旗杆（不含旗，旗是 3 帧动画单独贴） */
export function flagpole(): Sprite {
  const W = 64, H = 118, img = new Img(W, H), cx = 32;
  img.rect(2, 108, 60, 10, LIME[2]); img.rect(2, 108, 60, 2, LIME[4]); img.rect(2, 116, 60, 2, LIME[0]);
  img.rect(10, 103, 44, 6, LIME[3]); img.rect(10, 103, 44, 1, LIME[4]); img.rect(10, 108, 44, 1, LIME[1]);
  img.rect(20, 98, 24, 6, LIME[4]); img.rect(20, 98, 24, 1, [255, 255, 255, 255]); img.rect(20, 103, 24, 1, LIME[2]);
  img.rect(cx - 1, 8, 2, 90, hex('#d8dce6')); img.vline(cx - 1, 8, 90, hex('#fafbff')); img.vline(cx, 8, 90, hex('#9aa2b4'));
  img.ellipse(cx, 5.5, 3, 3, GOLD[2]); img.set(cx - 1, 4, GOLD[4]); img.set(cx + 1, 7, GOLD[0]);
  const out = img.outlined(hex('#5a5a62'));
  shadow(out, cx + 1, H, 28, 2.4);
  return { img: out, ax: cx + 1, ay: H - 1, block: { x: -26, y: -10, w: 52, h: 10 } };
}
/** 旗面 3 帧（五星红旗，随风起伏）。左上角贴在旗杆顶端右侧 */
export function flagFrames(): Img[] {
  const out: Img[] = [];
  const RED = hex('#c8302a'), RED2 = hex('#a02620'), RED3 = hex('#e0483c'), STAR = hex('#fcd638');
  for (let f = 0; f < 3; f++) {
    const w = 28, h = 18, img = new Img(w, h + 4);
    for (let x = 0; x < w; x++) {
      const off = Math.round(Math.sin(x * 0.42 - f * 2.1) * (0.4 + (x / w) * 1.6));
      const tone = Math.sin(x * 0.42 - f * 2.1);
      for (let y = 0; y < h; y++) img.set(x, y + 2 + off, tone > 0.35 ? RED3 : tone < -0.35 ? RED2 : RED);
    }
    const star = (cx: number, cy: number, big: boolean) => {
      const off = Math.round(Math.sin(cx * 0.42 - f * 2.1) * (0.4 + (cx / w) * 1.6));
      if (big) { for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [1, 2]]) img.set(cx + dx, cy + dy + 2 + off, STAR); }
      else img.set(cx, cy + 2 + off, STAR);
    };
    star(5, 5, true); star(10, 2, false); star(12, 4, false); star(12, 7, false); star(10, 9, false);
    out.push(img);
  }
  return out;
}

/** 台阶两侧的扶手矮墙（南北向） */
export function railV(): Sprite {
  const img = new Img(8, 58);
  img.rect(1, 14, 6, 42, LIME[2]); img.rect(1, 14, 6, 1, LIME[4]); img.vline(1, 14, 42, LIME[4]); img.vline(6, 14, 42, LIME[1]);
  img.rect(3, 4, 2, 50, PAL.metal[2]); img.vline(3, 4, 50, PAL.metal[3]);
  for (const y of [4, 20, 36, 52]) img.rect(2, y, 4, 2, PAL.metal[1]);
  const out = img.outlined(hex('#4a4a52'));
  shadow(out, 5, 59, 4, 1.2);
  return { img: out, ax: 5, ay: 58, block: { x: -3, y: -52, w: 6, h: 52 } };
}
/** 横向铁栏杆一段（16px）：上下横杆 + 竖栏（无描边，更纤细） */
export function fenceIron(): Sprite {
  const img = new Img(16, 14), D = hex('#2f3342'), M = hex('#565c6c'), T = hex('#9aa2b8');
  img.rect(0, 2, 16, 2, D); img.hline(0, 2, 16, M); img.rect(0, 10, 16, 2, D); img.hline(0, 10, 16, M);
  for (let x = 1; x < 16; x += 3) { img.vline(x, 1, 11, D); img.set(x, 0, T); img.set(x, 1, M); }
  for (let x = 0; x < 16; x++) if (img.alpha(x, 13) === 0 && x % 2 === 0) img.set(x, 13, [28, 36, 66, 36]);
  return { img, ax: 8, ay: 13, block: { x: -8, y: -3, w: 16, h: 3 } };
}

// ============================================================ 西门 / 东门
/**
 * 南北向砖墙一段（16px）。斜投影下南北向的墙只露出"顶面"：一条被抬高的石帽带；
 * 只有最南端能看到砖砌立面，所以每段都带一截砖面，被南侧一段的帽盖住，末段才显露。
 */
export function wallV(): Sprite {
  const CAP = 16, FACE = 12, W = 6;
  const img = new Img(W, CAP + FACE);
  img.rect(0, 0, W, CAP, LIME[3]); img.vline(0, 0, CAP, LIME[4]); img.vline(W - 1, 0, CAP, LIME[1]);
  for (let y = CAP; y < CAP + FACE; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor((y - CAP) / 4), mort = (y - CAP) % 4 === 3 || (x + (row % 2) * 2) % 4 === 3;
    img.set(x, y, mort ? PAL.mortar : x === 0 ? PAL.brick[3] : x === W - 1 ? PAL.brick[1] : PAL.brick[2]);
  }
  img.hline(0, CAP + FACE - 1, W, LIME[2]);
  const out = img.outlined(PAL.outlineBrick);
  return { img: out, ax: 4, ay: CAP + FACE + 1, block: { x: -3, y: -16, w: 6, h: 16 } };
}
/** 南北向铁栏杆一段：顶面是一条深色横杆（被抬高 8px），末段露出竖栏 */
export function fenceIronV(): Sprite {
  const CAP = 16, FACE = 8, W = 5, D = hex('#2f3342'), M = hex('#565c6c'), T = hex('#9aa2b8');
  const img = new Img(W, CAP + FACE);
  img.rect(1, 0, 3, CAP, D); img.vline(2, 0, CAP, M); img.set(2, 0, T);
  for (let y = CAP; y < CAP + FACE; y++) { img.set(1, y, D); img.set(3, y, D); }
  img.rect(0, CAP + FACE - 2, W, 2, D);
  return { img, ax: 3, ay: CAP + FACE, block: { x: -2, y: -16, w: 4, h: 16 } };
}
/** 门牌：两根立柱撑着一块深青色牌面（字由客户端叠加），约 3 格宽 */
export function gatePlaque(): Sprite {
  const W = 52, H = 34, img = new Img(W, H), B = hex('#2f4f66');
  img.rect(5, 22, 4, 11, LIME[2]); img.rect(43, 22, 4, 11, LIME[2]); img.vline(5, 22, 11, LIME[4]); img.vline(43, 22, 11, LIME[4]);
  img.rect(0, 2, W, 21, B); img.rect(0, 2, W, 2, hex('#a8c0d0')); img.rect(0, 21, W, 2, hex('#1f3646')); img.rect(2, 4, W - 4, 17, hex('#365a74'));
  img.rect(0, 0, W, 3, LIME[3]); img.hline(0, 0, W, LIME[4]); img.rect(0, 23, W, 2, LIME[1]);
  const out = img.outlined(hex('#3a3a44'));
  shadow(out, W / 2 + 1, H + 1, 22, 1.8);
  return { img: out, ax: W / 2 + 1, ay: H, block: { x: -22, y: -4, w: 44, h: 4 } };
}
/** 校训石（东门岛上）：灰绿色竖立巨石，棱面分明，刻几道竖纹 */
export function mottoStone(): Sprite {
  const W = 30, H = 52, img = new Img(W, H);
  const col: RGBA[] = ['#4a5658', '#66767a', '#869a9c', '#a4b6b6', '#c6d4d2'].map((c) => hex(c));
  const cut = (y: number) => (y < 7 ? (7 - y) * 1.3 : 0);                         // 顶部斜削
  const left = (y: number) => Math.round(7 - (y / H) * 4 + cut(y) + Math.sin(y * 0.55) * 0.7);
  const right = (y: number) => Math.round(21 + (y / H) * 4 - cut(y) * 0.6 + Math.cos(y * 0.45) * 0.7);
  for (let y = 0; y < H; y++) {
    const l = left(y), r = right(y), mid = Math.round(l + (r - l) * 0.45);
    for (let x = l; x <= r; x++) {
      let c = x < mid ? col[3] : col[1];
      if (x <= l + 1) c = col[4]; if (x >= r - 1) c = col[0];
      if (x === mid) c = col[2];
      if (hash2(x, y, 4) < 0.06) c = x < mid ? col[2] : col[0];
      img.set(x, y, c);
    }
  }
  // 阴刻竖行（示意"校训"题字，不写具体文字）
  for (const x of [11, 15, 19]) for (let y = 12; y < 40; y++) if (y % 6 < 4) img.set(x, y, col[0]);
  img.rect(7, H - 5, 17, 5, col[2]); img.hline(7, H - 5, 17, col[4]); img.hline(7, H - 1, 17, col[0]);   // 基座
  const out = img.outlined(hex('#2a3436'));
  shadow(out, W / 2 + 2, H + 1, 13, 2.2);
  return { img: out, ax: W / 2 + 1, ay: H, block: { x: -9, y: -6, w: 18, h: 6 } };
}

// ============================================================ 景观第三批：运动场/食堂/湖岸
/** 小块岸石（湖边点缀） */
export function rockS(seed: number): Sprite {
  const img = new Img(16, 11), L = [-0.5, -0.7];
  const col: RGBA[] = ['#7e7466', '#9a8f7e', '#b6aa96', '#d0c4ac', '#e6dac2'].map((c) => hex(c));
  const blobs = [[8, 6.5, 6.5, 4], [4.5, 7, 3.6, 3], [11.5, 7, 3.8, 3.2]];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 16; x++) {
    let best = -1, bz = -1, bl = 0;
    blobs.forEach(([cx, cy, rx, ry], i) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy; if (d2 > 1) return; const z = Math.sqrt(1 - d2) + cy / 20; if (z > bz) { bz = z; best = i; bl = Math.max(0, dx * L[0] + dy * L[1] + Math.sqrt(1 - d2) * 0.5); } });
    if (best >= 0) img.set(x, y, col[Math.max(0, Math.min(4, Math.floor(bl * 4.2 + (hash2(x, y, seed) - 0.5) * 0.9)))]);
  }
  const out = img.outlined(hex('#4a4034'));
  sh(out, 9, 12, 7, 1.2);
  return { img: out, ax: 9, ay: 11, block: { x: -6, y: -4, w: 12, h: 4 } };
}
/** 看台（4 格宽，面朝南）：三级阶梯座椅 + 顶棚立柱 */
export function bleacher(): Sprite {
  const W = 66, H = 34, img = new Img(W, H);
  for (let r = 0; r < 3; r++) {
    const y = 8 + r * 7;
    img.rect(2, y, W - 4, 7, r % 2 ? hex('#2f4f94') : hex('#3a62b0')); img.hline(2, y, W - 4, hex('#7fa0dc')); img.hline(2, y + 6, W - 4, hex('#1f3366'));
    for (let x = 4; x < W - 5; x += 4) img.set(x, y + 3, hex('#e8eef8'));
  }
  img.rect(0, 29, W, 4, LIME[2]); img.hline(0, 29, W, LIME[4]); img.hline(0, 32, W, LIME[0]);
  for (const x of [1, 32, W - 3]) img.rect(x, 2, 2, 28, PAL.metal[2]);
  img.rect(0, 0, W, 3, hex('#c8d0dc')); img.hline(0, 0, W, hex('#f4f6fa')); img.hline(0, 2, W, hex('#7c869a'));
  const out = img.outlined(hex('#2a2f40'));
  sh(out, W / 2 + 1, H + 1, 30, 1.8);
  return { img: out, ax: W / 2 + 1, ay: H, block: { x: -32, y: -8, w: 64, h: 8 } };
}
/** 球场高杆灯（4 灯头灯架） */
export function floodlight(): Sprite {
  const img = new Img(24, 84), cx = 12;
  img.rect(cx - 1, 12, 3, 70, PAL.metal[2]); img.vline(cx - 1, 12, 70, PAL.metal[3]); img.vline(cx + 1, 12, 70, PAL.metal[0]);
  img.rect(cx - 3, 78, 7, 5, PAL.metal[1]); img.hline(cx - 3, 78, 7, PAL.metal[3]);
  img.rect(1, 4, 22, 8, PAL.metal[1]); img.hline(1, 4, 22, PAL.metal[3]);
  for (let i = 0; i < 4; i++) { const x = 2 + i * 5; img.rect(x, 5, 4, 6, hex('#fff6c8')); img.set(x, 5, hex('#ffffff')); }
  const out = img.outlined(PAL.outline);
  sh(out, cx + 1, 84, 6, 1.6);
  return { img: out, ax: cx + 1, ay: 83, block: { x: -2, y: -3, w: 4, h: 3 } };
}
/** 遮阳伞桌椅（食堂门前） */
export function parasolTable(variant: number): Sprite {
  const cols: [string, string][] = [['#c4503c', '#f4e4c8'], ['#3f78c0', '#f4f6fa'], ['#e0a53a', '#fff0c8']];
  const [a, b] = cols[variant % 3];
  const img = new Img(34, 38);
  img.ellipse(17, 29, 12, 5, PAL.wood[3]); img.ellipse(17, 28, 12, 4.2, PAL.wood[4]); img.rect(16, 28, 2, 7, PAL.wood[1]);
  img.rect(5, 31, 4, 3, PAL.wood[2]); img.rect(25, 31, 4, 3, PAL.wood[2]);
  img.rect(16, 7, 2, 22, hex('#9aa2b8'));
  for (let y = 0; y < 12; y++) { const half = 3 + Math.round(y * 1.3); for (let x = 17 - half; x <= 17 + half; x++) img.set(x, 3 + y, ((x + 40) >> 2) % 2 === 0 ? hex(a) : hex(b)); }
  img.hline(1, 14, 32, shade2(hex(a), 0.7));
  const out = img.outlined(PAL.outline);
  sh(out, 18, 38, 13, 2);
  return { img: out, ax: 18, ay: 36, block: { x: -10, y: -5, w: 20, h: 5 } };
}
function shade2(c: RGBA, f: number): RGBA { return [c[0] * f, c[1] * f, c[2] * f, 255].map(Math.round) as RGBA; }
/** 木质栈桥短墩（桥面由 boardwalk 材质铺出，这里只做桥头灯柱） */
export function dockPost(): Sprite {
  const img = new Img(8, 22);
  img.rect(2, 4, 4, 17, PAL.wood[2]); img.vline(2, 4, 17, PAL.wood[4]); img.rect(1, 2, 6, 3, PAL.wood[3]); img.hline(1, 2, 6, PAL.wood[4]);
  const out = img.outlined(PAL.outline);
  return { img: out, ax: 5, ay: 22, block: { x: -2, y: -3, w: 4, h: 3 } };
}

/** 遮阳廊架：四根立柱 + 木格栅顶 + 藤蔓（广场休憩区） */
export function pergola(): Sprite {
  const W = 76, H = 46, img = new Img(W, H), w = PAL.wood;
  for (const x of [4, W - 8]) { img.rect(x, 14, 4, 30, w[2]); img.vline(x, 14, 30, w[4]); img.rect(x - 1, 42, 6, 3, LIME[2]); }
  img.rect(2, 8, W - 4, 8, w[3]); img.hline(2, 8, W - 4, w[4]); img.hline(2, 15, W - 4, w[1]);
  for (let x = 4; x < W - 4; x += 5) { img.rect(x, 4, 3, 12, w[2]); img.vline(x, 4, 12, w[4]); }
  const rng = new Rng(61);
  for (let i = 0; i < 40; i++) { const x = 4 + rng.int(W - 8), y = 4 + rng.int(11); img.set(x, y, PAL.leaf[2 + rng.int(3)]); if (rng.chance(0.3)) img.set(x + 1, y, PAL.leaf[4]); }
  const out = img.outlined(PAL.outline);
  sh(out, W / 2 + 1, H + 1, 34, 2);
  return { img: out, ax: W / 2 + 1, ay: 44, block: { x: -34, y: -4, w: 68, h: 4 } };
}
