import Phaser from 'phaser';
import { GLOW_COLORS, GLOW_RARITIES, glowDensity, glowTier, type BathView } from '@/shared/dorm';
import { fishDef, RARITY_COLORS } from '@/shared/fishing';

/** 浴缸精灵里水面的位置（和 tools/art/furniture-dorm.ts 的 dbath 一致） */
const WATER = { x0: 4, y0: 12, x1: 43, y1: 25 };
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
interface Spark { x: number; y: number; vy: number; life: number; max: number; color: number; plus: boolean }

/**
 * 浴缸里的鱼和闪光（宿舍场景里画在浴缸上）：
 *  - 缸里最多 6 种鱼在水里慢慢游（颜色是稀有度的颜色）；
 *  - 稀有度越高、数量越多，水面飘起的闪光越密：少见绿 / 稀有蓝 / 史诗紫 / 传说金 / 神话彩虹；
 *  - 有传说鱼时，浴缸上方多一道淡淡的金色光柱；有神话鱼时光柱变彩虹色。
 * 房主和来做客的好友看到的一样（数据来自服务器的浴缸概览）。
 */
export class BathFx {
  private g: Phaser.GameObjects.Graphics;
  private beam: Phaser.GameObjects.Graphics;
  private view: BathView = { r: [0, 0, 0, 0, 0], f: [] };
  private sparks: Spark[] = [];
  private t = 0; private acc = 0;

  constructor(private scene: Phaser.Scene, private ox: number, private oy: number, depth: number) {
    this.g = scene.add.graphics().setDepth(depth + 0.5);
    this.beam = scene.add.graphics().setDepth(depth + 0.6).setBlendMode(Phaser.BlendModes.ADD);
  }
  set(v: BathView | undefined) { this.view = v ?? { r: [0, 0, 0, 0, 0], f: [] }; }
  destroy() { this.g.destroy(); this.beam.destroy(); }

  update(dt: number) {
    this.t += dt;
    const v = this.view, tier = glowTier(v), dens = glowDensity(v), g = this.g;
    g.clear(); this.beam.clear();
    const W = WATER, wx0 = this.ox + W.x0, wy0 = this.oy + W.y0, ww = W.x1 - W.x0, wh = W.y1 - W.y0;
    // 鱼：每种一条，在水里来回游（不同速度和高度）
    v.f.forEach((id, i) => {
      const d = fishDef(id), col = hex(d ? RARITY_COLORS[d.rarity] : '#8a8a7a');
      const sp = 5 + (i % 3) * 2.5, span = ww - 12, ph = i * 1.7, p = ((this.t * sp + ph * 9) % (span * 2)), x = p < span ? p : span * 2 - p, dir = p < span ? 1 : -1;
      const y = wy0 + 3 + ((i * 5) % (wh - 5)) + Math.round(Math.sin(this.t * 1.6 + i) * 1);
      const fx = wx0 + 3 + x;
      g.fillStyle(0x1a2a3a, 0.5); g.fillRect(fx - 1, y - 1, 8, 5);
      g.fillStyle(col, 1); g.fillRect(fx + (dir > 0 ? 1 : 2), y, 5, 3); g.fillRect(fx + (dir > 0 ? 0 : 6), y - 1, 1, 5); // 身体 + 尾巴
      g.fillStyle(0xffffff, 0.85); g.fillRect(fx + (dir > 0 ? 5 : 2), y, 1, 1); // 眼睛
    });
    if (tier < 1) { this.sparks.length = 0; return; }
    // 闪光：按稀有度的数量加权选颜色，密度随数量；神话 = 彩虹轮转
    this.acc += dt * (3 + dens * 22);
    while (this.acc >= 1) {
      this.acc -= 1;
      const weights = v.r.map((n, i) => n * (i + 1)), total = weights.reduce((a, b) => a + b, 0); let r = Math.random() * total, ci = 0;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { ci = i; break; } }
      const rar = GLOW_RARITIES[ci];
      const color = rar === 'mythic' ? Phaser.Display.Color.HSVToRGB(((this.t * 0.5 + Math.random()) % 1), 0.55, 1) as Phaser.Types.Display.ColorObject : null;
      const col = color ? Phaser.Display.Color.GetColor(color.r, color.g, color.b) : hex(GLOW_COLORS[rar]);
      this.sparks.push({ x: wx0 + Math.random() * ww, y: wy0 + wh - Math.random() * 4, vy: -(6 + Math.random() * 10), life: 0, max: 0.9 + Math.random() * 0.9, color: col, plus: Math.random() < 0.3 });
      if (this.sparks.length > 80) this.sparks.shift();
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]; s.life += dt; s.y += s.vy * dt;
      if (s.life >= s.max) { this.sparks.splice(i, 1); continue; }
      const a = Math.sin((s.life / s.max) * Math.PI), px = Math.round(s.x), py = Math.round(s.y);
      g.fillStyle(s.color, a); g.fillRect(px, py, 1, 1);
      if (s.plus && a > 0.6) { g.fillStyle(s.color, a * 0.7); g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3); }
    }
    // 水面的一层柔光（颜色随最高稀有度）和传说 / 神话的光柱
    const top = GLOW_RARITIES[tier - 1], cx = this.ox + 24;
    const topCol = top === 'mythic' ? (() => { const c = Phaser.Display.Color.HSVToRGB((this.t * 0.25) % 1, 0.5, 1) as Phaser.Types.Display.ColorObject; return Phaser.Display.Color.GetColor(c.r, c.g, c.b); })() : hex(GLOW_COLORS[top]);
    this.beam.fillStyle(topCol, 0.1 + 0.04 * tier + 0.03 * Math.sin(this.t * 2)); this.beam.fillRect(wx0, wy0, ww, wh);
    if (tier >= 4) for (let k = 0; k < 3; k++) { this.beam.fillStyle(topCol, (0.05 + 0.02 * Math.sin(this.t * 1.5 + k)) * (tier - 2)); this.beam.fillRect(cx - 9 + k * 4, this.oy - 26, 5 - k, 34); }
  }
}
