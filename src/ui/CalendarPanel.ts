import { clockMinutes } from '@/shared/clock';
import { SEASON_NAME, SEASONS, forecast, nextWet, skyAt, type ForecastItem } from '@/shared/season';
import { FESTIVAL_DAYS, calendarOf, dateLabel, festivalOfDay, festivalOn, gameDayAt, nextFestival, yearGrid, type Festival } from '@/shared/calendar';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SEASON_ICON = ['🌱', '☀️', '🍂', '❄️'];
const hh = (minOfDay: number) => `${String(Math.floor(minOfDay / 60) % 24).padStart(2, '0')}:${String(Math.floor(minOfDay % 60)).padStart(2, '0')}`;
/** 距现在多久（真实时间）：不到 1 分钟 / N 分钟 / N 小时 M 分 */
function realIn(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return '不到 1 分钟';
  if (m < 60) return `约 ${m} 分钟`;
  return `约 ${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export interface CalendarHooks {
  /** 校准后的服务器时间（毫秒） */
  now(): number;
}

/**
 * 日历与天气预报：点右上角的时钟、或菜单里的「日历」打开。
 * 两页：①天气（现在的天气 + 温度、下一场雨/雪、下一个夜晚、往后约 1 小时的预报）；②日历（按游戏时间的一年 24 天，标出节日，点某天看节日介绍和福利）。
 * 全部是客户端用共享的时间/天气/节日规则算出来的（和服务器一样），没有网络请求。
 */
export class CalendarPanel {
  private root = el('div', 'screen hidden');
  private body = el('div', 'cal-body');
  private tab: 'wx' | 'cal' = 'wx';
  private tabs: HTMLButtonElement[] = [];
  private year = 0;
  private picked: { season: number; day: number } | null = null;
  private timer = 0;

  constructor(private hooks: CalendarHooks) {
    const panel = el('div', 'box cal');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭日历');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '日历 · 天气'), close);
    const tabRow = el('div', 'seg-row');
    ([['wx', '天气预报'], ['cal', '日历 · 节日']] as const).forEach(([k, name], i) => {
      const b = el('button', 'seg' + (k === this.tab ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.tabs.forEach((t, j) => t.classList.toggle('on', i === j)); this.render(); });
      this.tabs.push(b); tabRow.append(b);
    });
    panel.append(head, tabRow, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'calendar', label: '日历', run: () => this.toggle() });
    const clock = document.getElementById('clock');
    if (clock) { clock.classList.add('clickable'); clock.title = '点开看日历和天气预报'; clock.addEventListener('click', () => this.toggle()); }
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(tab?: 'wx' | 'cal') {
    if (tab) { this.tab = tab; this.tabs.forEach((t, j) => t.classList.toggle('on', (j === 0) === (tab === 'wx'))); }
    this.root.classList.remove('hidden'); this.year = 0; this.picked = null; this.render();
    window.clearInterval(this.timer); this.timer = window.setInterval(() => { if (this.isOpen && this.tab === 'wx') this.render(); }, 4000);
  }
  close() { this.root.classList.add('hidden'); window.clearInterval(this.timer); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private render() {
    this.body.replaceChildren();
    if (this.tab === 'wx') this.renderWx(); else this.renderCal();
  }

  // ------------------------------------------------------------ 天气
  private renderWx() {
    const ms = this.hooks.now(), sky = skyAt(ms), b = this.body;
    const mins = clockMinutes(ms), day = Math.floor(mins / 1440) + 1, cal = calendarOf(day);
    const cur = el('div', 'cal-now');
    cur.append(el('div', 'cal-now-ico', sky.icon), (() => { const d = el('div', 'cal-now-txt'); d.append(el('div', 'cal-now-name', `${sky.name}　${sky.tempC}°C`), el('div', 'cal-sub', `${dateLabel(cal)} · ${hh(mins % 1440)} · ${SEASON_NAME[cal.season]}`)); return d; })());
    b.append(cur);
    const tips = el('div', 'cal-tips');
    const wet = nextWet(ms);
    if (sky.w.kind === 'rain' || sky.w.kind === 'snow') tips.append(el('div', 'cal-tip', `${sky.w.kind === 'rain' ? '🌧️ 正在下雨' : '❄️ 正在下雪'}（钓鱼：雨天有些鱼更爱咬钩）`));
    else if (wet) tips.append(el('div', 'cal-tip', `${wet.w.icon} 下一场${wet.w.kind === 'rain' ? '雨' : '雪'}：${realIn(wet.startMs - ms)}后`));
    else tips.append(el('div', 'cal-tip', '☀️ 接下来很长一段时间都没有降水'));
    const night = this.nextNight(ms);
    tips.append(el('div', 'cal-tip', night === 0 ? '🌙 现在是夜里（夜里有些鱼更活跃）' : `🌙 下一个夜晚：${realIn(night)}后`));
    const fest = nextFestival(day);
    tips.append(el('div', 'cal-tip', fest.active ? `${fest.f.icon} 正在过${fest.f.name}！` : `${fest.f.icon} ${fest.f.name}：还有 ${fest.inDays} 个游戏日（${realIn(fest.inDays * 20 * 60000 - ((mins % 1440) / 1440) * 20 * 60000)}后）`));
    b.append(tips);
    b.append(el('div', 'cal-h', '往后的天气'));
    const list = el('div', 'cal-fc');
    for (const [i, f] of forecast(ms, 9).entries()) list.append(this.fcRow(f, i, ms));
    b.append(list, el('div', 'cal-foot', '一个天气时段 = 8 分钟真实时间（约 1/3 个游戏日）。近处的预报很准；远处只告诉你有没有降水。'));
  }
  private fcRow(f: ForecastItem, i: number, now: number) {
    const row = el('div', 'cal-fc-row' + (i === 0 ? ' now' : '')), startMin = clockMinutes(Math.max(now, f.startMs));
    const when = i === 0 ? '现在' : `${realIn(f.startMs - now)}后`, g = `第 ${Math.floor(startMin / 1440) + 1} 天 ${hh(startMin % 1440)} 起`;
    const wet = f.w.kind === 'rain' || f.w.kind === 'snow';
    row.append(el('div', 'cal-fc-when', when), el('div', 'cal-fc-ico', f.vague ? (wet ? (f.w.kind === 'snow' ? '❄️' : '🌧️') : '·') : f.sky.icon),
      el('div', 'cal-fc-name', f.vague ? (wet ? `可能有${f.w.kind === 'snow' ? '雪' : '雨'}` : '大概没有降水') : `${f.sky.name}${f.sky.w.power ? '' : ''}`),
      el('div', 'cal-fc-t', f.vague ? '' : `${f.sky.tempC}°C`), el('div', 'cal-fc-g', g));
    return row;
  }
  /** 距离下一个夜晚（夜强度过半）还要多少真实毫秒；现在已经是夜里 = 0 */
  private nextNight(ms: number): number {
    const day0 = Math.floor(clockMinutes(ms) / 1440);
    const h = (clockMinutes(ms) % 1440) / 60;
    if (h >= 18.75 || h < 6.5) return 0;
    // 今天 18:45 的游戏分钟 → 真实毫秒：白天走得慢，用二分在时间上找（clockMinutes 单调）
    let lo = ms, hi = ms + 25 * 60 * 1000;
    const target = day0 * 1440 + 18.75 * 60;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (clockMinutes(mid) < target) lo = mid; else hi = mid; }
    return hi - ms;
  }

  // ------------------------------------------------------------ 日历
  private renderCal() {
    const ms = this.hooks.now(), day = gameDayAt(ms), today = calendarOf(day), b = this.body;
    if (!this.year) this.year = today.year;
    const nav = el('div', 'cal-nav');
    const prev = el('button', 'btn', '◀'); prev.type = 'button'; prev.disabled = this.year <= 1; prev.addEventListener('click', () => { this.year--; this.picked = null; this.render(); });
    const next = el('button', 'btn', '▶'); next.type = 'button'; next.disabled = this.year >= today.year + 3; next.addEventListener('click', () => { this.year++; this.picked = null; this.render(); });
    nav.append(prev, el('div', 'cal-year', `第 ${this.year} 年${this.year === today.year ? '（今年）' : ''}`), next);
    b.append(nav, el('div', 'cal-sub', `今天：${dateLabel(today)}。1 游戏日 = 20 真实分钟，一个季节 6 天，一年 24 天（约 8 小时）。`));
    const grid = yearGrid(this.year);
    for (let s = 0; s < SEASONS.length; s++) {
      const row = el('div', 'cal-season');
      row.append(el('div', 'cal-season-name', `${SEASON_ICON[s]} ${SEASON_NAME[SEASONS[s]]}`));
      const cells = el('div', 'cal-cells');
      for (const c of grid.filter((x) => x.seasonIdx === s)) {
        const isToday = c.day === day, past = c.day < day;
        const cell = el('button', 'cal-cell' + (isToday ? ' today' : '') + (past ? ' past' : '') + (c.fest ? ' fest' : '') + (this.picked && this.picked.season === s && this.picked.day === c.dayInSeason ? ' on' : '')); cell.type = 'button';
        cell.append(el('span', 'cal-d', String(c.dayInSeason)), el('span', 'cal-f', c.fest ? c.fest.f.icon : ''));
        cell.title = `${SEASON_NAME[c.season]} ${c.dayInSeason} 日${c.fest ? ` · ${c.fest.f.name}` : ''}`;
        cell.addEventListener('click', () => { this.picked = { season: s, day: c.dayInSeason }; this.render(); });
        cells.append(cell);
      }
      row.append(cells); b.append(row);
    }
    // 详情：点中的那天的节日；没点就显示今天的节日 / 下一个节日
    let f: Festival | undefined, note = '';
    if (this.picked) { const x = festivalOn(SEASONS[this.picked.season], this.picked.day); f = x?.f; if (!f) note = `${SEASON_NAME[SEASONS[this.picked.season]]} ${this.picked.day} 日：普通的一天。`; }
    else { const n = nextFestival(day); f = n.f; note = n.active ? `今天正在过${n.f.name}！` : `下一个节日：${n.f.name}（还有 ${n.inDays} 个游戏日）`; }
    b.append(this.festCard(f, note));
  }
  private festCard(f: Festival | undefined, note: string) {
    const box = el('div', 'cal-fest');
    if (!f) { box.append(el('div', 'cal-sub', note)); return box; }
    box.append(el('div', 'cal-fest-name', `${f.icon} ${f.name}（${SEASON_NAME[f.season]} ${f.from}–${f.from + FESTIVAL_DAYS - 1} 日）`));
    if (note) box.append(el('div', 'cal-sub', note));
    box.append(el('div', 'cal-fest-blurb', f.blurb));
    for (const s of f.scene) box.append(el('div', 'cal-fest-li', `· ${s}`));
    box.append(el('div', 'cal-fest-buff', `节日福利：${f.buff.text}`));
    return box;
  }
}
