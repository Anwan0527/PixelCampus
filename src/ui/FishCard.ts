import type Phaser from 'phaser';
import { RARITY_COLORS, RARITY_NAMES, fishDef, fmtKg, sizeTier } from '@/shared/fishing';
import { itemDef } from '@/shared/items';
import { PROTECTED, isProtected } from '@/shared/release';
import { drawItem } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface CatchInfo { id: string; cm: number; kg: number; isNew?: boolean; record?: boolean; junk?: boolean; perfect?: boolean; msg?: string; /** 双钓 / 顺带钓上来的盲盒 / 河蚌里的珍珠 / 神话鱼第一次 */ twin?: boolean; box?: string; pearl?: boolean; first?: boolean; /** 钓鱼经验（分项）和升级后的等级 */ xp?: { total: number; base: number; perfect: number; isNew: number; capped?: boolean }; lv?: number }

/** 钓到鱼之后弹出的小卡片：图标、名字（按稀有度着色）、长度和重量、"新种类/新纪录/巨物/完美"标签；几秒后自动收起，点一下也能收 */
export class FishCard {
  private root = el('div', 'box fish-card hidden');
  private timer = 0;
  /** 点「放生」时调用（由场景接到服务器） */
  onRelease: (id: string) => void = () => {};
  constructor(private textures: Phaser.Textures.TextureManager) {
    this.root.addEventListener('pointerdown', () => this.hide());
    (document.getElementById('hud') ?? document.body).append(this.root);
  }
  hide() { window.clearTimeout(this.timer); this.root.classList.add('hidden'); }
  show(m: CatchInfo) {
    const d = fishDef(m.id); if (!d) return;
    const c = el('canvas', 'fc-icon'); drawItem(c, this.textures, m.id, 5);
    const body = el('div', 'fc-body');
    const name = el('div', 'fc-name', d.name); name.style.color = RARITY_COLORS[d.rarity];
    const tags = el('div', 'fc-tags');
    const tag = (t: string, cls = '') => tags.append(el('span', `fc-tag ${cls}`, t));
    if (!m.junk) tag(RARITY_NAMES[d.rarity], `r-${d.rarity}`);
    const tier = sizeTier(d, m.cm).name; if (tier && !m.junk) tag(tier, tier === '巨物' ? 'hot' : '');
    if (m.perfect) tag('完美拉鱼', 'hot'); if (m.isNew) tag('图鉴新种类', 'hot'); else if (m.record) tag('新纪录', 'hot');
    body.append(name, tags);
    if (!m.junk) body.append(el('div', 'fc-size', `${m.cm} cm${m.kg > 0 ? ` · ${fmtKg(m.kg)}` : ''}`));
    else body.append(el('div', 'fc-size', m.msg ?? '也算收获吧。'));
    if (!m.junk && m.msg) body.append(el('div', 'fc-note', m.msg));
    if (m.twin) body.append(el('div', 'fc-note hot', '✨ 双钓！一次钓上来两条'));
    if (m.pearl) body.append(el('div', 'fc-note hot', '🦪 河蚌里有一颗珍珠！'));
    if (m.box) body.append(el('div', 'fc-note hot', `🎁 钩子上还挂着一个「${itemDef(m.box)?.name ?? '盲盒'}」（在背包里打开）`));
    if (m.xp && m.xp.total + m.xp.isNew >= 0 && !m.junk) {
      const parts = [m.xp.base ? `钓到 +${m.xp.base}` : '', m.xp.perfect ? `完美 +${m.xp.perfect}` : '', m.xp.isNew ? `新种类 +${m.xp.isNew}` : ''].filter(Boolean).join(' · ');
      body.append(el('div', 'fc-note', `🎣 钓鱼经验 +${m.xp.total}${parts ? `（${parts}）` : ''}${m.xp.capped ? ' · 今日经验已过软上限，按 40% 计' : ''}`));
    }
    if (isProtected(m.id) && !m.junk) {
      const b = el('button', 'btn fc-release', '🌊 放生'); b.type = 'button'; b.title = '放回水里：得到一点币和经验';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); b.disabled = true; this.onRelease(m.id); this.hide(); });
      body.append(el('div', 'fc-note hot', `${PROTECTED[m.id]}`), b);
    }
    if (m.first) body.append(el('div', 'fc-note hot', '🏆 神话鱼第一次钓到！奖励已经放进背包，全校都听到了'));
    this.root.replaceChildren(c, body);
    this.root.classList.remove('hidden');
    this.root.classList.toggle('legend', d.rarity === 'legendary' || d.rarity === 'mythic'); this.root.classList.toggle('mythic', d.rarity === 'mythic');
    window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.hide(), d.rarity === 'mythic' ? 9000 : d.rarity === 'legendary' || m.box || isProtected(m.id) ? 7000 : 4200);
  }
}
