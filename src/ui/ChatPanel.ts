import { CHAT_COOLDOWN_MS, CHAT_MAX, type ChatMessage } from '@/shared/chat';
import { CHANNELS, CHANNEL_IDS, parseSlash, type ChannelId } from '@/shared/channels';
import type { ChatTransport } from '@/net/chat';
import { isTouchDevice } from './TouchControls';
import { askReport } from './ReportDialog';
import { ChatState, bubbleStyle, channelOf } from './chatState';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const KEEP = 60;

/**
 * 聊天窗口：右下角（手机点「聊天」展开）。顶部一排**频道标签**（世界 / 附近 / 队伍 / 系统，带未读数），每个频道各有一份消息；
 * 当前标签就是发送目标，也可以输入 `/w /n /p` 前缀临时发到别的频道。Enter 聊天，Esc 退出输入，Tab 在输入框里切频道。
 * 频道的消息归属、未读数、开关 / 静音的逻辑在 chatState.ts（纯函数，有测试）；这里只负责画出来。
 */
export class ChatPanel {
  readonly state = new ChatState();
  private root = el('div', 'box');
  private tabs = el('div', 'chat-tabs');
  private logs = el('div', 'chat-logs');
  private logOf = new Map<ChannelId, HTMLElement>();
  private note = el('div', 'chat-note');
  private input = el('input');
  private status = el('span', 'chat-status');
  private lastSent = 0;
  private noteTimer = 0;
  private popTimer = 0;

  /** 点聊天里别人的名字（有校园号才能点）：弹出资料卡，可以加好友 */
  onNameClick: (uid: number, ctx: { name: string; mid?: number; text: string }) => void = () => {};
  /** 现在是不是管理员（管理员点自己的名字也能弹出管理菜单，比如撤回自己的话） */
  admin: () => boolean = () => false;
  /** 记录编号 → 那一行（管理员撤回时要找到它） */
  private byMid = new Map<number, HTMLElement>();
  /** 输入框获得焦点时回调（场景用它清掉卡住的按键） */
  onFocus: () => void = () => {};
  /** 点标签条上的 ⚙：打开频道管理 */
  onManage: () => void = () => {};
  /** 所有"没静音、没关闭"的频道的未读总数变了（手机底部「聊天」按钮的角标用） */
  onUnread: (n: number) => void = () => {};

