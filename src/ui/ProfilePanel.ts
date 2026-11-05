import type Phaser from 'phaser';
import { hueOf, type Profile } from '@/shared/profile';
import { StudentCard } from './StudentCard';
import { ABOUT, copyrightLine } from '@/shared/about';
import { drawPortrait, PORTRAIT_HEAD } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 左上角个人信息：头像 + 昵称 + 学院专业；点击（或按 C）展开学生证。 */
export class ProfilePanel {
  private chip = el('div', 'box');
  private avatar = el('canvas');
  private nm = el('div', 'chip-name');
  private sub = el('div', 'chip-sub');
  private modal = el('div', 'screen hidden');
  private card: StudentCard;
  private p: Profile;
  private uid = 0;
  private achBtn = el('button', 'btn', '🏆 成就');

  constructor(private textures: Phaser.Textures.TextureManager, profile: Profile, private onEdit: () => void, private onBackup: () => void = () => {}, private onAch: () => void = () => {}, private onTitle: () => void = () => {}, private onAbout: () => void = () => {}) {
    this.p = profile;
    this.chip.id = 'profile-chip';
    this.chip.title = '点击查看学生证（C）';
    const av = el('div', 'chip-avatar'); av.append(this.avatar);
    const tx = el('div', 'chip-text'); tx.append(this.nm, this.sub);
    // 左上角头像框右下角的「ⓘ」：一眼能找到「关于」（作者、许可、致谢）
    const info = el('button', 'chip-about', 'ⓘ'); info.type = 'button'; info.title = '关于 · 作者与许可'; info.setAttribute('aria-label', '关于');
    info.addEventListener('click', (e) => { e.stopPropagation(); this.onAbout(); });
    this.chip.append(av, tx, info);
    this.chip.addEventListener('click', () => this.toggle());

    this.card = new StudentCard(textures);
    const wrap = el('div', 'card-wrap');
    const btns = el('div', 'create-btns');
    const edit = el('button', 'btn', '修改资料'); edit.type = 'button';
    edit.addEventListener('click', () => { this.close(); this.onEdit(); });
    const backup = el('button', 'btn', '身份备份'); backup.type = 'button';
    backup.addEventListener('click', () => { this.close(); this.onBackup(); });
    this.achBtn.type = 'button';
    this.achBtn.addEventListener('click', () => { this.close(); this.onAch(); });
    const title = el('button', 'btn', '称号'); title.type = 'button';
    title.addEventListener('click', () => { this.close(); this.onTitle(); });
    const close = el('button', 'btn primary', '关闭'); close.type = 'button';
    close.addEventListener('click', () => this.close());
    btns.append(edit, backup, this.achBtn, title, close);
    // 学生证底部：作者署名 + GitHub 主页 + 关于
    const credit = el('div', 'card-credit');
    const gh = el('a', 'about-link', `GitHub · ${ABOUT.author}`); gh.href = ABOUT.github; gh.target = '_blank'; gh.rel = 'noopener noreferrer';
    const about = el('button', 'about-link', '关于 / 许可'); about.type = 'button';
    about.addEventListener('click', () => { this.close(); this.onAbout(); });
    credit.append(el('span', 'card-credit-t', `${copyrightLine()} · 保留所有权利`), gh, about);
    wrap.append(this.card.el, btns, credit);
    this.modal.append(wrap);
    this.modal.addEventListener('mousedown', (e) => { if (e.target === this.modal) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });

    const hud = document.getElementById('hud') ?? document.body;
    hud.append(this.chip, this.modal);
    this.set(profile);
  }

  get isOpen() { return !this.modal.classList.contains('hidden'); }
  open() { this.modal.classList.remove('hidden'); }
  close() { this.modal.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  set(p: Profile) {
    this.p = p;
    this.nm.textContent = p.name;
    this.nm.style.color = `hsl(${hueOf(p.name)} 55% 28%)`;
    this.sub.textContent = `${p.college} · ${p.major}`;
    drawPortrait(this.avatar, this.textures, p.look, { scale: 1, crop: PORTRAIT_HEAD, app: p.app });
    this.card.set(p, this.uid || undefined);
  }
  /** 学生证上的成就按钮：显示已解锁数量 */
  setAch(n: number, total: number) { this.achBtn.textContent = `🏆 成就 ${n}/${total}`; }
  /** 佩戴的称号（学生证抬头下方显示） */
  setTitle(id?: string) { this.card.setTitle(id); }
  /** 服务器分配的校园号：连上后显示在学生证上 */
  setUid(uid: number) { this.uid = uid; this.card.set(this.p, uid || undefined); }
  get profile() { return this.p; }
}
