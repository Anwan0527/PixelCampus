import { BOARD_CATS, BOARD_MAX, validCat, type BoardItem } from '@/shared/board';
import type { NetClient } from '@/net/client';
import { ui } from './actions';
import { askReport } from './ReportDialog';
import type { UserMenuCtx } from './AdminUserMenu';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ts: number) => { const d = new Date(ts); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** 留言板：玩家写下意见/建议/发现的问题，开发者能看到；也能看到别人的留言。电脑按 B 或点右上角按钮，手机点「留言」，或走到场景里的留言板前按 E。 */
export class BoardPanel {
  private root = el('div', 'screen hidden');
  private list = el('div', 'board-list');
  private area = el('textarea');
  private count = el('span', 'board-count');
  private msg = el('div', 'board-msg');
  private send = el('button', 'btn primary', '留言');
  private cats: HTMLButtonElement[] = [];
  private cat = 0;
  private items: BoardItem[] = [];
  private admin = false;
  private adminBar = el('div', 'board-admin hidden');
  private adminLabel = el('span', undefined, '🛡 管理员模式：可以删除任何留言');
  private loginRow = el('div', 'board-login hidden');
  private keyInput = el('input');

  /** hooks：管理员点「管理此人」时打开这个人的管理菜单（禁言 / 封禁 / 撤回…） */
  constructor(private net: NetClient, private adminMenu: (uid: number, ctx: UserMenuCtx) => void = () => {}) {
    const panel = el('div', 'box board');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭留言板');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '留言板'), close);
    panel.append(head, el('div', 'create-sub', '想到什么说什么：建议、遇到的问题、想要的功能都行。开发者会看到每一条，请友善。'));

    const catRow = el('div', 'seg-row');
    BOARD_CATS.forEach((name, i) => {
      const b = el('button', 'seg' + (i === 0 ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.cat = i; this.cats.forEach((c, j) => c.classList.toggle('on', j === i)); });
      this.cats.push(b); catRow.append(b);
    });
    this.area.rows = 3; this.area.maxLength = BOARD_MAX + 20; this.area.placeholder = '写点什么…'; this.area.spellcheck = false;
    this.area.addEventListener('input', () => this.renderCount());
    this.area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); } });
    this.send.type = 'button'; this.send.addEventListener('click', () => this.submit());
    const foot = el('div', 'board-foot'); foot.append(this.count, this.send);
    // 管理员：页脚一个不起眼的入口；登录后顶部出现管理员条，每条留言多出删除按钮
    const adminLink = el('button', 'board-adminlink', '管理员'); adminLink.type = 'button';
    adminLink.addEventListener('click', () => { this.loginRow.classList.toggle('hidden'); if (!this.loginRow.classList.contains('hidden')) this.keyInput.focus(); });
    this.keyInput.type = 'password'; this.keyInput.placeholder = '管理员口令'; this.keyInput.autocomplete = 'new-password'; this.keyInput.maxLength = 200;
    const go = el('button', 'btn', '登录'); go.type = 'button';
    const login = () => { const k = this.keyInput.value; if (!k) return; this.net.adminLogin(k); this.keyInput.value = ''; };
    go.addEventListener('click', login); this.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); login(); } });
    this.loginRow.append(this.keyInput, go);
    const out = el('button', 'btn', '退出管理员'); out.type = 'button'; out.addEventListener('click', () => this.net.adminLogout());
    this.adminBar.append(this.adminLabel, out);
    const bottom = el('div', 'board-bottom'); bottom.append(adminLink);
    panel.append(this.adminBar, catRow, this.area, foot, this.msg, this.list, this.loginRow, bottom);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);

    ui.add({ id: 'board', label: '留言板', key: 'B', run: () => this.toggle() }); // 电脑侧边按钮 / 手机菜单

    net.handlers.board = (items) => { this.items = items; this.renderList(); };
    net.handlers.boardNew = (it) => { this.items = [it, ...this.items.filter((x) => x.id !== it.id)].slice(0, 50); if (this.isOpen) this.renderList(); };
    net.handlers.boardResult = (ok, text) => {
      this.setMsg(text, ok);
      if (ok) { this.area.value = ''; this.renderCount(); }
      this.send.disabled = false;
    };
    net.handlers.boardDel = (ids) => { const gone = new Set(ids); this.items = this.items.filter((x) => !gone.has(x.id)); this.renderList(); };
    net.onAdmin((ok, text) => {
      this.admin = ok; this.adminBar.classList.toggle('hidden', !ok); if (ok) this.adminLabel.textContent = `🛡 管理员模式（${net.adminRole === 'mod' ? '协管员' : '站长'}）：可以删除任何留言`; if (ok) this.loginRow.classList.add('hidden');
      if (text) this.setMsg(text, ok);
      if (this.isOpen) this.net.getBoard(); // 身份变了：重新拉一遍（管理员的列表带作者标识）
      else this.renderList();
    });
    net.onStatus(() => { if (this.isOpen) this.refresh(); });
    this.renderCount(); this.renderList();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); this.msg.textContent = ''; this.refresh(); }
  close() { this.area.blur(); this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private refresh() {
    const on = this.net.status === 'online';
    this.send.disabled = !on; this.area.disabled = !on;
    if (!on) this.setMsg('没连上服务器，暂时不能留言（也看不到别人的留言）。', false);
    else { if (this.msg.classList.contains('bad')) this.msg.textContent = ''; this.net.getBoard(); }
  }

  private submit() {
    if (!validCat(this.cat)) return;
    const text = this.area.value.trim();
    if (!text) { this.setMsg('先写点内容吧', false); return; }
    this.send.disabled = true; this.setMsg('发送中…', true);
    this.net.postBoard(this.cat, text);
    window.setTimeout(() => { this.send.disabled = this.net.status !== 'online'; }, 4000); // 兜底：没收到回执也别一直卡着
  }

  private setMsg(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }
  private renderCount() { this.count.textContent = `${Array.from(this.area.value).length} / ${BOARD_MAX}`; }

  private renderList() {
    this.list.replaceChildren();
    if (!this.items.length) { this.list.append(el('div', 'board-empty', this.net.status === 'online' ? '还没有人留言，来当第一个吧。' : '连上服务器后能看到大家的留言。')); return; }
    for (const it of this.items) {
      const row = el('div', 'board-item');
      const top = el('div', 'board-item-top');
      const tag = el('span', 'board-tag', BOARD_CATS[it.cat] ?? '其他');
      const who = el('span', 'board-who', it.name); who.style.color = `hsl(${it.hue} 60% 32%)`;
      top.append(tag, who, el('span', 'board-time', fmt(it.ts)));
      row.append(top, el('div', 'board-text', it.text)); // 一律 textContent，玩家写的内容不会被当成网页代码执行
      if (!this.admin) { // 普通玩家：自己的留言可以删；别人的留言可以举报
        const bar = el('div', 'board-actions');
        if (it.mine) {
          const del = el('button', 'board-del', '删除我的留言'); del.type = 'button';
          del.addEventListener('click', () => { if (confirm(`删除你的这条留言？\n\n${it.text.slice(0, 60)}`)) this.net.delBoard(it.id); });
          bar.append(del);
        } else {
          const rep = el('button', 'board-rep', '⚑ 举报'); rep.type = 'button';
          rep.addEventListener('click', () => askReport({ kind: 'board', ref: it.id, preview: `${it.name}：${it.text}` }));
          bar.append(rep);
        }
        row.append(bar);
      }
      if (this.admin) {
        const bar = el('div', 'board-actions');
        const del = el('button', 'board-del', '删除'); del.type = 'button';
        del.addEventListener('click', () => { if (confirm(`删除这条留言？\n\n${it.name}：${it.text.slice(0, 60)}`)) this.net.delBoard(it.id); });
        bar.append(del);
        if (it.uid) { const uid = it.uid, mg = el('button', 'board-del', '管理此人…'); mg.type = 'button'; mg.addEventListener('click', () => { this.close(); this.adminMenu(uid, { name: it.name, text: it.text }); }); bar.append(mg); }
        if (it.by) {
          const by = it.by, delAll = el('button', 'board-del', `删此人全部（${by.slice(0, 6)}）`); delAll.type = 'button';
          delAll.addEventListener('click', () => { if (confirm(`删除作者 ${it.name}（${by.slice(0, 6)}）的所有留言？`)) this.net.delBoardBy(by); });
          bar.append(delAll);
        }
        row.append(bar);
      }
      this.list.append(row);
    }
  }
}
