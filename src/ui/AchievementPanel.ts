import { ACHIEVEMENTS, ACH_TOTAL, achDef } from '@/shared/achievements';
import type { NetClient } from '@/net/client';
import { ui } from './actions';
import type { Host, Section } from './hosted';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export interface AchHooks {
  /** 刚刚解锁了这些成就（弹提示用） */
  onNew(ids: string[]): void;
  /** 已解锁数量变化（学生证上的"成就 n/m"用） */
  onCount(n: number): void;
}

/**
 * 成就（图鉴里的「成就」页）：已解锁的亮着（带说明和解锁时间），没解锁的显示线索，占位的显示"？？？"。
 * 解锁记录在服务器上（跟着身份走），这里只显示。电脑按 J、学生证 / 设置里点「成就」都会打开图鉴并切到这一页。
 */
export class AchievementPanel implements Section {
  readonly view = el('div', 'cx-sec');
  private list = el('div', 'ach-list');
  private count = el('div', 'create-sub');
  private note = el('div', 'bag-note');
  private unlocked: Record<string, number> = {};
  private unseen = new Set<string>();
  private loaded = false;
  private host: Host<'ach'> | null = null;

  constructor(private net: NetClient, private hooks: AchHooks) {
    this.view.append(this.count, this.list, this.note);
    this.net.handlers.ach = (unlocked, fresh) => {
      this.loaded = true; this.unlocked = unlocked;
      if (fresh?.length) { for (const id of fresh) this.unseen.add(id); this.hooks.onNew(fresh); }
      this.hooks.onCount(this.unlockedCount);
      this.syncBadge(); this.render();
    };
    this.render();
  }

  /** 接到图鉴上（场景创建完图鉴后调用） */
  attach(host: Host<'ach'>) { this.host = host; }
  get isOpen() { return !!this.host?.isOpenOn('ach'); }
  get unlockedCount() { return Object.keys(this.unlocked).filter((id) => !achDef(id)?.placeholder).length; }
  open() { this.host?.open('ach'); }
  close() { if (this.isOpen) this.host?.close(); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** 图鉴切到成就页时：取一次最新记录，红点清掉 */
  enter() { this.net.getAch(); this.render(); this.unseen.clear(); this.syncBadge(); }
  private syncBadge() { ui.badge('codex', this.isOpen ? 0 : this.unseen.size); }

  private render() {
    this.count.textContent = `已解锁 ${this.unlockedCount} / ${ACH_TOTAL}`;
    this.list.replaceChildren();
    for (const a of ACHIEVEMENTS) {
      const at = this.unlocked[a.id], done = !!at;
      const row = el('div', 'ach-row' + (done ? ' done' : '') + (a.placeholder ? ' ph' : ''));
      row.append(el('div', 'ach-medal', done ? '★' : a.placeholder ? '？' : '🔒'));
      const mid = el('div', 'ach-mid');
      mid.append(el('div', 'ach-name', done || a.placeholder ? a.name : '？？？'));
      mid.append(el('div', 'ach-desc', done ? a.desc : a.hint));
      row.append(mid);
      if (done) row.append(el('div', 'ach-time', fmt(at)));
      this.list.append(row);
    }
    this.note.textContent = this.net.status !== 'online' ? '现在没有连上服务器，成就暂时无法更新。' : this.loaded ? '' : '读取中…';
  }
}
