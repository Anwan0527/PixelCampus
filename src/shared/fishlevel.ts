/**
 * 钓鱼等级与经验（客户端与服务器共用）——设计见 docs/FISHING_V3_PLAN.md §2。
 * 经验由服务器在「钓到鱼」时结算：按稀有度给基础经验，完美拉鱼 +50%，第一次钓到某种鱼额外加；
 * 每天靠钓鱼拿的基础经验有软上限（前 XP_SOFT_CAP 点全额，超出只算 XP_OVER_RATE），防止狂钓一天就满级。
 * 等级 1–30，曲线系数 LEVEL_SCALE（上线后看分布只改这里）。
 */
import type { FishDef, FishLog, Rarity } from './fishing';
import { REAL_FISH } from './fishing';
import type { Gain } from './items';

export const MAX_LEVEL = 30;
export const LEVEL_SCALE = 80;
/** 每个稀有度「钓到一条」的基础经验（杂物 0） */
export const XP_BASE: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 5, epic: 12, legendary: 30, mythic: 100, junk: 0 };
/** 每日软上限：当天靠钓鱼拿的基础经验前 600 点全额，超出的部分只算 40% */
export const XP_SOFT_CAP = 600;
export const XP_OVER_RATE = 0.4;

/** 到 L 级所需的累计经验：80 × (L−1)^2.1，取整到 50 */
export const cumXp = (lv: number): number => (lv <= 1 ? 0 : Math.round((LEVEL_SCALE * (Math.min(lv, MAX_LEVEL) - 1) ** 2.1) / 50) * 50);
export interface LevelInfo { lv: number; xp: number; /** 本级已有 */ into: number; /** 本级需要（满级 0） */ need: number; /** 0..1 */ frac: number }
export function levelOf(xp: number): LevelInfo {
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let lv = 1;
  while (lv < MAX_LEVEL && x >= cumXp(lv + 1)) lv++;
  if (lv >= MAX_LEVEL) return { lv, xp: x, into: x - cumXp(lv), need: 0, frac: 1 };
  const base = cumXp(lv), need = cumXp(lv + 1) - base;
  return { lv, xp: x, into: x - base, need, frac: (x - base) / need };
}

/** 第一次钓到这种鱼的额外经验：max(5, 基础 × 2)，神话 +200 */
export const newSpeciesXp = (def: FishDef): number => (def.rarity === 'junk' ? 0 : def.rarity === 'mythic' ? 200 : Math.max(5, XP_BASE[def.rarity] * 2));
/** 钓到一条的经验：base 受软上限；bonus（新种类）不受 */
export function catchXp(def: FishDef, o: { perfect?: boolean; isNew?: boolean; n?: number } = {}): { base: number; perfect: number; isNew: number; capped: number } {
  const b = XP_BASE[def.rarity], n = o.n && o.n > 0 ? o.n : 1;
  if (b <= 0) return { base: 0, perfect: 0, isNew: 0, capped: 0 };
  const perfect = o.perfect ? Math.max(1, Math.floor(b * 0.5)) : 0;
  return { base: b * n, perfect: perfect * n, isNew: o.isNew ? newSpeciesXp(def) : 0, capped: b * n + perfect * n };
}
/**
 * 软上限：todayRaw = 今天已经算过的（未打折的）基础经验，gain = 这次要加的；返回实际给多少和新的 todayRaw。
 * 超出的部分按累计取整（floor(超出总量 × 0.4) 的差），所以零头会累积，不会"常见鱼超过上限就永远 0"。
 */
export function applySoftCap(todayRaw: number, gain: number): { granted: number; raw: number } {
  const t = Math.max(0, Math.floor(todayRaw)), g = Math.max(0, Math.floor(gain)), after = t + g;
  const overBefore = Math.max(0, t - XP_SOFT_CAP), overAfter = Math.max(0, after - XP_SOFT_CAP);
  const full = g - (overAfter - overBefore);
  return { granted: full + (Math.floor(overAfter * XP_OVER_RATE) - Math.floor(overBefore * XP_OVER_RATE)), raw: after };
}

