import type { NetClient } from '@/net/client';
import { ABOUT, CREDITS, THANKS, THANKS_LINE_MAX, THANKS_MAX_LINES, cleanThanks, copyrightLine } from '@/shared/about';

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

/** 「关于」（「设置」面板的「关于」页）：作者声明、作者链接、许可、致谢。 */
export class AboutSection {
  readonly view = el('div', 'about-body');
  /** 致谢文字：服务器上站长写的（null = 没写过，用 shared/about.ts 里的默认）；站长在这里可以直接改 */
  private lines: string[] | null = null;
  private thanksBox = el('div', 'about-thanks');
  private editBtn = el('button', 'btn about-edit-btn', '✏️ 编辑致谢（站长）');
  private form = el('div', 'about-edit hidden');
  private area = el('textarea', 'about-edit-area');
  private note = el('div', 'about-edit-note');

  constructor(private net?: NetClient) {
    const body = this.view;
    body.append(el('div', 'about-name', ABOUT.title), el('div', 'about-copy', copyrightLine() + ' · 保留所有权利'));

    const who = el('div', 'about-sec'); who.append(el('div', 'about-h', '作者'));
    const links = el('div', 'about-links');
    links.append(link('项目仓库 · PixelCampus', ABOUT.repo));
    links.append(link(`GitHub 主页 · ${ABOUT.author}`, ABOUT.github));
    if (ABOUT.homepage) links.append(link('个人主页', ABOUT.homepage));
    links.append(link('游戏地址', ABOUT.site));
    who.append(links); body.append(who);

    const dev = el('div', 'about-sec'); dev.append(el('div', 'about-h', '一起开发'));
    dev.append(el('div', 'about-p', '这个游戏的代码公开在 GitHub，欢迎一起协作开发：fork 仓库，在自己的分支里改好，提交 Pull Request；经作者审核同意后才会合并，上线由作者统一部署。想法和建议也可以在仓库里提 Issue。'));
    const devLinks = el('div', 'about-links');
    devLinks.append(link('如何参与（协作流程）', `${ABOUT.repo}/blob/main/docs/COLLABORATION.md`), link('提想法 / 报问题', `${ABOUT.repo}/issues`));
    dev.append(devLinks); body.append(dev);

    const lic = el('div', 'about-sec'); lic.append(el('div', 'about-h', '许可'));
    lic.append(el('div', 'about-p', `${ABOUT.license}。可以游玩、为个人学习阅读和运行；未经许可不得商用、转载或二次发布，也不得去掉署名和水印。提交的贡献按许可授权给作者。`));
    lic.append(link('完整许可条款', `./${ABOUT.licenseFile}`)); body.append(lic);

    const th = el('div', 'about-sec'); th.append(el('div', 'about-h', '致谢'));
    th.append(this.thanksBox); this.renderThanks();
    if (this.net) { th.append(this.editBtn, this.form); this.setupEdit(this.net); }
    const list = el('div', 'about-credits');
    for (const c of CREDITS) {
      const row = el('div', 'about-credit');
      row.append(c.url ? link(c.name, c.url) : el('span', undefined, c.name), el('span', 'about-by', ` · ${c.by} · ${c.license}`));
      if (c.note) row.append(el('div', 'about-note', c.note));
      list.append(row);
    }
    th.append(list); body.append(th);
  }

  /** 把致谢画出来（玩家看到的和站长写的一样；文字一律 textContent） */
  private renderThanks() {
    this.thanksBox.replaceChildren(...(this.lines ?? THANKS).map((t) => el('div', 'about-p', t)));
  }

  /** 站长编写：只有站长（owner）看得到按钮；一行一段，保存后服务器广播给所有人 */
  private setupEdit(net: NetClient) {
    this.editBtn.type = 'button';
    const isOwner = () => net.isAdmin && net.adminRole === 'owner';
    const sync = () => { this.editBtn.classList.toggle('hidden', !isOwner()); if (!isOwner()) this.form.classList.add('hidden'); };
    sync(); net.onAdmin(sync);
    const prev = net.handlers.aboutThanks;
    net.handlers.aboutThanks = (t) => { prev?.(t); this.lines = t; this.renderThanks(); if (!this.form.classList.contains('hidden')) this.note.textContent = '已保存，所有人都会看到新的致谢。'; };
    this.area.rows = 8; this.area.maxLength = THANKS_MAX_LINES * (THANKS_LINE_MAX + 1); this.area.placeholder = '一行写一段致谢，最多 20 行、每行 200 字。';
    const save = el('button', 'btn primary', '保存'), reset = el('button', 'btn', '恢复默认'), cancel = el('button', 'btn', '取消');
    for (const b of [save, reset, cancel]) b.type = 'button';
    const bar = el('div', 'about-edit-bar'); bar.append(save, reset, cancel);
    this.form.append(this.area, bar, this.note);
    this.editBtn.addEventListener('click', () => { this.area.value = (this.lines ?? THANKS).join('\n'); this.note.textContent = ''; this.form.classList.toggle('hidden'); if (!this.form.classList.contains('hidden')) this.area.focus(); });
    save.addEventListener('click', () => {
      if (net.status !== 'online') { this.note.textContent = '没连上服务器，现在不能保存。'; return; }
      const lines = cleanThanks(this.area.value.split('\n')) ?? [];
      if (!lines.length) { this.note.textContent = '至少写一行（想用默认的，点「恢复默认」）。'; return; }
      net.aboutThanksSet(lines); this.note.textContent = '保存中…';
    });
    reset.addEventListener('click', () => { if (net.status !== 'online') { this.note.textContent = '没连上服务器，现在不能保存。'; return; } net.aboutThanksSet(null); this.note.textContent = '已恢复默认。'; this.area.value = THANKS.join('\n'); });
    cancel.addEventListener('click', () => { this.form.classList.add('hidden'); });
    this.area.addEventListener('keydown', (e) => e.stopPropagation()); // 在输入框里打字，别触发游戏快捷键
  }
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
