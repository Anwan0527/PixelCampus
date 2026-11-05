import type Phaser from 'phaser';
import { RARITY_COLORS, RARITY_NAMES, fishDef, fmtKg, sizeTier } from '@/shared/fishing';
import { drawItem } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface CatchInfo { id: string; cm: number; kg: number; isNew?: boolean; record?: boolean; junk?: boolean; perfect?: boolean; msg?: string }

/** 钓到鱼之后弹出的小卡片：图标、名字（按稀有度着色）、长度和重量、"新种类/新纪录/巨物/完美"标签；几秒后自动收起，点一下也能收 */
export class FishCard {
  private root = el('div', 'box fish-card hidden');
  private timer = 0;
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
    this.root.replaceChildren(c, body);
    this.root.classList.remove('hidden');
    this.root.classList.toggle('legend', d.rarity === 'legendary');
    window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.hide(), d.rarity === 'legendary' ? 7000 : 4200);
  }
}
