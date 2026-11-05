/**
 * 钓鱼图鉴的收藏部分（客户端与服务器共用）：钓鱼册页（集齐一组领奖）、里程碑（钓到多少种）、装备图鉴记录（Saved.gd）。
 * 星露谷的"收集包"和"钓过 N 种鱼"的成就在这里的对应物；册页奖励、里程碑成就由服务器判定后发放，每项只发一次。
 */
import { FISH_TIERS, LAKE_FISH, REAL_FISH, fishDef, sizeTier, type FishLog, type Rarity } from './fishing';
import { BAITS, RODS, TACKLES } from './gear';
import { isBoxId } from './boxes';
import type { Gain } from './items';

export interface Bundle { id: string; name: string; desc: string; fish: readonly string[]; reward: { coins: number; items: Gain[] }; /** 'big' = 每档各钓过一条「特大」及以上 */ kind?: 'big' }
export const BUNDLES: readonly Bundle[] = [
  { id: 'b_spring', name: '春之册', desc: '春天更常见的鱼', fish: ['fish_bitterling', 'fish_mandarin', 'fish_sucker', 'fish_dragongate', 'fish_yellowcarp'], reward: { coins: 250, items: [{ id: 'bait_season', n: 5 }] } },
  { id: 'b_summer', name: '夏之册', desc: '夏天更常见的鱼', fish: ['fish_shrimp', 'fish_crayfish', 'fish_clam', 'fish_bass', 'fish_arowana', 'fish_gar'], reward: { coins: 250, items: [{ id: 'bait_season', n: 5 }] } },
  { id: 'b_autumn', name: '秋之册', desc: '秋天更常见的鱼', fish: ['fish_crab', 'fish_wuchang', 'fish_yellowcarp', 'fish_crayfish'], reward: { coins: 250, items: [{ id: 'bait_season', n: 5 }] } },
  { id: 'b_winter', name: '冬之册', desc: '冬天才容易遇到的鱼', fish: ['fish_icefish', 'fish_silverling', 'fish_sturgeon'], reward: { coins: 300, items: [{ id: 'bait_pro', n: 5 }] } },
  { id: 'b_night', name: '夜行册', desc: '夜里更活跃的鱼', fish: ['fish_snakehead', 'fish_catfish', 'fish_yellowcat', 'fish_ganoid', 'fish_salamander', 'fish_eel'], reward: { coins: 300, items: [{ id: 'bait_glow', n: 5 }] } },
  { id: 'b_rain', name: '听雨册', desc: '雨天更活跃的鱼', fish: ['fish_loach', 'fish_goby', 'fish_eel', 'fish_salamander'], reward: { coins: 250, items: [{ id: 'bait_pro', n: 5 }] } },
  { id: 'b_shell', name: '贝甲册', desc: '贝类和甲壳类', fish: ['fish_clam', 'fish_crab', 'fish_shrimp', 'fish_crayfish', 'fish_turtle'], reward: { coins: 300, items: [{ id: 'bait_magnet', n: 5 }] } },
  { id: 'b_big', name: '大个头册', desc: '每一档（常见 → 传说）都钓到过一条「特大」或「巨物」个头的鱼', fish: [], kind: 'big', reward: { coins: 600, items: [{ id: 'bait_wild', n: 10 }] } },
];
export const bundleDef = (id: unknown): Bundle | undefined => (typeof id === 'string' ? BUNDLES.find((b) => b.id === id) : undefined);
const BIG_TIERS: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** 一本册页的进度：have / need */
export function bundleProgress(b: Bundle, log: Record<string, FishLog>): { have: number; need: number } {
  if (b.kind === 'big') {
    const have = BIG_TIERS.filter((t) => LAKE_FISH.some((f) => f.rarity === t && log[f.id] && sizeTier(f, log[f.id].best).rank >= 2)).length;
    return { have, need: BIG_TIERS.length };
  }
  return { have: b.fish.filter((id) => log[id]).length, need: b.fish.length };
}
export const bundleDone = (b: Bundle, log: Record<string, FishLog>): boolean => { const p = bundleProgress(b, log); return p.have >= p.need; };

/** 钓到过的鱼的种类数 */
export const speciesCount = (log: Record<string, FishLog>): number => REAL_FISH.filter((f) => log[f.id]).length;
/** 湖里常规鱼（不含神话、盲盒限定）全部钓到过 */
export const lakeComplete = (log: Record<string, FishLog>): boolean => LAKE_FISH.filter((f) => f.rarity !== 'junk').every((f) => log[f.id]);
/** 里程碑：钓到多少种解锁哪个成就（最后一档 = 全部） */
export const MILESTONES: readonly { n: number; ach: string; name: string }[] = [
  { n: 10, ach: 'fish_10', name: '小有收获' }, { n: 25, ach: 'fish_25', name: '渔获颇丰' }, { n: 40, ach: 'fish_40', name: '满载而归' }, { n: REAL_FISH.length, ach: 'fish_all', name: '钓鱼大师' },
];
/** 每档的收集进度（图鉴顶部的进度条） */
export function tierProgress(log: Record<string, FishLog>): { tier: Rarity; have: number; total: number }[] {
  return FISH_TIERS.map((tier) => { const list = REAL_FISH.filter((f) => f.rarity === tier); return { tier, have: list.filter((f) => log[f.id]).length, total: list.length }; });
}

/**
 * 装备图鉴记录（Saved.gd）：拥有过的竿 / 配件（时间）、用过的饵（次数）、开过的盲盒（个数）、保底计数、已领的册页、已领的神话首奖。
 * 缺字段补默认；只保留认识的 id。
 */
export interface GearLog { rods: Record<string, number>; baits: Record<string, number>; tackles: Record<string, number>; boxes: Record<string, number>; pity: Record<string, number>; claimed: string[]; myth: string[] }
export const emptyGearLog = (): GearLog => ({ rods: {}, baits: {}, tackles: {}, boxes: {}, pity: {}, claimed: [], myth: [] });
export function cleanGearLog(raw: unknown): GearLog {
  const out = emptyGearLog();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const map = (v: unknown, ok: (id: string) => boolean, into: Record<string, number>, max: number) => {
    if (!v || typeof v !== 'object') return;
    for (const [id, n] of Object.entries(v as Record<string, unknown>)) if (ok(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) into[id] = Math.min(max, Math.floor(n));
  };
  map(r.rods, (id) => RODS.some((x) => x.id === id), out.rods, 9e15);
  map(r.baits, (id) => BAITS.some((x) => x.id === id), out.baits, 999999);
  map(r.tackles, (id) => TACKLES.some((x) => x.id === id), out.tackles, 9e15);
  map(r.boxes, isBoxId, out.boxes, 999999);
  map(r.pity, isBoxId, out.pity, 999);
  if (Array.isArray(r.claimed)) out.claimed = [...new Set(r.claimed.filter((id): id is string => typeof id === 'string' && !!bundleDef(id)))];
  if (Array.isArray(r.myth)) out.myth = [...new Set(r.myth.filter((id): id is string => typeof id === 'string' && fishDef(id)?.rarity === 'mythic'))];
  return out;
}
