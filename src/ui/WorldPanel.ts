import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { FriendInfo } from '@/shared/social';
import type { FriendLoc } from '@/shared/where';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
export type WorldState = Extract<ServerMsg, { t: 'world_state' }>;
const NAMES = { public: '公共世界', solo: '个人世界', group: '好友世界' } as const;
const ICONS = { public: '🌍', solo: '🏠', group: '👥' } as const;
const ASK_MS = 30000;

export interface WorldHooks {
  /** 我的好友（在线的才能邀请） */
  friends(): readonly FriendInfo[];
  /** 好友现在在哪（别的世界的好友没有坐标，where 是「在个人世界」之类） */
  locOf(uid: number): FriendLoc | undefined;
}

/**
 * 世界：公共世界（所有人）/ 个人世界（只有自己）/ 好友世界（房主 + 受邀的好友，最多 6 位好友）。
 * 左上角一个小标签显示现在在哪个世界，点开是世界面板：切换、邀请好友一起玩、申请加入好友的世界、房主管理成员。
 * 邀请和申请都要对方点「接受」；规则（状态检查、冷却、人数上限）都在服务器，这里只显示结果。
 */
export class WorldPanel {
  readonly chip = el('button', 'world-chip');
  private root = el('div', 'screen hidden');
  private body = el('div');
  private msg = el('div', 'tp-msg');
  private ask = el('div', 'mon-enc hand-prompt hidden'); private askTimer = 0;
  /** 从好友列表点「一起玩」进来时，把这位好友排在最前面 */
  private focusUid = 0;
  state: WorldState | null = null;
  /** 世界变了（第一次收到状态不算；同样是好友世界但换了房主也算）：场景据此清掉别人的人物和公屏 */
  onChange: (kind: WorldState['kind'], prev: WorldState['kind']) => void = () => {};

