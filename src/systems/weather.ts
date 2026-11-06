import Phaser from 'phaser';
import { skyAt, weatherOfSlot, weatherSlot, type Sky, type WeatherState } from '@/shared/season';

/** 一把伞的几种颜色（按人物外观编号轮着用） */
/** 雨伞贴图尺寸：伞面中心在第 cx 列，握柄的手在第 hx 列（Character 据此把伞面罩在头顶、手放在身侧） */
export const UMB = { w: 34, h: 34, cx: 13, hx: 21 } as const;
export const UMBRELLA_COLORS = ['#d6405c', '#3f7fd8', '#f0c040', '#3fae6a', '#8a5ad0', '#f08ab0'] as const;
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** 程序画的天气贴图：两层雨丝、两层雪花、六种颜色的雨伞（BootScene 里调用一次） */
export function makeWeatherTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  const canvas = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    if (tex.exists(key)) return;
    const c = tex.createCanvas(key, w, h)!, g = c.getContext(); g.imageSmoothingEnabled = false; draw(g); c.refresh();
  };
  // 简单的确定性随机，保证每次画出来一样
  const rnd = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const streaks = (key: string, size: number, n: number, len: number, color: string, seed: number) => canvas(key, size, size, (g) => {
    const r = rnd(seed); g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) for (let k = 0; k < len; k++) g.fillRect(x + ox - Math.floor(k / 3), y + oy + k, 1, 1); // 向左下倾斜的雨丝（环绕画，才能无缝平铺）
    }
  });
  streaks('fx_rain_a', 128, 30, 9, 'rgba(206,224,248,0.78)', 11);
  streaks('fx_rain_b', 96, 18, 6, 'rgba(190,210,238,0.5)', 29);
  const flakes = (key: string, size: number, n: number, big: number, color: string, seed: number) => canvas(key, size, size, (g) => {
    const r = rnd(seed); g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size), plus = big > 1 && r() < 0.25;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        g.fillRect(x + ox, y + oy, big, big);
        if (plus) { g.fillRect(x + ox - 1, y + oy, 1, big); g.fillRect(x + ox + big, y + oy, 1, big); g.fillRect(x + ox, y + oy - 1, big, 1); g.fillRect(x + ox, y + oy + big, big, 1); }
      }
    }
  });
  flakes('fx_snow_a', 128, 26, 2, 'rgba(255,255,255,0.95)', 5);
  flakes('fx_snow_b', 96, 22, 1, 'rgba(240,246,255,0.7)', 17);
  // 雨伞：26×34。伞面 11 行半椭圆在最上面（盖过头顶），长伞柄一直垂到手里；握柄的拳头画在伞柄底部（把手弯钩 + 3×3 手）。
  // 底端（把手）在 (13, 34)；Character 把它放在人物手的位置，伞面下沿刚好高过头顶
  const UW = UMB.w, UH = UMB.h, CX = UMB.cx, HX = UMB.hx;
  UMBRELLA_COLORS.forEach((col, i) => canvas(`umb${i}`, UW, UH, (g) => {
    const [r, gr, b] = hexRgb(col), main = `rgb(${r},${gr},${b})`, lite = `rgb(${Math.min(255, r + 55)},${Math.min(255, gr + 55)},${Math.min(255, b + 55)})`, dark = `rgb(${r * 0.66 | 0},${gr * 0.66 | 0},${b * 0.66 | 0})`;
    const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const rows: [number, number][] = []; // 每行 [左, 右]（含）
    for (let y = 0; y < 11; y++) { const t = (10.5 - y) / 10.5, hw = Math.round(11.5 * Math.sqrt(Math.max(0, 1 - t * t))); rows.push([CX - hw, CX + hw - 1 + (hw === 0 ? 1 : 0)]); }
    rows[0] = [CX - 3, CX + 2];
    rows.forEach(([a, z], y) => { for (let x = a; x <= z; x++) px(x, y + 1, x < CX - 3 ? lite : x > CX + 2 ? dark : main); });
    for (const rx of [CX - 8, CX - 4, CX, CX + 4, CX + 8]) for (let y = 3; y < 11; y++) if (rows[y - 1] && rx >= rows[y - 1][0] && rx <= rows[y - 1][1]) px(rx, y + 1, dark); // 伞骨
    for (let x = rows[10][0]; x <= rows[10][1]; x += 2) px(x, 12, dark); // 锯齿下沿
    px(CX, 0, '#4a3426'); // 伞尖
    for (let y = 12; y < 28; y++) px(Math.round(CX + ((HX - CX) * (y - 12)) / 16), y, '#4a3426'); // 斜着的伞柄：伞面罩在头顶，手握在身侧
    // 手：握在伞柄下段（肤色拳头，上面一截袖口）
    for (let y = 26; y < 30; y++) for (let x = HX - 1; x <= HX + 1; x++) px(x, y, y < 27 ? '#6b7a99' : '#f0c8a0');
    px(HX, 30, '#4a3426'); px(HX + 1, 31, '#4a3426'); px(HX + 2, 31, '#4a3426'); px(HX + 2, 30, '#4a3426'); // 把手弯钩
    // 描边：所有"空白但挨着有色像素"的格子画成深色
    const d = g.getImageData(0, 0, UW, UH), a = d.data, out = new Uint8ClampedArray(a);
    for (let y = 0; y < UH; y++) for (let x = 0; x < UW; x++) {
      if (a[(y * UW + x) * 4 + 3] > 0) continue;
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < UW && ny < UH && a[(ny * UW + nx) * 4 + 3] > 0);
      if (nb) { const o = (y * UW + x) * 4; out[o] = 38; out[o + 1] = 26; out[o + 2] = 30; out[o + 3] = 255; }
    }
    d.data.set(out); g.putImageData(d, 0, 0);
  }));
}

