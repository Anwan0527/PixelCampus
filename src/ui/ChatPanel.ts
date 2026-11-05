import { CHAT_COOLDOWN_MS, CHAT_MAX, type ChatMessage } from '@/shared/chat';
import type { ChatTransport } from '@/net/chat';
import { isTouchDevice } from './TouchControls';
import { askReport } from './ReportDialog';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const KEEP = 60;

/** 公屏：右下角的公共聊天频道。Enter 聊天，Esc 退出输入；发送后自动退出输入，方便继续走路。 */
export class ChatPanel {
  private root = el('div', 'box');
  private log = el('div', 'chat-log');
  private input = el('input');
  private status = el('span', 'chat-status');
  private lastSent = 0;
  /** 清空公屏（切换世界时）：已有的消息、收起时冒出来的小条都去掉 */
  clear() { this.log.replaceChildren(); this.peek.replaceChildren(); this.byMid.clear(); }
  /** 管理员撤回了这几条：所有人屏幕上都变成一行灰字（已经冒出来的气泡不管） */
  recall(mids: readonly number[]) {
    for (const mid of mids) {
      const line = this.byMid.get(mid); if (!line) continue;
      line.classList.add('recalled'); const t = line.querySelector('.chat-text'); if (t) t.textContent = '（这条消息已被管理员撤回）'; line.querySelector('.chat-rep')?.remove();
      this.byMid.delete(mid);
    }
  }

  /** 手机上公屏收起时，左上角短暂显示最新几条 */
  private peek = el('div');
  /** 点公屏里别人的名字（有校园号才能点）：弹出资料卡，可以加好友 */
  onNameClick: (uid: number, ctx: { name: string; mid?: number; text: string }) => void = () => {};
  /** 现在是不是管理员（管理员点自己的名字也能弹出管理菜单，比如撤回自己的话） */
  admin: () => boolean = () => false;
  /** 记录编号 → 那一行（管理员撤回时要找到它） */
  private byMid = new Map<number, HTMLElement>();
  /** 输入框获得焦点时回调（场景用它清掉卡住的按键） */
  onFocus: () => void = () => {};

  constructor(private net: ChatTransport) {
    this.root.id = 'chat';
    const head = el('div', 'chat-head');
    const closeBtn = el('button', 'chat-close', '✕'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', '收起公屏');
    closeBtn.addEventListener('click', () => this.close());
    head.append(el('span', undefined, '公屏'), this.status, closeBtn);
    this.peek.id = 'chat-peek';
    this.input.type = 'text'; this.input.maxLength = CHAT_MAX + 20; this.input.placeholder = isTouchDevice() ? '说点什么…（点键盘上的发送）' : '按 Enter 说点什么…'; this.input.autocomplete = 'off'; this.input.spellcheck = false;
    this.input.addEventListener('focus', () => { this.root.classList.add('typing'); this.onFocus(); });
    this.input.addEventListener('blur', () => this.root.classList.remove('typing'));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      else if (e.key === 'Escape') this.input.blur();
    });
    this.root.append(head, this.log, this.input);
    (document.getElementById('hud') ?? document.body).append(this.root, this.peek);
    net.onMessage((m) => this.add(m));
    net.onStatus(() => this.renderStatus());
    this.renderStatus();
  }

  get typing() { return document.activeElement === this.input; }
  focus() { this.input.focus(); }
  /** 手机：展开/收起公屏（展开时让出摇杆和按钮的位置，并聚焦输入框） */
  get isOpen() { return this.root.classList.contains('open'); }
  open() { this.root.classList.add('open'); document.body.classList.add('chat-open'); this.peek.replaceChildren(); this.log.scrollTop = this.log.scrollHeight; this.input.focus(); }
  close() { this.input.blur(); this.root.classList.remove('open'); document.body.classList.remove('chat-open'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private renderStatus() {
    const on = this.net.status === 'online';
    this.status.textContent = on ? `● 在线${this.net.online !== undefined ? ` ${this.net.online} 人` : ''}` : '○ 离线（仅自己可见）';
    this.status.classList.toggle('on', on);
  }

  /** 进入时服务器发来的最近公屏记录：淡色显示，末尾加一条分隔线 */
  addHistory(items: { from: string; hue: number; text: string; ts: number; uid?: number; mid?: number }[]) {
    if (!items.length) return;
    for (const it of items) this.add({ id: -1, kind: 'chat', from: it.from, hue: it.hue, text: it.text, ts: it.ts, uid: it.uid, mid: it.mid }, true);
    const d = el('div', 'chat-divider', '—— 以上是最近的公屏记录 ——'); this.log.append(d); this.log.scrollTop = this.log.scrollHeight;
  }

  private submit() {
    const text = this.input.value;
    if (!text.trim()) { this.input.blur(); return; }
    const now = Date.now();
    if (now - this.lastSent < CHAT_COOLDOWN_MS) return; // 限频：发太快时保留输入内容，不发送
    this.lastSent = now;
    this.net.send(text);
    this.input.value = '';
    this.input.blur();
  }

  private add(m: ChatMessage, hist = false) {
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24;
    const line = el('div', (m.kind === 'system' ? 'chat-line sys' : 'chat-line') + (hist ? ' hist' : ''));
    const d = new Date(m.ts);
    line.append(el('span', 'chat-time', `${pad(d.getHours())}:${pad(d.getMinutes())}`));
    if (m.kind === 'chat') {
      const who = el('span', 'chat-who', `${m.from ?? '?'}：`);
      who.style.color = `hsl(${m.hue ?? 0} 60% 32%)`;
      const adm = this.admin();
      if (m.uid && (m.uid !== this.net.selfUid || adm)) { who.classList.add('clickable'); who.title = adm ? '点击：管理（禁言 / 撤回 / 封禁 / 查记录）' : '点击查看资料 / 加好友'; who.addEventListener('click', () => this.onNameClick(m.uid!, { name: m.from ?? '', mid: m.mid, text: m.text })); }
      line.append(who);
      if (m.mid) this.byMid.set(m.mid, line);
    }
    line.append(el('span', 'chat-text', m.text));
    if (m.kind === 'chat' && m.mid && m.uid && m.uid !== this.net.selfUid && !this.admin()) { // 别人的话：行尾一个很小的 ⚑，点开举报（管理员有自己的管理菜单，不显示）
      const mid = m.mid, from = m.from ?? '?', text = m.text;
      const rep = el('button', 'chat-rep', '⚑'); rep.type = 'button'; rep.title = '举报这条消息'; rep.setAttribute('aria-label', '举报这条消息');
      rep.addEventListener('click', () => askReport({ kind: 'chat', ref: mid, preview: `${from}：${text}` }));
      line.append(rep);
    }
    this.log.append(line);
    if (!hist && document.body.classList.contains('touch') && !this.isOpen) { // 收起状态：在左上角冒出这一条，8 秒后消失，最多留 3 条
      const pk = line.cloneNode(true) as HTMLElement;
      this.peek.append(pk);
      while (this.peek.childElementCount > 3) this.peek.firstElementChild!.remove();
      window.setTimeout(() => pk.remove(), 8000);
    }
    while (this.log.childElementCount > KEEP) { const f = this.log.firstElementChild!; for (const [k, v] of this.byMid) if (v === f) { this.byMid.delete(k); break; } f.remove(); }
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }
}
