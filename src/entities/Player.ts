import Phaser from 'phaser';
import { WALK_SPEED, RUN_MULT, BIKE_SPEED, BIKE_ACCEL, BIKE_BRAKE } from '@/core/const';
import type { WorldMap } from '@/world/WorldMap';
import type { EmoteDef } from '@/shared/emotes';
import { DIRS } from '@/shared/fishing';
import { IDX, type Appearance } from '@/shared/appearance';
import type { SkinManager } from '@/art/skins';
import { heldDef } from '@/shared/held';
import { UMB } from '@/systems/weather';

export type Facing = 'down' | 'up' | 'left' | 'right';

/** 骑手摆位等参数，来自 tools/art/bikes.ts 生成的 bikes-meta.json（BootScene 放进缓存 'bikesMeta'） */
interface BikeMeta { ax: number; ay: number; rider: { crop: number; dy: number; dx: Record<Facing, number> } }

/** 可被玩家或其他实体复用的"角色"：脚点坐标 + 四向行走动画；可以骑共享单车。 */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: Facing = 'down';
  moving = false;
  /** 奔跑（Shift / 手机推到边缘）：播放跑步动画；别人的由同步的 run 标志决定 */
  running = false;
  /** 动画播放速度倍率（行人走得慢，动画也跟着放慢） */
  protected animScale = 1;
  /** 表情动作的姿势动画（挥手/欢呼/跳舞…）：播放到 poseUntil，走动或骑车时自动取消 */
  private poseAnim?: string; private poseUntil = 0;
  /** 正在骑共享单车：人物只留上半身，叠上两层自行车精灵 */
  riding = false;
  /** 坐在队友单车的后座：只露出上半身，画在车主身后（位置由服务器让他跟着车主走） */
  pax = false;
  /** 坐在长椅上：人物抬到椅面上，椅面前沿再盖在腿上；位置（x,y）仍是椅子南面那个合法位置 */
  sitting = false;
  /** 拍照模式用：隐藏所有昵称/称号/气泡 */
  static hideTags = false;
  /** 这个人自己的昵称牌/称号/气泡先藏起来（宿舍里：躺在床上的人，画面上人在床上，不该有个名字浮在地板上） */
  tagsHidden = false;
  /** 下雨：所有人（包括同学和路人）都撑起雨伞，由场景每帧按天气设置 */
  static umbrella = false;
  private umb?: Phaser.GameObjects.Image;
  /** 钓鱼：鱼竿 + 鱼线 + 浮漂（别人钓鱼时没有精确目标，朝面前 46 像素处画） */
  fishing = false;
  private fishG?: Phaser.GameObjects.Graphics;
  private fishT?: { x: number; y: number };
  private fishBite = false;
  private fishMark?: Phaser.GameObjects.Text;
  private seatAt?: { bx: number; by: number };
  private seatStrip?: Phaser.GameObjects.Image;
  /** 表情动作带来的位置偏移（抖动/跳跃）、头顶图标、跳舞截止时间 */
  private fx = { dx: 0, dy: 0 };
  private emo = { rise: 0 };
  private emoteTxt?: Phaser.GameObjects.Text;
  private danceUntil = 0;
  private tag?: Phaser.GameObjects.Text;
  private titleTag?: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleUntil = 0;
  private bikeBack?: Phaser.GameObjects.Sprite;
  private bikeFront?: Phaser.GameObjects.Sprite;
  private wheel = 0; private bikeT = 0; private lx = 0; private ly = 0; private dustT = 0;
  /** 外观：skin = 帧名前缀（预置造型是 c{look}，自定义外观是 a{哈希}）；texKey = 所在纹理；app = 自定义外观（没有就是预置） */
  protected skin: string; private texKey = 'chars'; appRef?: Appearance;
  private skinHandle?: { release: () => void }; private skinToken = 0;
  constructor(scene: Phaser.Scene, public x: number, public y: number, public look: number, app?: Appearance) {
    this.skin = `c${look}`;
    this.sprite = scene.add.sprite(x, y, 'chars', `c${look}_down_0`);
    const m = scene.cache.json.get('charsMeta') as { w: number; h: number; ax: number; ay: number };
    this.sprite.setOrigin(m.ax / m.w, (m.ay + 1) / m.h);
    this.lx = x; this.ly = y;
    if (app) this.setLook(look, app);
    this.syncSprite();
  }
  private get skins() { return this.sprite.scene.registry.get('skins') as SkinManager | undefined; }
  private get bikeMeta() { return this.sprite.scene.cache.json.get('bikesMeta') as BikeMeta; }

  /** 坐上/离开队友单车的后座 */
  setPassenger(on: boolean) {
    if (on === this.pax) return;
    this.pax = on;
    if (on) {
      if (this.riding) this.setRiding(false);
      this.sprite.setCrop(0, 0, this.sprite.frame.width, this.bikeMeta.rider.crop);
    } else this.sprite.setCrop();
    this.moving = false; this.play(); this.syncSprite();
  }

  /** 上/下车 */
  setRiding(on: boolean) {
    if (on === this.riding) return;
    this.riding = on;
    const sc = this.sprite.scene;
    if (on) {
      const fr = sc.textures.getFrame('bikes', 'bike_right_0'), m = this.bikeMeta;
      const mk = (frame: string) => sc.add.sprite(this.x, this.y, 'bikes', frame).setOrigin(m.ax / fr.width, m.ay / fr.height);
      this.bikeBack = mk('bike_down_0'); this.bikeFront = mk('bikef_down_0');
      this.sprite.setCrop(0, 0, this.sprite.frame.width, m.rider.crop); // 只露出上半身，腿被车架挡住
      this.wheel = 0; this.lx = this.x; this.ly = this.y; this.bikeT = sc.time.now;
    } else {
      this.bikeBack?.destroy(); this.bikeFront?.destroy(); this.bikeBack = this.bikeFront = undefined;
      this.sprite.setCrop();
    }
    this.moving = false;
    this.play();
    this.syncSprite();
  }

  /** 坐下/起身；bench = 长椅锚点（没有就只是原地坐着，不画椅面遮挡） */
  setSitting(on: boolean, bench?: { bx: number; by: number }) {
    if (on === this.sitting && (!on || (this.seatAt?.bx === bench?.bx && this.seatAt?.by === bench?.by))) return;
    this.sitting = on;
    this.seatStrip?.destroy(); this.seatStrip = undefined; this.seatAt = undefined;
    const sc = this.sprite.scene;
    if (on) {
      if (this.riding) this.setRiding(false);
      this.facing = 'down'; this.moving = false;
      this.seatAt = bench;
      if (bench) { // 椅面前沿（含椅腿）单独再画一层盖在人物上：人坐在靠背前、腿被椅面挡住
        const fr = sc.textures.getFrame('props', 'bench');
        this.seatStrip = sc.add.image(bench.bx, bench.by, 'props', 'bench').setOrigin(13 / fr.width, 15 / fr.height).setCrop(0, 4, fr.width, fr.height - 4);
      }
    }
    this.play(); this.syncSprite();
  }

  /** 开始/结束钓鱼；target = 浮漂落点；bite = 鱼咬钩了（浮漂下沉、头顶冒惊叹号） */
  setFishing(on: boolean, target?: { x: number; y: number }, bite = false) {
    this.fishing = on; this.fishT = target; this.fishBite = on && bite;
    const sc = this.sprite.scene;
    if (!on) { this.fishG?.destroy(); this.fishG = undefined; this.fishMark?.destroy(); this.fishMark = undefined; this.play(); return; }
    if (!this.fishG) this.fishG = sc.add.graphics();
    if (this.fishBite && !this.fishMark) this.fishMark = sc.add.text(0, 0, '!', { fontFamily: 'ArkPixel', fontSize: '20px', color: '#ff4a3a', stroke: '#fff6d8', strokeThickness: 4 }).setOrigin(0.5, 1);
    if (!this.fishBite) { this.fishMark?.destroy(); this.fishMark = undefined; }
    this.play(); this.syncSprite();
  }
  private drawFishing(cx: number, cy: number) {
    const g = this.fishG; if (!g) return;
    const [dx, dy] = DIRS[this.facing], now = this.sprite.scene.time.now;
    const hx = cx + dx * 5, hy = cy - 14, tipx = cx + dx * 20, tipy = cy - (dy < 0 ? 30 : 24) + dy * 6;
    const tx = this.fishT?.x ?? cx + dx * 46, ty = this.fishT?.y ?? cy - 8 + dy * 46;
    const dip = this.fishBite ? 2 + Math.sin(now / 45) * 1.5 : Math.sin(now / 420) * 0.8;
    const bx = Math.round(tx), by = Math.round(ty + dip);
    g.clear();
    g.lineStyle(2, 0x6a4a22, 1).lineBetween(Math.round(hx), Math.round(hy), Math.round(tipx), Math.round(tipy)); // 鱼竿
    g.lineStyle(1, 0xf4f8fa, 0.95).beginPath().moveTo(Math.round(tipx), Math.round(tipy));
    for (let i = 1; i <= 8; i++) { const t = i / 8; g.lineTo(Math.round(tipx + (bx - tipx) * t), Math.round(tipy + (by - tipy) * t + Math.sin(t * Math.PI) * 6)); } // 带一点下垂的鱼线
    g.strokePath();
    const ring = (now % 1400) / 1400; // 水面一圈圈的涟漪
    g.lineStyle(1, 0xffffff, 0.55 * (1 - ring)).strokeEllipse(bx, by + 1, 6 + ring * 14, 3 + ring * 7);
    g.fillStyle(0xffffff, 1).fillRect(bx - 1, by - 1, 3, 3); g.fillStyle(0xd6405c, 1).fillRect(bx - 1, by - 2, 3, 2); // 浮漂
    g.setDepth(Math.max(this.y, ty) + 1);
  }

  /** 头顶冒出表情图标并做小动作（动作只在画面上，不影响位置） */
  emote(e: EmoteDef) {
    const sc = this.sprite.scene;
    sc.tweens.killTweensOf(this.fx); sc.tweens.killTweensOf(this.emo);
    this.fx.dx = this.fx.dy = 0; this.emoteTxt?.destroy();
    this.emoteTxt = sc.add.text(0, 0, e.icon, { fontFamily: 'sans-serif', fontSize: '20px' }).setOrigin(0.5, 1).setAlpha(1);
    this.emo.rise = 0;
    sc.tweens.add({ targets: this.emo, rise: 14, duration: e.ms, ease: 'Quad.easeOut', onUpdate: (tw) => { this.emoteTxt?.setAlpha(tw.progress < 0.7 ? 1 : 1 - (tw.progress - 0.7) / 0.3); }, onComplete: () => { this.emoteTxt?.destroy(); this.emoteTxt = undefined; } });
    if (e.pose) { this.poseAnim = e.pose; this.poseUntil = sc.time.now + e.ms; this.play(); }
    else if (e.anim === 'shake') sc.tweens.add({ targets: this.fx, dx: { from: -2, to: 2 }, duration: 70, yoyo: true, repeat: Math.floor(e.ms / 140), onComplete: () => { this.fx.dx = 0; } });
    else if (e.anim === 'jump') sc.tweens.add({ targets: this.fx, dy: -7, duration: 150, ease: 'Quad.easeOut', yoyo: true, repeat: 2, onComplete: () => { this.fx.dy = 0; } });
    else if (e.anim === 'dance') {
      this.danceUntil = sc.time.now + e.ms;
      sc.tweens.add({ targets: this.fx, dy: -3, duration: 140, yoyo: true, repeat: Math.floor(e.ms / 280), onComplete: () => { this.fx.dy = 0; } });
    }
  }
  /** 当前画出来的朝向：跳舞时四个方向轮流转（站着/坐着时才转；走动时不转） */
  private shownFacing(): Facing {
    const now = this.sprite.scene.time.now;
    if (!this.poseAnim && this.danceUntil > now && !this.moving && !this.riding) return (['down', 'left', 'up', 'right'] as const)[Math.floor(now / 150) % 4];
    return this.facing;
  }

  protected syncSprite() {
    const rx = Math.round(this.x), ry = Math.round(this.y);
    // 基准点：坐着时是椅面上的位置，否则是脚点
    const cx = this.sitting && this.seatAt ? Math.round(this.seatAt.bx) : rx, cy = this.sitting && this.seatAt ? Math.round(this.seatAt.by) + 3 : ry;
    const vis = !Character.hideTags && !this.tagsHidden;
    let lift = 0;
    if (this.riding && this.bikeBack && this.bikeFront) {
      const m = this.bikeMeta, sc = this.sprite.scene, now = sc.time.now, dtm = Math.min(100, Math.max(1, now - this.bikeT));
      const mvx = this.x - this.lx, mvy = this.y - this.ly, moved = Math.hypot(mvx, mvy);
      this.bikeT = now; this.lx = this.x; this.ly = this.y;
      const ratio = Math.min(1, moved / (dtm / 1000) / BIKE_SPEED);
      this.wheel += (this.moving ? 5 + 11 * ratio : 0) * (dtm / 1000); // 转得越快踩得越快
      const f = Math.floor(this.wheel) & 3;
      lift = m.rider.dy;
      this.sprite.setPosition(rx + m.rider.dx[this.facing], ry - lift);
      this.bikeBack.setFrame(`bike_${this.facing}_${f}`).setPosition(rx, ry).setDepth(this.y - 0.2);
      this.bikeFront.setVisible(this.facing === 'down').setFrame(`bikef_down_${f}`).setPosition(rx, ry).setDepth(this.y + 0.2);
      if (ratio > 0.4 && now - this.dustT > 85 && moved > 0) { // 骑得快时脚下扬起尘土
        this.dustT = now;
        const ux = mvx / moved, uy = mvy / moved;
        const puff = sc.add.image(rx - ux * 12 + (Math.random() - 0.5) * 4, ry - 1 - uy * 6, 'puff').setDepth(this.y - 0.3).setAlpha(0.6).setScale(0.55);
        sc.tweens.add({ targets: puff, scale: 1.5, alpha: 0, y: puff.y - 5, duration: 460, ease: 'Quad.easeOut', onComplete: () => puff.destroy() });
      }
    } else if (this.pax) { // 后座：和车主一样只露上半身，往车尾方向偏一点；朝上时在车主前面，其余朝向在车主后面
      const m = this.bikeMeta, bk = { down: [0, -6], up: [0, 6], left: [8, 0], right: [-8, 0] }[this.facing];
      this.sprite.setPosition(cx + m.rider.dx[this.facing] + bk[0] + this.fx.dx, cy - m.rider.dy + bk[1] + this.fx.dy);
      lift = m.rider.dy + 15; // 昵称牌比车主的再高一截，免得叠在一起
    } else this.sprite.setPosition(cx + this.fx.dx, cy + this.fx.dy);
    this.sprite.setDepth(this.pax ? this.y + (this.facing === 'up' ? 0.1 : -0.05) : this.y);
    if (Character.umbrella) { // 雨伞：长柄握在手里（面朝上下时在身侧，朝左右时伸到身前），伞面高过头顶；昵称牌相应抬高
      const sc = this.sprite.scene;
      if (!this.umb) this.umb = sc.add.image(0, 0, `umb${this.appRef ? this.appRef[IDX.topColor] % 6 : this.look % 6}`).setOrigin(0.5, 1);
      // 伞面罩在头顶（中心略偏向持伞的一侧），手握在身侧；朝左/上时换另一只手（贴图翻转）
      const left = this.facing === 'left' || this.facing === 'up', head = { down: 1, up: -1, left: -2, right: 2 }[this.facing];
      const bob = this.moving ? Math.round(Math.sin(sc.time.now / 90)) : 0; // 走路时手臂带着伞轻微起伏
      this.umb.setFlipX(left).setOrigin(left ? 1 - UMB.cx / UMB.w : UMB.cx / UMB.w, 1)
        .setPosition(Math.round(this.sprite.x) + head, Math.round(this.sprite.y) - 10 + bob).setDepth(this.y + (this.facing === 'up' ? -0.02 : 0.3));
      lift += 12;
    } else if (this.umb) { this.umb.destroy(); this.umb = undefined; }
    this.seatStrip?.setDepth(this.y + 0.2);
    this.syncHeld(cx, cy);
    const ty = cy + this.fx.dy;
    if (this.tag) this.tag.setPosition(cx, ty - 37 - lift).setDepth(this.y + 0.5).setVisible(vis);
    const titleH = this.titleTag ? this.titleTag.height + 1 : 0;
    if (this.titleTag) this.titleTag.setPosition(cx, ty - 37 - lift - (this.tag ? this.tag.height + 1 : 0)).setDepth(this.y + 0.5).setVisible(vis);
    if (this.bubble) {
      if (this.sprite.scene.time.now > this.bubbleUntil) { this.bubble.destroy(); this.bubble = undefined; }
      else this.bubble.setPosition(cx, ty - 37 - lift - (this.tag ? this.tag.height + 3 : 0) - titleH).setDepth(this.y + 0.6).setVisible(vis);
    }
    if (this.fishing) this.drawFishing(cx, ty);
    if (this.fishMark) this.fishMark.setPosition(cx, ty - 37 - lift - (this.tag ? this.tag.height + 1 : 0) - titleH - 2).setDepth(this.y + 0.8);
    if (this.emoteTxt) this.emoteTxt.setPosition(cx, ty - 37 - lift - (this.tag ? this.tag.height + 1 : 0) - titleH - (this.bubble ? this.bubble.height + 3 : 0) - 2 - this.emo.rise).setDepth(this.y + 0.7);
  }
  /** 头顶昵称牌 */
  setNameTag(text: string, color = '#ffffff') {
    if (!this.tag) this.tag = this.sprite.scene.add.text(0, 0, '', { fontFamily: 'ArkPixel', fontSize: '12px', backgroundColor: 'rgba(24,18,12,0.62)', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1);
    this.tag.setText(text).setColor(color);
    this.syncSprite();
  }
  /** 昵称上方的称号牌（undefined = 不显示） */
  setTitle(t?: { name: string; color: string }) {
    if (!t) { this.titleTag?.destroy(); this.titleTag = undefined; this.syncSprite(); return; }
    if (!this.titleTag) this.titleTag = this.sprite.scene.add.text(0, 0, '', { fontFamily: 'ArkPixel', fontSize: '10px', backgroundColor: 'rgba(24,18,12,0.5)', padding: { x: 3, y: 0 } }).setOrigin(0.5, 1);
    this.titleTag.setText(t.name).setColor(t.color);
    this.syncSprite();
  }
  /** 头顶说话气泡（聊天内容短暂显示在头上） */
  say(text: string, ms = 6000, style: 'normal' | 'party' = 'normal') {
    this.bubble?.destroy();
    const party = style === 'party'; // 队伍的话：绿色气泡，只有队友看得到
    this.bubble = this.sprite.scene.add.text(0, 0, text, { fontFamily: 'ArkPixel', fontSize: '12px', color: party ? '#1f3d10' : '#3b2412', backgroundColor: party ? '#d9efc4' : '#fbf3dc', padding: { x: 4, y: 2 }, wordWrap: { width: 132, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5, 1);
    this.bubbleUntil = this.sprite.scene.time.now + ms;
    this.syncSprite();
  }
  destroy() { this.heldImg?.destroy(); this.skinToken++; this.skinHandle?.release(); this.umb?.destroy(); this.fishG?.destroy(); this.fishMark?.destroy(); this.seatStrip?.destroy(); this.emoteTxt?.destroy(); this.sprite.scene.tweens.killTweensOf(this.fx); this.sprite.scene.tweens.killTweensOf(this.emo); this.tag?.destroy(); this.titleTag?.destroy(); this.bubble?.destroy(); this.bikeBack?.destroy(); this.bikeFront?.destroy(); this.sprite.destroy(); }
  /** 换外观：先显示预置造型（look），有自定义外观（app）就在后台生成，好了再换上 */
  setLook(look: number, app?: Appearance) {
    this.look = look; this.umb?.destroy(); this.umb = undefined;
    this.skinHandle?.release(); this.skinHandle = undefined; this.appRef = app;
    const token = ++this.skinToken;
    this.useSkin(`c${look}`, 'chars');
    const mgr = app ? this.skins : undefined;
    if (app && mgr) this.skinHandle = mgr.use(app, (prefix, tex) => { if (token === this.skinToken) this.useSkin(prefix, tex); });
  }
  private useSkin(prefix: string, tex: string) {
    this.skin = prefix; this.texKey = tex;
    this.sprite.anims.stop(); this.sprite.setTexture(tex, `${prefix}_${this.facing}_0`);
    this.moving = false; this.play();
  }
  /** 手持物（0 = 没拿）：图从 'held' 图集取，按朝向挂在手的位置；骑车/坐着/钓鱼/蹲下/打伞时不显示 */
  private heldId = 0; private heldImg?: Phaser.GameObjects.Image;
  get held() { return this.heldId; }
  setHeld(id: number) { if (id === this.heldId) return; this.heldId = id; if (!id) { this.heldImg?.destroy(); this.heldImg = undefined; } this.syncSprite(); }
  /** 把手持物摆到手上：胸前拿的（书/手机/相机）面朝镜头、侧面时可见，背面藏在身体前；身侧提的（奶茶/咖啡/篮球）四个方向都看得见；走路时随步伐上下一格 */
  private syncHeld(cx: number, cy: number) {
    const def = this.heldId ? heldDef(this.heldId) : undefined;
    const show = !!def && !this.riding && !this.pax && !this.fishing && !this.crouching && !this.sitting && !Character.umbrella;
    if (!def || !show) { this.heldImg?.setVisible(false); return; }
    const f = this.facing, view = f === 'up' ? 'up' : f === 'down' ? 'down' : 'right', flip = f === 'left';
    if (def.grip === 'chest' && view === 'up') { this.heldImg?.setVisible(false); return; }
    const frame = `held_${def.key}_${view}`, sc = this.sprite.scene;
    const img = this.heldImg ?? (this.heldImg = sc.add.image(0, 0, 'held', frame));
    const bob = this.moving ? Math.round(Math.sin(sc.time.now / 90)) : 0, sx = flip ? -1 : 1;
    img.setVisible(true).setFrame(frame).setFlipX(flip);
    if (def.grip === 'chest') img.setOrigin(0.5, 0.5).setPosition(cx + (view === 'right' ? 6 * sx : 0), cy - 13 + bob);
    else img.setOrigin(0.5, 1).setPosition(cx + (view === 'right' ? 5 * sx : 6), cy - 6 + bob);
    img.setDepth(this.y + 0.15);
  }
  /** 蹲下（摸猫、喂猫时）：由场景在猫面板打开/关闭时设置 */
  crouching = false;
  setCrouch(on: boolean) { if (on === this.crouching) return; this.crouching = on; this.moving = false; this.play(); this.syncSprite(); }
  protected play() {
    const face = this.shownFacing(), id = this.skin, now = this.sprite.scene.time.now;
    if (this.sitting) { this.sprite.anims.timeScale = 1; if (this.sprite.anims.currentAnim?.key !== `${id}_sit_down` || !this.sprite.anims.isPlaying) this.sprite.play(`${id}_sit_down`, true); return; }
    // 骑车时人物不迈腿：固定站姿帧（腿本来就被车架挡住）
    if (this.riding || this.pax) { this.sprite.anims.stop(); this.sprite.setFrame(`${id}_${this.facing}_0`); return; }
    if (this.poseAnim && (this.moving || now >= this.poseUntil)) this.poseAnim = undefined;
    const key = this.poseAnim ? `${id}_${this.poseAnim}_down`
      : this.fishing ? `${id}_${this.fishBite ? 'fish_bite' : 'fish'}_${this.facing}`
      : this.crouching && !this.moving ? `${id}_crouch_${this.facing}`
      : `${id}_${this.moving ? (this.running ? 'run' : 'walk') : 'idle'}_${face}`;
    this.sprite.anims.timeScale = this.moving ? this.animScale : 1;
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) this.sprite.play(key, true);
  }
}

/** 碰撞按这个步长分步检查：骑车时一帧能走十几像素，不分步会穿过薄墙 */
const STEP = 4;

export class Player extends Character {
  /** 当前速度（像素/秒）：镜头预读、地面预载用 */
  vx = 0; vy = 0;
  private bikeSpeed = 0; private bdx = 0; private bdy = 1;

  override setRiding(on: boolean) { super.setRiding(on); this.halt(); }
  /** 立刻停住（被服务器拉回、重新连上时用） */
  halt() { this.bikeSpeed = 0; this.vx = this.vy = 0; }

  /** 被好友牵着走：位置、朝向、走/跑都由牵手的人决定（服务器也这么算），自己的输入不起作用 */
  led = false;
  followMove(x: number, y: number, facing: Facing, moving: boolean, running: boolean) {
    this.x = x; this.y = y; this.facing = facing; this.moving = moving; this.running = moving && running; this.vx = this.vy = 0;
    this.play(); this.syncSprite();
  }
  update(dt: number, ix: number, iy: number, run: boolean, world: WorldMap) {
    if (this.led) { this.vx = this.vy = 0; return; }
    if (this.sitting || this.pax) { this.moving = false; this.vx = this.vy = 0; this.play(); this.syncSprite(); return; }
    if (this.riding) { this.rideUpdate(dt, ix, iy, world); return; }
    this.vx = this.vy = 0;
    this.moving = ix !== 0 || iy !== 0;
    this.running = this.moving && run;
    if (this.moving) {
      const len = Math.hypot(ix, iy);
      const sp = WALK_SPEED * (run ? RUN_MULT : 1) * dt;
      const dx = (ix / len) * sp, dy = (iy / len) * sp;
      // 朝向：优先水平输入
      if (Math.abs(ix) >= Math.abs(iy) && ix !== 0) this.facing = ix > 0 ? 'right' : 'left';
      else this.facing = iy > 0 ? 'down' : 'up';
      const p = world.move(this.x, this.y, dx, dy);
      this.vx = (p.x - this.x) / dt; this.vy = (p.y - this.y) / dt;
      this.x = p.x; this.y = p.y;
    }
    this.play();
    this.syncSprite();
  }

  /**
   * 骑行：速度 = BIKE_SPEED，但不是瞬间满速——按住方向键 BIKE_ACCEL 秒加速到满，松手 BIKE_BRAKE 秒刹停；
   * 急转（>90°）会掉速，蹭墙会减速。每帧按 STEP 像素分步走，保证高速下碰撞仍然正确。
   */
  /** 骑车时高速撞上了障碍（场景取走这个标志，做镜头抖动和成就上报） */
  private crashed = false;
  takeCrash(): boolean { const c = this.crashed; this.crashed = false; return c; }

  private rideUpdate(dt: number, ix: number, iy: number, world: WorldMap) {
    const hasInput = ix !== 0 || iy !== 0;
    if (hasInput) {
      const len = Math.hypot(ix, iy), nx = ix / len, ny = iy / len;
      if (this.bikeSpeed > 1 && nx * this.bdx + ny * this.bdy < 0) this.bikeSpeed *= 0.45; // 掉头：先刹掉大半速度
      this.bdx = nx; this.bdy = ny;
      this.bikeSpeed = Math.min(BIKE_SPEED, this.bikeSpeed + (BIKE_SPEED / BIKE_ACCEL) * dt);
      if (Math.abs(nx) >= Math.abs(ny) && nx !== 0) this.facing = nx > 0 ? 'right' : 'left';
      else this.facing = ny > 0 ? 'down' : 'up';
    } else this.bikeSpeed = Math.max(0, this.bikeSpeed - (BIKE_SPEED / BIKE_BRAKE) * dt);
    const want = this.bikeSpeed * dt, speed0 = this.bikeSpeed;
    this.moving = this.bikeSpeed > 3;
    let moved = 0;
    if (want > 0) {
      const n = Math.max(1, Math.ceil(want / STEP)), sx = (this.bdx * want) / n, sy = (this.bdy * want) / n;
      for (let i = 0; i < n; i++) {
        const p = world.move(this.x, this.y, sx, sy);
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        this.x = p.x; this.y = p.y; moved += d;
        if (d < Math.hypot(sx, sy) * 0.25) break; // 顶到墙上了，剩下的步数不用走
      }
      if (moved < want * 0.3 && speed0 >= BIKE_SPEED * 0.7 && hasInput) this.crashed = true; // 高速骑行、一下子被障碍顶停：撞墙（成就「墙是实心的」）
      if (moved < want * 0.3) this.bikeSpeed *= 0.6;          // 蹭/撞墙：掉速
      if (moved < want * 0.05) this.bikeSpeed = 0;
    }
    this.vx = dt > 0 ? (this.bdx * moved) / dt : 0; this.vy = dt > 0 ? (this.bdy * moved) / dt : 0;
    this.play();
    this.syncSprite();
  }
}