/** 目标云量/雨量/雪量（0~1） */
function targetsOf(w: WeatherState) {
  return { cloud: w.kind === 'sunny' ? 0 : w.kind === 'snow' ? 0.6 : 1, rain: w.kind === 'rain' ? w.power : 0, snow: w.kind === 'snow' ? w.power : 0 };
}
const mul = (m: [number, number, number], c: [number, number, number], l: number) => { for (let i = 0; i < 3; i++) m[i] *= 1 - (1 - c[i]) * l; };

/**
 * 天气画面：雨丝/雪花（贴着镜头的两层平铺图，慢慢淡入淡出）+ 阴雨天的整体偏暗偏灰。
 * 天气本身由服务器时间决定（shared/season.ts），这里只负责"显示成什么样"。
 */
export class WeatherFx {
  state: WeatherState = weatherOfSlot(weatherSlot(Date.now()));
  /** 天气的细节：雾 / 雷暴 / 彩虹 / 温度（state 是基础天气，规则只看 state） */
  sky: Sky = skyAt(Date.now());
  /** 雾 / 雷暴 / 彩虹的当前显示强度（缓动） */
  fog = 0; storm = 0; bow = 0;
  private fogRect: Phaser.GameObjects.Rectangle; private flashRect: Phaser.GameObjects.Rectangle; private bowG: Phaser.GameObjects.Graphics;
  private flashAt = 3; private flash = 0;
  /** 当前显示强度（向目标缓动，天气切换时有 5 秒左右的渐变） */
  cloud = 0; rain = 0; snow = 0;
  private layers: { ts: Phaser.GameObjects.TileSprite; kind: 'rain' | 'snow'; vy: number; vx: number; sway: number }[] = [];
  private t = 0;
  /** 开发调试：强制某种天气（不影响别人） */
  forced?: WeatherState;

  constructor(private scene: Phaser.Scene) {
    const mk = (key: string, kind: 'rain' | 'snow', vy: number, vx: number, sway: number) => {
      const ts = scene.add.tileSprite(0, 0, 64, 64, key).setOrigin(0.5).setDepth(999990).setVisible(false);
      this.layers.push({ ts, kind, vy, vx, sway });
    };
    mk('fx_rain_b', 'rain', 330, -110, 0); mk('fx_rain_a', 'rain', 560, -190, 0);
    mk('fx_snow_b', 'snow', 38, -6, 10); mk('fx_snow_a', 'snow', 66, -10, 16);
    this.fogRect = scene.add.rectangle(0, 0, 64, 64, 0xe4eaee, 1).setOrigin(0.5).setDepth(999989).setVisible(false);
    this.flashRect = scene.add.rectangle(0, 0, 64, 64, 0xffffff, 1).setOrigin(0.5).setDepth(999995).setVisible(false);
    this.bowG = scene.add.graphics().setDepth(999988).setVisible(false);
    const t = targetsOf(this.state); this.cloud = t.cloud; this.rain = t.rain; this.snow = t.snow; // 刚进游戏就是当前天气，不从晴天渐变
  }

