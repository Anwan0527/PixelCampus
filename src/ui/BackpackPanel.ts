import type Phaser from 'phaser';
import { qtyPicker } from './qty';
import { BOX_BATCH_MAX } from '@/shared/boxes';
import { INV_SLOTS, invList, itemDef, type Gain, type Inv, type ItemKind } from '@/shared/items';
import type { NetClient } from '@/net/client';
import { itemImg } from './sprites';
import { ui } from './actions';
import { BAITS, RODS, TACKLES, baitDef, pickRod, resolveGear, rodDef, type Equip } from '@/shared/gear';
import { boxDef, boxOdds, type BoxId } from '@/shared/boxes';
import { FISH_TIERS, LAKE_FISH, fishDef } from '@/shared/fishing';
import { isNamedFish } from '@/shared/craft';
import { fishData } from './fishData';
import { gearSummary } from './fishdexModel';
import { PROTECTED, isProtected } from '@/shared/release';
import { barBonus, routeBonus, type Route } from '@/shared/fishlevel';
import type { MonPanel } from './MonPanel';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const KIND: Record<ItemKind, string> = { food: '食物', collect: '收藏品', key: '关键物品', tool: '工具', fish: '鱼', tackle: '钓鱼配件', box: '盲盒', decor: '宿舍家具' };

/**
 * 背包：显示服务器上的物品（物品跟着身份走，换设备/用备份码恢复后还在）。
 * 界面只读——获得和消耗都由服务器按规则执行并推送整份背包过来，所以这里只负责显示和提示"获得了什么"。
 * 电脑按 I 或点菜单「背包」，手机点 ☰ → 背包。2026-11-10 起分两页：「物品」（原来的背包）和「精灵」（原来单独的精灵面板，按 R 直达）。
 */
