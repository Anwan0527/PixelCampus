/** 画面特效：校名石彩蛋、手牵手连线、田径场标线与检查点光圈、骑车撞墙。 */
import Phaser from 'phaser';
import { EGG_FOUND_MSG } from '@/world/egg';
import { GATES, RUN } from '@/shared/run';
import { sfx } from '@/audio/sfx';
import type { WorldScene } from '../WorldScene';

/** 彩蛋特效：碑面闪白 → 文字向上一跳 → 到最高点换字并迸出火花 → 弹跳落回。回到原名时多一轮金色大火花和提示。 */
export function playEgg(sc: WorldScene, st: { busy?: boolean; text?: Phaser.GameObjects.Text }, next: string, final: boolean) {
  const t = st.text;
  if (!t) return;
  st.busy = true;
  ensureSparkTextures(sc);
  const cx = t.x, cy = t.y, baseY = t.y, depth = t.depth + 2;
  const color0 = t.style.color as string, stroke0 = t.style.stroke as string;
  // 碑面闪白
  const flash = sc.add.rectangle(cx, cy, 172, 34, 0xffffff, 0.75).setDepth(depth - 1).setBlendMode(Phaser.BlendModes.ADD);
  sc.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
  sparkBurst(sc, cx, cy, depth, final ? 10 : 6, false);
  // 文字上跳 → 换字 → 弹回
  sc.tweens.add({ targets: t, y: baseY - 15, scaleX: 1.12, scaleY: 1.12, duration: 130, ease: 'Quad.easeOut', onComplete: () => {
    t.setText(next).setColor('#ffb000').setStroke('#7a2a20', 3);
    sparkBurst(sc, cx, cy - 6, depth, final ? 34 : 22, final);
    sc.tweens.add({ targets: t, y: baseY, scaleX: 1, scaleY: 1, duration: 380, ease: 'Bounce.easeOut', onComplete: () => {
      t.setColor(color0).setStroke(stroke0, 2); st.busy = false;
      if (final) { sc.hud.banner(EGG_FOUND_MSG, '校名石轻轻闪了一下光'); sc.net.system(`✨ ${EGG_FOUND_MSG}`); sc.net.achEvent('egg_done'); } // 走完一轮：通知服务器（成就「真正的河北工程」，服务器会核对你是不是在校名石前）
    } });
  } });
}

/** 像素十字火花贴图（金/白、大/小）：只生成一次 */
export function ensureSparkTextures(sc: WorldScene) {
  if (sc.textures.exists('spark_l')) return;
  const mk = (key: string, n: number, arm: string, core: string) => { // 先画 3 格宽的深琥珀描边，再画 1 格宽的亮色十字：浅色碑面和绿草地上都看得清
    const c = sc.textures.createCanvas(key, n, n)!, g = c.getContext(), m = (n - 1) / 2;
    g.fillStyle = '#8a4b00'; g.fillRect(m - 1, 0, 3, n); g.fillRect(0, m - 1, n, 3);
    g.fillStyle = arm; g.fillRect(m, 1, 1, n - 2); g.fillRect(1, m, n - 2, 1);
    g.fillStyle = core; g.fillRect(m - 1, m - 1, 3, 3); c.refresh();
  };
  mk('spark_l', 11, '#ffc400', '#fff6c8'); mk('spark_s', 5, '#ffd24a', '#ffffff'); mk('spark_w', 7, '#ffe27a', '#ffffff');
}

/** 从碑面随机点迸出 n 颗火花：向上偏的随机速度，变小、变透明后消失（用补间，不依赖粒子系统） */
export function sparkBurst(sc: WorldScene, cx: number, cy: number, depth: number, n: number, big: boolean) {
  const keys = big ? ['spark_l', 'spark_l', 'spark_w', 'spark_s'] : ['spark_s', 'spark_w', 'spark_l'];
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * 164, y = cy + (Math.random() - 0.5) * 28;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 14 + Math.random() * (big ? 46 : 32);
    const im = sc.add.image(x, y, keys[Math.floor(Math.random() * keys.length)]).setDepth(depth).setAlpha(1);
    sc.tweens.add({
      targets: im, x: x + Math.cos(ang) * sp, y: y + Math.sin(ang) * sp + 8, alpha: 0, scale: 0.4,
      duration: 420 + Math.random() * 380, delay: Math.random() * 140, ease: 'Quad.easeOut', onComplete: () => im.destroy(),
    });
  }
}

