import type Phaser from 'phaser';
import { DM_MAX, NOTE_MAX, type DmMsg, type FriendInfo, type PersonInfo } from '@/shared/social';
import type { PublicProfile } from '@/shared/protocol';
import type { NetClient } from '@/net/client';
import { StudentCard } from './StudentCard';
import { locText, type FriendLoc } from '@/shared/where';
import { drawPortrait, PORTRAIT_HEAD } from './sprites';
import { ui } from './actions';
import { askReport } from './ReportDialog';
import { DormPeek } from './DormPeek';
import type { DormCard } from '@/shared/dorm';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const full = (ts: number) => `${ymd(ts)} ${hm(ts)}`;
const ago = (ts: number) => { const s = (Date.now() - ts) / 1000; return s < 90 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`; };
type Tab = 'friends' | 'requests' | 'add' | 'blocked';
type Relation = 'none' | 'self' | 'friend' | 'sent' | 'incoming' | 'blocked';

/**
 * 社交界面：好友列表 / 好友申请 / 按校园号添加 / 屏蔽名单 / 私聊会话，以及"点玩家看资料"的弹窗。
 * 所有玩家写的文字都用 textContent，不会被当成网页代码。私聊记录保存在服务器上，界面里有说明。
 */
export class SocialUi {
  /** 点「交易」：由场景接到交易面板 */
  onTrade?: (uid: number) => void;
  private root = el('div', 'screen hidden');
  private panel = el('div', 'box friends');
  private body = el('div', 'friends-body');
  private tabs = el('div', 'seg-row friends-tabs');
  private msgLine = el('div', 'board-msg');
  private pop = el('div', 'screen hidden');

  private friends: FriendInfo[] = [];
  private incoming: PersonInfo[] = [];
  private blocked: PersonInfo[] = [];
  private tab: Tab = 'friends';
  private conv: { uid: number; items: DmMsg[]; more: boolean } | null = null;
  private convList = el('div', 'dm-list');
  /** 每个会话没发出去的草稿（别的事件触发重绘时不能把正在打的字弄丢）、输入法组字中、会话标题的签名（名字/备注/在线点变了才需要重绘）、最后一条消息的日期 */
  private drafts = new Map<number, string>(); private composing = false; private pendingRender = false; private convSig = ''; private convLastDay = '';
  private lookup: { uid: number; info: PersonInfo | null; relation: Relation } | null = null;
  private popUid = 0; private popPub?: PublicProfile; private popDorm?: DormCard; private peek?: DormPeek;
  private addInput = el('input');
  /** 在线好友的大致位置（服务器每 8 秒推一次）；我是不是对好友隐藏了自己的位置 */
  private locs = new Map<number, FriendLoc>();
  private hideMe = false;

  /** note：别人给我的提示（申请 / 通过 / 新私聊），由场景显示在横幅与公屏里 */
  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private note: (text: string) => void) {
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭好友'); close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '好友'), close);
    this.panel.append(head, this.tabs, this.msgLine, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    this.pop.addEventListener('mousedown', (e) => { if (e.target === this.pop) this.closePlayer(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!this.pop.classList.contains('hidden')) this.closePlayer(); else if (this.isOpen) this.close(); } });
    const hud = document.getElementById('hud') ?? document.body;
    hud.append(this.root, this.pop);

    ui.add({ id: 'friends', label: '好友', key: 'F', run: () => this.toggle() });
    const h = net.handlers;
    h.social = (f, i, b) => { this.friends = f; this.incoming = i; this.blocked = b; this.updateBadge(); if (!this.conv || this.convSigOf() !== this.convSig) this.render(); this.refreshPopup(); }; // 在私聊里：只有标题变了才重绘，别打断正在打字
    h.presence = (uid, online) => { const f = this.friends.find((x) => x.uid === uid); if (f) { f.online = online; if (!online) f.seen = Date.now(); if (!this.conv || (this.conv.uid === uid && this.convSigOf() !== this.convSig)) this.render(); } };
    h.locs = (items, hidden) => { this.locs = new Map(items.map((i) => [i.uid, i])); this.hideMe = hidden; if (this.isOpen && !this.conv && this.tab === 'friends') this.render(); this.onLocs?.(); };
    h.dm = (m) => this.onDm(m);
    h.dmHistory = (uid, items, more) => this.onHistory(uid, items, more);
    h.socialResult = (ok, text) => { this.setMsg(text, ok); if (!this.isOpen) this.note(text); this.net.getSocial(); if (this.popUid) this.net.whois(this.popUid); };
    h.socialNote = (text) => { this.note(text); this.net.getSocial(); };
    h.whois = (uid, info, relation, dorm) => this.onWhois(uid, info, relation, dorm);
    h.dormLikes = (uid, n, liked, msg) => { if (uid === this.popUid && this.popDorm) { this.popDorm.likes = n; this.popDorm.liked = liked; this.peek?.set(n, liked, msg ?? ''); } }; // 点赞结果：数字和红心更新，失败的原因写在下面
    net.onStatus(() => { if (this.isOpen && !this.conv) this.render(); }); // 在线人数一变就会触发：私聊里不重绘（以前这里会把输入框里刚打的字清掉）
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden') || !this.pop.classList.contains('hidden'); }
  /** 好友列表（含在线状态）：校园跑邀请好友时用 */
  get friendList(): readonly FriendInfo[] { return this.friends; }
  isFriend(uid: number) { return this.friends.some((f) => f.uid === uid); }
  /** 点「牵手」时（场景设置）：邀请这位好友手拉手 */
  onHand: ((uid: number) => void) | null = null;
  /** 点「邀请来宿舍 / 去做客」时（场景设置） */
  onDorm: ((uid: number, kind: 'invite' | 'knock') => void) | null = null;
  /** 点「一起玩」时（场景设置）：打开世界面板，对这位好友邀请 / 申请加入 */
  onWorld: ((uid: number) => void) | null = null;
  /** 好友位置更新了（世界面板要跟着刷新「TA 在哪个世界」） */
  onLocs: (() => void) | null = null;
  locOf(uid: number): FriendLoc | undefined { return this.locs.get(uid); }
  /** 好友的显示名：写了备注就是「备注（昵称）」，方便分辨；没写就是昵称 */
  static label(f: Pick<FriendInfo, 'name' | 'note'>) { return f.note ? `${f.note}（${f.name}）` : f.name; }
  private labelOf(uid: number, fallback = String(uid)) { const f = this.friends.find((x) => x.uid === uid); return f ? SocialUi.label(f) : fallback; }
  /** 给好友写备注（只有自己看得到；留空 = 清除） */
  editNote(uid: number) {
    const f = this.friends.find((x) => x.uid === uid); if (!f) return;
    const v = window.prompt(`给「${f.name}」写个备注（最多 ${NOTE_MAX} 个字，只有你自己看得到；留空 = 清除）`, f.note ?? '');
    if (v === null) return;
    this.net.friendNote(uid, v.trim());
  }
  open(tab: Tab = 'friends') { this.root.classList.remove('hidden'); this.conv = null; this.tab = tab; this.msgLine.textContent = ''; this.net.getSocial(); this.render(); }
  close() { this.root.classList.add('hidden'); this.pop.classList.add('hidden'); this.popUid = 0; this.conv = null; }
  toggle() { this.root.classList.contains('hidden') ? this.open() : this.close(); }
  private updateBadge() { ui.badge('friends', this.incoming.length + this.friends.reduce((s, f) => s + f.unread, 0)); }
  private setMsg(t: string, ok: boolean) { this.msgLine.textContent = t; this.msgLine.classList.toggle('bad', !ok); }

  // ------------------------------------------------------------ 渲染
  private avatar(look: number, app?: number[]) { const c = el('canvas'); drawPortrait(c, this.textures, look, { scale: 1, crop: PORTRAIT_HEAD, app }); const w = el('div', 'chip-avatar'); w.append(c); return w; }

  /**
   * 重绘整个好友窗口。重绘会重建输入框，所以：输入法组字中先不绘（组字结束再补）；
   * 重绘前记下正在输入的框（私聊输入框 / 添加好友框）的焦点和光标，重绘后放回去（文字由草稿 / 持久的输入框保管）。
   */
  private render() {
    if (this.composing) { this.pendingRender = true; return; }
    const act = document.activeElement as HTMLInputElement | null;
    const typing = act && act.tagName === 'INPUT' && this.root.contains(act) ? { dm: act.classList.contains('dm-input'), add: act === this.addInput, s: act.selectionStart, e: act.selectionEnd } : null;
    this.renderNow();
    if (!typing || this.root.classList.contains('hidden')) return;
    const target = typing.dm ? this.body.querySelector<HTMLInputElement>('.dm-input') : typing.add ? this.addInput : null;
    if (target && target.isConnected) { target.focus(); try { target.setSelectionRange(typing.s ?? target.value.length, typing.e ?? target.value.length); } catch { /* 有的输入类型不支持 */ } }
  }
  private convSigOf() { const f = this.conv && this.friends.find((x) => x.uid === this.conv!.uid); return f ? `${SocialUi.label(f)}|${f.online}` : ''; }
  private renderNow() {
    this.tabs.replaceChildren(); this.body.replaceChildren();
    if (this.net.status !== 'online') { this.tabs.classList.add('hidden'); this.body.append(el('div', 'board-empty', '没连上服务器，连上后才能用好友和私聊。')); return; }
    this.tabs.classList.remove('hidden');
    if (this.conv) { this.tabs.classList.add('hidden'); this.renderConv(); return; }
    const defs: [Tab, string][] = [['friends', `好友 ${this.friends.length}`], ['requests', `申请${this.incoming.length ? ` (${this.incoming.length})` : ''}`], ['add', '添加'], ['blocked', '屏蔽']];
    for (const [t, label] of defs) { const b = el('button', 'seg' + (t === this.tab ? ' on' : ''), label); b.type = 'button'; b.addEventListener('click', () => { this.tab = t; this.msgLine.textContent = ''; this.render(); }); this.tabs.append(b); }
    // 校园号 + 复制 + 「对好友隐藏位置」放在同一行（矮屏幕里省一行，列表才放得下）
    const me = el('div', 'friends-me');
    const mine = el('span', 'friends-me-id'); mine.append(document.createTextNode(`我的校园号：${this.net.selfUid || '…'} `));
    const cp = el('button', 'btn', '复制'); cp.type = 'button'; cp.addEventListener('click', () => { void navigator.clipboard?.writeText(String(this.net.selfUid)).then(() => this.setMsg('校园号已复制，发给同学就能加你', true), () => this.setMsg('复制失败，请手动记下校园号', false)); });
    mine.append(cp);
    const hide = el('label', 'friends-hide'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = this.hideMe;
    cb.addEventListener('change', () => this.net.hideLoc(cb.checked));
    hide.append(cb, document.createTextNode(' 对好友隐藏我的位置'));
    me.append(mine, hide); this.body.append(me);
    if (this.tab === 'friends') this.renderFriends(); else if (this.tab === 'requests') this.renderRequests(); else if (this.tab === 'add') this.renderAdd(); else this.renderBlocked();
  }

  private renderFriends() {
    if (!this.friends.length) { this.body.append(el('div', 'board-empty', '还没有好友。点别人的角色或公屏里的名字，或到「添加」里输入对方的校园号。')); return; }
    const list = el('div', 'friends-list');
    for (const f of this.friends) {
      const row = el('div', 'friend-row'); row.addEventListener('click', () => this.openChat(f.uid));
      const mid = el('div', 'friend-mid');
      const nm = el('div', 'friend-name'); nm.append(el('span', f.online ? 'dot on' : 'dot'), document.createTextNode(SocialUi.label(f)));
      mid.append(nm);
      const loc = f.online ? locText(this.locs.get(f.uid)) : '';
      if (loc) mid.append(el('div', 'friend-loc', `📍 ${loc}`));
      mid.append(el('div', 'friend-sub', f.last ? `${f.last.mine ? '我：' : ''}${f.last.text}` : f.online ? '在线' : `${ago(f.seen)}在线`));
      const more = el('button', 'friend-more', '⋯'); more.type = 'button'; more.title = '更多操作：备注、一起玩、牵手、邀请来宿舍、删除、屏蔽、举报……'; more.setAttribute('aria-label', `对 ${f.name} 的更多操作`);
      more.addEventListener('click', (e) => { e.stopPropagation(); this.showPlayer(f.uid); });
      row.append(this.avatar(f.look, f.app), mid);
      if (f.unread > 0) row.append(el('span', 'badge', f.unread > 99 ? '99+' : String(f.unread)));
      row.append(more);
      list.append(row);
    }
    this.body.append(list);
  }

  private renderRequests() {
    if (!this.incoming.length) { this.body.append(el('div', 'board-empty', '没有待处理的好友申请。')); return; }
    const list = el('div', 'friends-list');
    for (const p of this.incoming) {
      const row = el('div', 'friend-row static');
      const mid = el('div', 'friend-mid'); mid.append(el('div', 'friend-name', p.name), el('div', 'friend-sub', `${p.college} · ${p.major} · 校园号 ${p.uid}`));
      const ok = el('button', 'btn primary', '通过'); ok.type = 'button'; ok.addEventListener('click', () => this.net.friendAccept(p.uid));
      const no = el('button', 'btn', '拒绝'); no.type = 'button'; no.addEventListener('click', () => this.net.friendDecline(p.uid));
      row.append(this.avatar(p.look, p.app), mid, ok, no); list.append(row);
    }
    this.body.append(list);
  }

  private renderBlocked() {
    if (!this.blocked.length) { this.body.append(el('div', 'board-empty', '没有屏蔽任何人。')); return; }
    const list = el('div', 'friends-list');
    for (const p of this.blocked) {
      const row = el('div', 'friend-row static');
      const mid = el('div', 'friend-mid'); mid.append(el('div', 'friend-name', p.name), el('div', 'friend-sub', `校园号 ${p.uid}`));
      const un = el('button', 'btn', '解除屏蔽'); un.type = 'button'; un.addEventListener('click', () => this.net.unblock(p.uid));
      row.append(this.avatar(p.look, p.app), mid, un); list.append(row);
    }
    this.body.append(list);
  }

  private renderAdd() {
    const row = el('div', 'friends-add');
    this.addInput.type = 'text'; this.addInput.inputMode = 'numeric'; this.addInput.maxLength = 9; this.addInput.placeholder = '输入对方的校园号'; this.addInput.autocomplete = 'off';
    const go = el('button', 'btn primary', '查找'); go.type = 'button';
    const find = () => { const u = Number(this.addInput.value.trim()); if (!Number.isInteger(u) || u < 10001) { this.setMsg('请输入正确的校园号（5 位以上的数字）', false); return; } this.net.whois(u); };
    go.addEventListener('click', find); this.addInput.onkeydown = null; if (!this.addInput.dataset.ime) { this.addInput.dataset.ime = '1'; this.addInput.addEventListener('compositionstart', () => { this.composing = true; }); this.addInput.addEventListener('compositionend', () => { this.composing = false; if (this.pendingRender) { this.pendingRender = false; this.render(); } }); } this.addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
    row.append(this.addInput, go); this.body.append(row);
    if (this.lookup) this.body.append(this.lookupCard(this.lookup.info, this.lookup.relation, this.lookup.uid));
  }

  /**
   * 查到的人 + 按关系给出的操作按钮（"添加"页和"点玩家"弹窗共用）。
   * 好友的按钮多，分三组摆：常用（私聊 / 一起玩 / 牵手 / 交易）、宿舍（只对在线好友）、管理（备注 / 删除 / 屏蔽 / 举报）；别的关系按钮少，一排就够。
   */
  private actions(uid: number, relation: Relation, name: string): HTMLElement {
    const bar = el('div', 'friend-sheet');
    const group = (title?: string) => { const g = el('div', 'friend-group'); if (title) g.append(el('div', 'friend-group-t', title)); const row = el('div', 'friend-actions'); g.append(row); bar.append(g); return row; };
    const b = (row: HTMLElement, label: string, fn: () => void, primary = false, tip?: string) => { const x = el('button', 'btn' + (primary ? ' primary' : ''), label); x.type = 'button'; if (tip) x.title = tip; x.addEventListener('click', fn); row.append(x); };
    const f = this.friends.find((x) => x.uid === uid), online = !!f?.online;
    const trade = relation !== 'self' && relation !== 'blocked' && !!this.onTrade; // 面对面交易：对方要在附近（服务器检查距离）
    const report = () => askReport({ kind: 'user', ref: uid, preview: `${name}（昵称、签名等资料）` }); // 昵称 / 签名不合适
    if (relation === 'friend') {
      const main = group(online ? '常用' : '常用（TA 现在不在线，一起玩 / 牵手 / 宿舍要等 TA 上线）');
      b(main, '私聊', () => { this.closePlayer(); this.root.classList.remove('hidden'); this.openChat(uid); }, true);
      if (online && this.onWorld) b(main, '一起玩', () => { this.closePlayer(); this.onWorld?.(uid); }, false, '邀请 TA 进我的好友世界，或申请加入 TA 的世界');
      if (online && this.onHand) b(main, '牵手', () => { this.closePlayer(); this.onHand?.(uid); }, false, '邀请 TA 手拉手一起走');
      if (trade) b(main, '交易', () => { this.closePlayer(); this.onTrade?.(uid); });
      if (online && this.onDorm) {
        const dorm = group('宿舍');
        b(dorm, '邀请来宿舍', () => { this.closePlayer(); this.onDorm?.(uid, 'invite'); }, false, '邀请 TA 来我的宿舍做客（你得先在自己的宿舍里）');
        b(dorm, '去做客', () => { this.closePlayer(); this.onDorm?.(uid, 'knock'); }, false, '去 TA 的宿舍做客（TA 得在宿舍里，要 TA 同意）');
      }
      const manage = group('管理');
      b(manage, '备注', () => { this.closePlayer(); this.root.classList.remove('hidden'); this.editNote(uid); }, false, '给好友写备注（只有你自己看得到）');
      b(manage, '删除好友', () => { if (confirm(`删除好友 ${name}？`)) this.net.friendRemove(uid); });
      b(manage, '屏蔽', () => { if (confirm(`屏蔽 ${name}？会同时解除好友，对方也无法再联系你。`)) this.net.block(uid); });
      b(manage, '举报', report);
      return bar;
    }
    const row = group();
    if (relation === 'self') row.append(el('span', 'friend-sub', '这是你自己'));
    else if (relation === 'sent') row.append(el('span', 'friend-sub', '好友申请已发送，等对方通过'));
    else if (relation === 'incoming') { b(row, '通过申请', () => this.net.friendAccept(uid), true); b(row, '拒绝', () => this.net.friendDecline(uid)); }
    else if (relation === 'blocked') b(row, '解除屏蔽', () => this.net.unblock(uid));
    else { b(row, '加好友', () => this.net.friendReq(uid), true); b(row, '屏蔽', () => { if (confirm(`屏蔽 ${name}？`)) this.net.block(uid); }); }
    if (trade) b(row, '交易', () => { this.closePlayer(); this.onTrade?.(uid); });
    if (relation !== 'self') b(row, '举报', report);
    return bar;
  }
  private lookupCard(info: PersonInfo | null, relation: Relation, uid: number): HTMLElement {
    const box = el('div', 'friend-result');
    if (!info) { box.append(el('div', 'board-empty', `找不到校园号 ${uid}`)); return box; }
    const top = el('div', 'friend-row static'); const mid = el('div', 'friend-mid');
    mid.append(el('div', 'friend-name', info.name), el('div', 'friend-sub', `${info.college} · ${info.major} · 校园号 ${info.uid}`));
    top.append(this.avatar(info.look, info.app), mid); box.append(top, this.actions(uid, relation, info.name));
    return box;
  }

  // ------------------------------------------------------------ 私聊会话
  openChat(uid: number) {
    this.root.classList.remove('hidden');
    this.conv = { uid, items: [], more: false };
    this.net.dmHistory(uid);
    const f = this.friends.find((x) => x.uid === uid); if (f) { f.unread = 0; this.updateBadge(); }
    this.net.dmRead(uid);
    this.render();
  }
  private onHistory(uid: number, items: DmMsg[], more: boolean) {
    if (!this.conv || this.conv.uid !== uid) return;
    const first = this.conv.items.length === 0;
    this.conv.items = [...items, ...this.conv.items.filter((m) => !items.some((x) => x.id === m.id))]; this.conv.more = more;
    this.net.dmRead(uid);
    this.render();
    if (first) this.convList.scrollTop = this.convList.scrollHeight;
  }
  private onDm(m: DmMsg) {
    const me = this.net.selfUid, peer = m.from === me ? m.to : m.from;
    const f = this.friends.find((x) => x.uid === peer);
    const watching = this.conv?.uid === peer && !this.root.classList.contains('hidden');
    if (f) { f.last = { text: m.text, ts: m.ts, mine: m.from === me }; if (m.from !== me && !watching) f.unread++; }
    if (this.conv?.uid === peer) {
      if (!this.conv.items.some((x) => x.id === m.id)) this.conv.items.push(m);
      if (watching) { if (m.from !== me) this.net.dmRead(peer); this.appendBubble(m); } // 只往下追加一条气泡，不重绘（重绘会清掉正在打的字）
    } else if (this.isOpen) this.render();
    if (m.from !== me && !watching) this.note(`💬 ${f ? SocialUi.label(f) : peer}：${m.text.length > 30 ? `${m.text.slice(0, 30)}…` : m.text}`);
    this.updateBadge();
  }

  /** 对方发来的消息旁边的小 ⚑：举报这一条（管理员只会拿到这一条和前面几条，不是整段聊天） */
  private dmReport(m: DmMsg): HTMLElement {
    const b = el('button', 'dm-rep', '⚑'); b.type = 'button'; b.title = '举报这条消息'; b.setAttribute('aria-label', '举报这条消息');
    b.addEventListener('click', () => askReport({ kind: 'dm', ref: m.id, preview: m.text }));
    return b;
  }

  /** 往当前会话末尾加一条气泡（不重绘整个窗口） */
  private appendBubble(m: DmMsg) {
    this.convList.querySelector('.board-empty')?.remove();
    const d = ymd(m.ts); if (d !== this.convLastDay) { this.convLastDay = d; this.convList.append(el('div', 'dm-day', d)); }
    const row = el('div', 'dm-row ' + (m.from === this.net.selfUid ? 'me' : 'them'));
    row.append(el('div', 'dm-bubble', m.text), el('div', 'dm-time', hm(m.ts))); if (m.from !== this.net.selfUid) row.append(this.dmReport(m)); this.convList.append(row);
    this.convList.scrollTop = this.convList.scrollHeight;
  }

  private renderConv() {
    const c = this.conv!, f = this.friends.find((x) => x.uid === c.uid);
    const name = f ? SocialUi.label(f) : String(c.uid);
    const head = el('div', 'conv-head');
    const back = el('button', 'btn', '← 返回'); back.type = 'button'; back.addEventListener('click', () => { this.conv = null; this.net.getSocial(); this.render(); });
    const title = el('div', 'conv-title'); title.append(el('span', f?.online ? 'dot on' : 'dot'), document.createTextNode(name));
    const exp = el('button', 'btn', '导出'); exp.type = 'button'; exp.title = '把已加载的聊天记录保存成文本文件'; exp.addEventListener('click', () => this.exportChat(name));
    const more = el('button', 'btn', '⋯'); more.type = 'button'; more.title = '更多'; more.addEventListener('click', () => { this.root.classList.remove('hidden'); this.showPlayer(c.uid); });
    head.append(back, title, exp, more);
    this.convList = el('div', 'dm-list');
    if (c.more) { const lm = el('button', 'btn dm-more', '加载更早的记录'); lm.type = 'button'; lm.addEventListener('click', () => this.net.dmHistory(c.uid, c.items[0]?.id)); this.convList.append(lm); }
    if (!c.items.length) this.convList.append(el('div', 'board-empty', '还没有聊过，说点什么吧。'));
    let lastDay = '';
    for (const m of c.items) {
      const d = ymd(m.ts); if (d !== lastDay) { lastDay = d; this.convLastDay = d; this.convList.append(el('div', 'dm-day', d)); }
      const row = el('div', 'dm-row ' + (m.from === this.net.selfUid ? 'me' : 'them'));
      const bub = el('div', 'dm-bubble', m.text); row.append(bub, el('div', 'dm-time', hm(m.ts))); if (m.from !== this.net.selfUid) row.append(this.dmReport(m)); this.convList.append(row);
    }
    const input = el('input', 'dm-input'); input.type = 'text'; input.maxLength = DM_MAX + 20; input.placeholder = '说点什么…'; input.autocomplete = 'off'; input.spellcheck = false;
    input.value = this.drafts.get(c.uid) ?? ''; // 没发出去的草稿放回来
    input.addEventListener('input', () => { if (input.value) this.drafts.set(c.uid, input.value); else this.drafts.delete(c.uid); });
    input.addEventListener('compositionstart', () => { this.composing = true; });
    input.addEventListener('compositionend', () => { this.composing = false; if (this.pendingRender) { this.pendingRender = false; this.render(); } });
    const send = el('button', 'btn primary', '发送'); send.type = 'button';
    const go = () => { const t = input.value.trim(); if (!t) return; this.net.dm(c.uid, t); input.value = ''; this.drafts.delete(c.uid); };
    send.addEventListener('click', go); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const row = el('div', 'conv-input'); row.append(input, send);
    this.body.append(head, this.convList, row, el('div', 'conv-note', '🔒 私聊只有你们两人能看到；聊天记录保存在服务器上，服务器管理员可以查看。'));
    this.convSig = this.convSigOf();
    this.convList.scrollTop = this.convList.scrollHeight;
    if (!this.root.classList.contains('hidden')) setTimeout(() => { if (document.activeElement?.tagName !== 'INPUT') input.focus(); }, 0);
  }

  private exportChat(name: string) {
    const c = this.conv; if (!c) return;
    const me = this.net.selfUid;
    const lines = [`与 ${name}（校园号 ${c.uid}）的私聊记录`, `导出时间：${full(Date.now())}`, `共 ${c.items.length} 条（${c.more ? '只含已加载的最近部分，点「加载更早的记录」可以多取一些' : '全部'}）`, '', ...c.items.map((m) => `[${full(m.ts)}] ${m.from === me ? '我' : name}：${m.text}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const a = el('a'); a.href = url; a.download = `私聊记录-${name}-${ymd(Date.now())}.txt`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ whois / 点玩家弹窗
  private onWhois(uid: number, info: PersonInfo | null, relation: Relation, dorm?: DormCard) {
    if (this.popUid === uid) { this.popDorm = dorm; this.renderPopup(info, relation); }
    this.lookup = { uid, info, relation };
    if (this.tab === 'add' && !this.conv && !this.root.classList.contains('hidden')) this.render();
  }
  private refreshPopup() { if (this.popUid) this.net.whois(this.popUid); }

  /** 点玩家（场景里的角色、公屏里的名字）弹出资料卡和操作。pub 是附近玩家带来的公开资料（有年级、签名） */
  showPlayer(uid: number, pub?: PublicProfile) {
    this.popUid = uid; this.popPub = pub; this.popDorm = undefined; this.peek = undefined;
    this.pop.classList.remove('hidden');
    this.renderPopup(null, 'none', true);
    this.net.whois(uid);
  }
  closePlayer() { this.pop.classList.add('hidden'); this.popUid = 0; this.popDorm = undefined; this.peek = undefined; }
  private renderPopup(info: PersonInfo | null, relation: Relation, loading = false) {
    this.pop.replaceChildren();
    const wrap = el('div', 'card-wrap' + (!loading && info ? ' with-sheet' : '') + (!loading && info && this.popDorm ? ' with-dorm' : '')); // 有操作按钮时横屏里学生证在左、按钮在右；有宿舍时多一栏「TA 的宿舍」
    const card = new StudentCard(this.textures);
    const p = this.popPub, uid = this.popUid;
    if (p) card.set({ ...p }, uid); else if (info) card.set({ name: info.name, look: info.look, app: info.app, gender: info.gender, college: info.college, major: info.major }, uid);
    else card.set({ name: loading ? '…' : '找不到这位同学', look: 0 }, uid);
    card.setTitle(info?.title);
    wrap.append(card.el);
    if (!loading && info && this.popDorm) { this.peek = new DormPeek(this.textures, this.net, uid, info.name, this.popDorm, relation === 'self'); wrap.append(this.peek.el); } else this.peek = undefined;
    if (!loading && info) wrap.append(this.actions(uid, relation, info.name));
    const close = el('button', 'btn', '关闭'); close.type = 'button'; close.addEventListener('click', () => this.closePlayer());
    wrap.append(close); this.pop.append(wrap);
  }
}
