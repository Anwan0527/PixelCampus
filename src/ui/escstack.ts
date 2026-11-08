/**
 * 全局 Esc 关闭（电脑端）：任何"调出来"的面板，按 Esc 都能关；一次只关最上面（最后打开）的那一个。
 *
 * 用法：面板对象只要有 `isOpen`（getter 或布尔）和 `close()`，就 `escStack.register(panel)`——不用改面板自己。
 * 面板的 Esc 要有特殊语义（先关子页再关面板、取消交易、忙时不许关…）就加一个可选的 `escape()`，Esc 时调它而不是 close()。
 *
 * 顺序怎么定：每帧（requestAnimationFrame）扫一遍登记的面板，谁从"关着"变成"开着"就给它一个递增序号，Esc 关序号最大的开着的那个。
 * 所以新面板不需要在 open() 里做任何登记，也不需要关心谁盖在谁上面。
 *
 * 不处理的情况（交回原有逻辑）：焦点在输入框 / 文本域 / 可编辑区里（Esc 只是失焦或关输入，保持各面板原有行为）；
 * 没有任何登记的面板开着（对话框、钓鱼拉鱼取消、装修模式退出等由场景 / 编辑器自己的 Esc 逻辑处理）。
 */
export interface EscTarget {
  readonly isOpen: boolean;
  close(): void;
  /** 可选：Esc 的特殊处理（没有就调 close()） */
  escape?(): void;
}

interface Entry { t: EscTarget; seq: number; was: boolean }

export class EscStack {
  private entries: Entry[] = [];
  private counter = 0;

  register(t: EscTarget): () => void {
    const e: Entry = { t, seq: 0, was: false };
    this.entries.push(e);
    return () => { const i = this.entries.indexOf(e); if (i >= 0) this.entries.splice(i, 1); };
  }

  /** 刷新"谁刚打开"（每帧调；Esc 时也会先调一次，保证顺序是最新的） */
  sync() {
    for (const e of this.entries) {
      let open = false;
      try { open = !!e.t.isOpen; } catch { open = false; }
      if (open && !e.was) e.seq = ++this.counter;
      e.was = open;
    }
  }

  /** 现在开着的面板，最后打开的排在最前 */
  openList(): EscTarget[] {
    this.sync();
    return this.entries.filter((e) => e.was).sort((a, b) => b.seq - a.seq).map((e) => e.t);
  }

  /** 关最上面的一个；返回有没有关（false = 没有任何登记的面板开着） */
  closeTop(): boolean {
    const top = this.openList()[0];
    if (!top) return false;
    if (top.escape) top.escape(); else top.close();
    return true;
  }
}

/** 焦点是不是在要输入文字的地方（输入框里按 Esc 保持各自原有行为） */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

/** 处理一次 keydown：关掉了最上层的面板就返回 true（调用方应当 stopPropagation，免得别的 Esc 监听器再关一个） */
export function handleEscKey(stack: EscStack, e: { key: string; target: EventTarget | null; isComposing?: boolean; defaultPrevented?: boolean }): boolean {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || isTypingTarget(e.target)) return false;
  return stack.closeTop();
}

/** 全局唯一的栈 */
export const escStack = new EscStack();

let installed = false;
/** 装上全局监听：window 上的捕获阶段，抢在各面板自己的 Esc 监听（冒泡阶段）和 Phaser 的键盘之前；关了一个就拦下这次按键 */
export function installEscStack() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (handleEscKey(escStack, e)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  }, true);
  const loop = () => { escStack.sync(); window.requestAnimationFrame(loop); };
  window.requestAnimationFrame(loop);
}
