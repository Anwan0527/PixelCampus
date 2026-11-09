import { PLACE_COMMENT_MAX, PLACE_TEXT_MAX, type PlaceComment, type PlacePost } from '@/shared/place';
import { wallRelTime, type WallSort } from '@/shared/wall';
import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import { compressImage, placeImgSrc, placeThumbSrc, uploadPacked, type Packed } from '@/systems/placeimg';
import { askReport } from './ReportDialog';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SORT_KEY = 'pixelcampus.placeSort';
const loadSort = (): WallSort => { try { return localStorage.getItem(SORT_KEY) === 'hot' ? 'hot' : 'new'; } catch { return 'new'; } };
const saveSort = (s: WallSort) => { try { localStorage.setItem(SORT_KEY, s); } catch { /* 存储不可用：忽略 */ } };

let lightEl: HTMLElement | null = null;
/** 灯箱：点大图（或空白处）关闭；返回 true 表示这次关掉了一个灯箱（给 Esc 判断用） */
export function closeLightbox(): boolean { if (!lightEl) return false; lightEl.remove(); lightEl = null; return true; }
export const lightboxOpen = () => !!lightEl;
/** 看大图（留言板和管理员总览共用）。图片地址由调用方给（placeImgSrc） */
export function showLightbox(src: string) {
  closeLightbox();
  const box = el('div', 'place-lightbox'), img = el('img', 'place-lightbox-img'); img.src = src; img.alt = '留言图片';
  const x = el('button', 'btn place-lightbox-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '关闭大图');
  box.append(img, x); box.addEventListener('click', () => closeLightbox());
  img.addEventListener('error', () => { img.replaceWith(el('div', 'place-lightbox-err', '图片加载失败（可能已被删除）')); });
  (document.getElementById('hud') ?? document.body).append(box); lightEl = box;
}

/** 缩略图（点开看大图）。加载失败显示占位；懒加载：滚到才下载 */
export function placeThumb(img: string): HTMLElement {
  const b = el('button', 'place-thumb'); b.type = 'button'; b.setAttribute('aria-label', '看大图');
  const i = el('img'); i.loading = 'lazy'; i.decoding = 'async'; i.alt = '留言图片'; i.src = placeThumbSrc(img);
  i.addEventListener('error', () => { b.replaceChildren(el('span', 'place-thumb-err', '图片加载失败')); b.disabled = true; });
  b.append(i); b.addEventListener('click', (e) => { e.stopPropagation(); showLightbox(placeImgSrc(img)); });
  return b;
}

type Awaiting = '' | 'post' | 'comment' | 'del' | 'delc' | 'review';

/**
 * 地点留言板：站在建筑 / 地标附近，点屏幕上的「📝 留言板」按钮（或按句号键 .）打开。
 * 一个地点一块板：留言带文字和至多一张图，可以点赞、评论、举报；最新 / 最热排序；带图的留言要管理员审核后别人才看得到（自己看得到「审核中」）。
 * 管理员（也能从管理面板的「地点留言」页进来看某条留言，不受位置限制）可以通过 / 驳回、删除。
 * 玩家写的字一律 textContent；图片地址只由图片名（24 位十六进制 + 扩展名）拼出来。真正的限制（频率、位置、格式）都在服务器。
 */
export class PlacePanel {
  private root = el('div', 'screen place-screen hidden');
  private feed = el('div', 'place-feed');
  private more = el('button', 'btn place-morebtn', '再看更多');
  private msg = el('div', 'board-msg');
  private titleEl = el('div', 'board-title', '📝 留言板');
  private sortBar = el('div', 'place-sort');
  private composer = el('div', 'place-compose hidden');
  private composeBtn = el('button', 'btn place-compose-btn', '✏️ 写留言');
  private area = el('textarea');
  private count = el('span', 'board-count');
  private send = el('button', 'btn primary', '发布');
  private pickBtn = el('button', 'btn', '🖼 添加图片');
  private file = el('input');
  private prev = el('div', 'place-prev hidden');
  private key = ''; private name = '';
  private items: PlacePost[] = []; private total = 0; private hasMore = false; private sort: WallSort = loadSort(); private nextOff = 0; private rankAt = 0;
  private open_: { post: PlacePost; comments: PlaceComment[] } | null = null;
  private view: 'list' | 'thread' | null = null; private listTop = 0;
  private picked: (Packed & { url: string }) | null = null; private busy = false; private awaiting: Awaiting = ''; private threadOnly = false;
  private upTimer = 0;

  constructor(private net: NetClient) {
    const panel = el('div', 'box place');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭留言板'); close.addEventListener('click', () => this.close());
    const refresh = el('button', 'btn', '刷新'); refresh.type = 'button'; refresh.addEventListener('click', () => this.refetch());
    const right = el('div', 'place-head-r'); right.append(this.sortBar, refresh, close);
    head.append(this.titleEl, right);

    this.area.rows = 3; this.area.maxLength = PLACE_TEXT_MAX + 20; this.area.placeholder = '在这里留句话吧：打卡、感想、提醒后来的同学……请友善。'; this.area.spellcheck = false;
    this.area.addEventListener('input', () => this.renderCount());
    this.area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); } else if (e.key === 'Escape') { this.area.blur(); this.collapse(); } });
    this.file.type = 'file'; this.file.accept = 'image/*'; this.file.className = 'hidden';
    this.file.addEventListener('change', () => { const f = this.file.files?.[0]; this.file.value = ''; if (f) void this.pick(f); });
    this.pickBtn.type = 'button'; this.pickBtn.addEventListener('click', () => this.file.click());
    this.send.type = 'button'; this.send.addEventListener('click', () => this.submit());
    const fold = el('button', 'btn', '收起'); fold.type = 'button'; fold.addEventListener('click', () => this.collapse());
    const foot = el('div', 'place-compose-foot'), l = el('div', 'place-foot-l'), r = el('div', 'place-foot-r');
    l.append(this.pickBtn, this.count); r.append(fold, this.send); foot.append(l, r);
    this.composer.append(el('div', 'place-compose-tip', '带图片的留言要管理员审核后别人才看得到；文字留言直接发布。图片会在你的手机 / 电脑上先压缩。'), this.area, this.prev, this.file, foot);
    this.composeBtn.type = 'button'; this.composeBtn.addEventListener('click', () => this.expand());
    this.more.type = 'button'; this.more.addEventListener('click', () => this.fetchMore());

    panel.append(head, this.composeBtn, this.composer, this.msg, this.feed);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);

    const h = net.handlers;
    h.placePosts = (m: Extract<ServerMsg, { t: 'place_posts' }>) => {
      if (m.key !== this.key || m.sort !== this.sort) return; // 别的地点 / 切了排序：旧请求的回包，丢掉
      if (m.append) { const have = new Set(this.items.map((x) => x.id)); this.items = [...this.items, ...m.items.filter((x) => !have.has(x.id))]; } else this.items = m.items;
      this.total = m.total; this.hasMore = m.more; if (m.next !== undefined) this.nextOff = m.next; this.rankAt = m.at;
      if (m.name) { this.name = m.name; this.setTitle(); }
      if (!this.open_) this.renderFeed();
    };
    h.placeThread = (post, comments) => {
      if (!this.isOpen) return;
      if (this.threadOnly && !this.key) { this.key = post.key; this.name = post.place ?? ''; this.setTitle(); }
      this.open_ = { post, comments }; const i = this.items.findIndex((x) => x.id === post.id); if (i >= 0) this.items[i] = post; this.renderThread();
    };
    const prevRes = h.placeResult;
    h.placeResult = (ok, text) => {
      prevRes?.(ok, text);
      if (!this.isOpen) return;
      const was = this.awaiting; this.awaiting = '';
      this.setMsg(text, ok); this.setBusy(false);
      if (!ok) { if (was === 'post' || was === 'comment') return; this.refetch(); return; } // 被拒的点赞 / 删除之类：重新拉一次，界面回到服务器的状态
      if (was === 'post') { this.area.value = ''; this.clearPick(); this.renderCount(); this.collapse(); this.sort = 'new'; this.renderSort(); this.reset(() => this.fetch()); }
      else if (was === 'comment') { if (this.open_) this.net.placeThread(this.open_.post.id); }
      else if (was === 'del') { if (this.open_) this.back(); else this.fetch(); }
      else if (was === 'delc' || was === 'review') { if (this.open_) this.net.placeThread(this.open_.post.id); this.fetch(); }
    };
    h.placeUpTicket = (key, ticket, url) => { if (key === this.key) void this.doUpload(ticket, url); };
    this.renderCount(); this.renderSort();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 全局 Esc（escstack）调这个：灯箱 → 留言详情回列表 → 关闭面板 */
  escape() { if (closeLightbox()) return; if (this.open_ && !this.threadOnly) this.back(); else this.close(); }
  private get admin() { return this.net.isAdmin; }
  private online() { return this.net.status === 'online'; }

  /** 打开某个地点的留言板 */
  open(place: { key: string; name: string }) {
    this.key = place.key; this.name = place.name; this.threadOnly = false;
    this.items = []; this.total = 0; this.hasMore = false; this.open_ = null; this.view = null; this.listTop = 0; this.msg.textContent = ''; this.nextOff = 0;
    this.root.classList.remove('hidden'); this.collapse(); this.setTitle(); this.renderSort(); this.updateOnline(); this.renderFeed();
    if (this.online()) this.fetch();
  }
  /** 管理员：直接看某条留言和评论（管理面板里点进来；不受位置限制） */
  openThread(id: number) {
    if (!this.net.isAdmin) return;
    this.key = ''; this.name = ''; this.threadOnly = true; this.items = []; this.open_ = null; this.view = null; this.msg.textContent = '';
    this.root.classList.remove('hidden'); this.collapse(); this.composeBtn.classList.add('hidden'); this.sortBar.classList.add('hidden'); this.setTitle(); this.feed.replaceChildren(el('div', 'board-empty', '读取中…'));
    this.net.placeThread(id);
  }
  close() { this.area.blur(); closeLightbox(); window.clearTimeout(this.upTimer); this.setBusy(false); this.awaiting = ''; this.root.classList.add('hidden'); this.clearPick(); }

  private setTitle() { this.titleEl.textContent = this.name ? `📝 ${this.name}` : '📝 地点留言'; }
  private updateOnline() {
    const on = this.online();
    this.composeBtn.disabled = !on; this.send.disabled = !on;
    if (!on) this.setMsg('没连上服务器，留言板现在用不了。', false);
  }
  private fetch() { this.nextOff = 0; if (this.key) this.net.placeOpen(this.key, { sort: this.sort }); }
  private refetch() { if (this.open_) this.net.placeThread(this.open_.post.id); else this.fetch(); }
  private fetchMore() {
    if (!this.key) return;
    if (this.sort === 'new') { const last = [...this.items].reverse().find((x) => !x.pending); if (last) this.net.placeOpen(this.key, { sort: 'new', before: last.id }); }
    else this.net.placeOpen(this.key, { sort: 'hot', off: this.nextOff, at: this.rankAt });
  }
  private reset(afterFetch: () => void) { this.items = []; this.hasMore = false; this.open_ = null; this.view = null; this.listTop = 0; afterFetch(); this.renderFeed(); this.feed.scrollTop = 0; }
  private renderSort() {
    this.sortBar.replaceChildren();
    for (const [s, label] of [['new', '🕒 最新'], ['hot', '🔥 最热']] as const) {
      const b = el('button', 'seg' + (this.sort === s ? ' on' : ''), label); b.type = 'button';
      b.addEventListener('click', () => { if (this.sort === s) return; this.sort = s; saveSort(s); this.renderSort(); this.reset(() => this.fetch()); });
      this.sortBar.append(b);
    }
  }
  private expand() { if (!this.online()) return; this.composer.classList.remove('hidden'); this.composeBtn.classList.add('hidden'); window.setTimeout(() => this.area.focus(), 0); }
  private collapse() { this.composer.classList.add('hidden'); if (!this.threadOnly) this.composeBtn.classList.remove('hidden'); }
  private back() { if (this.threadOnly) { this.close(); return; } this.open_ = null; this.renderFeed(); this.fetch(); }
  private setMsg(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }
  private renderCount() { this.count.textContent = `${Array.from(this.area.value).length}/${PLACE_TEXT_MAX}`; }
  private setBusy(b: boolean) { this.busy = b; this.send.disabled = b || !this.online(); this.pickBtn.disabled = b; if (!b) this.send.textContent = '发布'; }

  // ------------------------------------------------------------ 选图、上传、发布
  private clearPick() { if (this.picked) URL.revokeObjectURL(this.picked.url); this.picked = null; this.prev.replaceChildren(); this.prev.classList.add('hidden'); this.pickBtn.textContent = '🖼 添加图片'; }
  private async pick(f: File) {
    this.setMsg('正在处理图片…', true); this.pickBtn.disabled = true;
    const r = await compressImage(f);
    this.pickBtn.disabled = this.busy;
    if (typeof r === 'string') { this.setMsg(r, false); return; }
    this.clearPick();
    const url = URL.createObjectURL(r.thumb); this.picked = { ...r, url };
    const im = el('img', 'place-prev-img'); im.src = url; im.alt = '已选图片';
    const kb = Math.max(1, Math.round(r.body.length / 1024)), rm = el('button', 'btn', '✕ 移除'); rm.type = 'button'; rm.addEventListener('click', () => { this.clearPick(); this.setMsg('', true); });
    this.prev.replaceChildren(im, el('span', 'place-prev-note', `已压缩，约 ${kb}KB`), rm); this.prev.classList.remove('hidden'); this.pickBtn.textContent = '🖼 换一张';
    this.setMsg('图片准备好了，写点文字（也可以不写）点「发布」。', true);
  }
  private submit() {
    if (this.busy) return;
    const text = this.area.value.trim();
    if (!text && !this.picked) { this.setMsg('写点文字，或者加一张图片吧', false); return; }
    if (!this.online()) { this.setMsg('没连上服务器，现在不能留言', false); return; }
    this.setBusy(true);
    if (this.picked) {
      this.send.textContent = '上传中…'; this.setMsg('正在上传图片…', true);
      this.net.placeUp(this.key);
      window.clearTimeout(this.upTimer); this.upTimer = window.setTimeout(() => { if (this.busy && this.awaiting !== 'post') { this.setBusy(false); this.setMsg('没有拿到上传许可，再试一次', false); } }, 8000);
    } else { this.awaiting = 'post'; this.net.placePost(this.key, text); this.guard(); }
  }
  private async doUpload(ticket: string, url: string) {
    const p = this.picked; if (!p || !this.busy) return;
    window.clearTimeout(this.upTimer);
    const ctl = new AbortController(), t = window.setTimeout(() => ctl.abort(), 30000);
    const r = await uploadPacked(url, p.body, ctl.signal); window.clearTimeout(t);
    if (!this.busy) return;
    if (!r.ok) { this.setBusy(false); this.setMsg(r.msg, false); return; }
    this.setMsg('图片上传好了，正在发布…', true); this.awaiting = 'post';
    this.net.placePost(this.key, this.area.value.trim(), r.img); this.guard();
    void ticket;
  }
  /** 发出请求后 6 秒没回话就把按钮放开（防止卡住） */
  private guard() { window.setTimeout(() => { if (this.busy) { this.setBusy(false); this.awaiting = ''; } }, 6000); }

  // ------------------------------------------------------------ 画面
  private who(name: string, hue: number, tag?: string) {
    const w = el('span', 'board-who', name); w.style.color = `hsl(${hue} 55% 32%)`;
    const box = el('span', 'place-who'); box.append(w);
    if (tag) box.append(el('span', 'wall-tag op', tag));
    return box;
  }
  private realTag(real?: string, uid?: number, by?: string) {
    if (!this.admin || !real) return null;
    const t = el('span', 'wall-real', `🛡 ${real}${uid ? `（${uid}）` : ''}`); t.title = by ?? ''; return t;
  }
  private renderFeed() {
    const keep = this.view === 'list' ? this.feed.scrollTop : this.listTop;
    this.feed.replaceChildren(); this.view = 'list';
    if (!this.online()) { this.feed.append(el('div', 'board-empty', '连上服务器后才能看和写留言（单机模式用不了）。')); return; }
    if (!this.items.length) this.feed.append(el('div', 'board-empty', this.key ? '这里还没有留言，来留下第一句吧。' : '读取中…'));
    const now = Date.now();
    if (this.total > 0) this.feed.append(el('div', 'place-total', `这里共有 ${this.total} 条留言`));
    for (const p of this.items) this.feed.append(this.card(p, now));
    if (this.hasMore) this.feed.append(this.more);
    this.feed.scrollTop = keep;
  }
  private card(p: PlacePost, now: number): HTMLElement {
    const c = el('div', 'place-card' + (p.hidden ? ' hidden-post' : '') + (p.pending ? ' is-pending' : ''));
    if (p.pending) c.append(el('div', 'place-ribbon', this.admin ? '待审核' : '审核中'));
    const top = el('div', 'place-card-top'); top.append(this.who(p.name, p.hue), el('span', 'board-time', wallRelTime(p.ts, now)));
    c.append(top);
    const real = this.realTag(p.real, p.uid, p.by); if (real) c.append(real);
    c.append(el('div', 'place-text', p.hidden ? '（被多人举报，已折叠，等管理员处理）' : p.text));
    if (p.img && !p.hidden) c.append(placeThumb(p.img));
    c.append(this.actions(p, false));
    if (p.pending && this.admin) c.append(this.reviewBar(p));
    if (!p.pending || p.mine || this.admin) c.addEventListener('click', () => this.net.placeThread(p.id));
    return c;
  }
  private reviewBar(p: PlacePost) {
    const bar = el('div', 'place-review'), ok = el('button', 'btn primary', '通过'), no = el('button', 'btn', '驳回');
    ok.type = no.type = 'button';
    ok.addEventListener('click', (e) => { e.stopPropagation(); this.awaiting = 'review'; this.net.placeReview(p.id, true); });
    no.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('驳回并删除这条留言？')) { this.awaiting = 'review'; this.net.placeReview(p.id, false); } });
    bar.append(ok, no); return bar;
  }
  /** 一行操作：点赞 / 评论数 / 删除 / 举报（详情里 detail = true 时点赞按钮同样可用） */
  private actions(p: PlacePost, detail: boolean) {
    const bar = el('div', 'place-bar');
    if (!p.pending) {
      const like = el('button', 'wall-act' + (p.liked ? ' on' : ''), `${p.liked ? '❤' : '♡'} ${p.likes}`); like.type = 'button'; like.setAttribute('aria-label', '点赞');
      like.addEventListener('click', (e) => { e.stopPropagation(); this.like(p); });
      bar.append(like, el('span', 'wall-note-cm', `💬 ${p.comments}`));
    }
    const sp = el('span', 'place-bar-sp'); bar.append(sp);
    if (p.mine || this.admin) { const d = el('button', 'wall-act danger', '删除'); d.type = 'button'; d.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('删除这条留言（连同评论）？')) { this.awaiting = 'del'; this.net.placeDel(p.id); } }); bar.append(d); }
    if (!p.mine) { const r = el('button', 'wall-act', '举报'); r.type = 'button'; r.addEventListener('click', (e) => { e.stopPropagation(); askReport({ kind: 'place', ref: p.id, preview: p.text || '（图片留言）' }); }); bar.append(r); }
    void detail;
    return bar;
  }
  /** 点赞：先在本地改一下（马上有反馈），服务器回的数据再覆盖；被拒会重新拉取 */
  private like(p: PlacePost) {
    p.liked = !p.liked; p.likes = Math.max(0, p.likes + (p.liked ? 1 : -1));
    this.net.placeLike(p.id);
    if (this.open_ && this.open_.post.id === p.id) this.renderThread(); else this.renderFeed();
  }

  private renderThread() {
    const t = this.open_; if (!t) return;
    const keep = this.view === 'thread' ? this.feed.scrollTop : 0;
    if (this.view === 'list') this.listTop = this.feed.scrollTop;
    this.view = 'thread'; this.feed.replaceChildren();
    const back = el('button', 'btn', this.threadOnly ? '✕ 关闭' : '← 返回'); back.type = 'button'; back.addEventListener('click', () => this.back());
    const p = t.post, now = Date.now(), card = el('div', 'place-card big' + (p.pending ? ' is-pending' : ''));
    if (p.pending) card.append(el('div', 'place-ribbon', this.admin ? '待审核' : '审核中'));
    const top = el('div', 'place-card-top'); top.append(this.who(p.name, p.hue, '留言'), el('span', 'board-time', wallRelTime(p.ts, now)));
    card.append(top);
    if (this.admin && p.place) card.append(el('div', 'wall-real', `📍 ${p.place}`));
    const real = this.realTag(p.real, p.uid, p.by); if (real) card.append(real);
    card.append(el('div', 'place-text full', p.hidden ? '（被多人举报，已折叠，等管理员处理）' : p.text));
    if (p.img && !p.hidden) card.append(placeThumb(p.img));
    card.append(this.actions(p, true));
    if (p.pending) { card.append(el('div', 'wall-pending', this.admin ? '⏳ 带图留言，等你审核' : '⏳ 管理员通过后别人才看得到，到时才能点赞评论')); if (this.admin) card.append(this.reviewBar(p)); this.feed.append(back, card); return; }
    this.feed.append(back, card);
    const list = el('div', 'wall-comments');
    if (!t.comments.length) list.append(el('div', 'board-empty', '还没有评论，来说两句吧。'));
    for (const c of t.comments) {
      const row = el('div', 'wall-cmt'), ctop = el('div', 'board-item-top');
      ctop.append(this.who(c.name, c.hue, c.op ? '留言者' : undefined), el('span', 'board-time', wallRelTime(c.ts, now)));
      row.append(ctop);
      const r = this.realTag(c.real, c.uid, c.by); if (r) row.append(r);
      row.append(el('div', 'board-text', c.text));
      const cb = el('div', 'wall-bar');
      if (c.mine || this.admin) { const d = el('button', 'wall-act danger', '删除'); d.type = 'button'; d.addEventListener('click', () => { if (confirm('删除这条评论？')) { this.awaiting = 'delc'; this.net.placeDel(p.id, c.id); } }); cb.append(d); }
      if (!c.mine) { const rp = el('button', 'wall-act', '举报'); rp.type = 'button'; rp.addEventListener('click', () => askReport({ kind: 'place', ref: p.id, cid: c.id, preview: c.text })); cb.append(rp); }
      row.append(cb); list.append(row);
    }
    this.feed.append(list);
    const input = el('input'); input.type = 'text'; input.maxLength = PLACE_COMMENT_MAX + 10; input.placeholder = `写评论（最多 ${PLACE_COMMENT_MAX} 字）`; input.autocomplete = 'off';
    const go = el('button', 'btn primary', '评论'); go.type = 'button';
    const post = () => { const v = input.value.trim(); if (!v) return; if (!this.online()) { this.setMsg('没连上服务器，现在不能评论', false); return; } this.awaiting = 'comment'; this.net.placeComment(p.id, v); input.value = ''; };
    go.addEventListener('click', post); input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); post(); } else if (e.key === 'Escape') input.blur(); });
    const row = el('div', 'wall-cmt-in'); row.append(input, go);
    this.feed.append(row);
    this.feed.scrollTop = keep;
  }
}
