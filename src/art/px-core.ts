/**
 * 像素绘制小工具（内核：浏览器与 Node 共用，无外部依赖）：RGBA 缓冲 + 确定性随机/噪声 + 常用图元。
 * 所有美术都由代码生成，因此必须确定性（同一 seed => 同一图）。
 */

export type RGBA = [number, number, number, number];

export function hex(c: string, a = 255): RGBA {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), a];
}

/** mulberry32：小而快的确定性 PRNG */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) { return Math.floor(this.next() * n); }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  chance(p: number) { return this.next() < p; }
}

/** 整数格点哈希 -> [0,1) */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) { return t * t * (3 - 2 * t); }

/** 平滑值噪声，scale 为格点间距(像素) */
export function vnoise(x: number, y: number, scale: number, seed = 0): number {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = smooth(gx - x0), fy = smooth(gy - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** 可周期平铺的值噪声（周期为 period 个格点），用于无缝纹理 */
export function tnoise(x: number, y: number, scale: number, period: number, seed = 0): number {
  const gx = x / scale, gy = y / scale;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = smooth(gx - x0), fy = smooth(gy - y0);
  const m = (v: number) => ((v % period) + period) % period;
  const a = hash2(m(x0), m(y0), seed), b = hash2(m(x0 + 1), m(y0), seed);
  const c = hash2(m(x0), m(y0 + 1), seed), d = hash2(m(x0 + 1), m(y0 + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export class Img {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: RGBA) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (c[3] === 255) { this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; return; }
    // alpha 混合
    const a = c[3] / 255, da = this.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    this.data[i] = (c[0] * a + this.data[i] * da * (1 - a)) / oa;
    this.data[i + 1] = (c[1] * a + this.data[i + 1] * da * (1 - a)) / oa;
    this.data[i + 2] = (c[2] * a + this.data[i + 2] * da * (1 - a)) / oa;
    this.data[i + 3] = oa * 255;
  }
  get(x: number, y: number): RGBA {
    if (!this.inb(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alpha(x: number, y: number) { return this.inb(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x: number, y: number, w: number, c: RGBA) { for (let i = 0; i < w; i++) this.set(x + i, y, c); }
  vline(x: number, y: number, h: number, c: RGBA) { for (let j = 0; j < h; j++) this.set(x, y + j, c); }
  /** 实心椭圆（像素风：用中点判定，无抗锯齿） */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  /** 把 src 叠到本图（带 alpha） */
  blit(src: Img, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a) this.set(dx + x, dy + y, src.get(x, y));
    }
  }
  /** 在不透明像素的外侧加 1px 外轮廓（4 邻域），返回新图（尺寸 +2） */
  outlined(c: RGBA, diag = false): Img {
    const out = new Img(this.w + 2, this.h + 2);
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      const nb = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)
        || (diag && (this.alpha(x - 1, y - 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1) || this.alpha(x + 1, y + 1)));
      if (nb) out.set(x + 1, y + 1, c);
    }
    out.blit(this, 1, 1);
    return out;
  }
  /** 彩色描边：外轮廓取相邻像素颜色压暗并偏紫（比纯黑柔和，像素画常用的"选择性描边"） */
  outlinedSoft(factor = 0.42, tint: RGBA = [40, 28, 64, 255]): Img {
    const out = new Img(this.w + 2, this.h + 2);
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      let best: RGBA | null = null, bl = 1e9;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (this.alpha(x + dx, y + dy) > 0) { const c = this.get(x + dx, y + dy); const l = c[0] + c[1] + c[2]; if (l < bl) { bl = l; best = c; } }
      }
      if (best) out.set(x + 1, y + 1, [best[0] * factor * 0.7 + tint[0] * 0.3, best[1] * factor * 0.7 + tint[1] * 0.3, best[2] * factor * 0.7 + tint[2] * 0.3, 255].map(Math.round) as RGBA);
    }
    out.blit(this, 1, 1);
    return out;
  }
  crop(x: number, y: number, w: number, h: number): Img {
    const o = new Img(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = this.get(x + i, y + j); if (c[3]) o.set(i, j, c); }
    return o;
  }
  /** 写文件由 Node 侧注入（tools/art/px.ts 用 sharp 实现）；浏览器里不会调用，所以这个文件不依赖任何 Node 包 */
  static io?: { save(img: Img, path: string): Promise<void>; preview(img: Img, path: string, scale: number, bg?: string): Promise<void> };
  async save(path: string) { await Img.io!.save(this, path); }
  /** 最近邻放大，用于预览 */
  async savePreview(path: string, scale: number, bg?: string) { await Img.io!.preview(this, path, scale, bg); }
}

/** 颜色调节 */
export function shade(c: RGBA, f: number): RGBA {
  return [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f)), c[3]];
}
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t].map(Math.round) as RGBA;
}
