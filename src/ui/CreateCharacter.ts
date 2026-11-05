import type Phaser from 'phaser';
import { LIMITS, LOOK_CHOICES, YEARS, DEFAULT_YEAR, cleanText, validateProfile, type Gender, type Profile } from '@/shared/profile';
import { StudentCard } from './StudentCard';
import { drawLook, LOOK_CROP } from './sprites';
import {
  APP_LEN, BOTTOM_NAMES, DYE_COLORS, EYE_COLORS, EYE_NAMES, FLAG, FRINGE_NAMES, GLASSES_NAMES, HAIR_COLORS, HAIR_NAMES, HAT_NAMES, IDX, SHOE_NAMES, SKIN_COLORS, TOP_NAMES,
  appKey, randomAppearance, sameApp, type Appearance,
} from '@/shared/appearance';
import { ANIMS, appToLook, buildAnim, presetApp } from '@/art/char-rig';
import { BackupPanel } from './BackupPanel';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const FUN = {
  name: ['小工', '阿程', '星河', '青禾', '南风', '北辰', '知了', '拾光', '晚晴', '山栀'],
  college: ['数理学院', '文学院', '机电学院', '魔法学院', '经管学院', '建筑学院', '信息学院', '美食学院'],
  major: ['计算机科学', '机械设计', '汉语言文学', '土木工程', '会计学', '应用物理', '数字媒体', '食堂研究'],
  motto: ['今天也要加油', '早八是不可能起的', '去图书馆占座', '湖边散步中', '一起逛校园吧'],
};

export interface CreateOptions {
  /** 修改资料时传入现有档案；新建时不传 */
  initial?: Profile;
  /** 衣柜（宿舍）：只换造型和外观，不改姓名/学院/专业/年级/签名 */
  wardrobe?: boolean;
  onDone: (p: Profile) => void;
  /** 仅修改资料时可取消 */
  onCancel?: () => void;
}

/** 新生报到：选性别与造型 → 填学生证 → 入学。创建与修改资料共用。 */
export class CreateCharacter {
  private root = el('div', 'screen');
  private card: StudentCard;
  private gender: Gender;
  private look: number;
  /** 外观自定义：始终有值（没改过就等于预置造型的映射）；保存时和预置一样就不存，继续用预置的精细图集 */
  private app: Appearance;
  private looksBox = el('div', 'looks');
  private custom = el('div', 'cust');
  private tab = 'hair';
  private walkCanvas = el('canvas', 'cust-walk');
  private walkFrames: HTMLCanvasElement[] = []; private walkTimer = 0; private walkAt = 0; private walkKey = '';
  private err = el('div', 'form-err');
  private inputs!: { name: HTMLInputElement; college: HTMLInputElement; major: HTMLInputElement; motto: HTMLInputElement; year: HTMLSelectElement };
  private genderBtns: Record<Gender, HTMLButtonElement> = { m: el('button', 'seg', '男生'), f: el('button', 'seg', '女生') };

  constructor(private textures: Phaser.Textures.TextureManager, private opts: CreateOptions) {
    const ini = opts.initial;
    this.gender = ini?.gender ?? 'm';
    this.look = ini?.look ?? LOOK_CHOICES[this.gender][0];
    this.app = ini?.app ? ini.app.slice() : presetApp(this.look);
    this.card = new StudentCard(textures);
    this.build();
    this.refresh();
  }

  open() { (document.getElementById('hud') ?? document.body).append(this.root); this.inputs.name.focus(); }
  close() { window.clearInterval(this.walkTimer); this.root.remove(); }

