import type Phaser from 'phaser';
import type { NetClient } from '@/net/client';
import { boxDef } from '@/shared/boxes';
import { fishDef, fmtKg, RARITY_COLORS } from '@/shared/fishing';
import { itemDef, type Inv } from '@/shared/items';
import type { ServerMsg } from '@/shared/protocol';
import { drawItem } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
type BoxResult = Extract<ServerMsg, { t: 'box_result' }>;

/**
 * 开盲盒：背包里点「打开」→ 盒子抖几下 → 揭晓得到了什么（币、物品、盲盒限定鱼）。
 * 随机和发奖都在服务器；这里只负责动画和展示，结果一到至少等盒子抖够 0.9 秒再揭晓（不然动画一闪而过）。
 * 不收费、不能买：打开面板底部写明保底（连续 30 个没开出珍品必出）。
 */
export class BoxPanel {
  private root = el('div', 'screen hidden');
  private stage = el('div', 'bx-stage');
  private foot = el('div', 'bx-foot');
  private startedAt = 0; private pending: BoxResult | null = null; private timer = 0; private cur = '';

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private inv: () => Inv) {
    const panel = el('div', 'box bx');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '开盲盒'), close);
    panel.append(head, this.stage, this.foot);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.handlers.boxResult = (m) => this.onResult(m);
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  close() { window.clearTimeout(this.timer); this.pending = null; this.root.classList.add('hidden'); }

  /** 打开一个盲盒（背包点「打开」）：先显示抖动的盒子，再向服务器要结果 */
  open(id: string) {
    const d = boxDef(id); if (!d || this.net.status !== 'online') return;
    this.cur = id; this.pending = null; this.startedAt = Date.now();
    this.root.classList.remove('hidden');
    const c = el('canvas', 'bx-box shake'); drawItem(c, this.textures, id, 8);
    this.stage.replaceChildren(c, el('div', 'bx-name', `正在打开「${d.name}」…`));
    this.foot.textContent = '';
    this.net.boxOpen(id);
    window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.reveal(), 3500); // 服务器没回话就别一直抖
  }
  private onResult(m: BoxResult) {
    if (!this.isOpen) return;
    this.pending = m;
    const wait = Math.max(0, 900 - (Date.now() - this.startedAt));
    window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.reveal(), wait);
  }
  private reveal() {
    const m = this.pending;
    if (!m) { this.stage.replaceChildren(el('div', 'bx-name', '好像没有反应……再试一次吧。')); return; }
    const d = boxDef(m.id), list = el('div', 'bx-list');
    if (!m.ok) { this.stage.replaceChildren(el('div', 'bx-name', m.msg ?? '打不开')); this.foot.textContent = ''; return; }
    const row = (id: string, text: string, color?: string, big = false) => {
      const r = el('div', 'bx-item' + (big ? ' gem' : '')); const c = el('canvas'); drawItem(c, this.textures, id, 4);
      const t = el('span', 'bx-text', text); if (color) t.style.color = color; r.append(c, t); list.append(r);
    };
    if (m.coins) { const r = el('div', 'bx-item'); r.append(el('span', 'coin-ico'), el('span', 'bx-text', `${m.coins} 校园币`)); list.append(r); }
    for (const g of m.items ?? []) row(g.id, `${itemDef(g.id)?.name ?? g.id}${g.n > 1 ? ` ×${g.n}` : ''}`, undefined, !!m.gem);
    if (m.fish) { const f = fishDef(m.fish.id); row(m.fish.id, `${f?.name ?? '鱼'}　${m.fish.cm} cm · ${fmtKg(m.fish.kg)}${m.fish.isNew ? '　图鉴新种类！' : ''}`, f ? RARITY_COLORS[f.rarity] : undefined, true); }
    if (m.dup) { const r = el('div', 'bx-item dim'); r.append(el('span', 'coin-ico'), el('span', 'bx-text', `已经有了，折成 ${m.dup} 校园币`)); list.append(r); }
    if (!list.childElementCount) list.append(el('div', 'bx-item dim', '空的……'));
    const c = el('canvas', 'bx-box open'); drawItem(c, this.textures, m.id, 5);
    this.stage.replaceChildren(c, el('div', 'bx-name', `${d?.name ?? '盲盒'}里有：`), list);
    const more = this.inv()[this.cur] ?? 0;
    this.foot.replaceChildren();
    if (more > 0) { const b = el('button', 'btn primary', `再开一个（还有 ${more} 个）`); b.type = 'button'; b.addEventListener('click', () => this.open(this.cur)); this.foot.append(b); }
    if (d && d.pity > 0 && m.pity !== undefined) this.foot.append(el('div', 'bx-pity', m.gem ? `开出了珍品！保底重新计数（连续 ${d.pity - 1} 次没出珍品，下一个必出）。` : `保底：已经连续 ${m.pity} 次没开出珍品，累计到 ${d.pity - 1} 次，下一个必出珍品。`));
  }
}
