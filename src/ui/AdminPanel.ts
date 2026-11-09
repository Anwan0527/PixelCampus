import { titleDef } from '@/shared/titles';
import { MODS_Q, OP_NAMES, ROLE_NAMES, type AdminCat, type AdminChatItem, type AdminDm, type AdminFilter, type AdminHit, type AdminPlayer, type AdminWorld, type AuditEntry, type BanEntry } from '@/shared/admin';
import { REPORT_KIND_NAMES, REPORT_REASONS, type ReportEntry } from '@/shared/report';
import { AdminUserMenu, type UserMenuCtx } from './AdminUserMenu';
import { AdminDossier } from './AdminDossier';
import type { ServerMsg } from '@/shared/protocol';
import type { NetClient } from '@/net/client';
import { ui } from './actions';
import { drawFrame } from './sprites';
import type Phaser from 'phaser';
import { placeThumbs } from './PlacePanel';
import type { PlacePost } from '@/shared/place';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const COATS = ['橘猫', '黑猫', '白猫', '三花', '奶牛猫', '灰猫'];
const ago = (ts: number) => { const s = (Date.now() - ts) / 1000; return s < 90 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`; };
type Tab = 'players' | 'worlds' | 'reports' | 'places' | 'cats' | 'filter' | 'logs' | 'dm' | 'audit' | 'tools';
const WORLD_ICON = { public: '🌍', solo: '🏠', group: '👥' } as const;
const WORLD_NAME = { public: '公共世界', solo: '个人世界', group: '好友世界' } as const;
/** 公屏记录里的世界标记：w 是世界编号（solo:校园号 / group:校园号） */
const worldTag = (w?: string) => (!w ? '' : w.startsWith('solo:') ? '个人世界' : w.startsWith('group:') ? '好友世界' : w);
const when = (ts: number) => { const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

/**
 * 管理员控制台（只有登录管理员后才出现「管理」按钮；真正的权限检查在服务器，这里只是界面）。
 * 玩家：谁在线、在哪、什么状态；禁言/解除、踢出、传送、送物品/称号。小猫：全部名字、位置、改名。工具：全服广播、关闭公屏。
 * 在留言板里点「管理员」输入口令登录；口令由你自己用 npm run admin:set 设置，不经过聊天。
 */
export class AdminPanel {
  private root = el('div', 'screen hidden');
  private tabs = el('div', 'seg-row');
  private body = el('div', 'adm-body');
  private msg = el('div', 'board-msg');
  private tab: Tab = 'players';
  private players: AdminPlayer[] = []; private online = 0; private total = 0; private locked = false; private announce = false;
  private cats: AdminCat[] = [];
  private flt: AdminFilter | null = null;
  // 公屏记录 / 私聊记录 / 封禁与操作记录
  private logItems: AdminChatItem[] = []; private logMore = false; private logUid = ''; private logQ = ''; private logPaging = false;
  private dm: Extract<ServerMsg, { t: 'adm_dmlog' }> | null = null; private dmItems: AdminDm[] = []; private dmUidText = ''; private dmPaging = false;
  private audit: AuditEntry[] = []; private auditMore = false; private auditPaging = false; private bans: BanEntry[] = [];
  private menu: AdminUserMenu;
  // 举报 / 世界 / 公屏记录的世界筛选
  private reports: ReportEntry[] = []; private repMore = false; private repOpen = 0; private repOnlyOpen = true; private repPaging = false;
  private worlds: AdminWorld[] = []; private worldMine = '';
  // 地点留言总览：筛选（全部 / 待审核 / 带图 + 某个地点）、当前列表、统计、有留言的地点
  private plTab: 'all' | 'pending' | 'img' = 'all'; private plKey = ''; private plItems: PlacePost[] = []; private plMore = false; private plPaging = false;
  private plStat = { pending: 0, total: 0, images: 0 }; private plPlaces: { key: string; name: string; n: number }[] = [];
  private logWorld = '';
  /** 公屏记录的频道筛选（'' = 全部） */
  private logCh: '' | 'world' | 'near' | 'party' = '';
  /** 玩家档案（点某位玩家后整页换成它）、找人的结果 */
  private dossier: AdminDossier; private dosUid = 0;
  private hits: AdminHit[] | null = null; private hitsMore = false; private findQ = ''; private findTimer = 0; private findEnter = false;
  private hitsBox = el('div', 'adm-list adm-hits'); private listBox = el('div', 'adm-list');
  private titleEl = el('div', 'board-title', '🛡 管理员控制台');
  private withOffline = false;
  private timer = 0;

  /** hooks.openMap：关掉控制台并打开大地图（管理员在大地图上点哪里就传送到哪里） */
  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private hooks: { openMap(): void; showCard(uid: number): void; /** 管理员总览里点「看评论」：在留言板面板里打开这条留言 */ openPlaceThread(id: number): void; /** 留言板面板 / 大图开着（Esc 先关它们） */ placeOpen(): boolean }) {
    this.menu = new AdminUserMenu(net, { showCard: (u) => hooks.showCard(u), openLogs: (u) => this.openLogs(u), openDm: (u) => this.openDm(u), openDossier: (u) => this.openDossier(u) });
    this.dossier = new AdminDossier(net, { back: () => { this.dossier.clearCode(); this.dosUid = 0; this.render(); this.fetch(); }, open: (u) => this.openDossier(u), openLogs: (u) => this.openLogs(u), openDm: (u) => this.openDm(u), showCard: (u) => hooks.showCard(u), openReports: () => { this.dosUid = 0; this.tab = 'reports'; this.fetchReports(); this.render(); } });
    const panel = el('div', 'box adm');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭管理'); close.addEventListener('click', () => this.close());
    head.append(this.titleEl, close);
    panel.append(head, this.tabs, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen && !this.hooks.placeOpen()) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'admin', label: '管理', key: 'K', visible: () => this.net.isAdmin, run: () => this.toggle() });
    net.onAdmin((ok) => { ui.refresh(); if (!ok) this.close(); });
    const h = net.handlers;
    h.admPlayers = (items, online, total, locked, announce) => { this.players = items; this.online = online; this.total = total; this.locked = locked; this.announce = announce; if (!this.editing()) this.render(); }; // 每几秒自动刷新一次：正在输入框里打字时不重绘，免得把没打完的字清掉
    h.admCats = (items) => { this.cats = items; if (this.tab === 'cats' && !this.editing()) this.render(); };
    h.admHits = (m) => this.onHits(m);
    h.admDossier = (d) => this.dossier.setData(d);
    h.admCode = (m) => { if (!this.isOpen) this.open(); this.dosUid = m.uid; this.dossier.showCode(m); this.render(); };
    h.admFilter = (f) => { this.flt = f; if (this.tab === 'filter' && !this.editing()) this.render(); };
    h.admChatlog = (items, more) => { this.logItems = this.logPaging ? [...this.logItems, ...items] : items; this.logMore = more; this.logPaging = false; if (this.tab === 'logs' && this.isOpen) this.render(); };
    h.admDmlog = (m) => {
      if (m.peers) { this.dm = m; this.dmItems = []; } else { this.dmItems = this.dmPaging ? [...(m.items ?? []), ...this.dmItems] : (m.items ?? []); this.dm = m; }
      this.dmPaging = false; if (this.tab === 'dm' && this.isOpen) this.render();
    };
    h.admInfo = (i) => this.menu.setInfo(i);
    h.placeAdminList = (m) => {
      if (m.tab !== this.plTab || (m.key ?? '') !== this.plKey) return; // 旧请求的回包（切了筛选）：丢掉
      this.plItems = m.append ? [...this.plItems, ...m.items.filter((x) => !this.plItems.some((y) => y.id === x.id))] : m.items; this.plMore = m.more; this.plPaging = false;
      this.plStat = { pending: m.pending, total: m.total, images: m.images }; this.plPlaces = m.places; ui.badge('admin', m.pending);
      if (this.tab === 'places' && this.isOpen) this.render();
    };
    h.placePending = (n) => { this.plStat.pending = n; ui.badge('admin', n); if (this.isOpen && !this.editing()) { if (this.tab === 'places') this.fetchPlaces(); else this.render(); } };
    { const prev = h.placeResult; h.placeResult = (ok, text) => { prev?.(ok, text); if (this.isOpen && this.tab === 'places') { this.msg.textContent = text; this.msg.classList.toggle('bad', !ok); this.fetchPlaces(); } }; }
    h.admReports = (m) => { this.reports = m.append ? [...this.reports, ...m.items] : m.items; this.repMore = m.more; this.repOpen = m.open; this.repPaging = false; if (this.isOpen && !this.editing()) this.render(); };
    h.repN = (n) => { const changed = n !== this.repOpen; this.repOpen = n; if (this.isOpen && !this.editing() && (changed || this.tab === 'reports')) { if (this.tab === 'reports') this.fetchReports(); else this.render(); } };
    h.admWorlds = (items, mine) => { this.worlds = items; this.worldMine = mine; if (this.tab === 'worlds' && this.isOpen && !this.editing()) this.render(); };
    h.admBans = (items) => { this.bans = items; if (this.tab === 'audit' && this.isOpen) this.render(); };
    h.admAudit = (items, more) => { this.audit = this.auditPaging ? [...this.audit, ...items] : items; this.auditMore = more; this.auditPaging = false; if (this.tab === 'audit' && this.isOpen) this.render(); };
    h.admResult = (ok, text) => { if (!this.dosUid) { this.msg.textContent = text; this.msg.classList.toggle('bad', !ok); } this.menu.result(ok, text); this.dossier.result(ok, text); if (!this.dosUid) this.fetch(); if (this.tab === 'audit') this.net.adm({ op: 'bans' }); };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 有人撤回了公屏消息：记录页里的「已撤回」标记跟着刷新 */
  onRecall() { if (this.tab === 'logs' && this.isOpen) this.queryLogs(); }
  /** 点公屏里的名字（管理员）：弹出这个人的管理菜单 */
  openUserMenu(uid: number, ctx: UserMenuCtx) { this.menu.open(uid, ctx); }
  /** 点人弹出的管理小菜单（全局 Esc 要能关它） */
  get userMenuOpen() { return this.menu.isOpen; }
  closeUserMenu() { this.menu.close(); }
  /** 打开管理面板看某人的公屏记录 / 私聊会话 */
  openLogs(uid: number) { this.root.classList.remove('hidden'); this.tab = 'logs'; this.logUid = String(uid); this.logQ = ''; this.queryLogs(); this.render(); }
  openDm(uid: number) { this.root.classList.remove('hidden'); this.tab = 'dm'; this.dmUidText = String(uid); this.dm = null; this.dmItems = []; this.net.adm({ op: 'log_dm', uid }); this.render(); }
  private queryLogs(before?: number) {
    this.logPaging = before !== undefined;
    this.net.adm({ op: 'log_chat', ...(Number(this.logUid) > 0 ? { uid: Number(this.logUid) } : {}), ...(this.logQ ? { q: this.logQ } : {}), ...(this.logWorld ? { world: this.logWorld } : {}), ...(this.logCh ? { ch: this.logCh } : {}), ...(before ? { before } : {}), n: 50 });
  }
  open() { if (!this.net.isAdmin) return; this.root.classList.remove('hidden'); this.msg.textContent = ''; this.titleEl.textContent = `🛡 管理员控制台（${ROLE_NAMES[this.net.adminRole ?? 'mod']}）`; this.fetch(); this.render(); window.clearInterval(this.timer); this.timer = window.setInterval(() => { if ((this.tab === 'players' && !this.dosUid) || this.tab === 'worlds') this.fetch(); }, 5000); }
  /** 打开某位玩家的完整档案（点名字菜单的「完整档案」、搜索结果、好友列表都走这里） */
  openDossier(uid: number) { if (!this.net.isAdmin) return; if (!this.isOpen) this.open(); this.tab = 'players'; this.dosUid = uid; this.dossier.show(uid); this.msg.textContent = ''; this.render(); }
  close() { this.root.classList.add('hidden'); window.clearInterval(this.timer); this.dossier.clearCode(); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private fetch() { this.net.adm({ op: 'players', offline: this.withOffline }); this.net.adm({ op: 'cats' }); if (this.tab === 'filter') this.net.adm({ op: 'filter_get' }); if (this.tab === 'worlds') this.net.adm({ op: 'worlds' }); if (this.tab === 'reports') this.fetchReports(); }
  private fetchPlaces(before?: number) { this.plPaging = before !== undefined; this.net.placeAdmin(this.plTab, this.plKey || undefined, before); }
  private fetchReports(before?: number) { this.repPaging = before !== undefined; this.net.adm({ op: 'reports', open: this.repOnlyOpen, ...(before ? { before } : {}) }); }
  /** 正在输入框里打字时不要重绘（会把没写完的字清掉） */
  private editing() { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && this.root.contains(a); }

  private render() {
    this.tabs.replaceChildren(); this.body.replaceChildren();
    const defs: [Tab, string][] = [['players', `玩家 ${this.online}`], ['worlds', '世界'], ['reports', `举报${this.repOpen ? ` (${this.repOpen})` : ''}`], ['places', `📍 地点留言${this.plStat.pending ? ` (${this.plStat.pending})` : ''}`], ['cats', `小猫 ${this.cats.length}`], ['filter', '敏感词'], ['logs', '公屏记录'], ['dm', '私聊记录'], ['audit', '操作记录'], ['tools', '广播与设置']];
    const need: Partial<Record<Tab, Parameters<NetClient['can']>[0]>> = { filter: 'filter_get', dm: 'log_dm', tools: 'say' }; // 这几页的操作只有站长能做：协管员看不到入口
    if (this.tab !== 'players' && need[this.tab] && !this.net.can(need[this.tab]!)) this.tab = 'players';
    for (const [t, label] of defs.filter(([t]) => !need[t] || this.net.can(need[t]!))) {
      const b = el('button', 'seg' + (t === this.tab ? ' on' : ''), label); b.type = 'button'; b.addEventListener('click', () => { this.tab = t; this.msg.textContent = ''; if (t === 'filter') this.net.adm({ op: 'filter_get' }); if (t === 'worlds') this.net.adm({ op: 'worlds' }); if (t === 'reports') this.fetchReports(); if (t === 'places') this.fetchPlaces(); if (t === 'logs') this.queryLogs(); if (t === 'audit') { this.auditPaging = false; this.net.adm({ op: 'audit' }); this.net.adm({ op: 'bans' }); } this.render(); }); this.tabs.append(b);
    }
    this.tabs.classList.toggle('hidden', this.tab === 'players' && this.dosUid > 0); // 看某位玩家的档案时收起上面一排页签（档案里有「返回列表」），给档案多留点高度
    if (this.tab === 'players') this.renderPlayers(); else if (this.tab === 'worlds') this.renderWorlds(); else if (this.tab === 'reports') this.renderReports(); else if (this.tab === 'places') this.renderPlaces(); else if (this.tab === 'cats') this.renderCats(); else if (this.tab === 'filter') this.renderFilter(); else if (this.tab === 'logs') this.renderLogs(); else if (this.tab === 'dm') this.renderDm(); else if (this.tab === 'audit') this.renderAudit(); else this.renderTools();
  }

  private btn(label: string, fn: () => void, primary = false) { const b = el('button', 'btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /** 玩家页：上面一个搜索框（校园号 / 学生证号 / 昵称），下面是在线玩家列表；点一位玩家整页换成他的档案 */
  private renderPlayers() {
    if (this.dosUid) { this.body.append(this.dossier.el); return; }
    const top = el('div', 'adm-top');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = this.withOffline; cb.addEventListener('change', () => { this.withOffline = cb.checked; this.fetch(); });
    const lab = el('label'); lab.append(cb, document.createTextNode(' 同时显示 3 天内离线的玩家'));
    top.append(el('span', undefined, `在线 ${this.online} 人 · 档案共 ${this.total} 个`), lab, this.btn('刷新', () => this.fetch()), this.btn('🗺 点地图传送', () => { this.close(); this.hooks.openMap(); }, true));
    if (this.net.can('mod_set')) top.append(this.btn('🛡 协管员名单', () => { this.findQ = MODS_Q; this.hits = null; this.findEnter = false; this.net.adm({ op: 'mods' }); this.renderLists(); this.body.querySelector<HTMLInputElement>('.adm-find')!.value = MODS_Q; }));
    // 找人
    const q = el('input', 'adm-find'); q.type = 'search'; q.placeholder = '🔍 找人：校园号 / 学生证号 / 昵称（含离线玩家）'; q.value = this.findQ; q.maxLength = 20; q.autocomplete = 'off'; q.spellcheck = false;
    const go = (enter: boolean) => { window.clearTimeout(this.findTimer); this.findQ = q.value.trim(); this.findEnter = enter; if (this.findQ) this.net.adm({ op: 'find', q: this.findQ }); else { this.hits = null; this.renderLists(); } };
    q.addEventListener('input', () => { window.clearTimeout(this.findTimer); this.findTimer = window.setTimeout(() => go(false), 280); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(true); } });
    const bar = el('div', 'adm-actions'); bar.append(q, this.btn('查找', () => go(true), true), this.btn('清除', () => { q.value = ''; go(false); q.focus(); }));
    this.body.append(top, bar, this.hitsBox, this.listBox);
    this.renderLists();
  }
  /** 填充搜索结果和在线玩家两个列表：有搜索词时只显示搜索结果 */
  private renderLists() {
    const searching = this.findQ !== '';
    this.hitsBox.classList.toggle('hidden', !searching); this.listBox.classList.toggle('hidden', searching);
    this.hitsBox.replaceChildren(); this.listBox.replaceChildren();
    if (searching) {
      if (this.hits === null) this.hitsBox.append(el('div', 'board-empty', '查找中…'));
      else if (!this.hits.length) this.hitsBox.append(el('div', 'board-empty', this.findQ === MODS_Q ? '还没有协管员。打开某位玩家的档案，点「任命为协管员」。' : `没有找到「${this.findQ}」。可以输入校园号（如 10086）、10 位学生证号，或昵称的一部分。`));
      for (const h of this.hits ?? []) this.hitsBox.append(this.playerRow({ mod: h.mod, uid: h.uid, name: h.name, online: h.online, mutedMin: h.mutedMin, seen: h.seen, sub: `${h.college} · ${h.major} · 学生证号 ${h.cardNo}`, banned: h.banned }));
      if (this.hits && this.hitsMore) this.hitsBox.append(el('div', 'board-empty', '结果太多，只列出前 20 个：请输入更多的字。'));
      return;
    }
    if (!this.players.length) this.listBox.append(el('div', 'board-empty', '没有玩家。'));
    for (const p of this.players) this.listBox.append(this.playerRow({ uid: p.uid, name: p.name, online: p.online, mutedMin: p.mutedMin, seen: p.seen, sub: `${p.where} · (${p.tx}, ${p.ty}) · ${p.state}${p.online ? '' : ` · ${ago(p.seen)}`}`, title: p.title }));
    this.listBox.append(el('div', 'create-sub', '点一位玩家，打开他的档案：资料、背包与币、好友、举报、处置都在里面。'));
  }
  private playerRow(p: { mod?: boolean; uid: number; name: string; online: boolean; mutedMin: number; seen: number; sub: string; title?: string; banned?: boolean }): HTMLElement {
    const row = el('div', 'adm-row' + (p.online ? '' : ' off'));
    const t = titleDef(p.title);
    const name = el('div', 'adm-name'); name.append(el('span', p.online ? 'dot on' : 'dot'), document.createTextNode(p.name), el('span', 'adm-uid', ` #${p.uid}`));
    if (t) { const tt = el('span', 'adm-ttl', ` 「${t.name}」`); tt.style.color = t.color; name.append(tt); }
    if (p.mod) name.append(el('span', 'adm-ttl', ' 🛡协管'));
    if (p.banned) name.append(el('span', 'adm-mute', ' ⛔封禁中'));
    if (p.mutedMin > 0) name.append(el('span', 'adm-mute', p.mutedMin > 100000 ? ' 🔇永久' : ` 🔇${p.mutedMin}分`));
    row.append(name, el('div', 'adm-where', p.sub));
    row.addEventListener('click', () => this.openDossier(p.uid));
    return row;
  }
  private onHits(m: Extract<ServerMsg, { t: 'adm_hits' }>) {
    if (m.q !== this.findQ) return; // 过期的结果（又输入了新的字）
    this.hits = m.items; this.hitsMore = m.more;
    if (this.findEnter && m.items.length === 1) { this.findEnter = false; this.openDossier(m.items[0].uid); return; } // 回车且只有一个结果：直接打开
    this.findEnter = false;
    if (this.tab === 'players' && !this.dosUid && this.isOpen) this.renderLists();
  }

  /** 世界页：现在所有的世界和里面的人。管理员可以隐身进入（别人看不到、不能发言）或现身进入（世界里的人会收到提示）；全部记进操作记录 */
  private renderWorlds() {
    const b = this.body, here = this.worlds.find((w) => w.id === this.worldMine);
    b.append(el('div', 'create-sub', '隐身进入：别人看不到你、人数里没有你、你不能发言，但能看到里面的人和公屏；现身进入：世界里的人会收到「管理员进入了这个世界」。进入、离开都会记进「操作记录」。点人名可以对 TA 禁言 / 封禁 / 撤回。'));
    const top = el('div', 'adm-top');
    top.append(el('span', undefined, `你现在在：${here ? this.worldLabel(here) : '…'}`), this.btn('离开，回到原来的世界', () => this.net.adm({ op: 'world_leave' }), true), this.btn('刷新', () => this.net.adm({ op: 'worlds' })));
    b.append(top);
    if (!this.worlds.length) b.append(el('div', 'board-empty', '读取中…'));
    for (const w of this.worlds) {
      const card = el('div', 'adm-world' + (w.id === this.worldMine ? ' mine' : ''));
      const head = el('div', 'adm-actions');
      head.append(el('b', undefined, this.worldLabel(w)), el('span', 'adm-uid', ` ${w.size} 人${w.kind === 'public' ? '' : ` · 开始于 ${when(w.since)}`}${w.id === this.worldMine ? ' · 你在这里' : ''}`), this.btn('👻 隐身进入', () => this.net.adm({ op: 'world_enter', world: w.id, ghost: true }), true), this.btn('🛡 现身进入', () => this.net.adm({ op: 'world_enter', world: w.id, ghost: false })));
      const ml = el('div', 'adm-world-members');
      for (const m of w.members.slice(0, 40)) { const s = el('span', 'chat-who clickable', `${m.ghost ? '👻' : m.admin ? '🛡' : ''}${m.name}（#${m.uid}）${m.state === '走路' ? '' : ` ${m.state}`}`); s.addEventListener('click', () => this.menu.open(m.uid, { name: m.name })); ml.append(s); }
      if (w.members.length > 40 || w.size > w.members.length) ml.append(el('span', 'adm-uid', `…等共 ${w.size} 人（完整名单在「玩家」页）`));
      card.append(head, ml); b.append(card);
    }
  }
  private worldLabel(w: AdminWorld) { return `${WORLD_ICON[w.kind]} ${w.kind === 'public' ? WORLD_NAME.public : `${w.ownerName}的${WORLD_NAME[w.kind]}`}`; }

  /** 举报页：玩家举报的公屏 / 私聊 / 留言 / 校园墙 / 资料，附原文和上下文（内容被撤回了原文还在）。处理 = 撤回内容、禁言、封禁，再标记已处理或驳回 */
  private renderReports() {
    const b = this.body;
    const top = el('div', 'adm-top'), cb = el('input'); cb.type = 'checkbox'; cb.checked = this.repOnlyOpen; cb.addEventListener('change', () => { this.repOnlyOpen = cb.checked; this.fetchReports(); });
    const lab = el('label'); lab.append(cb, document.createTextNode(' 只看没处理的'));
    top.append(el('span', undefined, `没处理的举报：${this.repOpen} 条`), lab, this.btn('刷新', () => this.fetchReports()));
    b.append(top);
    if (!this.reports.length) b.append(el('div', 'board-empty', this.repOnlyOpen ? '没有待处理的举报 🎉' : '还没有举报记录。'));
    for (const r of this.reports) b.append(this.reportCard(r));
    if (this.repMore) b.append(this.btn('加载更早的', () => this.fetchReports(this.reports[this.reports.length - 1]?.id)));
  }
  /**
   * 地点留言总览：所有地点的留言（新的在前）一页看完。筛选：全部 / 待审核 / 带图 + 某个地点；缩略图点开看大图；
   * 通过 / 驳回（带图留言默认先审后发）、删除、删此人全部、看评论。内容都只用 textContent 显示。
   */
  private renderPlaces() {
    const b = this.body, st = this.plStat;
    const top = el('div', 'adm-top');
    top.append(el('span', undefined, `待审核 ${st.pending} · 全部 ${st.total} 条 · 图片 ${st.images} 张`), this.btn('刷新', () => this.fetchPlaces()));
    b.append(top);
    const bar = el('div', 'adm-actions place-adm-filter');
    for (const [t, label] of [['all', '全部'], ['pending', `待审核${st.pending ? ` (${st.pending})` : ''}`], ['img', '带图']] as const) {
      const x = el('button', 'seg' + (this.plTab === t ? ' on' : ''), label); x.type = 'button';
      x.addEventListener('click', () => { if (this.plTab === t) return; this.plTab = t; this.plItems = []; this.plMore = false; this.fetchPlaces(); this.render(); });
      bar.append(x);
    }
    const sel = el('select'); sel.setAttribute('aria-label', '按地点筛选');
    const all = el('option', undefined, '所有地点'); all.value = ''; sel.append(all);
    const known = this.plPlaces.some((p) => p.key === this.plKey);
    if (this.plKey && !known) { const o = el('option', undefined, this.plKey.slice(2)); o.value = this.plKey; sel.append(o); }
    for (const p of this.plPlaces) { const o = el('option', undefined, `${p.name}（${p.n}）`); o.value = p.key; sel.append(o); }
    sel.value = this.plKey;
    sel.addEventListener('change', () => { this.plKey = sel.value; this.plItems = []; this.plMore = false; this.fetchPlaces(); this.render(); });
    bar.append(sel); b.append(bar);
    if (!this.plItems.length) b.append(el('div', 'board-empty', this.plTab === 'pending' ? '没有待审核的留言 🎉' : '还没有符合条件的留言。'));
    const list = el('div', 'place-adm-list');
    for (const p of this.plItems) list.append(this.placeRow(p));
    b.append(list);
    if (this.plMore) b.append(this.btn('加载更早的', () => { if (this.plPaging) return; this.fetchPlaces(this.plItems[this.plItems.length - 1]?.id); }));
  }
  private placeRow(p: PlacePost): HTMLElement {
    const row = el('div', 'place-adm-item' + (p.pending ? ' is-pending' : '') + ((p.reports ?? 0) > 0 ? ' reported' : ''));
    const top = el('div', 'place-adm-top');
    top.append(el('span', 'rep-tag', `📍 ${p.place ?? p.key}`));
    if (p.pending) top.append(el('span', 'rep-tag n', '待审核'));
    if (p.hidden) top.append(el('span', 'rep-tag n', '已折叠'));
    if ((p.reports ?? 0) > 0) top.append(el('span', 'rep-tag n', `⚠ ${p.reports} 人举报`));
    top.append(el('span', 'adm-uid', `#${p.id} · ${when(p.ts)}`));
    row.append(top);
    const who = el('div', 'adm-where'); who.append(document.createTextNode(`${p.real ?? p.name}`));
    if (p.uid) { const t = el('span', 'chat-who clickable', `（#${p.uid}）`); t.addEventListener('click', () => this.openDossier(p.uid!)); who.append(t); }
    if (p.real && p.real !== p.name) who.append(document.createTextNode(` · 显示名：${p.name}`));
    row.append(who);
    if (p.text) row.append(el('div', 'place-adm-text', p.text));
    if (p.imgs?.length) row.append(placeThumbs(p.imgs));
    row.append(el('div', 'adm-where', `❤ ${p.likes} · 💬 ${p.comments}`));
    const acts = el('div', 'adm-actions');
    if (p.pending) {
      acts.append(this.btn('通过', () => this.net.placeReview(p.id, true), true), this.btn('驳回', () => { if (confirm('驳回并删除这条留言？')) this.net.placeReview(p.id, false); }));
    }
    acts.append(this.btn('看评论', () => this.hooks.openPlaceThread(p.id)), this.btn('删除', () => { if (confirm('删除这条留言（连同评论）？')) this.net.placeDel(p.id); }));
    acts.append(this.btn('删此人全部', () => { if (confirm(`删除「${p.real ?? p.name}」在所有地点的全部留言和评论？此操作不能恢复。`)) { if (confirm('再确认一次：真的删除这个人的全部地点留言？')) this.net.placeDelBy(p.id); } }));
    row.append(acts);
    return row;
  }
  private reportCard(r: ReportEntry): HTMLElement {
    const card = el('div', 'rep-item' + (r.done ? ' done' : ''));
    const top = el('div', 'rep-top');
    top.append(el('span', 'rep-tag', REPORT_KIND_NAMES[r.kind]), el('span', 'rep-tag n', REPORT_REASONS[r.reason] ?? '其他'));
    if (r.ch) top.append(el('span', 'rep-tag', r.ch === 'near' ? '📍附近' : r.ch === 'party' ? '👥队伍' : r.ch));
    if (r.same > 1) top.append(el('span', 'rep-tag n', `${r.same} 人举报`));
    if (r.w) top.append(el('span', 'rep-tag', worldTag(r.w)));
    top.append(el('span', 'adm-uid', `#${r.id} · ${when(r.ts)}`));
    if (r.done) top.append(el('span', `rep-tag ${r.done.verdict === 'dismiss' ? 'no' : 'ok'}`, r.done.verdict === 'dismiss' ? '已驳回' : '已处理'), el('span', 'adm-uid', `${r.done.by}${r.done.action ? `：${r.done.action}` : ''}`));
    card.append(top);
    const who = el('div', 'adm-where'); who.append(document.createTextNode(`${r.byName}（#${r.by}）举报 `));
    if (r.target) { const t = el('span', 'chat-who clickable', `${r.targetName}（#${r.target}）`); t.addEventListener('click', () => this.menu.open(r.target, { name: r.targetName, ...(r.kind === 'chat' ? { mid: r.ref, text: r.lines.find((l) => l.hit)?.text } : {}) })); who.append(t); } else who.append(document.createTextNode(r.targetName || '（找不到作者）'));
    card.append(who);
    if (r.note) card.append(el('div', 'adm-where', `补充：${r.note}`));
    const lines = el('div', 'rep-lines');
    for (const l of r.lines) { const d = el('div', l.hit ? 'hit' : 'ctx', `${l.from}：${l.text}`); d.title = when(l.ts); lines.append(d); }
    card.append(lines);
    if (r.done) return card;
    const bar = el('div', 'adm-actions');
    const finish = (verdict: 'done' | 'dismiss', action?: string) => this.net.adm({ op: 'rep_handle', id: r.id, verdict, ...(action ? { action } : {}) });
    const act = (label: string, run: () => void, action: string, opts: { primary?: boolean; confirm?: string } = {}) => bar.append(this.btn(label, () => { if (opts.confirm && !confirm(opts.confirm)) return; run(); finish('done', action); }, opts.primary));
    if (r.kind === 'chat') act('撤回这条', () => this.net.adm({ op: 'recall', mid: r.ref }), '撤回消息', { primary: true });
    if (r.kind === 'board') act('删除这条留言', () => this.net.delBoard(r.ref), '删除留言', { primary: true });
    if (r.kind === 'place') act(r.cid ? '删除这条评论' : '删除这条留言', () => this.net.placeDel(r.ref, r.cid), r.cid ? '删除评论' : '删除留言', { primary: true });
    if (r.kind === 'wall') act(r.cid ? '删除这条评论' : '删除这个帖子', () => this.net.wallDel(r.ref, r.cid), r.cid ? '删除评论' : '删除帖子', { primary: true });
    if (r.target) {
      const t = r.target, n = r.targetName;
      act('禁言 1 小时', () => this.net.adm({ op: 'mute', uid: t, min: 60 }), '禁言 1 小时');
      act('禁言 1 天', () => this.net.adm({ op: 'mute', uid: t, min: 1440 }), '禁言 1 天');
      act('封禁 1 天', () => this.net.adm({ op: 'ban', uid: t, hours: 24, reason: `被举报：${REPORT_REASONS[r.reason] ?? ''}` }), '封禁 1 天', { confirm: `封禁 ${n} 1 天？` });
      bar.append(this.btn('更多处理…', () => this.menu.open(t, { name: n, ...(r.kind === 'chat' ? { mid: r.ref, text: r.lines.find((l) => l.hit)?.text } : {}) })));
    }
    bar.append(this.btn('标记已处理', () => finish('done', '已处理')), this.btn('驳回', () => finish('dismiss')));
    card.append(bar);
    return card;
  }

  private renderCats() {
    this.body.append(el('div', 'create-sub', `校园里一共 ${this.cats.length} 只小猫。改名后所有玩家立刻看到，重启服务器也不会丢（存在服务器的 config.json 里）。位置是它们的"家"，平时在附近溜达。`));
    const list = el('div', 'adm-list');
    for (const c of this.cats) {
      const row = el('div', 'adm-row adm-cat'); const input = el('input'); input.type = 'text'; input.value = c.name; input.maxLength = 8; input.className = 'adm-catname';
      const pic = el('canvas', 'adm-catpic'); try { drawFrame(pic, this.textures, 'cats', `cat${c.coat}_sit_0`, 3); } catch { /* 图集没加载：不显示小图 */ }
      const save = this.btn('保存', () => this.net.adm({ op: 'cat_name', id: c.id, name: input.value })); if (!this.net.can('cat_name')) { input.disabled = true; save.disabled = true; save.title = `改名需要${ROLE_NAMES.owner}权限`; }
      const go = this.btn('传送过去', () => this.net.adm({ op: 'tp', x: c.tx * 16, y: c.ty * 16 + 12 }));
      const left = el('div', 'adm-name'); left.append(el('span', 'adm-uid', `#${c.id} `), input, save, go);
      const mid = el('div'); mid.append(left, el('div', 'adm-where', `${COATS[c.coat] ?? '猫'} · ${c.where} · (${c.tx}, ${c.ty})`));
      row.append(pic, mid);
      list.append(row);
    }
    this.body.append(list);
  }

  /** 公屏记录：全部都存着。按校园号 / 关键词查，新的在前；已撤回的留着原文、带标记；点名字弹管理菜单，每条有「撤回」 */
  private renderLogs() {
    const b = this.body;
    const uid = el('input'); uid.type = 'text'; uid.placeholder = '校园号（可空）'; uid.value = this.logUid; uid.style.width = '110px';
    const q = el('input'); q.type = 'text'; q.placeholder = '关键词（可空）'; q.value = this.logQ; q.style.width = '150px';
    const wsel = el('select'); for (const [v, t] of [['', '所有世界'], ['public', '只看公共世界'], ['solo', '所有个人世界'], ['group', '所有好友世界']]) { const o = el('option', undefined, t); o.value = v; wsel.append(o); }
    if (this.logWorld && !['public', 'solo', 'group'].includes(this.logWorld)) { const o = el('option', undefined, `指定：${worldTag(this.logWorld)} ${this.logWorld.split(':')[1]}`); o.value = this.logWorld; wsel.append(o); }
    wsel.value = this.logWorld; wsel.addEventListener('change', () => { this.logWorld = wsel.value; this.queryLogs(); });
    const csel = el('select'); for (const [v, t] of [['', '所有频道'], ['world', '🌍 世界'], ['near', '📍 附近'], ['party', '👥 队伍']]) { const o = el('option', undefined, t); o.value = v; csel.append(o); }
    csel.value = this.logCh; csel.addEventListener('change', () => { this.logCh = csel.value as typeof this.logCh; this.queryLogs(); });
    const go = () => { this.logUid = uid.value.trim(); this.logQ = q.value.trim(); this.queryLogs(); };
    for (const i of [uid, q]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const bar = el('div', 'adm-actions'); bar.append(uid, q, wsel, csel, this.btn('查询', go, true), this.btn('清除条件', () => { this.logUid = ''; this.logQ = ''; this.logWorld = ''; this.logCh = ''; this.queryLogs(); this.render(); }), el('span', 'adm-uid', `共存了 ${this.logItems.length}${this.logMore ? '+' : ''} 条（从新到旧）`));
    b.append(bar);
    if (!this.logItems.length) b.append(el('div', 'board-empty', '没有符合条件的记录。'));
    const list = el('div', 'adm-list');
    for (const it of this.logItems) {
      const row = el('div', 'adm-row adm-log' + (it.del ? ' off' : ''));
      const who = el('span', 'chat-who clickable', `${it.from}（${it.uid ?? '?'}）`); if (it.uid) who.addEventListener('click', () => this.menu.open(it.uid!, { name: it.from, mid: it.mid, text: it.text }));
      const txt = el('span', it.del ? 'adm-del' : undefined, ` ${it.text}`);
      row.append(el('span', 'chat-time', `#${it.mid} ${when(it.ts)} `)); if (it.ch) { const ct = el('span', 'rep-tag', it.ch === 'near' ? '📍附近' : it.ch === 'party' ? '👥队伍' : it.ch); row.append(ct, document.createTextNode(' ')); } if (it.w) { const wt = el('span', 'rep-tag', worldTag(it.w)); wt.title = it.w; wt.style.cursor = 'pointer'; wt.addEventListener('click', () => { this.logWorld = it.w!; this.queryLogs(); }); row.append(wt, document.createTextNode(' ')); } row.append(who, txt);
      if (it.del) row.append(el('span', 'adm-uid', ` 已撤回（${it.by ?? ''}）`)); else row.append(this.btn('撤回', () => this.net.adm({ op: 'recall', mid: it.mid })));
      list.append(row);
    }
    b.append(list);
    if (this.logMore) b.append(this.btn('加载更早的', () => this.queryLogs(this.logItems[this.logItems.length - 1]?.mid)));
  }

  /** 私聊记录：先输入校园号看他有哪些会话，再点开某一段看内容。私聊属于玩家隐私，每次查看都会记进「操作记录」 */
  private renderDm() {
    const b = this.body;
    b.append(el('div', 'create-sub', '⚠ 私聊属于玩家隐私：每次查看都会记进「操作记录」（谁看了谁的私聊）。只在处理举报、违规时查看。'));
    const uid = el('input'); uid.type = 'text'; uid.placeholder = '校园号'; uid.value = this.dmUidText; uid.style.width = '110px';
    const go = () => { const u = Number(uid.value.trim()); if (u > 0) { this.dmUidText = String(u); this.dm = null; this.dmItems = []; this.net.adm({ op: 'log_dm', uid: u }); this.render(); } };
    uid.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    b.append(this.rowOf(uid, this.btn('看他的私聊会话', go, true)));
    const d = this.dm; if (!d) return;
    if (d.peers) {
      b.append(el('div', 'adm-bar-title', `${d.name}（#${d.uid}）的私聊会话（${d.peers.length} 个）`));
      if (!d.peers.length) b.append(el('div', 'board-empty', '没有私聊记录。'));
      for (const p of d.peers) { const r = el('div', 'adm-row'); r.append(el('span', undefined, `${p.name}（#${p.uid}） · ${p.count} 条 · 最后 ${when(p.last)}`)); r.addEventListener('click', () => { this.dmItems = []; this.net.adm({ op: 'log_dm', uid: d.uid, peer: p.uid }); }); b.append(r); }
    } else {
      b.append(this.rowOf(this.btn('← 返回会话列表', () => { this.dm = null; this.net.adm({ op: 'log_dm', uid: d.uid }); }), el('span', 'adm-bar-title', `${d.name} ⇄ ${d.peerName}`)));
      if (d.more && this.dmItems.length) b.append(this.btn('加载更早的', () => { this.dmPaging = true; this.net.adm({ op: 'log_dm', uid: d.uid, peer: d.peer!, before: this.dmItems[0].id }); }));
      const list = el('div', 'adm-list');
      for (const m of this.dmItems) { const row = el('div', 'adm-row adm-log'); row.append(el('span', 'chat-time', `${when(m.ts)} `), el('span', 'chat-who', `${m.from === d.uid ? d.name : d.peerName}：`), el('span', undefined, m.text)); list.append(row); }
      b.append(list);
    }
  }
  private rowOf(...kids: HTMLElement[]) { const r = el('div', 'adm-actions'); r.append(...kids); return r; }

  /** 封禁名单 + 管理员操作记录（谁在什么时候对谁做了什么，包括查看私聊） */
  private renderAudit() {
    const b = this.body;
    b.append(el('div', 'adm-bar-title', `封禁名单（${this.bans.length}）`));
    if (!this.bans.length) b.append(el('div', 'create-sub', '没有被封禁的玩家。'));
    for (const x of this.bans) { const r = el('div', 'adm-actions'); r.append(el('span', undefined, `${x.name}（#${x.uid}）· ${x.until - Date.now() > 3 * 365 * 24 * 3600e3 ? '永久' : `到 ${when(x.until)}`}${x.reason ? ` · ${x.reason}` : ''} · 由 ${x.by} 封`), this.btn('解封', () => this.net.adm({ op: 'unban', uid: x.uid }))); b.append(r); }
    b.append(el('div', 'adm-bar-title', '管理员操作记录（新的在前，永久保存）'));
    if (!this.audit.length) b.append(el('div', 'create-sub', '还没有记录。'));
    const list = el('div', 'adm-list');
    for (const e of this.audit) { const row = el('div', 'adm-row adm-log'); row.append(el('span', 'chat-time', `${when(e.ts)} `), el('span', 'chat-who', `${e.admin}：`), el('span', undefined, `${OP_NAMES[e.op] ?? e.op}${e.target ? ` → #${e.target}` : ''}${e.detail ? `（${e.detail}）` : ''}`)); list.append(row); }
    b.append(list);
    if (this.auditMore) b.append(this.btn('加载更早的', () => { this.auditPaging = true; this.net.adm({ op: 'audit', before: this.audit[this.audit.length - 1]?.ts }); }));
  }

  /** 敏感词：总开关、各类别开关、加词/删词/白名单、最近的命中记录（误杀可以一键放行）。词库本身只在服务器上，这里看不到内置词 */
  private renderFilter() {
    const f = this.flt, b = this.body;
    if (!f) { b.append(el('div', 'create-sub', '读取中…')); return; }
    const row = (...kids: (HTMLElement | string)[]) => { const r = el('div', 'adm-actions'); for (const k of kids) r.append(typeof k === 'string' ? el('span', undefined, k) : k); return r; };
    const input = (ph: string, w = 160) => { const i = el('input'); i.type = 'text'; i.maxLength = 30; i.placeholder = ph; i.style.width = `${w}px`; return i; };
    b.append(el('div', 'adm-bar-title', '总开关'), row(`敏感词过滤：${f.on ? '已开启' : '已关闭（所有内容都放行）'}`, this.btn(f.on ? '关闭过滤' : '开启过滤', () => this.net.adm({ op: 'filter_toggle', on: !f.on }))));
    b.append(el('div', 'adm-bar-title', `词库（共 ${f.size} 个词，只在服务器上，这里不显示内置词）`));
    for (const cat of Object.keys(f.names)) {
      const off = f.off.includes(cat), n = f.counts[cat];
      b.append(row(`${f.names[cat]}（${cat}）：${n !== undefined ? `${n} 词` : cat === 'info' ? '规则' : '0 词'} · ${off ? '已关闭' : '已开启'}`, this.btn(off ? '开启' : '关闭', () => this.net.adm({ op: 'filter_cat', cat, on: off }))));
    }
    const w = input('要加的词（2~20 字）'); const lv = el('select'); for (const [v, t] of [['1', '1 级 打码'], ['2', '2 级 拦截'], ['3', '3 级 拦截+禁言']]) { const o = el('option', undefined, t); o.value = v; lv.append(o); } lv.value = '2';
    b.append(el('div', 'adm-bar-title', '加词（立刻生效，不用重启）'), row(w, lv, this.btn('加入词库', () => { if (w.value.trim()) { this.net.adm({ op: 'word_add', word: w.value, level: Number(lv.value) as 1 | 2 | 3 }); w.value = ''; } }, true)));
    const wl = input('白名单短语（误杀时用，2~30 字）', 220);
    b.append(el('div', 'adm-bar-title', '白名单（命中的词完全落在这个短语里就放行）'), row(wl, this.btn('加入白名单', () => { if (wl.value.trim()) { this.net.adm({ op: 'white_add', word: wl.value }); wl.value = ''; } }, true), this.btn('重新读取词库文件', () => this.net.adm({ op: 'filter_reload' }))));
    if (f.custom.length) { const r = row('自己加的词：'); for (const c of f.custom) r.append(this.btn(`${c.word}（${c.level}级）✕`, () => this.net.adm({ op: 'word_del', word: c.word }))); b.append(r); }
    if (f.white.length) { const r = row('白名单：'); for (const x of f.white) r.append(this.btn(`${x} ✕`, () => this.net.adm({ op: 'white_del', word: x }))); b.append(r); }
    for (const wn of f.warnings) b.append(el('div', 'create-sub', `⚠ ${wn}`));
    b.append(el('div', 'adm-bar-title', `最近的命中记录（只记被打码/拦截的，保留 30 天，含玩家原文，注意保密）`));
    if (!f.hits.length) b.append(el('div', 'create-sub', '还没有命中记录'));
    for (const h of f.hits) {
      const r = el('div', 'adm-actions'); const t = new Date(h.ts);
      r.append(el('span', undefined, `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · ${h.name}（${h.uid}）· ${h.where} · ${h.cats.map((c) => f.names[c] ?? c).join('、')}（${h.level} 级）：${h.text}`));
      const ws = [...new Set(h.words.filter((x) => Array.from(x).length >= 2 && !x.startsWith('(')))];
      for (const x of ws.slice(0, 3)) r.append(this.btn(`放行「${x}」`, () => this.net.adm({ op: 'white_add', word: x })));
      b.append(r);
    }
  }

  private renderTools() {
    const say = el('input'); say.type = 'text'; say.maxLength = 100; say.placeholder = '广播内容（所有在线玩家的公屏里都会看到）'; say.className = 'adm-say';
    const row = el('div', 'adm-actions'); row.append(say, this.btn('全服广播', () => { if (say.value.trim()) { this.net.adm({ op: 'say', text: say.value }); say.value = ''; } }, true));
    const lock = el('div', 'adm-actions');
    lock.append(el('span', undefined, `公屏状态：${this.locked ? '已关闭（只有管理员能发言）' : '开放中'}`), this.btn(this.locked ? '重新开放公屏' : '暂时关闭公屏', () => this.net.adm({ op: 'lock', on: !this.locked })));
    const ann = el('div', 'adm-actions');
    ann.append(el('span', undefined, `公屏进出提示（某某进入/离开了校园）：${this.announce ? '已开启（在线人数多时自动不发）' : '已关闭'}`), this.btn(this.announce ? '关闭进出提示' : '开启进出提示', () => this.net.adm({ op: 'announce', on: !this.announce })));
    this.body.append(el('div', 'adm-bar-title', '全服广播'), row, el('div', 'adm-bar-title', '公屏'), lock, ann, el('div', 'create-sub', '广播属于公开内容，发之前想好措辞。禁言、踢人在「玩家」里选中某位玩家后操作；所有管理操作都会记在服务器日志里。'));
  }
}
