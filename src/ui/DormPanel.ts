import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import { AC_NAMES, DORM, GLOW_COLORS, GLOW_RARITIES, bathView, isBathFish } from '@/shared/dorm';
import { fishDef, RARITY_COLORS, RARITY_NAMES } from '@/shared/fishing';
import { itemDef, type Inv } from '@/shared/items';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
export type DormData = Extract<ServerMsg, { t: 'dorm_data' }>;

/**
 * 宿舍面板：① 选/换宿舍楼栋（第一次随便选，之后每天一次）和「回宿舍」；② 宝箱（只有主人能开）：背包 ⇄ 宝箱。
 * 菜单里有两个入口：「回宿舍」（点一下就回去；还没选楼栋时弹出选楼栋）和「宿舍楼栋」。
 * 规则都在服务器（src/shared/dorm.ts），这里只显示。
 */
export class DormPanel {
  private root = el('div', 'screen hidden');
  private chestRoot = el('div', 'screen hidden');
  private bathRoot = el('div', 'screen hidden');
  private bathMsg = el('div', 'tp-msg'); private bathBody = el('div');
  private signRoot = el('div', 'screen hidden');
  private signInput = el('input');
  private ask = el('div', 'mon-enc hand-prompt hidden'); private askTimer = 0;
  private msg = el('div', 'tp-msg');
  private chestMsg = el('div', 'tp-msg');
  private body = el('div');
  private chestBody = el('div');
  private _data: DormData | null = null;
  private inv: Inv = {};
  /** 结果提示（宿舍场景用它弹横幅 / 起床） */
  onResult: (ok: boolean, msg: string, wake?: boolean) => void = () => {};
  /** 宿舍数据变了（空调开关等） */
  onData: (d: DormData) => void = () => {};

  constructor(private net: NetClient) {
    const panel = el('div', 'box tp dorm');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭宿舍面板');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '宿舍'), close);
    panel.append(head, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });

    const cp = el('div', 'box tp dorm');
    const ch = el('div', 'board-head');
    const cc = el('button', 'btn', '✕'); cc.type = 'button'; cc.setAttribute('aria-label', '关闭宝箱');
    cc.addEventListener('click', () => this.closeChest());
    ch.append(el('div', 'board-title', '宝箱（仓库）'), cc);
    cp.append(ch, el('div', 'create-sub', `只有你能打开。最多放 ${DORM.CHEST_KINDS} 种物品，每种最多 ${DORM.CHEST_STACK} 个。`), this.chestMsg, this.chestBody);
    this.chestRoot.append(cp);
    this.chestRoot.addEventListener('mousedown', (e) => { if (e.target === this.chestRoot) this.closeChest(); });

    const bp = el('div', 'box tp dorm bath');
    const bh = el('div', 'board-head');
    const bc = el('button', 'btn', '✕'); bc.type = 'button'; bc.setAttribute('aria-label', '关闭浴缸');
    bc.addEventListener('click', () => this.closeBath());
    bh.append(el('div', 'board-title', '🛁 浴缸（养鱼）'), bc);
    bp.append(bh, el('div', 'create-sub', `把钓上来的鱼放进浴缸养着：最多 ${DORM.BATH_KINDS} 种、每种 ${DORM.BATH_STACK} 条。放进去的鱼就不在背包里了，**不能卖也不能交易**（随时可以取回来）；稀有度越高、数量越多，缸里越闪，来做客的好友也看得到。`.replace(/\*\*/g, '')), this.bathMsg, this.bathBody);
    this.bathRoot.append(bp);
    this.bathRoot.addEventListener('mousedown', (e) => { if (e.target === this.bathRoot) this.closeBath(); });