  constructor(private net: NetClient, private hooks: WorldHooks) {
    this.chip.type = 'button'; this.chip.title = '点一下：切换世界 / 邀请好友一起玩'; this.chip.addEventListener('click', () => this.toggle());
    const panel = el('div', 'box tp world');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭世界面板'); close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '世界'), close);
    panel.append(head, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.chip, this.root, this.ask);
    ui.add({ id: 'world', label: '世界', key: 'O', run: () => this.toggle() });
    net.handlers.worldState = (m) => {
      const prev = this.state, changed = !!prev && (prev.kind !== m.kind || (m.kind === 'group' && prev.owner !== m.owner));
      this.state = m; this.render(); if (changed) this.onChange(m.kind, prev!.kind);
    };
    net.handlers.worldResult = (ok, text) => this.say(text, ok);
    net.handlers.worldAsk = (uid, name, kind) => this.showAsk(uid, name, kind);
    net.onStatus?.(() => this.render());
    this.render();
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.say('', true); this.root.classList.remove('hidden'); this.render(); }
  /** 从好友列表点「一起玩」 */
  openFor(uid: number) { this.focusUid = uid; this.open(); }
  close() { this.root.classList.add('hidden'); this.focusUid = 0; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private say(text: string, ok: boolean) { this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }

  /** 别人邀请我 / 申请加入我的世界：提示条（30 秒不答复算拒绝） */
  private showAsk(uid: number, name: string, kind: 'invite' | 'knock') {
    this.ask.replaceChildren();
    const text = el('div', 'mon-enc-text');
    text.append(el('div', 'mon-name', kind === 'invite' ? `👥 ${name} 邀请你进 TA 的好友世界一起玩` : `👥 ${name} 想加入你的世界一起玩`), el('div', 'mon-sub', kind === 'invite' ? '接受后你会离开现在的世界，进到只有你们几个的好友世界；随时可以回公共世界' : '接受后 TA 会进到你的世界（你的个人世界会变成好友世界）'));
    const ok = el('button', 'btn primary', '接受'); ok.type = 'button'; ok.addEventListener('click', () => { this.net.worldReply(uid, true); this.hideAsk(); });
    const no = el('button', 'btn', '拒绝'); no.type = 'button'; no.addEventListener('click', () => { this.net.worldReply(uid, false); this.hideAsk(); });
    const t = el('div', 'mon-enc-timer'); t.style.animationDuration = `${ASK_MS}ms`;
    const row = el('div', 'mon-enc-row'); row.append(text, ok, no);
    this.ask.append(row, t); this.ask.classList.remove('hidden');
    window.clearTimeout(this.askTimer); this.askTimer = window.setTimeout(() => this.hideAsk(), ASK_MS);
  }
  private hideAsk() { window.clearTimeout(this.askTimer); this.ask.classList.add('hidden'); }

  /** 世界标签：「🌍 公共世界 · 23 人」 */
  private renderChip() {
    const s = this.state;
    this.chip.textContent = s ? `${s.ghost ? '👻' : ICONS[s.kind]} ${this.elsewhere(s) ? `${s.ownerName ?? ''}的` : ''}${NAMES[s.kind]} · ${this.net.online ?? s.size} 人 ▾` : '🌍 世界 ▾';
    this.chip.dataset.kind = s?.kind ?? 'public';
    if (s?.ghost) this.chip.dataset.ghost = '1'; else delete this.chip.dataset.ghost;
  }
  /** 管理员正在别人的个人 / 好友世界里（不是自己的，也不是以成员身份加入的好友世界） */
  private elsewhere(s: WorldState) { return this.net.isAdmin && ((s.kind === 'solo' && s.owner !== this.net.selfUid) || (s.kind === 'group' && s.owner !== this.net.selfUid && !(s.members ?? []).some((m) => m.uid === this.net.selfUid))); }
  /** 好友位置变了，重绘 */
  refresh() { this.render(); }
  private render() {
    this.renderChip();
    if (!this.isOpen) return;
    const s = this.state, b = this.body; b.replaceChildren();
    if (!s) { b.append(el('div', 'create-sub', '没连上服务器')); return; }
    const online = this.net.status === 'online', mine = s.kind === 'group' && s.owner === this.net.selfUid;
    if (s.ghost || this.elsewhere(s)) { // 管理员在观察别人的世界：醒目提示 + 离开按钮
      const bar = el('div', 'world-row'); bar.append(el('span', 'world-name', s.ghost ? '👻 你在隐身观察：别人看不到你，你不能发言' : '🛡 你以管理员身份在别人的世界里（别人看得到你）'));
      const out = el('button', 'btn sm primary', '离开，回到原来的世界'); out.type = 'button'; out.addEventListener('click', () => this.net.adm({ op: 'world_leave' })); bar.append(out); b.append(bar);
    }
    b.append(el('div', 'world-now', `现在在：${ICONS[s.kind]} ${s.kind === 'group' ? `${s.ownerName ?? ''}的好友世界` : this.elsewhere(s) ? `${s.ownerName ?? ''}的个人世界` : NAMES[s.kind]}（${this.net.online ?? s.size} 人）`));
    b.append(el('div', 'create-sub', s.kind === 'solo' ? '整个校园只有你一个人：别人看不到你，公屏只显示系统提示和好友消息；其他功能（钓鱼、精灵、宿舍、私聊…）照常。'
      : s.kind === 'group' ? (mine ? '你是房主：下面的好友能看到彼此，公屏只有你们的话。你离开（或下线），好友世界就解散，大家回到公共世界。' : '只有你们几位好友在这里，公屏只有你们和系统的消息。房主离开，好友世界就解散。')
      : '和所有人一起：看得到大家，公屏里是所有人的消息。'));
    const mk = (kind: 'public' | 'solo', label: string, desc: string) => {
      const row = el('div', 'world-row');
      const btn = el('button', 'btn world-btn' + (s.kind === kind ? ' on' : ''), label); btn.type = 'button'; btn.disabled = s.kind === kind || !online;
      btn.addEventListener('click', () => this.net.worldSet(kind));
      row.append(btn, el('div', 'create-sub', desc)); b.append(row);
    };
    mk('public', '🌍 进入公共世界', s.kind === 'group' ? '离开好友世界，回到大家中间' : '热闹：看得到所有人，也看得到所有人的消息');
    mk('solo', '🏠 进入个人世界', '安静：只有你自己，公屏只显示系统和好友提示');
    // 好友世界：成员（房主可以请人出去）
    if (s.kind === 'group' && s.members) {
      b.append(el('div', 'tp-group', `好友世界里的人（${s.members.length}）`));
      for (const m of s.members) {
        const row = el('div', 'world-row'); row.append(el('span', 'world-name', `${m.uid === s.owner ? '👑 ' : ''}${m.name}${m.uid === this.net.selfUid ? '（我）' : ''}`));
        if (mine && m.uid !== this.net.selfUid) { const k = el('button', 'btn sm', '请出去'); k.type = 'button'; k.addEventListener('click', () => { if (confirm(`请 ${m.name} 出好友世界？`)) this.net.worldKick(m.uid); }); row.append(k); }
        b.append(row);
      }
    }
    // 在线好友：邀请一起玩 / 申请加入 TA 的世界（从好友列表点「一起玩」进来的排在最前）
    const canHost = !(s.kind === 'group' && !mine);
    const friends = this.hooks.friends().filter((f) => f.online).slice().sort((x, y) => Number(y.uid === this.focusUid) - Number(x.uid === this.focusUid));
    b.append(el('div', 'tp-group', `在线好友（${friends.length}）：${canHost ? '邀请进我的好友世界，或申请加入 TA 的世界' : '只有房主能邀请，你可以申请加入别的好友的世界'}`));
    if (!friends.length) b.append(el('div', 'create-sub', '现在没有在线的好友。先在「好友」里加好友，等 TA 上线。'));
    for (const f of friends) {
      const loc = this.hooks.locOf(f.uid), where = loc?.other ? loc.where : '';
      const row = el('div', 'world-row' + (f.uid === this.focusUid ? ' focus' : ''));
      row.append(el('span', 'world-name', `${f.note ? `${f.note}（${f.name}）` : f.name}${where ? ` · ${where}` : ' · 和我在同一个世界'}`));
      const inv = el('button', 'btn sm primary', '邀请一起玩'); inv.type = 'button'; inv.disabled = !online || !canHost; inv.title = canHost ? '邀请 TA 进我的好友世界（TA 点接受才进）' : '只有房主能邀请';
      inv.addEventListener('click', () => this.net.worldInvite(f.uid));
      const kn = el('button', 'btn sm', '申请加入'); kn.type = 'button'; kn.disabled = !online || !where || where === '在公共世界'; kn.title = where ? '申请加入 TA 的世界（TA 点接受才进）' : 'TA 和你在同一个世界里，不用申请';
      kn.addEventListener('click', () => this.net.worldKnock(f.uid));
      row.append(inv, kn); b.append(row);
    }
    const lab2 = el('label', 'world-remember'); const cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = !!s.noAsk;
    cb2.addEventListener('change', () => this.net.worldOpts(cb2.checked));
    lab2.append(cb2, document.createTextNode(' 不接受好友「申请加入」我的个人世界（别人邀请我、我邀请别人不受影响）'));
    b.append(lab2);
    b.append(el('div', 'create-sub', `下次登录会进入：${s.dflt === 'solo' ? '🏠 个人世界' : '🌍 公共世界'}（你上次选的；没选过默认是个人世界）。好友世界最多房主加 6 位好友。战斗、交易、校园跑、钓鱼、在宿舍里不能切换，切换后有 10 秒冷却。`));
  }
}