export type BagTab = 'items' | 'mons';
export class BackpackPanel {
  private root = el('div', 'screen hidden');
  private panel = el('div', 'box bag');
  private tabsBar = el('div', 'cx-tabs');
  private itemsView = el('div', 'bag-items');
  private monHolder = el('div', 'bag-mons hidden');
  private tab: BagTab = 'items';
  private mon: MonPanel | null = null;
  private grid = el('div', 'bag-grid');
  private detail = el('div', 'bag-detail');
  private note = el('div', 'bag-note');
  private equipBar = el('div', 'bag-equip');
  private eq: Equip = { rod: '', bait: '', tackle: [], target: '' };
  /** 点盲盒的「打开」时调用（由场景接到开盒面板） */
  private boxQty = 5;
  onOpenBox: (id: string, n: number) => void = () => {};
  /** 点等级那一行：跳到图鉴的等级页 */
  openLevel: () => void = () => {};
  private items: Inv = {};
  private picked: string | null = null;
  private loaded = false;

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private onGain: (gains: Gain[]) => void, private openFishDex: () => void = () => {}) {
    const panel = this.panel;
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭背包');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '背包'), close);
    const dexBtn = el('button', 'bag-dexbtn', '📖 钓鱼图鉴 (G)'); dexBtn.type = 'button';
    dexBtn.addEventListener('click', () => { this.close(); this.openFishDex(); });
    this.itemsView.append(el('div', 'create-sub', '物品存在服务器上，跟着你的身份走：换设备、用备份码恢复身份后都还在。'), this.equipBar, this.grid, this.detail, dexBtn, this.note);
    panel.append(head, this.tabsBar, this.itemsView, this.monHolder);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'bag', label: '背包', key: 'I', run: () => this.toggle() });
    this.net.handlers.inv = (items, gain) => { this.loaded = true; this.items = items; this.render(); if (gain?.length) this.onGain(gain); };
    this.net.handlers.equip = (eq) => { this.eq = eq; this.render(); };
    fishData.listeners.add(() => { if (this.isOpen) this.render(); });
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 当前背包内容（场景用来显示还剩几包猫粮） */
  get inv(): Readonly<Inv> { return this.items; }
  /** 钓鱼装备栏（'' = 自动用最低级的）；场景用它判断这次抛竿用什么 */
  get equip(): Readonly<Equip> { return this.eq; }
  open(tab: BagTab = 'items') { this.tab = tab === 'mons' && !this.mon ? 'items' : tab; this.root.classList.remove('hidden'); this.net.getInv(); this.applyTab(); this.render(); if (this.tab === 'mons') this.mon?.enter(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** 并进来的「精灵」页（场景创建完精灵面板后调用） */
  attachMons(mon: MonPanel) {
    this.mon = mon; this.monHolder.append(mon.view);
    mon.attach({ open: (t) => this.open(t), close: () => this.close(), isOpenOn: (t) => this.isOpen && this.tab === t });
    this.applyTab();
  }
  /** 精灵数据变了：页签上的"还没领初始精灵"红点跟着变 */
  refreshTabs() { this.renderTabs(); }
  private renderTabs() {
    const defs: [BagTab, string][] = [['items', '🎒 物品'], ['mons', '🐾 精灵']];
    this.tabsBar.replaceChildren(...defs.filter(([id]) => id === 'items' || !!this.mon).map(([id, label]) => {
      const b = el('button', 'cx-tab' + (id === this.tab ? ' on' : ''), label); b.type = 'button';
      if (id === 'mons' && this.mon?.needsStarter) b.append(el('span', 'badge', '1'));
      b.addEventListener('click', () => { this.tab = id; this.applyTab(); if (id === 'mons') this.mon?.enter(); else this.render(); });
      return b;
    }));
  }
  private applyTab() {
    this.itemsView.classList.toggle('hidden', this.tab !== 'items'); this.monHolder.classList.toggle('hidden', this.tab !== 'mons');
    this.panel.classList.toggle('wide', this.tab === 'mons'); // 精灵页要宽一些
    this.renderTabs();
  }

  /**
   * 钓鱼装备栏：鱼竿、鱼饵（下拉，背包里有的）、配件（点一下装上 / 取下，数量受鱼竿的配件槽限制）、指名饵要咬的鱼；
   * 默认"自动"= 用最低级的（万能饵 / 指名饵 / 神话饵不会被自动用掉）。底下一行是这套装备此刻的效果。
   */
  private renderEquip() {
    this.equipBar.replaceChildren();
    const online = this.net.status === 'online', env = fishData.env(), inv = this.items;
    const slot = (label: string, key: 'rod' | 'bait', defs: readonly { id: string; name: string; tag?: string }[]) => {
      const owned = defs.filter((d) => (inv[d.id] ?? 0) > 0);
      const using = key === 'rod' ? rodDef(this.using().rod) : baitDef(this.using().bait);
      const sel = el('select'); sel.setAttribute('aria-label', `选择${label}`);
      sel.append(new Option('自动（用最低级的）', ''));
      for (const d of owned) sel.append(new Option(`${d.name}${d.tag ? `（${d.tag}）` : ''}${key === 'bait' ? ` ×${inv[d.id]}` : ''}`, d.id));
      sel.value = owned.some((d) => d.id === this.eq[key]) ? this.eq[key] : '';
      sel.disabled = !online || !owned.length;
      sel.addEventListener('change', () => this.net.equipSet(key, sel.value));
      const row = el('div', 'bag-equip-slot');
      row.append(el('span', 'bag-equip-label', label), sel, el('span', 'bag-equip-now', using ? `正在用：${using.name}` : '背包里没有'));
      this.equipBar.append(row);
    };
    slot('🎣 鱼竿', 'rod', RODS); slot('🪱 鱼饵', 'bait', BAITS);
    // 配件
    const rod = pickRod(inv, this.eq), slots = rod?.slots ?? 0, ownedT = TACKLES.filter((t) => (inv[t.id] ?? 0) > 0), on = this.eq.tackle.filter((t) => (inv[t] ?? 0) > 0).slice(0, slots);
    const trow = el('div', 'bag-equip-slot'), chips = el('span', 'bag-tk');
    for (const t of ownedT) {
      const b = el('button', 'bag-tk-chip' + (on.includes(t.id) ? ' on' : ''), t.name); b.type = 'button'; b.title = t.eff; b.disabled = !online || slots <= 0;
      b.addEventListener('click', () => this.net.equipSet('tackle', t.id)); chips.append(b);
    }
    if (!ownedT.length) chips.append(el('span', 'bag-equip-now', '还没有配件（商店、盲盒里有）'));
    trow.append(el('span', 'bag-equip-label', '🧷 配件'), chips, el('span', 'bag-equip-now', rod ? (slots ? `${on.length} / ${slots} 个槽` : '这根鱼竿没有配件槽（碳素竿起有）') : ''));
    this.equipBar.append(trow);
    // 指名饵的目标
    if ((inv.bait_name ?? 0) > 0 || this.eq.bait === 'bait_name') {
      const sel = el('select'); sel.setAttribute('aria-label', '指名饵要咬的鱼');
      sel.append(new Option('先选一种鱼', ''));
      const known = LAKE_FISH.filter((f) => isNamedFish(f.id) && fishData.log[f.id]).sort((a, b) => FISH_TIERS.indexOf(a.rarity) - FISH_TIERS.indexOf(b.rarity));
      for (const f of known) sel.append(new Option(f.name, f.id));
      sel.value = known.some((f) => f.id === this.eq.target) ? this.eq.target : '';
      sel.disabled = !online || !known.length;
      sel.addEventListener('change', () => this.net.equipSet('target', sel.value));
      const row = el('div', 'bag-equip-slot');
      row.append(el('span', 'bag-equip-label', '🎯 指名'), sel, el('span', 'bag-equip-now', this.eq.bait === 'bait_name' ? (this.eq.target ? `只咬${fishDef(this.eq.target)?.name}` : '要先选一种鱼才能抛竿') : '（饵选「指名饵」时才用）'));
      this.equipBar.append(row);
    }
    // 钓鱼等级：一行小字（点一下跳到图鉴的「等级」页）
    const fx = fishData.fx;
    if (fx) { const lvl = el('button', 'bag-lv', `⭐ 钓鱼 Lv.${fx.lv}　${fx.need ? `${Math.round((fx.into / fx.need) * 100)}%` : '满级'}`); lvl.type = 'button'; lvl.addEventListener('click', () => this.openLevel()); this.equipBar.append(lvl); }
    // 此刻的效果
    const g = resolveGear(inv, this.eq, env, fx ? { bar: barBonus(fx.lv), treasure: routeBonus(fx.rt as Route[], fx.lv).treasure } : undefined), sum = gearSummary(g);
    this.equipBar.append(el('div', 'bag-equip-sum', sum.length ? `现在这套：${sum.join(' · ')}` : '现在这套没有额外加成。'));
  }
  /** 这次抛竿实际会用的竿 / 饵（和服务器、场景的规则一样） */
  private using() { const g = resolveGear(this.items, this.eq, fishData.env(), fishData.fx ? { bar: barBonus(fishData.fx.lv), treasure: routeBonus(fishData.fx.rt as Route[], fishData.fx.lv).treasure } : undefined); return { rod: g.rod?.id ?? '', bait: g.bait?.id ?? '' }; }

  /** 盲盒的详情：打开按钮、保底进度、"可能开出什么"（掉落表公开） */
  private renderBoxDetail(id: BoxId) {
    const def = boxDef(id); if (!def) return;
    const have = this.items[id] ?? 0, max = Math.min(have, BOX_BATCH_MAX), online = this.net.status === 'online';
    if (max >= 2) this.detail.append(qtyPicker({ max, value: Math.min(this.boxQty, max), onChange: (n) => { this.boxQty = n; }, label: (n) => `打开 ${n} 个`, primary: true, disabled: !online, onGo: (n) => this.onOpenBox(id, n) }));
    else { const open = el('button', 'btn primary', '打开'); open.type = 'button'; open.disabled = !online; open.addEventListener('click', () => this.onOpenBox(id, 1)); this.detail.append(open); }
    if (have > BOX_BATCH_MAX) this.detail.append(el('div', 'bag-detail-desc dim', `一次最多连开 ${BOX_BATCH_MAX} 个。`));
    if (def.pity > 0) this.detail.append(el('div', 'bag-detail-desc', `保底：连续 ${def.pity - 1} 次没开出珍品，下一个必出（现在 ${fishData.gd.pity[id] ?? 0} 次）。`));
    const det = el('details', 'bag-odds'); det.append(el('summary', '', '可能开出什么？'));
    for (const o of boxOdds(id)) { const li = el('div', 'bag-odds-row' + (o.gem ? ' gem' : ''), `${o.gem ? '★ ' : ''}${o.label}　${o.pct}%`); det.append(li); }
    det.append(el('div', 'bag-detail-desc dim', '★ 是珍品（保底从这里面出）。重复的鱼竿、配件会折成一半的校园币。'));
    this.detail.append(det);
  }

  /** 背包没开着时不重画（以前每收到一次背包更新——喂猫、卖东西、交易成交——都在后台重建上百个格子）；打开时 open() 会重画 */
  private rendered = false;
  private render() {
    if (this.rendered && !this.isOpen) return;
    this.rendered = true;
    this.renderEquip();
    this.grid.replaceChildren();
    const list = invList(this.items);
    const total = Math.min(INV_SLOTS, Math.max(36, Math.ceil((list.length + 6) / 6) * 6));
    for (let i = 0; i < total; i++) {
      const it = list[i], b = el('button', 'slot' + (it && it.def.id === this.picked ? ' on' : '')); b.type = 'button';
      if (it) {
        b.append(itemImg(this.textures, it.def.id, 3));
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
      if (d.kind === 'box') this.renderBoxDetail(d.id as BoxId);
      if (isProtected(d.id)) {
        const b = el('button', 'btn', '🌊 放生'); b.type = 'button'; b.disabled = this.net.status !== 'online';
        b.addEventListener('click', () => this.net.fishRelease(d.id));
        this.detail.append(el('div', 'bag-detail-desc', PROTECTED[d.id]), b);
      }
    } else this.detail.append(el('div', 'bag-detail-desc dim', list.length ? '点一个物品看说明。' : '背包是空的。'));
    this.note.textContent = this.net.status !== 'online' ? '现在没有连上服务器，背包暂时无法更新。' : this.loaded ? '' : '读取中…';
  }
}
