import type Phaser from 'phaser';
import { COIN_NAME, BULK_RARITIES, SHOP, marketMul, sellList, EXTRA_SELL, type ShopItem } from '@/shared/economy';
import { fishData } from './fishData';
import { qtyPicker } from './qty';
import { FISH_GEAR_IDS } from '@/shared/economy';
import { JUNK_GROUP, RARE_GROUP, RECIPES, SMALL_GROUP, craftWhy, isNamedFish, type Recipe } from '@/shared/craft';
import { RARITY_COLORS, RARITY_NAMES, fishDef } from '@/shared/fishing';
import { TREASURE_ID, isTrashItem } from '@/shared/trash';
import { itemDef, type Inv } from '@/shared/items';
import type { NetClient } from '@/net/client';
import type { CommView } from '@/shared/protocol';
import { drawItem } from './sprites';
import { DECOR_CATS, decorDef } from '@/shared/decor';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 校园商店：站在广场西侧的商店门口按 E 打开。两页——「买东西」（鱼饵、猫粮猫条、猫窝、鱼竿…）和「卖鱼」（卖钓上来的鱼和杂物，按"今日行情"结算）。
 * 货币、价格、行情全在 shared/economy.ts；这里只显示，买卖由服务器结算（它也会检查你是不是真的站在店门口）。
 */
export class ShopPanel {
  private root = el('div', 'screen hidden');
  private body = el('div', 'shop-body');
  private coinEl = el('span', 'shop-coins', '0');
  private msg = el('div', 'shop-msg');
  private buyQty = new Map<string, number>(); private sellQty = new Map<string, number>();
  private tabRow = el('div', 'seg-row');
  private titleEl = el('div', 'board-title', '校园商店');
  private subEl = el('div', 'create-sub');
  /** shop = 图书馆广场的校园商店；stall = 精工湖的钓具摊（只卖钓鱼用品，另有委托；收鱼 / 收杂物和主商店一样） */
  private mode: 'shop' | 'stall' = 'shop';
  private tab: 'buy' | 'sell' | 'craft' | 'comm' = 'sell';
  private craftParam = '';
  /** 上一次画的是哪一页（模式:标签）：同一页重画时保留滚动位置 */
  private shownKey = '';
  private coins = 0; private inv: Inv = {};

