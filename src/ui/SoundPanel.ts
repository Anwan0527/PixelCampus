import { audio } from '@/audio/engine';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 声音设置：背景音乐、音效各一个滑条（0 = 关闭），存在浏览器本地。电脑点右侧「声音」，手机点 ☰ → 声音。 */
export class SoundPanel {
  private root = el('div', 'screen hidden');

  constructor() {
    const panel = el('div', 'box sound');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭声音设置');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '声音'), close);
    panel.append(head);
    const row = (label: string, kind: 'music' | 'sfx') => {
      const r = el('label', 'sound-row'); r.append(el('span', undefined, label));
      const s = el('input'); s.type = 'range'; s.min = '0'; s.max = '100'; s.step = '5'; s.value = String(Math.round(audio.volumes[kind] * 100));
      const n = el('span', 'sound-n', `${s.value}%`);
      s.addEventListener('input', () => { audio.unlock(); audio.setVolume(kind, Number(s.value) / 100); n.textContent = `${s.value}%`; });
      r.append(s, n); panel.append(r);
    };
    row('背景音乐', 'music'); row('音效', 'sfx');
    panel.append(el('div', 'create-sub', '声音都是现场合成的，不会下载任何音频文件。浏览器需要你点一下页面之后才允许出声。'));
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'sound', label: '声音', run: () => this.toggle() });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
}
