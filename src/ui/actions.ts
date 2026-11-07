/**
 * 界面操作注册表：留言板、公告、好友……各自注册一个"入口"，由统一的地方渲染——
 * 电脑：右上角时钟下方的侧边按钮；手机：右下角「☰」菜单。新增功能只需要 register 一次，不用改两处界面。
 * 角标（badge）用来提示未读私聊、新好友申请、新公告等。
 */
export interface UiAction {
  id: string; label: string;
  /** 电脑快捷键（只用来在按钮上显示提示，实际按键由场景处理） */
  key?: string;
  run(): void;
  /** 在电脑的侧边按钮里显示（默认 true） */
  desktop?: boolean;
  /** 在手机的菜单里显示（默认 true） */
  touch?: boolean;
  /** 动态显示条件（比如只有管理员才显示）：条件变了调用 ui.refresh() */
  visible?: () => boolean;
}

class Registry {
  readonly list: UiAction[] = [];
  /** 入口守卫：返回一句话 = 现在不让开（比如钓鱼中）；null = 放行。场景设置 */
  guard: ((a: UiAction) => string | null) | null = null;
  /** 被守卫挡下时怎么提示 */
  onBlocked: ((msg: string) => void) | null = null;
  /** 点入口：先问守卫，再执行 */
  invoke(a: UiAction) { const m = this.guard?.(a) ?? null; if (m) { this.onBlocked?.(m); return; } a.run(); }
  private badges = new Map<string, number>();
  private subs = new Set<() => void>();
  add(a: UiAction) { const i = this.list.findIndex((x) => x.id === a.id); if (i >= 0) this.list[i] = a; else this.list.push(a); this.emit(); }
  badge(id: string, n: number) { if ((this.badges.get(id) ?? 0) !== n) { this.badges.set(id, n); this.emit(); } }
  badgeOf(id: string) { return this.badges.get(id) ?? 0; }
  total(filter: (a: UiAction) => boolean) { return this.list.filter(filter).reduce((s, a) => s + this.badgeOf(a.id), 0); }
  /** 重新渲染所有入口（visible 条件变了时调用） */
  refresh() { this.emit(); }
  subscribe(fn: () => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  private emit() { for (const f of this.subs) f(); }
}
export const ui = new Registry();

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 一直放在右侧的入口：公告、留言板、好友（管理的入口只有管理员才看得到）。其余功能都收进左上角的「菜单」 */
export const PINNED_IDS = new Set(['notice', 'board', 'friends', 'admin']);

/**
 * 电脑上的入口：右侧只留 PINNED_IDS 里的几个；其余收进左上角（头像下方）的「菜单」按钮，点开是一个列表，
 * 菜单按钮上的红点 = 收进去的功能的红点之和。手机上由 CSS 隐藏，改用 TouchControls 的菜单。
 */
export function mountSideButtons() {
  const hud = document.getElementById('hud') ?? document.body;
  const box = el('div'); box.id = 'side-btns';
  const menuBtn = el('button', 'box menu-btn', '☰ 菜单'); menuBtn.id = 'menu-btn'; menuBtn.type = 'button'; menuBtn.setAttribute('aria-haspopup', 'true');
  const pop = el('div', 'box menu-pop hidden'); pop.id = 'menu-pop';
  hud.append(box, menuBtn, pop);
  const close = () => pop.classList.add('hidden');
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); });
  document.addEventListener('pointerdown', (e) => { const t = e.target as Node; if (!pop.contains(t) && !menuBtn.contains(t)) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  const item = (a: UiAction, cls: string) => {
    const b = el('button', cls, a.key ? `${a.label} (${a.key})` : a.label); b.type = 'button';
    const n = ui.badgeOf(a.id);
    if (n > 0) b.append(el('span', 'badge', n > 99 ? '99+' : String(n)));
    b.addEventListener('click', () => { close(); ui.invoke(a); });
    return b;
  };
  const render = () => {
    const shown = ui.list.filter((x) => x.desktop !== false && x.visible?.() !== false);
    box.replaceChildren(...shown.filter((a) => PINNED_IDS.has(a.id)).map((a) => item(a, 'box side-btn')));
    const rest = shown.filter((a) => !PINNED_IDS.has(a.id));
    pop.replaceChildren(...rest.map((a) => item(a, 'menu-item')));
    menuBtn.querySelector('.badge')?.remove();
    const total = rest.reduce((s, a) => s + ui.badgeOf(a.id), 0);
    if (total > 0) menuBtn.append(el('span', 'badge', total > 99 ? '99+' : String(total)));
  };
  ui.subscribe(render); render();
}
