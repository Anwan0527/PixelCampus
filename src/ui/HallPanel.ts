import { fmtPlay, type HallData, type HallRow } from '@/shared/hall';
import { titleDef } from '@/shared/titles';
import type { NetClient } from '@/net/client';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

type Tab = 'play' | 'cat' | 'fish' | 'dorm';
const TABS: { id: Tab; name: string; sub: string }[] = [
  { id: 'play', name: '游玩时间', sub: '累计在线时间最长的同学（实时更新）。' },
  { id: 'cat', name: '猫缘', sub: '和校园小猫的好感度总和；也可以改成按结缘的小猫只数排。' },
  { id: 'fish', name: '钓鱼', sub: '钓上来的鱼的总价值（按鱼的标准收购价算，杂物不计）。' },
  { id: 'dorm', name: '宿舍人气', sub: '收到赞最多的宿舍（点同学可以看他的宿舍；不想上榜可以在宿舍面板里关掉「展示我的宿舍」）。' },
];
const MEDAL = ['🥇', '🥈', '🥉'];

/**
 * 名人堂：三张榜（游玩时间 / 小猫好感 / 钓鱼价值），服务器实时算，面板打开时每 5 秒刷新一次。
 * 点某位同学可以看他的学生证。电脑按 L，或左上角「菜单」→ 名人堂。
 */
export class HallPanel {
  private root = el('div', 'screen hidden');
  private list = el('div', 'hall-list');
  private sub = el('div', 'create-sub');
  private mine = el('div', 'hall-me');
  private tabBtns: HTMLButtonElement[] = [];
  private catMode: 'aff' | 'n' = 'aff';
  private modeRow = el('div', 'seg-row');
  private tab: Tab = 'play';
  private data: HallData | null = null;
  private timer = 0;

  constructor(private net: NetClient, private hooks: { showPlayer(uid: number): void; selfUid(): number }) {
    const panel = el('div', 'box hall');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭名人堂');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '🏆 名人堂'), close);
    const tabRow = el('div', 'seg-row');
    for (const t of TABS) {
      const b = el('button', 'seg' + (t.id === this.tab ? ' on' : ''), t.name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = t.id; this.tabBtns.forEach((x, i) => x.classList.toggle('on', TABS[i].id === t.id)); this.render(); });
      this.tabBtns.push(b); tabRow.append(b);
    }
    for (const [k, name] of [['aff', '按好感总和'], ['n', '按结缘只数']] as const) {
      const b = el('button', 'seg' + (k === this.catMode ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.catMode = k; [...this.modeRow.children].forEach((x, i) => x.classList.toggle('on', i === (k === 'aff' ? 0 : 1))); this.render(); });
      this.modeRow.append(b);
    }
    panel.append(head, tabRow, this.sub, this.modeRow, this.list, this.mine);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'hall', label: '名人堂', key: 'L', run: () => this.toggle() });
    net.handlers.hall = (m) => { this.data = m; if (this.isOpen) this.render(); };
    net.onStatus(() => { if (this.isOpen) this.render(); });
    this.render();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() {
    this.root.classList.remove('hidden'); this.net.hallGet(); this.render();
    window.clearInterval(this.timer); this.timer = window.setInterval(() => { if (this.isOpen) this.net.hallGet(); }, 5000); // "实时更新"：打开期间每 5 秒向服务器要一次
  }
  close() { this.root.classList.add('hidden'); window.clearInterval(this.timer); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private rows(): HallRow[] { const d = this.data; return !d ? [] : this.tab === 'play' ? d.play : this.tab === 'fish' ? d.fish : this.tab === 'dorm' ? d.dorm : this.catMode === 'aff' ? d.cat : d.catN; }
  private text(r: { value: number; extra: number }): string {
    if (this.tab === 'play') return fmtPlay(r.value);
    if (this.tab === 'fish') return `${r.value} 校园币 · ${r.extra} 条`;
    if (this.tab === 'dorm') return `❤️ ${r.value} · 摆了 ${r.extra} 件`;
    return this.catMode === 'aff' ? `好感 ${r.value} · 结缘 ${r.extra} 只` : `结缘 ${r.value} 只 · 好感 ${r.extra}`;
  }
  private render() {
    this.sub.textContent = TABS.find((t) => t.id === this.tab)!.sub;
    this.modeRow.classList.toggle('hidden', this.tab !== 'cat');
    this.list.replaceChildren(); this.mine.textContent = '';
    if (this.net.status !== 'online') { this.list.append(el('div', 'board-empty', '没连上服务器，连上后才能看名人堂。')); return; }
    const d = this.data;
    if (!d) { this.list.append(el('div', 'board-empty', '读取中…')); return; }
    const rows = this.rows(), me = this.tab === 'cat' ? (this.catMode === 'aff' ? d.me.cat : d.me.catN) : d.me[this.tab];
    if (!rows.length) this.list.append(el('div', 'board-empty', this.tab === 'play' ? '还没有人上榜。' : this.tab === 'dorm' ? '还没有宿舍收到赞。选好宿舍楼栋，把家里布置漂亮，等同学来点赞吧！' : this.tab === 'cat' ? '还没有人和小猫成为朋友。去摸摸、喂喂校园里的小猫吧！' : '还没有人钓到鱼。去精工湖边试试！'));
    rows.forEach((r, i) => {
      const row = el('button', 'hall-row' + (r.uid === this.hooks.selfUid() ? ' me' : '')); row.type = 'button';
      row.append(el('div', 'hall-rank', i < 3 ? MEDAL[i] : String(i + 1)));
      const mid = el('div', 'hall-mid'), name = el('div', 'hall-name');
      name.append(el('span', r.online ? 'hall-dot on' : 'hall-dot'), document.createTextNode(r.name));
      const t = titleDef(r.title);
      if (t) { const tg = el('span', 'hall-title', t.name); tg.style.color = t.color; name.append(tg); }
      mid.append(name); if (r.note) mid.append(el('div', 'hall-note', `🏠 ${r.note}`));
      row.append(mid, el('div', 'hall-val', this.text(r)));
      row.addEventListener('click', () => this.hooks.showPlayer(r.uid));
      this.list.append(row);
    });
    const total = this.tab === 'cat' ? d.total.cat : d.total[this.tab];
    this.mine.textContent = me.rank ? `我的名次：第 ${me.rank} 名（共 ${total} 人上榜）· ${this.text(me)}` : `我还没有上榜（共 ${total} 人上榜）。`;
  }
}
