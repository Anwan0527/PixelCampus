/**
 * 家具染色（客户端与服务器共用）。
 *
 * 设计：
 *  - 一件已摆好的家具可以染一次色：Placed.c = 色号（1..DYES.length；0 / 缺省 = 原色）。染色只改外观，不改占地、碰撞、功能。
 *  - 染料是一种背包物品 `dye`（一份染料染一件；商店 3 份 40 校园币）；染成别的颜色花 1 份，**染回原色免费**；把家具收回背包会褪色（颜色跟摆放走，不跟物品走）。
 *  - 只有"有主体色"的家具能染（DecorDef.dye）：桌椅、柜子、沙发、地毯门垫、玩偶、衣柜宝箱等；屏幕 / 灯 / 画 / 窗 / 鱼缸 / 床不染（原因见 decor.ts 的 DYE）。
 *  - 渲染（客户端）：不是整张贴图乘一个颜色（会把深色染脏），而是**按像素重新着色**：找出这一帧的"主体色"（占面积最大的色相，或灰色家具里的中间调），
 *    只把主体色的像素换成目标色相 / 饱和度，亮度围绕目标亮度保持原来的明暗起伏；描边、阴影里的深色、白色高光、别的颜色的小零件（植物、金属）保持不变。
 *    每种（帧, 色号）只生成一次并缓存成贴图，所以几百件家具也只是普通的贴图绘制。这里是纯函数，服务端测试也能跑。
 */

export interface DyeColor { /** 名字 */ name: string; /** 目标色相 0..360 / 饱和度 0..1 / 亮度 0..1 */ h: number; s: number; l: number }

/** 调色板（色号 = 下标 + 1；0 = 原色）：暖冷、深浅、中性色都有一个，彼此拉开 */
export const DYES: readonly DyeColor[] = [
  { name: '奶油白', h: 40, s: 0.38, l: 0.86 },
  { name: '暖灰', h: 32, s: 0.08, l: 0.58 },
  { name: '炭黑', h: 230, s: 0.14, l: 0.27 },
  { name: '樱粉', h: 345, s: 0.62, l: 0.76 },
  { name: '酒红', h: 352, s: 0.58, l: 0.38 },
  { name: '珊瑚橙', h: 14, s: 0.72, l: 0.58 },
  { name: '柠檬黄', h: 48, s: 0.82, l: 0.62 },
  { name: '薄荷绿', h: 150, s: 0.46, l: 0.62 },
  { name: '森林绿', h: 140, s: 0.42, l: 0.34 },
  { name: '天空蓝', h: 200, s: 0.68, l: 0.64 },
  { name: '靛蓝', h: 226, s: 0.56, l: 0.40 },
  { name: '薰衣草', h: 266, s: 0.46, l: 0.68 },
];
export const DYE_ITEM = 'dye';
export const isDyeIdx = (c: unknown): c is number => typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= DYES.length;
export const dyeName = (c: number) => (c === 0 ? '原色' : DYES[c - 1]?.name ?? '原色');
/** 色块预览用的 CSS 颜色 */
export const dyeCss = (c: number): string => { const d = DYES[c - 1]; return d ? `hsl(${d.h} ${Math.round(d.s * 100)}% ${Math.round(d.l * 100)}%)` : 'transparent'; };

// ------------------------------------------------------------------ 着色（纯函数，作用在 RGBA 像素缓冲上）
function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * 给一帧家具染色（原地改 data：RGBA，每像素 4 字节）。c = 0 或不合法什么都不做。
 * 找主体色：饱和度够的像素按色相（10° 一格）统计面积，取最大的一格（加上相邻两格）为主体色相；饱和像素太少（灰 / 白 / 黑的家具）就把中间调当主体。
 */
export function dyePixels(data: Uint8ClampedArray, c: number): void {
  const t = DYES[c - 1]; if (!t) return;
  const n = data.length / 4, hsl = new Float32Array(n * 3), bins = new Float32Array(36);
  let opaque = 0, chroma = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const [h, s, l] = toHsl(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    hsl[i * 3] = h; hsl[i * 3 + 1] = s; hsl[i * 3 + 2] = l;
    if (l < 0.14) continue; // 描边、最深的阴影不算
    opaque++;
    if (s >= 0.22 && l <= 0.92) { chroma++; bins[Math.floor(h / 10) % 36] += s; }
  }
  if (!opaque) return;
  const chromatic = chroma >= opaque * 0.25;
  let h0 = 0;
  if (chromatic) { let best = -1, bv = -1; for (let k = 0; k < 36; k++) { const v = bins[k] + bins[(k + 35) % 36] * 0.5 + bins[(k + 1) % 36] * 0.5; if (v > bv) { bv = v; best = k; } } h0 = best * 10 + 5; }
  const body = (h: number, s: number, l: number) => (chromatic ? s >= 0.16 && hueDist(h, h0) <= 36 && l >= 0.12 && l <= 0.96 : l >= 0.2 && l <= 0.93);
  let sumL = 0, cnt = 0;
  for (let i = 0; i < n; i++) { if (data[i * 4 + 3] < 128) continue; const h = hsl[i * 3], s = hsl[i * 3 + 1], l = hsl[i * 3 + 2]; if (body(h, s, l)) { sumL += l; cnt++; } }
  if (!cnt) return;
  const mean = sumL / cnt;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const h = hsl[i * 3], s = hsl[i * 3 + 1], l = hsl[i * 3 + 2];
    if (!body(h, s, l)) continue;
    const nl = Math.min(0.96, Math.max(0.1, t.l + (l - mean) * 0.95)); // 围绕目标亮度保留原来的明暗起伏
    const ns = t.s * (0.88 + 0.24 * Math.min(1, s)); // 原来更鲜的地方染得更鲜一点，别一片死色
    const [r, g, b] = fromHsl(t.h, Math.min(1, ns), nl);
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
  }
}
