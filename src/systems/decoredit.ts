import Phaser from 'phaser';
import type { NetClient } from '@/net/client';
import { DECOR_CATS, doorKeep, decorDef, footOf, layError, roomDims, wallRect, type DecorCat, type DecorDef, type Placed } from '@/shared/decor';
import { roomLevel, skinOf, skinOwned, type DormSave } from '@/shared/dorm';
import { FLOOR_SKINS, ROOM_NAMES, ROOM_PRICES, SKIN_KIND_NAMES, WALL_SKINS, type SkinKind } from '@/shared/dormskin';
import { dormRoom } from '@/shared/dorm';
import type { ServerMsg } from '@/shared/protocol';
import { ITEMS, type Inv } from '@/shared/items';
import { drawItem } from '@/ui/sprites';
import { spotOf } from './decorview';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

type Sel = { kind: 'new'; id: string } | { kind: 'move'; i: number } | null;

/**
 * 装修模式（只有房主、屋里没有别人时能开）：
 * 屏幕下方是背包里的家具；点一件 → 房间里出现跟着鼠标/手指的虚影（绿 = 能放，红 = 不能放，下面写原因）→ 点格子放下。
 * 点已经摆好的家具 → 选中它，再点别处挪过去，或点「收回」放回背包；地毯可以点「转向」。手机上第一次点是预览位置，在同一格再点一下才放。
 * 所有规则都在 shared/decor.ts 的 layError，服务器会再校验一遍；这里只负责显示和发请求。
 */
export class DecorEditor {
  active = false;
  private root = el('div', 'decor-tray hidden');
  private listEl = el('div', 'decor-list'); private tabsEl = el('div', 'decor-tabs'); private infoEl = el('div', 'decor-info'); private msgEl = el('div', 'decor-msg');
  private btnRot = el('button', 'btn', '转向 R'); private btnPick = el('button', 'btn', '收回 Del'); private btnCancel = el('button', 'btn', '取消 Esc');
  private sel: Sel = null; private rot = 0; private cat: DecorCat | '全部' = '全部';
  private mode: 'furn' | 'w' | 'f' | 'room' = 'furn'; private modesEl = el('div', 'decor-tabs decor-modes'); private armed = ''; private coins = -1; private prevCoins?: NetClient['handlers']['coins'];
  private hover: { x: number; y: number } | null = null; private inv: Inv = {};
  private grid?: Phaser.GameObjects.Graphics; private ghost?: Phaser.GameObjects.Image; private mark?: Phaser.GameObjects.Graphics;
  private busyUntil = 0; private prevInv?: NetClient['handlers']['inv'];

