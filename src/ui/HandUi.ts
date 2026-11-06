import type { NetClient } from '@/net/client';
import { HAND } from '@/shared/hand';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 手拉手的界面：①有人想牵你的手时弹一条"接受 / 拒绝"的提示条（15 秒不答复算拒绝，不打断你走路）；
 * ②牵着手时底部一条状态条"牵着 X 的手一起走 · 松手"——牵手的人和被牵的人都有。
 * 所有判断都在服务器（好友、距离、状态）；被牵的人的位置由服务器定，这里只负责显示和发"接受/松手"。
 */
export class HandUi {
  private prompt = el('div', 'mon-enc hand-prompt hidden');
  private bar = el('div', 'hand-bar hidden');
  private timer = 0;
  /** 自己在牵手里的角色变化（场景据此让被牵的人跟着走）：role = 牵手的人 / 被牵的人 / 没有；pid = 对方的玩家编号 */
  onRole: ((role: 'lead' | 'follow' | 'none', pid: number, side: 1 | -1) => void) | null = null;
  /** 一条提示（横幅 + 聊天栏） */
  onNote: ((title: string, text: string) => void) | null = null;
  role: 'lead' | 'follow' | 'none' = 'none';

  constructor(private net: NetClient) {
    (document.getElementById('hud') ?? document.body).append(this.prompt, this.bar);
    net.handlers.handInvite = (uid, name) => this.showInvite(uid, name);
    net.handlers.handMe = (role, pid, name, msg, side) => {
      this.role = role; this.hidePrompt();
      this.bar.replaceChildren();
      if (role === 'none') this.bar.classList.add('hidden');
      else {
        const txt = el('span', 'hand-text', role === 'lead' ? `🤝 牵着 ${name} 的手一起走` : `🤝 ${name} 牵着你的手，跟着 TA 走`);
        const end = el('button', 'btn', '松手'); end.type = 'button'; end.addEventListener('click', () => this.net.handEnd());
        this.bar.append(txt, end); this.bar.classList.remove('hidden');
      }
      if (msg) this.onNote?.('🤝 手拉手', msg);
      this.onRole?.(role, pid, side ?? 1);
    };
    net.handlers.handResult = (_ok, msg) => this.onNote?.('🤝 手拉手', msg);
  }

  private showInvite(uid: number, name: string) {
    this.prompt.replaceChildren();
    const text = el('div', 'mon-enc-text'); text.append(el('div', 'mon-name', `🤝 ${name} 想牵着你的手一起走`), el('div', 'mon-sub', '接受后你会跟着 TA 走，随时可以点「松手」'));
    const ok = el('button', 'btn primary', '接受'); ok.type = 'button'; ok.addEventListener('click', () => { this.net.handAccept(uid); this.hidePrompt(); });
    const no = el('button', 'btn', '拒绝'); no.type = 'button'; no.addEventListener('click', () => { this.net.handDecline(uid); this.hidePrompt(); });
    const t = el('div', 'mon-enc-timer'); t.style.animationDuration = `${HAND.INVITE_MS}ms`;
    const row = el('div', 'mon-enc-row'); row.append(text, ok, no);
    this.prompt.append(row, t); this.prompt.classList.remove('hidden');
    window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.hidePrompt(), HAND.INVITE_MS);
  }
  private hidePrompt() { window.clearTimeout(this.timer); this.prompt.classList.add('hidden'); }
}
