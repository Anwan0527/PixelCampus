import Phaser from 'phaser';
import { BIRD_REACH, BIRDS, birdHomes, type BirdDef } from '@/shared/waterfowl';
import type { WaterMask } from '@/shared/water';
import { TILE } from '@/core/const';
import { redrawWhenGlyphsReady } from '@/ui/glyphs';

type State = 'swim' | 'idle' | 'preen' | 'flap' | 'dip' | 'sleep' | 'greet' | 'eat';

/** 谁在岸边：位置、是不是在奔跑 / 骑车（吓到水禽，它们不过来）、是不是在钓鱼（安静，但别靠太近打扰） */
export interface BirdVisitor { x: number; y: number; fast: boolean; fishing: boolean }
export interface BirdEnv { night: boolean; rain: boolean }

/** 休闲动作的持续时间（毫秒） */
const ACT_MS: Record<string, [number, number]> = { preen: [2800, 4800], flap: [1200, 1800], dip: [2200, 3800], idle: [1500, 4500] };

/**
 * 精工湖里的水禽：在自己的"家"附近慢慢游、发呆、梳羽、点头吃东西、偶尔扑翅；夜里睡觉（头埋翅膀），雨天更活跃。
 * 玩家安静地站在岸边（水面离脚边不远）时，离得近的几只会好奇地游过来、面朝玩家；这时靠近按 E 就能喂（见 WorldScene）。
 * 位置和动作只发生在本机，不同步（和小猫一样）；哪几只在哪里的"家"由 shared/waterfowl 的 birdHomes 固定算出。
 */
export class LakeBird {
  static env: BirdEnv = { night: false, rain: false };
  readonly sprite: Phaser.GameObjects.Sprite;
  x: number; y: number;
  state: State = 'idle';
  private tx: number; private ty: number;
  private until = 0;
  private face = 1;
  private view: 'side' | 'down' | 'up' = 'side';
  private curKey = '';
  private tag?: Phaser.GameObjects.Text; private tagLabel = '';
  /** 正被岸边的玩家吸引（游过去 / 已经在等） */
  private drawn = false;
  /** 到这个时间之前不再被吸引（刚被喂过 / 玩家走开后歇一会儿） */
  private bored = 0;
  private lastNear = 0;
  private readonly speed: number;
  private readonly swan: boolean;

  constructor(private scene: Phaser.Scene, readonly def: BirdDef, readonly hx: number, readonly hy: number, private fit: (x: number, y: number) => boolean, swan: boolean) {
    this.x = hx; this.y = hy; this.tx = hx; this.ty = hy; this.swan = swan; this.speed = swan ? 15 : 21;
    const m = scene.cache.json.get('birdsMeta') as { w: number; h: number; ax: number; ay: number };
    this.sprite = scene.add.sprite(hx, hy, 'birds', `bird${def.kind}_idle_0`).setOrigin(m.ax / m.w, m.ay / m.h);
    this.face = Math.random() < 0.5 ? 1 : -1;
    this.until = scene.time.now + Math.random() * 3000;
    this.setState('idle', 1000 + Math.random() * 3000);
    this.sync();
  }

  get label() { return this.def.name; }
  distTo(x: number, y: number) { return Math.hypot(this.x - x, this.y - y); }
  /** 玩家够得着、能喂吗：睡着的、正在吃的不行 */
  get interactive() { return this.state !== 'sleep' && this.state !== 'eat' && this.state !== 'flap'; }
  reachable(x: number, y: number) { return this.interactive && this.distTo(x, y) <= BIRD_REACH; }
  get wantsPlayer() { return this.drawn; }

  private play(id: string, loop = true) {
    const k = `bird${this.def.kind}_${this.scene.anims.exists(`bird${this.def.kind}_${id}`) ? id : 'idle'}`;
    if (k !== this.curKey || !this.sprite.anims.isPlaying) { this.curKey = k; this.sprite.play(loop ? { key: k, repeat: -1 } : k, true); }
  }
  private setState(s: State, ms = 0) {
    this.state = s; this.until = this.scene.time.now + ms;
    const front = this.view === 'down' ? '_down' : this.view === 'up' ? '_up' : '';
    switch (s) {
      case 'swim': this.play(this.view === 'side' ? 'swim' : `swim${front}`); break;
      case 'preen': this.play('preen'); break;
      case 'flap': this.play('flap'); break;
      case 'dip': case 'eat': this.play('dip'); break;
      case 'sleep': this.play('sleep'); break;
      default: this.play(this.view === 'side' ? 'idle' : `idle${front}`);   // idle / greet
    }
  }
  private faceDir(dx: number, dy: number) {
    if (Math.abs(dy) > Math.abs(dx) * 1.3) this.view = dy > 0 ? 'down' : 'up';
    else { this.view = 'side'; if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1; }
  }
  /** 被喂了：低头吃一会儿，之后歇着不再被吸引一阵（给别的鸟让位） */
  feed() { this.faceDir(this.lastDx, this.lastDy); this.setState('eat', 2400); this.drawn = false; this.bored = this.scene.time.now + 9000; this.hearts(); }
  private lastDx = 0; private lastDy = 1;
  private hearts() {
    for (let i = 0; i < 2; i++) {
      const im = this.scene.add.image(this.x + (i ? 6 : -6), this.y - 18, 'heart').setDepth(this.y + 5).setAlpha(0).setScale(0.7);
      this.scene.tweens.add({ targets: im, y: im.y - 14, alpha: { from: 1, to: 0 }, duration: 900, delay: i * 200, ease: 'Quad.easeOut', onStart: () => im.setAlpha(1), onComplete: () => im.destroy() });
    }
  }

