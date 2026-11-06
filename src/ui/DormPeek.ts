import type Phaser from 'phaser';
import type { NetClient } from '@/net/client';
import { dormInteriorId, roomTitle, type DormCard } from '@/shared/dorm';
import { ensureSkin, skinTextureKey } from '@/systems/dormskin';
import { spotOf } from '@/systems/decorview';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 宿舍室内的数据（编译出来的 interiors.json 里 id = dorm / dorm-2 / dorm-3 的那几项，按房间级别选）：只用到底图、固定家具和门牌的位置 */
export interface DormDef { id: string; w: number; h: number; bg: string; objects: { k: string; x: number; y: number; depth: number }[] }
let getDefs: () => DormDef[] | undefined = () => undefined;
/** 场景启动时告诉资料卡去哪里拿宿舍的室内数据 */
export const setDormDefs = (fn: () => DormDef[] | undefined) => { getDefs = fn; };

/**
 * 把一间宿舍画成一张小图（底图 + 固定家具 + 房主摆的家具，按层级从后往前，门牌上写门牌名）：和进屋看到的一样，只是不含人和空调的风。
 * 用的是游戏里已经加载好的图集，不用服务器出图；返回 false = 资源还没加载好（画不出来）。
 */
export async function drawDormThumb(canvas: HTMLCanvasElement, textures: Phaser.Textures.TextureManager, card: Pick<DormCard, 'lay' | 'title' | 'rm' | 'sk'>, hostName: string, mine = false): Promise<boolean> {
  const lv = card.rm ?? 0, w = card.sk?.w ?? 0, f = card.sk?.f ?? 0;
  const def = getDefs()?.find((d) => d.id === dormInteriorId(lv)); if (!def || !textures.exists('furniture')) return false;
  if (!(await ensureSkin(textures, lv, w, f))) return false; // 墙纸、地板两层图没下载成功
  const W = def.w * 16, H = def.h * 16; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H);
  for (const k of [skinTextureKey(lv, 'f', f), skinTextureKey(lv, 'w', w)]) ctx.drawImage(textures.get(k).getSourceImage() as CanvasImageSource, 0, 0); // 地板在下、墙在上
  const items: { frame: string; x: number; y: number; depth: number }[] = def.objects.map((o) => ({ frame: o.k, x: o.x, y: o.y, depth: o.depth }));
  for (const p of card.lay) { const s = spotOf(textures, card.lay, p); if (s) items.push({ frame: s.frame, x: s.x, y: s.y, depth: s.depth }); }
  items.sort((a, b) => a.depth - b.depth);
  const tex = textures.get('furniture'), src = tex.getSourceImage() as CanvasImageSource;
  for (const it of items) { const fr = tex.get(it.frame); if (fr) ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, it.x, it.y, fr.cutWidth, fr.cutHeight); }
  const sign = def.objects.find((o) => o.k === 'dsign');
  if (sign) {
    const text = roomTitle(card.title, hostName, mine); ctx.font = '10px ArkPixel, sans-serif'; ctx.fillStyle = '#4a2e14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width, k = Math.min(1, 68 / Math.max(1, w)); ctx.save(); ctx.translate(sign.x + 41, sign.y + 11); ctx.scale(k, 1); ctx.fillText(text, 0, 0); ctx.restore();
  }
  return true;
}

/**
 * 资料卡旁边的「TA 的宿舍」：宿舍缩略图 + 门牌 + 楼栋 + 赞（点一下赞、再点取消；自己的宿舍只显示赞数）。
 * 规则都在服务器（要累计在线满 10 分钟、每天最多赞 20 次、不能赞自己）；这里只显示和发请求。
 */
export class DormPeek {
  readonly el = el('div', 'dorm-peek');
  private btn = el('button', 'btn dorm-like'); private msg = el('div', 'dorm-peek-msg');
  private n: number; private liked: boolean;
  constructor(textures: Phaser.Textures.TextureManager, private net: NetClient, private uid: number, hostName: string, private card: DormCard, private self: boolean) {
    this.n = card.likes; this.liked = card.liked;
    const head = el('div', 'dorm-peek-head'); head.append(el('div', 'dorm-peek-title', `🏠 ${roomTitle(card.title, hostName, self)}`), el('div', 'dorm-peek-sub', `${hostName} · ${card.b}`));
    const cv = el('canvas', 'dorm-peek-img'), hold = el('div', 'create-sub', '宿舍图加载中…');
    const foot = el('div', 'dorm-peek-foot'); this.btn.type = 'button'; this.btn.addEventListener('click', () => this.net.dormLike(this.uid));
    foot.append(this.btn, this.msg);
    this.el.append(head, hold, foot);
    void drawDormThumb(cv, textures, card, hostName, self).then((ok) => { if (ok) hold.replaceWith(cv); else hold.textContent = '（宿舍图没加载出来）'; });
    this.paint();
  }
  private paint() {
    this.btn.textContent = this.self ? `❤️ ${this.n} 个赞` : `${this.liked ? '❤️' : '🤍'} ${this.liked ? '已赞' : '赞'} ${this.n}`;
    this.btn.disabled = this.self; this.btn.classList.toggle('on', this.liked);
    this.btn.title = this.self ? '别人点你的头像、或者来你的宿舍做客时可以给你点赞' : this.liked ? '再点一下取消赞' : '给这间宿舍点个赞';
  }
  set(n: number, liked: boolean, msg?: string) { this.n = n; this.liked = liked; this.paint(); if (msg !== undefined) { this.msg.textContent = msg; } }
}