    // 门牌：房主给宿舍起名字（最多 8 个字，留空 = 恢复默认）
    const sp = el('div', 'box tp dorm-sign');
    const sh = el('div', 'board-head');
    const sc = el('button', 'btn', '✕'); sc.type = 'button'; sc.setAttribute('aria-label', '关闭门牌编辑');
    sc.addEventListener('click', () => this.closeSign());
    sh.append(el('div', 'board-title', '宿舍门牌'), sc);
    this.signInput.type = 'text'; this.signInput.maxLength = DORM.TITLE_MAX + 4; this.signInput.className = 'dorm-sign-input'; this.signInput.placeholder = '给你的宿舍起个名字';
    this.signInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.saveSign(); } else if (e.key === 'Escape') this.closeSign(); });
    const sbtns = el('div', 'create-btns');
    const ssave = el('button', 'btn primary', '挂上去'); ssave.type = 'button'; ssave.addEventListener('click', () => this.saveSign());
    const sreset = el('button', 'btn', '恢复默认'); sreset.type = 'button'; sreset.addEventListener('click', () => { this.signInput.value = ''; this.saveSign(); });
    sbtns.append(sreset, ssave);
    sp.append(sh, el('div', 'create-sub', `最多 ${DORM.TITLE_MAX} 个字。来做客的好友进屋就能看到这块牌子。`), this.signInput, sbtns);
    this.signRoot.append(sp);
    this.signRoot.addEventListener('mousedown', (e) => { if (e.target === this.signRoot) this.closeSign(); });

    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (this.signOpen) this.closeSign(); else if (this.bathOpen) this.closeBath(); else if (this.chestOpen) this.closeChest(); else if (this.isOpen) this.close(); } });
    (document.getElementById('hud') ?? document.body).append(this.root, this.chestRoot, this.bathRoot, this.signRoot, this.ask);
    net.handlers.dormAsk = (uid, name, kind, title) => this.showAsk(uid, name, kind, title);

    ui.add({ id: 'dorm', label: '回宿舍', key: 'U', run: () => this.goHome() });
    ui.add({ id: 'dorm-set', label: '宿舍楼栋', run: () => this.toggle() });

    const h = net.handlers;
    h.dormData = (m) => { this._data = m; this.render(); this.renderChest(); this.renderBath(); this.onData(m); };
    h.dormResult = (ok, msg, wake) => { this.say(msg, ok); this.chestSay(msg, ok); this.bathSay(msg, ok); this.onResult(ok, msg, wake); };
    const prev = h.inv; h.inv = (items, gain) => { prev?.(items, gain); this.inv = items; this.renderChest(); this.renderBath(); };
  }

  get data() { return this._data; }
  /** 绑定的楼栋名（没绑定 = 空） */
  get building() { return this._data?.b ?? ''; }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  get chestOpen() { return !this.chestRoot.classList.contains('hidden'); }
  get signOpen() { return !this.signRoot.classList.contains('hidden'); }
  get bathOpen() { return !this.bathRoot.classList.contains('hidden'); }
  get anyOpen() { return this.isOpen || this.chestOpen || this.bathOpen || this.signOpen; }
  /** 打开门牌编辑（只有房主在自己宿舍里会走到这里） */
  openSign(current = '') { this.signInput.value = current; this.signRoot.classList.remove('hidden'); this.signInput.focus(); this.signInput.select(); }
  closeSign() { this.signInput.blur(); this.signRoot.classList.add('hidden'); }
  private saveSign() { this.net.dormTitle(this.signInput.value); this.closeSign(); }

  /** 有人邀请我去 TA 的宿舍 / 想来我的宿舍：弹一条接受/拒绝的提示条（30 秒不答复算拒绝） */
  private showAsk(uid: number, name: string, kind: 'invite' | 'knock', title?: string) {
    this.ask.replaceChildren();
    const text = el('div', 'mon-enc-text');
    text.append(el('div', 'mon-name', kind === 'invite' ? `🏠 ${name} 邀请你去 TA 的宿舍做客` : `🚪 ${name} 想来你的宿舍做客`), el('div', 'mon-sub', kind === 'invite' ? `${title ? `「${title}」· ` : ''}接受后会进到 TA 的宿舍，随时可以从门口走出来` : '接受后 TA 会进到你的宿舍（宝箱只有你能开）'));
    const ok = el('button', 'btn primary', '接受'); ok.type = 'button'; ok.addEventListener('click', () => { this.net.dormReply(uid, true); this.hideAsk(); });
    const no = el('button', 'btn', '拒绝'); no.type = 'button'; no.addEventListener('click', () => { this.net.dormReply(uid, false); this.hideAsk(); });
    const t = el('div', 'mon-enc-timer'); t.style.animationDuration = `${DORM.INVITE_MS}ms`;
    const row = el('div', 'mon-enc-row'); row.append(text, ok, no);
    this.ask.append(row, t); this.ask.classList.remove('hidden');
    window.clearTimeout(this.askTimer); this.askTimer = window.setTimeout(() => this.hideAsk(), DORM.INVITE_MS);
  }
  private hideAsk() { window.clearTimeout(this.askTimer); this.ask.classList.add('hidden'); }
  open() { this.say('', true); this.net.dormGet(); this.render(); this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  openChest() { this.chestSay('', true); this.renderChest(); this.chestRoot.classList.remove('hidden'); }
  closeChest() { this.chestRoot.classList.add('hidden'); }
  openBath() { this.bathSay('', true); this.renderBath(); this.bathRoot.classList.remove('hidden'); }
  closeBath() { this.bathRoot.classList.add('hidden'); }
  private bathSay(text: string, ok: boolean) { this.bathMsg.textContent = text; this.bathMsg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }

  /** 点「回宿舍」：绑定了就直接回去，没绑定先弹出选楼栋 */
  goHome() {
    if (this.net.status !== 'online') { this.say('没连上服务器，不能回宿舍', false); this.root.classList.remove('hidden'); return; }
    if (!this._data?.b) { this.open(); this.say('你还没有宿舍：先选一栋楼', false); return; }
    this.net.dormGo();
  }

  private say(text: string, ok: boolean) { this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }
  private chestSay(text: string, ok: boolean) { this.chestMsg.textContent = text; this.chestMsg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }

  private render() {
    const d = this._data, b = this.body;
    b.replaceChildren();
    if (!d) { b.append(el('div', 'create-sub', '读取中…')); return; }
    const cur = el('div', 'dorm-cur');
    cur.append(el('div', 'dorm-b', d.b ? `🏠 ${d.b}` : '🏠 还没有宿舍'));
    const go = el('button', 'btn dorm-go', '回宿舍'); go.type = 'button'; go.disabled = !d.b;
    go.addEventListener('click', () => { this.net.dormGo(); });
    cur.append(go);
    b.append(cur, el('div', 'create-sub', d.b
      ? `空调：${AC_NAMES[d.ac] ?? '关'}。从宿舍出来，就站在${d.b}的门口。在${d.b}门口按 E 也能进屋。`
      : '选你住的社区和楼栋：以后点「回宿舍」就回家，在这栋楼的门口按 E 也能进屋。第一次选可以随便选。'));
    if (d.b && !d.canChange) b.append(el('div', 'tp-msg bad', '今天已经改过楼栋了，明天再来吧（每天只能改一次；改楼栋不影响屋里的东西）。'));
    if (d.b) { // 资料卡展示与赞数
      const pub = el('label', 'dorm-pub'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !d.hid;
      cb.addEventListener('change', () => this.net.dormPub(cb.checked));
      pub.append(cb, el('span', undefined, ` 在资料卡上展示我的宿舍（别人点你的头像能看到宿舍，还能给你点赞）`));
      b.append(pub, el('div', 'create-sub', `❤️ 我的宿舍收到了 ${d.likes ?? 0} 个赞。`));
    }
    for (const g of d.options) {
      b.append(el('div', 'tp-group', g.group));
      const row = el('div', 'tp-row');
      for (const n of g.names) {
        const label = n === '留学生公寓' ? n : n.slice(3);
        const btn = el('button', `btn tp-btn${n === d.b ? ' on' : ''}`, label); btn.type = 'button';
        btn.disabled = n === d.b || (!!d.b && !d.canChange);
        btn.title = n;
        btn.addEventListener('click', () => { if (this.net.status !== 'online') { this.say('没连上服务器', false); return; } this.net.dormBind(n); });
        row.append(btn);
      }
      b.append(row);
    }
  }

  private renderChest() {
    const d = this._data, b = this.chestBody;
    b.replaceChildren();
    if (!d) return;
    const col = (title: string, inv: Inv, op: 'put' | 'take') => {
      const c = el('div', 'dorm-col');
      c.append(el('div', 'tp-group', `${title}（${Object.keys(inv).length}${op === 'take' ? ` / ${DORM.CHEST_KINDS}` : ''} 种）`));
      const ids = Object.keys(inv).filter((id) => itemDef(id)).sort();
      if (!ids.length) c.append(el('div', 'create-sub', op === 'put' ? '背包是空的' : '宝箱是空的'));
      for (const id of ids) {
        const def = itemDef(id)!, n = inv[id];
        const row = el('div', 'dorm-item');
        row.append(el('span', 'dorm-item-name', `${def.name} ×${n}`));
        const one = el('button', 'btn sm', op === 'put' ? '放1' : '取1'); one.type = 'button';
        one.addEventListener('click', () => this.net.dormChest(op, id, 1));
        const ten = el('button', 'btn sm', op === 'put' ? '放10' : '取10'); ten.type = 'button'; ten.disabled = n < 10;
        ten.addEventListener('click', () => this.net.dormChest(op, id, 10));
        const all = el('button', 'btn sm', op === 'put' ? '全放' : '全取'); all.type = 'button';
        all.addEventListener('click', () => this.net.dormChest(op, id, n));
        row.append(one, ten, all); c.append(row);
      }
      return c;
    };
    const wrap = el('div', 'dorm-cols');
    wrap.append(col('背包', this.inv, 'put'), col('宝箱', d.ch, 'take'));
    b.append(wrap);
  }

  /** 浴缸：背包里的鱼 ⇄ 浴缸（放进去的鱼不能卖）；上面一行是缸里现在的闪光概览 */
  private renderBath() {
    const d = this._data, b = this.bathBody;
    b.replaceChildren();
    if (!d) return;
    const bt = d.bt ?? {}, v = bathView(bt), glow = el('div', 'bath-glow');
    GLOW_RARITIES.forEach((r, i) => { if (v.r[i] > 0) { const t = el('span', 'bath-chip', `${RARITY_NAMES[r]} ×${v.r[i]}`); t.style.borderColor = GLOW_COLORS[r]; t.style.color = GLOW_COLORS[r]; glow.append(t); } });
    if (!glow.childElementCount) glow.append(el('span', 'create-sub', Object.keys(bt).length ? '缸里只有常见的鱼——放进少见、稀有、史诗、传说、神话的鱼，浴缸会发光。' : '浴缸是空的。'));
    b.append(glow);
    const col = (title: string, inv: Inv, op: 'put' | 'take') => {
      const c = el('div', 'dorm-col');
      const ids = Object.keys(inv).filter((id) => (op === 'take' ? !!itemDef(id) : isBathFish(id))).sort((x, y) => { const rx = fishDef(x)?.rarity, ry = fishDef(y)?.rarity; return (rx === ry ? 0 : (rx ?? '') < (ry ?? '') ? -1 : 1) || (x < y ? -1 : 1); });
      c.append(el('div', 'tp-group', `${title}（${ids.length}${op === 'take' ? ` / ${DORM.BATH_KINDS}` : ''} 种）`));
      if (!ids.length) c.append(el('div', 'create-sub', op === 'put' ? '背包里没有可以养的鱼' : '浴缸是空的'));
      for (const id of ids) {
        const def = itemDef(id)!, n = inv[id], fd = fishDef(id);
        const row = el('div', 'dorm-item'), nm = el('span', 'dorm-item-name', `${def.name} ×${n}`); if (fd) nm.style.color = RARITY_COLORS[fd.rarity];
        row.append(nm);
        const one = el('button', 'btn sm', op === 'put' ? '放1' : '取1'); one.type = 'button'; one.addEventListener('click', () => this.net.dormBath(op, id, 1));
        const all = el('button', 'btn sm', op === 'put' ? '全放' : '全取'); all.type = 'button'; all.addEventListener('click', () => this.net.dormBath(op, id, Math.min(n, 99)));
        row.append(one, all); c.append(row);
      }
      return c;
    };
    const wrap = el('div', 'dorm-cols');
    wrap.append(col('背包里的鱼', this.inv, 'put'), col('浴缸里的鱼', bt, 'take'));
    b.append(wrap);
  }
}
