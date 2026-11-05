import { copyrightLine } from '@/shared/about';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface PhotoHooks {
  /** 进入/退出拍照模式（场景据此松开/收回镜头跟随） */
  enter(): void; exit(): void;
  /** 拍照：场景截取画面后交给 save 加水印保存 */
  shoot(): void;
  zoom(d: 1 | -1): void;
  /** 是否隐藏昵称/称号/气泡 */
  tags(hidden: boolean): void;
}

/**
 * 拍照模式：藏起所有界面，只剩底部一条工具栏；镜头脱离玩家，用方向键/WASD（手机用左半屏摇杆）自由移动取景，
 * 「拍照」把画面保存成 PNG（带校名和时间水印）。电脑按 P，或点右侧「拍照」，手机点 ☰ → 拍照；Esc 退出。
 */
export class PhotoMode {
  private bar = el('div', 'hidden');
  private flash = el('div', 'hidden');
  private hint = el('div', 'photo-hint');
  private hide = false;

  constructor(private hooks: PhotoHooks) {
    this.bar.id = 'photo-bar'; this.flash.id = 'photo-flash';
    const btn = (label: string, title: string, fn: () => void, cls = '') => { const b = el('button', `btn ${cls}`.trim(), label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); this.bar.append(b); return b; };
    btn('－', '缩小', () => this.hooks.zoom(-1)); btn('＋', '放大', () => this.hooks.zoom(1));
    const names = btn('名字：显示', '显示/隐藏头顶的昵称、称号和气泡', () => { this.hide = !this.hide; names.textContent = this.hide ? '名字：隐藏' : '名字：显示'; this.hooks.tags(this.hide); });
    btn('📷 拍照', '保存照片', () => this.shoot(), 'primary');
    btn('退出', '退出拍照模式', () => this.close());
    this.hint.textContent = '方向键 / WASD 移动取景';
    this.bar.prepend(this.hint);
    const hud = document.getElementById('hud') ?? document.body;
    hud.append(this.bar); document.body.append(this.flash);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    ui.add({ id: 'photo', label: '拍照', key: 'P', run: () => this.toggle() });
  }

  get isOpen() { return !this.bar.classList.contains('hidden'); }
  open() {
    if (this.isOpen) return;
    document.body.classList.add('photo-mode'); this.bar.classList.remove('hidden');
    this.hooks.enter();
  }
  close() {
    if (!this.isOpen) return;
    document.body.classList.remove('photo-mode'); this.bar.classList.add('hidden');
    if (this.hide) { this.hide = false; this.hooks.tags(false); const n = this.bar.querySelector('button:nth-of-type(3)'); if (n) n.textContent = '名字：显示'; }
    this.hooks.exit();
  }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private shoot() {
    this.flash.classList.remove('hidden'); this.flash.classList.add('on');
    setTimeout(() => { this.flash.classList.remove('on'); this.flash.classList.add('hidden'); }, 220);
    this.hooks.shoot();
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 把截下来的游戏画面加上底部水印条（校名 · 玩家名 · 日期时间）并下载成 PNG。
 * 图片只在这个浏览器里生成，不会上传到任何地方。
 */
export function savePhoto(img: HTMLImageElement, who: string, place: string) {
  const draw = () => {
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (!g) return;
    g.drawImage(img, 0, 0);
    const d = new Date(), stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const s = Math.max(1, Math.round(h / 540)), bar = 26 * s;
    g.fillStyle = 'rgba(24, 16, 10, 0.62)'; g.fillRect(0, h - bar, w, bar);
    g.font = `${13 * s}px ArkPixel, 'PingFang SC', sans-serif`; g.textBaseline = 'middle';
    g.fillStyle = '#fbf3dc'; g.textAlign = 'left'; g.fillText(`河北工程大学 · 像素校园${place ? ` · ${place}` : ''}`, 10 * s, h - bar / 2);
    g.textAlign = 'right'; g.fillStyle = '#ffe9a0'; g.fillText(`${who} · ${stamp}`, w - 10 * s, h - bar / 2);
    // 作者署名：右上角再压一行半透明的小字，裁掉底栏也还在
    g.font = `${11 * s}px ArkPixel, 'PingFang SC', sans-serif`; g.textBaseline = 'top'; g.textAlign = 'right';
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillText(copyrightLine(), w - 9 * s, 9 * s); g.fillStyle = 'rgba(255,248,224,.8)'; g.fillText(copyrightLine(), w - 10 * s, 8 * s);
    c.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = `像素校园-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };
  if (img.complete && img.naturalWidth) draw(); else img.addEventListener('load', draw, { once: true });
}
