import type Phaser from 'phaser';
import { hueOf, type Profile } from '@/shared/profile';
import { drawPortrait } from './sprites';
import { titleDef } from '@/shared/titles';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 学生证：正面（校名、照片、姓名/学院/专业、证号与入学年份、签名）。卡面主色由学院名决定。所有文字用 textContent，不会注入 HTML。 */
export class StudentCard {
  readonly el = el('div', 'card');
  private photo = el('canvas');
  private f = { name: el('dd'), college: el('dd'), major: el('dd') };
  private motto = el('div', 'card-motto');
  private ttl = el('div', 'card-ttl');
  private no = el('span');
  private year = el('span');

  constructor(private textures: Phaser.Textures.TextureManager) {
    const head = el('div', 'card-head');
    head.append(el('div', 'card-badge', '工'));
    const t = el('div');
    t.append(el('div', 'card-school', '河北工程大学'), el('div', 'card-title', '学 生 证'));
    head.append(t);
    const body = el('div', 'card-body');
    const ph = el('div', 'card-photo'); ph.append(this.photo);
    const dl = el('dl', 'card-fields');
    for (const [k, v] of [['姓名', this.f.name], ['学院', this.f.college], ['专业', this.f.major]] as const) dl.append(el('dt', undefined, k), v);
    body.append(ph, dl);
    const foot = el('div', 'card-foot'); foot.append(this.no, this.year);
    this.el.append(head, this.ttl, body, this.motto, foot);
  }

  /** 称号：显示在抬头下方；没有称号就收起这一行 */
  setTitle(id?: string) {
    const t = titleDef(id);
    this.ttl.textContent = t ? `「${t.name}」` : '';
    this.ttl.style.color = t ? t.color : '';
    this.ttl.style.display = t ? '' : 'none';
  }

  /** 传入档案（可部分填写，用于创建界面的实时预览） */
  /** uid = 校园号（服务器分配）；没有时显示证号 */
  set(p: Partial<Profile> & { look: number }, uid?: number) {
    this.el.style.setProperty('--hue', String(hueOf(p.college ?? '')));
    if (!this.ttl.textContent) this.ttl.style.display = 'none';
    this.f.name.textContent = p.name || '—';
    this.f.college.textContent = p.college || '—';
    this.f.major.textContent = p.major || '—';
    this.motto.textContent = p.motto ? `“${p.motto}”` : '';
    this.no.textContent = uid ? `校园号 ${uid}` : `证号 ${p.cardNo ?? '··········'}`;
    this.year.textContent = `入学 ${p.year ?? '····'}`;
    drawPortrait(this.photo, this.textures, p.look, { scale: 2, expr: 'smile', app: p.app });
  }
}