// ------------------------------------------------------------ 升级奖励
/** 每级：币 20 × 级（最多 400）+ 饵（6 级以前普通鱼饵 ×5，之后香饵 ×3）；关键级另有成就 + 称号 */
export function levelReward(lv: number): { coins: number; items: Gain[]; ach?: string } {
  const coins = Math.min(400, 20 * lv), items: Gain[] = lv <= 5 ? [{ id: 'bait', n: 5 }] : [{ id: 'bait_pro', n: 3 }];
  return { coins, items, ...(LEVEL_ACH[lv] ? { ach: LEVEL_ACH[lv] } : {}) };
}
export const LEVEL_ACH: Record<number, string> = { 5: 'fishlv_5', 10: 'fishlv_10', 15: 'fishlv_15', 20: 'fishlv_20', 25: 'fishlv_25', 30: 'fishlv_30' };
/** 拉鱼绿条的等级加成（累计，最多 +5%） */
export const barBonus = (lv: number): number => (lv >= 22 ? 0.05 : lv >= 14 ? 0.04 : lv >= 8 ? 0.03 : lv >= 4 ? 0.02 : 0);

// ------------------------------------------------------------ 路线（5 级、10 级各一个槽，随时免费切换）
export type Route = 'fisher' | 'finder' | '';
export const ROUTES: readonly Exclude<Route, ''>[] = ['fisher', 'finder'];
export const ROUTE_NAMES: Record<Route, string> = { fisher: '渔夫（卖鱼价 +10%）', finder: '寻宝（盲盒概率 ×1.3）', '': '还没选' };
/** 当前等级有几个路线槽 */
export const routeSlots = (lv: number): number => (lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
export const SELL_BONUS_MAX = 0.2;
export function routeBonus(rt: readonly Route[], lv: number): { sell: number; treasure: number } {
  const on = rt.slice(0, routeSlots(lv));
  return { sell: Math.min(SELL_BONUS_MAX, 0.1 * on.filter((r) => r === 'fisher').length), treasure: 1 + 0.3 * on.filter((r) => r === 'finder').length };
}

// ------------------------------------------------------------ 配方等级门槛
export const RECIPE_LEVEL: Record<string, number> = { junk_bait: 1, small_bait: 2, named_bait: 5, pro_bait: 7, myth_bait: 10, bone_rod: 12, glow_bait: 13 };

// ------------------------------------------------------------ 档案
/** 档案里的钓鱼等级数据：xp 总经验、rt 两个路线槽、rel 放生次数、wk 周委托全勤周数、xd 今天已算过的基础经验（软上限用） */
export interface FishFx { xp: number; rt: [Route, Route]; rel: number; wk: number; xd?: { day: number; n: number } }
export const emptyFx = (): FishFx => ({ xp: 0, rt: ['', ''], rel: 0, wk: 0 });
const isRoute = (r: unknown): r is Route => r === 'fisher' || r === 'finder' || r === '';
export function cleanFx(raw: unknown): FishFx | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>, num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);
  const rt = Array.isArray(r.rt) ? r.rt : [], out: FishFx = { xp: num(r.xp, 99_999_999), rt: [isRoute(rt[0]) ? rt[0] : '', isRoute(rt[1]) ? rt[1] : ''], rel: num(r.rel, 999999), wk: num(r.wk, 9999) };
  const xd = r.xd as Record<string, unknown> | undefined;
  if (xd && typeof xd === 'object' && num(xd.day, 1e7) > 0) out.xd = { day: num(xd.day, 1e7), n: num(xd.n, 1e7) };
  return out;
}

/** 老玩家第一次登录：按图鉴记录折算初始经验（每条鱼的基础经验 + 完美次数 + 每个已有种类的新种类奖励） */
export function retroXp(log: Record<string, FishLog>): number {
  let xp = 0;
  for (const def of REAL_FISH) {
    const rec = log[def.id]; if (!rec) continue;
    const b = XP_BASE[def.rarity];
    xp += b * rec.n + (rec.perfect ?? 0) * Math.max(1, Math.floor(b * 0.5)) + newSpeciesXp(def);
  }
  return xp;
}
