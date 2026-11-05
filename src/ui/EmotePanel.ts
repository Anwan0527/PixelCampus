import { EMOTES } from '@/shared/emotes';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 表情选择条：屏幕下方一排表情，点一下（或按数字键 1–9）就在头顶冒出来。不挡住画面，也不暂停游戏。
 * 电脑按 X 或点右侧「表情」，手机点 ☰ → 表情。表情本身由服务器限频后广播给周围的人。
 */
export class EmotePanel {
  private root = el('div', 'hidden');

  constructor(private onPick: (id: number) => void) {
    this.root.id = 'emote-bar';
    EMOTES.forEach((e, i) => {
      const b = el('button', 'emote-btn'); b.type = 'button'; b.title = e.name; b.setAttribute('aria-label', e.name);
      b.append(el('span', 'emote-ico', e.icon), el('span', 'emote-name', e.name), el('span', 'emote-key', String(i + 1)));
      b.addEventListener('click', () => { this.pick(i); });
      this.root.append(b);
    });
    window.addEventListener('keydown', (ev) => {
      if (!this.isOpen) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (ev.key === 'Escape') { this.close(); return; }
      const n = Number(ev.key);
      if (Number.isInteger(n) && n >= 1 && n <= EMOTES.length) this.pick(n - 1);
    });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'emote', label: '表情', key: 'X', run: () => this.toggle() });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private pick(i: number) { this.close(); this.onPick(i); }
}