  /** day() 返回今天的日期编号（东八区，和服务器一致），用来算今日行情 */
  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private day: () => number) {
    const panel = el('div', 'box shop');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭商店');
    close.addEventListener('click', () => this.close());
    const wallet = el('div', 'shop-wallet'); wallet.append(el('span', 'coin-ico'), this.coinEl, el('span', 'shop-unit', COIN_NAME));
    head.append(this.titleEl, wallet, close);
    panel.append(head, this.subEl, this.tabRow, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.handlers.shopResult = (ok, text) => this.say(text, ok);
    net.handlers.craftResult = (ok, text) => this.say(text, ok);
    net.handlers.wqResult = (ok, text) => this.say(text, ok);
    fishData.listeners.add(() => { if (this.isOpen) this.render(); });
  }

  /** 标签页：校园商店 = 卖鱼 / 买东西 / 合成；钓具摊 = 委托 / 买钓具 / 卖鱼 / 合成 */
  private buildTabs() {
    const defs: [typeof this.tab, string][] = this.mode === 'stall' ? [['comm', '委托'], ['buy', '买钓具'], ['sell', '卖鱼'], ['craft', '合成']] : [['sell', '卖鱼'], ['buy', '买东西'], ['craft', '合成']];
    if (!defs.some(([k]) => k === this.tab)) this.tab = defs[0][0];
    this.tabRow.replaceChildren(...defs.map(([k, name]) => {
      const b = el('button', 'seg' + (k === this.tab ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.buildTabs(); this.render(); });
      return b;
    }));
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(mode: 'shop' | 'stall' = 'shop') {
    this.mode = mode; this.shownKey = ''; this.root.classList.remove('hidden'); this.msg.textContent = '';
    this.titleEl.textContent = mode === 'stall' ? '钓具摊 · 钓具老板' : '校园商店';
    this.subEl.textContent = mode === 'stall' ? '「钓鱼的人，装备和耐心一样要紧。」摊子卖全套钓鱼用品、能合成，每天和每周有委托；钓上来的鱼和杂物也能直接在这里卖（价格、行情和校园商店一样）。' : '钓上来的鱼、翻垃圾桶翻出来的东西都可以在这里卖钱；赚到的校园币能买鱼饵、猫粮、猫条、猫窝和更好的鱼竿。';
    this.buildTabs(); this.net.getInv(); this.net.getCoins(); this.net.getFx(); if (mode === 'stall') this.net.getWq(); this.render();
  }
  close() { this.root.classList.add('hidden'); }
  setCoins(n: number) { this.coins = n; this.coinEl.textContent = String(n); if (this.isOpen) this.render(); }
  setInv(inv: Inv) { this.inv = inv; if (this.isOpen) this.render(); }
  private say(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }

  private icon(id: string) { const c = el('canvas', 'shop-ico'); drawItem(c, this.textures, id, 3); return c; }
  /**
   * 重画整页内容。买/卖/合成之后服务器会连着推背包和校园币，每次都要重画，
   * 所以要把滚动位置记下来再还原——否则买一样东西列表就跳回最上面。切换标签页、重新打开商店才回到顶部。
   */
  private render() {
    const key = `${this.mode}:${this.tab}`, list = this.body.querySelector<HTMLElement>('.shop-list');
    const top = list && key === this.shownKey ? list.scrollTop : 0, outer = this.root.scrollTop;
    this.body.replaceChildren();
    const online = this.net.status === 'online';
    if (!online) this.body.append(el('div', 'board-empty', '没连上服务器，现在不能买卖。'));
    else if (this.tab === 'buy') this.renderBuy(); else if (this.tab === 'craft') this.renderCraft(); else if (this.tab === 'comm') this.renderComm(); else this.renderSell();
    const now = this.body.querySelector<HTMLElement>('.shop-list');
    if (now && top) now.scrollTop = top;
    if (key === this.shownKey) this.root.scrollTop = outer;
    this.shownKey = key;
  }

  private renderBuy() {
    const list = el('div', 'shop-list');
    const TK = '🧷 鱼竿配件（不消耗，要装在带配件槽的鱼竿上）', ORDER = ['🪱 鱼饵', '🎣 鱼竿', TK, '🐱 其他', ...DECOR_CATS.map((c) => `🛋 宿舍家具 · ${c}`)];
    const group = (id: string) => { const d = decorDef(id); return d ? `🛋 宿舍家具 · ${d.cat}` : id.startsWith('rod_') || id === 'fishing_rod' ? '🎣 鱼竿' : id.startsWith('tk_') ? TK : id.startsWith('bait') ? '🪱 鱼饵' : '🐱 其他'; };
    let last = '';
    for (const s of [...SHOP].filter((x) => this.mode === 'shop' || FISH_GEAR_IDS.has(x.id)).sort((a, b) => ORDER.indexOf(group(a.id)) - ORDER.indexOf(group(b.id)))) {
      const g = group(s.id); if (g !== last) { list.append(el('div', 'shop-group', g)); last = g; }
      list.append(this.buyRow(s));
    }
    this.body.append(list, el('div', 'shop-tip', '万能饵、指名饵、神话饵、龙骨竿、寒江竿、并蒂竿不在商店卖：要靠合成或钓鱼时的盲盒。宿舍家具买回来在自己的宿舍里点「装修」摆放；不想要了可以在「卖鱼」页按原价的一半退货。'));
  }

  /** 合成：杂物换鱼饵、小鱼做饵、指名饵、神话饵、龙骨竿（规则在 shared/craft.ts，服务器扣材料和币） */
  private renderCraft() {
    const list = el('div', 'shop-list'), inv = this.inv;
    const count = (ids: readonly string[]) => ids.reduce((a, id) => a + (inv[id] ?? 0), 0);
    const need = (r: Recipe) => r.needs.map((n) => {
      if ('id' in n) return `${itemDef(n.id)?.name} ${Math.min(inv[n.id] ?? 0, n.n)}/${n.n}`;
      if (n.group === 'junk') return `杂物 ${Math.min(count(JUNK_GROUP), n.n)}/${n.n}`;
      if (n.group === 'small') return `小鱼 ${Math.min(count(SMALL_GROUP), n.n)}/${n.n}`;
      if (n.group === 'rare') return `稀有鱼 ${Math.min(count(RARE_GROUP), n.n)}/${n.n}`;
      return `同种鱼 ${this.craftParam ? Math.min(inv[this.craftParam] ?? 0, n.n) : 0}/${n.n}`;
    }).concat(r.coins ? [`${r.coins} 校园币`] : []).join('　');
    for (const r of RECIPES) {
      const row = el('div', 'shop-row'), info = el('div', 'shop-info'), out = itemDef(r.out.id)!;
      info.append(el('div', 'shop-name', `${out.name}${r.out.n > 1 ? ` ×${r.out.n}` : ''}${r.minLevel > 1 ? `　（钓鱼 ${r.minLevel} 级）` : ''}`), el('div', 'shop-note', r.desc), el('div', 'shop-have', `材料：${need(r)}${fishData.level < r.minLevel ? `　·　还差 ${r.minLevel - fishData.level} 级` : ''}`));
      if (r.needs.some((n) => 'group' in n && n.group === 'same')) {
        const sel = el('select'); sel.setAttribute('aria-label', '选一种鱼'); sel.append(new Option('选一种鱼（背包里有 3 条以上的）', ''));
        for (const [id, n] of Object.entries(inv)) if (isNamedFish(id) && n >= 3) sel.append(new Option(`${fishDef(id)?.name} ×${n}`, id));
        sel.value = this.craftParam && (inv[this.craftParam] ?? 0) >= 3 ? this.craftParam : '';
        sel.addEventListener('change', () => { this.craftParam = sel.value; this.render(); });
        info.append(sel);
      }
      const why = craftWhy(inv, this.coins, r, this.craftParam || undefined, fishData.level);
      const b = el('button', 'btn' + (why ? '' : ' primary'), '合成'); b.type = 'button'; b.disabled = !!why; b.title = why ?? '';
      b.addEventListener('click', () => { b.disabled = true; this.net.craft(r.id, this.craftParam || undefined); });
      row.append(this.icon(r.out.id), info, b);
      list.append(row);
    }
    this.body.append(list, el('div', 'shop-tip', '龙鳞来自神话鱼和沉船箱，珍珠来自河蚌。垃圾不会白捡：杂物也能换鱼饵。'));
  }
  private buyRow(s: ShopItem) {
    const d = itemDef(s.id)!, row = el('div', 'shop-row');
    const owned = d.stack === 1 && (this.inv[s.id] ?? 0) >= 1, can = this.coins >= s.price && !owned;
    const info = el('div', 'shop-info');
    info.append(el('div', 'shop-name', `${d.name}${s.n > 1 ? ` ×${s.n}` : ''}`), el('div', 'shop-note', s.note), el('div', 'shop-have', `背包里有 ${this.inv[s.id] ?? 0}`));
    const price = el('div', 'shop-price'); price.append(el('span', 'coin-ico'), document.createTextNode(String(s.price)));
    const b = el('button', 'btn' + (can ? ' primary' : ''), owned ? '已拥有' : '购买'); b.type = 'button'; b.disabled = !can;
    b.title = can || owned ? '' : `还差 ${s.price - this.coins} 校园币`;
    b.addEventListener('click', () => { b.disabled = true; this.net.shopBuy(s.id, 1); });
    // 能堆叠的东西：拉条一次买多份（受校园币和背包上限限制）
    if (d.stack > 1) {
      const max = Math.min(Math.floor(this.coins / s.price), Math.floor((d.stack - (this.inv[s.id] ?? 0)) / s.n), 999);
      if (max >= 2) info.append(qtyPicker({
        max, value: Math.min(this.buyQty.get(s.id) ?? 5, max), onChange: (n) => this.buyQty.set(s.id, n),
        label: (n) => `买 ${n} 份`, hint: (n) => `共 ${n * s.price} 币${s.n > 1 ? `（${n * s.n} 个）` : ''}`, onGo: (n) => this.net.shopBuy(s.id, n),
      }));
    }
    row.append(this.icon(s.id), info, price, b);
    return row;
  }

  /** 钓具老板的委托：今日委托（简单）+ 本周委托（3 个，较难）；做完回这里领 */
  private renderComm() {
    const wq = fishData.wq, list = el('div', 'shop-list');
    if (!wq) { this.body.append(el('div', 'board-empty', '读取中…')); return; }
    const card = (c: CommView, label: string) => {
      const row = el('div', 'shop-row'), info = el('div', 'shop-info');
      const nm = el('div', 'shop-name'); nm.append(document.createTextNode(`${label}${c.name}`), el('span', 'cx-gnote', `　${c.prog} / ${c.goal}`));
      const bar = el('div', 'cx-pbar'), fill = el('div', 'cx-pfill'); fill.style.width = `${(c.prog / Math.max(1, c.goal)) * 100}%`; bar.append(fill);
      info.append(nm, el('div', 'shop-note', c.desc), bar, el('div', 'shop-have', `奖励：${c.reward.coins} 校园币${c.reward.items.map((g) => `、${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('')}、${c.reward.xp} 钓鱼经验`));
      const b = el('button', 'btn' + (c.done && !c.claimed ? ' primary' : ''), c.claimed ? '已领取' : c.done ? '领取' : '进行中'); b.type = 'button'; b.disabled = !c.done || c.claimed;
      b.addEventListener('click', () => { b.disabled = true; this.net.wqClaim(c.id); });
      row.append(info, b); return row;
    };
    list.append(el('div', 'shop-group', '📅 今日委托（简单，今天 0 点之前有效）'), card(wq.daily, ''));
    list.append(el('div', 'shop-group', '📋 本周委托（较难，下周一 0 点换新；没领的作废）'));
    const names: Record<string, string> = { mid: '【中等】', hard: '【困难】', extreme: '【极难】' };
    for (const c of wq.list) list.append(card(c, names[c.tier] ?? ''));
    this.body.append(list, el('div', 'shop-tip', `三个周委托全部领完有额外奖励：旧木箱 ×2 + 150 钓鱼经验（本周${wq.allClaimed ? '已领' : wq.allDone ? '可以领了' : '还没做完'}）。进度自动累计，不用交鱼。`));
  }

  private renderSell() {
    const day = this.day(), bonus = fishData.sellBonus, rows = sellList(this.inv, day, bonus);
    const list = el('div', 'shop-list');
    if (!rows.length) list.append(el('div', 'board-empty', '背包里没有东西可以卖。去精工湖边钓几条鱼，或者翻翻校园里的垃圾桶吧！'));
    for (const r of rows) {
      const row = el('div', 'shop-row'), info = el('div', 'shop-info');
      const mul = r.rarity === 'junk' || !fishDef(r.id) ? 1 : marketMul(day, r.id), trend = mul >= 1.1 ? '行情好 ↑' : mul <= 0.93 ? '行情差 ↓' : '';
      const name = el('div', 'shop-name', `${r.name} ×${r.n}`); name.style.color = r.rarity === 'common' || r.rarity === 'junk' ? '' : RARITY_COLORS[r.rarity];
      const sub = el('div', 'shop-note', decorDef(r.id) ? '宿舍家具 · 退货按原价的一半' : isTrashItem(r.id) ? (r.id === TREASURE_ID ? '垃圾桶里翻出来的好东西' : '垃圾桶里翻出来的') : (EXTRA_SELL[r.id] ? '盲盒、河蚌里得到的小东西' : `${RARITY_NAMES[r.rarity]}${trend ? ` · ${trend}` : ''}`));
      info.append(name, sub);
      const price = el('div', 'shop-price'); price.append(el('span', 'coin-ico'), document.createTextNode(`${r.price} / ${decorDef(r.id) ? '件' : '条'}`));
      const one = el('button', 'btn', '卖 1'), all = el('button', 'btn primary', `全卖 (${r.price * r.n})`);
      for (const b of [one, all]) b.type = 'button';
      one.addEventListener('click', () => this.net.shopSell(r.id, 1));
      all.addEventListener('click', () => this.net.shopSell(r.id, r.n));
      if (r.n >= 3) info.append(qtyPicker({
        max: r.n, value: Math.min(this.sellQty.get(r.id) ?? Math.max(1, Math.floor(r.n / 2)), r.n), onChange: (n) => this.sellQty.set(r.id, n),
        label: (n) => `卖 ${n} 件`, hint: (n) => `共 ${r.price * n} 币`, onGo: (n) => this.net.shopSell(r.id, n),
      }));
      const btns = el('div', 'shop-btns'); btns.append(one, all);
      row.append(this.icon(r.id), info, price, btns);
      list.append(row);
    }
    const bulk = el('button', 'btn', `一键卖出 杂物、垃圾 + ${BULK_RARITIES.filter((x) => x !== 'junk').map((x) => RARITY_NAMES[x]).join('、')}的鱼`); bulk.type = 'button';
    bulk.disabled = !rows.some((r) => (BULK_RARITIES as readonly string[]).includes(r.rarity));
    bulk.addEventListener('click', () => this.net.shopSellBulk());
    this.body.append(list, bulk, el('div', 'shop-tip', '提示：稀有及以上的鱼和 U 盘不会被一键卖出，想卖请手动点；鱼也可以拿去喂小猫涨好感。今日行情每天变一次。'));
  }
}
