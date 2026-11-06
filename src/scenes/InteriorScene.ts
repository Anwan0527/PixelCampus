import Phaser from 'phaser';
import { WorldMap } from '@/world/WorldMap';
import { Player, Character } from '@/entities/Player';
import { Npc } from '@/entities/Npc';
import { Hud } from '@/ui/Hud';
import { TILE, ZOOMS } from '@/core/const';
import { standNear } from '@/shared/teleport';
import type { TeleportPanel } from '@/ui/TeleportPanel';
import type { NetClient } from '@/net/client';
import type { DormPanel } from '@/ui/DormPanel';
import type { ChatPanel } from '@/ui/ChatPanel';
import type { Profile } from '@/shared/profile';
import { AC_NAMES, dormInteriorId, dormInteriorLevel, isDormInterior, roomTitle } from '@/shared/dorm';
import { ensureSkin, skinTextureKey } from '@/systems/dormskin';
import { RemotePlayer } from '@/entities/RemotePlayer';
import { BathFx } from '@/systems/bathfx';
import { DecorEditor } from '@/systems/decoredit';
import { spotOf } from '@/systems/decorview';
import { topRaise } from '@/shared/decor';
import { decorDef, defaultLay, footOf, seatsOf, type Placed } from '@/shared/decor';
import type { BathView } from '@/shared/dorm';
import { packFlags, type RoomWho, type ServerMsg } from '@/shared/protocol';

export interface InteriorDef {
  id: string; name: string; w: number; h: number; bg: string; desc?: string;
  labels?: { text: string; x: number; y: number; size?: number; color?: string }[];
  interacts?: { x0: number; x1: number; y0: number; y1: number; title: string; text: string; act?: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath' }[];
  collision: string[];
  objects: { k: string; x: number; y: number; depth: number }[];
  npcs: { look: number; x: number; y: number; name: string; facing?: 'down' | 'up' | 'left' | 'right'; lines: string[] }[];
  exit: { x: number; w: number }; spawn: { x: number; y: number };
}

/** 室内：整张背景图 + 家具精灵（可前后遮挡）+ 静态 NPC；走出南侧门洞回到校园。id = 'dorm' 时是「我的宿舍」：床/空调/衣柜/宝箱可以互动，公屏照常能看能说。 */
export class InteriorScene extends Phaser.Scene {
  private hud!: Hud;
  private def!: InteriorDef;
  private map!: WorldMap;
  private player!: Player;
  private npcs: Npc[] = [];
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift' | 'e' | 'space' | 'esc' | 'enter' | 'y', Phaser.Input.Keyboard.Key>;
  private leaving = false;
  // ---- 家具摆放（装修）：宿舍里除了床/衣柜/宝箱/浴缸，其余家具都来自摆放数据，客户端按它现画
  private lay: Placed[] = []; private layKey = ''; private decorObjs: Phaser.GameObjects.Image[] = []; private decorTalk: NonNullable<InteriorDef['interacts']> = [];
  private level = 0; private skinNow = { w: -1, f: -1 }; private skinImgs: Phaser.GameObjects.Image[] = []; private skinSeq = 0;
  private baseCollision: string[] = []; private editor?: DecorEditor; private decorBtn?: HTMLButtonElement; private likeBtn?: HTMLButtonElement; private prevLikes?: NetClient['handlers']['dormLikes'];
  private talking: Npc | null = null;
  // ---- 宿舍（id === 'dorm'）
  private dorm = false;
  private net?: NetClient; private dormUi?: DormPanel; private chat?: ChatPanel; private chatFocus: (() => void) | null = null;
  private selfId = 0; private seenProfile: Profile | undefined;
  private acMode = 0; private acVent = { x: 0, y: 0 }; private acLed?: Phaser.GameObjects.Rectangle; private acLabel?: Phaser.GameObjects.Text; private acTimer?: Phaser.Time.TimerEvent;
  private sleeping = false; private sleepPending = false;
  private sleeper?: Phaser.GameObjects.Sprite; private cover?: Phaser.GameObjects.Image; private dim?: Phaser.GameObjects.Rectangle; private zzTimer?: Phaser.Time.TimerEvent;
  private bed: { px: number; py: number; wx: number; wy: number; depth: number } | null = null;
  private prevFindSeat?: typeof RemotePlayer.findSeat; private hasAc = false; private seats: { x: number; y: number; bx: number; by: number }[] = []; private sitting = false;
  // ---- 做客：visit = 我是访客（房主不是我）；remotes = 屋里的其他人（房主或访客）
  private visit: Extract<ServerMsg, { t: 'dorm_visit' }> | null = null;
  private remotes = new Map<number, RemotePlayer>();
  private hostName = ''; private titleRaw = ''; private signText?: Phaser.GameObjects.Text; private signAt = { x: 0, y: 0 };
  private sleepWho?: Character; private rt = { t: 0, x: -1, y: -1, f: -1 };
  /** 我是不是房主（自己的宿舍） */
  private get isHost() { return !this.visit; }
  /** 手机：摇杆/互动键是校园场景创建的 DOM 控件（共用），这里读它的状态；互动键按下记在 registry 的 touchPress 里 */
  private touchState() { return (this.registry.get('touchUi') as (() => { state: { x: number; y: number; run: boolean } } | undefined) | undefined)?.()?.state; }
  private takeTouchPress() { const p = !!this.registry.get('touchPress'); if (p) this.registry.set('touchPress', false); return p; }
  constructor() { super('Interior'); }

