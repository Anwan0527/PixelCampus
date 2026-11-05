import type Phaser from 'phaser';
import type { NetClient } from '@/net/client';
import { REAL_FISH, RARITY_COLORS, RARITY_NAMES, RARITY_ORDER, fishDef, fmtKg, habitatText, type FishLog } from '@/shared/fishing';
import { itemDef } from '@/shared/items';
import { COAT_LABELS, COAT_RARITY, LEVEL_NAMES, catLevel, type CatDef } from '@/shared/cats';
import { drawFrame, drawItem } from './sprites';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type CodexTab = 'animals' | 'fish';
interface TabDef { id: CodexTab; label: string; render: (box: HTMLElement) => void }

/**
 * 图鉴：一个入口（电脑按 H / 菜单「图鉴」）下面分页——动物图鉴（校园小猫）、钓鱼图鉴。以后加新图鉴，在 tabs 里加一项即可。
 * 数据都是服务器给的（小猫好感度、钓鱼记录），这里只显示；没收集到的显示成灰色剪影和"？？？"。
 */
export class CodexPanel {
  private root = el('div', 'screen hidden');
  private tabsBar = el('div', 'cx-tabs');
  private body = el('div', 'cx-body');
  private tab: CodexTab = 'animals';
  private fishLog: Record<string, FishLog> = {};
  private pickedFish: string | null = null;
  private tabs: TabDef[] = [
    { id: 'animals', label: '动物图鉴', render: (b) => this.renderAnimals(b) },
    { id: 'fish', label: '钓鱼图鉴', render: (b) => this.renderFish(b) },
  ];

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private deps: { cats: () => { defs: readonly CatDef[]; aff: Record<string, number>; nicks: Record<string, string> } }) {
    const panel = el('div', 'box codex');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭图鉴');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '图鉴'), close);
    panel.append(head, this.tabsBar, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'codex', label: '图鉴', key: 'H', run: () => this.toggle() });
    this.net.handlers.fishdex = (log) => { this.fishLog = log; if (this.isOpen) this.render(); };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(tab?: CodexTab) { if (tab) this.tab = tab; this.root.classList.remove('hidden'); this.net.getFishdex(); this.net.getInv(); this.render(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  /** 数据变了（小猫好感度、钓鱼记录）就刷新 */
  refresh() { if (this.isOpen) this.render(); }

  private render() {
    this.tabsBar.replaceChildren(...this.tabs.map((t) => {
      const b = el('button', 'cx-tab' + (t.id === this.tab ? ' on' : ''), t.label); b.type = 'button';
      b.addEventListener('click', () => { this.tab = t.id; this.render(); });
      return b;
    }));
    this.body.replaceChildren();
    this.tabs.find((t) => t.id === this.tab)?.render(this.body);
  }

  // ------------------------------------------------------------ 动物图鉴
  private renderAnimals(box: HTMLElement) {
    const { defs, aff, nicks } = this.deps.cats();
    const known = (d: CatDef) => (aff[d.id] ?? 0) > 0, met = defs.filter(known).length;
    // 毛色收集：某个毛色只要认识了一只这种毛色的猫，就算收集到
    const total = new Map<number, number>(), got = new Map<number, number>();
    for (const d of defs) { total.set(d.coat, (total.get(d.coat) ?? 0) + 1); if (known(d)) got.set(d.coat, (got.get(d.coat) ?? 0) + 1); }
    const coats = [...total.keys()], coatsGot = coats.filter((c) => got.has(c)).length;
    box.append(el('div', 'cx-sum', `校园小猫　已认识 ${met} / ${defs.length}　·　毛色 ${coatsGot} / ${coats.length}`), el('div', 'create-sub', '摸一摸、喂一喂就能认识它们；好感度越高，解锁的玩法越多（跟随、专属名字、蹭腿、翻肚皮……）。稀有毛色的猫藏得更深，多逛逛校园吧。'));
    const per = el('div', 'cx-rar');
    for (const r of RARITY_ORDER) {
      const list = coats.filter((c) => COAT_RARITY[c] === r); if (!list.length) continue;
      const s2 = el('span', 'cx-rar-i', `${RARITY_NAMES[r]} ${list.filter((c) => got.has(c)).length}/${list.length}`); s2.style.color = RARITY_COLORS[r]; per.append(s2);
    }
    box.append(per);
    // 毛色图鉴：按稀有度分组，没遇到的是剪影
    for (const r of RARITY_ORDER) {
      const list = coats.filter((c) => COAT_RARITY[c] === r).sort((x, y) => x - y); if (!list.length) continue;
      const t = el('div', 'cx-group', `${RARITY_NAMES[r]}毛色`); t.style.borderLeftColor = RARITY_COLORS[r];
      const grid = el('div', 'cx-grid');
      for (const c of list) {
        const has = got.has(c), cell = el('div', 'cx-cell' + (has ? ' got' : '')); cell.style.borderColor = has ? RARITY_COLORS[r] : '';
        const cv = el('canvas'); try { drawFrame(cv, this.textures, 'cats', `cat${c}_sit_0`, 3); } catch { /* 图集没加载 */ }
        cell.append(cv, el('div', 'cx-name', has ? COAT_LABELS[c] : '？？？'), el('div', 'cx-sub', has ? `认识 ${got.get(c)} / ${total.get(c)} 只` : '还没遇到'));
        grid.append(cell);
      }
      box.append(t, grid);
    }
    // 每一只小猫
    box.append(el('div', 'cx-group cx-cats', '每一只小猫'));
    const grid = el('div', 'cx-grid');
    for (const d of defs) {
      const a2 = aff[d.id] ?? 0, has = a2 > 0, lv = catLevel(a2), cell = el('div', 'cx-cell' + (has ? ' got' : ''));
      const c = el('canvas'); try { drawFrame(c, this.textures, 'cats', `cat${d.coat}_sit_0`, 3); } catch { /* 图集没加载 */ }
      const rar = COAT_RARITY[d.coat] ?? 'common'; if (has) cell.style.borderColor = RARITY_COLORS[rar];
      cell.append(c, el('div', 'cx-name', has ? d.name : '？？？'), el('div', 'cx-sub', has ? `${COAT_LABELS[d.coat] ?? ''} · ${LEVEL_NAMES[lv]}${nicks[d.id] ? ` · 你叫它「${nicks[d.id]}」` : ''}` : '还没认识'));
      grid.append(cell);
    }
    box.append(grid);
  }

  // ------------------------------------------------------------ 钓鱼图鉴
  private renderFish(box: HTMLElement) {
    const got = REAL_FISH.filter((f) => this.fishLog[f.id]).length;
    box.append(el('div', 'cx-sum', `钓鱼图鉴　${got} / ${REAL_FISH.length}`));
    const per = el('div', 'cx-rar');
    for (const r of RARITY_ORDER) {
      const list = REAL_FISH.filter((f) => f.rarity === r), n = list.filter((f) => this.fishLog[f.id]).length;
      const s = el('span', 'cx-rar-i', `${RARITY_NAMES[r]} ${n}/${list.length}`); s.style.color = RARITY_COLORS[r]; per.append(s);
    }
    box.append(per, this.fishDetail());
    for (const r of RARITY_ORDER) {
      const list = REAL_FISH.filter((f) => f.rarity === r);
      const t = el('div', 'cx-group', RARITY_NAMES[r]); t.style.borderLeftColor = RARITY_COLORS[r];
      const grid = el('div', 'cx-grid');
      for (const f of list) {
        const rec = this.fishLog[f.id], cell = el('button', 'cx-cell' + (rec ? ' got' : '') + (this.pickedFish === f.id ? ' on' : '')); cell.type = 'button';
        const c = el('canvas'); drawItem(c, this.textures, f.id, 3);
        cell.append(c, el('div', 'cx-name', rec ? f.name : '？？？'), el('div', 'cx-sub', rec ? `最大 ${rec.best} cm${rec.kg ? ` · ${fmtKg(rec.kg)}` : ''} · ×${rec.n}` : '还没钓到'));
        cell.addEventListener('click', () => { this.pickedFish = f.id; this.render(); });
        grid.append(cell);
      }
      box.append(t, grid);
    }
  }
  private fishDetail(): HTMLElement {
    const d = el('div', 'cx-detail');
    const def = this.pickedFish ? fishDef(this.pickedFish) : undefined;
    if (!def) { d.append(el('div', 'cx-dim', '点一种鱼看详情。拉鱼时鱼在水柱里游，让它一直待在绿条里就能钓上来；越稀有的鱼越难拉。')); return d; }
    const rec = this.fishLog[def.id];
    const top = el('div', 'cx-d-top'); const nm = el('span', 'cx-d-name', rec ? def.name : '？？？'); nm.style.color = RARITY_COLORS[def.rarity];
    top.append(nm, el('span', 'board-tag', RARITY_NAMES[def.rarity]));
    d.append(top);
    if (!rec) { d.append(el('div', 'cx-dim', '还没钓到过这种鱼。试试不同的时间、天气和季节。')); return d; }
    d.append(el('div', 'cx-d-desc', itemDef(def.id)?.desc ?? ''),
      el('div', 'cx-d-line', `个头：${def.minCm}–${def.maxCm} cm，最重约 ${fmtKg(def.maxKg ?? 0)}`),
      el('div', 'cx-d-line', `我的纪录：最长 ${rec.best} cm${rec.kg ? `，最重 ${fmtKg(rec.kg)}` : ''}，共钓到 ${rec.n} 条`),
      el('div', 'cx-d-line', `出没：${habitatText(def)}`));
    return d;
  }
}
