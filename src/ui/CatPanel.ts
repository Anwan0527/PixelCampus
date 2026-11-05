import type { CatDef } from '@/shared/cats';
import { BOND_LEVEL, CAT_NICK_MAX, LEVEL_AT, LEVEL_NAMES, LEVEL_PERKS, catLevel, catNext } from '@/shared/cats';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type FeedKind = 'cat_food' | 'cat_treat' | 'fish' | 'cat_bed';
export interface CatActions { pet(): void; /** 好感度满值时收服为精灵 / 和它「老吴对战」 */ tame(): void; duel(): void; feed(item: FeedKind): void; /** 让它跟着我 / 回家 */ follow(on: boolean): void; /** 取专属名字（空 = 清除） */ nick(name: string): void; close(): void }
/** 面板需要知道的、和这只猫有关的额外状态 */
export interface CatExtra { /** 这只猫已经被我收服过 / 我的队伍里有能战斗的猫系精灵 */ tamed?: boolean; hasCatSpirit?: boolean; /** 背包里的猫窝数量 / 这只猫是不是已经有我送的窝 */ bed?: number; hasBed?: boolean; /** 它现在正跟着我 */ following: boolean; /** 它正陪着别的玩家 */ withOther: boolean; /** 我给它取的专属名字 */ nick?: string }

/**
 * 和小猫互动的小面板：屏幕下方一块，不挡住场景（能看着猫的反应）。
 * 第一排：摸一摸 / 喂猫粮 / 喂猫条 / 喂鱼（电脑上按 1 2 3 4）；
 * 第二排（够「亲密」才能点）：让它跟着我 / 让它回家（5）、给它取专属名字（6，只有你自己看得到）；走开（Esc）。
 * 面板里写明每一档好感解锁了什么、离下一档还差多少。
 */
export class CatPanel {
  private root = el('div', 'box cat-panel hidden');
  private title = el('div', 'cat-title');
  private bar = el('div', 'cat-bar');
  private perk = el('div', 'cat-perk');
  private msg = el('div', 'cat-msg');
  private bPet = el('button', 'btn', '摸一摸 (1)');
  private bFood = el('button', 'btn', '');
  private bTreat = el('button', 'btn', '');
  private bFish = el('button', 'btn', '');
  private bFollow = el('button', 'btn', '');
  private bNick = el('button', 'btn', '取名 (6)');
  private bBed = el('button', 'btn', '');
  private bTame = el('button', 'btn', '');
  private bDuel = el('button', 'btn', '老吴对战 (9)');
  private nickRow = el('div', 'cat-nick hidden');
  private nickInput = el('input');
  private cat: CatDef | null = null;
  private following = false; private canBond = false; private online = false;

