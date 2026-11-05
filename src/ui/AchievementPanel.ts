import { ACHIEVEMENTS, ACH_TOTAL, achDef } from '@/shared/achievements';
import type { NetClient } from '@/net/client';
import { ui } from './actions';

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
 * 成就面板：已解锁的亮着（带说明和解锁时间），没解锁的显示线索，占位的显示"？？？"。
 * 解锁记录在服务器上（跟着身份走），这里只显示。电脑按 J 或点右侧「成就」，手机点 ☰ → 成就，也可以在学生证里点「成就」。
 */
export class AchievementPanel {
  private root = el('div', 'screen hidden');
  private list = el('div', 'ach-list');
  private count = el('div', 'create-sub');
  private note = el('div', 'bag-note');
  private unlocked: Record<string, number> = {};
  private unseen = new Set<string>();
  private loaded = false;

  constructor(private net: NetClient, private hooks: AchHooks) {
    const panel = el('div', 'box ach');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭成就');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '成就'), close);
    panel.append(head, this.count, this.list, this.note);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'ach', label: '成就', key: 'J', run: () => this.toggle() });
    this.net.handlers.ach = (unlocked, fresh) => {
      this.loaded = true; this.unlocked = unlocked;
      if (fresh?.length) { for (const id of fresh) this.unseen.add(id); this.hooks.onNew(fresh); }
      this.hooks.onCount(this.unlockedCount);
      this.syncBadge(); this.render();
    };
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  get unlockedCount() { return Object.keys(this.unlocked).filter((id) => !achDef(id)?.placeholder).length; }
  open() { this.root.classList.remove('hidden'); this.net.getAch(); this.render(); this.unseen.clear(); this.syncBadge(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private syncBadge() { ui.badge('ach', this.isOpen ? 0 : this.unseen.size); }

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
