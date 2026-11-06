import { ITEMS } from '../../src/shared/items';
import { tradable } from '../../src/shared/trade';

/** 手册里「哪些钓鱼物品不能交易」的一句话（从交易规则里取，不手写） */
export const TRADE_BLOCKED_NOTE = ITEMS.filter((i) => !tradable(i.id) && i.kind !== 'key').map((i) => i.name).join('、');
