import type Phaser from 'phaser';
import { INV_SLOTS, invList, itemDef, type Gain, type Inv, type ItemKind } from '@/shared/items';
import type { NetClient } from '@/net/client';
import { drawItem } from './sprites';
import { ui } from './actions';
import { BAIT_IDS, RODS, pickBait, pickRod, type Equip } from '@/shared/economy';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const KIND: Record<ItemKind, string> = { food: '食物', collect: '收藏品', key: '关键物品', tool: '工具', fish: '鱼' };

/**
 * 背包：显示服务器上的物品（物品跟着身份走，换设备/用备份码恢复后还在）。
 * 界面只读——获得和消耗都由服务器按规则执行并推送整份背包过来，所以这里只负责显示和提示"获得了什么"。
 * 电脑按 I 或点右侧「背包」，手机点 ☰ → 背包。
 */
export class BackpackPanel {
  private root = el('div', 'screen hidden');
  private grid = el('div', 'bag-grid');
  private detail = el('div', 'bag-detail');
  private note = el('div', 'bag-note');
  private equipBar = el('div', 'bag-equip');
  private eq: Equip = { rod: '', bait: '' };
  private items: Inv = {};
  private picked: string | null = null;
  private loaded = false;

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private onGain: (gains: Gain[]) => void, private openFishDex: () => void = () => {}) {
    const panel = el('div', 'box bag');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭背包');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '背包'), close);
    const dexBtn = el('button', 'bag-dexbtn', '📖 钓鱼图鉴 (G)'); dexBtn.type = 'button';
    dexBtn.addEventListener('click', () => { this.close(); this.openFishDex(); });
    panel.append(head, el('div', 'create-sub', '物品存在服务器上，跟着你的身份走：换设备、用备份码恢复身份后都还在。'), this.equipBar, this.grid, this.detail, dexBtn, this.note);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'bag', label: '背包', key: 'I', run: () => this.toggle() });
    this.net.handlers.inv = (items, gain) => { this.loaded = true; this.items = items; this.render(); if (gain?.length) this.onGain(gain); };
    this.net.handlers.equip = (rod, bait) => { this.eq = { rod, bait }; this.render(); };
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 当前背包内容（场景用来显示还剩几包猫粮） */
  get inv(): Readonly<Inv> { return this.items; }
  /** 钓鱼装备栏（'' = 自动用最低级的）；场景用它判断这次抛竿用什么 */
  get equip(): Readonly<Equip> { return this.eq; }
  open() { this.root.classList.remove('hidden'); this.net.getInv(); this.render(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  /** 装备栏：鱼竿、鱼饵各一格，下拉里是背包里有的；默认"自动"= 用最低级的 */
  private renderEquip() {
    this.equipBar.replaceChildren();
    const slot = (label: string, key: 'rod' | 'bait', ids: readonly string[]) => {
      const owned = ids.filter((id) => (this.items[id] ?? 0) > 0), using = key === 'rod' ? pickRod(this.items, this.eq)?.id : pickBait(this.items, this.eq);
      const sel = el('select'); sel.setAttribute('aria-label', `选择${label}`);
      sel.append(new Option(`自动（用最低级的）`, ''));
      for (const id of owned) sel.append(new Option(`${itemDef(id)?.name ?? id}${id === 'bait' || id === 'bait_pro' ? ` ×${this.items[id]}` : ''}`, id));
      sel.value = owned.includes(this.eq[key]) ? this.eq[key] : '';
      sel.disabled = this.net.status !== 'online' || !owned.length;
      sel.addEventListener('change', () => this.net.equipSet(key, sel.value));
      const row = el('div', 'bag-equip-slot');
      row.append(el('span', 'bag-equip-label', label), sel, el('span', 'bag-equip-now', using ? `正在用：${itemDef(using)?.name}` : '背包里没有'));
      this.equipBar.append(row);
    };
    slot('🎣 鱼竿', 'rod', RODS.map((r) => r.id)); slot('🪱 鱼饵', 'bait', BAIT_IDS);
  }

  private render() {
    this.renderEquip();
    this.grid.replaceChildren();
    const list = invList(this.items);
    for (let i = 0; i < INV_SLOTS; i++) {
      const it = list[i], b = el('button', 'slot' + (it && it.def.id === this.picked ? ' on' : '')); b.type = 'button';
      if (it) {
        const c = el('canvas'); drawItem(c, this.textures, it.def.id, 3); b.append(c);
        if (it.def.stack > 1) b.append(el('span', 'slot-n', String(it.n)));
        b.title = it.def.name;
        b.addEventListener('click', () => { this.picked = it.def.id; this.render(); });
      } else b.disabled = true;
      this.grid.append(b);
    }
    const d = this.picked ? itemDef(this.picked) : undefined;
    this.detail.replaceChildren();
    if (d && (this.items[d.id] ?? 0) > 0) {
      const top = el('div', 'bag-detail-top');
      top.append(el('span', 'bag-detail-name', `${d.name} ×${this.items[d.id]}`), el('span', 'board-tag', KIND[d.kind]));
      this.detail.append(top, el('div', 'bag-detail-desc', d.desc));
    } else this.detail.append(el('div', 'bag-detail-desc dim', list.length ? '点一个物品看说明。' : '背包是空的。'));
    this.note.textContent = this.net.status !== 'online' ? '现在没有连上服务器，背包暂时无法更新。' : this.loaded ? '' : '读取中…';
  }
}