/** 手拉手：每一对牵着手的人之间画「手牵手」——两条胳膊（肤色、带描边）从身体伸向中间，中间是握在一起的手，手上飘一颗小爱心；两个人离得远一点时胳膊会自然下垂 */
export function drawHandLinks(sc: WorldScene) {
  const g = sc.handG; g.clear();
  const t = sc.time.now / 1000, SKIN = 0xf4c9a0, SKIN_D = 0xdca37a, INK = 0x3a2418;
  const HEART = ['01010', '11111', '01110', '00100'];
  for (const { l, f } of sc.handPairs) {
    const ent = (pid: number) => (pid === sc.net.selfId ? sc.player : sc.remotes.get(pid));
    const a = ent(l), b = ent(f); if (!a || !b) continue;
    const ay = a.y - 11, by = b.y - 11, d = Math.hypot(b.x - a.x, by - ay); if (d < 1.5) continue;
    const mx = (a.x + b.x) / 2, my = (ay + by) / 2, sag = Math.min(7, Math.max(0, (d - 15) * 0.18)); // 离远了胳膊下垂
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8, w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u; pts.push([w0 * a.x + w1 * mx + w2 * b.x, w0 * ay + w1 * (my + sag * 1.6) + w2 * by]); }
    const line = (w: number, c: number) => { g.lineStyle(w, c, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.strokePath(); };
    line(4, INK); line(2, SKIN); // 胳膊：深色描边 + 肤色
    const hx = Math.round(mx), hy = Math.round(my + sag * 0.8);
    g.fillStyle(INK, 1); g.fillRect(hx - 3, hy - 3, 6, 6); g.fillStyle(SKIN, 1); g.fillRect(hx - 2, hy - 2, 4, 4); g.fillStyle(SKIN_D, 1); g.fillRect(hx - 2, hy + 1, 4, 1); g.fillStyle(0xffffff, 0.55); g.fillRect(hx - 2, hy - 2, 1, 1); // 握在一起的手
    const by0 = hy - 10 + Math.round(Math.sin(t * 3 + l) * 1); // 小爱心轻轻上下浮
    HEART.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') { g.fillStyle(ry === 1 && rx === 1 ? 0xffb0c0 : 0xff5a7a, 1); g.fillRect(hx - 2 + rx, by0 + ry, 1, 1); } });
  }
}

/** 田径场起跑线（黑白格）与比赛时指示下一个检查点的光圈 */
export function buildTrackMarks(sc: WorldScene) {
  const g = sc.add.graphics().setDepth(GATES[0].y - 1000), a = GATES[0], w = 100, rows = 2, cell = 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < w / cell; c++) { g.fillStyle((r + c) % 2 ? 0x2a2a2a : 0xfaf6ea, 0.92).fillRect(Math.round(a.x - w / 2 + c * cell), Math.round(a.y - rows * cell / 2 + r * cell), cell, cell); }
  sc.add.text(Math.round(a.x), Math.round(a.y - 14), '起点 / 终点', { fontFamily: 'ArkPixel', fontSize: '10px', color: '#fff6d8', stroke: '#3a1a10', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(GATES[0].y - 999);
  sc.runMark = sc.add.graphics().setDepth(1e5);
}

export function drawRunMark(sc: WorldScene) {
  const g = sc.runMark; if (!g) return;
  const gate = sc.runUi.nextGate;
  g.clear();
  if (gate < 0) return;
  const p = GATES[gate], k = (sc.time.now % 900) / 900;
  g.lineStyle(3, 0xffd24a, 0.9 - 0.6 * k).strokeCircle(p.x, p.y, 14 + k * (RUN.GATE_R - 14));
  g.lineStyle(2, 0xff7a3a, 0.9).strokeCircle(p.x, p.y, 8);
  g.fillStyle(0xfff6c8, 0.9).fillCircle(p.x, p.y, 3);
}

/** 骑车撞墙：镜头抖一下、响一声；每 20 秒最多报一次（服务器会核对他在骑车且身边真有障碍） */
export function onBikeCrash(sc: WorldScene) {
  sc.cameras.main.shake(140, 0.004); sfx('lock');
  const now = sc.time.now;
  if (now - sc.crashAt > 20000) { sc.crashAt = now; sc.net.achEvent('bike_crash'); }
}
