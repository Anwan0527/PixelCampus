import type Phaser from 'phaser';
import { itemDef, invList, type Gain, type Inv } from '@/shared/items';
import { TRADE_COIN_MAX, TRADE_INVITE_TTL_MS, TRADE_MAX_ITEMS, tradable, type TradeSide } from '@/shared/trade';
import type { NetClient } from '@/net/client';
import { itemImg } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface TradeHooks {
  inv(): Inv;
  coins(): number;
  /** 提示：横幅 + 公屏 */
  note(title: string, text: string): void;
  beep(kind: 'notify' | 'done'): void;
}

/**
 * 玩家交易：在对方的学生证上点「交易」发起，对方接受后弹出这个面板。
 * 左边是我摆出的东西（从背包里挑数量、填校园币），右边是对方摆出的；任何一边改了报价，双方的确认都会作废；
 * 双方都点「确认交易」才成交，换给你的东西直接进背包。所有规则（够不够、放得下、离得远不远）都由服务器检查。
 */
export class TradePanel {
  private root = el('div', 'screen hidden');
  private body = el('div');
  private toasts = el('div');
  private tid = 0; private who = ''; private waiting = false;
  private st: { me: TradeSide; they: TradeSide } | null = null;
  /** 我正在编辑的报价（本地草稿，改完 250ms 后发给服务器） */
  private mine = new Map<string, number>(); private coin = 0;
  private sendTimer = 0; private dirty = false; private msg = ''; private ok = true;

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private hooks: TradeHooks) {
    const panel = el('div', 'box trade'); panel.append(this.body);
    this.root.append(panel);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.cancel(); });
    this.toasts.id = 'trade-toasts';
    const h = document.getElementById('hud') ?? document.body; h.append(this.root, this.toasts);
    const hd = net.handlers;
    hd.tradeInvite = (tid, _uid, name) => this.invited(tid, name);
    hd.tradeWait = (tid, name) => { this.tid = tid; this.who = name; this.waiting = true; this.st = null; this.mine.clear(); this.coin = 0; this.msg = ''; this.open(); };
    hd.tradeState = (m) => {
      const first = this.waiting || this.tid !== m.tid || !this.st;
      this.tid = m.tid; this.who = m.with.name; this.waiting = false; this.st = { me: m.me, they: m.they };
      if (first) { this.mine.clear(); this.coin = 0; }
      this.open();
    };
    hd.tradeEnd = (tid, ok, msg) => {
      this.toasts.querySelector(`[data-tid="${tid}"]`)?.remove();
      if (tid === this.tid || this.isOpen) { this.reset(); this.close(); }
      this.hooks.note(ok ? '🤝 交易' : '🤝 交易取消', msg); if (ok) this.hooks.beep('done');
    };
    hd.tradeNote = (msg) => { this.msg = msg; this.ok = false; if (this.isOpen) this.render(); else this.hooks.note('🤝 交易', msg); };
    net.onStatus(() => { if (this.net.status !== 'online') { this.reset(); this.close(); } });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 发起交易（对方的校园号）；服务器会检查距离、是否在交易中、是否屏蔽 */
  invite(uid: number) { this.net.tradeInvite(uid); }
  private reset() { this.tid = 0; this.waiting = false; this.st = null; this.mine.clear(); this.coin = 0; this.dirty = false; window.clearTimeout(this.sendTimer); }
  private open() { this.root.classList.remove('hidden'); this.render(); }
  /** 关闭时把面板里的内容一并清掉（背包大时这棵树有上千个节点，留着隐藏会拖慢成交后的第一批画面） */
  private close() { this.root.classList.add('hidden'); this.body.replaceChildren(); }
  private cancel() { if (this.tid) this.net.tradeCancel(this.tid); this.reset(); this.close(); }

  private btn(label: string, fn: () => void, primary = false, disabled = false) { const b = el('button', 'btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.disabled = disabled; b.addEventListener('click', fn); return b; }

  private invited(tid: number, name: string) {
    this.hooks.beep('notify');
    const t = el('div', 'box run-toast'); t.dataset.tid = String(tid); t.append(el('span', undefined, `🤝 ${name} 想和你交易`));
    const gone = () => t.remove();
    t.append(this.btn('接受', () => { this.net.tradeAccept(tid); gone(); }, true), this.btn('拒绝', () => { this.net.tradeCancel(tid); gone(); }));
    this.toasts.append(t); setTimeout(gone, TRADE_INVITE_TTL_MS);
  }

  /** 草稿改了：稍后把整份报价发给服务器 */
  private touched() { this.dirty = true; window.clearTimeout(this.sendTimer); this.sendTimer = window.setTimeout(() => this.flush(), 250); }
  /** 草稿有改动就发给服务器（没改动不发：重发同样的报价会让对方的确认作废） */
  private flush() { window.clearTimeout(this.sendTimer); if (!this.dirty || !this.tid) return; this.dirty = false; this.net.tradeOffer(this.tid, [...this.mine].map(([id, n]) => ({ id, n })), this.coin); }
  private setQty(id: string, n: number) {
    const max = this.hooks.inv()[id] ?? 0, v = Math.max(0, Math.min(max, n));
    if (v > 0 && !this.mine.has(id) && this.mine.size >= TRADE_MAX_ITEMS) { this.msg = `一次最多摆 ${TRADE_MAX_ITEMS} 种东西`; this.ok = false; this.render(); return; }
    if (v > 0) this.mine.set(id, v); else this.mine.delete(id);
    this.msg = ''; this.touched(); this.render();
  }

  private offerView(side: TradeSide, title: string, mineSide: boolean) {
    const col = el('div', 'trade-col' + (side.ready ? ' ready' : ''));
    col.append(el('div', 'trade-col-h', `${title}${side.ready ? ' ✔ 已确认' : ''}`));
    const list = el('div', 'trade-offer');
    const items: Gain[] = mineSide ? [...this.mine].map(([id, n]) => ({ id, n })) : side.items;
    const coins = mineSide ? this.coin : side.coins;
    if (!items.length && !coins) list.append(el('div', 'board-empty', mineSide ? '还没有摆出东西' : '对方还没有摆出东西'));
    for (const g of items) {
      const row = el('div', 'trade-item'), c = itemImg(this.textures, g.id, 2, 'shop-ico');
      row.append(c, el('div', 'trade-name', `${itemDef(g.id)?.name ?? g.id} ×${g.n}`)); list.append(row);
    }
    if (coins) { const row = el('div', 'trade-item'); row.append(el('span', 'coin-ico'), el('div', 'trade-name', `${coins} 校园币`)); list.append(row); }
    col.append(list); return col;
  }

  private render() {
    this.body.replaceChildren();
    const head = el('div', 'board-head');
    head.append(el('div', 'board-title', `🤝 和 ${this.who} 交易`), this.btn('✕', () => this.cancel()));
    this.body.append(head);
    if (this.waiting || !this.st) { this.body.append(el('div', 'board-empty', `已邀请 ${this.who}，等对方接受…（${Math.round(TRADE_INVITE_TTL_MS / 1000)} 秒内有效）`), this.btn('取消', () => this.cancel())); return; }
    const st = this.st;
    this.body.append(el('div', 'create-sub', '双方都点「确认交易」才会成交；任何一方改了报价，确认都会作废。成交不收税。'));
    if (this.msg) this.body.append(el('div', 'board-msg' + (this.ok ? '' : ' bad'), this.msg));
    const cols = el('div', 'trade-cols');
    cols.append(this.offerView(st.me, '我摆出', true), this.offerView(st.they, `${this.who} 摆出`, false));
    this.body.append(cols);
    // 我的背包：选要摆出去的东西
    this.body.append(el('div', 'run-sub', '从背包里选（点 + / −）'));
    const bag = el('div', 'trade-bag'), inv = this.hooks.inv();
    for (const { def, n } of invList(inv)) {
      if (!tradable(def.id)) continue;
      const row = el('div', 'trade-bagrow'), c = itemImg(this.textures, def.id, 2, 'shop-ico');
      const q = this.mine.get(def.id) ?? 0;
      row.append(c, el('div', 'trade-name', `${def.name}（有 ${n}）`), this.btn('−10', () => this.setQty(def.id, q - 10), false, q <= 0), this.btn('−', () => this.setQty(def.id, q - 1), false, q <= 0), el('span', 'trade-q', String(q)), this.btn('+', () => this.setQty(def.id, q + 1), false, q >= n), this.btn('+10', () => this.setQty(def.id, q + 10), false, q >= n), this.btn('全部', () => this.setQty(def.id, n), false, q >= n));
      bag.append(row);
    }
    if (!bag.children.length) bag.append(el('div', 'board-empty', '背包里没有可以交易的东西。'));
    this.body.append(bag);
    const coinRow = el('div', 'trade-coin'), inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.max = String(Math.min(TRADE_COIN_MAX, this.hooks.coins())); inp.value = String(this.coin);
    inp.addEventListener('change', () => { this.coin = Math.max(0, Math.min(TRADE_COIN_MAX, this.hooks.coins(), Math.floor(Number(inp.value) || 0))); this.msg = ''; this.touched(); this.render(); });
    coinRow.append(el('span', 'coin-ico'), el('span', undefined, `校园币（你有 ${this.hooks.coins()}，最多 ${TRADE_COIN_MAX}）`), inp);
    this.body.append(coinRow);
    const row = el('div', 'create-btns');
    row.append(this.btn(st.me.ready ? '取消确认' : '确认交易', () => { this.flush(); this.net.tradeReady(this.tid, !st.me.ready); }, !st.me.ready), this.btn('取消交易', () => this.cancel()));
    this.body.append(row);
  }
}
