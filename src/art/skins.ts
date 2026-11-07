/**
 * 自定义外观的运行时合成：玩家的外观（shared/appearance 的 17 个选项编号）→ 现场画出全部动作的帧 → 拼成一张纹理 → 建动画。
 * 预置造型（档案里只有 look）仍走构建期的 chars 图集；这里只管 Appearance。
 * 生成是分帧做的（一个动作一帧，不卡画面）；没生成好之前角色先显示预置造型，好了再换。
 * 同时最多保留 MAX 套自定义外观，满了淘汰最久没人用的（有 Character 正在用的不会被淘汰）。
 */
import type Phaser from 'phaser';
import { ANIMS, appToLook, buildAnim, frameMeta } from './char-rig';
import { pack, type PackItem } from './pack';
import { appKey, type Appearance } from '../shared/appearance';

export interface CharsMeta { w: number; h: number; ax: number; ay: number; /** 躺下的横画布 */ lie?: { w: number; h: number; ax: number; ay: number }; count: number; anims: Record<string, { fps: number; loop: boolean; n: number; views: string[] }> }

/** 待机动画的帧顺序：呼吸（两帧各停一会儿）+ 偶尔眨眼 */
const IDLE_ORDER = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 2];

/** 建某套外观的全部动画：动画 key = `${prefix}_${动作}_${方向}`，帧名 = `${prefix}_${动作}_${方向}_${序号}` */
export function createCharAnims(anims: Phaser.Animations.AnimationManager, prefix: string, tex: string, meta: CharsMeta) {
  for (const [id, a] of Object.entries(meta.anims)) for (const dir of a.views) {
    const order = id === 'idle' ? IDLE_ORDER : Array.from({ length: a.n }, (_, f) => f);
    anims.create({ key: `${prefix}_${id}_${dir}`, frameRate: a.fps, repeat: a.loop ? -1 : 0, frames: order.map((f) => ({ key: tex, frame: `${prefix}_${id}_${dir}_${f}` })) });
  }
}

export class SkinManager {
  static readonly MAX = 48;
  private made = new Map<string, { refs: number; last: number }>();
  private waiting = new Map<string, ((prefix: string) => void)[]>();
  private refs = new Map<string, number>();      // 生成中就已经被申请的引用数
  constructor(private game: Phaser.Game, private meta: CharsMeta) {}

  /** 申请一套外观；生成好了（可能是立刻）调 cb(帧名前缀)。返回的 release 在不再使用时调用 */
  use(app: Appearance, cb: (prefix: string, tex: string) => void): { prefix: string; release: () => void } {
    const key = appKey(app), prefix = `a${key}`, tex = `ap_${key}`;
    const rec = this.made.get(key);
    if (rec) { rec.refs++; rec.last = Date.now(); cb(prefix, tex); }
    else {
      this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
      const q = this.waiting.get(key);
      if (q) q.push((p) => cb(p, tex)); else { this.waiting.set(key, [(p) => cb(p, tex)]); this.generate(key, app, prefix, tex); }
    }
    let done = false;
    return { prefix, release: () => { if (done) return; done = true; const r = this.made.get(key); if (r) r.refs = Math.max(0, r.refs - 1); else this.refs.set(key, Math.max(0, (this.refs.get(key) ?? 1) - 1)); } };
  }

  private generate(key: string, app: Appearance, prefix: string, tex: string) {
    const look = appToLook(app), items: PackItem[] = [];
    let i = 0;
    const step = () => {
      const a = ANIMS[i++];
      for (const [k, img] of Object.entries(buildAnim(look, a, 1))) items.push({ key: `${prefix}_${k}`, img });
      if (i < ANIMS.length) setTimeout(step, 0); else this.finish(key, prefix, tex, items);
    };
    setTimeout(step, 0);
  }

  private finish(key: string, prefix: string, tex: string, items: PackItem[]) {
    const atlas = pack(items, 1024), canvas = document.createElement('canvas');
    canvas.width = atlas.img.w; canvas.height = atlas.img.h;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(atlas.img.data), atlas.img.w, atlas.img.h), 0, 0);
    const texture = this.game.textures.addCanvas(tex, canvas)!;
    for (const [name, f] of Object.entries(atlas.frames)) texture.add(name, 0, f.x, f.y, f.w, f.h);
    for (const dir of ['down', 'up', 'left', 'right']) { const f = atlas.frames[`${prefix}_idle_${dir}_0`]; texture.add(`${prefix}_${dir}_0`, 0, f.x, f.y, f.w, f.h); }   // 旧式站立帧别名
    createCharAnims(this.game.anims, prefix, tex, this.meta);
    this.made.set(key, { refs: this.refs.get(key) ?? 0, last: Date.now() }); this.refs.delete(key);
    const q = this.waiting.get(key) ?? []; this.waiting.delete(key);
    this.evict();
    for (const f of q) f(prefix);
  }

  /** 超过 MAX 套就淘汰最久没人用的（没有 Character 在用的才淘汰） */
  private evict() {
    while (this.made.size > SkinManager.MAX) {
      let victim = '', oldest = Infinity;
      for (const [k, r] of this.made) if (r.refs === 0 && r.last < oldest) { victim = k; oldest = r.last; }
      if (!victim) return;
      this.made.delete(victim);
      const prefix = `a${victim}`;
      for (const [id, a] of Object.entries(this.meta.anims)) for (const dir of a.views) this.game.anims.remove(`${prefix}_${id}_${dir}`);
      this.game.textures.remove(`ap_${victim}`);
    }
  }
  /** 已生成的自定义外观数量（测试/调试用） */
  get size() { return this.made.size; }
  get frameSize() { return frameMeta(1); }
}
