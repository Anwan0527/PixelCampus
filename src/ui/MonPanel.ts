import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import { CONTENT, monArt, speciesOf } from '@/shared/mons-content';
import { MON, STAT_KEYS, STAT_NAMES, elementName, maxHp, monStats, moveSlots, xpForLevel, type Mon } from '@/shared/mons';
import { isCatSpecies } from '@/shared/cat-mons';
import { filterLearnable } from './monBattleHelpers';
import { ui } from './actions';
import type { Host, Section } from './hosted';

type MonData = Extract<ServerMsg, { t: 'mon_data' }>;
type Tab = 'sq' | 'bx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const COLOR = new Map(CONTENT.elements.elements.map((e) => [e.id, e.color]));

/** 属性徽章：汉字 + 颜色（不能只靠颜色区分） */
const typeBadge = (id: string) => { const b = el('span', 'mon-type', elementName(CONTENT.elements, id)); b.style.background = COLOR.get(id) ?? '#aaa'; return b; };
const img = (spId: string, side: 'front' | 'back', alt: boolean, cls: string) => { const i = el('img', cls); i.src = monArt(spId, side, alt); i.alt = ''; i.draggable = false; return i; };
const nameOf = (m: Mon) => m.nick || speciesOf(m.sp)?.name || '未知精灵';
const bar = (frac: number, cls = '') => { const b = el('div', `mon-bar ${cls}`), f = el('div', 'mon-bar-fill'); f.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; b.append(f); return b; };
const rating = (iv: number[]) => { const p = iv.reduce((a, b) => a + b, 0) / (iv.length * MON.MAX_IV); return p >= 0.9 ? '顶尖' : p >= 0.7 ? '优秀' : p >= 0.45 ? '不错' : '普通'; };

/**
 * 精灵（背包里的「精灵」页）：出战队伍（≤6，第 1 只是首发）、精灵背包（≤60）、精灵详情；还没有精灵时先三选一领初始精灵。
 * 界面只显示服务器给的数据；整理（移动/排序/昵称/放生）都只是向服务器发请求，成功后服务器推回整份最新数据。
 * 电脑按 R、手机点 ☰ → 背包 → 精灵都会打开背包并切到这一页（2026-11-10 起不再有单独的菜单入口）。
 */
export class MonPanel implements Section {
  readonly view = el('div', 'mon-sec');
  private body = el('div', 'mon-body');
  private msg = el('div', 'mon-msg');
  private data: MonData | null = null;
  private tab: Tab = 'sq';
  private picked: string | null = null;
  private confirmFree: string | null = null;
  private freeTimer = 0;
  private host: Host<'mons'> | null = null;
  /** 正在给哪只精灵的哪个槽选技能（drop = -1 表示空槽） */
  private replacePick: { id: string; drop: number } | null = null;
  private pending = false;
  private pendingTimer = 0;
  /** 数据更新时通知（猫面板据此刷新「收服/对战」按钮） */
  onData: (() => void) | null = null;

  constructor(private net: NetClient) {
    this.view.append(this.msg, this.body);
    net.handlers.mon = (d) => {
      this.pending = false; window.clearTimeout(this.pendingTimer); this.replacePick = null;
      this.data = d; ui.badge('bag', d.starter ? 0 : 1); // 还没领初始精灵：背包入口亮红点
      if (this.picked && !this.find(this.picked)) this.picked = null;
      this.render(); this.onData?.();
    };
    net.handlers.monResult = (ok, text) => {
      this.pending = false; window.clearTimeout(this.pendingTimer);
      this.replacePick = null;
      this.say(text, ok); this.render();
    };
    this.render();
  }

