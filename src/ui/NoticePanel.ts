import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, type Notice } from '@/shared/notice';
import type { NetClient } from '@/net/client';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const day = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DISMISS_KEY = 'pixelcampus.notice.dismissed';
const readDismissed = () => { try { return Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { return 0; } };
const saveDismissed = (id: number) => { try { localStorage.setItem(DISMISS_KEY, String(id)); } catch { /* 存储不可用：仅本次有效 */ } };

/**
 * 公告栏：进游戏时如果有"你还没选过不再提醒"的最新公告就自动弹出；「不再提醒这条」记在本机，管理员发布新公告后会再次弹出。
 * 管理员登录后可以发布新公告（所有在线玩家会收到提示）、修改、删除。公告内容一律用 textContent 渲染。
 */
export class NoticePanel {
  private root = el('div', 'screen hidden');
  private body = el('div', 'notice-body');
  private older = el('div', 'notice-older');
  private dismissBtn = el('button', 'btn', '不再提醒这条');
  private form = el('div', 'notice-form hidden');
  private titleIn = el('input'); private bodyIn = el('textarea'); private count = el('span', 'board-count');
  private saveBtn = el('button', 'btn primary', '发布');
  private adminBar = el('div', 'board-admin hidden');
  private items: Notice[] = [];
  private editing: number | null = null;
  private dismissed = readDismissed();
  private shown = false;      // 本次进入是否已经自动弹过
  private openOlder = new Set<number>();

  /** onFresh：别人刚发布了新公告时的提示（横幅 + 公屏），由场景提供 */
  constructor(private net: NetClient, private onFresh: (title: string) => void) {
    const panel = el('div', 'box notice');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭公告');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '📢 公告'), close);

    this.adminBar.append(el('span', undefined, '🛡 管理员：可以发布 / 修改 / 删除公告'));
    const newBtn = el('button', 'btn', '发布新公告'); newBtn.type = 'button';
    newBtn.addEventListener('click', () => this.openForm(null));
    this.adminBar.append(newBtn);

    this.titleIn.type = 'text'; this.titleIn.maxLength = NOTICE_TITLE_MAX + 10; this.titleIn.placeholder = `标题（最多 ${NOTICE_TITLE_MAX} 字）`; this.titleIn.autocomplete = 'off';
    this.bodyIn.rows = 7; this.bodyIn.maxLength = NOTICE_BODY_MAX + 100; this.bodyIn.placeholder = '内容（可以多行，比如更新日志）'; this.bodyIn.spellcheck = false;
    this.bodyIn.addEventListener('input', () => this.renderCount());
    const fb = el('div', 'board-foot');
    const cancel = el('button', 'btn', '取消'); cancel.type = 'button'; cancel.addEventListener('click', () => this.closeForm());
    this.saveBtn.type = 'button'; this.saveBtn.addEventListener('click', () => this.save());
    const right = el('div', 'notice-form-btns'); right.append(cancel, this.saveBtn);
    fb.append(this.count, right);
    this.form.append(this.titleIn, this.bodyIn, fb);

    this.dismissBtn.type = 'button'; this.dismissBtn.addEventListener('click', () => this.toggleDismiss());
    const ok = el('button', 'btn primary', '知道了'); ok.type = 'button'; ok.addEventListener('click', () => this.close());
    const foot = el('div', 'create-btns'); foot.append(this.dismissBtn, ok);
    panel.append(head, this.adminBar, this.form, this.body, this.older, foot);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);

    ui.add({ id: 'notice', label: '公告', key: 'N', run: () => this.toggle() });
    net.handlers.notices = (items, newId) => this.onNotices(items, newId);
    net.onAdmin((ok) => { this.adminBar.classList.toggle('hidden', !ok); if (!ok) this.closeForm(); this.render(); });
    this.renderCount();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  get latest(): Notice | undefined { return this.items[0]; }
  open() { this.root.classList.remove('hidden'); ui.badge('notice', 0); this.render(); }
  close() { this.root.classList.add('hidden'); this.closeForm(); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private onNotices(items: Notice[], newId?: number) {
    this.items = items;
    const latest = items[0];
    if (!this.shown) { // 进入游戏后的第一份公告列表：最新的一条没选过"不再提醒"就弹出来
      this.shown = true;
      if (latest && latest.id > this.dismissed) this.open();
    } else if (newId !== undefined && latest && latest.id === newId && !this.net.isAdmin) {
      if (!this.isOpen) ui.badge('notice', 1);
      this.onFresh(latest.title); // 玩家正在玩：不打断，只在横幅/公屏提示 + 菜单角标
    }
    if (this.isOpen) this.render();
  }

  private toggleDismiss() {
    const l = this.latest; if (!l) return;
    this.dismissed = this.dismissed >= l.id ? 0 : l.id; // 再点一次恢复提醒
    saveDismissed(this.dismissed);
    if (this.dismissed >= l.id) this.close(); else this.render();
  }

  private render() {
    const l = this.latest;
    this.body.replaceChildren();
    this.older.replaceChildren();
    if (!l) { this.body.append(el('div', 'board-empty', this.net.status === 'online' ? '还没有公告。' : '连上服务器后能看到公告。')); }
    else {
      this.body.append(this.entry(l, true));
      const rest = this.items.slice(1);
      if (rest.length) {
        this.older.append(el('div', 'notice-older-title', `往期公告（${rest.length}）`));
        for (const n of rest) this.older.append(this.entry(n, false));
      }
    }
    this.dismissBtn.style.display = l ? '' : 'none';
    this.dismissBtn.textContent = l && this.dismissed >= l.id ? '已设为不再提醒（点此恢复）' : '不再提醒这条';
  }

  /** 一条公告。最新的一条展开；往期的点标题展开 */
  private entry(n: Notice, open: boolean): HTMLElement {
    const box = el('div', 'notice-entry');
    const top = el('div', 'notice-top');
    top.append(el('div', 'notice-title', n.title), el('div', 'notice-date', day(n.ts)));
    box.append(top);
    const show = open || this.openOlder.has(n.id);
    if (!open) { top.classList.add('clickable'); top.addEventListener('click', () => { this.openOlder.has(n.id) ? this.openOlder.delete(n.id) : this.openOlder.add(n.id); this.render(); }); }
    if (show) box.append(el('div', 'notice-text', n.body)); // textContent + CSS pre-wrap：保留换行，内容不会被当成网页代码
    if (this.net.isAdmin) {
      const bar = el('div', 'board-actions');
      const ed = el('button', 'board-del', '修改'); ed.type = 'button'; ed.addEventListener('click', () => this.openForm(n));
      const del = el('button', 'board-del', '删除'); del.type = 'button';
      del.addEventListener('click', () => { if (confirm(`删除公告「${n.title}」？`)) this.net.noticeDel(n.id); });
      bar.append(ed, del); box.append(bar);
    }
    return box;
  }

  private openForm(n: Notice | null) {
    this.editing = n?.id ?? null;
    this.titleIn.value = n?.title ?? ''; this.bodyIn.value = n?.body ?? '';
    this.saveBtn.textContent = n ? '保存修改（不会再次弹出）' : '发布（所有人会收到提示）';
    this.form.classList.remove('hidden'); this.renderCount(); this.titleIn.focus();
  }
  private closeForm() { this.form.classList.add('hidden'); this.editing = null; }
  private renderCount() { this.count.textContent = `${Array.from(this.bodyIn.value).length} / ${NOTICE_BODY_MAX}`; }
  private save() {
    const title = this.titleIn.value.trim(), body = this.bodyIn.value.trim();
    if (!title || !body) { alert('公告需要标题和内容'); return; }
    if (this.editing !== null) this.net.noticeEdit(this.editing, title, body); else this.net.noticePublish(title, body);
    this.closeForm();
  }
}
