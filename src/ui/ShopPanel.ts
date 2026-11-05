import type Phaser from 'phaser';
import { COIN_NAME, BULK_RARITIES, SHOP, marketMul, sellList, EXTRA_SELL, type ShopItem } from '@/shared/economy';
import { JUNK_GROUP, RARE_GROUP, RECIPES, SMALL_GROUP, craftWhy, isNamedFish, type Recipe } from '@/shared/craft';
import { RARITY_COLORS, RARITY_NAMES, fishDef } from '@/shared/fishing';
import { TREASURE_ID, isTrashItem } from '@/shared/trash';
import { itemDef, type Inv } from '@/shared/items';
import type { NetClient } from '@/net/client';
import { drawItem } from './sprites';

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
  private tabs: HTMLButtonElement[] = [];
  private tab: 'buy' | 'sell' | 'craft' = 'sell';
  private craftParam = '';
  private coins = 0; private inv: Inv = {};

  /** day() 返回今天的日期编号（东八区，和服务器一致），用来算今日行情 */
  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private day: () => number) {
    const panel = el('div', 'box shop');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭商店');
    close.addEventListener('click', () => this.close());
    const wallet = el('div', 'shop-wallet'); wallet.append(el('span', 'coin-ico'), this.coinEl, el('span', 'shop-unit', COIN_NAME));
    head.append(el('div', 'board-title', '校园商店'), wallet, close);
    const tabRow = el('div', 'seg-row');
    ([['sell', '卖鱼'], ['buy', '买东西'], ['craft', '合成']] as const).forEach(([k, name], idx) => {
      const b = el('button', 'seg' + (k === this.tab ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.tabs.forEach((t, i) => t.classList.toggle('on', i === idx)); this.render(); });
      this.tabs.push(b); tabRow.append(b);
    });
    panel.append(head, el('div', 'create-sub', '钓上来的鱼、翻垃圾桶翻出来的东西都可以在这里卖钱；赚到的校园币能买鱼饵、猫粮、猫条、猫窝和更好的鱼竿。'), tabRow, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.handlers.shopResult = (ok, text) => this.say(text, ok);
    net.handlers.craftResult = (ok, text) => this.say(text, ok);
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); this.msg.textContent = ''; this.net.getInv(); this.net.getCoins(); this.render(); }
  close() { this.root.classList.add('hidden'); }
  setCoins(n: number) { this.coins = n; this.coinEl.textContent = String(n); if (this.isOpen) this.render(); }
  setInv(inv: Inv) { this.inv = inv; if (this.isOpen) this.render(); }
  private say(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }

  private icon(id: string) { const c = el('canvas', 'shop-ico'); drawItem(c, this.textures, id, 3); return c; }
  private render() {
    this.body.replaceChildren();
    const online = this.net.status === 'online';
    if (!online) this.body.append(el('div', 'board-empty', '没连上服务器，现在不能买卖。'));
    else if (this.tab === 'buy') this.renderBuy(); else if (this.tab === 'craft') this.renderCraft(); else this.renderSell();
  }

  private renderBuy() {
    const list = el('div', 'shop-list');
    const group = (id: string) => (id.startsWith('rod_') || id === 'fishing_rod' ? '🎣 鱼竿' : id.startsWith('tk_') ? '🧷 鱼竿配件（不消耗，要装在带配件槽的鱼竿上）' : id.startsWith('bait') ? '🪱 鱼饵' : '🐱 其他');
    let last = '';
    for (const s of [...SHOP].sort((a, b) => ['🪱 鱼饵', '🎣 鱼竿', '🧷 鱼竿配件（不消耗，要装在带配件槽的鱼竿上）', '🐱 其他'].indexOf(group(a.id)) - ['🪱 鱼饵', '🎣 鱼竿', '🧷 鱼竿配件（不消耗，要装在带配件槽的鱼竿上）', '🐱 其他'].indexOf(group(b.id)))) {
      const g = group(s.id); if (g !== last) { list.append(el('div', 'shop-group', g)); last = g; }
      list.append(this.buyRow(s));
    }
    this.body.append(list, el('div', 'shop-tip', '万能饵、指名饵、神话饵、龙骨竿、寒江竿、并蒂竿不在商店卖：要靠合成或钓鱼时的盲盒。'));
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
      info.append(el('div', 'shop-name', `${out.name}${r.out.n > 1 ? ` ×${r.out.n}` : ''}`), el('div', 'shop-note', r.desc), el('div', 'shop-have', `材料：${need(r)}`));
      if (r.needs.some((n) => 'group' in n && n.group === 'same')) {
        const sel = el('select'); sel.setAttribute('aria-label', '选一种鱼'); sel.append(new Option('选一种鱼（背包里有 3 条以上的）', ''));
        for (const [id, n] of Object.entries(inv)) if (isNamedFish(id) && n >= 3) sel.append(new Option(`${fishDef(id)?.name} ×${n}`, id));
        sel.value = this.craftParam && (inv[this.craftParam] ?? 0) >= 3 ? this.craftParam : '';
        sel.addEventListener('change', () => { this.craftParam = sel.value; this.render(); });
        info.append(sel);
      }
      const why = craftWhy(inv, this.coins, r, this.craftParam || undefined);
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
    row.append(this.icon(s.id), info, price, b);
    return row;
  }

  private renderSell() {
    const day = this.day(), rows = sellList(this.inv, day);
    const list = el('div', 'shop-list');
    if (!rows.length) list.append(el('div', 'board-empty', '背包里没有东西可以卖。去精工湖边钓几条鱼，或者翻翻校园里的垃圾桶吧！'));
    for (const r of rows) {
      const row = el('div', 'shop-row'), info = el('div', 'shop-info');
      const mul = r.rarity === 'junk' || !fishDef(r.id) ? 1 : marketMul(day, r.id), trend = mul >= 1.1 ? '行情好 ↑' : mul <= 0.93 ? '行情差 ↓' : '';
      const name = el('div', 'shop-name', `${r.name} ×${r.n}`); name.style.color = r.rarity === 'common' || r.rarity === 'junk' ? '' : RARITY_COLORS[r.rarity];
      const sub = el('div', 'shop-note', isTrashItem(r.id) ? (r.id === TREASURE_ID ? '垃圾桶里翻出来的好东西' : '垃圾桶里翻出来的') : (EXTRA_SELL[r.id] ? '盲盒、河蚌里得到的小东西' : `${RARITY_NAMES[r.rarity]}${trend ? ` · ${trend}` : ''}`));
      info.append(name, sub);
      const price = el('div', 'shop-price'); price.append(el('span', 'coin-ico'), document.createTextNode(`${r.price} / 条`));
      const one = el('button', 'btn', '卖 1'), all = el('button', 'btn primary', `全卖 (${r.price * r.n})`);
      for (const b of [one, all]) b.type = 'button';
      one.addEventListener('click', () => this.net.shopSell(r.id, 1));
      all.addEventListener('click', () => this.net.shopSell(r.id, r.n));
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
