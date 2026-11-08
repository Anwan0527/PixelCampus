import { DILIGENT_DAYS, questDef, type QuestState } from '@/shared/quests';
import { itemDef } from '@/shared/items';
import type { NetClient } from '@/net/client';
import { ui } from './actions';
import { fishData } from './fishData';
import { commClaimable, renderCommissions } from './commissionsView';

/** 今天（北京时间）的日期编号；红点按天记：当天点开过一次就不再出现，第二天新任务出来再亮一次 */
const todayNo = () => Math.floor((Date.now() + 8 * 3600e3) / 86400e3);
const SEEN_KEY = 'pixelcampus.questSeen';
const seenToday = () => { try { return localStorage.getItem(SEEN_KEY) === String(todayNo()); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, String(todayNo())); } catch { /* 存储不可用：只是红点会多亮一会儿 */ } };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface QuestHooks {
  /** 刚刚完成了这些任务（弹提示用） */
  onDone(ids: string[]): void;
}
export type QuestTab = 'daily' | 'fishing';

/**
 * 任务面板两页：「每日任务」（今天的 5 个任务，奖励完成后自动入包）和「钓鱼委托」（钓具老板的每日 + 每周委托，做完在这里领奖）。
 * 进度全部在服务器上（跟着身份走），这里只显示。电脑按 Q 或点右侧「任务」，手机点 ☰ → 任务；钓具摊的「📋 钓鱼委托」按钮直接打开钓鱼页。
 */
export class QuestPanel {
  private root = el('div', 'screen hidden');
  private list = el('div', 'ach-list');
  private count = el('div', 'create-sub');
  private note = el('div', 'bag-note');
  private comm = el('div', 'ach-list comm-list');
  private msg = el('div', 'shop-msg');
  private tabs = el('div', 'cx-tabs');
  private dailyPage = el('div', 'quest-page');
  private fishPage = el('div', 'quest-page hidden');
  private tab: QuestTab = 'daily';
  private quests: QuestState[] = [];
  private full = 0;
  private loaded = false;

  constructor(private net: NetClient, private hooks: QuestHooks) {
    const panel = el('div', 'box ach quest-panel');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭任务');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '任务'), close);
    this.dailyPage.append(this.count, this.list, this.note);
    this.fishPage.append(this.msg, this.comm);
    panel.append(head, this.tabs, this.dailyPage, this.fishPage);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'quest', label: '任务', key: 'Q', run: () => this.toggle() });
    this.net.handlers.quests = (list, full, fresh) => {
      this.loaded = true; this.quests = list; this.full = full;
      if (fresh?.length) this.hooks.onDone(fresh);
      if (!fishData.wq) this.net.getWq(); // 登录后顺手要一次委托：红点和钓具老板头顶的「！」要靠它
      this.syncBadge();
      this.render();
    };
    this.net.handlers.wqResult = (ok, text) => { this.msg.textContent = text; this.msg.classList.toggle('bad', !ok); };
    fishData.listeners.add(() => { this.syncBadge(); if (this.isOpen) this.render(); });
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 打开任务面板；tab = 直接翻到某一页（钓具摊的「钓鱼委托」按钮传 'fishing'） */
  open(tab?: QuestTab) {
    if (tab) this.tab = tab;
    this.root.classList.remove('hidden'); this.msg.textContent = ''; this.net.getQuests(); this.net.getWq(); markSeen(); this.syncBadge(); this.render();
  }
  close() { this.root.classList.add('hidden'); this.syncBadge(); }
  /** 红点：今天还没点开过、且确实有没做的任务才亮；点开一次就灭，做不完也不再提醒；委托有奖励没领时一直亮 */
  private syncBadge() { ui.badge('quest', !this.isOpen && ((!seenToday() && this.quests.some((q) => !q.done)) || commClaimable(fishData.wq)) ? 1 : 0); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private renderTabs() {
    const claim = commClaimable(fishData.wq);
    const defs: [QuestTab, string][] = [['daily', '每日任务'], ['fishing', claim ? '🎣 钓鱼委托 ●' : '🎣 钓鱼委托']];
    this.tabs.replaceChildren(...defs.map(([k, name]) => {
      const b = el('button', 'cx-tab' + (k === this.tab ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.render(); });
      return b;
    }));
  }

  private render() {
    this.renderTabs();
    this.dailyPage.classList.toggle('hidden', this.tab !== 'daily'); this.fishPage.classList.toggle('hidden', this.tab !== 'fishing');
    if (this.tab === 'fishing') {
      const top = this.comm.scrollTop;
      this.comm.replaceChildren(renderCommissions(fishData.wq, { claim: (id) => this.net.wqClaim(id), online: this.net.status === 'online' }));
      this.comm.scrollTop = top;
      return;
    }
    const done = this.quests.filter((q) => q.done).length;
    this.count.textContent = this.quests.length ? `今天已完成 ${done} / ${this.quests.length}　·　累计做完全部任务 ${this.full} 天（满 ${DILIGENT_DAYS} 天得称号「勤勉学子」）` : '';
    this.list.replaceChildren();
    for (const s of this.quests) {
      const q = questDef(s.id); if (!q) continue;
      const row = el('div', 'ach-row quest-row' + (s.done ? ' done' : ''));
      row.append(el('div', 'ach-medal', s.done ? '✓' : '·'));
      const mid = el('div', 'ach-mid');
      mid.append(el('div', 'ach-name', q.name), el('div', 'ach-desc', q.desc));
      const bar = el('div', 'quest-bar'), fill = el('div', 'quest-fill'); fill.style.width = `${Math.round((s.prog / q.goal) * 100)}%`; bar.append(fill);
      const label = q.ev === 'online' ? `${Math.floor(s.prog / 60)} / ${q.goal / 60} 分钟` : `${s.prog} / ${q.goal}`;
      const meta = el('div', 'quest-meta'); meta.append(el('span', undefined, label), el('span', undefined, `奖励：${q.reward.map((r) => `${itemDef(r.id)?.name ?? r.id} ×${r.n}`).join('、')}`));
      mid.append(bar, meta);
      row.append(mid);
      this.list.append(row);
    }
    this.note.textContent = this.net.status !== 'online' ? '现在没有连上服务器，每日任务暂时无法更新。' : this.loaded ? '任务每天 0 点（北京时间）刷新；做完奖励自动放进背包。钓鱼的每日 / 每周委托在「钓鱼委托」页。' : '读取中…';
  }
}
