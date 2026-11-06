import { ITEMS } from '@/shared/items';
import { TITLES, titleDef } from '@/shared/titles';
import { LEVEL_NAMES } from '@/shared/cats';
import { COINS_ADJ_MAX, MOD_MUTE_MAX_MIN, MUTE_PRESETS, OP_NAMES, ROLE_NAMES, type AdminDossier as Dossier } from '@/shared/admin';
import { REPORT_REASONS } from '@/shared/report';
import type { NetClient } from '@/net/client';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const when = (ts: number) => { const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const FOREVER = 3 * 365 * 24 * 3600e3;
type Sub = 'overview' | 'assets' | 'social' | 'reports' | 'records';
const SUBS: [Sub, string][] = [['overview', '概览与处置'], ['assets', '背包与币'], ['social', '好友屏蔽'], ['reports', '举报'], ['records', '记录与小猫']];

export interface DossierHooks {
  /** 返回玩家列表 */ back(): void;
  /** 打开另一位玩家的档案（好友列表里点名字） */ open(uid: number): void;
  openLogs(uid: number): void; openDm(uid: number): void; showCard(uid: number): void;
  /** 去「举报」页处理 */ openReports(): void;
}

/**
 * 玩家档案：管理员处理一位玩家要用到的全部东西放在一页里——先看情况（资料、状态、背包、好友、举报、做过的操作），再处置。
 * 分五个小页：概览与处置 / 背包与币 / 好友屏蔽 / 举报 / 记录与小猫。按钮按权限表显示：协管员看不到的操作（封禁、改资料、发物品和币……）
 * 整段不出现，只留一行提示；真正的权限检查在服务器。
 */
export class AdminDossier {
  readonly el = el('div', 'dos');
  private head = el('div', 'dos-head'); private subs = el('div', 'seg-row dos-subs'); private msg = el('div', 'board-msg'); private body = el('div', 'dos-body');
  private uid = 0; private d: Dossier | null = null; private sub: Sub = 'overview';
  /** 刚重发的身份备份码（只显示一次：关掉或换人就清掉，服务器也不保存） */
  private code: { uid: number; name: string; code: string } | null = null;

  constructor(private net: NetClient, private hooks: DossierHooks) {
    this.el.append(this.head, this.subs, this.msg, this.body);
  }
  get current() { return this.uid; }
  /** 打开某位玩家的档案（切到「概览」） */
  show(uid: number) { if (this.code?.uid !== uid) this.code = null; this.uid = uid; this.d = null; this.sub = 'overview'; this.msg.textContent = ''; this.render(); this.refresh(); }
  refresh() { if (this.uid) this.net.adm({ op: 'dossier', uid: this.uid }); }
  setData(d: Dossier) { if (d.info.uid !== this.uid) return; this.d = d; if (!this.editing()) this.render(); }
  /** 离开档案页 / 关闭面板时清掉（新备份码只显示一次） */
  clearCode() { this.code = null; }
  /** 服务器回的新身份备份码：显示在概览页顶部，直到你点「已复制，关闭」 */
  showCode(m: { uid: number; name: string; code: string }) { this.code = m; this.sub = 'overview'; if (m.uid === this.uid) this.render(); }
  result(ok: boolean, text: string) { this.msg.textContent = text; this.msg.classList.toggle('bad', !ok); if (ok) this.refresh(); }
  /** 正在输入框里打字时不重绘（会把没写完的字清掉） */
  private editing() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && this.el.contains(a); }

  private btn(label: string, fn: () => void, o: { primary?: boolean; danger?: boolean; title?: string } = {}) { const b = el('button', `btn${o.primary ? ' primary' : ''}${o.danger ? ' danger' : ''}`, label); b.type = 'button'; if (o.title) b.title = o.title; b.addEventListener('click', fn); return b; }
  private row(title: string, ...kids: (HTMLElement | string)[]) { const r = el('div', 'adm-actions'); if (title) r.append(el('b', undefined, title)); for (const k of kids) r.append(typeof k === 'string' ? document.createTextNode(k) : k); return r; }
  private section(title: string, ...rows: HTMLElement[]) { const s = el('div', 'dos-sec'); s.append(el('div', 'adm-bar-title', title), ...rows); return s; }
  private input(ph: string, w: number, value = '', max = 30) { const i = el('input'); i.type = 'text'; i.placeholder = ph; i.value = value; i.maxLength = max; i.style.width = `${w}px`; return i; }
  private ownerNote(what: string) { return el('div', 'create-sub dos-lock', `🔒 ${what}需要${ROLE_NAMES.owner}权限（你是${ROLE_NAMES[this.net.adminRole ?? 'mod']}）`); }
  private itemName = (id: string) => ITEMS.find((i) => i.id === id)?.name ?? id;

  private render() {
    const d = this.d, uid = this.uid;
    this.head.replaceChildren(); this.subs.replaceChildren(); this.body.replaceChildren();
    const back = this.btn('← 返回列表', () => this.hooks.back());
    if (!d) { this.head.append(back, el('b', undefined, ` 校园号 ${uid}`), el('div', 'create-sub', '读取中…')); return; }
    const i = d.info;
    const status = [i.mod ? '🛡协管员' : '', i.online ? '🟢 在线' : `⚪ 离线（${when(i.seen)}）`, i.where, i.mutedMin > 0 ? (i.mutedMin > 100000 ? '🔇永久禁言' : `🔇禁言还剩 ${i.mutedMin} 分钟`) : '', i.ban ? `⛔封禁到 ${i.ban.until - Date.now() > FOREVER ? '永久' : when(i.ban.until)}${i.ban.reason ? `（${i.ban.reason}）` : ''}` : ''].filter(Boolean).join(' · ');
    const top = el('div', 'adm-actions'); top.append(back, el('span', 'adm-bar-title', `${i.name}（#${i.uid}）`), el('span', 'adm-uid', `学生证号 ${i.cardNo}`));
    this.head.append(top, el('div', 'create-sub', status), el('div', 'create-sub', `${i.college} · ${i.major} · ${i.year} 级 · 签名「${i.motto || '无'}」 · 好友 ${i.friends} 位 · 在线 ${Math.round(i.playSec / 3600 * 10) / 10} 小时 · 校园币 ${d.coins}`));
    const badge = (s: Sub) => (s === 'reports' ? d.reports.filter((r) => !r.done).length : 0);
    for (const [s, label] of SUBS) { const n = badge(s); const b = el('button', 'seg' + (s === this.sub ? ' on' : ''), n ? `${label} (${n})` : label); b.type = 'button'; b.addEventListener('click', () => { this.sub = s; this.render(); }); this.subs.append(b); }
    if (this.sub === 'overview') this.renderOverview(d); else if (this.sub === 'assets') this.renderAssets(d); else if (this.sub === 'social') this.renderSocial(d); else if (this.sub === 'reports') this.renderReports(d); else this.renderRecords(d);
  }

  // ------------------------------------------------------------ 概览与处置
  private renderOverview(d: Dossier) {
    const b = this.body, i = d.info, uid = i.uid, name = i.name, net = this.net;
    if (this.code && this.code.uid === uid) { // 刚生成的新身份备份码：只显示一次
      const box = el('div', 'dos-code');
      const val = el('div', 'dos-code-val', this.code.code); val.title = '点一下选中';
      val.addEventListener('click', () => { const r = document.createRange(); r.selectNodeContents(val); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); });
      const copy = this.btn('复制', () => { void navigator.clipboard?.writeText(this.code!.code).then(() => this.result(true, '已复制新备份码'), () => this.result(false, '复制失败，请手动选中复制')); }, { primary: true });
      const done = this.btn('我已复制，关闭', () => { this.code = null; this.render(); });
      box.append(el('div', 'adm-bar-title', `🔑 ${this.code.name}（#${uid}）的新身份备份码`), val, this.row('', copy, done), el('div', 'create-sub', '只显示这一次，服务器不保存、日志里也没有。请私下发给本人（别发到群里）：让他在新浏览器的「恢复身份」里输入。旧的身份码已经作废。'));
      b.append(box);
    }
    // 位置 / 世界
    const loc: HTMLElement[] = [];
    if (i.online) {
      const r = this.row('位置：', this.btn('去他那里', () => net.adm({ op: 'goto', uid })), this.btn('叫他过来', () => net.adm({ op: 'bring', uid })));
      if (i.world && i.world.kind !== 'public') { const wid = i.world.id; r.append(el('span', undefined, `　TA 在${i.world.kind === 'solo' ? '个人世界' : '好友世界'}：`), this.btn('👻 隐身进去看看', () => net.adm({ op: 'world_enter', world: wid, ghost: true }), { primary: true }), this.btn('🛡 现身进去', () => net.adm({ op: 'world_enter', world: wid, ghost: false })), this.btn('回到原来的世界', () => net.adm({ op: 'world_leave' }))); }
      loc.push(r);
    } else loc.push(el('div', 'create-sub', `TA 不在线，最后在：${i.where}`));
    b.append(this.section('位置与世界', ...loc));

    // 处置
    const mute = this.row('禁言：');
    for (const m of MUTE_PRESETS) { if (net.adminRole !== 'owner' && m.min !== 0 && (m.min < 0 || m.min > MOD_MUTE_MAX_MIN)) continue; mute.append(this.btn(m.label.replace('禁言 ', ''), () => { if (m.min !== 0 && !confirm(`${m.label}：${name}？`)) return; net.adm({ op: 'mute', uid, min: m.min }); })); }
    const act: HTMLElement[] = [mute];
    const k = this.row('下线：'); if (i.online) k.append(this.btn('踢下线', () => { if (confirm(`把 ${name} 请出校园？`)) net.adm({ op: 'kick', uid }); }));
    if (net.can('ban')) {
      k.append(this.btn('封 1 天', () => { const r = prompt(`封禁 ${name} 1 天，原因（可不填）：`, ''); if (r !== null) net.adm({ op: 'ban', uid, hours: 24, reason: r }); }, { danger: true }), this.btn('封 7 天', () => { const r = prompt(`封禁 ${name} 7 天，原因（可不填）：`, ''); if (r !== null) net.adm({ op: 'ban', uid, hours: 168, reason: r }); }, { danger: true }), this.btn('永久封禁', () => { if (!confirm(`永久封禁 ${name}？TA 会被踢下线，再也进不来（可以随时解封）。`)) return; const r = prompt(`永久封禁 ${name}，原因（可不填）：`, ''); if (r !== null) net.adm({ op: 'ban', uid, hours: -1, reason: r }); }, { danger: true }));
      if (i.ban) k.append(this.btn('解封', () => net.adm({ op: 'unban', uid }), { primary: true }));
    } else k.append(el('span', 'create-sub', `　封禁需要${ROLE_NAMES.owner}`));
    act.push(k);
    b.append(this.section('处置', ...act));

    // 重发身份备份码（站长）：同学丢了号 / 清了浏览器，核对身份后给他一个新码
    if (net.can('reissue_code') && !i.mod) {
      b.append(this.section('身份备份码（找回账号）', this.row('', this.btn('重发身份备份码…', () => {
        if (!confirm(`给 ${name}（#${uid}）重发身份备份码？\n\n· 请先核对对方身份（学生证号、学院专业、好友等）。\n· 旧的身份码立刻作废：如果这个号不是他本人在用，原主人就进不去了。\n· TA 在线的话会被踢下线。\n· 新备份码只显示一次。`)) return;
        net.adm({ op: 'reissue_code', uid });
      }, { danger: true })), el('div', 'create-sub', '同学丢了身份码 / 换了浏览器找不回号时用：他的校园号、好友、背包、校园币都不变，只是换一个新的钥匙。')));
    }
    // 任命协管员（站长）：协管员没有口令，任命后下次进游戏（在线的当场）自动生效，随时可撤销
    if (net.can('mod_set')) {
      b.append(this.section('协管员', this.row('', i.mod ? this.btn('撤销协管员身份', () => { if (confirm(`撤销 ${name} 的协管员身份？`)) net.adm({ op: 'mod_set', uid, on: false }); }, { danger: true }) : this.btn('任命为协管员', () => { if (confirm(`任命 ${name} 为协管员？TA 能禁言（≤1 天）、踢人、撤回、处理举报、看玩家档案，但不能封禁、改资料、发物品或币、看私聊。随时可以撤销。`)) net.adm({ op: 'mod_set', uid, on: true }); }, { primary: true })), el('div', 'create-sub', i.mod ? `${name} 现在是协管员（没有口令，用自己的账号进游戏就有「管理」按钮）。` : '协管员由你任命，没有自己的口令；只任命你信得过的人。')));
    }
    // 通知
    const text = this.input('给 TA 的一条系统通知（最多 100 字；警告、提醒、道歉）', 320, '', 100);
    const send = () => { const t = text.value.trim(); if (!t) return; net.adm({ op: 'notify', uid, text: t }); text.value = ''; };
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    b.append(this.section('发通知', this.row('', text, this.btn('发送', send, { primary: true })), el('div', 'create-sub', i.online ? 'TA 在线，会当场在公屏看到「📢 管理员通知」。' : `TA 不在线：通知会存着，下次进来时发出（现在已存 ${d.pendingNotes} 条，最多 5 条）。`)));

    // 资料（站长）
    if (net.can('profile_set')) {
      const f = (v: string, ph: string, w: number) => this.input(ph, w, v, 12);
      const n = f(i.name, '昵称', 90), c = f(i.college, '学院', 90), m = f(i.major, '专业', 90), mo = f(i.motto, '签名', 140);
      b.append(this.section('改资料（昵称不合适时整改；不经过敏感词过滤，TA 会收到通知）', this.row('', n, c, m, mo, this.btn('保存', () => { if (confirm(`修改 ${name} 的资料？TA 会收到通知。`)) net.adm({ op: 'profile_set', uid, name: n.value, college: c.value, major: m.value, motto: mo.value }); }))));
    }

    // 称号（站长）
    if (net.can('title')) {
      const ttl = el('select'); for (const t of TITLES.filter((x) => !x.special)) ttl.append(new Option(t.name, t.id));
      const owned = d.titles.map((id) => titleDef(id)?.name ?? id.replace(/^custom:\d+:/, '')).join('、') || '无';
      const cname = this.input('专属称号（最多 8 个字）', 150, '', 8), ccolor = el('input'); ccolor.type = 'color'; ccolor.value = '#ff7ac8'; ccolor.className = 'adm-color'; ccolor.title = '称号颜色';
      const wear = el('input'); wear.type = 'checkbox'; wear.checked = true; const wl = el('label'); wl.append(wear, document.createTextNode(' 立刻替他戴上'));
      const rows = [this.row('', `已获得：${owned}`), this.row('授予：', ttl, this.btn('授予', () => net.adm({ op: 'title', uid, id: ttl.value }))), this.row('专属：', cname, ccolor, wl, this.btn('授予', () => { if (cname.value.trim()) net.adm({ op: 'title_custom', uid, name: cname.value, color: ccolor.value, wear: wear.checked }); }, { primary: true }))];
      if (i.title) rows.push(this.row('', this.btn(`收回他戴的称号「${titleDef(i.title)?.name ?? i.title}」`, () => net.adm({ op: 'title_take', uid, id: i.title! }))));
      b.append(this.section('称号', ...rows));
    } else b.append(this.ownerNote('封禁、改资料、称号、发物品 / 校园币、看私聊'));

    // 查看
    const view = this.row('', this.btn('资料卡 / 加好友', () => this.hooks.showCard(uid)), this.btn('TA 的公屏记录', () => this.hooks.openLogs(uid)));
    if (net.can('log_dm')) view.append(this.btn('TA 的私聊记录', () => { if (confirm('私聊属于玩家隐私。查看会被记进「操作记录」，确定要看吗？')) this.hooks.openDm(uid); }));
    b.append(this.section('查看', view));
  }

  // ------------------------------------------------------------ 背包与币
  private renderAssets(d: Dossier) {
    const b = this.body, uid = d.info.uid, name = d.info.name, net = this.net;
    const coin = el('div', 'dos-coin'); coin.append(el('span', 'coin-ico'), document.createTextNode(` ${d.coins} 校园币`));
    const rows: HTMLElement[] = [coin];
    if (net.can('coins_adj')) {
      const delta = el('input'); delta.type = 'number'; delta.placeholder = '数额'; delta.className = 'adm-n'; delta.style.width = '90px'; delta.min = '1'; delta.max = String(COINS_ADJ_MAX);
      const why = this.input('原因（记进操作记录）', 200, '', 30);
      const go = (sign: 1 | -1) => { const n = Math.floor(Number(delta.value)); if (!(n >= 1 && n <= COINS_ADJ_MAX)) { this.result(false, `数额要在 1 ~ ${COINS_ADJ_MAX} 之间`); return; } if (!confirm(`${sign > 0 ? '给' : '扣'} ${name} ${n} 校园币？`)) return; net.adm({ op: 'coins_adj', uid, delta: sign * n, reason: why.value }); delta.value = ''; };
      rows.push(this.row('调整：', delta, why, this.btn('＋ 加', () => go(1), { primary: true }), this.btn('－ 扣', () => go(-1), { danger: true })));
    }
    b.append(this.section('校园币', ...rows));
    const inv = el('div', 'dos-inv');
    if (!d.inv.length) inv.append(el('div', 'board-empty', '背包是空的。'));
    for (const it of d.inv) {
      const r = el('div', 'dos-item'); r.append(el('span', undefined, `${this.itemName(it.id)}`), el('span', 'adm-uid', ` ×${it.n}`));
      if (net.can('item_take')) r.append(this.btn('收走…', () => { const v = prompt(`收走 ${name} 的「${this.itemName(it.id)}」，数量（现有 ${it.n}）：`, '1'); if (v === null) return; const n = Math.floor(Number(v)); if (n >= 1) net.adm({ op: 'item_take', uid, item: it.id, n }); }));
      inv.append(r);
    }
    b.append(this.section(`背包（${d.inv.length} 种）`, inv));
    if (net.can('give')) {
      const item = el('select'); for (const it of ITEMS) item.append(new Option(it.name, it.id));
      const n = el('input'); n.type = 'number'; n.min = '1'; n.max = '999'; n.value = '1'; n.className = 'adm-n';
      b.append(this.section('赠送物品', this.row('', item, n, this.btn('发送', () => net.adm({ op: 'give', uid, item: item.value, n: Number(n.value) }), { primary: true }))));
    } else b.append(this.ownerNote('调整校园币、收走或赠送物品'));
  }

  // ------------------------------------------------------------ 好友屏蔽
  private renderSocial(d: Dossier) {
    const b = this.body;
    const people = (list: { uid: number; name: string; online?: boolean }[], empty: string) => {
      const box = el('div', 'dos-people'); if (!list.length) box.append(el('div', 'board-empty', empty));
      for (const f of list) { const x = el('button', 'dos-person', `${f.online === undefined ? '' : f.online ? '🟢 ' : '⚪ '}${f.name}（#${f.uid}）`); x.type = 'button'; x.title = '打开 TA 的档案'; x.addEventListener('click', () => this.hooks.open(f.uid)); box.append(x); }
      return box;
    };
    b.append(this.section(`好友（${d.friends.length}）`, people(d.friends, '没有好友。')), this.section(`TA 屏蔽的人（${d.blocked.length}）`, people(d.blocked, '没有屏蔽任何人。')), this.section('被屏蔽', el('div', 'create-sub', d.blockedBy ? `有 ${d.blockedBy} 位玩家屏蔽了 TA${d.blockedBy >= 3 ? '——可能是个信号，结合举报记录看看。' : '。'}` : '没有人屏蔽 TA。')));
  }

  // ------------------------------------------------------------ 举报
  private renderReports(d: Dossier) {
    const b = this.body, box = el('div', 'dos-list');
    if (!d.reports.length) box.append(el('div', 'board-empty', 'TA 没有被举报过，也没举报过别人。'));
    for (const r of d.reports) {
      const row = el('div', 'dos-rep' + (r.done ? ' done' : ''));
      row.append(el('span', 'rep-tag', r.kind), el('span', 'rep-tag n', REPORT_REASONS[r.reason] ?? '其他'), document.createTextNode(r.role === 'against' ? ` 被 ${r.other || '?'} 举报` : ` 举报了 ${r.other || '?'}`), el('span', 'adm-uid', `　#${r.id} · ${when(r.ts)}`), el('span', `rep-tag ${r.done ? (r.done === 'dismiss' ? 'no' : 'ok') : ''}`, r.done ? (r.done === 'dismiss' ? '已驳回' : '已处理') : '待处理'));
      box.append(row);
    }
    b.append(this.section(`相关举报（${d.reports.length}）`, box), this.row('', this.btn('去「举报」页看原文并处理', () => this.hooks.openReports())));
  }

  // ------------------------------------------------------------ 记录与小猫
  private renderRecords(d: Dossier) {
    const b = this.body, box = el('div', 'dos-list');
    if (!d.audit.length) box.append(el('div', 'board-empty', '管理员还没对 TA 做过操作。'));
    for (const e of d.audit) { const r = el('div', 'adm-log'); r.append(el('span', 'chat-time', `${when(e.ts)} `), el('span', 'chat-who', `${e.admin}：`), document.createTextNode(`${OP_NAMES[e.op] ?? e.op}${e.detail ? `（${e.detail}）` : ''}`)); box.append(r); }
    b.append(this.section(`管理员对 TA 做过的操作（最近 ${d.audit.length} 条）`, box));
    const cats = el('div', 'dos-list');
    if (!d.cats.length) cats.append(el('div', 'board-empty', '还没和任何小猫互动过。'));
    for (const c of d.cats) cats.append(el('div', 'adm-where', `#${c.id} ${c.name}${c.nick ? ` → 他叫它「${c.nick}」` : ''} · ${LEVEL_NAMES[c.level]}（好感 ${c.aff}）${c.following ? ' · 跟着他' : ''}`));
    b.append(this.section(`小猫（${d.cats.length} 只）`, cats));
  }
}
