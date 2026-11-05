import { WALL_COMMENT_MAX, WALL_POST_MAX, type WallComment, type WallPost } from '@/shared/wall';
import type { NetClient } from '@/net/client';
import { askReport } from './ReportDialog';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ts: number) => { const d = new Date(ts); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/**
 * 校园墙：站在广场东侧的校园墙前按 E 打开。像一面贴满便签的墙——发帖（可选匿名）、给别人点赞、评论（也可选匿名）。
 * 匿名只对别的玩家有效：管理员能看到作者（防止有人借匿名骂人）；被多人举报的帖子会先折叠。
 * 所有玩家写的字一律 textContent 显示，不会被当成网页代码执行。
 */
export class WallPanel {
  private root = el('div', 'screen hidden');
  private feed = el('div', 'wall-feed');
  private more = el('button', 'btn', '再看更早的');
  private area = el('textarea');
  private anon = el('input');
  private count = el('span', 'board-count');
  private msg = el('div', 'board-msg');
  private send = el('button', 'btn primary', '贴上墙');
  private items: WallPost[] = [];
  private hasMore = false;
  private open_: { post: WallPost; comments: WallComment[] } | null = null;
  private admin = false;
  /** 管理员：只看待审核的 / 待审核数量 */
  private pendingMode = false; private pendingN = 0;
  private modBar = el('div', 'wall-modbar hidden');

  constructor(private net: NetClient) {
    const panel = el('div', 'box wall');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭校园墙');
    close.addEventListener('click', () => this.close());
    const refresh = el('button', 'btn', '刷新'); refresh.type = 'button'; refresh.addEventListener('click', () => this.net.wallList(undefined, this.pendingMode));
    const right = el('div', 'wall-head-r'); right.append(refresh, close);
    head.append(el('div', 'board-title', '校园墙'), right);
    this.area.rows = 3; this.area.maxLength = WALL_POST_MAX + 20; this.area.placeholder = '想说点什么？表白、吐槽、求助、找东西……请友善。'; this.area.spellcheck = false;
    this.area.addEventListener('input', () => this.renderCount());
    this.area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); } });
    this.anon.type = 'checkbox';
    const anonLbl = el('label', 'wall-anon'); anonLbl.append(this.anon, document.createTextNode(' 匿名发布'));
    this.send.type = 'button'; this.send.addEventListener('click', () => this.submit());
    this.more.type = 'button'; this.more.addEventListener('click', () => { const last = this.items[this.items.length - 1]; if (last) this.net.wallList(last.id, this.pendingMode); });
    const foot = el('div', 'board-foot'); const l = el('div', 'wall-foot-l'); l.append(anonLbl, this.count); foot.append(l, this.send);
    panel.append(head, el('div', 'create-sub', '发帖要先经管理员审核，通过后才会贴上墙。匿名帖别人看不到你是谁（管理员除外）；评论也可以匿名，楼主在自己匿名帖下的评论永远匿名。'), this.area, foot, this.msg, this.modBar, this.feed);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) { if (this.open_) this.back(); else this.close(); } });
    (document.getElementById('hud') ?? document.body).append(this.root);

    const h = net.handlers;
    h.wallPosts = (items, more, append, pending) => { this.items = append ? [...this.items, ...items] : items; this.hasMore = more; if (pending !== undefined) this.pendingN = pending; this.renderModBar(); if (!this.open_) this.renderFeed(); };
    h.wallThread = (post, comments) => { this.open_ = { post, comments }; const i = this.items.findIndex((x) => x.id === post.id); if (i >= 0) this.items[i] = post; this.renderThread(); };
    h.wallResult = (ok, text) => {
      this.setMsg(text, ok); this.send.disabled = false;
      if (ok && text.includes('贴上校园墙')) { this.area.value = ''; this.renderCount(); }
    };
    net.onAdmin((ok) => { this.admin = ok; if (!ok) this.pendingMode = false; this.renderModBar(); if (this.isOpen) this.net.wallList(undefined, this.pendingMode); });
    this.renderCount();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.root.classList.remove('hidden'); this.open_ = null; this.msg.textContent = ''; this.send.disabled = this.net.status !== 'online'; this.pendingMode = false; this.renderModBar(); this.net.wallList(); this.renderFeed(); }
  close() { this.area.blur(); this.root.classList.add('hidden'); }
  /** 管理员的「全部 / 待审核」切换条 */
  private renderModBar() {
    this.modBar.classList.toggle('hidden', !this.admin); this.modBar.replaceChildren();
    if (!this.admin) return;
    const mk = (label: string, pending: boolean) => {
      const b = el('button', 'seg' + (this.pendingMode === pending ? ' on' : ''), label); b.type = 'button';
      b.addEventListener('click', () => { this.pendingMode = pending; this.open_ = null; this.renderModBar(); this.net.wallList(undefined, pending); });
      return b;
    };
    this.modBar.append(el('span', 'wall-modlbl', '🛡 审核'), mk('全部', false), mk(`待审核 (${this.pendingN})`, true));
  }
  private back() { this.open_ = null; this.renderFeed(); this.net.wallList(undefined, this.pendingMode); }
  private setMsg(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }
  private renderCount() { this.count.textContent = `${Array.from(this.area.value).length} / ${WALL_POST_MAX}`; }

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

  private renderFeed() {
    this.feed.replaceChildren();
    if (!this.items.length) { this.feed.append(el('div', 'board-empty', this.net.status === 'online' ? (this.pendingMode ? '没有待审核的帖子。' : '墙上还空空的，来贴第一张吧。') : '连上服务器后能看到校园墙。')); return; }
    for (const p of this.items) {
      const card = el('div', 'wall-card' + (p.hidden ? ' hidden-post' : ''));
      const top = el('div', 'board-item-top'); top.append(this.who(p.name, p.hue, p.anon), el('span', 'board-time', fmt(p.ts)));
      const real = this.realTag(p.real, p.uid, p.by);
      card.append(top);
      if (real) card.append(real);
      if (p.pending) card.append(el('div', 'wall-pending', this.admin ? '⏳ 待审核' : '⏳ 审核中：管理员通过后才会贴上墙，别人暂时看不到'));
      card.append(el('div', 'board-text', p.hidden ? '（这条帖子被多人举报，已折叠，等管理员处理）' : p.text));
      const bar = el('div', 'wall-bar');
      if (p.pending && this.admin) {
        const ok = el('button', 'btn primary', '通过'), no = el('button', 'btn', '驳回'); ok.type = no.type = 'button';
        ok.addEventListener('click', (e) => { e.stopPropagation(); this.net.wallReview(p.id, true); });
        no.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('驳回并删除这条帖子？')) this.net.wallReview(p.id, false); });
        bar.append(ok, no); this.addPostTools(bar, p); card.append(bar); this.feed.append(card); continue;
      }
      if (p.pending) { this.addPostTools(bar, p); card.append(bar); this.feed.append(card); continue; }
      const like = el('button', 'wall-act' + (p.liked ? ' on' : ''), `${p.liked ? '❤' : '♡'} ${p.likes}`); like.type = 'button';
      like.addEventListener('click', (e) => { e.stopPropagation(); this.net.wallLike(p.id); });
      const cm = el('button', 'wall-act', `💬 ${p.comments}`); cm.type = 'button';
      bar.append(like, cm);
      card.addEventListener('click', () => this.net.wallOpen(p.id));
      this.addPostTools(bar, p);
      card.append(bar); this.feed.append(card);
    }
    if (this.hasMore) this.feed.append(this.more);
  }

  private addPostTools(bar: HTMLElement, p: WallPost) {
    if (p.mine || this.admin) {
      const del = el('button', 'wall-act danger', '删除'); del.type = 'button';
      del.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('删除这条帖子（连同评论）？')) this.net.wallDel(p.id); });
      bar.append(del);
    }
    if (!p.mine) {
      const rep = el('button', 'wall-act', '举报'); rep.type = 'button';
      rep.addEventListener('click', (e) => { e.stopPropagation(); askReport({ kind: 'wall', ref: p.id, preview: p.text }); });
      bar.append(rep);
    }
    if (this.admin && p.by) {
      const by = p.by, all = el('button', 'wall-act danger', '删此人全部'); all.type = 'button';
      all.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`删除这个作者（${p.real ?? by.slice(0, 6)}）在校园墙的所有内容？`)) this.net.wallDelBy(by); });
      bar.append(all);
    }
  }

  private renderThread() {
    const t = this.open_; if (!t) return;
    this.feed.replaceChildren();
    const back = el('button', 'btn', '← 返回'); back.type = 'button'; back.addEventListener('click', () => this.back());
    const p = t.post, card = el('div', 'wall-card big');
    const top = el('div', 'board-item-top'); top.append(this.who(p.name, p.hue, p.anon, '楼主'), el('span', 'board-time', fmt(p.ts)));
    card.append(top);
    const real = this.realTag(p.real, p.uid, p.by); if (real) card.append(real);
    card.append(el('div', 'board-text', p.text));
    const bar = el('div', 'wall-bar');
    const like = el('button', 'wall-act' + (p.liked ? ' on' : ''), `${p.liked ? '❤' : '♡'} ${p.likes}`); like.type = 'button';
    like.addEventListener('click', () => this.net.wallLike(p.id)); if (!p.pending) bar.append(like);
    this.addPostTools(bar, p); card.append(bar);
    if (p.pending) { card.prepend(el('div', 'wall-pending', '⏳ 审核中：通过后才会贴上墙，到时才能点赞评论')); this.feed.append(back, card); return; }
    this.feed.append(back, card);
    const list = el('div', 'wall-comments');
    if (!t.comments.length) list.append(el('div', 'board-empty', '还没有评论，来说两句吧。'));
    for (const c of t.comments) {
      const row = el('div', 'wall-cmt'), ctop = el('div', 'board-item-top');
      ctop.append(this.who(c.name, c.hue, c.anon && !c.op, c.op ? '楼主' : undefined), el('span', 'board-time', fmt(c.ts)));
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