  private field(label: string, input: HTMLElement, hint?: string) {
    const row = el('label', 'row'); row.append(el('span', 'row-label', label), input);
    if (hint) row.append(el('span', 'row-hint', hint));
    return row;
  }
  private text(max: number, value: string, placeholder: string) {
    const i = el('input'); i.type = 'text'; i.maxLength = max + 4; i.value = value; i.placeholder = placeholder; i.autocomplete = 'off'; i.spellcheck = false;
    i.addEventListener('input', () => this.refresh());
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } });
    return i;
  }

  private build() {
    const ini = this.opts.initial;
    const panel = el('div', 'box create');
    panel.append(el('div', 'create-title', this.opts.wardrobe ? '衣柜 · 换装' : ini ? '修改资料' : '新生报到'), el('div', 'create-sub', this.opts.wardrobe ? '挑一套喜欢的造型、发型和衣服，改好后点“保存”。' : ini ? '改好后点“保存”，大家看到的昵称会立刻更新。' : '先选一个造型，再填好你的学生证。姓名、学院、专业随便写，不用真实。'));

    const form = el('div', 'create-form');
    const gRow = el('div', 'seg-row');
    for (const g of ['m', 'f'] as const) {
      this.genderBtns[g].type = 'button';
      this.genderBtns[g].addEventListener('click', () => { this.gender = g; if (!LOOK_CHOICES[g].includes(this.look)) { const untouched = sameApp(this.app, presetApp(this.look)); this.look = LOOK_CHOICES[g][0]; if (untouched) this.app = presetApp(this.look); } this.refresh(); });
      gRow.append(this.genderBtns[g]);
    }
    form.append(this.field('性别', gRow), this.field('造型', this.looksBox), this.custom);

    const year = el('select');
    for (const y of YEARS) { const o = el('option', undefined, `${y} 级`); o.value = String(y); year.append(o); }
    year.value = String(ini?.year ?? DEFAULT_YEAR);
    year.addEventListener('change', () => this.refresh());
    this.inputs = {
      name: this.text(LIMITS.name, ini?.name ?? '', '你的名字（最多 8 个字）'),
      college: this.text(LIMITS.college, ini?.college ?? '', '例如：机电学院'),
      major: this.text(LIMITS.major, ini?.major ?? '', '例如：机械设计'),
      motto: this.text(LIMITS.motto, ini?.motto ?? '', '一句话签名（可不填）'),
      year,
    };
    if (!this.opts.wardrobe) form.append(this.field('姓名', this.inputs.name), this.field('学院', this.inputs.college), this.field('专业', this.inputs.major), this.field('年级', year), this.field('签名', this.inputs.motto));

    const btns = el('div', 'create-btns');
    const dice = el('button', 'btn', '🎲 随机填写'); dice.type = 'button';
    dice.addEventListener('click', () => {
      this.inputs.name.value = pick(FUN.name); this.inputs.college.value = pick(FUN.college); this.inputs.major.value = pick(FUN.major); this.inputs.motto.value = pick(FUN.motto);
      this.refresh();
    });
    const ok = el('button', 'btn primary', ini ? '保存' : '入学报到 ▶'); ok.type = 'button';
    ok.addEventListener('click', () => this.submit());
    if (!this.opts.wardrobe) btns.append(dice);
    if (this.opts.onCancel) { const c = el('button', 'btn', '取消'); c.type = 'button'; c.addEventListener('click', () => { this.close(); this.opts.onCancel!(); }); btns.append(c); }
    btns.append(ok);
    form.append(this.err, btns);
    if (!ini) { // 新生报到：已经有身份的人（换了设备/清了数据）可以直接恢复
      const rec = el('button', 'backup-link', '已有备份码？恢复身份'); rec.type = 'button';
      rec.addEventListener('click', () => new BackupPanel().open('restore'));
      form.append(rec);
    }

    const walk = el('div', 'cust-walkbox'); walk.append(this.walkCanvas, el('div', 'create-note', '地图上的样子'));
    const side = el('div', 'create-card'); side.append(this.card.el, el('div', 'create-note', '学生证预览'), walk);
    this.walkTimer = window.setInterval(() => this.tickWalk(), 90);
    const cols = el('div', 'create-cols'); cols.append(form, side);
    panel.append(cols);
    this.root.append(panel);
  }

  private draft(): Partial<Profile> & { look: number } {
    return {
      gender: this.gender, look: this.look, app: sameApp(this.app, presetApp(this.look)) ? undefined : this.app, name: cleanText(this.inputs.name.value, LIMITS.name), college: cleanText(this.inputs.college.value, LIMITS.college), major: cleanText(this.inputs.major.value, LIMITS.major),
      motto: cleanText(this.inputs.motto.value, LIMITS.motto), year: Number(this.inputs.year.value), cardNo: this.opts.initial?.cardNo,
    };
  }

  private refresh() {
    for (const g of ['m', 'f'] as const) this.genderBtns[g].classList.toggle('on', g === this.gender);
    this.looksBox.replaceChildren();
    for (const n of LOOK_CHOICES[this.gender]) {
      const b = el('button', 'look' + (n === this.look ? ' on' : '')); b.type = 'button';
      const c = el('canvas'); drawLook(c, this.textures, n, { scale: 2, crop: LOOK_CROP }); b.append(c);
      b.addEventListener('click', () => { this.look = n; this.app = presetApp(n); this.refresh(); });
      this.looksBox.append(b);
    }
    this.renderCustom();
    this.card.set(this.draft());
    this.err.textContent = '';
  }

  /* ───────── 外观自定义 ───────── */
  private set(field: keyof typeof IDX, v: number) { this.app[IDX[field]] = v; this.refresh(); }
  private chips(label: string, field: keyof typeof IDX, names: readonly string[]) {
    const row = el('div', 'cust-row'); row.append(el('span', 'cust-label', label));
    names.forEach((n, v) => { const b = el('button', 'chip' + (this.app[IDX[field]] === v ? ' on' : ''), n); b.type = 'button'; b.addEventListener('click', () => this.set(field, v)); row.append(b); });
    return row;
  }
  /** 色板：none = 第一格是"无"（发尾渐变、围巾）；取值 = 色板下标（none 时 +1） */
  private swatches(label: string, field: keyof typeof IDX, pal: readonly string[], none = false, names?: readonly string[]) {
    const row = el('div', 'cust-row'); row.append(el('span', 'cust-label', label));
    if (none) { const b = el('button', 'sw none' + (this.app[IDX[field]] === 0 ? ' on' : ''), '无'); b.type = 'button'; b.addEventListener('click', () => this.set(field, 0)); row.append(b); }
    pal.forEach((c, i) => {
      const v = i + (none ? 1 : 0), b = el('button', 'sw' + (this.app[IDX[field]] === v ? ' on' : '')); b.type = 'button'; b.style.background = c; b.title = names?.[i] ?? '';
      b.addEventListener('click', () => this.set(field, v)); row.append(b);
    });
    return row;
  }
  private toggle(label: string, bit: number, inverse = false) {
    const on = !!(this.app[IDX.flags] & bit) !== inverse, b = el('button', 'chip' + (on ? ' on' : ''), label); b.type = 'button';
    b.addEventListener('click', () => this.set('flags', this.app[IDX.flags] ^ bit));
    return b;
  }
  private renderCustom() {
    const tabs: [string, string][] = [['hair', '发型'], ['face', '脸'], ['top', '上衣'], ['bottom', '下装'], ['shoes', '鞋帽'], ['acc', '配饰']];
    const head = el('div', 'cust-tabs');
    for (const [id, name] of tabs) { const t = el('button', 'seg' + (id === this.tab ? ' on' : ''), name); t.type = 'button'; t.addEventListener('click', () => { this.tab = id; this.renderCustom(); }); head.append(t); }
    const rnd = el('button', 'btn', '🎲 随机外观'); rnd.type = 'button'; rnd.addEventListener('click', () => { this.app = randomAppearance(); this.refresh(); });
    const reset = el('button', 'btn', '↺ 还原预置'); reset.type = 'button'; reset.addEventListener('click', () => { this.app = presetApp(this.look); this.refresh(); });
    head.append(rnd, reset);
    const body = el('div', 'cust-body');
    switch (this.tab) {
      case 'hair': body.append(this.chips('发型', 'hair', HAIR_NAMES), this.chips('刘海', 'fringe', FRINGE_NAMES), this.swatches('发色', 'hairColor', HAIR_COLORS), this.swatches('发尾', 'tip', HAIR_COLORS, true)); break;
      case 'face': { const r = el('div', 'cust-row'); r.append(el('span', 'cust-label', '细节'), this.toggle('雀斑', FLAG.freckles), this.toggle('腮红', FLAG.noBlush, true), this.toggle('口罩', FLAG.mask)); body.append(this.swatches('肤色', 'skin', SKIN_COLORS), this.swatches('瞳色', 'eye', EYE_COLORS, false, EYE_NAMES), r); break; }
      case 'top': body.append(this.chips('款式', 'top', TOP_NAMES), this.swatches('颜色', 'topColor', DYE_COLORS), this.swatches('配色', 'top2', DYE_COLORS)); break;
      case 'bottom': { const r = el('div', 'cust-row'); r.append(el('span', 'cust-label', '细节'), this.toggle('白短袜', FLAG.sock)); body.append(this.chips('款式', 'bottom', BOTTOM_NAMES), this.swatches('颜色', 'bottomColor', DYE_COLORS), r); break; }
      case 'shoes': body.append(this.chips('鞋', 'shoes', SHOE_NAMES), this.chips('帽子', 'hat', HAT_NAMES), this.swatches('帽色', 'hatColor', DYE_COLORS)); break;
      default: { const r = el('div', 'cust-row'); r.append(el('span', 'cust-label', '配件'), this.toggle('耳机', FLAG.headphones), this.toggle('书包', FLAG.bag), this.toggle('校园卡挂绳', FLAG.lanyard)); body.append(this.chips('眼镜', 'glasses', GLASSES_NAMES), r, this.swatches('围巾', 'scarf', DYE_COLORS, true)); }
    }
    this.custom.replaceChildren(el('div', 'cust-title', '自定义外观'), head, body);
  }

  /** "地图上的样子"：把当前外观的走路动画（朝下 6 帧）现场画出来循环播放 */
  private tickWalk() {
    const wk = appKey(this.app);
    if (wk !== this.walkKey) {
      this.walkKey = wk;
      const imgs = buildAnim(appToLook(this.app), ANIMS.find((a) => a.id === 'walk')!, 1);
      this.walkFrames = [0, 1, 2, 3, 4, 5].map((i) => { const im = imgs[`walk_down_${i}`], c = document.createElement('canvas'); c.width = im.w; c.height = im.h; c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0); return c; });
      this.walkCanvas.width = this.walkFrames[0].width * 2; this.walkCanvas.height = this.walkFrames[0].height * 2;
    }
    if (!this.walkFrames.length) return;
    const ctx = this.walkCanvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.walkCanvas.width, this.walkCanvas.height);
    ctx.drawImage(this.walkFrames[this.walkAt++ % 6], 0, 0, this.walkCanvas.width, this.walkCanvas.height);
  }

  private submit() {
    const r = validateProfile(this.draft());
    if (!r.ok) { this.err.textContent = r.error; return; }
    this.close();
    this.opts.onDone(r.profile);
  }
}
