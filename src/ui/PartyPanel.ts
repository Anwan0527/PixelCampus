import { PARTY_MAX, PARTY_INVITE_MS, type PartyMember, type PartyMsg } from '@/shared/party';
import type { FriendInfo } from '@/shared/social';
import type { NetClient } from '@/net/client';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface PartyHooks {
  /** 好友列表（用来邀请在线好友） */
  friends(): readonly FriendInfo[];
  /** 提示：横幅 + 公屏 */
  note(title: string, text: string): void;
  beep(): void;
}

/**
 * 组队面板：邀请在线好友组成小队（最多 4 人）；队友列表显示每个人的大致位置（地标 + 方位 + 距离）和状态，
 * 可以一键传送到队友身旁（有冷却）；队长可以请人离开。同骑单车在场景里做：走到正在骑车的队友身边按 E 坐上后座。
 * 队伍只存在服务器内存里，掉线就退出。电脑按 T，或左上角「菜单」→ 组队。
 */
export class PartyPanel {
  private root = el('div', 'screen hidden');
  private body = el('div');
  private toasts = el('div');
  private party: Extract<PartyMsg, { t: 'party' }> | null = null;
  private msg = ''; private ok = true;

  constructor(private net: NetClient, private hooks: PartyHooks) {
    const panel = el('div', 'box run');
    panel.append(this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    this.toasts.id = 'party-toasts';
    const h = document.getElementById('hud') ?? document.body;
    h.append(this.root, this.toasts);
    ui.add({ id: 'party', label: '组队', key: 'T', run: () => this.toggle() });
    net.handlers.party = (m) => this.onMsg(m);
    net.onStatus(() => { if (this.isOpen) this.render(); });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 现在的队友（不含自己）的校园号 */
  get mates(): ReadonlySet<number> { return new Set((this.party?.members ?? []).filter((m) => !m.self).map((m) => m.uid)); }
  get inParty() { return !!this.party; }
  open() { this.root.classList.remove('hidden'); this.msg = ''; this.net.getParty(); this.render(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private onMsg(m: PartyMsg) {
    if (m.t === 'party_invite') { this.toast(m); return; }
    if (m.t === 'party') { const was = this.party; this.party = m; if (!was) this.hooks.note('👥 组队', '队伍组好了，按 T 查看队友'); if (this.isOpen) this.render(); return; }
    if (m.t === 'party_gone') { const had = !!this.party; this.party = null; if (m.msg && had) this.hooks.note('👥 组队', m.msg); if (this.isOpen) this.render(); return; }
    if (m.t === 'party_result') { this.msg = m.msg; this.ok = m.ok; if (!m.ok || !this.isOpen) this.hooks.note('👥 组队', m.msg); if (this.isOpen) this.render(); }
  }

  private btn(label: string, fn: () => void, primary = false, disabled = false) { const b = el('button', 'btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.disabled = disabled; b.addEventListener('click', fn); return b; }

  private render() {
    this.body.replaceChildren();
    const head = el('div', 'board-head');
    const x = el('button', 'btn', '✕'); x.type = 'button'; x.setAttribute('aria-label', '关闭组队'); x.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '好友组队'), x);
    this.body.append(head);
    if (this.net.status !== 'online') { this.body.append(el('div', 'board-empty', '没连上服务器，连上后才能组队。')); return; }
    if (this.msg) this.body.append(el('div', 'board-msg' + (this.ok ? '' : ' bad'), this.msg));
    const p = this.party, me = p?.members.find((m) => m.self), leader = !!me?.leader;
    this.body.append(el('div', 'create-sub', p
      ? `队伍 ${p.members.length} / ${PARTY_MAX} 人。队友之间可以一键传送到对方身旁；走到正在骑车的队友身边按 E，可以坐上他的后座一起骑。`
      : `和好友组成小队（最多 ${PARTY_MAX} 人）：看到队友在哪、一键传送到队友身旁、同骑一辆共享单车。只有好友才能组队，邀请 ${Math.round(PARTY_INVITE_MS / 1000)} 秒内有效。`));
    if (p) this.renderMembers(p, leader);
    if (!p || leader) this.renderInvite(p);
    const row = el('div', 'create-btns');
    if (p) row.append(this.btn('退出队伍', () => this.net.partyLeave()));
    row.append(this.btn('关闭', () => this.close(), !p));
    this.body.append(row);
  }

  private renderMembers(p: Extract<PartyMsg, { t: 'party' }>, leader: boolean) {
    const list = el('div', 'friends-list');
    for (const m of p.members) {
      const row = el('div', 'friend-row static'), mid = el('div', 'friend-mid');
      mid.append(el('div', 'friend-name', `${m.name}${m.leader ? '（队长）' : ''}${m.self ? '（我）' : ''}`));
      mid.append(el('div', 'friend-loc', m.self ? `📍 ${m.state}` : `📍 ${this.where(m)} · ${m.state}`));
      row.append(mid);
      if (!m.self) {
        if (m.state === '骑车') row.append(this.btn('坐上他的车', () => { this.close(); this.net.paxJoin(m.uid); })); // 按钮和走近按 E 等价（离得太远服务器会提示）
        row.append(this.btn('传送到他身旁', () => this.net.partyTp(m.uid)));
        if (leader) row.append(this.btn('请出', () => { if (confirm(`请 ${m.name} 离开队伍？`)) this.net.partyKick(m.uid); }));
      }
      list.append(row);
    }
    this.body.append(list);
  }
  private where(m: PartyMember) { return m.near ? `${m.where ?? ''} · 就在你身边` : `${m.where ?? '？'} · ${m.dir ?? ''}方向约 ${m.m ?? 0} 米`; }

  private renderInvite(p: Extract<PartyMsg, { t: 'party' }> | null) {
    const inParty = new Set((p?.members ?? []).map((m) => m.uid));
    const online = this.hooks.friends().filter((f) => f.online && !inParty.has(f.uid));
    this.body.append(el('div', 'run-sub', '邀请在线的好友'));
    const fl = el('div', 'friends-list');
    if (!online.length) fl.append(el('div', 'board-empty', '现在没有在线的好友可以邀请。'));
    for (const f of online) {
      const row = el('div', 'friend-row static'), mid = el('div', 'friend-mid');
      mid.append(el('div', 'friend-name', f.name), el('div', 'friend-sub', `${f.college} · ${f.major}`));
      const b = this.btn('邀请', () => { b.disabled = true; b.textContent = '已邀请'; this.net.partyInvite(f.uid); });
      row.append(mid, b); fl.append(row);
    }
    this.body.append(fl);
  }

  /** 收到组队邀请：屏幕上方一条小提示 */
  private toast(m: Extract<PartyMsg, { t: 'party_invite' }>) {
    this.hooks.beep();
    const t = el('div', 'box run-toast'); t.append(el('span', undefined, `👥 ${m.name} 邀请你组队`));
    const gone = () => t.remove();
    t.append(this.btn('加入', () => { this.net.partyAccept(m.pid); gone(); }, true), this.btn('拒绝', () => { this.net.partyDecline(m.pid); gone(); }));
    this.toasts.append(t);
    setTimeout(gone, PARTY_INVITE_MS);
  }
}
