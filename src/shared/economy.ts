/**
 * 货币与商店（客户端与服务器共用）——设计见 docs/ECONOMY.md。
 * 货币叫「校园币」，整数，存在服务器的玩家档案里（跟着身份走）；增减全部由服务器按这里的规则执行。
 * 客户端只显示：价格表和"今日行情"都是这里的纯函数，客户端和服务器算出来一样（以服务器结算为准）。
 */
import { FISH, fishDef, type FishDef, type Rarity } from './fishing';
import { itemDef } from './items';
import { TREASURE_ID, TRASH_ONLY, trashPrice } from './trash';

/** 日期编号：东八区的"第几天"，换日以北京时间 0 点为界（和服务器 progress.dayNo 一致） */
export const marketDay = (now: number) => Math.floor((now + 8 * 3600e3) / 86400e3);
export const COIN_NAME = '校园币';
export const COIN_CAP = 9_999_999;
export const cleanCoins = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(COIN_CAP, Math.floor(v))) : 0);

// ------------------------------------------------------------ 收入：卖鱼
/** 各稀有度的基础收购价（校园币/条） */
export const FISH_BASE: Record<Rarity, number> = { common: 6, uncommon: 16, rare: 45, epic: 130, legendary: 420, junk: 1 };
/** 一条鱼的"标准收购价"：同稀有度里，个头大的物种略贵（0.85 ~ 1.15 倍） */
export function fishPrice(def: FishDef): number {
  if (def.rarity === 'junk' || def.maxKg === undefined) return FISH_BASE.junk;
  const t = Math.max(0, Math.min(1, Math.log2(1 + def.maxKg) / 7));
  return Math.max(1, Math.round(FISH_BASE[def.rarity] * (0.85 + 0.3 * t)));
}
/** 今日行情：每个物种每天一个倍率 0.85 ~ 1.25（按日期编号和物种固定，全服一致），商店里标"行情好/行情差" */
export function marketMul(day: number, id: string): number {
  let h = Math.imul(day | 0, 2654435761) ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return 0.85 + ((h >>> 0) / 4294967296) * 0.4;
}
/** 今天卖一条这个物品能得多少币；不收的东西返回 0 */
export function sellPrice(id: string, day: number): number {
  const tp = trashPrice(id); // 翻垃圾桶翻出来的东西：垃圾 1 币、U 盘 999 币，没有行情
  if (tp) return tp;
  const d = fishDef(id);
  if (!d) return 0;
  return Math.max(1, Math.round(fishPrice(d) * (d.rarity === 'junk' ? 1 : marketMul(day, id))));
}
/** 一天里在商店卖东西累计赚到这么多校园币，解锁成就「日进九百九」 */
export const DAILY_SALE_GOAL = 999;
/** 一次最多卖多少件（防一条消息处理过久；背包堆叠上限本来就是 99） */
export const SELL_MAX = 99;
/** "一键卖出"只收这些稀有度的鱼（稀有及以上舍不得，要卖请手动点） */
export const BULK_RARITIES: readonly Rarity[] = ['junk', 'common', 'uncommon'];

// ------------------------------------------------------------ 收入：任务、成就
/** 每日任务的币奖励（任务 id → 币）；做完当天全部任务另外再给 ALL_QUESTS_BONUS */
export const QUEST_COINS: Record<string, number> = {
  login: 20, online: 10, pet: 6, feed: 6, ride: 5, sit: 5, emote: 4, chat: 4, photo: 8, fish: 15, run: 15, lake: 5, library: 6,
};
export const ALL_QUESTS_BONUS = 30;
/** 成就的币奖励：默认 30，个别重量级的更多（第一次解锁时发一次） */
export const ACH_COINS_DEFAULT = 30;
export const ACH_COINS: Record<string, number> = { fish_giant: 120, fish_legend: 300, fish_master: 500, cat_bestie: 150, diligent: 100, angler: 60 };
export const achCoins = (id: string) => ACH_COINS[id] ?? ACH_COINS_DEFAULT;
/** 校园跑：跑完一次 / 刷新纪录 / 比赛拿第一 */
export const RUN_COINS = { finish: 8, record: 15, win: 20 } as const;

// ------------------------------------------------------------ 鱼竿与鱼饵（加成）
export interface RodDef { id: string; name: string; /** 拉鱼难度减去这么多（绿条更长、鱼更慢） */ ease: number; /** 咬钩等待时间倍率 */ wait: number; /** 稀有及以上的鱼权重倍率 */ luck: number }
/** 从差到好；背包里有多根时用最好的 */
export const RODS: readonly RodDef[] = [
  { id: 'fishing_rod', name: '竹节鱼竿', ease: 0, wait: 1, luck: 1 },
  { id: 'rod_carbon', name: '碳素鱼竿', ease: 0.1, wait: 0.8, luck: 1.25 },
  { id: 'rod_golden', name: '金龙鱼竿', ease: 0.2, wait: 0.62, luck: 1.6 },
];
export const bestRod = (inv: Record<string, number>): RodDef | undefined => [...RODS].reverse().find((r) => (inv[r.id] ?? 0) > 0);
/** 高级鱼饵：咬钩更快、稀有鱼更多 */
export const PRO_BAIT = { id: 'bait_pro', wait: 0.75, luck: 1.25 } as const;
/** 鱼饵从低级到高级 */
export const BAIT_IDS = ['bait', 'bait_pro'] as const;
/**
 * 钓鱼装备栏：鱼竿和鱼饵各一格，选了哪件就用哪件（背包里要有）；'' = 自动，默认用背包里**最低级**的
 * （2026-11-03：之前是"有最好的就用最好的"，香饵、金龙竿会在你不知情时被用掉）。
 */
