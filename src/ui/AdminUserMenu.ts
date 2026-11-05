import { MOD_MUTE_MAX_MIN, MUTE_PRESETS, ROLE_NAMES, type AdminInfo } from '@/shared/admin';
import type { NetClient } from '@/net/client';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const when = (ts: number) => { const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

export interface UserMenuCtx { name: string; mid?: number; text?: string }
export interface UserMenuHooks {
  /** 看资料卡 / 加好友（普通玩家点名字的那个窗口） */
  showCard(uid: number): void;
  /** 去管理面板看这个人的公屏记录 / 私聊记录 */
  openLogs(uid: number): void;
  openDm(uid: number): void;
  /** 打开这个人的完整档案（管理面板「玩家」页） */
  openDossier(uid: number): void;
}

/**
 * 点公屏里的名字（管理员）弹出的菜单：这个人的情况 + 撤回这条 / 撤回他最近的全部 / 禁言 / 踢出 / 封禁 / 改资料 / 看他的公屏和私聊记录。
 * 真正的权限检查在服务器；这里只是界面，操作结果显示在菜单顶部。
 */
export class AdminUserMenu {
  private root = el('div', 'screen hidden');
  private body = el('div');
  private msg = el('div', 'tp-msg'); private title = el('div', 'board-title', '🛡 管理');
  private uid = 0; private ctx: UserMenuCtx = { name: '' }; private info: AdminInfo | null = null;

  constructor(private net: NetClient, private hooks: UserMenuHooks) {
    const panel = el('div', 'box tp adm-menu');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭'); close.addEventListener('click', () => this.close());
    head.append(this.title, close);
    panel.append(head, this.msg, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(uid: number, ctx: UserMenuCtx) { this.title.textContent = `🛡 管理（${ROLE_NAMES[this.net.adminRole ?? 'mod']}）`; this.uid = uid; this.ctx = ctx; this.info = null; this.msg.textContent = ''; this.root.classList.remove('hidden'); this.render(); this.net.adm({ op: 'player_info', uid }); }
  close() { this.root.classList.add('hidden'); }
  setInfo(i: AdminInfo) { if (!this.isOpen || i.uid !== this.uid) return; this.info = i; this.render(); }
  result(ok: boolean, text: string) { if (!this.isOpen) return; this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; if (ok) this.net.adm({ op: 'player_info', uid: this.uid }); }

  private btn(label: string, fn: () => void, primary = false, danger = false) { const b = el('button', `btn sm${primary ? ' primary' : ''}${danger ? ' danger' : ''}`, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  private row(title: string, ...kids: HTMLElement[]) { const r = el('div', 'adm-actions'); if (title) r.append(el('span', undefined, title)); r.append(...kids); return r; }

  private render() {
    const b = this.body, i = this.info, uid = this.uid, name = i?.name ?? this.ctx.name;
    b.replaceChildren();
    const status = i ? [i.online ? '在线' : `离线（${when(i.seen)}）`, i.where, i.mutedMin > 0 ? (i.mutedMin > 100000 ? '🔇永久禁言' : `🔇禁言还剩 ${i.mutedMin} 分钟`) : '', i.ban ? `⛔封禁到 ${i.ban.until - Date.now() > 3 * 365 * 24 * 3600e3 ? '永久' : when(i.ban.until)}${i.ban.reason ? `（${i.ban.reason}）` : ''}` : ''].filter(Boolean).join(' · ') : '读取中…';
    b.append(el('div', 'adm-bar-title', `${name}（#${uid}）`), el('div', 'create-sub', status));
    if (i) b.append(el('div', 'create-sub', `${i.college} · ${i.major} · ${i.year} 级 · 签名「${i.motto || '无'}」 · 好友 ${i.friends} 位 · 在线 ${Math.round(i.playSec / 3600 * 10) / 10} 小时 · 校园币 ${i.coins}`));
    if (this.ctx.mid) {
      b.append(el('div', 'adm-quote', `「${this.ctx.text ?? ''}」`));
      b.append(this.row('', this.btn('撤回这条', () => this.net.adm({ op: 'recall', mid: this.ctx.mid! }), true), this.btn('撤回 TA 最近 10 分钟的全部发言', () => this.net.adm({ op: 'recall_user', uid, min: 10 })), this.btn('最近 1 小时', () => { if (confirm(`撤回 ${name} 最近 1 小时的全部发言？`)) this.net.adm({ op: 'recall_user', uid, min: 60 }); })));
    } else b.append(this.row('', this.btn('撤回 TA 最近 10 分钟的发言', () => this.net.adm({ op: 'recall_user', uid, min: 10 }))));
    const mute = this.row('禁言：'); for (const m of MUTE_PRESETS) if (this.net.adminRole === 'owner' || m.min === 0 || (m.min > 0 && m.min <= MOD_MUTE_MAX_MIN)) mute.append(this.btn(m.label.replace('禁言 ', ''), () => { if (m.min !== 0 && !confirm(`${m.label}：${name}？`)) return; this.net.adm({ op: 'mute', uid, min: m.min }); }));
    b.append(mute);
    const ban = this.row('封号：', this.btn('踢下线', () => { if (confirm(`把 ${name} 请出校园？`)) this.net.adm({ op: 'kick', uid }); }));
    if (this.net.can('ban')) {
      ban.append(this.btn('封 1 天', () => { const r = prompt(`封禁 ${name} 1 天，原因（可不填）：`, ''); if (r !== null) this.net.adm({ op: 'ban', uid, hours: 24, reason: r }); }, false, true), this.btn('永久封禁', () => { const r = prompt(`永久封禁 ${name}，原因（可不填）：`, ''); if (r !== null) this.net.adm({ op: 'ban', uid, hours: -1, reason: r }); }, false, true));
      if (i?.ban) ban.append(this.btn('解封', () => this.net.adm({ op: 'unban', uid }), true));
    }
    b.append(ban);
    if (i && this.net.can('profile_set')) { // 改资料：昵称不合适时整改用（不经过敏感词过滤），本人会收到通知
      const f = (v: string, ph: string, w: number) => { const x = el('input'); x.type = 'text'; x.value = v; x.placeholder = ph; x.maxLength = 12; x.style.width = `${w}px`; return x; };
      const n = f(i.name, '昵称', 90), c = f(i.college, '学院', 90), m = f(i.major, '专业', 90), mo = f(i.motto, '签名', 120);
      b.append(this.row('改资料：', n, c, m, mo, this.btn('保存', () => { if (confirm(`修改 ${name} 的资料？TA 会收到通知。`)) this.net.adm({ op: 'profile_set', uid, name: n.value, college: c.value, major: m.value, motto: mo.value }); })));
    }
    if (i?.online && i.world && i.world.kind !== 'public') { // TA 在个人世界 / 好友世界里：管理员能直接进去看（进入、离开都记进操作记录）
      const wid = i.world.id;
      b.append(this.row('TA 在' + (i.world.kind === 'solo' ? '个人世界' : '好友世界') + '：', this.btn('👻 隐身进去看看', () => this.net.adm({ op: 'world_enter', world: wid, ghost: true }), true), this.btn('🛡 现身进去', () => this.net.adm({ op: 'world_enter', world: wid, ghost: false })), this.btn('回到原来的世界', () => this.net.adm({ op: 'world_leave' }))));
    }
    const view = this.row('查看：', this.btn('📋 完整档案', () => { this.close(); this.hooks.openDossier(uid); }, true), this.btn('资料卡 / 加好友', () => { this.close(); this.hooks.showCard(uid); }), this.btn('TA 的公屏记录', () => { this.close(); this.hooks.openLogs(uid); }));
    if (this.net.can('log_dm')) view.append(this.btn('TA 的私聊记录', () => { if (confirm('私聊属于玩家隐私。查看会被记进「操作记录」，确定要看吗？')) { this.close(); this.hooks.openDm(uid); } }));
    b.append(view);
  }
}
