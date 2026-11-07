import { JOY_IDLE, JOY_R, joyVec, type JoyState } from './joystick';
import { ui } from './actions';

export interface TouchActions {
  act(): void; chat(): void; zoom(d: 1 | -1): void;
  /** 在摇杆区域轻点一下（按下到抬起 < 250 ms 且几乎没动）：屏幕坐标，场景用来判断是不是点中了某个玩家 */
  tap(clientX: number, clientY: number): void;
}

/** 手机/平板（粗指针）才启用；也可以用 ?touch 强制开启，方便在电脑上调试。 */
export const isTouchDevice = () => {
  try { return window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'); } catch { return false; }
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 触屏操作：左半屏任意位置按住拖动 = 浮动摇杆（推到边缘奔跑）；右下角"互动"大按钮 + 聊天/学生证/地图/缩放小按钮。
 * 用 DOM 的 Pointer Events，所以摇杆和按钮可以同时按（多点触控）。
 */
export class TouchControls {
  /** 摇杆当前状态，场景每帧读取 */
  state: JoyState = JOY_IDLE;
  private zone = el('div'); private base = el('div'); private knob = el('div'); private menu = el('div');
  private more = el('div', 'tm-more', '▼ 上滑还有更多');
  private chatBtn!: HTMLButtonElement;
  private pid = -1; private ox = 0; private oy = 0; private t0 = 0;

  constructor(private a: TouchActions) {
    document.body.classList.add('touch');
    const hud = document.getElementById('hud') ?? document.body;
    this.zone.id = 'touch-zone'; this.base.id = 'joy-base'; this.knob.id = 'joy-knob';
    this.base.append(this.knob); this.zone.append(this.base);
    this.zone.addEventListener('pointerdown', (e) => this.down(e));
    this.zone.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.zone.addEventListener(t, (e) => this.up(e));
    this.zone.addEventListener('contextmenu', (e) => e.preventDefault());

    const box = el('div'); box.id = 'touch-btns';
    const wrap = el('div', 'tb-wrap');
    const grid = el('div', 'tb-grid');
    const small = (label: string, title: string, fn: () => void) => {
      const b = el('button', 'tb', label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
      b.addEventListener('click', fn); // 用 click 而不是 pointerdown：iOS 要求在 click 里 focus() 才会弹出键盘（聊天按钮要用）
      grid.append(b); return b;
    };
    small('＋', '放大', () => this.a.zoom(1)); small('－', '缩小', () => this.a.zoom(-1));
    this.chatBtn = small('聊天', '聊天', () => this.a.chat());
    const more = small('☰', '更多', () => { this.menu.classList.toggle('open'); this.hint(); });
    // 「更多」菜单：地图、学生证、留言板、公告、好友……全部来自注册表，新功能注册后自动出现
    this.menu.id = 'touch-menu';
    const renderMenu = () => {
      this.menu.replaceChildren();
      for (const a of ui.ordered((x) => x.touch !== false && x.visible?.() !== false)) {
        const b = el('button', 'tm-item', a.label); b.type = 'button';
        const n = ui.badgeOf(a.id); if (n > 0) b.append(el('span', 'badge', n > 99 ? '99+' : String(n)));
        b.addEventListener('click', () => { this.menu.classList.remove('open'); ui.invoke(a); });
        this.menu.append(b);
      }
      this.menu.append(this.more);
      const total = ui.total((x) => x.touch !== false && x.visible?.() !== false);
      more.querySelector('.badge')?.remove();
      if (total > 0) more.append(el('span', 'badge', total > 99 ? '99+' : String(total)));
    };
    this.menu.addEventListener('scroll', () => this.hint(), { passive: true });
    // 点菜单和按钮之外的地方收起菜单（摇杆区域不会被它吃掉：这里只监听、不拦截）
    document.addEventListener('pointerdown', (e) => { const t = e.target as Node; if (this.menu.classList.contains('open') && !this.menu.contains(t) && !more.contains(t)) this.menu.classList.remove('open'); }, true);
    ui.subscribe(renderMenu); renderMenu();
    wrap.append(this.menu, grid);
    const act = el('button', 'tb-act', '互动'); act.type = 'button';
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); this.a.act(); }); // 互动要即时响应，用 pointerdown
    box.append(wrap, act);
    hud.append(this.zone, box);
  }

  /** 「聊天」按钮上的未读角标（n = 没静音的频道的未读总数；0 = 不显示） */
  setChatBadge(n: number) {
    this.chatBtn.querySelector('.badge')?.remove();
    if (n > 0) this.chatBtn.append(el('span', 'badge', n > 99 ? '99+' : String(n)));
  }

  /** 菜单里的功能多到放不下时，底部显示「上滑还有更多」；滑到底就隐藏 */
  private hint() {
    const m = this.menu, left = m.scrollHeight - m.clientHeight - m.scrollTop;
    this.more.style.display = m.scrollHeight > m.clientHeight + 4 && left > 6 ? '' : 'none';
  }
  private down(e: PointerEvent) {
    if (this.pid !== -1) return;
    e.preventDefault();
    this.pid = e.pointerId; this.ox = e.clientX; this.oy = e.clientY; this.t0 = performance.now();
    try { this.zone.setPointerCapture(e.pointerId); } catch { /* 部分浏览器不支持捕获 */ }
    this.base.classList.add('on');
    this.base.style.left = `${this.ox}px`; this.base.style.top = `${this.oy}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.state = JOY_IDLE;
  }
  private move(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    e.preventDefault();
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) { dx = (dx / len) * JOY_R; dy = (dy / len) * JOY_R; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.state = joyVec(e.clientX - this.ox, e.clientY - this.oy);
  }
  private up(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    if (e.type === 'pointerup' && performance.now() - this.t0 < 250 && Math.hypot(e.clientX - this.ox, e.clientY - this.oy) < 10) this.a.tap(e.clientX, e.clientY);
    this.pid = -1; this.state = JOY_IDLE;
    this.base.classList.remove('on'); this.base.style.left = ''; this.base.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
  }
}