export interface Equip { rod: string; bait: string }
export const NO_EQUIP: Equip = { rod: '', bait: '' };
export function cleanEquip(raw: unknown): Equip {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { rod: typeof r.rod === 'string' && RODS.some((x) => x.id === r.rod) ? r.rod : '', bait: typeof r.bait === 'string' && (BAIT_IDS as readonly string[]).includes(r.bait) ? r.bait : '' };
}
/** 这次抛竿用哪根竿：装备栏选的（背包里有才算）；没选/没有就用背包里最低级的 */
export const pickRod = (inv: Record<string, number>, eq?: Partial<Equip>): RodDef | undefined => RODS.find((r) => r.id === eq?.rod && (inv[r.id] ?? 0) > 0) ?? RODS.find((r) => (inv[r.id] ?? 0) > 0);
/** 这次抛竿用哪种饵（同上） */
export const pickBait = (inv: Record<string, number>, eq?: Partial<Equip>): (typeof BAIT_IDS)[number] | undefined => BAIT_IDS.find((b) => b === eq?.bait && (inv[b] ?? 0) > 0) ?? BAIT_IDS.find((b) => (inv[b] ?? 0) > 0);

// ------------------------------------------------------------ 商店：买
export interface ShopItem { id: string; /** 一次买到几个 */ n: number; /** 这一份的价格 */ price: number; note: string }
export const SHOP: readonly ShopItem[] = [
  { id: 'bait', n: 5, price: 10, note: '一份 5 个鱼饵（每天登录也会送）' },
  { id: 'bait_pro', n: 5, price: 30, note: '香饵 5 个：咬钩更快、稀有鱼更多，抛竿时优先用掉' },
  { id: 'mon_ball', n: 5, price: 15, note: '5 个零食包：战斗里用来收服野生精灵（领了初始精灵后每天登录也会补到 5 包）' },
  { id: 'cat_food', n: 5, price: 12, note: '一份 5 包猫粮（每天第一次登录补到 5 包）' },
  { id: 'cat_treat', n: 2, price: 30, note: '2 根猫条，小猫最爱，好感涨得多' },
  { id: 'cat_bed', n: 1, price: 150, note: '送给一只小猫：它有了自己的窝（只有你看得到），好感 +20' },
  { id: 'fishing_rod', n: 1, price: 40, note: '备用的竹节鱼竿' },
  { id: 'rod_carbon', n: 1, price: 420, note: '拉鱼更轻松、咬钩更快、稀有鱼更多' },
  { id: 'rod_golden', n: 1, price: 1800, note: '最好的鱼竿：拉鱼大幅放宽、咬钩最快、稀有鱼显著增多' },
];
const SHOP_BY_ID = new Map(SHOP.map((s) => [s.id, s]));
export const shopItem = (id: unknown): ShopItem | undefined => (typeof id === 'string' ? SHOP_BY_ID.get(id) : undefined);
/** 猫窝送给一只猫时涨的好感 */
export const CAT_BED_GAIN = 20;

/** 该件东西在背包里能不能卖（收鱼、杂物，和翻垃圾桶翻出来的东西） */
export const sellable = (id: string): boolean => !!fishDef(id) || trashPrice(id) > 0;
/** 一键卖出收的东西：杂物、常见、少见的鱼，和翻出来的垃圾（U 盘舍不得，要卖手动点） */
export const bulkSellable = (id: string): boolean => { const d = fishDef(id); return d ? BULK_RARITIES.includes(d.rarity) : TRASH_ONLY.includes(id); };
export function sellList(inv: Record<string, number>, day: number): { id: string; name: string; n: number; price: number; rarity: Rarity }[] {
  const out: { id: string; name: string; n: number; price: number; rarity: Rarity }[] = FISH.filter((f) => (inv[f.id] ?? 0) > 0).map((f) => ({ id: f.id, name: f.name, n: inv[f.id], price: sellPrice(f.id, day), rarity: f.rarity }));
  for (const id of [...TRASH_ONLY, TREASURE_ID]) if ((inv[id] ?? 0) > 0) out.push({ id, name: itemDef(id)?.name ?? id, n: inv[id], price: sellPrice(id, day), rarity: id === TREASURE_ID ? 'rare' : 'junk' });
  return out;
}
/** 校验用：商店里的商品必须是真实物品 */
export const shopItemsValid = () => SHOP.every((s) => !!itemDef(s.id) && s.n >= 1 && s.price >= 1);
