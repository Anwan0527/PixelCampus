import { WALL_COMMENT_MAX, WALL_POST_MAX, notePaper, noteTilt, wallRelTime, type WallComment, type WallPost, type WallSort } from '@/shared/wall';
import type { NetClient } from '@/net/client';
import { askReport } from './ReportDialog';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SORT_KEY = 'pixelcampus.wallSort';
const loadSort = (): WallSort => { try { return localStorage.getItem(SORT_KEY) === 'new' ? 'new' : 'hot'; } catch { return 'hot'; } };
const saveSort = (s: WallSort) => { try { localStorage.setItem(SORT_KEY, s); } catch { /* 存储不可用：忽略 */ } };

/**
 * 校园墙：站在广场东侧的校园墙前按 E 打开。一面贴满便利贴的墙——每条帖子是一张小便利贴（纸色按作者名取、固定的轻微倾斜、顶上一颗图钉、右下角折角），
 * 网格排列（电脑 4 列 / 手机 2 列）；可以按「最热 / 最新」看；点便利贴看全文和评论。
 * 管理员（含协管员）分「已发布 / 待审核」两栏：待审核栏的便利贴贴着"待审核"胶带，带通过 / 驳回；已发布栏不会出现待审核帖。
 * 普通玩家只看到已发布的，自己发的、还在审核的帖子会排在最前面并标「审核中」。
 * 匿名只对别的玩家有效：管理员能看到作者；被多人举报的帖子会先折叠。所有玩家写的字一律 textContent 显示。
 */
export class WallPanel {
  private root = el('div', 'screen hidden');
  private feed = el('div', 'wall-feed');
  private more = el('button', 'btn wall-morebtn', '再看更多');
  private area = el('textarea');
  private anon = el('input');
  private count = el('span', 'board-count');
  private msg = el('div', 'board-msg');
  private send = el('button', 'btn primary', '贴上墙');
  private composer = el('div', 'wall-compose hidden');
  private composeBtn = el('button', 'btn wall-compose-btn', '✏️ 贴一张便利贴');
  private sortBar = el('div', 'wall-sort');
  private items: WallPost[] = [];
  private hasMore = false;
  private open_: { post: WallPost; comments: WallComment[] } | null = null;
  private admin = false;
  /** 当前栏：已发布 / 待审核（管理员才有）；排序；热度排序的下一页偏移与排名时间 */
  private tab: 'pub' | 'pending' = 'pub'; private sort: WallSort = loadSort(); private nextOff = 0; private rankAt = 0;
  private pendingN = 0;
  private tabBar = el('div', 'wall-modbar hidden');
  private menu: HTMLElement | null = null;
  /** 当前画的是列表还是某条帖子的详情；进详情前记下列表的滚动位置，返回时还原（点赞、刷新、翻页重画也不跳回顶部） */
  private view: 'list' | 'thread' | null = null; private listTop = 0;