  constructor(private act: CatActions) {
    const bye = el('button', 'btn', '走开 (Esc)');
    for (const b of [this.bPet, this.bFood, this.bTreat, this.bFish, this.bFollow, this.bNick, this.bBed, this.bTame, this.bDuel, bye]) b.type = 'button';
    this.bTame.addEventListener('click', () => this.act.tame());
    this.bDuel.addEventListener('click', () => this.act.duel());
    this.bBed.addEventListener('click', () => this.act.feed('cat_bed'));
    this.bPet.addEventListener('click', () => this.act.pet());
    this.bFood.addEventListener('click', () => this.act.feed('cat_food'));
    this.bTreat.addEventListener('click', () => this.act.feed('cat_treat'));
    this.bFish.addEventListener('click', () => this.act.feed('fish'));
    this.bFollow.addEventListener('click', () => this.act.follow(!this.following));
    this.bNick.addEventListener('click', () => this.openNick());
    bye.addEventListener('click', () => this.act.close());
    const row1 = el('div', 'cat-btns'); row1.append(this.bPet, this.bFood, this.bTreat, this.bFish);
    const row2 = el('div', 'cat-btns'); row2.append(this.bFollow, this.bNick, this.bBed, bye);
    const row3 = el('div', 'cat-btns'); row3.append(this.bTame, this.bDuel);
    this.nickInput.type = 'text'; this.nickInput.maxLength = CAT_NICK_MAX; this.nickInput.placeholder = `给它起个名字（最多 ${CAT_NICK_MAX} 个字，只有你看得到）`; this.nickInput.autocomplete = 'off';
    const ok = el('button', 'btn primary', '确定'), clear = el('button', 'btn', '用回原名'), cancel = el('button', 'btn', '取消');
    for (const b of [ok, clear, cancel]) b.type = 'button';
    ok.addEventListener('click', () => this.submitNick(this.nickInput.value));
    clear.addEventListener('click', () => this.submitNick(''));
    cancel.addEventListener('click', () => this.nickRow.classList.add('hidden'));
    this.nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submitNick(this.nickInput.value); } else if (e.key === 'Escape') { e.stopPropagation(); this.nickRow.classList.add('hidden'); } });
    this.nickRow.append(this.nickInput, ok, clear, cancel);
    this.root.append(this.title, this.bar, this.perk, this.msg, row1, row2, row3, this.nickRow);
    (document.getElementById('hud') ?? document.body).append(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement)) return;
      if (e.key === '1') this.act.pet(); else if (e.key === '2') this.act.feed('cat_food'); else if (e.key === '3') this.act.feed('cat_treat'); else if (e.key === '4') this.act.feed('fish');
      else if (e.key === '7') this.act.feed('cat_bed'); else if (e.key === '8') this.act.tame(); else if (e.key === '9') this.act.duel(); else if (e.key === '5' && this.canBond) this.act.follow(!this.following); else if (e.key === '6' && this.canBond) this.openNick(); else if (e.key === 'Escape') this.act.close();
    });
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  get current() { return this.cat; }
  open(cat: CatDef) { this.cat = cat; this.msg.textContent = ''; this.msg.classList.remove('bad'); this.nickRow.classList.add('hidden'); this.root.classList.remove('hidden'); }
  close() { this.cat = null; this.root.classList.add('hidden'); }

  private openNick() { if (!this.canBond) return; this.nickRow.classList.remove('hidden'); this.nickInput.value = ''; setTimeout(() => this.nickInput.focus(), 0); }
  private submitNick(name: string) { this.nickRow.classList.add('hidden'); this.act.nick(name.trim()); }

  /** 刷新好感度条、按钮上的数量、跟随/取名按钮的可用状态 */
  update(aff: number, food: number, treat: number, fish: number, online: boolean, ex: CatExtra = { following: false, withOther: false }) {
    if (!this.cat) return;
    const lv = catLevel(aff), next = catNext(aff);
    this.canBond = lv >= BOND_LEVEL; this.following = ex.following; this.online = online;
    const nm = ex.nick ? `${ex.nick}（${this.cat.name}）` : this.cat.name;
    this.title.textContent = `${nm} · ${LEVEL_NAMES[lv]}${next ? `（再 ${next} 点好感升到「${LEVEL_NAMES[lv + 1]}」）` : '（最亲密的好朋友）'}`;
    this.bar.textContent = '♥'.repeat(lv + 1) + '♡'.repeat(LEVEL_NAMES.length - 1 - lv) + `  好感 ${aff}`;
    this.perk.textContent = this.canBond
      ? `已解锁：${LEVEL_PERKS.slice(0, lv + 1).filter((_, i) => i >= BOND_LEVEL - 1 || i === lv).join('；')}。${lv < LEVEL_NAMES.length - 1 ? `下一档「${LEVEL_NAMES[lv + 1]}」（${LEVEL_AT[lv + 1]} 点）：${LEVEL_PERKS[lv + 1]}` : ''}`
      : `下一档「${LEVEL_NAMES[lv + 1]}」：${LEVEL_PERKS[lv + 1]}。到「${LEVEL_NAMES[BOND_LEVEL]}」（${LEVEL_AT[BOND_LEVEL]} 点）就能带它走、给它取专属名字。`;
    this.bFood.textContent = `喂猫粮 ×${food} (2)`; this.bTreat.textContent = `喂猫条 ×${treat} (3)`; this.bFish.textContent = `喂鱼 ×${fish} (4)`;
    this.bFood.disabled = !online || food <= 0; this.bTreat.disabled = !online || treat <= 0; this.bFish.disabled = !online || fish <= 0;
    this.bFollow.textContent = ex.following ? '让它回家 (5)' : ex.withOther ? '它正陪着别人' : '让它跟着我 (5)';
    this.bFollow.disabled = !online || !this.canBond || (!ex.following && ex.withOther);
    this.bNick.textContent = ex.nick ? '改名 (6)' : '取名 (6)'; this.bNick.disabled = !online || !this.canBond;
    this.bBed.textContent = ex.hasBed ? '已有窝 🛏' : `送猫窝 ×${ex.bed ?? 0} (7)`; this.bBed.disabled = !online || !!ex.hasBed || (ex.bed ?? 0) <= 0;
    const full = aff >= LEVEL_AT[LEVEL_AT.length - 1];
    this.bTame.textContent = ex.tamed ? '已收服为精灵 ✓' : full ? '收服为精灵 (8)' : `收服：需「${LEVEL_NAMES[LEVEL_NAMES.length - 1]}」(${LEVEL_AT[LEVEL_AT.length - 1]}点)`;
    this.bTame.disabled = !online || !full || !!ex.tamed;
    this.bDuel.disabled = !online || !ex.hasCatSpirit; this.bDuel.title = ex.hasCatSpirit ? '' : '要先有一只能战斗的猫系精灵在出战队伍里（好感度满了可以收服，也可以……先领一只初始精灵再说）';
    if (!this.canBond) this.nickRow.classList.add('hidden');
  }
  say(text: string, ok = true) { this.msg.textContent = text; this.msg.classList.toggle('bad', !ok); }
}
