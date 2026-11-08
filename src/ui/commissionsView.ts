/**
 * 钓鱼委托的界面（钓具老板的每日 + 每周委托）：纯渲染 + 回调，由任务面板使用。
 * 数据来自 fishData.wq（服务器的 wq 消息）；领奖走 net.wqClaim。以前画在钓具摊里，现在统一放进「任务」。
 */
import type { CommView } from '@/shared/protocol';
import { itemDef } from '@/shared/items';
import type { WqInfo } from './fishData';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 有没有可以领的委托奖励（任务按钮红点、钓具老板头顶的「！」共用） */
export const commClaimable = (wq: WqInfo | null | undefined): boolean => !!wq && ((wq.daily.done && !wq.daily.claimed) || wq.list.some((c) => c.done && !c.claimed));

const TIER_NAMES: Record<string, string> = { mid: '中等', hard: '困难', extreme: '极难' };

function card(c: CommView, label: string, claim: (id: string) => void): HTMLElement {
  const row = el('div', 'comm-card' + (c.claimed ? ' claimed' : c.done ? ' ready' : ''));
  const main = el('div', 'comm-main');
  const nm = el('div', 'comm-name'); if (label) nm.append(el('span', 'comm-tier', label)); nm.append(document.createTextNode(c.name), el('span', 'comm-prog', `${c.prog} / ${c.goal}`));
  const bar = el('div', 'quest-bar'), fill = el('div', 'quest-fill'); fill.style.width = `${Math.min(100, (c.prog / Math.max(1, c.goal)) * 100)}%`; bar.append(fill);
  main.append(nm, el('div', 'comm-desc', c.desc), bar, el('div', 'comm-reward', `奖励：${c.reward.coins} 校园币${c.reward.items.map((g) => `、${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('')}、${c.reward.xp} 钓鱼经验`));
  const b = el('button', 'btn comm-btn' + (c.done && !c.claimed ? ' primary' : ''), c.claimed ? '已领取' : c.done ? '领取' : '进行中'); b.type = 'button'; b.disabled = !c.done || c.claimed;
  b.addEventListener('click', () => { b.disabled = true; claim(c.id); });
  row.append(main, b);
  return row;
}

/** 整块委托内容：今日委托（简单）+ 本周委托（3 个，较难）+ 全部领完的额外奖励说明 */
export function renderCommissions(wq: WqInfo | null, o: { claim: (id: string) => void; online: boolean }): HTMLElement {
  const box = el('div', 'comm-view');
  if (!o.online) { box.append(el('div', 'board-empty', '没连上服务器，现在看不到钓鱼委托。')); return box; }
  if (!wq) { box.append(el('div', 'board-empty', '读取中…')); return box; }
  box.append(el('div', 'comm-group', '📅 今日委托（简单，今天 0 点之前有效）'), card(wq.daily, '', o.claim));
  box.append(el('div', 'comm-group', '📋 本周委托（较难，下周一 0 点换新；没领的作废）'));
  for (const c of wq.list) box.append(card(c, TIER_NAMES[c.tier] ?? '', o.claim));
  box.append(el('div', 'comm-tip', `三个周委托全部领完有额外奖励：旧木箱 ×2 + 150 钓鱼经验（本周${wq.allClaimed ? '已领' : wq.allDone ? '可以领了' : '还没做完'}）。进度自动累计，不用交鱼；做完回这里领奖（钓具老板头顶有「！」时也是有奖励可领）。`));
  return box;
}
