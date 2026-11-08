import { describe, expect, it } from 'vitest';
import { EscStack, handleEscKey, isTypingTarget, type EscTarget } from '../src/ui/escstack';

/** 最小的假面板：open() / shut() 改状态，记录被关了几次 */
function panel(name: string, extra: Partial<EscTarget> = {}) {
  const p = { name, open: false, closed: 0, escaped: 0, get isOpen(): boolean { return this.open; }, close() { this.closed++; this.open = false; }, ...extra };
  return p as typeof p & EscTarget;
}
const key = (k: string, target: unknown = null, more: Record<string, unknown> = {}) => ({ key: k, target: target as EventTarget | null, ...more });

describe('全局 Esc 栈', () => {
  it('一次只关最上面（最后打开）的一个；再按一次关下一个', () => {
    const s = new EscStack(), a = panel('a'), b = panel('b'), c = panel('c');
    [a, b, c].forEach((p) => s.register(p));
    a.open = true; s.sync(); b.open = true; s.sync(); c.open = true; s.sync();
    expect(s.openList().map((p) => (p as typeof a).name)).toEqual(['c', 'b', 'a']);
    expect(handleEscKey(s, key('Escape'))).toBe(true);
    expect([a.open, b.open, c.open]).toEqual([true, true, false]);
    expect(handleEscKey(s, key('Escape'))).toBe(true);
    expect([a.open, b.open, c.open]).toEqual([true, false, false]);
    expect(handleEscKey(s, key('Escape'))).toBe(true);
    expect([a.closed, b.closed, c.closed]).toEqual([1, 1, 1]);
  });

  it('谁先打开谁在下面：与登记顺序无关；关掉再打开就回到最上面', () => {
    const s = new EscStack(), a = panel('a'), b = panel('b');
    s.register(a); s.register(b);
    b.open = true; s.sync(); a.open = true; s.sync();                // 后登记的 b 先开，a 后开 → a 在上
    expect(s.openList()[0]).toBe(a);
    a.open = false; s.sync(); a.open = true; s.sync();               // a 关了又开：仍在上
    b.open = false; s.sync(); b.open = true; s.sync();               // b 重新打开 → 现在 b 在上
    expect(s.openList()[0]).toBe(b);
  });

  it('没有任何登记的面板开着：不处理（返回 false，交给对话框 / 拉鱼 / 装修等原有逻辑）', () => {
    const s = new EscStack(), a = panel('a'); s.register(a);
    expect(handleEscKey(s, key('Escape'))).toBe(false);
    expect(a.closed).toBe(0);
  });

  it('不是 Esc、输入法组合中、已经被别人处理过：都不管', () => {
    const s = new EscStack(), a = panel('a'); s.register(a); a.open = true;
    expect(handleEscKey(s, key('Enter'))).toBe(false);
    expect(handleEscKey(s, key('Escape', null, { isComposing: true }))).toBe(false);
    expect(handleEscKey(s, key('Escape', null, { defaultPrevented: true }))).toBe(false);
    expect(a.open).toBe(true);
  });

  it('焦点在输入框 / 文本域 / 下拉框 / 可编辑区里：不关面板（Esc 只是失焦或关输入，保持原有行为）', () => {
    const s = new EscStack(), a = panel('a'); s.register(a); a.open = true;
    for (const t of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(isTypingTarget(t as unknown as EventTarget)).toBe(true);
      expect(handleEscKey(s, key('Escape', t))).toBe(false);
    }
    expect(a.open).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(handleEscKey(s, key('Escape', { tagName: 'BUTTON' }))).toBe(true);   // 焦点在按钮上照常关
  });

  it('有 escape() 的面板：Esc 调它而不是 close()（先关子页 / 取消交易这类特殊语义）', () => {
    const s = new EscStack();
    const sub = panel('wall', { escape() { (this as unknown as { escaped: number }).escaped++; } } as Partial<EscTarget>);
    s.register(sub); sub.open = true;
    expect(handleEscKey(s, key('Escape'))).toBe(true);
    expect(sub.escaped).toBe(1); expect(sub.closed).toBe(0); expect(sub.open).toBe(true);   // escape() 可以只退一层，面板还开着
  });

  it('注销后不再响应；isOpen 抛错的面板当作没开', () => {
    const s = new EscStack(), a = panel('a'), bad = { get isOpen(): boolean { throw new Error('boom'); }, close() { /* 不该被调 */ throw new Error('no'); } };
    const off = s.register(a); s.register(bad); a.open = true;
    off(); expect(handleEscKey(s, key('Escape'))).toBe(false); expect(a.open).toBe(true);
  });

  it('新面板只要有 isOpen + close 就能接入：打开的瞬间就算最上层', () => {
    const s = new EscStack(), old = panel('old'); s.register(old); old.open = true; s.sync();
    const fresh = panel('fresh'); s.register(fresh); fresh.open = true;       // 没等任何一帧同步，Esc 前会先 sync
    expect(handleEscKey(s, key('Escape'))).toBe(true);
    expect(fresh.open).toBe(false); expect(old.open).toBe(true);
  });
});
