import Phaser from 'phaser';
import { festivalAt } from '@/shared/calendar';
import { nightness } from '@/shared/clock';
import { clockMinutes } from '@/shared/clock';
import type { Festival } from '@/shared/calendar';

interface Layer { ts: Phaser.GameObjects.TileSprite; vy: number; vx: number; sway: number; night: boolean; twinkle: number; alpha: number }
const KEY: Record<NonNullable<Festival['particles']>, string> = { petal: 'fx_petal', leaf: 'fx_leaf', firefly: 'fx_firefly', snow: 'fx_lights' };

/**
 * 节日的画面氛围：按节日在镜头前铺一层飘落的花瓣 / 桂花 / 萤火虫 / 彩灯（和雨雪一样的平铺层），夜里的满月，整体一点点叠色。
 * 节日本身由服务器时间决定（shared/calendar.ts），这里只负责"显示成什么样"，不影响任何规则。
 */
export class FestivalFx {
  current: Festival | null = null;
  private layers: Layer[] = [];
  private t = 0; private lvl = 0;
  private moon: Phaser.GameObjects.Graphics;
  /** 叠色乘数（节日期间轻轻偏一点颜色，平时 [1,1,1]） */
  tint: [number, number, number] = [1, 1, 1];

  constructor(private scene: Phaser.Scene) {
    const mk = (key: string, vy: number, vx: number, sway: number, night: boolean, twinkle: number, alpha: number) => {
      const ts = scene.add.tileSprite(0, 0, 64, 64, key).setOrigin(0.5).setDepth(999985).setVisible(false);
      this.layers.push({ ts, vy, vx, sway, night, twinkle, alpha });
    };
    // 层的顺序固定，按节日决定哪几层显示（见 update）
    mk('fx_petal', 34, -14, 14, false, 0, 0.9); mk('fx_petal', 20, -8, 10, false, 0, 0.6);
    mk('fx_leaf', 26, -9, 9, false, 0, 0.85);
    mk('fx_firefly', 3, 1, 12, true, 2.2, 0.9); mk('fx_firefly', 2, -1, 8, true, 1.5, 0.6);
    mk('fx_lights', 0, 0, 0, false, 1.4, 0.8);
    this.moon = scene.add.graphics().setDepth(999984).setVisible(false);
  }

  private static LAYERS: Record<string, number[]> = { sakura: [0, 1], moon: [2], lantern: [3, 4], lights: [5] };

  update(dt: number, serverNow: number) {
    this.t += dt;
    const f = festivalAt(serverNow)?.f ?? null; this.current = f;
    this.lvl = Phaser.Math.Clamp(this.lvl + (f ? dt * 0.5 : -dt * 0.5), 0, 1);
    const cam = this.scene.cameras.main, w = Math.ceil(cam.width / cam.zoom) + 4, h = Math.ceil(cam.height / cam.zoom) + 4;
    const night = nightness(((clockMinutes(serverNow) % 1440) + 1440) % 1440);
    const on = new Set(f ? FestivalFx.LAYERS[f.id] ?? [] : []);
    this.layers.forEach((L, i) => {
      const show = this.lvl > 0.02 && on.has(i) && (!L.night || night > 0.35);
      L.ts.setVisible(show);
      if (!show) return;
      L.ts.setPosition(Math.round(cam.midPoint.x), Math.round(cam.midPoint.y)).setSize(w, h);
      L.ts.tilePositionY -= L.vy * dt; L.ts.tilePositionX -= L.vx * dt + (L.sway ? Math.cos(this.t * 0.8 + i) * L.sway * dt : 0);
      L.ts.tilePositionX = Math.round(L.ts.tilePositionX * 2) / 2; L.ts.tilePositionY = Math.round(L.ts.tilePositionY * 2) / 2;
      const tw = L.twinkle ? 0.65 + 0.35 * Math.sin(this.t * L.twinkle + i * 2) : 1;
      L.ts.setAlpha(L.alpha * this.lvl * tw * (L.night ? Math.min(1, night * 1.3) : 1));
    });
    // 中秋：夜里天上一轮满月（屏幕左上，随夜色淡入）
    const showMoon = f?.id === 'moon' && this.lvl > 0.02 && night > 0.3;
    this.moon.setVisible(showMoon);
    if (showMoon) {
      const g = this.moon, cx = Math.round(cam.midPoint.x - w * 0.3), cy = Math.round(cam.midPoint.y - h * 0.36), a = Math.min(1, night) * this.lvl;
      g.clear(); g.fillStyle(0xfff6d0, 0.1 * a); g.fillCircle(cx, cy, 40); g.fillStyle(0xfff6d0, 0.18 * a); g.fillCircle(cx, cy, 31);
      g.fillStyle(0xfff3c4, 0.92 * a); g.fillCircle(cx, cy, 22); g.fillStyle(0xe8dca8, 0.5 * a); g.fillCircle(cx - 7, cy - 4, 4); g.fillCircle(cx + 6, cy + 7, 3); g.fillCircle(cx + 4, cy - 9, 2);
    }
    const tt = f?.tint ?? [1, 1, 1];
    this.tint = [1 - (1 - tt[0]) * this.lvl, 1 - (1 - tt[1]) * this.lvl, 1 - (1 - tt[2]) * this.lvl];
  }
}
