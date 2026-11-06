/**
 * 数量拉条：一条滑杆 + 数字框 + 「最大」+ 一个带数量的确认按钮。
 * 商店买卖、开盲盒共用；滑杆和数字框互相同步，数量始终在 1..max 之间。
 * 只做展示和取数，不做任何规则判断（够不够、放不放得下都在服务器）。
 */
export interface QtyOpts {
  /** 最大可选数量（<1 时整行不显示） */
  max: number;
  /** 初始数量 */
  value?: number;
  /** 确认按钮的文字（随数量变） */
  label: (n: number) => string;
  /** 点确认按钮 */
  onGo: (n: number) => void;
  /** 数量变化时（用来记住选择，重绘时不丢） */
  onChange?: (n: number) => void;
  primary?: boolean;
  disabled?: boolean;
  /** 数量变化时的小提示（如总价） */
  hint?: (n: number) => string;
}

export function qtyPicker(o: QtyOpts): HTMLElement {
  const row = document.createElement('div'); row.className = 'qty-row';
  if (o.max < 1) { row.classList.add('hidden'); return row; }
  const clamp = (v: number) => Math.max(1, Math.min(o.max, Math.floor(Number.isFinite(v) ? v : 1)));
  let n = clamp(o.value ?? 1);
  const range = document.createElement('input'); range.type = 'range'; range.min = '1'; range.max = String(o.max); range.value = String(n); range.className = 'qty-range';
  range.setAttribute('aria-label', '数量');
  const num = document.createElement('input'); num.type = 'number'; num.min = '1'; num.max = String(o.max); num.value = String(n); num.className = 'qty-num';
  num.setAttribute('aria-label', '数量');
  const maxBtn = document.createElement('button'); maxBtn.type = 'button'; maxBtn.className = 'btn qty-max'; maxBtn.textContent = '最大';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'btn qty-go' + (o.primary ? ' primary' : ''); go.disabled = !!o.disabled;
  const hint = document.createElement('span'); hint.className = 'qty-hint';
  const sync = (v: number, from?: 'range' | 'num') => {
    n = clamp(v);
    if (from !== 'range') range.value = String(n);
    if (from !== 'num') num.value = String(n);
    go.textContent = o.label(n); hint.textContent = o.hint?.(n) ?? '';
    o.onChange?.(n);
  };
  range.addEventListener('input', () => sync(Number(range.value), 'range'));
  num.addEventListener('input', () => { if (num.value !== '') sync(Number(num.value), 'num'); });
  num.addEventListener('change', () => sync(Number(num.value)));
  maxBtn.addEventListener('click', () => sync(o.max));
  go.addEventListener('click', () => o.onGo(n));
  sync(n);
  if (o.max < 2) { range.classList.add('hidden'); num.classList.add('hidden'); maxBtn.classList.add('hidden'); }
  row.append(range, num, maxBtn, go, hint);
  return row;
}