  /** 每帧：serverNow = 校准后的服务器时间（毫秒） */
  update(dt: number, serverNow: number) {
    this.t += dt;
    this.sky = skyAt(serverNow); this.state = this.forced ?? this.sky.w;
    const sk = this.forced ? { fog: 0, storm: false, rainbow: 0 } : this.sky;
    const tg = targetsOf(this.state), step = (cur: number, to: number, rate: number) => cur + Phaser.Math.Clamp(to - cur, -rate * dt, rate * dt);
    this.cloud = step(this.cloud, tg.cloud, 0.2); this.rain = step(this.rain, tg.rain, 0.2); this.snow = step(this.snow, tg.snow, 0.2);
    this.fog = step(this.fog, sk.fog, 0.12); this.storm = step(this.storm, sk.storm ? 1 : 0, 0.3); this.bow = step(this.bow, sk.rainbow, 0.15);
    const cam = this.scene.cameras.main, w = Math.ceil(cam.width / cam.zoom) + 4, h = Math.ceil(cam.height / cam.zoom) + 4;
    // 雾：整屏一层淡淡的白灰
    this.fogRect.setVisible(this.fog > 0.02); if (this.fog > 0.02) this.fogRect.setPosition(Math.round(cam.midPoint.x), Math.round(cam.midPoint.y)).setSize(w, h).setAlpha(0.34 * this.fog);
    // 雷暴：隔几秒打一次闪（整屏白光一闪、很快淡掉）
    if (this.storm > 0.5) { this.flashAt -= dt; if (this.flashAt <= 0) { this.flash = 0.55; this.flashAt = 4 + Math.random() * 8; } }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.flashRect.setVisible(this.flash > 0.01); if (this.flash > 0.01) this.flashRect.setPosition(Math.round(cam.midPoint.x), Math.round(cam.midPoint.y)).setSize(w, h).setAlpha(this.flash);
    // 彩虹：屏幕上方一道半圆的七色弧
    this.bowG.setVisible(this.bow > 0.02);
    if (this.bow > 0.02) {
      const g = this.bowG, cx = Math.round(cam.midPoint.x), cy = Math.round(cam.midPoint.y + h * 0.42), R = Math.min(w * 0.42, h * 0.8);
      g.clear(); ['#e85a5a', '#f09a4a', '#f0d24a', '#6cc46a', '#5ab4e8', '#5a6ae0', '#9a5ad0'].forEach((c, i) => { g.lineStyle(3, Phaser.Display.Color.HexStringToColor(c).color, 0.5 * this.bow); g.beginPath(); g.arc(cx, cy, R - i * 3, Math.PI, 0, false); g.strokePath(); });
    }
    for (const L of this.layers) {
      const lv = L.kind === 'rain' ? this.rain : this.snow;
      L.ts.setVisible(lv > 0.02);
      if (lv <= 0.02) continue;
      L.ts.setPosition(Math.round(cam.midPoint.x), Math.round(cam.midPoint.y)).setSize(w, h);
      L.ts.tilePositionY -= L.vy * dt; L.ts.tilePositionX -= L.vx * dt + (L.sway ? Math.cos(this.t * 0.9 + L.vy) * L.sway * dt : 0);
      L.ts.tilePositionX = Math.round(L.ts.tilePositionX * 2) / 2; // 对齐半像素，避免雨丝发虚
      L.ts.setAlpha(L.kind === 'rain' ? Math.min(1, 0.35 + lv * 0.65) : Math.min(1, 0.4 + lv * 0.6));
    }
  }

  /** 整体叠色的乘数（0~1）：阴天偏灰、雨天更暗更蓝、雪天偏亮偏冷 */
  get tint(): [number, number, number] {
    const m: [number, number, number] = [1, 1, 1];
    mul(m, [0.9, 0.92, 0.96], this.cloud); mul(m, [0.84, 0.88, 0.95], this.rain); mul(m, [0.94, 0.96, 1], this.snow); mul(m, [0.82, 0.85, 0.93], this.storm);
    return m;
  }
  /** 现在要不要给所有人打伞（雨够大了才打，免得刚飘几滴就全体撑伞） */
  get umbrella() { return this.rain > 0.3; }
}