  /** (x, y) 这一点水够不够深：身子左右各 7 像素、脚下 4 像素都在水里 */
  static fits(at: (x: number, y: number) => boolean, x: number, y: number) { return at(x, y) && at(x - 7, y) && at(x + 7, y) && at(x, y + 4) && at(x, y - 4); }
  private lineClear(x1: number, y1: number) {
    const n = Math.ceil(Math.hypot(x1 - this.x, y1 - this.y) / 8);
    for (let i = 1; i <= n; i++) if (!this.fit(this.x + ((x1 - this.x) * i) / n, this.y + ((y1 - this.y) * i) / n)) return false;
    return true;
  }
  private step(tx: number, ty: number, sp: number): boolean {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 1.2) return false;
    const m = Math.min(sp, d), nx = this.x + (dx / d) * m, ny = this.y + (dy / d) * m;
    if (!this.fit(nx, ny)) return false;
    this.x = nx; this.y = ny; this.faceDir(dx, dy);
    return true;
  }

  /**
   * 每帧：v = 玩家；lure = 正在吸引水禽的那一点（玩家脚边最近的一块能游的水；玩家不安静 / 不在岸边时为 null）；
   * allowed = 轮到这只被吸引（同时最多两只，由 LakeBirds 分配）；slot = 排第几，两只时站开一点。
   */
  update(dt: number, v: BirdVisitor, lure: { x: number; y: number } | null, allowed: boolean, slot: number) {
    const now = this.scene.time.now, dv = this.distTo(v.x, v.y), env = LakeBird.env;
    this.lastDx = v.x - this.x; this.lastDy = v.y - this.y;
    // 被吸引：游到岸边那一点（两只时左右各偏一点）
    const wants = !!lure && allowed && now >= this.bored && this.state !== 'eat' && this.state !== 'sleep' && !v.fast;
    if (wants) {
      this.drawn = true;
      const lx = lure!.x + (slot ? 13 : -3), ly = lure!.y;
      const tx = this.fit(lx, ly) ? lx : lure!.x, ty = this.fit(lx, ly) ? ly : lure!.y;
      if (this.distTo(tx, ty) > 2.5) { if (!this.step(tx, ty, this.speed * 1.7 * dt)) { this.drawn = false; this.bored = now + 6000; } else if (this.state !== 'swim') this.setState('swim'); this.sync(); return; }
      // 到了：面朝玩家等着
      this.faceDir(v.x - this.x, v.y - this.y);
      if (this.state !== 'greet') this.setState('greet');
      this.lastNear = now; this.sync(); return;
    }
    if (this.drawn) { this.drawn = false; this.bored = Math.max(this.bored, now + 12000); this.setState('idle', 1200); }   // 玩家走了 / 跑了：游开，歇一阵
    switch (this.state) {
      case 'swim': {
        if (!this.step(this.tx, this.ty, this.speed * dt)) this.setState('idle', 1000 + Math.random() * 2500);
        else this.play(this.view === 'side' ? 'swim' : this.view === 'down' ? 'swim_down' : 'swim_up');
        break;
      }
      case 'sleep': if (!env.night || dv < 60) this.setState('idle', 1500); break;
      case 'eat': if (now >= this.until) { this.setState('idle', 1500); } break;
      default: if (now >= this.until) this.next(env, dv);
    }
    this.sync();
  }

  /** 发呆 / 动作结束后做点别的：夜里睡觉、雨天爱梳羽扑翅、平时慢慢游到家附近另一处 */
  private next(env: BirdEnv, dv: number) {
    const act = (s: State, name: string) => { this.view = 'side'; const [a, b] = ACT_MS[name]; this.setState(s, a + Math.random() * (b - a)); };
    const w: [number, () => void][] = [
      [env.night && dv > 70 ? 0.6 : 0, () => { this.view = 'side'; this.setState('sleep', 12000 + Math.random() * 15000); }],
      [env.rain ? 0.14 : 0.07, () => act('preen', 'preen')],
      [env.rain ? 0.12 : 0.03, () => act('flap', 'flap')],
      [0.1, () => act('dip', 'dip')],
      [0.12, () => act('idle', 'idle')],
    ];
    const total = w.reduce((n, [x]) => n + x, 0);
    let r = Math.random() * (total + 0.5);
    for (const [x, fn] of w) { if (r < x) { fn(); return; } r -= x; }
    // 去家附近的另一处（水里走得通才去）
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, rr = 30 + Math.random() * (this.swan ? 90 : 120);
      const tx = this.hx + Math.cos(a) * rr, ty = this.hy + Math.sin(a) * rr * 0.8;
      if (this.fit(tx, ty) && this.lineClear(tx, ty)) { this.tx = tx; this.ty = ty; this.faceDir(tx - this.x, ty - this.y); this.setState('swim'); return; }
    }
    this.setState('idle', 2000);
  }

  private showTag(near: boolean) {
    if (!near) { this.tag?.setVisible(false); return; }
    if (!this.tag) this.tag = this.scene.add.text(0, 0, '', { fontFamily: 'ArkPixel', fontSize: '11px', color: '#e8f6ff', backgroundColor: 'rgba(16,30,44,0.62)', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1);
    const label = this.label;
    this.tag.setText(label).setVisible(true);
    if (label !== this.tagLabel) { this.tagLabel = label; const tg = this.tag; redrawWhenGlyphsReady(label, () => { if (tg.active) tg.updateText(); }); }
  }
  /** 玩家走近时显示名字牌（WorldScene 每帧调用） */
  nameTag(on: boolean) { this.showTag(on); this.sync(); }

  private sync() {
    const rx = Math.round(this.x), ry = Math.round(this.y);
    this.sprite.setPosition(rx, ry).setDepth(this.y).setFlipX(this.view === 'side' && this.face < 0);
    this.tag?.setPosition(rx, ry - 26).setDepth(this.y + 0.5);
  }
  destroy() { this.tag?.destroy(); this.sprite.destroy(); }
}

