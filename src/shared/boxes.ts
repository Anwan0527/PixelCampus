/**
 * 盲盒（客户端与服务器共用）：钓鱼时偶尔多钓上来一个盒子，背包里点「打开」才揭晓。
 * 不收费、不能买；掉落表和保底进度都是公开的（图鉴 / 开箱面板里列出"可能开出什么"）。
 * 打开时的随机在服务器：rollBox 是纯函数，服务器给 rnd；保底计数跟着玩家档案走。
 */
import { fishDef, rollCm } from './fishing';
import { fishPrice, EXTRA_SELL } from './economy';
import { baitDef, rodDef, tackleDef } from './gear';
import { itemDef, type Gain } from './items';

/** 一次最多连开几个盲盒（背包里点「打开」时拉条选数量） */
export const BOX_BATCH_MAX = 100;

export type BoxId = 'box_bottle' | 'box_crate' | 'box_wreck';
type Loot = { w: number; /** 珍品：保底会从这些里面出 */ gem?: boolean } & ({ coins: readonly [number, number] } | { item: string; n?: number } | { fish: string });
export interface BoxDef { id: BoxId; name: string; /** 每次钓上鱼时多钓到它的基础概率 */ rate: number; /** 连续这么多次没开出珍品，下一次必出；0 = 没有保底 */ pity: number; loot: readonly Loot[]; hint: string }

export const BOXES: readonly BoxDef[] = [
  { id: 'box_bottle', name: '漂流瓶', rate: 0.04, pity: 0, hint: '雨天更容易漂来', loot: [
    { w: 40, coins: [15, 60] }, { w: 22, item: 'bait', n: 2 }, { w: 8, item: 'bait_pro' },
    { w: 4, item: 'relic_badge' }, { w: 5, item: 'relic_card' }, { w: 5, item: 'relic_meal' },
  ] },
  { id: 'box_crate', name: '旧木箱', rate: 0.012, pity: 30, hint: '夜里更容易浮上来', loot: [
    { w: 24, coins: [50, 200] }, { w: 14, item: 'bait_pro', n: 3 }, { w: 10, item: 'bait_glow', n: 3 }, { w: 8, item: 'bait_season', n: 3 }, { w: 8, item: 'bait_wild', n: 3 }, { w: 8, item: 'bait_magnet', n: 3 },
    { w: 4, item: 'tk_float', gem: true }, { w: 4, item: 'tk_lead', gem: true }, { w: 3, item: 'tk_barb', gem: true }, { w: 2, item: 'tk_buffer', gem: true },
    { w: 4, fish: 'fish_guppy', gem: true }, { w: 4, fish: 'fish_neon', gem: true }, { w: 3, fish: 'fish_oranda', gem: true },
    { w: 3, item: 'relic_badge' }, { w: 2, item: 'relic_history' }, { w: 2, item: 'pearl' },
  ] },
  { id: 'box_wreck', name: '沉船箱', rate: 0.0025, pity: 30, hint: '暴雨的夜里最容易冲上来', loot: [
    { w: 24, coins: [400, 900] }, { w: 3, item: 'rod_twin', gem: true }, { w: 3, item: 'rod_frost', gem: true },
    { w: 8, item: 'bait_any', n: 2 }, { w: 6, item: 'bait_name', n: 2 }, { w: 5, item: 'bait_myth', gem: true }, { w: 8, item: 'dragon_scale', gem: true },
    { w: 4, item: 'tk_sonar', gem: true }, { w: 4, item: 'tk_treasure', gem: true }, { w: 3, item: 'tk_buffer', gem: true },
    { w: 5, fish: 'fish_butterfly', gem: true }, { w: 5, fish: 'fish_discus', gem: true },
    { w: 4, item: 'relic_history' }, { w: 6, item: 'pearl' },
  ] },
];
const BY_ID = new Map<string, BoxDef>(BOXES.map((b) => [b.id, b]));
export const boxDef = (id: unknown): BoxDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
export const isBoxId = (id: unknown): id is BoxId => !!boxDef(id);

