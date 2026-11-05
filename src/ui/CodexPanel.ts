import type Phaser from 'phaser';
import type { NetClient } from '@/net/client';
import { REAL_FISH, RARITY_COLORS, RARITY_NAMES, RARITY_ORDER, MOVE_NAMES, diffStars, fishDef, fmtKg, habitat, habitatText, type FishDef, type FishLog } from '@/shared/fishing';
import { fishPrice } from '@/shared/economy';
import { boxDef } from '@/shared/boxes';
import { fishData } from './fishData';
import { availableNow, bundleViews, fishGroups, fishHint, gearRows, milestoneViews, mythicChecks, type FishFilter, type GearRow } from './fishdexModel';
import { itemDef, type Inv } from '@/shared/items';
import { tierProgress } from '@/shared/fishdex';
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
  private pickedFish: string | null = null;
  /** 钓鱼图鉴的子页：鱼类 / 鱼竿 / 饵料与配件 / 册页；鱼类页的视图（全部 / 现在能钓到什么）和筛选 */
  private fishSub: 'fish' | 'rods' | 'baits' | 'bundles' = 'fish';
  private fishView: 'all' | 'now' = 'all';
  private filter: FishFilter = {};
  private bundleMsg = '';
  private tabs: TabDef[] = [
    { id: 'animals', label: '动物图鉴', render: (b) => this.renderAnimals(b) },
    { id: 'fish', label: '钓鱼图鉴', render: (b) => this.renderFish(b) },
  ];

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private deps: { cats: () => { defs: readonly CatDef[]; aff: Record<string, number>; nicks: Record<string, string> }; /** 背包、此刻正在用的竿和饵（神话鱼的条件要对照） */ inv: () => Inv; gear: () => { rod: string; bait: string } }) {
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
    fishData.listeners.add(() => { if (this.isOpen) this.render(); });
    this.net.handlers.bundleResult = (ok, msg) => { this.bundleMsg = msg; void ok; if (this.isOpen) this.render(); };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(tab?: CodexTab) { if (tab) this.tab = tab; this.root.classList.remove('hidden'); this.net.getFishdex(); this.net.getGeardex(); this.net.getInv(); this.render(); }
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
  /** 钓鱼图鉴：四个子页——鱼类（含"现在能钓到什么"和筛选）、鱼竿、饵料与配件、册页与里程碑 */
  private renderFish(box: HTMLElement) {
    const subs: [typeof this.fishSub, string][] = [['fish', '🐟 鱼类'], ['rods', '🎣 鱼竿'], ['baits', '🪱 饵料与配件'], ['bundles', '📒 册页']];
    const row = el('div', 'cx-subtabs');
    for (const [id, label] of subs) { const b = el('button', 'cx-sub-tab' + (id === this.fishSub ? ' on' : ''), label); b.type = 'button'; b.addEventListener('click', () => { this.fishSub = id; this.render(); }); row.append(b); }
    box.append(row);
    if (this.fishSub === 'fish') this.renderFishList(box);
    else if (this.fishSub === 'bundles') this.renderBundles(box);
    else this.renderGear(box, this.fishSub);
  }

  private renderFishList(box: HTMLElement) {
    const log = fishData.log, got = REAL_FISH.filter((f) => log[f.id]).length;
    box.append(el('div', 'cx-sum', `钓鱼图鉴　${got} / ${REAL_FISH.length}`));
    const ms = el('div', 'cx-rar');
    for (const m of milestoneViews(log)) ms.append(el('span', 'cx-rar-i' + (m.done ? ' done' : ''), `${m.done ? '✔' : '○'} ${m.n} 种 · ${m.name}`));
    const per = el('div', 'cx-rar');
    for (const t of tierProgress(log)) { const s2 = el('span', 'cx-rar-i', `${RARITY_NAMES[t.tier]} ${t.have}/${t.total}`); s2.style.color = RARITY_COLORS[t.tier]; per.append(s2); }
    box.append(ms, per);
    // 视图与筛选
    const bar = el('div', 'cx-filter');
    const mode = (v: 'all' | 'now', label: string) => { const b = el('button', 'cx-sub-tab' + (this.fishView === v ? ' on' : ''), label); b.type = 'button'; b.addEventListener('click', () => { this.fishView = v; this.render(); }); return b; };
    bar.append(mode('all', '全部'), mode('now', '⏰ 现在能钓到什么'));
    if (this.fishView === 'all') {
      const chk = (label: string, on: boolean, set: (v: boolean) => void) => { const l = el('label', 'cx-chk'); const i = el('input'); i.type = 'checkbox'; i.checked = on; i.addEventListener('change', () => { set(i.checked); this.render(); }); l.append(i, document.createTextNode(label)); return l; };
      const sel = (opts: [string, string][], val: string, set: (v: string) => void, label: string) => { const x = el('select'); x.setAttribute('aria-label', label); for (const [v, t] of opts) x.append(new Option(t, v)); x.value = val; x.addEventListener('change', () => { set(x.value); this.render(); }); return x; };
      bar.append(chk('只看没钓到的', !!this.filter.unseenOnly, (v) => { this.filter.unseenOnly = v || undefined; }),
        sel([['', '全部季节'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']], this.filter.season ?? '', (v) => { this.filter.season = (v || undefined) as FishFilter['season']; }, '按季节筛选'),
        sel([['', '全天'], ['day', '白天'], ['night', '夜里']], this.filter.time ?? '', (v) => { this.filter.time = (v || undefined) as FishFilter['time']; }, '按时间筛选'),
        chk('雨天的鱼', !!this.filter.rain, (v) => { this.filter.rain = v || undefined; }));
    }
    box.append(bar, this.fishDetail());
    if (this.fishView === 'now') { this.renderNow(box); return; }
    for (const g of fishGroups(log, this.filter)) {
      if (!g.rows.length) continue;
      const t = el('div', 'cx-group', `${g.title}　${g.have}/${g.total}`); t.style.borderLeftColor = g.color;
      const grid = el('div', 'cx-grid');
      for (const { def: f, rec } of g.rows) {
        const cell = el('button', 'cx-cell' + (rec ? ' got' : '') + (this.pickedFish === f.id ? ' on' : '')); cell.type = 'button';
        const c = el('canvas'); drawItem(c, this.textures, f.id, 3);
        cell.append(c, el('div', 'cx-name', rec ? f.name : '？？？'), el('div', 'cx-sub', rec ? `最大 ${rec.best} cm${rec.kg ? ` · ${fmtKg(rec.kg)}` : ''} · ×${rec.n}` : fishHint(f)));
        cell.addEventListener('click', () => { this.pickedFish = f.id; this.render(); });
        grid.append(cell);
      }
      box.append(t, grid);
    }
    if (!fishGroups(log, this.filter).some((g) => g.rows.length)) box.append(el('div', 'cx-dim', '没有符合条件的鱼。'));
  }
  /** "现在能钓到什么"：当前的夜里 / 雨天 / 季节下，湖里每种鱼的相对机会 */
  private renderNow(box: HTMLElement) {
    const env = fishData.env(), names = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
    box.append(el('div', 'cx-dim', `现在是 ${env.season ? `${names[env.season]}天` : ''}${env.night ? '夜里' : '白天'}${env.rain ? '、下雨' : ''}。机会按"现在"算，只含湖里能钓到的鱼（神话鱼要特殊条件，看「鱼类」里的详情）。`));
    const grid = el('div', 'cx-grid');
    for (const r of availableNow(env, fishData.log)) {
      const cell = el('button', 'cx-cell' + (r.known ? ' got' : '') + (this.pickedFish === r.def.id ? ' on' : '')); cell.type = 'button';
      const c = el('canvas'); drawItem(c, this.textures, r.def.id, 3);
      cell.style.borderColor = RARITY_COLORS[r.def.rarity];
      cell.append(c, el('div', 'cx-name', r.known ? r.def.name : '？？？'), el('div', 'cx-sub', `${r.label}${r.known ? '' : ' · 还没钓到'}`));
      cell.addEventListener('click', () => { this.pickedFish = r.def.id; this.render(); });
      grid.append(cell);
    }
    box.append(grid);
  }

  private fishDetail(): HTMLElement {
    const d = el('div', 'cx-detail');
    const def = this.pickedFish ? fishDef(this.pickedFish) : undefined;
    if (!def) { d.append(el('div', 'cx-dim', '点一种鱼看详情：什么时间、哪个季节、什么天气容易遇到，难度和我的纪录。拉鱼时鱼在水柱里游，让它一直待在绿条里就能钓上来。')); return d; }
    const log = fishData.log, rec = log[def.id], known = !!rec;
    const top = el('div', 'cx-d-top'); const nm = el('span', 'cx-d-name', known ? def.name : '？？？'); nm.style.color = RARITY_COLORS[def.rarity];
    top.append(nm, el('span', 'board-tag', RARITY_NAMES[def.rarity]));
    d.append(top);
    if (def.rarity === 'mythic') this.mythicBlock(d, def);
    else if (def.source === 'box') d.append(el('div', 'cx-dim', '只能从盲盒里开出来（旧木箱、沉船箱）。'));
    if (!known) { if (def.rarity !== 'mythic' && def.source !== 'box') d.append(el('div', 'cx-dim', '还没钓到过这种鱼。试试不同的时间、天气和季节，或者看看「现在能钓到什么」。')); return d; }
    const stars = diffStars(def);
    d.append(el('div', 'cx-d-desc', itemDef(def.id)?.desc ?? ''),
      el('div', 'cx-d-line', `难度：${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}　游法：${MOVE_NAMES[def.move ?? 'mixed']}`),
      el('div', 'cx-d-line', `个头：${def.minCm}–${def.maxCm} cm，最重约 ${fmtKg(def.maxKg ?? 0)}　收购价约 ${Math.round(fishPrice(def) * 0.85)}–${Math.round(fishPrice(def) * 1.25)} 币`));
    if (def.source !== 'box') {
      const h = habitat(def), row = el('div', 'cx-d-line cx-hab');
      row.append(el('span', 'cx-hab-t', h.time === 'night' ? '🌙 夜里' : h.time === 'day' ? '☀️ 白天' : '🕒 全天'));
      for (const [k, n] of [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']] as const) row.append(el('span', `cx-hab-s ${h.seasons[k]}`, n));
      row.append(el('span', 'cx-hab-t', h.rain ? '🌧 雨天更多' : '晴雨都行'));
      d.append(row, el('div', 'cx-d-line dimline', `出没：${habitatText(def)}（亮的季节更容易遇到，灰的不出现）`));
    }
    const fd = (n?: number) => (n ? new Date(n * 86400e3).toISOString().slice(5, 10).replace('-', ' 月 ') + ' 日' : '—');
    d.append(el('div', 'cx-d-line', `我的纪录：最长 ${rec.best} cm${rec.kg ? `，最重 ${fmtKg(rec.kg)}` : ''}，共钓到 ${rec.n} 条${rec.perfect ? `，完美拉鱼 ${rec.perfect} 次` : ''}`),
      el('div', 'cx-d-line', `第一次钓到：${fd(rec.first)}　最近一次：${fd(rec.last)}`));
    return d;
  }
  /** 神话鱼：出现条件逐条 ✔ / ✘（用现在的环境和正在用的竿、饵） */
  private mythicBlock(d: HTMLElement, def: FishDef) {
    const checks = mythicChecks(def, fishData.env(), this.deps.gear(), fishData.log);
    d.append(el('div', 'cx-d-line', '要同时满足下面的条件才会出现（对照现在的环境和你正在用的竿、饵）：'));
    for (const c of checks) d.append(el('div', 'cx-d-line cx-chk-line ' + (c.ok ? 'ok' : 'no'), `${c.ok ? '✔' : '✘'} ${c.text}`));
  }

  /** 鱼竿 / 饵料与配件：没拥有的显示剪影和"怎么得到"，拥有的显示效果；特长场合和现在的环境对上了就高亮 */
  private renderGear(box: HTMLElement, kind: 'rods' | 'baits') {
    const inv = this.deps.inv(), env = fishData.env();
    const section = (title: string, rows: GearRow[]) => {
      const owned = rows.filter((r) => r.owned).length;
      box.append(el('div', 'cx-sum', `${title}　${owned} / ${rows.length}`));
      const list = el('div', 'cx-gear');
      for (const r of rows) {
        const card = el('div', 'cx-gcard' + (r.owned ? ' got' : '') + (r.active ? ' active' : ''));
        const c = el('canvas'); drawItem(c, this.textures, r.id, 3);
        const info = el('div', 'cx-ginfo'), nm = el('div', 'cx-gname');
        nm.append(document.createTextNode(r.owned ? r.name : '？？？'));
        if (r.tag) nm.append(el('span', 'cx-gtag' + (r.active ? ' on' : ''), r.active ? `${r.tag} · 现在正合适` : r.tag));
        if (r.note) nm.append(el('span', 'cx-gnote', r.note));
        info.append(nm, el('div', 'cx-geff', r.owned ? r.eff : '还没拥有——拥有后显示效果'), el('div', 'cx-ghow', `怎么得到：${r.how}`));
        card.append(c, info); list.append(card);
      }
      box.append(list);
    };
    if (kind === 'rods') section('鱼竿', gearRows('rods', inv, fishData.gd, env));
    else { section('饵料', gearRows('baits', inv, fishData.gd, env)); section('配件', gearRows('tackles', inv, fishData.gd, env)); }
    if (kind === 'rods') box.append(el('div', 'cx-dim', '特殊鱼竿只在对应的场合有加成（夜里 / 雨天 / 冬天），所以可以多买几根换着用。在背包的「装备栏」里选用哪一根。'));
    else box.append(el('div', 'cx-dim', '饵每抛一次竿用掉一个；配件不消耗，要装在带配件槽的鱼竿上。万能饵、指名饵、神话饵要靠合成或盲盒。'));
    const boxes = el('div', 'cx-dim', `盲盒：${(['box_bottle', 'box_crate', 'box_wreck'] as const).map((id) => `${boxDef(id)?.name} 开过 ${fishData.gd.boxes[id] ?? 0} 个`).join('　')}`);
    if (kind === 'baits') box.append(boxes);
  }

  /** 钓鱼册页：集齐一组领一次奖励；里程碑 */
  private renderBundles(box: HTMLElement) {
    const views = bundleViews(fishData.log, fishData.gd, (id) => itemDef(id)?.name ?? id);
    box.append(el('div', 'cx-sum', `钓鱼册页　${views.filter((v) => v.claimed).length} / ${views.length} 已领取`), el('div', 'cx-dim', '每一本集齐了就能领一次奖励。'));
    if (this.bundleMsg) box.append(el('div', 'cx-d-line hot', this.bundleMsg));
    const list = el('div', 'cx-gear');
    for (const v of views) {
      const card = el('div', 'cx-gcard' + (v.done ? ' got' : '')), info = el('div', 'cx-ginfo');
      const nm = el('div', 'cx-gname'); nm.append(document.createTextNode(v.name), el('span', 'cx-gnote', `${v.have} / ${v.need}`));
      const bar = el('div', 'cx-pbar'), fill = el('div', 'cx-pfill'); fill.style.width = `${(v.have / Math.max(1, v.need)) * 100}%`; bar.append(fill);
      const btn = el('button', 'btn' + (v.done && !v.claimed ? ' primary' : ''), v.claimed ? '已领取' : v.done ? '领取奖励' : '未集齐'); btn.type = 'button'; btn.disabled = !v.done || v.claimed || this.net.status !== 'online';
      btn.addEventListener('click', () => { btn.disabled = true; this.net.bundleClaim(v.id); });
      info.append(nm, el('div', 'cx-geff', v.desc), bar, el('div', 'cx-ghow', `奖励：${v.reward}`));
      card.append(info, btn); list.append(card);
    }
    box.append(list);
  }
}
