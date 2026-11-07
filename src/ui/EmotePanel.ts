import { EMOTES, EMOTE_GROUPS, emoteDef } from '@/shared/emotes';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 表情选择板：屏幕下方，按「情绪 / 社交 / 动作」分组，每个格子是图标 + 名字，点一下（或按数字键 1–9 = 老的 9 个表情）就在头顶冒出来。
 * 不挡住画面，也不暂停游戏。电脑按 X 或点右侧「表情」，手机点 ☰ → 表情。表情本身由服务器限频、校验后广播给周围的人。
 * 持续型（躺下 / 坐地）的格子带「持续」小标，再点一次就站起来。
 */
export class EmotePanel {
  private root = el('div', 'hidden');

  constructor(private onPick: (id: number) => void) {
    this.root.id = 'emote-bar';
    for (const g of EMOTE_GROUPS) {
      const sec = el('div', 'emote-group'), row = el('div', 'emote-row');
      sec.append(el('div', 'emote-gname', g.name), row);
      for (const id of g.ids) {
        const e = emoteDef(id); if (!e) continue;
        const b = el('button', 'emote-btn'); b.type = 'button'; b.title = e.hold ? `${e.name}（持续，再点一次站起来）` : e.name; b.setAttribute('aria-label', e.name); b.dataset.id = String(e.id);
        b.append(el('span', 'emote-ico', e.icon), el('span', 'emote-name', e.name));
        if (e.id < 9) b.append(el('span', 'emote-key', String(e.id + 1)));
        if (e.hold) b.append(el('span', 'emote-hold', '持续'));
        b.addEventListener('click', () => { this.pick(e.id); });
        row.append(b);
      }
      this.root.append(sec);
    }
    window.addEventListener('keydown', (ev) => {
      if (!this.isOpen) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (ev.key === 'Escape') { this.close(); return; }
      const n = Number(ev.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && n <= EMOTES.length) this.pick(n - 1);
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