/** 一次开箱的结果：币、物品（含重复的鱼竿 / 配件折成的币另算）、盲盒限定鱼（带尺寸） */
export interface BoxResult { coins: number; items: Gain[]; fish?: { id: string; cm: number }; gem: boolean }
/** 开一个盒子：pity = 这种盒子已经连续多少次没开出珍品；返回结果和新的保底计数 */
export function rollBox(rnd: () => number, id: BoxId, pity: number): { result: BoxResult; pity: number } {
  const def = BY_ID.get(id)!;
  const force = def.pity > 0 && pity + 1 >= def.pity;
  const pool = force ? def.loot.filter((l) => l.gem) : def.loot;
  let r = rnd() * pool.reduce((a, l) => a + l.w, 0), pick = pool[pool.length - 1];
  for (const l of pool) { if (r < l.w) { pick = l; break; } r -= l.w; }
  const result: BoxResult = { coins: 0, items: [], gem: !!pick.gem };
  if ('coins' in pick) result.coins = pick.coins[0] + Math.floor(rnd() * (pick.coins[1] - pick.coins[0] + 1));
  else if ('item' in pick) result.items.push({ id: pick.item, n: pick.n ?? 1 });
  else { const f = fishDef(pick.fish)!; result.fish = { id: f.id, cm: rollCm(f, rnd) }; }
  return { result, pity: def.pity > 0 ? (pick.gem ? 0 : pity + 1) : 0 };
}

/** 抛竿钓到鱼的同时，有没有多钓到一个盒子：treasure = 装备给的倍率；沉船箱先抽，再旧木箱，再漂流瓶 */
export function rollBoxDrop(rnd: () => number, env: { night: boolean; rain: boolean }, treasure = 1): BoxId | null {
  const mul = (id: BoxId) => Math.min(0.5, (BY_ID.get(id)!.rate * treasure) * (id === 'box_bottle' && env.rain ? 1.5 : id === 'box_crate' && env.night ? 1.5 : id === 'box_wreck' && env.night && env.rain ? 2 : 1));
  for (const id of ['box_wreck', 'box_crate', 'box_bottle'] as const) if (rnd() < mul(id)) return id;
  return null;
}

/** 这件东西折多少币（算盲盒期望价值用；也是"已经有这根竿了"时折成币的数额） */
export function lootValue(id: string): number {
  const b = baitDef(id); if (b) return { bait: 2, bait_pro: 6, bait_glow: 8, bait_season: 8, bait_wild: 12, bait_magnet: 12, bait_any: 150, bait_name: 100, bait_myth: 600 }[b.id] ?? 10;
  const t = tackleDef(id); if (t) return t.price;
  if (rodDef(id)) return { rod_twin: 1200, rod_frost: 1200 }[id] ?? 900;
  if (id === 'dragon_scale') return 400;
  return EXTRA_SELL[id] ?? 0;
}
/** 一个盒子的期望价值（币等值）：测试用，保证"开箱开心但不是赚钱的好办法" */
export function boxValue(id: BoxId): number {
  const d = BY_ID.get(id)!, total = d.loot.reduce((a, l) => a + l.w, 0);
  return d.loot.reduce((a, l) => a + l.w * ('coins' in l ? (l.coins[0] + l.coins[1]) / 2 : 'item' in l ? lootValue(l.item) * (l.n ?? 1) : fishPrice(fishDef(l.fish)!)), 0) / total;
}
/** 展示用：这个盒子"可能开出什么"（名字 + 概率 %） */
export function boxOdds(id: BoxId): { label: string; pct: number; gem: boolean }[] {
  const d = BY_ID.get(id)!, total = d.loot.reduce((a, l) => a + l.w, 0);
  return d.loot.map((l) => ({ label: 'coins' in l ? `${l.coins[0]}–${l.coins[1]} 校园币` : 'item' in l ? `${itemDef(l.item)?.name ?? l.item}${(l.n ?? 1) > 1 ? ` ×${l.n}` : ''}` : fishDef(l.fish)!.name, pct: Math.round((l.w / total) * 1000) / 10, gem: !!l.gem }));
}
