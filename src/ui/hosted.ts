/**
 * 「寄宿」面板：不再有自己的全屏窗口，而是作为别的面板里的一页（成就、称号 → 图鉴；精灵 → 背包）。
 * 它们仍保留 open / close / isOpen（旧的快捷键、学生证按钮、场景里的"有没有面板开着"判断都照常用），只是转给宿主面板。
 */
export interface Host<T extends string> {
  /** 打开宿主面板并切到这一页 */
  open(tab: T): void;
  /** 关闭宿主面板 */
  close(): void;
  /** 宿主面板开着、而且正显示这一页 */
  isOpenOn(tab: T): boolean;
}
/** 宿主里的一页：view 是页面内容（常驻元素，宿主切页时挂上去），enter 在这一页被显示时调用（取数据、清红点） */
export interface Section { readonly view: HTMLElement; enter(): void }
