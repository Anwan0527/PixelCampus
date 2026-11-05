import { ABOUT, CREDITS, THANKS, copyrightLine } from '@/shared/about';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
/** 外链：链接地址只来自 shared/about.ts 里的常量，不含玩家输入 */
const link = (text: string, href: string) => {
  const a = el('a', 'about-link', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
};

/** 「关于」：作者声明、作者链接、许可、致谢。电脑在左上角「菜单」里，手机在 ☰ 里。 */
export class AboutPanel {
  private root = el('div', 'screen hidden');

  constructor() {
    const panel = el('div', 'box about');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭关于');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '关于'), close);
    const body = el('div', 'about-body');

    body.append(el('div', 'about-name', ABOUT.title), el('div', 'about-copy', copyrightLine() + ' · 保留所有权利'));

    const who = el('div', 'about-sec'); who.append(el('div', 'about-h', '作者'));
    const links = el('div', 'about-links');
    links.append(link(`GitHub 主页 · ${ABOUT.author}`, ABOUT.github));
    if (ABOUT.homepage) links.append(link('个人主页', ABOUT.homepage));
    links.append(link('游戏地址', ABOUT.site));
    who.append(links); body.append(who);

    const lic = el('div', 'about-sec'); lic.append(el('div', 'about-h', '许可'));
    lic.append(el('div', 'about-p', `${ABOUT.license}。可以游玩、为个人学习阅读和运行；未经许可不得商用、转载或二次发布，也不得去掉署名和水印。`));
    lic.append(link('完整许可条款', `./${ABOUT.licenseFile}`)); body.append(lic);

    const th = el('div', 'about-sec'); th.append(el('div', 'about-h', '致谢'));
    for (const t of THANKS) th.append(el('div', 'about-p', t));
    const list = el('div', 'about-credits');
    for (const c of CREDITS) {
      const row = el('div', 'about-credit');
      row.append(c.url ? link(c.name, c.url) : el('span', undefined, c.name), el('span', 'about-by', ` · ${c.by} · ${c.license}`));
      if (c.note) row.append(el('div', 'about-note', c.note));
      list.append(row);
    }
    th.append(list); body.append(th);

    panel.append(head, body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'about', label: '关于', run: () => this.toggle() });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
}

/**
 * 画面角落的小水印（版权行）。放在 #hud 里，不挡操作；被人从页面里删掉会自动放回去。
 * 前端水印拦不住有心人，它的作用是让截图、录屏、直播里一直带着作者署名；真正的保护是 LICENSE 和提交历史。
 */
export function mountWatermark() {
  const hud = document.getElementById('hud') ?? document.body;
  const make = () => { const w = el('div', undefined, copyrightLine()); w.id = 'wm'; w.setAttribute('aria-hidden', 'true'); return w; };
  let wm = make(); hud.append(wm);
  try {
    new MutationObserver(() => { if (!wm.isConnected || wm.textContent !== copyrightLine()) { wm.remove(); wm = make(); hud.append(wm); } })
      .observe(hud, { childList: true, subtree: true, characterData: true });
  } catch { /* 没有 MutationObserver 就算了 */ }
}