  constructor(private scene: Phaser.Scene, private net: NetClient, private api: { lay: () => Placed[]; /** 房间级别 */ level: () => number; /** 我的宿舍数据（墙纸、地板、级别） */ data: () => Extract<ServerMsg, { t: 'dorm_data' }> | null; banner: (title: string, text: string) => void; onToggle: (on: boolean) => void; /** 托盘占了屏幕底部多少像素（场景据此把房间缩放到托盘上面的空间里） */ reserve: (px: number) => void }) {
    const head = el('div', 'decor-head'), done = el('button', 'btn primary', '完成'); done.type = 'button'; done.addEventListener('click', () => this.close());
    head.append(el('div', 'decor-title', '🛋 装修'), this.infoEl, done);
    const acts = el('div', 'decor-acts');
    for (const b of [this.btnRot, this.btnPick, this.btnCancel]) b.type = 'button';
    this.btnRot.addEventListener('click', () => this.turn()); this.btnPick.addEventListener('click', () => this.pick()); this.btnCancel.addEventListener('click', () => this.cancel());
    acts.append(this.btnRot, this.btnPick, this.btnCancel);
    this.root.append(head, this.modesEl, this.tabsEl, this.listEl, acts, this.msgEl);
    (document.getElementById('hud') ?? document.body).append(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  destroy() { this.close(); window.removeEventListener('keydown', this.onKey); this.root.remove(); }

  open() {
    if (this.active) return;
    this.active = true; this.sel = null; this.rot = 0; this.hover = null; this.msgEl.textContent = '';
    this.root.classList.remove('hidden');
    const net = this.net; net.getInv(); this.prevInv = net.handlers.inv;
    net.handlers.inv = (items, gain) => { this.prevInv?.(items, gain); this.inv = items; this.refresh(); };
    this.prevCoins = net.handlers.coins; net.handlers.coins = (n, gain) => { this.prevCoins?.(n, gain); this.coins = n; if (this.active && this.mode !== 'furn') this.render(); }; net.getCoins();
    this.mode = 'furn'; this.armed = '';
    this.grid = this.scene.add.graphics().setDepth(8500); this.mark = this.scene.add.graphics().setDepth(8501);
    this.ghost = this.scene.add.image(0, 0, 'furniture').setOrigin(0).setVisible(false).setAlpha(0.8).setDepth(8600);
    this.scene.input.mouse?.disableContextMenu();
    this.scene.input.on('pointermove', this.onMove); this.scene.input.on('pointerdown', this.onDown);
    this.api.onToggle(true); this.drawGrid(); this.render();
  }
  close() {
    if (!this.active) return;
    this.active = false; this.root.classList.add('hidden');
    this.scene.input.off('pointermove', this.onMove); this.scene.input.off('pointerdown', this.onDown);
    this.grid?.destroy(); this.mark?.destroy(); this.ghost?.destroy(); this.grid = this.mark = undefined; this.ghost = undefined;
    if (this.prevInv !== undefined || this.net.handlers.inv) this.net.handlers.inv = this.prevInv;
    this.net.handlers.coins = this.prevCoins;
    this.api.reserve(0); this.api.onToggle(false);
  }
  /** 摆放或背包变了（服务器回了新数据）：重画列表和虚影；选中的家具如果没了就取消 */
  refresh() {
    if (!this.active) return;
    this.busyUntil = 0;
    if (this.sel?.kind === 'new' && (this.inv[this.sel.id] ?? 0) < 1) this.sel = null;
    if (this.sel?.kind === 'move' && !this.api.lay()[this.sel.i]) this.sel = null;
    this.render(); this.drawGhost();
  }
  setInv(inv: Inv) { this.inv = inv; this.refresh(); }

  // ------------------------------------------------------------ 界面
  private render() {
    // 顶上一排：家具 / 墙纸 / 地板 / 扩建
    const MODES: [typeof this.mode, string][] = [['furn', '🛋 家具'], ['w', '🎨 墙纸'], ['f', '🪵 地板'], ['room', '🏠 扩建']];
    this.modesEl.replaceChildren(...MODES.map(([k, name]) => { const b = el('button', 'seg' + (k === this.mode ? ' on' : ''), name); b.type = 'button'; b.addEventListener('click', () => { if (this.mode === k) return; this.mode = k; this.armed = ''; this.sel = null; this.ghost?.setVisible(false); this.mark?.clear(); this.grid?.setVisible(k === 'furn'); this.render(); }); return b; }));
    if (this.mode !== 'furn') { this.renderOther(); return; }
    this.listEl.style.display = '';
    const owned = ITEMS.filter((d) => d.kind === 'decor' && (this.inv[d.id] ?? 0) > 0);
    const cats = DECOR_CATS.filter((c) => owned.some((d) => decorDef(d.id)?.cat === c));
    if (this.cat !== '全部' && !cats.includes(this.cat)) this.cat = '全部';
    this.tabsEl.replaceChildren(...(['全部', ...cats] as const).map((c) => { const b = el('button', 'seg' + (c === this.cat ? ' on' : ''), c); b.type = 'button'; b.addEventListener('click', () => { this.cat = c; this.render(); }); return b; }));
    this.tabsEl.style.display = cats.length > 1 ? '' : 'none';
    const shown = owned.filter((d) => this.cat === '全部' || decorDef(d.id)?.cat === this.cat);
    this.listEl.replaceChildren();
    if (!owned.length) this.listEl.append(el('div', 'decor-empty', '背包里还没有家具。去图书馆广场的校园商店，在「买东西」页买；已经摆在房里的，点一下它就能挪动或收回。'));
    for (const d of shown) {
      const b = el('button', 'decor-item' + (this.sel?.kind === 'new' && this.sel.id === d.id ? ' on' : '')); b.type = 'button'; b.title = `${d.name}（${decorDef(d.id)?.cat}）`;
      const c = el('canvas'); drawItem(c, this.scene.textures, d.id, 2); b.append(c, el('span', 'decor-name', d.name), el('span', 'decor-n', `×${this.inv[d.id]}`));
      b.addEventListener('click', () => { this.sel = { kind: 'new', id: d.id }; this.rot = 0; this.msgEl.textContent = ''; this.render(); this.drawGhost(); });
      this.listEl.append(b);
    }
    const def = this.selDef();
    this.infoEl.textContent = !this.sel ? `已摆 ${this.api.lay().length} 件 · 点背包里的家具来摆，点房里的家具来挪动/收回` : this.sel.kind === 'new' ? `正在摆：${def?.name}（再点一下房间里的格子放下）` : `选中了：${def?.name}（点别处挪过去，或点「收回」）`;
    const vis = (b: HTMLElement, on: boolean) => { b.style.visibility = on ? 'visible' : 'hidden'; }; // 用 visibility 不用 display：托盘高度不跟着变，房间不会跳
    vis(this.btnRot, !!def?.turn); vis(this.btnPick, this.sel?.kind === 'move'); vis(this.btnCancel, !!this.sel);
    if (!this.sel) this.say('点背包里的家具来摆；点房里的家具来挪动 / 收回');
    if (this.active) this.api.reserve(this.root.offsetHeight + 12);
  }
  /** 墙纸 / 地板 / 扩建页：买、换、升级。第一次点「买」只是提示价格，再点一次才真买（防手滑） */
  private renderOther() {
    const data = this.api.data(), lv = data ? roomLevel(data as DormSave) : 0;
    this.tabsEl.style.display = 'none'; this.listEl.replaceChildren(); this.listEl.style.display = '';
    const coin = this.coins >= 0 ? `你有 ${this.coins} 校园币` : '';
    const arm = (key: string, price: number, text: string, go: () => void) => () => { if (this.armed === key) { this.armed = ''; go(); } else { this.armed = key; this.say(`${text}：${price} 校园币。再点一下确认购买。${coin ? `（${coin}）` : ''}`); this.render(); this.refreshArmed(); } };
    if (this.mode === 'room') {
      const here = dormRoom(lv), next = lv < 2 ? dormRoom(lv + 1) : null, box = el('div', 'decor-room');
      box.append(el('div', 'decor-room-now', `现在是${ROOM_NAMES[lv]}（${here.w - 2}×${here.h - 4} 格地面）`));
      if (next) {
        const price = ROOM_PRICES[lv + 1], b = el('button', 'btn primary', `扩建成${ROOM_NAMES[lv + 1]}（${next.w - 2}×${next.h - 4}）· ${price} 币${this.armed === 'room' ? ' · 再点确认' : ''}`); b.type = 'button';
        b.addEventListener('click', arm('room', price, `扩建成${ROOM_NAMES[lv + 1]}`, () => this.net.dormExpand()));
        box.append(b, el('div', 'create-sub', '向右、向下变大，床、衣柜、宝箱、浴缸和已经摆好的家具都不动。扩建后不能缩回去；屋里要没有访客。'));
      } else box.append(el('div', 'create-sub', '已经是最大的房间了。'));
      this.listEl.append(box);
    } else {
      const kind = this.mode as SkinKind, list = kind === 'w' ? WALL_SKINS : FLOOR_SKINS, cur = data ? skinOf(data as DormSave)[kind] : 0;
      list.forEach((sk, i) => {
        const own = !!data && skinOwned(data as DormSave, kind, i), used = i === cur;
        const b = el('button', 'decor-item decor-skin' + (used ? ' on' : '')); b.type = 'button'; b.title = sk.name;
        const sw = el('div', 'decor-sw'); for (const c of sk.swatch) { const d = el('i'); d.style.background = c; sw.append(d); }
        b.append(sw, el('span', 'decor-name', sk.name), el('span', 'decor-n', used ? '使用中' : own ? '已有' : `${sk.price}币`));
        b.addEventListener('click', own ? () => this.net.dormSkin(kind, i, 'use') : arm(`${kind}${i}`, sk.price, `买${sk.name}`, () => this.net.dormSkin(kind, i, 'buy')));
        this.listEl.append(b);
      });
    }
    this.infoEl.textContent = this.mode === 'room' ? '扩建房间：更大的地板、更长的北墙' : `换${SKIN_KIND_NAMES[this.mode as SkinKind]}：点一种；没买过的要花校园币（买一次永久拥有）`;
    for (const b of [this.btnRot, this.btnPick, this.btnCancel]) b.style.visibility = 'hidden';
    if (!this.armed) this.say(coin);
    if (this.active) this.api.reserve(this.root.offsetHeight + 12);
  }
  private refreshArmed() { /* 重画后保持提示文字 */ }
  private selDef(): DecorDef | undefined {
    if (!this.sel) return undefined;
    return decorDef(this.sel.kind === 'new' ? this.sel.id : this.api.lay()[this.sel.i]?.d);
  }
  private say(t: string, bad = false) { this.msgEl.textContent = t; this.msgEl.classList.toggle('bad', bad); }

  /** 地面格子线：地面区域浅白线，门口留空的位置画黄框 */
  private drawGrid() {
    const g = this.grid; if (!g) return;
    g.clear(); g.lineStyle(1, 0xffffff, 0.22);
    const R = roomDims(this.api.level()), K = doorKeep(this.api.level());
    for (let x = R.x0; x <= R.x1 + 1; x++) g.lineBetween(x * 16, R.y0 * 16, x * 16, (R.y1 + 1) * 16);
    for (let y = R.y0; y <= R.y1 + 1; y++) g.lineBetween(R.x0 * 16, y * 16, (R.x1 + 1) * 16, y * 16);
    g.lineStyle(2, 0xffd24a, 0.7); g.strokeRect(K.x * 16, K.y * 16, K.w * 16, K.h * 16); // 门口留空
  }

  // ------------------------------------------------------------ 放置计算
  /** 指针所在的格子 → 选中的家具要放的位置 */
  private target(): Placed | null {
    const def = this.selDef(), h = this.hover; if (!def || !h) return null;
    const rot = def.turn && (this.rot === 90 || this.rot === 270) ? this.rot : 0, { fw, fh } = footOf(def, rot);
    const p: Placed = { d: def.id, x: h.x, y: h.y };
    if (def.kind === 'wall') { p.x = h.x - Math.floor((fw - 1) / 2); p.y = Math.min(3, Math.max(def.wh ?? 1, h.y + (def.wh ?? 1))); }
    else if (def.kind !== 'top') { p.x = h.x - Math.floor((fw - 1) / 2); p.y = h.y - Math.floor((fh - 1) / 2); }
    if (rot) p.r = rot as 90 | 270;
    return p;
  }
  private candidate(p: Placed): Placed[] {
    const lay = this.api.lay();
    return this.sel?.kind === 'move' ? lay.map((q, i) => (i === (this.sel as { i: number }).i ? p : q)) : [...lay, p];
  }
  private drawGhost() {
    const ghost = this.ghost, mark = this.mark; if (!ghost || !mark) return;
    mark.clear();
    if (this.sel?.kind === 'move') { // 选中的已摆家具画一圈黄框
      const q = this.api.lay()[this.sel.i], d = decorDef(q?.d);
      if (q && d) { mark.lineStyle(2, 0xffd24a, 0.9); if (d.kind === 'wall') { const r = wallRect(d, q); mark.strokeRect(r.x * 16, r.y * 16, r.w * 16, r.h * 16); } else { const f = footOf(d, q.r); mark.strokeRect(q.x * 16, q.y * 16, f.fw * 16, f.fh * 16); } }
    }
    const p = this.target();
    if (!p) { ghost.setVisible(false); return; }
    const spot = spotOf(this.scene.textures, this.api.lay(), p); if (!spot) { ghost.setVisible(false); return; }
    const err = layError(this.candidate(p), this.api.level());
    ghost.setFrame(spot.frame).setPosition(spot.x, spot.y).setVisible(true).setTint(err ? 0xff6a6a : 0x9cff9c).setAlpha(err ? 0.65 : 0.85);
    this.say(err ?? (this.sel?.kind === 'move' ? '可以挪到这里' : '可以放在这里'), !!err);
  }

  // ------------------------------------------------------------ 输入
  private cellAt(pointer: Phaser.Input.Pointer) {
    const w = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: Math.floor(w.x / 16), y: Math.floor(w.y / 16) };
  }
  private onMove = (pointer: Phaser.Input.Pointer) => { if (!this.active || this.mode !== 'furn' || pointer.wasTouch) return; this.hover = this.cellAt(pointer); this.drawGhost(); };
  private onDown = (pointer: Phaser.Input.Pointer) => {
    if (!this.active || this.mode !== 'furn') return;
    if (pointer.rightButtonDown()) { this.cancel(); return; }
    const cell = this.cellAt(pointer), touch = pointer.wasTouch;
    if (!this.sel) { this.grab(cell); return; }
    if (touch && (!this.hover || this.hover.x !== cell.x || this.hover.y !== cell.y)) { this.hover = cell; this.drawGhost(); return; } // 手机：第一下只是预览位置
    this.hover = cell; this.drawGhost();
    this.commit();
  };
  /** 没有选中任何东西时点房间：选中点到的那件已摆家具（小件 > 地面家具 > 墙饰 > 地毯） */
  private grab(c: { x: number; y: number }) {
    const lay = this.api.lay(); let best = -1, rank = -1;
    lay.forEach((q, i) => {
      const d = decorDef(q.d); if (!d) return;
      let on = false, r = 0;
      if (d.kind === 'wall') { const w = wallRect(d, q); on = c.x >= w.x && c.x < w.x + w.w && c.y >= w.y && c.y < w.y + w.h; r = 1; }
      else { const f = footOf(d, q.r); on = c.x >= q.x && c.x < q.x + f.fw && c.y >= q.y && c.y < q.y + f.fh; r = d.kind === 'top' ? 3 : d.kind === 'rug' ? 0 : 2; }
      if (on && r > rank) { best = i; rank = r; }
    });
    if (best < 0) return;
    this.sel = { kind: 'move', i: best }; this.rot = lay[best].r ?? 0; this.hover = c; this.render(); this.drawGhost();
  }
  private commit() {
    const p = this.target(), now = performance.now(); if (!p || now < this.busyUntil) return;
    const err = layError(this.candidate(p), this.api.level()); if (err) { this.say(err, true); return; }
    this.busyUntil = now + 900; // 等服务器回话再放下一件（防连点）
    if (this.sel?.kind === 'new') this.net.dormLay({ op: 'place', d: p.d, x: p.x, y: p.y, ...(p.r ? { r: p.r } : {}) });
    else if (this.sel?.kind === 'move') { this.net.dormLay({ op: 'move', i: this.sel.i, x: p.x, y: p.y, ...(p.r ? { r: p.r } : {}) }); this.sel = null; }
  }
  private turn() {
    const d = this.selDef(); if (!d?.turn) return;
    this.rot = this.rot === 90 ? 0 : 90; this.drawGhost();
  }
  private pick() {
    if (this.sel?.kind !== 'move') return;
    this.net.dormLay({ op: 'pick', i: this.sel.i }); this.sel = null; this.render(); this.drawGhost();
  }
  private cancel() { this.sel = null; this.ghost?.setVisible(false); this.mark?.clear(); this.say(''); this.render(); }
  private onKey = (e: KeyboardEvent) => {
    if (!this.active || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement)) return;
    if (e.key === 'r' || e.key === 'R') { this.turn(); e.preventDefault(); }
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') { this.pick(); e.preventDefault(); }
    else if (e.key === 'Escape') { if (this.sel) this.cancel(); else this.close(); e.preventDefault(); e.stopPropagation(); }
  };
}
