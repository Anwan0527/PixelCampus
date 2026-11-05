import Phaser from 'phaser';
import { CAT_REACH, CAT_WANDER, LEVEL_NAMES, catLevel, type CatDef } from '@/shared/cats';
import type { WorldMap } from '@/world/WorldMap';

type State = 'sit' | 'walk' | 'sleep' | 'eat' | 'happy' | 'flee' | 'act';

/** 谁在靠近小猫：位置，以及是不是在"快速移动"（奔跑/骑车会吓到不熟的猫） */
export interface Visitor { x: number; y: number; fast: boolean }

/** 天气与昼夜（WorldScene 每帧写入）：夜里猫更爱睡，雨雪停了会抖掉身上的水/雪 */
export interface CatEnv { night: boolean; rain: boolean; snow: boolean }

/** 休闲动作（tools/art/cat-rig 的动作名）：持续时间区间（毫秒）与是否循环；不循环的动作播完停在最后一帧 */
const ACTS: Record<string, { ms: [number, number]; loop: boolean }> = {
  lick_paw: { ms: [3500, 5500], loop: true }, groom: { ms: [3500, 5500], loop: true }, scratch: { ms: [1800, 2600], loop: true },
  stretch: { ms: [1500, 1700], loop: false }, yawn: { ms: [1500, 1600], loop: false }, loaf: { ms: [6000, 12000], loop: true },
  look_back: { ms: [3000, 5000], loop: true }, meow: { ms: [1200, 1800], loop: true }, rub: { ms: [2800, 4000], loop: true },
  knead: { ms: [3000, 5000], loop: true }, roll: { ms: [2400, 3200], loop: true }, slow_blink: { ms: [1800, 2200], loop: true },
  shake_water: { ms: [700, 800], loop: false }, shake_snow: { ms: [700, 800], loop: false },
  stalk: { ms: [1300, 1700], loop: true }, pounce: { ms: [800, 900], loop: false }, chase_tail: { ms: [3000, 4500], loop: true },
};

/**
 * 校园小猫：在自己的"家"附近慢慢游走、坐着发呆、打盹，还会舔爪、理毛、挠耳朵、伸懒腰、打哈欠……
 * 家和毛色、名字由 shared/cats 的固定算法决定（所有玩家看到同一只猫在同一个地方）；游走和这些小动作只发生在本机，不同步。
 * 不太熟的猫（好感低）见到奔跑/骑车的人会躲开；熟了就不怕了；亲密以上的猫会蹭腿、踩奶，挚友还会翻肚皮。
 * 动画来自 tools/art/cat-rig（侧视 / 正面 / 背面三个视角），按位移或面向玩家的主轴选视角。
 */
export class Cat {
  /** 天气与昼夜，由场景每帧写入 */
  static env: CatEnv = { night: false, rain: false, snow: false };
  readonly sprite: Phaser.GameObjects.Sprite;
  x: number; y: number;
  state: State = 'sit';
  private until = 0;
  private tx: number; private ty: number;
  private face = 1;
  private held = false;
  private tag?: Phaser.GameObjects.Text;
  /** 玩家给它取的专属名字（只有这个玩家的客户端会设置）；没有就用原名 */
  nick?: string;
  private away = false; private wasFollowing = false;
  /** 我送给它的窝（只有我的客户端画）：放在它的家 */
  private bed?: Phaser.GameObjects.Image;
  /** 当前播放的动画 key 与"休闲动作"名；朝向视角（侧视 / 向下 / 向上）；上一帧的天气（用来判断雨雪刚停） */
  private curKey = ''; private act = ''; private view: 'side' | 'down' | 'up' = 'side';
  private wasRain = false; private wasSnow = false; private queued = ''; private chain = '';

  constructor(private scene: Phaser.Scene, readonly def: CatDef) {
    this.x = def.hx; this.y = def.hy; this.tx = this.x; this.ty = this.y;
    const m = scene.cache.json.get('catsMeta') as { w: number; h: number; ax: number; ay: number };
    this.sprite = scene.add.sprite(this.x, this.y, 'cats', `cat${def.coat}_sit_0`).setOrigin(m.ax / m.w, m.ay / m.h);
    this.face = Math.random() < 0.5 ? 1 : -1;
    this.until = scene.time.now + Math.random() * 4000;
    this.setState('sit');
    this.sync();
  }

  /** 画/去掉我送给它的猫窝 */
  setBed(on: boolean) {
    if (on && !this.bed) this.bed = this.scene.add.image(this.def.hx, this.def.hy + 1, 'items', 'item_cat_bed').setScale(1.8).setDepth(this.def.hy - 2);
    else if (!on && this.bed) { this.bed.destroy(); this.bed = undefined; }
  }
  /** 显示的名字：专属名字优先 */
  get label() { return this.nick || this.def.name; }
  /** 跟着的人暂时不在视野里：猫跟着他走了，这里先藏起来 */
  setAway(on: boolean) { if (on === this.away) return; this.away = on; this.sprite.setVisible(!on); if (on) this.tag?.setVisible(false); }