  init(data: { id: string }) { this.registry.set('interiorId', data.id); this.leaving = false; this.layKey = ''; this.lay = []; this.decorObjs = []; this.decorTalk = []; this.skinNow = { w: -1, f: -1 }; this.skinImgs = []; this.skinSeq++; }

  create() {
    this.hud = this.registry.get('hud') as Hud;
    const id = this.registry.get('interiorId') as string;
    const defs = this.cache.json.get('interiors') as InteriorDef[];
    this.def = defs.find((d) => d.id === id)!;
    const d = this.def;
    this.map = new WorldMap({ width: d.w, height: d.h, collision: d.collision });
    this.baseCollision = d.collision.slice();
    this.cameras.main.setBackgroundColor('#17110d');
    if (!isDormInterior(d.id)) this.add.image(0, 0, d.bg).setOrigin(0).setDepth(-1); // 宿舍的底图是墙纸 + 地板两层，按玩家选的样式在 setupDorm 里加载
    for (const o of d.objects) this.add.image(o.x, o.y, 'furniture', o.k).setOrigin(0).setDepth(o.depth);
    for (const l of d.labels ?? []) this.add.text(l.x * TILE, l.y * TILE, l.text, { fontFamily: 'ArkPixel', fontSize: `${l.size ?? 10}px`, color: l.color ?? '#2a2a33' }).setOrigin(0.5).setDepth(9000); // 文字牌要压在家具上面（家具的层级 = 它的底边像素，比 5 大得多，之前文字被横幅/字画盖住了）
    this.npcs = d.npcs.map((n) => new Npc(this, n.x * TILE, n.y * TILE, n.look, n.name, n.lines, false, n.facing ?? 'down'));
    this.dorm = isDormInterior(d.id); this.level = dormInteriorLevel(d.id);
    this.visit = this.dorm ? ((this.registry.get('dormVisit') as Extract<ServerMsg, { t: 'dorm_visit' }> | null | undefined) ?? null) : null;
    const me = this.registry.get('profile') as Profile | undefined; this.seenProfile = me;
    this.player = new Player(this, d.spawn.x * TILE, d.spawn.y * TILE, this.dorm && me ? me.look : 0, this.dorm ? me?.app : undefined); // 宿舍里是你自己的样子（换装后也跟着变）
    Character.umbrella = false; // 屋里不打伞（外面下雨时，校园场景每帧会把它设回去，所以这里只管室内）
    this.player.facing = 'up'; this.player.sprite.setFrame('c0_up_0');

    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.roundPixels = true;
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT, e: K.E, space: K.SPACE, esc: K.ESC, enter: K.ENTER, y: K.Y }) as any;
    this.registry.set('touchPress', false); // 进门那一下的互动键别算在室内里
    cam.fadeIn(280, 20, 14, 10);
    this.hud.showMinimap(false);
    this.hud.banner(d.name, d.desc ?? '走到南侧门口即可离开');
    if (this.dorm) this.setupDorm();
  }

  // ------------------------------------------------------------ 宿舍
  private setupDorm() {
    this.net = this.registry.get('net') as NetClient | undefined;
    this.dormUi = this.registry.get('dormUi') as DormPanel | undefined;
    this.chat = this.registry.get('chat') as ChatPanel | undefined;
    this.selfId = this.net?.selfId ?? 0;
    if (this.net) this.net.handlers.dormOut = (msg) => { if (msg) this.hud.banner('🏠 宿舍', msg); this.leaveForced(); }; // 在屋里被传走（传送/房主离开…）：直接离开室内，人留在新位置
    if (this.chat) { this.chatFocus = this.chat.onFocus; this.chat.onFocus = () => { this.input.keyboard!.resetKeys(); this.chatFocus?.(); }; } // 公屏：宿舍里也能看、能说
    // 床、空调、鱼缸、门牌都是可以挪的家具：位置来自摆放数据，在 setLay 里绑定（rebindFixtures）
    { const sk = this.visit ? this.visit.sk : this.dormUi?.data?.sk; this.setSkin(sk?.w ?? 0, sk?.f ?? 0); }
    this.setLay(this.visit ? (this.visit.lay ?? defaultLay(this.level)) : (this.dormUi?.data?.lay ?? defaultLay(this.level))); // 房里的家具摆放：访客用房主的，自己用自己的（数据还没来就先用默认布局）
    this.hostName = this.visit?.hostName ?? ((this.registry.get('profile') as Profile | undefined)?.name ?? '');
    if (this.visit) { // 我是访客：屋里的状态来自房主（空调、门牌、房主睡没睡），屋里已有的人也要画出来
      this.setTitle(this.visit.title); this.setAc(this.visit.ac); this.setBath(this.visit.bv);
      for (const w of this.visit.roster) this.addRemote(w);
      if (this.visit.sleeping) this.showSleeper(this.hostChar());
      this.hud.banner(`🏠 ${roomTitle(this.visit.title, this.visit.hostName, false)}`, `${this.visit.hostName} 的宿舍 · 走到南侧门口即可离开`);
    }
    if (this.net) {
      const h = this.net.handlers;
      h.roomJoin = (w) => { this.addRemote(w); if (this.editor?.active) { this.editor.close(); this.hud.banner('🛋 装修', `${w.p.name} 进来了，装修先停一下`); } };
      h.roomLeave = (id) => this.removeRemote(id);
      h.roomPos = (id, x, y, f) => { if (id === this.selfId) { this.player.x = x; this.player.y = y; return; } this.remotes.get(id)?.push(x, y, f, performance.now()); }; // 发给自己的 = 被服务器拉回
      h.roomState = (m) => {
        this.setTitle(m.title); this.setAc(m.ac); this.setBath(m.bv); if (!this.isHost) this.setSkin(m.sk?.w ?? 0, m.sk?.f ?? 0);
        if (!this.isHost) { if (m.sleeping) this.showSleeper(this.hostChar()); else if (this.sleepWho && this.sleepWho !== this.player) this.hideSleeper(); } // 房主自己的睡觉由本地按钮流程驱动
      };
    }
    this.registry.set('roomSay', (pid: number, text: string) => { if (pid === this.selfId) this.player.say(text); else this.remotes.get(pid)?.say(text); }); // 公屏的话冒泡在人头上
    if (this.dormUi) {
      this.dormUi.onData = (m) => { if (this.isHost) { this.setAc(m.ac); this.setTitle(m.title ?? ''); this.setBath(m.bv); this.setSkin(m.sk?.w ?? 0, m.sk?.f ?? 0); if ((m.rm ?? 0) !== this.level) { this.expandTo(m.rm ?? 0); return; } this.setLay(m.lay ?? defaultLay(this.level)); this.editor?.refresh(); } };
      this.dormUi.onResult = (ok, msg, wake) => {
        this.hud.banner(ok ? '🏠 宿舍' : '⚠️ 宿舍', msg);
        if (this.sleepPending) { this.sleepPending = false; if (ok) this.beginSleep(); }
        if (wake && this.sleeping) this.endSleep(false);
      };
      if (this.isHost) { if (this.dormUi.data) { this.setAc(this.dormUi.data.ac); this.setTitle(this.dormUi.data.title ?? ''); this.setBath(this.dormUi.data.bv); } else this.net?.dormGet(); }
    }
    this.prevFindSeat = RemotePlayer.findSeat; RemotePlayer.findSeat = (x, y) => { const t = this.seats.find((q) => Math.hypot(q.x - x, q.y - y) < 6); return t ? { bx: t.bx, by: t.by, strip: false } : undefined; }; // 屋里别人坐在哪把椅子上
    if (this.isHost && this.net) this.setupDecorUi(this.net);
    if (this.visit && this.net) this.setupLikeUi(this.net, this.visit);
    this.events.once('shutdown', () => {
      this.registry.set('roomSay', null); this.registry.set('dormVisit', null);
      if (this.net) { const h = this.net.handlers; h.roomJoin = h.roomLeave = h.roomPos = h.roomState = undefined; }
      this.dormUi?.closeSign();
      for (const r of this.remotes.values()) r.destroy(); this.remotes.clear();
      if (this.chat && this.chatFocus) this.chat.onFocus = this.chatFocus;
      if (this.net) this.net.handlers.dormOut = undefined;
      if (this.dormUi) { this.dormUi.onData = () => {}; this.dormUi.onResult = () => {}; this.dormUi.close(); this.dormUi.closeChest(); }
      this.acTimer?.remove(); this.zzTimer?.remove();
      RemotePlayer.findSeat = this.prevFindSeat; this.sitting = false;
      this.editor?.destroy(); this.editor = undefined; this.decorBtn?.remove(); this.decorBtn = undefined; this.likeBtn?.remove(); this.likeBtn = undefined;
      if (this.net) this.net.handlers.dormLikes = this.prevLikes;
    });
  }

  /** 空调：0 关 / 1 制冷 / 2 制热。状态灯换色，出风口持续飘出冷风（蓝白风丝+雪点）或暖风（橙色热气） */
  private bathFx?: BathFx; private bathView?: BathView;
  private setBath(v: BathView | undefined) { this.bathView = v; this.bathFx?.set(v); }
  private setAc(mode: number) {
    if (mode === this.acMode && (this.acTimer || !mode)) return;
    this.acMode = mode;
    this.acTimer?.remove(); this.acTimer = undefined;
    if (!this.hasAc) return; // 空调现在不在墙上（被收回了）：只记着状态
    this.acLed?.setFillStyle(mode === 1 ? 0x58d0ff : mode === 2 ? 0xff8a3a : 0x3f9a58);
    this.acLabel?.destroy(); this.acLabel = undefined;
    if (!mode) return;
    const cool = mode === 1;
    this.acLabel = this.add.text(this.acVent.x, this.acVent.y + 5, cool ? '制冷 24℃' : '制热 28℃', { fontFamily: 'ArkPixel', fontSize: '10px', color: cool ? '#bfeaff' : '#ffd9a0', stroke: '#1a2438', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(9002);
    this.acTimer = this.time.addEvent({ delay: mode === 1 ? 120 : 160, loop: true, callback: () => this.blow() });
  }
  private blow() {
    const { x, y } = this.acVent, cool = this.acMode === 1, r = Phaser.Math.Between;
    const px = x + r(-14, 14);
    if (cool) {
      const streak = this.add.rectangle(px, y + 2, 2, r(9, 15), r(0, 2) ? 0xbfe8ff : 0xffffff, 0.9).setDepth(9000);
      this.tweens.add({ targets: streak, y: y + r(26, 48), x: px + r(-5, 5), alpha: 0, duration: r(900, 1500), onComplete: () => streak.destroy() });
      if (r(0, 2) === 0) { // 时不时一点雪花
        const flake = this.add.rectangle(px, y + 4, 3, 3, 0xffffff, 1).setDepth(9000);
        this.tweens.add({ targets: flake, y: y + r(34, 56), x: px + r(-12, 12), alpha: 0, angle: 90, duration: r(1400, 2000), onComplete: () => flake.destroy() });
      }
    } else {
      const wave = this.add.rectangle(px, y + 3, r(8, 14), 3, r(0, 1) ? 0xff9a3a : 0xffd27a, 0.8).setDepth(9000);
      this.tweens.add({ targets: wave, y: y + r(24, 42), alpha: 0, scaleX: 1.6, duration: r(1000, 1600), onComplete: () => wave.destroy() });
      this.tweens.add({ targets: wave, x: { from: px - 3, to: px + 3 }, duration: 300, yoyo: true, repeat: 4, ease: 'Sine.easeInOut' });
    }
  }

  // ---- 睡觉的画面：躺着的人只露出脑袋和肩膀在枕头上，盖上被子，头顶飘 💤，屋里暗下来。房主自己睡、或访客看房主睡，都画这一套
  private hostChar(): Character | undefined { for (const r of this.remotes.values()) if (r.uid === this.visit?.host) return r; return undefined; }
  private showSleeper(who: Character | undefined) {
    if (!who || this.sleepWho) return;
    this.sleepWho = who;
    const sp = who.sprite;
    who.facing = 'down';
    const tex = sp.texture.key, fr = sp.frame.name.replace(/_(up|left|right)_/, '_down_');
    const bed = this.bed; if (!bed) return;
    const pcx = bed.px + 17, pcy = bed.py + 17.5; // 枕头中心
    this.sleeper = this.add.sprite(pcx, pcy - 12 + 42, tex, fr).setOrigin(sp.originX, sp.originY).setCrop(0, 0, sp.frame.width, 26).setDepth(bed.depth + 0.5);
    this.cover = this.add.image(bed.px, bed.py, 'furniture', 'dbed_cover').setOrigin(0).setDepth(bed.depth + 1);
    sp.setVisible(false); who.tagsHidden = true;
    this.dim = this.add.rectangle(-1500, -1500, 4000, 4000, 0x0a1033, 0).setOrigin(0).setDepth(8999);
    this.tweens.add({ targets: this.dim, fillAlpha: 0.38, duration: 900 });
    this.zzTimer = this.time.addEvent({ delay: 1100, loop: true, callback: () => this.zz(pcx, pcy) });
    this.zz(pcx, pcy);
  }
  private hideSleeper() {
    const who = this.sleepWho; if (!who) return;
    this.sleepWho = undefined;
    this.zzTimer?.remove(); this.zzTimer = undefined;
    this.sleeper?.destroy(); this.sleeper = undefined; this.cover?.destroy(); this.cover = undefined;
    const dim = this.dim; this.dim = undefined; if (dim) this.tweens.add({ targets: dim, fillAlpha: 0, duration: 500, onComplete: () => dim.destroy() });
    who.sprite.setVisible(true); who.tagsHidden = false;
  }
  /** 房主上床 */
  private beginSleep() {
    if (this.sleeping) return;
    this.standUp();
    this.sleeping = true; this.hud.hint(null);
    this.player.facing = 'down'; this.player.update(0.016, 0, 0, false, this.map);
    this.showSleeper(this.player);
    this.hud.hint('任意方向键 / 点一下  起床');
  }
  private zz(cx: number, cy: number) {
    const t = this.add.text(cx + 14, cy - 12, '💤', { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",ArkPixel,sans-serif', fontSize: '16px' }).setOrigin(0.5).setDepth(9001).setAlpha(0);
    this.tweens.add({ targets: t, y: cy - 46, x: cx + 24, alpha: { from: 0, to: 1 }, scale: { from: 0.8, to: 1.35 }, duration: 1900, ease: 'Sine.easeOut', yoyo: false, onComplete: () => t.destroy() });
    this.tweens.add({ targets: t, alpha: 0, delay: 1300, duration: 600 });
  }
  /** 房主起床：人站到床尾外面；tell = 要不要告诉服务器（服务器让你起床时不用再说） */
  private endSleep(tell = true) {
    if (!this.sleeping) return;
    this.sleeping = false;
    if (tell) this.net?.dormSleep(false);
    this.hideSleeper();
    const bw = this.bed ?? { wx: this.player.x, wy: this.player.y };
    const spot = standNear((px, py) => this.map.boxBlocked(px, py), bw.wx, bw.wy, 64) ?? { x: bw.wx, y: bw.wy }; // 起床站的位置要真能站（之前落在墙/垃圾桶里，人动不了）
    this.player.x = spot.x; this.player.y = spot.y; this.player.facing = 'down';
    this.player.sprite.setVisible(true); this.player.update(0.016, 0, 0, false, this.map);
    this.hud.hint(null);
  }

  // ---- 屋里的其他人（房主或访客）
  private addRemote(w: RoomWho) {
    if (w.id === this.selfId || this.remotes.has(w.id)) return;
    const r = new RemotePlayer(this, w.id, w.uid, w.p, w.x, w.y, w.flags);
    r.applyTitle(w.ttl); if (w.held) r.setHeld(w.held); if (w.fz) r.setFz(w.fz);
    this.remotes.set(w.id, r);
    this.rt.f = -1; // 新来的人要马上知道我在哪
    if (w.uid === this.visit?.host && this.visit.sleeping) this.showSleeper(r);
  }
  private removeRemote(id: number) {
    const r = this.remotes.get(id); if (!r) return;
    if (this.sleepWho === r) this.hideSleeper();
    r.destroy(); this.remotes.delete(id);
  }
  /** 屋里有别人时，每 ~100 毫秒把自己的位置报给服务器（没变就不报；一个人在屋里时一条都不发） */
  private reportPos(now: number) {
    if (!this.net || !this.remotes.size || this.net.status !== 'online' || now - this.rt.t < 100) return;
    const x = Math.round(this.player.x * 4) / 4, y = Math.round(this.player.y * 4) / 4, f = packFlags(this.player.facing, this.player.moving, this.player.running, false, this.sitting);
    if (x === this.rt.x && y === this.rt.y && f === this.rt.f) return;
    this.rt = { t: now, x, y, f }; this.net.roomMove(x, y, f);
  }
  /** 门牌：房主起的名字（没起过：自己看到「我的宿舍」，访客看到「xx的宿舍」）；字太长就缩到牌子里放得下 */
  private setTitle(raw: string) {
    this.titleRaw = raw;
    if (!this.signText) return;
    this.signText.setScale(1).setText(roomTitle(raw, this.hostName, this.isHost));
    const maxW = 68; if (this.signText.width > maxW) this.signText.setScale(maxW / this.signText.width);
  }

  private dormAct(act: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath') {
    if (!this.net || this.net.status !== 'online') { this.hud.banner('⚠️ 宿舍', '没连上服务器，这里的东西暂时用不了'); return; }
    const who = this.hostName || '房主';
    if (act === 'ac') this.net.dormAc();
    else if (act === 'sign') { if (this.isHost) this.dormUi?.openSign(this.titleRaw); else this.hud.openDialog('门牌', [`「${roomTitle(this.titleRaw, this.hostName, false)}」——${who}的宿舍`]); }
    else if (act === 'bed') { if (!this.isHost) this.hud.openDialog('单人床', [`这是 ${who} 的床。`]); else if (!this.sleepPending) { this.sleepPending = true; this.net.dormSleep(true); } }
    else if (act === 'bath') {
      if (this.isHost) this.dormUi?.openBath();
      else { const v = this.bathView, n = v ? v.r.reduce((a, b) => a + b, 0) : 0; this.hud.openDialog('鱼缸', [v && v.f.length ? `${who} 的鱼缸里养着 ${v.f.length > 1 ? '好几种' : ''}鱼${n ? `，其中有 ${n} 条会发光的稀有鱼` : ''}，水面闪闪的。` : `${who} 的鱼缸是空的，水很清。`]); }
    }
    else if (act === 'chest') { if (this.isHost) this.dormUi?.openChest(); else this.hud.openDialog('宝箱', [`${who} 的宝箱，只有主人能打开。`]); }
    else { const edit = this.registry.get('editProfile') as (() => void) | undefined; this.input.keyboard!.resetKeys(); edit?.(); }
  }

  /** 墙纸 + 地板：两层透明图叠在一起（没加载过的先下载）；换样式时旧的换成新的 */
  private setSkin(w: number, f: number) {
    if (w === this.skinNow.w && f === this.skinNow.f) return;
    this.skinNow = { w, f }; const seq = ++this.skinSeq, lv = this.level;
    void ensureSkin(this.textures, lv, w, f).then((ok) => {
      if (seq !== this.skinSeq || !this.scene.isActive()) return;
      for (const i of this.skinImgs) i.destroy(); this.skinImgs = [];
      if (ok) this.skinImgs = [this.add.image(0, 0, skinTextureKey(lv, 'f', f)).setOrigin(0).setDepth(-1), this.add.image(0, 0, skinTextureKey(lv, 'w', w)).setOrigin(0).setDepth(-0.9)];
    });
  }
  /** 房间扩建了：换成对应大小的房间（重新进屋，人站在新房间的门口） */
  private expandTo(level: number) {
    if (this.leaving) return; this.leaving = true;
    this.editor?.close(); this.hud.banner('🏠 宿舍', '房间扩建好了！');
    this.time.delayedCall(60, () => this.scene.start('Interior', { id: dormInteriorId(level) }));
  }

  /** 装修：右上角的「装修」按钮 + 装修模式（只有房主）。屋里有访客、正在睡觉时不能装修 */
  private setupDecorUi(net: NetClient) {
    this.editor = new DecorEditor(this, net, { lay: () => this.lay, level: () => this.level, data: () => this.dormUi?.data ?? null, banner: (t, x) => this.hud.banner(t, x), onToggle: (on) => { this.decorBtn?.classList.toggle('hidden', on); if (on) this.hud.hint(null); }, reserve: (px) => { if (px !== this.reserve) { this.reserve = px; this.applyZoom(); } } });
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn decor-open'; b.textContent = '🛋 装修'; b.title = '摆放家具、挪动、收回';
    b.addEventListener('click', () => {
      if (net.status !== 'online') { this.hud.banner('⚠️ 装修', '没连上服务器，现在不能装修'); return; }
      if (this.remotes.size) { this.hud.banner('🛋 装修', '屋里有访客，装修会挤到人：等好友出去再装修'); return; }
      if (this.sleeping || this.hud.dialogOpen || this.dormUi?.anyOpen) return;
      this.editor?.open();
    });
    (document.getElementById('hud') ?? document.body).append(b); this.decorBtn = b;
  }

  /** 做客时：左边一个「赞」按钮，给这间宿舍点赞 / 取消（规则在服务器：累计在线满 10 分钟、每天 20 次） */
  private setupLikeUi(net: NetClient, v: Extract<ServerMsg, { t: 'dorm_visit' }>) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn decor-open dorm-like';
    let n = v.likes ?? 0, liked = !!v.liked;
    const paint = () => { b.textContent = `${liked ? '❤️ 已赞' : '🤍 赞'} ${n}`; b.classList.toggle('on', liked); };
    paint(); b.title = `给 ${v.hostName} 的宿舍点个赞（再点一下取消）`;
    b.addEventListener('click', () => { if (net.status !== 'online') { this.hud.banner('⚠️ 宿舍', '没连上服务器'); return; } net.dormLike(v.host); });
    (document.getElementById('hud') ?? document.body).append(b); this.likeBtn = b;
    this.prevLikes = net.handlers.dormLikes;
    net.handlers.dormLikes = (uid, nn, ll, msg) => { this.prevLikes?.(uid, nn, ll, msg); if (uid !== v.host) return; n = nn; liked = ll; paint(); if (msg) this.hud.banner('🏠 宿舍', msg); };
  }

  /** 坐在椅子 / 沙发上（坐姿只有一个朝向；别人也看得到，位置和坐姿随位置上报一起发） */
  private sitDown(seat: { x: number; y: number; bx: number; by: number }) {
    if (this.sleeping) return;
    this.player.x = seat.x; this.player.y = seat.y; this.player.halt();
    this.player.setSitting(true, { bx: seat.bx, by: seat.by, strip: false }); this.sitting = true; this.rt.f = -1; this.hud.hint(null);
  }
  private standUp() {
    if (!this.sitting) return;
    this.player.setSitting(false); this.sitting = false; this.rt.f = -1;
    const spot = standNear((px, py) => this.map.boxBlocked(px, py), this.player.x, this.player.y, 48); if (spot) { this.player.x = spot.x; this.player.y = spot.y; }
  }

  /** 床、空调、鱼缸、门牌是可以挪的家具：它们摆在哪儿，睡觉的位置、空调的风、缸里的鱼、门牌上的字就跟到哪儿（家具不在房里 = 对应功能暂时没有） */
  private rebindFixtures(lay: Placed[]) {
    this.acLed?.destroy(); this.acLed = undefined; this.hasAc = false; this.bathFx?.destroy(); this.bathFx = undefined; this.signText?.destroy(); this.signText = undefined; this.bed = null;
    for (const p of lay) {
      const def = decorDef(p.d); if (!def?.act) continue;
      const sp = spotOf(this.textures, lay, p); if (!sp) continue;
      if (def.act === 'ac') { this.hasAc = true; this.acVent = { x: sp.x + 18, y: sp.y + 13 }; this.acLed = this.add.rectangle(sp.x + 28.5, sp.y + 5, 5, 2, 0x3f9a58).setDepth(sp.depth + 1); }
      else if (def.act === 'bed') this.bed = { px: sp.x, py: sp.y, wx: sp.x + 17, wy: sp.y + 71, depth: sp.depth }; // wx/wy = 起床后站的位置（床尾外面，再用 standNear 找个真能站的）
      else if (def.act === 'bath') { this.bathFx = new BathFx(this, sp.x, sp.y, sp.depth); this.bathFx.set(this.bathView); }
      else if (def.act === 'sign') { this.signAt = { x: sp.x + 41, y: sp.y + 11 }; this.signText = this.add.text(this.signAt.x, this.signAt.y, '', { fontFamily: 'ArkPixel', fontSize: '10px', color: '#4a2e14' }).setOrigin(0.5).setDepth(9000); this.setTitle(this.titleRaw); }
    }
    const m = this.acMode; this.acMode = -1; this.acTimer?.remove(); this.acTimer = undefined; this.setAc(m); // 空调挪了地方：风从新位置吹出来
  }

  /** 按摆放数据画房里的家具（地毯、桌椅、柜子、小件、墙饰），并更新碰撞：占地的地面家具挡路，地毯、小件、墙饰不挡 */
  private setLay(lay: Placed[]) {
    const key = JSON.stringify(lay); if (key === this.layKey) return; this.layKey = key; this.lay = lay;
    this.standUp(); // 家具挪动 / 重画了：坐着的人先站起来
    for (const o of this.decorObjs) o.destroy(); this.decorObjs = []; this.decorTalk = [];
    const rows = this.baseCollision.map((r) => r.split(''));
    for (const p of lay) {
      const def = decorDef(p.d), spot = spotOf(this.textures, lay, p); if (!def || !spot) continue;
      this.decorObjs.push(this.add.image(spot.x, spot.y, 'furniture', spot.frame).setOrigin(0).setDepth(spot.depth));
      if (def.act && def.kind === 'wall') this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + def.fw) * 16 + 8, y0: 0, y1: Math.max((p.y + 3) * 16, 80), title: def.name, text: '', act: def.act }); // 墙上的空调、门牌：走到它下面按 E
      if (def.kind === 'top' && def.say) { const raise = topRaise(lay, p); this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + 1) * 16 + 8, y0: p.y * 16 - 8 - raise, y1: (p.y + 1) * 16 + 16, title: def.name, text: def.say }); }
      if (def.kind !== 'floor') continue;
      const { fw, fh } = footOf(def, p.r);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (rows[p.y + j]?.[p.x + i] !== undefined) rows[p.y + j][p.x + i] = '1';
      if (def.say || def.act) this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + fw) * 16 + 8, y0: p.y * 16 - 8, y1: (p.y + fh) * 16 + 16, title: def.name, text: def.say ?? '', ...(def.act ? { act: def.act } : {}) });
    }
    this.rebindFixtures(lay);
    this.seats = lay.flatMap((p) => seatsOf(p));
    this.map = new WorldMap({ width: this.def.w, height: this.def.h, collision: rows.map((r) => r.join('')) });
    if (this.player && this.map.boxBlocked(this.player.x, this.player.y)) { const s = standNear((px, py) => this.map.boxBlocked(px, py), this.player.x, this.player.y, 64); if (s) { this.player.x = s.x; this.player.y = s.y; } } // 家具摆到了人脚下：把人挪到旁边
  }

  /** 装修托盘占了屏幕底部多少像素：房间缩放到上面剩下的空间里（装修时允许缩到 1 倍） */
  private reserve = 0;
  private applyZoom() {
    // 让整间屋子尽量完整可见，但不低于 2 倍（装修时为托盘让位，可以低到 1 倍）
    const availH = Math.max(120, this.scale.height - this.reserve);
    const fit = Math.min(this.scale.width / (this.def.w * TILE + 32), availH / (this.def.h * TILE + 48));
    let z = 2; if (this.reserve) z = Math.max(1, Math.min(5, Math.floor(fit * 2) / 2)); else for (const c of ZOOMS) if (c <= fit) z = c; // 装修时允许半倍缩放（手机竖屏房间放大一点）
    const cam = this.cameras.main; cam.setSize(this.scale.width, availH); cam.setZoom(this.reserve ? z : Math.max(2, z)); // 窗口大小变化时，Phaser 自己的相机尺寸更新可能比这里慢一拍，所以直接按画布尺寸来
    // 房间比屏幕小时，把相机范围撑到屏幕那么大并让房间居中——否则 Phaser 会把房间贴在屏幕左上角，剩下一大片黑（"室内黑屏"的真正原因）
    const vw = this.scale.width / cam.zoom, vh = availH / cam.zoom, rw = this.def.w * TILE, rh = this.def.h * TILE, ex = Math.max(0, vw - rw), ey = Math.max(0, vh - rh);
    cam.setBounds(-ex / 2, -ey / 2, rw + ex, rh + ey);
  }

  override update(_t: number, delta: number) {
    this.bathFx?.update(Math.min(0.1, delta / 1000));
    const dt = Math.min(delta, 50) / 1000, k = this.keys, joy = this.touchState(), tap = this.takeTouchPress();
    if (this.dorm && this.dormFrame(dt, k, joy, tap)) return;
    if (this.hud.dialogOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.esc)) { this.hud.closeDialog(); this.talking = null; }
      else if (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || tap) { if (!this.hud.advanceDialog()) this.talking = null; }
      this.player.update(dt, 0, 0, false, this.map);
      return;
    }
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0); // 键盘优先，没按键时用手机摇杆（之前室内只读键盘，手机进了 214 室就动不了）
    if (this.sitting && (ix || iy)) this.standUp(); // 坐着时一推方向就起身
    if (!this.leaving) this.player.update(dt, ix, iy, k.shift.isDown || (joy?.run ?? false), this.map);

    const press = Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || tap;
    // 最近的 NPC
    let near: Npc | null = null, nd = 30;
    for (const n of this.npcs) { const dd = Math.hypot(n.x - this.player.x, n.y - this.player.y); if (dd < nd) { nd = dd; near = n; } }
    // 横幅等可互动的家具：站在好几个互动区重叠的地方时，选中心最近的那个
    let spot: NonNullable<InteriorDef['interacts']>[number] | null = null, sd = Infinity;
    if (!near) for (const a of [...(this.def.interacts ?? []), ...this.decorTalk]) {
      if (this.player.x < a.x0 || this.player.x > a.x1 || this.player.y < a.y0 || this.player.y > a.y1) continue;
      const dd = Math.hypot((a.x0 + a.x1) / 2 - this.player.x, (a.y0 + a.y1) / 2 - this.player.y);
      if (dd < sd) { sd = dd; spot = a; }
    }
    const tip = (a: NonNullable<InteriorDef['interacts']>[number]) => a.act === 'sign' ? (this.isHost ? 'E  给宿舍起个名字（改门牌）' : 'E  看门牌') : a.act === 'bed' ? (this.isHost ? 'E  上床睡觉（精灵会慢慢恢复）' : `E  ${this.hostName} 的床`) : a.act === 'ac' ? `E  空调：现在${AC_NAMES[this.acMode as 0 | 1 | 2]}，点一下切换` : a.act === 'wardrobe' ? 'E  打开衣柜（换装）' : a.act === 'bath' ? (this.isHost ? 'E  鱼缸：放鱼进去养着（放进去的鱼不能卖）' : 'E  看看鱼缸里的鱼') : a.act === 'chest' ? (this.isHost ? 'E  打开宝箱（仓库）' : 'E  宝箱（只有主人能开）') : `E  查看：${a.title}`;
    // 椅子：靠近按 E 坐下；坐着时按 E 起身
    let seat: (typeof this.seats)[number] | null = null;
    if (this.dorm && !near && !spot && !this.sitting) { let sd2 = 26; for (const q of this.seats) { const dd = Math.hypot(q.bx - this.player.x, q.by - this.player.y); if (dd < sd2) { sd2 = dd; seat = q; } } }
    this.hud.hint(this.sitting ? 'E / 方向键  起身' : near ? `E  和「${near.name}」交谈` : spot ? tip(spot) : seat ? 'E  坐下' : null);
    if (this.sitting && press) this.standUp(); else if (seat && press) this.sitDown(seat);
    if (spot && press) { if (spot.act) this.dormAct(spot.act); else this.hud.openDialog(spot.title, [spot.text]); }
    if (near && press) {
      this.talking = near;
      // 让 NPC 面向玩家
      const dx = this.player.x - near.x, dy = this.player.y - near.y;
      near.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      near.sprite.setFrame(`c${near.look}_${near.facing}_0`);
      this.hud.openDialog(near.name, near.lines);
    }
    // 走出南侧门洞
    if (!this.leaving && this.player.y > (this.def.h - 1) * TILE + 6) this.leave();
  }

  /**
   * 宿舍每帧的额外处理，返回 true = 这一帧到此为止：
   * 身份换了（断线重连）→ 重新告诉服务器我在屋里；换装后刷新外观；睡着时任何操作都是起床；面板/编辑器开着时不能走动；Enter 打开公屏输入。
   */
  private dormFrame(dt: number, k: InteriorScene['keys'], joy: { x: number; y: number; run: boolean } | undefined, tap: boolean): boolean {
    const net = this.net;
    if (net && this.selfId !== net.selfId) { // 连接断过又重连了：服务器上"在宿舍里"的标记没了——房主补发进屋、访客直接出来；睡觉的会话也没了，起床
      this.selfId = net.selfId;
      if (net.status === 'online') { if (!this.isHost) { this.leaveForced(); return true; } net.dormEnter(); if (this.sleeping) this.endSleep(false); }
    }
    { const now = performance.now(); for (const r of this.remotes.values()) r.tick(now); this.reportPos(now); }
    const me = this.registry.get('profile') as Profile | undefined;
    if (me && me !== this.seenProfile) { this.seenProfile = me; this.player.setLook(me.look, me.app); }
    if (Phaser.Input.Keyboard.JustDown(k.enter) && !this.hud.dialogOpen && !this.registry.get('editorOpen')) this.chat?.focus();
    const tp = this.registry.get('tpUi') as TeleportPanel | undefined;
    if (Phaser.Input.Keyboard.JustDown(k.y) && !this.chat?.typing && !this.registry.get('editorOpen') && !this.dormUi?.anyOpen) tp?.toggle(); // Y：在宿舍里也能打开传送
    const typing = !!this.chat?.typing, busy = !!tp?.isOpen || !!this.dormUi?.anyOpen || !!this.registry.get('editorOpen') || typing || !!this.editor?.active;
    if (this.sleeping) {
      const move = !busy && (k.up.isDown || k.down.isDown || k.left.isDown || k.right.isDown || k.w.isDown || k.a.isDown || k.s.isDown || k.d.isDown || Math.abs(joy?.x ?? 0) + Math.abs(joy?.y ?? 0) > 0.3);
      if (move || (tap && !busy)) this.endSleep();
      return true;
    }
    if (busy && !this.hud.dialogOpen) { this.player.update(dt, 0, 0, false, this.map); this.hud.hint(null); return true; }
    return false;
  }

  /** 服务器把我从宿舍里带走了：不用再告诉服务器，也别把人放回宿舍楼门口，直接回校园 */
  private leaveForced() {
    if (this.leaving) return;
    this.leaving = true; this.registry.set('dormForced', true);
    this.endSleep(false); this.hud.hint(null);
    this.editor?.close(); this.dormUi?.close(); this.dormUi?.closeChest(); (this.registry.get('tpUi') as TeleportPanel | undefined)?.close();
    this.cameras.main.fadeOut(240, 20, 14, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.hud.showMinimap(true); this.scene.stop('Interior'); this.scene.wake('World'); });
  }

  private leave() {
    this.leaving = true;
    this.hud.hint(null);
    if (this.dorm) { this.endSleep(); this.net?.dormLeave(); }
    this.cameras.main.fadeOut(240, 20, 14, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.hud.showMinimap(true);
      this.scene.stop('Interior');
      this.scene.wake('World');
    });
  }
}