  constructor(private net: NetClient) {
    const panel = el('div', 'box wall');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭校园墙');
    close.addEventListener('click', () => this.close());
    const refresh = el('button', 'btn', '刷新'); refresh.type = 'button'; refresh.addEventListener('click', () => this.fetch());
    const right = el('div', 'wall-head-r'); right.append(this.sortBar, refresh, close);
    head.append(el('div', 'board-title', '📌 校园墙'), right);

    this.area.rows = 3; this.area.maxLength = WALL_POST_MAX + 20; this.area.placeholder = '想说点什么？表白、吐槽、求助、找东西……请友善。'; this.area.spellcheck = false;
    this.area.addEventListener('input', () => this.renderCount());
    this.area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); } else if (e.key === 'Escape') { this.area.blur(); this.collapse(); } });
    this.anon.type = 'checkbox';
    const anonLbl = el('label', 'wall-anon'); anonLbl.append(this.anon, document.createTextNode(' 匿名'));
    this.send.type = 'button'; this.send.addEventListener('click', () => this.submit());
    const fold = el('button', 'btn', '收起'); fold.type = 'button'; fold.addEventListener('click', () => this.collapse());
    const foot = el('div', 'wall-compose-foot'); const l = el('div', 'wall-foot-l'); l.append(anonLbl, this.count); const r = el('div', 'wall-foot-r'); r.append(fold, this.send); foot.append(l, r);
    this.composer.append(el('div', 'wall-compose-tip', '发帖先经管理员审核；匿名帖别人看不到你是谁（管理员除外）。'), this.area, foot);
    this.composeBtn.type = 'button'; this.composeBtn.addEventListener('click', () => this.expand());
    this.more.type = 'button'; this.more.addEventListener('click', () => this.fetchMore());

    panel.append(head, this.tabBar, this.composeBtn, this.composer, this.msg, this.feed);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); else if (this.menu && !(e.target as HTMLElement).closest('.wall-menu, .wall-more')) this.closeMenu(); });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen) return;
      if (this.menu) this.closeMenu(); else if (this.open_) this.back(); else this.close();
    });
    (document.getElementById('hud') ?? document.body).append(this.root);

    const h = net.handlers;
    h.wallPosts = (items, more, append, pending, meta) => {
      if (meta?.tab && meta.tab !== this.tab) return;                       // 切了栏 / 切了排序，这是旧请求的回包：丢掉
      if (this.tab === 'pub' && meta?.sort && meta.sort !== this.sort) return;
      if (append) { const have = new Set(this.items.map((x) => x.id)); this.items = [...this.items, ...items.filter((x) => !have.has(x.id))]; } else this.items = items;
      this.hasMore = more;
      if (meta?.next !== undefined) this.nextOff = meta.next;
      if (meta?.at !== undefined) this.rankAt = meta.at;
      if (pending !== undefined) this.pendingN = pending;
      this.renderTabs(); if (!this.open_) this.renderFeed();
    };
    h.wallThread = (post, comments) => { this.open_ = { post, comments }; const i = this.items.findIndex((x) => x.id === post.id); if (i >= 0) this.items[i] = post; this.renderThread(); };
    h.wallResult = (ok, text) => {
      this.setMsg(text, ok); this.send.disabled = false;
      if (ok && text.includes('贴上校园墙')) { this.area.value = ''; this.renderCount(); this.collapse(); }
    };
    net.onAdmin((ok) => { this.admin = ok; if (!ok) this.tab = 'pub'; this.renderTabs(); if (this.isOpen) this.fetch(); });
    this.renderCount(); this.renderSort();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 全局 Esc（escstack）调这个：先关「⋯」菜单，再从帖子详情退回列表，最后才关面板 */
  escape() { if (this.menu) this.closeMenu(); else if (this.open_) this.back(); else this.close(); }
  open() {
    this.root.classList.remove('hidden'); this.open_ = null; this.view = null; this.listTop = 0; this.msg.textContent = ''; this.send.disabled = this.net.status !== 'online';
    this.tab = 'pub'; this.collapse(); this.closeMenu(); this.renderTabs(); this.renderSort(); this.fetch(); this.renderFeed();
  }
  close() { this.area.blur(); this.closeMenu(); this.root.classList.add('hidden'); }

  /** 重新请求第一页（当前栏 + 当前排序） */
  private fetch() { this.nextOff = 0; this.net.wallList(undefined, this.tab === 'pending', { sort: this.tab === 'pub' ? this.sort : 'new' }); }
  private fetchMore() {
    if (this.tab === 'pending' || this.sort === 'new') { const last = [...this.items].reverse().find((x) => !x.pending); if (last) this.net.wallList(last.id, this.tab === 'pending', { sort: 'new' }); }
    else this.net.wallList(undefined, false, { sort: 'hot', off: this.nextOff, at: this.rankAt });
  }
  /** 切栏 / 切排序：列表和滚动位置都重置 */
  private reset(afterFetch: () => void) { this.items = []; this.hasMore = false; this.open_ = null; this.view = null; this.listTop = 0; this.closeMenu(); afterFetch(); this.renderFeed(); this.feed.scrollTop = 0; }

  /** 管理员的「已发布 / 待审核（n）」页签（待审核有数量红点） */
  private renderTabs() {
    this.tabBar.classList.toggle('hidden', !this.admin); this.tabBar.replaceChildren();
    this.sortBar.classList.toggle('hidden', this.tab === 'pending');
    if (!this.admin) return;
    const mk = (label: string, tab: 'pub' | 'pending') => {
      const b = el('button', 'seg' + (this.tab === tab ? ' on' : ''), label); b.type = 'button';
      if (tab === 'pending' && this.pendingN > 0) b.append(el('span', 'wall-dot', String(this.pendingN)));
      b.addEventListener('click', () => { if (this.tab === tab) return; this.tab = tab; this.renderTabs(); this.reset(() => this.fetch()); });
      return b;
    };
    this.tabBar.append(el('span', 'wall-modlbl', '🛡 管理'), mk('已发布', 'pub'), mk('待审核', 'pending'));
  }
  /** 「最热 / 最新」分段按钮 */
  private renderSort() {
    this.sortBar.replaceChildren();
    for (const [s, label] of [['hot', '🔥 最热'], ['new', '🕒 最新']] as const) {
      const b = el('button', 'seg' + (this.sort === s ? ' on' : ''), label); b.type = 'button';
      b.addEventListener('click', () => { if (this.sort === s) return; this.sort = s; saveSort(s); this.renderSort(); this.reset(() => this.fetch()); });
      this.sortBar.append(b);
    }
  }
  private expand() { this.composer.classList.remove('hidden'); this.composeBtn.classList.add('hidden'); window.setTimeout(() => this.area.focus(), 0); }
  private collapse() { this.composer.classList.add('hidden'); this.composeBtn.classList.remove('hidden'); }
  private back() { this.open_ = null; this.renderFeed(); this.fetch(); }
  private setMsg(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }
  private renderCount() { this.count.textContent = `${Array.from(this.area.value).length}/${WALL_POST_MAX}`; }

  private submit() {
    const text = this.area.value.trim();
    if (!text) { this.setMsg('先写点内容吧', false); return; }
    if (this.net.status !== 'online') { this.setMsg('没连上服务器，现在不能发帖', false); return; }
    this.send.disabled = true; this.setMsg('发送中…', true);
    this.net.wallPost(text, this.anon.checked);
    window.setTimeout(() => { this.send.disabled = this.net.status !== 'online'; }, 4000);
  }

  private who(name: string, hue: number, anon: boolean, extra?: string) {
    const w = el('span', 'board-who', name); w.style.color = `hsl(${hue} 55% 32%)`;
    const box = el('span', 'wall-who'); box.append(w);
    if (anon) box.append(el('span', 'wall-tag', '匿名'));
    if (extra) box.append(el('span', 'wall-tag op', extra));
    return box;
  }
  /** 管理员额外看到的真实身份 */
  private realTag(real?: string, uid?: number, by?: string) {
    if (!this.admin || !real) return null;
    const t = el('span', 'wall-real', `🛡 ${real}${uid ? `（${uid}）` : ''}`); t.title = by ?? ''; return t;
  }
  /** 便利贴的纸色和倾斜（按作者名的 hue / 帖子 id 固定，重画不变） */
  private paper(card: HTMLElement, p: WallPost, tilt = true) {
    const pp = notePaper(p.hue);
    card.style.setProperty('--paper', pp.bg); card.style.setProperty('--edge', pp.edge); card.style.setProperty('--tilt', `${tilt ? noteTilt(p.id) : 0}deg`);
  }

  private renderFeed() {
    const keep = this.view === 'list' ? this.feed.scrollTop : this.listTop;
    this.feed.replaceChildren();
    this.view = 'list';
    this.renderCards();
    this.feed.scrollTop = keep;
  }
  private renderCards() {
    if (!this.items.length) { this.feed.append(el('div', 'board-empty', this.net.status === 'online' ? (this.tab === 'pending' ? '没有待审核的帖子。' : '墙上还空空的，来贴第一张吧。') : '连上服务器后能看到校园墙。')); return; }
    const grid = el('div', 'wall-grid'), now = Date.now();
    for (const p of this.items) grid.append(this.note(p, now));
    this.feed.append(grid);
    if (this.hasMore) this.feed.append(this.more);
  }

  /** 一张便利贴 */
  private note(p: WallPost, now: number) {
    const card = el('div', 'wall-note' + (p.hidden ? ' hidden-post' : '') + (p.pending ? ' is-pending' : '')); this.paper(card, p);
    if (p.pending) card.append(el('div', 'wall-ribbon', this.admin ? '待审核' : '审核中'));
    const menu = this.moreBtn(p); if (menu) card.append(menu);
    const real = this.realTag(p.real, p.uid, p.by); if (real) card.append(real);
    card.append(el('div', 'wall-note-text', p.hidden ? '（被多人举报，已折叠，等管理员处理）' : p.text));
    const foot = el('div', 'wall-note-foot');
    const who = el('span', 'wall-note-who', p.name); who.style.color = `hsl(${p.hue} 50% 30%)`;
    foot.append(who, el('span', 'wall-note-time', wallRelTime(p.ts, now)));
    if (!p.pending) {
      const like = el('button', 'wall-act' + (p.liked ? ' on' : ''), `${p.liked ? '❤' : '♡'} ${p.likes}`); like.type = 'button'; like.setAttribute('aria-label', '点赞');
      like.addEventListener('click', (e) => { e.stopPropagation(); this.net.wallLike(p.id); });
      foot.append(like, el('span', 'wall-note-cm', `💬 ${p.comments}`));
      card.addEventListener('click', () => this.net.wallOpen(p.id));
    } else if (p.mine && !this.admin) card.addEventListener('click', () => this.net.wallOpen(p.id));
    card.append(foot);
    if (p.pending && this.admin) { // 待审核栏：通过 / 驳回就在便利贴上
      const bar = el('div', 'wall-review');
      const ok = el('button', 'btn primary', '通过'), no = el('button', 'btn', '驳回'); ok.type = no.type = 'button';
      ok.addEventListener('click', (e) => { e.stopPropagation(); this.net.wallReview(p.id, true); });
      no.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('驳回并删除这条帖子？')) this.net.wallReview(p.id, false); });
      bar.append(ok, no); card.append(bar);
    }
    return card;
  }

  /** 便利贴右上角的「⋯」：删除 / 举报 / 删此人全部（管理员）放在这里，不用每张便利贴都挂一排按钮 */
  private moreBtn(p: WallPost): HTMLElement | null {
    const items: [string, boolean, () => void][] = [];
    if (p.mine || this.admin) items.push(['删除', true, () => { if (confirm('删除这条帖子（连同评论）？')) this.net.wallDel(p.id); }]);
    if (!p.mine) items.push(['举报', false, () => askReport({ kind: 'wall', ref: p.id, preview: p.text })]);
    if (this.admin && p.by) { const by = p.by; items.push(['删此人全部', true, () => { if (confirm(`删除这个作者（${p.real ?? by.slice(0, 6)}）在校园墙的所有内容？`)) this.net.wallDelBy(by); }]); }
    if (!items.length) return null;
    const b = el('button', 'wall-more', '⋯'); b.type = 'button'; b.setAttribute('aria-label', '更多');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const had = this.menu && this.menu.parentElement === b.parentElement; this.closeMenu(); if (had) return;
      const m = el('div', 'wall-menu');
      for (const [label, danger, fn] of items) { const it = el('button', 'wall-menu-item' + (danger ? ' danger' : ''), label); it.type = 'button'; it.addEventListener('click', (ev) => { ev.stopPropagation(); this.closeMenu(); fn(); }); m.append(it); }
      m.addEventListener('click', (ev) => ev.stopPropagation());
      b.parentElement!.append(m); this.menu = m;
    });
    return b;
  }
  private closeMenu() { this.menu?.remove(); this.menu = null; }

  private renderThread() {
    const t = this.open_; if (!t) return;
    const keep = this.view === 'thread' ? this.feed.scrollTop : 0;
    if (this.view === 'list') this.listTop = this.feed.scrollTop;
    this.view = 'thread';
    this.closeMenu();
    this.feed.replaceChildren();
    this.buildThread(t);
    this.feed.scrollTop = keep;
  }
  private buildThread(t: { post: WallPost; comments: WallComment[] }) {
    const back = el('button', 'btn', '← 返回'); back.type = 'button'; back.addEventListener('click', () => this.back());
    const p = t.post, card = el('div', 'wall-note big' + (p.pending ? ' is-pending' : '')); this.paper(card, p, false);
    if (p.pending) card.append(el('div', 'wall-ribbon', this.admin ? '待审核' : '审核中'));
    const top = el('div', 'board-item-top'); top.append(this.who(p.name, p.hue, p.anon, '楼主'), el('span', 'board-time', wallRelTime(p.ts, Date.now())));
    card.append(top);
    const real = this.realTag(p.real, p.uid, p.by); if (real) card.append(real);
    card.append(el('div', 'wall-note-text full', p.text));
    const bar = el('div', 'wall-bar');
    const like = el('button', 'wall-act' + (p.liked ? ' on' : ''), `${p.liked ? '❤' : '♡'} ${p.likes}`); like.type = 'button';
    like.addEventListener('click', () => this.net.wallLike(p.id)); if (!p.pending) bar.append(like, el('span', 'wall-note-cm', `💬 ${p.comments}`));
    const mb = this.moreBtn(p); if (mb) { mb.classList.add('inline'); const wrap = el('span', 'wall-more-wrap'); wrap.append(mb); bar.append(wrap); }
    card.append(bar);
    if (p.pending) { card.append(el('div', 'wall-pending', '⏳ 管理员通过后才会贴上墙，到时才能点赞评论')); this.feed.append(back, card); return; }
    this.feed.append(back, card);
    const list = el('div', 'wall-comments');
    if (!t.comments.length) list.append(el('div', 'board-empty', '还没有评论，来说两句吧。'));
    for (const c of t.comments) {
      const row = el('div', 'wall-cmt'), ctop = el('div', 'board-item-top');
      ctop.append(this.who(c.name, c.hue, c.anon && !c.op, c.op ? '楼主' : undefined), el('span', 'board-time', wallRelTime(c.ts, Date.now())));
      row.append(ctop);
      const r = this.realTag(c.real, c.uid, c.by); if (r) row.append(r);
      row.append(el('div', 'board-text', c.text));
      const cb = el('div', 'wall-bar');
      if (c.mine || this.admin) { const d = el('button', 'wall-act danger', '删除'); d.type = 'button'; d.addEventListener('click', () => { if (confirm('删除这条评论？')) this.net.wallDel(p.id, c.id); }); cb.append(d); }
      if (!c.mine) { const rp = el('button', 'wall-act', '举报'); rp.type = 'button'; rp.addEventListener('click', () => askReport({ kind: 'wall', ref: p.id, cid: c.id, preview: c.text })); cb.append(rp); }
      row.append(cb); list.append(row);
    }
    this.feed.append(list);
    // 评论输入
    const input = el('input'); input.type = 'text'; input.maxLength = WALL_COMMENT_MAX + 10; input.placeholder = `写评论（最多 ${WALL_COMMENT_MAX} 字）`; input.autocomplete = 'off';
    const anon = el('input'); anon.type = 'checkbox'; const lbl = el('label', 'wall-anon'); lbl.append(anon, document.createTextNode(' 匿名'));
    const go = el('button', 'btn primary', '评论'); go.type = 'button';
    const post = () => { const v = input.value.trim(); if (!v) return; this.net.wallComment(p.id, v, anon.checked); input.value = ''; };
    go.addEventListener('click', post); input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); post(); } });
    const row = el('div', 'wall-cmt-in'); row.append(input, lbl, go);
    this.feed.append(row);
  }
}