  /** 接到背包上（场景创建完背包后调用） */
  attach(host: Host<'mons'>) { this.host = host; }
  /** 还没领初始精灵（背包的「精灵」页签上亮红点用） */
  get needsStarter() { return !!this.data && !this.data.starter; }
  /** 只读：给图鉴页取 dex（不改数据） */
  get monData(): MonData | null { return this.data; }
  get isOpen() { return !!this.host?.isOpenOn('mons'); }
  /** 已经收服过的校园猫编号 / 队伍里有没有还能战斗的猫系精灵（「老吴对战」的条件） */
  get tamed(): readonly number[] { return this.data?.tamed ?? []; }
  get hasCatSpirit(): boolean { return !!this.data?.sq.some((m) => isCatSpecies(m.sp) && m.hp > 0); }
  open() { this.host?.open('mons'); }
  close() { if (this.isOpen) { this.confirmFree = null; this.replacePick = null; this.pending = false; window.clearTimeout(this.pendingTimer); this.host?.close(); } }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** 背包切到精灵页时：取一次最新数据 */
  enter() { this.net.monGet(); this.render(); }
  /** 连上服务器后请求一次（用来在菜单上亮"还没领初始精灵"的红点） */
  refresh() { this.net.monGet(); }

  private find(id: string): Mon | undefined { return this.data?.sq.find((m) => m.id === id) ?? this.data?.bx.find((m) => m.id === id); }
  /** 这只精灵服务端下发的可学技能（已过滤未知 / 已带 / 重复） */
  private learnableFor(m: Mon): string[] { return filterLearnable(this.data?.learnable?.[m.id], CONTENT, m.mv); }
  /** 发替换请求；等服务器推回 mon_data，不做本地修改 */
  private requestReplace(id: string, move: string, drop: number) {
    if (this.pending) return;
    this.pending = true;
    this.net.monReplace(id, move, drop);
    this.render();
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => {
      if (!this.pending) return;
      this.pending = false;
      this.say('服务器没有响应，请稍后再试', false);
      this.render();
    }, 8000);
  }
  private say(text: string, ok: boolean) { this.msg.textContent = text; this.msg.className = `mon-msg ${ok ? 'ok' : 'bad'}`; }
  private btn(label: string, run: () => void, cls = 'btn') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); return b; }

  private render() {
    try { this.renderBody(); } catch (e) {
      console.error('精灵面板渲染失败', e);
      this.body.replaceChildren(el('div', 'create-sub', '精灵面板出错了。多半是页面版本太旧，请按 Ctrl+F5（手机：下拉刷新或重新打开页面）再试。'));
    }
  }
  private renderBody() {
    this.body.replaceChildren();
    const d = this.data;
    if (!d) { this.body.append(el('div', 'create-sub', '读取中……')); return; }
    if (!d.starter) { this.renderStarters(d); return; }
    const tabs = el('div', 'cx-tabs');
    for (const [id, label, n, cap] of [['sq', '出战队伍', d.sq.length, MON.SQUAD_MAX], ['bx', '精灵背包', d.bx.length, MON.BOX_MAX]] as const) {
      const t = el('button', `cx-tab${this.tab === id ? ' on' : ''}`, `${label} ${n}/${cap}`); t.type = 'button';
      t.addEventListener('click', () => { this.tab = id; this.render(); });
      tabs.append(t);
    }
    const list = el('div', 'mon-list');
    if (this.tab === 'sq') this.renderSquad(list, d); else this.renderBox(list, d);
    this.body.append(tabs, list, this.renderDetail(d));
  }

  private renderStarters(d: MonData) {
    this.body.append(el('div', 'create-sub', d.sq.length + d.bx.length > 0 ? '你已经有一只耄耋猫啦！再选一只搭档吧（只能选一次）：' : '欢迎来到校园精灵的世界！先选一只伙伴吧（只能选一次）：'));
    const row = el('div', 'mon-starters');
    for (const id of d.starters) {
      const sp = speciesOf(id); if (!sp) continue;
      const c = el('div', 'mon-starter');
      const types = el('div', 'mon-types'); types.append(...sp.types.map(typeBadge));
      c.append(img(id, 'front', false, 'mon-img big'), el('div', 'mon-name', sp.name), types, el('div', 'mon-desc', sp.desc ?? ''), this.btn('选择 TA', () => this.net.monStarter(id)));
      row.append(c);
    }
    this.body.append(row);
  }

  private hpFrac(m: Mon) { return m.hp / Math.max(1, maxHp(CONTENT, m)); }

  private renderSquad(box: HTMLElement, d: MonData) {
    d.sq.forEach((m, i) => {
      const row = el('div', `mon-row${m.id === this.picked ? ' on' : ''}`);
      const info = el('div', 'mon-info');
      const types = el('div', 'mon-types'); types.append(...(speciesOf(m.sp)?.types ?? []).map(typeBadge));
      info.append(el('div', 'mon-name', `${i === 0 ? '★ ' : ''}${nameOf(m)}  Lv.${m.lv}`), bar(this.hpFrac(m), 'hp'), types);
      const act = el('div', 'mon-act');
      const up = this.btn('▲', () => this.swap(i, i - 1), 'btn sm'); up.disabled = i === 0; up.setAttribute('aria-label', '上移');
      const down = this.btn('▼', () => this.swap(i, i + 1), 'btn sm'); down.disabled = i === d.sq.length - 1; down.setAttribute('aria-label', '下移');
      const out = this.btn('放入背包', () => this.net.monMove(m.id, 'bx'), 'btn sm'); out.disabled = d.sq.length <= 1;
      act.append(up, down, out);
      row.append(img(m.sp, 'front', !!m.sh, 'mon-img'), info, act);
      row.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) return; this.picked = m.id; this.render(); });
      box.append(row);
    });
    if (!d.sq.length) box.append(el('div', 'create-sub', '队伍里还没有精灵。'));
  }
  private swap(i: number, j: number) {
    const ids = this.data!.sq.map((m) => m.id); if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; this.net.monOrder(ids);
  }

  private renderBox(box: HTMLElement, d: MonData) {
    if (!d.bx.length) { box.append(el('div', 'create-sub', '精灵背包是空的。队伍放不下的精灵会自动来这里。')); return; }
    const grid = el('div', 'mon-grid');
    for (const m of d.bx) {
      const c = el('button', `mon-cell${m.id === this.picked ? ' on' : ''}`); c.type = 'button'; c.title = nameOf(m);
      c.append(img(m.sp, 'front', !!m.sh, 'mon-img'), el('div', 'mon-lv', `Lv.${m.lv}`));
      c.addEventListener('click', () => { this.picked = m.id; this.render(); });
      grid.append(c);
    }
    box.append(grid);
  }

  private renderDetail(d: MonData): HTMLElement {
    const box = el('div', 'mon-detail');
    const m = this.picked ? this.find(this.picked) : undefined;
    const sp = m ? speciesOf(m.sp) : undefined;
    if (!m || !sp) { box.append(el('div', 'create-sub', '点一只精灵看详情。')); return box; }
    const inSquad = d.sq.some((x) => x.id === m.id);
    const head = el('div', 'mon-dhead');
    const title = el('div', 'mon-dtitle');
    const types = el('div', 'mon-types'); types.append(...sp.types.map(typeBadge));
    title.append(el('div', 'mon-name', `${nameOf(m)}  Lv.${m.lv}${m.sh ? '  ★异色' : ''}`), el('div', 'mon-sub', m.nick ? `原名：${sp.name}　图鉴 No.${String(sp.no).padStart(3, '0')}` : `图鉴 No.${String(sp.no).padStart(3, '0')}`), types);
    head.append(img(m.sp, 'front', !!m.sh, 'mon-img huge'), title);
    const evo = sp.evo ? `Lv.${sp.evo.lv} 进化为 ${speciesOf(sp.evo.to)?.name ?? sp.evo.to}` : sp.chain && sp.chain.length > 1 ? '已是最终形态' : '';
    box.append(head, el('div', 'mon-desc', sp.desc ?? ''));
    if (evo || m.cat !== undefined) box.append(el('div', 'mon-sub', [m.cat !== undefined ? '来自校园里的猫咪（它还在校园里等你）' : '', evo].filter(Boolean).join('　·　')));
    const st = monStats(CONTENT, m);
    const cap = m.lv >= MON.LEVEL_CAP, lo = xpForLevel(m.lv), hi = xpForLevel(m.lv + 1);
    const stats = el('div', 'mon-stats');
    stats.append(el('div', 'mon-srow', `生命  ${m.hp}/${st.hp}`), bar(this.hpFrac(m), 'hp'));
    for (const k of STAT_KEYS.filter((x) => x !== 'hp')) { stats.append(el('div', 'mon-srow', `${STAT_NAMES[k]}  ${st[k]}`), bar(st[k] / 200)); }
    stats.append(el('div', 'mon-srow', cap ? '经验  已满级' : `经验  ${m.xp - lo}/${hi - lo}`), bar(cap ? 1 : (m.xp - lo) / Math.max(1, hi - lo), 'xp'));
    box.append(stats);
    const learn = this.learnableFor(m);
    const moves = el('div', 'mon-moves');
    for (const [i, x] of m.mv.entries()) {
      const mv = CONTENT.moves.get(x.id); if (!mv) continue;
      const r = el('div', 'mon-move'); r.append(typeBadge(mv.type), el('span', 'mon-mname', mv.name), el('span', 'mon-mmeta', `${mv.cat === 'physical' ? '物理' : '特殊'} 威力${mv.power} 命中${mv.acc}  PP ${x.pp}/${mv.pp}`));
      if (learn.length) {
        const b = this.btn('更换', () => { this.replacePick = { id: m.id, drop: i }; this.render(); }, 'btn sm');
        b.disabled = this.pending; r.append(b);
      }
      moves.append(r);
    }
    box.append(el('div', 'mon-h', '技能'), moves);
    if (learn.length && m.mv.length < moveSlots(sp)) {
      const b = this.btn('学习新技能', () => { this.replacePick = { id: m.id, drop: -1 }; this.render(); }, 'btn');
      b.disabled = this.pending; box.append(b);
    }
    const pick = this.replacePick?.id === m.id ? this.replacePick : null;
    if (pick) {
      const wrap = el('div', 'mon-pend');
      const oldName = pick.drop >= 0 ? CONTENT.moves.get(m.mv[pick.drop]?.id ?? '')?.name ?? '技能' : '';
      wrap.append(el('div', 'mon-h', pick.drop === -1 ? '学习新技能' : `更换「${oldName}」`));
      const grid = el('div', 'mon-learn');
      for (const id of learn) {
        const mv = CONTENT.moves.get(id); if (!mv) continue;
        const b = this.btn('', () => this.requestReplace(m.id, id, pick.drop), 'btn mon-learn-btn');
        b.append(typeBadge(mv.type), el('span', 'mon-mname', mv.name), el('span', 'mon-mmeta', `${mv.cat === 'physical' ? '物理' : '特殊'} 威力${mv.power} 命中${mv.acc}`));
        b.disabled = this.pending; grid.append(b);
      }
      const cancel = this.btn('取消', () => { this.replacePick = null; this.render(); }, 'btn sm');
      cancel.disabled = this.pending;
      wrap.append(grid, cancel);
      box.append(wrap);
    }
    const when = m.at > 0 ? new Date(m.at).toLocaleDateString() : '';
    box.append(el('div', 'mon-sub', `个体评价：${rating(m.iv)}${when ? `　遇见于 ${when}` : ''}`));
    // 昵称
    const nick = el('div', 'mon-nick');
    const inp = el('input'); inp.type = 'text'; inp.maxLength = MON.NICK_MAX; inp.placeholder = '给它取个昵称（空 = 原名）'; inp.value = m.nick ?? ''; inp.setAttribute('aria-label', '昵称');
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.net.monNick(m.id, inp.value); });
    nick.append(inp, this.btn('保存', () => this.net.monNick(m.id, inp.value), 'btn sm'));
    // 操作
    const act = el('div', 'mon-dact');
    if (inSquad) { const i = d.sq.findIndex((x) => x.id === m.id); if (i > 0) act.append(this.btn('设为首发', () => { const ids = d.sq.map((x) => x.id); ids.splice(i, 1); ids.unshift(m.id); this.net.monOrder(ids); })); }
    else act.append(this.btn('加入队伍', () => this.net.monMove(m.id, 'sq')));
    const free = this.btn(this.confirmFree === m.id ? '再点一次确认放生' : '放生', () => {
      if (this.confirmFree !== m.id) { this.confirmFree = m.id; window.clearTimeout(this.freeTimer); this.freeTimer = window.setTimeout(() => { this.confirmFree = null; this.render(); }, 3000); this.render(); return; }
      this.confirmFree = null; this.net.monFree(m.id);
    }, 'btn danger');
    act.append(free);
    box.append(nick, act);
    return box;
  }
}