  /** 和玩家的距离（脚点到脚点） */
  distTo(x: number, y: number) { return Math.hypot(this.x - x, this.y - y); }
  /** 玩家够得着吗 */
  reachable(x: number, y: number) { return this.distTo(x, y) <= CAT_REACH; }

  /** 播放动画（没有这个动画就退回侧视坐姿）；loop = 强制循环；scale = 播放速度倍率 */
  private play(id: string, loop = false, scale = 1) {
    const key = `cat${this.def.coat}_${this.scene.anims.exists(`cat${this.def.coat}_${id}`) ? id : 'sit'}`;
    this.sprite.anims.timeScale = scale;
    if (key !== this.curKey || !this.sprite.anims.isPlaying) { this.curKey = key; this.sprite.play(loop ? { key, repeat: -1 } : key, true); }
  }
  /** 有对应的"向下"（面朝镜头）版本、而且玩家正在上/下方近处时，用正面/背面动画 */
  private viewed(id: string): string {
    if (this.view === 'down' && this.scene.anims.exists(`cat${this.def.coat}_${id}_down`)) return `${id}_down`;
    return id;
  }

  private setState(s: State, ms = 0, act = '') {
    this.state = s; this.act = act;
    this.until = this.scene.time.now + ms;
    switch (s) {
      case 'walk': this.play(this.moveAnim(26), true, 0.8); break;
      case 'flee': this.play('run', true, 1); break;
      case 'sleep': this.play(act || 'sleep_curl', true); break;
      case 'eat': this.play('eat', true); break;
      case 'happy': this.play(act === 'rub' ? this.viewed('rub') : this.viewed('slow_blink'), true); break;
      case 'act': this.play(this.viewed(act), ACTS[act]?.loop ?? true); break;
      default: this.play(this.view === 'down' ? 'sit_down' : this.view === 'up' ? 'sit_up' : 'sit', true);
    }
  }
  /** 按速度选步态：慢走 / 小跑 / 奔跑；上下走动时用正面/背面走路 */
  private moveAnim(speed: number, dx = 1, dy = 0): string {
    if (Math.abs(dy) > Math.abs(dx) * 1.4 && speed < 100) return dy > 0 ? 'walk_down' : 'walk_up';
    return speed > 100 ? 'run' : speed > 50 ? 'trot' : 'walk';
  }
  /** 朝向玩家：横向为主用侧视（翻转），纵向为主用正面/背面 */
  private faceVisitor(v: Visitor) {
    const dx = v.x - this.x, dy = v.y - this.y;
    if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.hypot(dx, dy) < 90) this.view = dy > 0 ? 'down' : 'up';
    else { this.view = 'side'; if (Math.abs(dx) > 1) this.face = dx > 0 ? 1 : -1; }
  }

  /** 面板打开期间让猫待在原地，面朝玩家 */
  hold(on: boolean, towardX?: number) {
    this.held = on;
    this.chain = '';
    if (on) { if (towardX !== undefined) this.face = towardX >= this.x ? 1 : -1; if (this.state !== 'sit' && this.state !== 'happy' && this.state !== 'eat') this.setState('sit', 1500); }
    else this.view = 'side';
  }

  /** 被摸：好感够了蹭手，否则慢眨眼；冒爱心 */
  pet() { const lv = this.lastLv; this.setState('happy', 2600, lv >= 3 ? 'rub' : 'blink'); this.hearts(3); }
  /** 被喂：低头吃，吃完开心 */
  eat() { this.setState('eat', 2400); this.hearts(0); }
  private lastLv = 0;
  private hearts(n: number) {
    for (let i = 0; i < n; i++) {
      const im = this.scene.add.image(this.x + (Math.random() - 0.5) * 12, this.y - 14, 'heart').setDepth(this.y + 5).setAlpha(0).setScale(0.8);
      this.scene.tweens.add({ targets: im, y: im.y - 16 - Math.random() * 8, alpha: { from: 1, to: 0 }, duration: 900, delay: i * 180, ease: 'Quad.easeOut', onStart: () => im.setAlpha(1), onComplete: () => im.destroy() });
    }
  }

  /**
   * lead = 正带着它走的人（自己或远处能看到的别的玩家）的位置；有 lead 时猫紧跟在身后，不再在家附近游走；
   * lead 没了（让它回家了）就走回家（太远就直接回去）。
   */
  update(dt: number, world: WorldMap, v: Visitor, aff: number, lead?: { x: number; y: number } | null) {
    const now = this.scene.time.now, dv = this.distTo(v.x, v.y), lv = catLevel(aff);
    this.lastLv = lv;
    if (lead) { this.setAway(false); this.wasFollowing = true; this.showTag(true, aff); if (this.held) { this.faceVisitor(v); this.sync(); } else this.followLead(dt, world, lead); return; }
    if (this.wasFollowing) { this.wasFollowing = false; this.goHome(); }
    this.setAway(false);
    this.showTag(dv < 80, aff);
    if (this.held) { this.faceVisitor(v); if (this.state === 'sit') this.setState('sit', 1500); this.sync(); return; }
    // 雨雪刚停：抖掉身上的水 / 雪
    const env = Cat.env;
    if (this.wasRain && !env.rain && this.state !== 'sleep' && this.state !== 'eat') this.queued = 'shake_water';
    else if (this.wasSnow && !env.snow && this.state !== 'sleep' && this.state !== 'eat') this.queued = 'shake_snow';
    this.wasRain = env.rain; this.wasSnow = env.snow;
    if (this.queued && this.state !== 'flee') { const q = this.queued; this.queued = ''; this.doAct(q); }
    // 不熟的猫：被快速靠近就躲开（先炸毛没做，直接跑）
    if (lv < 2 && v.fast && dv < 64 && this.state !== 'eat' && this.state !== 'happy' && this.state !== 'flee') {
      this.chain = '';
      const a = Math.atan2(this.y - v.y, this.x - v.x);
      this.tx = this.x + Math.cos(a) * 52; this.ty = this.y + Math.sin(a) * 52; this.setState('flee', 1200);
    }
    // 睡着的猫被走近会醒：先伸个懒腰
    if (this.state === 'sleep' && dv < 34) { this.faceVisitor(v); this.doAct('stretch'); }
    switch (this.state) {
      case 'sit': case 'happy': case 'eat': case 'sleep': case 'act':
        if (this.state === 'sit' && dv < 90) { const old = this.view; this.faceVisitor(v); if (old !== this.view) this.setState('sit', Math.max(0, this.until - now)); }
        if (now >= this.until) this.next(world, v, lv, dv);
        break;
      case 'walk': case 'flee': {
        const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
        if (d < 1.5 || (this.state === 'flee' && now >= this.until)) { this.view = 'side'; this.setState('sit', 1500 + Math.random() * 3000); break; }
        const speed = this.state === 'flee' ? 84 : 26, sp = speed * dt, mx = (dx / d) * Math.min(sp, d), my = (dy / d) * Math.min(sp, d);
        const p = world.move(this.x, this.y, mx, my);
        if (p.x === this.x && p.y === this.y) { this.view = 'side'; this.setState('sit', 1200 + Math.random() * 2000); break; } // 撞到东西了：停下
        this.x = p.x; this.y = p.y;
        this.heading(dx, dy, speed);
        break;
      }
    }
    this.sync();
  }

  /** 行进中更新朝向与步态动画 */
  private heading(dx: number, dy: number, speed: number) {
    const vert = Math.abs(dy) > Math.abs(dx) * 1.4;
    this.view = vert ? (dy > 0 ? 'down' : 'up') : 'side';
    if (!vert && Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
    const id = this.moveAnim(speed, dx, dy), scale = speed < 40 ? 0.8 : speed > 100 ? 1.2 : 1;
    this.play(id, true, id === 'walk_down' || id === 'walk_up' ? 0.8 : scale);
  }

  /** 跟随：离得远就小跑追上（越远越快），到身边就停下来坐着；被墙挡住就贴墙绕；实在太远就直接出现在身边 */
  private followLead(dt: number, world: WorldMap, lead: { x: number; y: number }) {
    const dx = lead.x - this.x, dy = lead.y - this.y, d = Math.hypot(dx, dy), STOP = 20;
    if (d > 300) { // 玩家骑车/传送走远了：直接追到身边
      const nx = lead.x - 12, ny = lead.y + 2;
      this.x = world.boxBlocked(nx, ny) ? lead.x : nx; this.y = world.boxBlocked(nx, ny) ? lead.y : ny;
      this.view = 'side'; this.setState('sit', 800); this.sync(); return;
    }
    if (d > STOP) {
      const speed = Math.min(170, 30 + (d - STOP) * 3.2), sp = speed * dt, step = Math.min(sp, d - STOP + 2), mx = (dx / d) * step, my = (dy / d) * step;
      if (this.state !== 'walk') { this.state = 'walk'; this.until = 0; }
      let p = world.move(this.x, this.y, mx, my);
      if (p.x === this.x && p.y === this.y) { p = world.move(this.x, this.y, mx, 0); if (p.x === this.x) p = world.move(this.x, this.y, 0, my); }
      this.x = p.x; this.y = p.y;
      this.heading(dx, dy, speed);
    } else {
      if (this.state === 'walk') { this.view = 'side'; this.setState('sit', 1500); }
      if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
    }
    this.sync();
  }
  /** 不再被带着：离家近就走回去，太远（>360 像素）直接回到家 */
  private goHome() {
    if (this.distTo(this.def.hx, this.def.hy) > 360) { this.x = this.def.hx; this.y = this.def.hy; this.view = 'side'; this.setState('sit', 1500); return; }
    this.tx = this.def.hx; this.ty = this.def.hy; this.setState('walk');
  }

  private doAct(name: string) {
    const a = ACTS[name]; if (!a) return;
    this.setState('act', a.ms[0] + Math.random() * (a.ms[1] - a.ms[0]), name);
  }

  /**
   * 发呆/睡醒之后做点别的：按"权重表"挑——夜里更爱睡、雨雪天爱蜷着；好感越高，越爱在你身边蹭腿、踩奶、翻肚皮。
   * 睡醒会先伸懒腰、再打个哈欠。
   */
  private next(world: WorldMap, v: Visitor, lv: number, dv: number) {
    if (this.distTo(this.def.hx, this.def.hy) > CAT_WANDER * 2) { this.view = 'side'; this.goHome(); return; } // 离家太远（刚被带过）：先回家
    if (this.state === 'sleep') { this.doAct('stretch'); this.chain = 'yawn'; return; }
    if (this.chain) { const q = this.chain; this.chain = ''; this.doAct(q); return; }   // 连招：伸懒腰→打哈欠、潜行→扑
    const env = Cat.env, near = dv < 70 && !v.fast, cozy = env.rain || env.snow;
    const table: [number, () => void][] = [
      [lv >= 3 && near ? 0.28 : 0, () => { this.faceVisitor(v); this.doAct('rub'); }],
      [lv >= 3 && near ? 0.1 : 0, () => { this.faceVisitor(v); this.doAct('knead'); }],
      [lv >= 4 && near && !env.night ? 0.06 : 0, () => this.doAct('roll')],
      [lv >= 1 && dv < 90 ? 0.1 : 0, () => { this.faceVisitor(v); this.doAct('slow_blink'); }],
      [lv >= 2 && dv < 90 ? 0.05 : 0, () => { this.faceVisitor(v); this.doAct('meow'); }],
      [dv > 90 ? (env.night ? 0.42 : cozy ? 0.22 : 0.18) : 0, () => this.setState('sleep', 9000 + Math.random() * 12000, lv >= 3 ? 'sleep_side' : 'sleep_curl')],
      [cozy || env.night ? 0.16 : 0.08, () => this.doAct('loaf')],
      [0.07, () => this.doAct('lick_paw')], [0.06, () => this.doAct('groom')], [0.04, () => this.doAct('scratch')],
      [0.03, () => this.doAct('yawn')], [0.025, () => { this.view = 'side'; this.doAct('stalk'); this.chain = 'pounce'; }], [0.02, () => { this.view = 'side'; this.doAct('chase_tail'); }], [0.04, () => this.doAct('look_back')], [0.04, () => this.doAct('stretch')],
      [0.14, () => { this.view = 'side'; this.setState('sit', 3000 + Math.random() * 6000); }],
    ];
    let r = Math.random(); const total = table.reduce((n, [w]) => n + w, 0);
    r *= Math.max(1, total + 0.4);            // 剩下的概率：去走走
    for (const [w, fn] of table) { if (r < w) { fn(); return; } r -= w; }
    for (let i = 0; i < 6; i++) { // 在家附近挑一个能走的点
      const a = Math.random() * Math.PI * 2, rr = 10 + Math.random() * (CAT_WANDER - 10);
      const tx = this.def.hx + Math.cos(a) * rr, ty = this.def.hy + Math.sin(a) * rr;
      if (!world.boxBlocked(tx, ty)) { this.tx = tx; this.ty = ty; this.setState('walk'); return; }
    }
    this.setState('sit', 3000);
  }

  private showTag(near: boolean, aff: number) {
    if (!near) { this.tag?.setVisible(false); return; }
    if (!this.tag) this.tag = this.scene.add.text(0, 0, '', { fontFamily: 'ArkPixel', fontSize: '11px', color: '#ffe9c0', backgroundColor: 'rgba(24,18,12,0.62)', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1);
    this.tag.setText(`${this.label} ${'♥'.repeat(catLevel(aff) + 1)}`).setVisible(true);
    this.tag.setData('lv', LEVEL_NAMES[catLevel(aff)]);
  }

  private sync() {
    const rx = Math.round(this.x), ry = Math.round(this.y);
    this.sprite.setPosition(rx, ry).setDepth(this.y).setFlipX(this.view === 'side' && this.face < 0);
    this.tag?.setPosition(rx, ry - 20).setDepth(this.y + 0.5);
  }

  destroy() { this.tag?.destroy(); this.sprite.destroy(); }
}
