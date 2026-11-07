import { TITLES, titleDef } from '@/shared/titles';
import type { NetClient } from '@/net/client';
import type { Host, Section } from './hosted';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 称号（图鉴里的「称号」页）：已获得的可以点一下佩戴（再点取消），没获得的显示怎么得到。
 * 佩戴哪个由服务器记录并告诉周围的人——这里只发"我想戴这个"，服务器认可后会推送最新的称号列表。
 * 从学生证 / 设置里点「称号」会打开图鉴并切到这一页。
 */
export class TitlePanel implements Section {
  readonly view = el('div', 'cx-sec');
  private list = el('div', 'ach-list');
  private count = el('div', 'create-sub');
  private note = el('div', 'bag-note');
  private own: Record<string, number> = {};
  private sel = '';
  private loaded = false;
  private admin = false;
  private host: Host<'titles'> | null = null;

  constructor(private net: NetClient) {
    this.view.append(this.count, this.list, this.note);
    this.render();
  }

  attach(host: Host<'titles'>) { this.host = host; }
  get isOpen() { return !!this.host?.isOpenOn('titles'); }
  /** 当前佩戴的称号 id */
  get selected() { return this.sel; }
  open() { this.host?.open('titles'); }
  close() { if (this.isOpen) this.host?.close(); }
  enter() { this.net.getTitles(); this.render(); }
  /** 服务器推来最新的称号列表 */
  set(own: Record<string, number>, sel: string) { this.loaded = true; this.own = own; this.sel = sel; this.render(); }
  setAdmin(on: boolean) { this.admin = on; this.render(); }

  private render() {
    const have = (id: string) => !!this.own[id] || (id === 'admin' && this.admin);
    const customs = Object.keys(this.own).map((id) => titleDef(id)).filter((t): t is NonNullable<ReturnType<typeof titleDef>> => !!t?.custom); // 管理员手写发的专属称号
    const shown = [...customs, ...TITLES.filter((t) => !t.special || have(t.id))];
    this.count.textContent = `已获得 ${shown.filter((t) => have(t.id)).length} / ${shown.length}　点一个称号佩戴，再点一次取消`;
    this.list.replaceChildren();
    for (const t of shown) {
      const got = have(t.id), on = this.sel === t.id;
      const row = el('div', 'ach-row ttl-row' + (got ? ' done' : '') + (on ? ' ttl-on' : ''));
      const tag = el('div', 'ttl-tag', t.custom ? `✦ ${t.name}` : t.name); tag.style.color = got ? t.color : '#8a7a60';
      const mid = el('div', 'ach-mid'); mid.append(el('div', 'ach-desc', t.custom ? '管理员专门授予你的称号' : got ? t.how : `未获得：${t.how}`));
      row.append(tag, mid);
      if (on) row.append(el('div', 'ach-time', '佩戴中'));
      if (got) { row.style.cursor = 'pointer'; row.addEventListener('click', () => this.net.setTitle(on ? '' : t.id)); }
      this.list.append(row);
    }
    this.note.textContent = this.net.status !== 'online' ? '现在没有连上服务器，称号暂时无法更新。' : this.loaded ? '' : '读取中…';
  }
}
export { titleDef };