  constructor(private net: ChatTransport) {
    this.root.id = 'chat';
    const head = el('div', 'chat-head');
    const closeBtn = el('button', 'chat-close', '✕'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', '收起聊天');
    closeBtn.addEventListener('click', () => this.close());
    head.append(el('span', undefined, '聊天'), this.status, closeBtn);
    for (const id of CHANNEL_IDS) { const l = el('div', 'chat-log'); l.dataset.ch = id; this.logOf.set(id, l); this.logs.append(l); }
    this.input.type = 'text'; this.input.maxLength = CHAT_MAX + 20; this.input.autocomplete = 'off'; this.input.spellcheck = false;
    this.input.addEventListener('focus', () => { window.clearTimeout(this.popTimer); this.root.classList.add('typing', 'pop'); this.onFocus(); });
    // pop：沉浸模式下聊天框默认藏着，说话时临时冒出来，说完 6 秒后自己收起（方便看别人的回复）
    this.input.addEventListener('blur', () => { this.root.classList.remove('typing'); window.clearTimeout(this.popTimer); this.popTimer = window.setTimeout(() => this.root.classList.remove('pop'), 6000); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      else if (e.key === 'Escape') this.input.blur();
      else if (e.key === 'Tab') { e.preventDefault(); this.select(this.state.nextSendable()); }
    });
    this.root.append(head, this.tabs, this.logs, this.note, this.input);
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.onMessage((m) => this.onMessage(m));
    net.onStatus(() => this.renderStatus());
    net.onChannels((items) => this.applyChannels(items));
    net.onChResult((ok, msg) => { if (!ok) this.say(msg); });
    this.state.setChannels(net.channels);
    this.renderAll(); this.renderStatus();
  }

  get typing() { return document.activeElement === this.input; }
  /** 聚焦输入框；当前频道不能发言（系统 / 已关闭）就先切到第一个能发言的频道 */
  focus() {
    this.ensureSendable();
    window.clearTimeout(this.popTimer); this.root.classList.add('pop'); // 沉浸模式下聊天框是藏着的：先让它显示出来，输入框才能聚焦
    this.input.focus();
    if (document.activeElement !== this.input) this.popTimer = window.setTimeout(() => this.root.classList.remove('pop'), 3000); // 没聚焦上（输入框被禁用）：过一会儿再收起
  }
  /** 手机：展开/收起聊天（展开时让出摇杆和按钮的位置，并聚焦输入框） */
  get isOpen() { return this.root.classList.contains('open'); }
  open() { this.root.classList.add('open'); document.body.classList.add('chat-open'); this.state.markActiveRead(); this.renderTabs(); this.scrollEnd(); this.ensureSendable(); this.input.focus(); }
  close() { this.input.blur(); this.root.classList.remove('open'); document.body.classList.remove('chat-open'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  /** 这条消息要不要冒头顶气泡、冒什么样的（系统 / 静音 / 关闭的频道不冒；队伍另一种颜色） */
  bubbleOf(m: ChatMessage): 'normal' | 'party' | null { return bubbleStyle(this.state, m); }
  /** 本地先改一下某个频道的开关 / 静音（乐观更新）：标签和输入框马上变，服务器的 channels 回来会再覆盖一次 */
  patchChannel(ch: ChannelId, set: { on?: boolean; mute?: boolean }) { this.state.patch(ch, set); this.renderAll(); this.emitUnread(); }
  /** 切换到某个频道标签 */
  select(ch: ChannelId) {
    if (!this.state.setActive(ch)) return;
    this.renderAll(); this.scrollEnd(); this.emitUnread();
  }

  /** 清空世界和附近（切换世界时）：队伍、系统保留 */
  clear() {
    this.state.clearWorldScoped();
    for (const id of ['world', 'near'] as const) this.logOf.get(id)!.replaceChildren();
    for (const [k, v] of this.byMid) if (!v.isConnected) this.byMid.delete(k);
    this.renderTabs(); this.emitUnread();
  }
  /** 管理员撤回了这几条：所有人屏幕上都变成一行灰字（已经冒出来的气泡不管） */
  recall(mids: readonly number[]) {
    for (const mid of mids) {
      const line = this.byMid.get(mid); if (!line) continue;
      line.classList.add('recalled'); const t = line.querySelector('.chat-text'); if (t) t.textContent = '（这条消息已被管理员撤回）'; line.querySelector('.chat-rep')?.remove();
      this.byMid.delete(mid);
    }
  }
  /** 进入时服务器发来的最近公屏记录（只属于世界频道）：淡色显示，末尾加一条分隔线 */
  addHistory(items: { from: string; hue: number; text: string; ts: number; uid?: number; mid?: number }[]) {
    if (!items.length) return;
    for (const it of items) { const m: ChatMessage = { id: -1, kind: 'chat', from: it.from, hue: it.hue, text: it.text, ts: it.ts, uid: it.uid, mid: it.mid }; this.state.addHistory(m); this.append('world', m, true); }
    const log = this.logOf.get('world')!; log.append(el('div', 'chat-divider', '—— 以上是最近的公屏记录 ——')); this.scrollEnd();
  }

  // ------------------------------------------------------------ 状态 → 界面
  private applyChannels(items: Parameters<ChatState['setChannels']>[0]) {
    const d = this.state.setChannels(items);
    for (const id of d.removed) { this.logOf.get(id)!.replaceChildren(); for (const [k, v] of this.byMid) if (!v.isConnected) this.byMid.delete(k); }
    this.renderAll(); this.emitUnread();
  }
  private renderAll() {
    this.renderTabs();
    for (const [id, l] of this.logOf) l.classList.toggle('on', id === this.state.active);
    this.renderInput();
  }
  private renderTabs() {
    this.tabs.replaceChildren();
    for (const c of this.state.channels) {
      const meta = CHANNELS[c.id];
      const b = el('button', 'chat-tab' + (c.id === this.state.active ? ' on' : '') + (c.on ? '' : ' off') + (c.mute ? ' muted' : ''), `${meta.icon} ${meta.name}`);
      b.type = 'button'; b.style.setProperty('--ch', meta.color);
      b.title = `${meta.name}频道${c.on ? '' : '（已关闭）'}${c.mute ? '（静音）' : ''}${c.n !== undefined ? ` · ${c.n} 人` : ''}`;
      const n = this.state.unread[c.id];
      if (n > 0 && c.on) b.append(el('span', 'chat-badge' + (c.mute ? ' mute' : ''), n > 99 ? '99+' : String(n)));
      b.addEventListener('click', () => this.select(c.id));
      this.tabs.append(b);
    }
    const gear = el('button', 'chat-gear', '⚙'); gear.type = 'button'; gear.title = '频道管理：开关、静音'; gear.setAttribute('aria-label', '频道管理');
    gear.addEventListener('click', () => this.onManage());
    this.tabs.append(gear);
  }
  /** 输入框占位符 / 是否可用：随当前频道变；系统频道和已关闭的频道不能输入 */
  private renderInput() {
    const ch = this.state.active, can = this.state.canSend(ch);
    this.input.disabled = !can.ok;
    this.input.placeholder = can.ok ? (isTouchDevice() ? `${CHANNELS[ch].placeholder}（点键盘上的发送）` : `${CHANNELS[ch].placeholder}（/p /n /w 换频道）`) : can.reason;
    this.root.dataset.ch = ch;
  }
  private renderStatus() {
    const on = this.net.status === 'online';
    this.status.textContent = on ? `● 在线${this.net.online !== undefined ? ` ${this.net.online} 人` : ''}` : '○ 离线（仅自己可见）';
    this.status.classList.toggle('on', on);
  }
  private ensureSendable() {
    if (this.state.canSend(this.state.active).ok) return;
    const next = this.state.nextSendable('sys');
    if (next !== this.state.active && this.state.canSend(next).ok) this.select(next);
  }
  private emitUnread() { this.onUnread(this.state.totalUnread()); }
  /** 输入框上方的一行提示（被拒时的原因、未知前缀），几秒后自己消失 */
  say(text: string) {
    this.note.textContent = text; this.note.classList.add('on');
    window.clearTimeout(this.noteTimer); this.noteTimer = window.setTimeout(() => this.note.classList.remove('on'), 4500);
  }
  private scrollEnd() { const l = this.logOf.get(this.state.active); if (l) l.scrollTop = l.scrollHeight; }

  // ------------------------------------------------------------ 发送
  private submit() {
    const raw = this.input.value;
    if (!raw.trim()) { this.input.blur(); return; }
    const sl = parseSlash(raw);
    if (sl.unknown) { this.say(`没有「/${sl.unknown}」这个频道。可用：/w 世界 · /n 附近 · /p 队伍`); return; }
    let ch = this.state.active, text = raw;
    if (sl.ch) {
      ch = sl.ch; text = sl.text;
      if (!text) { // 只写了前缀：切到那个频道
        if (this.state.has(ch)) { this.select(ch); this.input.value = ''; } else { const c = this.state.canSend(ch); this.say(c.ok ? '' : c.reason); }
        return;
      }
    }
    const can = this.state.canSend(ch);
    if (!can.ok) { this.say(can.reason); return; }
    const now = Date.now();
    if (now - this.lastSent < CHAT_COOLDOWN_MS) return; // 限频：发太快时保留输入内容，不发送
    this.lastSent = now;
    this.net.send(text, ch);
    this.input.value = '';
    this.input.blur();
  }

  // ------------------------------------------------------------ 收消息
  private onMessage(m: ChatMessage) {
    const collapsed = document.body.classList.contains('touch') && !this.isOpen;
    const own = m.kind === 'chat' && (m.uid === undefined || m.uid === this.net.selfUid); // 自己发的（含离线回显）：不算未读
    const r = this.state.receive(m, collapsed, own);
    if (!r.accepted) return;
    this.append(r.ch, m, false); // 手机上聊天框收起时不再弹小条打扰：只在标签 / 「聊天」按钮上留未读数，要看就点开聊天框
    if (r.ch === this.state.active && this.isOpen) this.state.markActiveRead();
    this.renderTabs(); this.emitUnread();
  }

  private append(ch: ChannelId, m: ChatMessage, hist: boolean): HTMLElement {
    const log = this.logOf.get(ch)!;
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    const meta = CHANNELS[ch];
    const line = el('div', (m.kind === 'system' ? 'chat-line sys' : 'chat-line') + (hist ? ' hist' : '') + ` ch-${ch}`);
    const d = new Date(m.ts);
    const tag = el('span', 'chat-ch', meta.icon); tag.title = `${meta.name}频道`; tag.style.color = meta.color;
    line.append(tag, el('span', 'chat-time', `${pad(d.getHours())}:${pad(d.getMinutes())}`));
    if (m.kind === 'chat') {
      const who = el('span', 'chat-who', `${m.from ?? '?'}：`);
      who.style.color = `hsl(${m.hue ?? 0} 60% 32%)`;
      const adm = this.admin();
      if (m.uid && (m.uid !== this.net.selfUid || adm)) { who.classList.add('clickable'); who.title = adm ? '点击：管理（禁言 / 撤回 / 封禁 / 查记录）' : '点击查看资料 / 加好友'; who.addEventListener('click', () => this.onNameClick(m.uid!, { name: m.from ?? '', mid: m.mid, text: m.text })); }
      line.append(who);
      if (m.mid) this.byMid.set(m.mid, line);
    }
    line.append(el('span', 'chat-text', m.text));
    if (m.kind === 'chat' && m.mid && m.uid && m.uid !== this.net.selfUid && !this.admin()) { // 别人的话：行尾一个很小的 ⚑，点开举报（管理员有自己的管理菜单，不显示）；队伍 / 附近的话也能举报，举报会带上频道
      const mid = m.mid, from = m.from ?? '?', text = m.text, rch = channelOf(m);
      const rep = el('button', 'chat-rep', '⚑'); rep.type = 'button'; rep.title = '举报这条消息'; rep.setAttribute('aria-label', '举报这条消息');
      rep.addEventListener('click', () => askReport({ kind: 'chat', ref: mid, preview: `${rch === 'world' ? '' : `[${CHANNELS[rch].name}] `}${from}：${text}`, ...(rch !== 'world' ? { ch: rch } : {}) }));
      line.append(rep);
    }
    log.append(line);
    while (log.childElementCount > KEEP) { const f = log.firstElementChild!; for (const [k, v] of this.byMid) if (v === f) { this.byMid.delete(k); break; } f.remove(); }
    if (stick && ch === this.state.active) log.scrollTop = log.scrollHeight;
    return line;
  }
}
