import type Phaser from 'phaser';
import type { CatDef, CatInfo, CatResult } from '@/shared/cats';
import { BOND_LEVEL, CAT_NICK_MAX, FEED_COOLDOWN_MS, HUG_LEVEL, LEVEL_AT, LEVEL_NAMES, LEVEL_PERKS, PET_COOLDOWN_MS, TAME_AT, catLevel, catNext } from '@/shared/cats';
import { catProfile, isLiked, levelName, likesKnown, storiesUnlocked } from '@/shared/cat-lore';
import { FISH_FEED_GAIN, type Rarity } from '@/shared/fishing';
import { itemDef } from '@/shared/items';
import { drawFrame } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type FeedKind = 'cat_food' | 'cat_treat' | 'fish' | 'cat_bed';
export interface CatActions { pet(): void; /** 抱抱（挚友以上） */ hug(): void; /** 好感度满值时收服为精灵 / 和它「老吴对战」 */ tame(): void; duel(): void; /** 喂食；喂鱼可以指定哪一种（不指定 = 最常见的） */ feed(item: FeedKind, fishId?: string): void; /** 让它跟着我 / 回家 */ follow(on: boolean): void; /** 取专属名字（空 = 清除） */ nick(name: string): void; close(): void }
/** 面板需要知道的、和这只猫有关的额外状态 */
export interface CatExtra {
  /** 这只猫已经被我收服过 / 我的队伍里有能战斗的猫系精灵 */ tamed?: boolean; hasCatSpirit?: boolean;
  /** 背包里的猫窝数量 / 这只猫是不是已经有我送的窝 */ bed?: number; hasBed?: boolean;
  /** 它现在正跟着我 */ following: boolean; /** 它正陪着别的玩家 */ withOther: boolean; /** 我给它取的专属名字 */ nick?: string;
  /** 服务器给的"今天的状态"（连续探望、今天是否探望/抱/收过回礼、是否喂到过最爱） */ info?: CatInfo;
  /** 背包里的真鱼（喂鱼选择列表用），已按稀有度排序 */ fish?: { id: string; name: string; n: number; rarity: string }[];
}
type Tab = 'act' | 'dossier' | 'bond';
type Cd = { pet: number; feed: number; hug: number };
/** 操作记录的一条：时间、文字、是否出错 */
interface LogEntry { t: number; text: string; ok: boolean }
const LOG_MAX = 20, LOG_SHOWN = 3;
/** 相对时间：刚刚 / N 秒前 / N 分钟前 / N 小时前 */
export function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 10 ? '刚刚' : s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 3600)} 小时前`;
}

/**
 * 和小猫互动的小面板：屏幕下方一块，不挡住场景（能看着猫的反应）。
 * 头部：像素头像 + 名字 + 7 颗心 + 档位和到下一档的进度条 + 连续探望 / 今天的小标记；
 * 三个页签：「互动」摸 / 喂猫粮 / 喂猫条 / 喂鱼（点开选哪种鱼）/ 送猫窝 / 抱抱；「档案」毛色、出没地点、性格、爱吃什么、按好感解锁的故事；
 * 「羁绊」跟随、专属名字、收服为精灵、老吴对战、各档位解锁一览。
 * 键盘：1 摸 2 猫粮 3 猫条 4 鱼 5 跟随/回家 6 取名 7 猫窝 8 收服 9 对战 H 抱抱 Esc 走开（和原来的含义一致）。
 */
export class CatPanel {
  private root = el('div', 'box cat-panel hidden');
  private pic = el('canvas', 'cat-pic');
  private title = el('div', 'cat-title');
  private hearts = el('div', 'cat-bar');
  private lvLine = el('div', 'cat-lvline');
  private prog = el('div', 'cat-prog'); private progFill = el('div', 'cat-prog-fill');
  private tags = el('div', 'cat-tags');
  private logHead = el('button', 'cat-loghead'); private logList = el('div', 'cat-loglist');
  /** 每只猫最近的互动记录（本次会话内保留，切到别的猫看别的猫的） */
  private logs = new Map<number, LogEntry[]>(); private logOpen = false; private logSig = '';
  /** 每只猫最近一次已知的好感度：用来算"这次涨了多少" */
  private affSeen = new Map<number, number>();
  private msg = el('div', 'cat-msg');
  private offline = el('div', 'cat-offline hidden', '没连上服务器：只能摸一摸看看动画，好感度不会记录');
  private tabBtns = new Map<Tab, HTMLButtonElement>();
  private pages = new Map<Tab, HTMLElement>();
  private tab: Tab = 'act';
  // 互动页
  private bPet = el('button', 'btn', '');
  private bFood = el('button', 'btn', '');
  private bTreat = el('button', 'btn', '');
  private bFish = el('button', 'btn', '');
  private bBed = el('button', 'btn', '');
  private bHug = el('button', 'btn', '');
  private fishList = el('div', 'cat-fishlist hidden');
  private fishOpen = false; private fishSig = '';
  // 档案页
  private dossier = el('div', 'cat-dossier'); private dossierSig = '';
  // 羁绊页
  private bFollow = el('button', 'btn', '');
  private bNick = el('button', 'btn', '取名 (6)');
  private bTame = el('button', 'btn', '');
  private bDuel = el('button', 'btn', '老吴对战 (9)');
  private perks = el('div', 'cat-perks'); private perksSig = '';
  private nickRow = el('div', 'cat-nick hidden');
  private nickInput = el('input');
  private cat: CatDef | null = null;
  private following = false; private canBond = false; private online = false; private lv = 0; private hasFish = 0;
  /** 冷却：猫编号 → 各动作"到什么时候能再来一次"（客户端本地计时，只用来给按钮显示倒计时） */
  private cds = new Map<number, Cd>();
  private last = { aff: 0, food: 0, treat: 0, fish: 0, online: false, ex: { following: false, withOther: false } as CatExtra };
  private timer = 0;

  constructor(private act: CatActions, private textures?: Phaser.Textures.TextureManager) {
    const bye = el('button', 'btn cat-bye', '走开 (Esc)');
    for (const b of [this.bPet, this.bFood, this.bTreat, this.bFish, this.bBed, this.bHug, this.bFollow, this.bNick, this.bTame, this.bDuel, bye]) b.type = 'button';
    this.bPet.addEventListener('click', () => this.act.pet());
    this.bFood.addEventListener('click', () => this.act.feed('cat_food'));
    this.bTreat.addEventListener('click', () => this.act.feed('cat_treat'));
    this.bFish.addEventListener('click', () => this.fishPress());
    this.bBed.addEventListener('click', () => this.act.feed('cat_bed'));
    this.bHug.addEventListener('click', () => this.act.hug());
    this.bFollow.addEventListener('click', () => this.act.follow(!this.following));
    this.bNick.addEventListener('click', () => this.openNick());
    this.bTame.addEventListener('click', () => this.act.tame());
    this.bDuel.addEventListener('click', () => this.act.duel());
    bye.addEventListener('click', () => this.act.close());

    // 头部
    this.prog.append(this.progFill);
    const lvrow = el('div', 'cat-lvrow'); lvrow.append(this.hearts, this.lvLine);
    const main = el('div', 'cat-head-main'); main.append(this.title, lvrow, this.prog, this.tags);
    const head = el('div', 'cat-head'); head.append(this.pic, main, bye);
    // 页签
    const tabs = el('div', 'cat-tabs');
    for (const [id, label] of [['act', '互动'], ['dossier', '档案'], ['bond', '羁绊']] as [Tab, string][]) {
      const b = el('button', 'cat-tab', label); b.type = 'button'; b.addEventListener('click', () => this.setTab(id)); this.tabBtns.set(id, b); tabs.append(b);
    }
    // 互动页
    const actPage = el('div', 'cat-page'); const grid = el('div', 'cat-grid'); grid.append(this.bPet, this.bHug, this.bFood, this.bTreat, this.bFish, this.bBed); this.logHead.type = 'button'; this.logHead.addEventListener('click', () => { this.logOpen = !this.logOpen; this.logSig = ''; this.renderLog(); });
    actPage.append(grid, this.fishList, this.logHead, this.logList);
    // 档案页
    const dos = el('div', 'cat-page hidden'); dos.append(this.dossier);
    // 羁绊页
    this.nickInput.type = 'text'; this.nickInput.maxLength = CAT_NICK_MAX; this.nickInput.placeholder = `给它起个名字（最多 ${CAT_NICK_MAX} 个字，只有你看得到）`; this.nickInput.autocomplete = 'off';
    const ok = el('button', 'btn primary', '确定'), clear = el('button', 'btn', '用回原名'), cancel = el('button', 'btn', '取消');
    for (const b of [ok, clear, cancel]) b.type = 'button';
    ok.addEventListener('click', () => this.submitNick(this.nickInput.value));
    clear.addEventListener('click', () => this.submitNick(''));
    cancel.addEventListener('click', () => this.nickRow.classList.add('hidden'));
    this.nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submitNick(this.nickInput.value); } else if (e.key === 'Escape') { e.stopPropagation(); this.nickRow.classList.add('hidden'); } });
    this.nickRow.append(this.nickInput, ok, clear, cancel);
    const bond = el('div', 'cat-page hidden'); const g2 = el('div', 'cat-grid'); g2.append(this.bFollow, this.bNick, this.bTame, this.bDuel); bond.append(g2, this.nickRow, this.perks);
    this.pages.set('act', actPage); this.pages.set('dossier', dos); this.pages.set('bond', bond);

    this.root.append(head, this.msg, this.offline, tabs, actPage, dos, bond);
    (document.getElementById('hud') ?? document.body).append(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement)) return;
      if (e.key === '1') this.act.pet(); else if (e.key === '2') this.act.feed('cat_food'); else if (e.key === '3') this.act.feed('cat_treat'); else if (e.key === '4') this.fishPress();
      else if (e.key === '7') this.act.feed('cat_bed'); else if (e.key === '8') this.act.tame(); else if (e.key === '9') this.act.duel(); else if (e.key === 'h' || e.key === 'H') this.act.hug();
      else if (e.key === '5' && this.canBond) this.act.follow(!this.following); else if (e.key === '6' && this.canBond) { this.setTab('bond'); this.openNick(); } else if (e.key === 'Escape') this.act.close();
    });
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  get current() { return this.cat; }
  open(cat: CatDef) {
    this.cat = cat; this.logOpen = false; this.logSig = ''; this.msg.textContent = ''; this.msg.classList.remove('bad'); this.nickRow.classList.add('hidden'); this.fishOpen = false; this.fishSig = ''; this.dossierSig = ''; this.perksSig = '';
    this.root.classList.remove('hidden'); this.setTab('act');
    try { if (this.textures) drawFrame(this.pic, this.textures, 'cats', `cat${cat.coat}_sit_0`, 3); } catch { /* 图集没加载：不显示头像 */ }
    window.clearInterval(this.timer); this.timer = window.setInterval(() => this.tick(), 250);
    this.renderLog();
  }
  close() { this.cat = null; this.root.classList.add('hidden'); window.clearInterval(this.timer); }

  private setTab(t: Tab) {
    this.tab = t;
    for (const [id, b] of this.tabBtns) b.classList.toggle('on', id === t);
    for (const [id, p] of this.pages) p.classList.toggle('hidden', id !== t);
  }
  private openNick() { if (!this.canBond) return; this.nickRow.classList.remove('hidden'); this.nickInput.value = ''; setTimeout(() => this.nickInput.focus(), 0); }
  private submitNick(name: string) { this.nickRow.classList.add('hidden'); this.act.nick(name.trim()); }
  private fishPress() {
    const list = this.last.ex.fish ?? [];
    if (!this.online || !list.length) return;
    if (list.length === 1) { this.act.feed('fish', list[0].id); return; }
    this.fishOpen = !this.fishOpen; this.renderFish();
  }

  // ------------------------------------------------------------ 冷却（客户端本地计时：只管按钮上的倒计时，真正的判断在服务器）
  private cd(): Cd { const id = this.cat?.id ?? -1; let c = this.cds.get(id); if (!c) { c = { pet: 0, feed: 0, hug: 0 }; this.cds.set(id, c); } return c; }
  /** 一次互动成功了：开始计冷却（WorldScene 在收到成功的 cat_result 时调用） */
  started(kind: 'pet' | 'feed' | 'hug') {
    if (!this.cat) return;
    const c = this.cd(), now = Date.now();
    if (kind === 'pet') c.pet = now + PET_COOLDOWN_MS; else if (kind === 'feed') c.feed = now + FEED_COOLDOWN_MS; else c.hug = now + 45000;
    this.tick();
  }
  private left(t: number) { return Math.max(0, Math.ceil((t - Date.now()) / 1000)); }
  private tick() { if (this.cat) { this.paintButtons(); this.renderLog(); } }

  // ------------------------------------------------------------ 刷新
  /** 刷新好感度条、按钮上的数量与可用状态、档案 */
  update(aff: number, food: number, treat: number, fish: number, online: boolean, ex: CatExtra = { following: false, withOther: false }) {
    if (!this.cat) return;
    this.last = { aff, food, treat, fish, online, ex };
    const lv = catLevel(aff), next = catNext(aff), info = ex.info;
    this.affSeen.set(this.cat.id, aff);
    this.lv = lv; this.canBond = lv >= BOND_LEVEL; this.following = ex.following; this.online = online; this.hasFish = fish;
    const prof = catProfile(this.cat);
    this.title.textContent = ex.nick ? `${ex.nick}（${this.cat.name}）` : this.cat.name;
    this.hearts.textContent = '♥'.repeat(lv + 1) + '♡'.repeat(LEVEL_NAMES.length - 1 - lv);
    const span = next ? LEVEL_AT[lv + 1] - LEVEL_AT[lv] : 1;
    this.progFill.style.width = `${next ? Math.round(((aff - LEVEL_AT[lv]) / span) * 100) : 100}%`;
    this.lvLine.textContent = `${LEVEL_NAMES[lv]} · 好感 ${aff}${next ? `（再 ${next} 点到「${LEVEL_NAMES[lv + 1]}」）` : '（最亲密）'}`;
    const tags: string[] = [];
    if (prof.real) tags.push('🏫 校猫');
    if (info?.st && info.st > 0) tags.push(`📅 连续探望 ${info.st} 天`);
    if (info?.vt) tags.push('今日已探望 ✓'); if (info?.hg) tags.push('今日已抱 ✓'); if (info?.gf) tags.push('🎁 今日回礼 ✓');
    else if (lv >= BOND_LEVEL) tags.push('今天还没收到回礼');
    this.tags.textContent = tags.join('　'); this.tags.classList.toggle('hidden', !tags.length);
    this.offline.classList.toggle('hidden', online);
    this.paintButtons();
    this.renderFish();
    this.renderDossier(aff, ex);
    this.renderPerks(lv, aff);
    if (!this.canBond) this.nickRow.classList.add('hidden');
  }

  private paintButtons() {
    if (!this.cat) return;
    const { food, treat, fish, ex } = this.last, online = this.online, lv = this.lv, c = this.cd();
    const pc = this.left(c.pet), fc = this.left(c.feed), hc = this.left(c.hug), cdText = (s: number) => (s > 0 ? ` · ${s}s` : '');
    const liked = (id: string) => likesKnown(lv, !!ex.info?.fv) && isLiked(this.cat!, id) ? ' ♥' : '';
    this.bPet.textContent = `摸一摸 (1)${cdText(pc)}`; this.bPet.disabled = pc > 0;
    this.bFood.textContent = `喂猫粮 ×${food}${liked('cat_food')} (2)${cdText(fc)}`; this.bFood.disabled = !online || food <= 0 || fc > 0;
    this.bTreat.textContent = `喂猫条 ×${treat}${liked('cat_treat')} (3)${cdText(fc)}`; this.bTreat.disabled = !online || treat <= 0 || fc > 0;
    this.bFish.textContent = `喂鱼 ×${fish} (4)${this.fishOpen ? ' ▴' : fish > 1 ? ' ▾' : ''}${cdText(fc)}`; this.bFish.disabled = !online || fish <= 0 || fc > 0;
    this.bBed.textContent = ex.hasBed ? '已有窝 🛏' : `送猫窝 ×${ex.bed ?? 0} (7)`; this.bBed.disabled = !online || !!ex.hasBed || (ex.bed ?? 0) <= 0;
    this.bHug.textContent = lv < HUG_LEVEL ? `抱抱（${LEVEL_NAMES[HUG_LEVEL]}解锁）` : `抱抱 (H)${cdText(hc)}`; this.bHug.disabled = !online || lv < HUG_LEVEL || hc > 0;
    this.bFollow.textContent = ex.following ? '让它回家 (5)' : ex.withOther ? '它正陪着别人' : '让它跟着我 (5)';
    this.bFollow.disabled = !online || !this.canBond || (!ex.following && ex.withOther);
    this.bNick.textContent = ex.nick ? '改名 (6)' : '取名 (6)'; this.bNick.disabled = !online || !this.canBond;
    const full = this.last.aff >= TAME_AT;
    this.bTame.textContent = ex.tamed ? '已收服为精灵 ✓' : full ? '收服为精灵 (8)' : `收服：需「${LEVEL_NAMES[4]}」(${TAME_AT}点)`;
    this.bTame.disabled = !online || !full || !!ex.tamed;
    this.bDuel.disabled = !online || !ex.hasCatSpirit; this.bDuel.title = ex.hasCatSpirit ? '' : '要先有一只能战斗的猫系精灵在出战队伍里（好感度满了可以收服，也可以……先领一只初始精灵再说）';
    if (!this.canBond) { this.bFollow.title = this.bNick.title = `「${LEVEL_NAMES[BOND_LEVEL]}」（${LEVEL_AT[BOND_LEVEL]} 点）解锁`; } else this.bFollow.title = this.bNick.title = '';
  }

  /** 喂鱼的选择列表：背包里的真鱼，每项显示好感 +N；它的最爱打 ♥（爱吃什么还没揭晓时不标） */
  private renderFish() {
    const list = this.last.ex.fish ?? [], cat = this.cat;
    this.fishList.classList.toggle('hidden', !this.fishOpen || !cat);
    if (!this.fishOpen || !cat) return;
    const known = likesKnown(this.lv, !!this.last.ex.info?.fv), sig = `${cat.id}|${known}|${list.map((f) => `${f.id}:${f.n}`).join(',')}`;
    if (sig === this.fishSig) return;
    this.fishSig = sig; this.fishList.replaceChildren();
    for (const f of list) {
      const loved = isLiked(cat, f.id), gain = (FISH_FEED_GAIN[f.rarity as Exclude<Rarity, 'junk'>] ?? 5) * (loved ? 2 : 1);
      const b = el('button', 'btn cat-fish', `${f.name} ×${f.n}　好感 +${gain}${known && loved ? ' ♥最爱' : ''}`); b.type = 'button';
      b.addEventListener('click', () => { this.fishOpen = false; this.fishSig = ''; this.renderFish(); this.paintButtons(); this.act.feed('fish', f.id); });
      this.fishList.append(b);
    }
  }

  private renderDossier(aff: number, ex: CatExtra) {
    const cat = this.cat; if (!cat) return;
    const lv = catLevel(aff), fv = !!ex.info?.fv, sig = `${cat.id}|${lv}|${fv}`;
    if (sig === this.dossierSig) return;
    this.dossierSig = sig; this.dossier.replaceChildren();
    const p = catProfile(cat), known = likesKnown(lv, fv);
    if (p.real) this.dossier.append(el('div', 'cat-real', '🏫 校猫 · 真的住在新校区'));
    const row = (k: string, v: string) => { const r = el('div', 'cat-row'); r.append(el('span', 'cat-k', k), el('span', 'cat-v', v)); this.dossier.append(r); };
    row('毛色', p.coatLabel); row('出没', p.place); row('样子', p.look); row('性格', p.trait);
    row('爱吃', known ? p.likes.map((i) => itemDef(i)?.name ?? i).join('、') : `还不熟，它不肯告诉你（「${levelName(2)}」时揭晓，或者喂到它的最爱）`);
    const n = storiesUnlocked(lv);
    p.stories.forEach((s, i) => {
      const d = el('div', 'cat-story' + (i < n ? '' : ' locked'));
      d.textContent = i < n ? `📖 ${s}` : `🔒 好感到「${LEVEL_NAMES[i + 1]}」解锁`;
      this.dossier.append(d);
    });
  }

  private renderPerks(lv: number, aff: number) {
    const sig = `${lv}|${aff >= TAME_AT}`;
    if (sig === this.perksSig) return; this.perksSig = sig; this.perks.replaceChildren();
    this.perks.append(el('div', 'cat-perk-title', '各档位解锁'));
    LEVEL_NAMES.forEach((n, i) => {
      if (i === 0) return;
      const d = el('div', 'cat-perkrow' + (i <= lv ? ' got' : '')); d.textContent = `${i <= lv ? '✓' : '🔒'} ${n}（${LEVEL_AT[i]} 点）：${LEVEL_PERKS[i]}`; this.perks.append(d);
    });
  }

  /** 最新一句反馈：显示在 msg 区，同时记进当前这只猫的记录 */
  say(text: string, ok = true) {
    this.msg.textContent = text; this.msg.classList.toggle('bad', !ok);
    if (this.cat && text) this.addLog(this.cat.id, ok ? text : `⚠ ${text}`, ok);
  }

  /** 服务器回了一次互动的结果（任何一只猫的）：记下"做了什么、涨了多少、收到什么、升档"；当前这只猫还要更新 msg 区 */
  result(id: number, kind: 'pet' | 'feed' | 'hug', r: CatResult) {
    const cur = this.cat?.id === id;
    if (cur) { this.msg.textContent = r.msg; this.msg.classList.toggle('bad', !r.ok); }
    if (!r.ok) { this.addLog(id, `⚠ ${r.msg}`, false); return; }
    const before = this.affSeen.get(id), gain = before === undefined ? 0 : r.aff - before;
    this.affSeen.set(id, r.aff);
    const verb = kind === 'pet' ? '摸了摸' : kind === 'hug' ? '抱了抱' : '喂食';
    this.addLog(id, `${verb}${gain > 0 ? ` 好感 +${gain}` : ''}：${r.msg}`, true);
    if (r.loved) this.addLog(id, '♥ 正中它的最爱，好感翻倍', true);
    if (r.gifts.length) this.addLog(id, `🎁 收到：${r.gifts.map((g) => `${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('、')}`, true);
    if (r.leveled) this.addLog(id, `⬆ 升到「${LEVEL_NAMES[r.level] ?? r.level}」`, true);
  }

  private addLog(id: number, text: string, ok: boolean) {
    const list = this.logs.get(id) ?? []; this.logs.set(id, list);
    list.push({ t: Date.now(), text, ok }); if (list.length > LOG_MAX) list.splice(0, list.length - LOG_MAX);
    this.logSig = ''; if (this.cat?.id === id) this.renderLog();
  }
  /** 「📜 最近记录」：新的在上，默认只显示最近 3 条，点标题展开全部（可滚动）；时间每 250ms 检查一次，文字变了才重画 */
  private renderLog() {
    const list = this.logs.get(this.cat?.id ?? -1) ?? [], now = Date.now();
    const shown = (this.logOpen ? list.slice().reverse() : list.slice(-LOG_SHOWN).reverse());
    const sig = `${this.logOpen}|${list.length}|${shown.map((e) => `${e.t}:${ago(now - e.t)}`).join(',')}`;
    if (sig === this.logSig) return; this.logSig = sig;
    this.logHead.textContent = `📜 最近记录（${list.length}）${list.length > LOG_SHOWN ? (this.logOpen ? ' ▴ 收起' : ' ▾ 展开全部') : ''}`;
    this.logHead.disabled = !list.length;
    this.logList.classList.toggle('open', this.logOpen); this.logList.classList.toggle('hidden', !list.length);
    this.logList.replaceChildren();
    for (const e of shown) { const r = el('div', 'cat-logrow' + (e.ok ? '' : ' bad')); r.append(el('span', 'cat-logt', ago(now - e.t)), el('span', 'cat-logx', e.text)); this.logList.append(r); }
  }
}
