import { audio } from '@/audio/engine';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 声音设置（「设置」面板的「声音」页）：背景音乐、音效各一个滑条（0 = 关闭），存在浏览器本地。 */
export class SoundSection {
  readonly view = el('div', 'set-sec');

  constructor() {
    const row = (label: string, kind: 'music' | 'sfx') => {
      const r = el('label', 'sound-row'); r.append(el('span', undefined, label));
      const s = el('input'); s.type = 'range'; s.min = '0'; s.max = '100'; s.step = '5'; s.value = String(Math.round(audio.volumes[kind] * 100));
      const n = el('span', 'sound-n', `${s.value}%`);
      s.addEventListener('input', () => { audio.unlock(); audio.setVolume(kind, Number(s.value) / 100); n.textContent = `${s.value}%`; });
      r.append(s, n); this.view.append(r);
    };
    row('背景音乐', 'music'); row('音效', 'sfx');
    this.view.append(el('div', 'create-sub', '声音都是现场合成的，不会下载任何音频文件。浏览器需要你点一下页面之后才允许出声。'));
  }
}
