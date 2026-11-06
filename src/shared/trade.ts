/**
 * 玩家交易（客户端与服务器共用）：面对面的"双方摆出东西 → 各自确认 → 一起成交"。
 * 规则在服务器执行（server/trade.ts）：双方都得在线、站得近；摆出去的东西必须真的有；任何一方改了报价，双方的确认都作废；
 * 成交是原子的（要么全换，要么一件不动）；成交不收税、不改价。设计见 docs/ECONOMY.md「玩家交易」。
 */
import { isStarter } from './decor';
import { itemDef, type Gain } from './items';

/** 发起交易时，双方最多隔多远（像素）；成交那一刻放宽一点，免得有人晃了一步就失败 */
export const TRADE_REACH = 160;
export const TRADE_SETTLE_REACH = 260;
/** 邀请的有效时间、一场交易最长多久（毫秒） */
export const TRADE_INVITE_TTL_MS = 30 * 1000;
export const TRADE_TTL_MS = 5 * 60 * 1000;
/** 一次最多摆几种东西、最多摆多少校园币 */
export const TRADE_MAX_ITEMS = 8;
export const TRADE_COIN_MAX = 9999;

export interface TradeOffer { items: Gain[]; coins: number }
/** 一方的报价 + 确认状态（给界面显示） */
export interface TradeSide extends TradeOffer { ready: boolean }

/** 钓鱼 2.0：这些东西不能交易（防倒卖和"代开箱"）：特殊鱼竿、龙骨竿、万能饵、神话饵、龙鳞（盲盒和配件按种类判断，见 tradable） */
export const UNTRADABLE: ReadonlySet<string> = new Set(['rod_glow', 'rod_rain', 'rod_frost', 'rod_pickup', 'rod_twin', 'rod_bone', 'bait_any', 'bait_myth', 'dragon_scale']);
/** 钥匙类的东西（爱猫徽章这类"证明"）、盲盒、配件、上面那几样不能交易；其余的背包物品（含饵和鱼）都可以 */
export const tradable = (id: string): boolean => { const d = itemDef(id); return !!d && d.kind !== 'key' && d.kind !== 'box' && d.kind !== 'tackle' && !UNTRADABLE.has(id) && !isStarter(id); }; // 固有家具（床、衣柜…）每人一份，不能交易

/** 清洗网络来的报价：只留可交易的、数量 1..堆叠上限、种类不重复、不超过 TRADE_MAX_ITEMS；校园币 0..TRADE_COIN_MAX */
export function cleanOffer(raw: unknown): TradeOffer {
  const out: TradeOffer = { items: [], coins: 0 };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { items?: unknown; coins?: unknown };
  if (typeof r.coins === 'number' && Number.isFinite(r.coins)) out.coins = Math.max(0, Math.min(TRADE_COIN_MAX, Math.floor(r.coins)));
  if (Array.isArray(r.items)) {
    const seen = new Set<string>();
    for (const g of r.items) {
      if (out.items.length >= TRADE_MAX_ITEMS) break;
      const id = (g as Gain)?.id, n = (g as Gain)?.n;
      if (typeof id !== 'string' || seen.has(id) || !tradable(id) || typeof n !== 'number' || !Number.isFinite(n)) continue;
      const d = itemDef(id)!, k = Math.min(d.stack, Math.floor(n));
      if (k >= 1) { seen.add(id); out.items.push({ id, n: k }); }
    }
  }
  return out;
}
export const offerEmpty = (o: TradeOffer) => o.coins <= 0 && o.items.length === 0;
