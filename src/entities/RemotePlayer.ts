import Phaser from 'phaser';
import { Character } from './Player';
import { hueOf } from '@/shared/profile';
import { NET, unpackFlags, type PublicProfile } from '@/shared/protocol';
import { titleDef } from '@/shared/titles';
import { sameApp } from '@/shared/appearance';

interface State { t: number; x: number; y: number; flags: number }

/** 其他在线玩家：昵称牌 + 在两次快照之间插值（落后 INTERP_MS 毫秒渲染，所以走路是平滑的）。 */
export class RemotePlayer extends Character {
  /** 按位置找长椅（场景设置）：别人坐下时用它找到椅子，画出同样的"坐在椅子上" */
  static findSeat?: (x: number, y: number) => { bx: number; by: number } | undefined;
  private buf: State[] = [];
  constructor(scene: Phaser.Scene, readonly id: number, readonly uid: number, public info: PublicProfile, x: number, y: number, flags: number) {
    super(scene, x, y, info.look, info.app);
    this.buf.push({ t: performance.now() - NET.INTERP_MS * 2, x, y, flags });
    this.applyInfo(info);
    this.applyFlags(flags, x, y);
  }
  applyInfo(info: PublicProfile) {
    this.info = info;
    if (info.look !== this.look || !sameApp(info.app, this.appRef)) this.setLook(info.look, info.app);
    this.setNameTag(info.name, `hsl(${hueOf(info.name)} 75% 84%)`);
  }
  applyTitle(id?: string) { const t = titleDef(id); this.setTitle(t ? { name: t.name, color: t.color } : undefined); }
  push(x: number, y: number, flags: number, t: number) {
    this.buf.push({ t, x, y, flags });
    if (this.buf.length > 8) this.buf.shift();
  }
  private applyFlags(flags: number, x: number, y: number) {
    const f = unpackFlags(flags);
    this.facing = f.facing; this.moving = f.moving;
    if (f.sit) this.setSitting(true, RemotePlayer.findSeat?.(x, y)); else this.setSitting(false);
    if (f.fish !== this.fishing) this.setFishing(f.fish);
    if (f.pax !== this.pax) this.setPassenger(f.pax); // 坐在队友车后座
    this.setRiding(f.ride); // 别人骑着共享单车：同样的两层车 + 上半身
    this.running = f.run && f.moving;
  }
  /** 每帧调用：把位置插值到"现在 - INTERP_MS"那一刻 */
  tick(now: number) {
    const rt = now - NET.INTERP_MS, b = this.buf;
    const last = b[b.length - 1];
    let a = b[0], c = b[0];
    if (rt >= last.t) { a = c = last; }
    else if (rt > b[0].t) for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && rt < b[i + 1].t) { a = b[i]; c = b[i + 1]; break; }
    const k = a === c ? 1 : (rt - a.t) / (c.t - a.t);
    this.x = a.x + (c.x - a.x) * k; this.y = a.y + (c.y - a.y) * k;
    this.applyFlags(c.flags, c.x, c.y);
    this.play();
    this.syncSprite();
  }
}