/**
 * 湖里的全部水禽：创建（按 birdHomes 固定算出的家）、每帧更新（离镜头太远的不更新）、
 * 找出被岸边玩家吸引的那一点（玩家脚边最近的能游的水）并分配给最近的两只。
 */
export class LakeBirds {
  readonly list: LakeBird[] = [];
  private lure: { x: number; y: number } | null = null;
  private lureT = 0;
  private still = 0; private lastX = 0; private lastY = 0;
  constructor(private scene: Phaser.Scene, private water: WaterMask) {
    const homes = birdHomes(water);
    const at = (x: number, y: number) => water.at(x, y);
    BIRDS.forEach((d, i) => {
      const h = homes[i]; if (!h) return;
      this.list.push(new LakeBird(scene, d, h[0] * TILE, h[1] * TILE, (x, y) => LakeBird.fits(at, x, y), d.kind >= 3));
    });
  }
  /** 玩家脚边 44 像素内最近的、水禽放得下的水面点（没有 = 不在岸边） */
  private findLure(px: number, py: number): { x: number; y: number } | null {
    const at = (x: number, y: number) => this.water.at(x, y);
    let best: { x: number; y: number } | null = null, bd = 1e9;
    for (let r = 6; r <= 44; r += 4) for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, x = px + Math.cos(ang) * r, y = py + Math.sin(ang) * r * 0.9;
      if (!LakeBird.fits(at, x, y)) continue;
      const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }
  update(dt: number, v: BirdVisitor, cam: { x: number; y: number; rx: number; ry: number }) {
    const now = this.scene.time.now;
    // 玩家是不是"安静"站着（几乎没动）：动了就重新计时
    if (Math.hypot(v.x - this.lastX, v.y - this.lastY) > 2) { this.still = 0; this.lastX = v.x; this.lastY = v.y; } else this.still += dt;
    if (now >= this.lureT) { this.lureT = now + 400; this.lure = this.findLure(v.x, v.y); }
    const calm = this.lure && this.still > 0.35 && !v.fast;
    // 离吸引点 190 像素内、最近的两只被分配
    const near = calm ? this.list.filter((b) => b.state !== 'sleep' && b.distTo(this.lure!.x, this.lure!.y) < 190).sort((a, b) => a.distTo(this.lure!.x, this.lure!.y) - b.distTo(this.lure!.x, this.lure!.y)).slice(0, 2) : [];
    for (const b of this.list) {
      if (Math.abs(b.x - cam.x) > cam.rx || Math.abs(b.y - cam.y) > cam.ry) continue;   // 离镜头太远：不更新
      const i = near.indexOf(b);
      b.update(dt, v, calm ? this.lure : null, i >= 0, i < 0 ? 0 : i);
      b.nameTag(b.distTo(v.x, v.y) < 70);
    }
  }
  /** 玩家够得着的最近一只（能喂的） */
  nearest(x: number, y: number): LakeBird | null {
    let best: LakeBird | null = null, bd = BIRD_REACH;
    for (const b of this.list) { if (!b.interactive) continue; const d = b.distTo(x, y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  byId(id: number): LakeBird | undefined { return this.list.find((b) => b.def.id === id); }
  destroy() { for (const b of this.list) b.destroy(); this.list.length = 0; }
}
