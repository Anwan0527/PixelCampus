/**
 * 钓鱼（客户端与服务器共用）：鱼的目录、咬钩时间、按稀有度和昼夜抽鱼、尺寸。
 * 抛竿、等待、咬钩、收竿的判定全部在服务器（客户端只显示和上报"我收竿了"），鱼的种类和尺寸也由服务器抽。
 *
 * 新增鱼：在 FISH 里加一项，并在 items.ts 里加同名物品、tools/art/items.ts 里画图标（tests 会检查三者一致）。
 */
import type { Season } from './season';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'junk';
export type FishMove = 'smooth' | 'mixed' | 'dart';
export interface FishDef {
  /** 物品 id（= 背包里的物品） */
  id: string; name: string; rarity: Rarity;
  /** 抽中的相对权重；下面几个是条件倍率（夜里 / 下雨天 / 各季节），没写 = 1，写 0 = 这个条件下钓不到 */
  weight: number; night?: number; rain?: number; seasons?: Partial<Record<Season, number>>;
  /** 尺寸范围（厘米，整数）和最大个体的重量（公斤）；杂物没有 */
  minCm?: number; maxCm?: number; maxKg?: number;
  /** 拉鱼小游戏里鱼的游法：smooth 慢悠悠 / mixed 时快时慢 / dart 突然窜动 */
  move?: FishMove;
}

export const FISH: readonly FishDef[] = [
  // 常见
  { id: 'fish_crucian', name: '鲫鱼', rarity: 'common', weight: 30, minCm: 12, maxCm: 28, maxKg: 0.6, move: 'smooth' },
  { id: 'fish_carp', name: '鲤鱼', rarity: 'common', weight: 22, minCm: 25, maxCm: 60, maxKg: 5, move: 'mixed' },
  { id: 'fish_grass', name: '草鱼', rarity: 'common', weight: 16, minCm: 30, maxCm: 80, maxKg: 8, move: 'mixed' },
  { id: 'fish_gudgeon', name: '麦穗鱼', rarity: 'common', weight: 18, minCm: 5, maxCm: 12, maxKg: 0.03, move: 'dart' },
  { id: 'fish_loach', name: '泥鳅', rarity: 'common', weight: 14, rain: 1.8, minCm: 10, maxCm: 25, maxKg: 0.15, move: 'dart' },
  { id: 'fish_shrimp', name: '河虾', rarity: 'common', weight: 14, seasons: { summer: 1.6, winter: 0.4 }, minCm: 4, maxCm: 9, maxKg: 0.02, move: 'dart' },
  // 少见
  { id: 'fish_bream', name: '鳊鱼', rarity: 'uncommon', weight: 10, minCm: 20, maxCm: 40, maxKg: 1.2, move: 'smooth' },
  { id: 'fish_snakehead', name: '黑鱼', rarity: 'uncommon', weight: 8, night: 1.6, minCm: 30, maxCm: 65, maxKg: 4, move: 'mixed' },
  { id: 'fish_catfish', name: '鲶鱼', rarity: 'uncommon', weight: 7, night: 1.6, minCm: 25, maxCm: 70, maxKg: 6, move: 'mixed' },
  { id: 'fish_silver', name: '鲢鱼', rarity: 'uncommon', weight: 7, minCm: 35, maxCm: 90, maxKg: 9, move: 'smooth' },
  { id: 'fish_bighead', name: '鳙鱼', rarity: 'uncommon', weight: 6, minCm: 40, maxCm: 95, maxKg: 12, move: 'smooth' },
  { id: 'fish_crayfish', name: '小龙虾', rarity: 'uncommon', weight: 6, seasons: { summer: 2.2, autumn: 1.2, winter: 0.2 }, minCm: 8, maxCm: 14, maxKg: 0.06, move: 'dart' },
  // 稀有
  { id: 'fish_goldfish', name: '金鱼', rarity: 'rare', weight: 4, minCm: 8, maxCm: 20, maxKg: 0.2, move: 'smooth' },
  { id: 'fish_koi', name: '锦鲤', rarity: 'rare', weight: 3, night: 0.6, minCm: 40, maxCm: 90, maxKg: 7, move: 'mixed' },
  { id: 'fish_culter', name: '翘嘴鲌', rarity: 'rare', weight: 2.6, minCm: 40, maxCm: 90, maxKg: 5, move: 'dart' },
  { id: 'fish_mandarin', name: '鳜鱼', rarity: 'rare', weight: 2.4, seasons: { spring: 1.5 }, minCm: 25, maxCm: 55, maxKg: 3.5, move: 'mixed' },
  { id: 'fish_turtle', name: '中华鳖', rarity: 'rare', weight: 2, night: 1.5, seasons: { winter: 0.3 }, minCm: 15, maxCm: 35, maxKg: 3, move: 'smooth' },
  { id: 'fish_eel', name: '黄鳝', rarity: 'rare', weight: 2.2, night: 1.5, rain: 1.6, minCm: 40, maxCm: 90, maxKg: 1.5, move: 'dart' },
  // 史诗
  { id: 'fish_blackcarp', name: '青鱼', rarity: 'epic', weight: 0.9, minCm: 80, maxCm: 150, maxKg: 40, move: 'mixed' },
  { id: 'fish_salamander', name: '娃娃鱼', rarity: 'epic', weight: 0.7, night: 2, rain: 2, minCm: 60, maxCm: 120, maxKg: 25, move: 'mixed' },
  { id: 'fish_arowana', name: '银龙鱼', rarity: 'epic', weight: 0.7, seasons: { summer: 1.5 }, minCm: 50, maxCm: 90, maxKg: 4.5, move: 'dart' },
  { id: 'fish_sturgeon', name: '鲟鱼', rarity: 'epic', weight: 0.6, seasons: { winter: 1.6 }, minCm: 90, maxCm: 200, maxKg: 80, move: 'smooth' },
  // 传说
  { id: 'fish_goldkoi', name: '黄金锦鲤', rarity: 'legendary', weight: 0.14, night: 0.2, minCm: 60, maxCm: 110, maxKg: 15, move: 'mixed' },
  { id: 'fish_icefish', name: '冰湖银鱼王', rarity: 'legendary', weight: 0.12, seasons: { spring: 0, summer: 0, autumn: 0, winter: 5 }, minCm: 30, maxCm: 45, maxKg: 0.5, move: 'dart' },
  { id: 'fish_lakedragon', name: '精工湖神龙', rarity: 'legendary', weight: 0.08, night: 2.5, rain: 3, minCm: 150, maxCm: 300, maxKg: 120, move: 'dart' },
  // 杂物
  { id: 'junk_boot', name: '旧球鞋', rarity: 'junk', weight: 5 },
  { id: 'junk_weed', name: '水草', rarity: 'junk', weight: 5 },
  { id: 'junk_can', name: '空易拉罐', rarity: 'junk', weight: 3 },
  { id: 'junk_bottle', name: '空饮料瓶', rarity: 'junk', weight: 3 },
];
const BY_ID = new Map(FISH.map((f) => [f.id, f]));
export const fishDef = (id: unknown): FishDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
/** 真正的鱼（不含杂物）：图鉴的分母 */
export const REAL_FISH = FISH.filter((f) => f.rarity !== 'junk');
export const isFish = (id: unknown): boolean => { const d = fishDef(id); return !!d && d.rarity !== 'junk'; };
export const RARITY_NAMES: Record<Rarity, string> = { common: '常见', uncommon: '少见', rare: '稀有', epic: '史诗', legendary: '传说', junk: '杂物' };
/** 稀有度的显示颜色（图鉴、钓到时的卡片） */
export const RARITY_COLORS: Record<Rarity, string> = { common: '#8a8a7a', uncommon: '#3f9a58', rare: '#3b6ea8', epic: '#8a5aa8', legendary: '#e0a020', junk: '#7a6a5a' };
/** 稀有度从低到高的顺序（图鉴分组用） */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** 拿鱼喂猫：好感度增量（按稀有度） */
export const FISH_FEED_GAIN: Record<Exclude<Rarity, 'junk'>, number> = { common: 5, uncommon: 8, rare: 14, epic: 20, legendary: 30 };

/** 这种鱼什么时候容易遇到（图鉴里解锁后显示）：夜里/雨天/季节 */
export function habitatText(def: FishDef): string {
  const names: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const out: string[] = [];
  if ((def.night ?? 1) > 1) out.push('夜里更容易遇到'); else if ((def.night ?? 1) < 1) out.push('白天更容易遇到');
  if ((def.rain ?? 1) > 1) out.push('雨天更容易遇到');
  const se = def.seasons;
  if (se) {
    const all: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const on = all.filter((k) => (se[k] ?? 1) > 0);
    if (on.length === 1) out.push(`只在${names[on[0]]}天出现`);
    else {
      const more = all.filter((k) => (se[k] ?? 1) > 1), less = all.filter((k) => (se[k] ?? 1) < 1);
      if (more.length) out.push(`${more.map((k) => names[k]).join('、')}天更多`);
      if (less.length) out.push(`${less.map((k) => names[k]).join('、')}天少见`);
    }
  }
  return out.length ? out.join('；') : '什么时候都可能遇到';
}

/** 个头档位：按在这个种类的尺寸范围里的位置分——迷你 / (普通不显示) / 较大 / 特大 / 巨物 */
export function sizeTier(def: FishDef, cm: number): { name: string; rank: number } {
  if (def.minCm === undefined || def.maxCm === undefined || def.maxCm <= def.minCm) return { name: '', rank: 0 };
  const t = (cm - def.minCm) / (def.maxCm - def.minCm);
  return t < 0.1 ? { name: '迷你', rank: -1 } : t < 0.55 ? { name: '', rank: 0 } : t < 0.8 ? { name: '较大', rank: 1 } : t < 0.95 ? { name: '特大', rank: 2 } : { name: '巨物', rank: 3 };
}
/** 重量（公斤）：体积随长度的三次方，再加 ±10% 的随机胖瘦；保留两位小数 */
export function weightKg(def: FishDef, cm: number, rnd: () => number): number {
  if (!def.maxKg || !def.maxCm) return 0;
  const kg = def.maxKg * (cm / def.maxCm) ** 3 * (0.9 + rnd() * 0.2);
  return Math.max(0.01, Math.round(kg * 100) / 100);
}
/** 重量的显示：不到 1 公斤用克 */
export const fmtKg = (kg: number): string => (kg <= 0 ? '' : kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(kg < 10 ? 2 : 1).replace(/\.?0+$/, '')} kg`);
/** 拉鱼"完美"（鱼几乎一直在绿条里）的奖励：尺寸向上限靠近 30% */
export const perfectCm = (def: FishDef, cm: number): number => (def.maxCm === undefined ? cm : Math.round(cm + (def.maxCm - cm) * 0.3));

/** 钓鱼的时间参数（毫秒） */
export const FISHING = {
  /** 抛竿后多久咬钩：在这个范围内随机 */
  BITE_MIN_MS: 2500, BITE_MAX_MS: 8000,
  /** 咬钩后留给玩家收竿的时间（含网络延迟余量）；客户端提示窗口比它短一点 */
  REEL_WINDOW_MS: 2200,
  /** 太早收竿（还没咬钩）的冷却，防止连点 */
  COOLDOWN_MS: 900,
  /** 抛竿时玩家面前多远（像素）必须是水面；站得离水边太远不能抛 */
  CAST_MIN: 20, CAST_MAX: 64,
  /** 抛竿等待超过这个时间自动收线 */
  IDLE_MAX_MS: 45000,
} as const;

/** 抽鱼时的环境：夜里 / 下雨 / 季节会改变各种鱼出现的概率 */
/** luck = 鱼竿/鱼饵的好运倍率：稀有 ×luck，史诗/传说 ×luck^1.5（1 = 不变） */
export interface FishEnv { night: boolean; rain?: boolean; season?: Season; luck?: number }
/** 抽一条鱼（还没拉上来，只决定是什么、多大）。rnd 返回 [0,1)；尺寸偏小的更常见（取两个随机数里较小的） */
export function rollFish(rnd: () => number, env: FishEnv): { def: FishDef; cm: number } {
  const luck = env.luck ?? 1, lk = (f: FishDef) => (f.rarity === 'rare' ? luck : f.rarity === 'epic' || f.rarity === 'legendary' ? luck ** 1.5 : 1);
  const w = FISH.map((f) => f.weight * lk(f) * (env.night ? f.night ?? 1 : 1) * (env.rain ? f.rain ?? 1 : 1) * (env.season ? f.seasons?.[env.season] ?? 1 : 1));
  let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
  for (; i < FISH.length - 1; i++) { if (r < w[i]) break; r -= w[i]; }
  const def = FISH[i];
  if (def.minCm === undefined || def.maxCm === undefined) return { def, cm: 0 };
  const t = Math.min(rnd(), rnd());
  return { def, cm: Math.round(def.minCm + (def.maxCm - def.minCm) * t) };
}

/** 图鉴记录：鱼 id → { n 钓到几条, best 最大尺寸（厘米）, kg 最重的一条（公斤） }；从磁盘来的数据只保留认识的真鱼 */
export interface FishLog { n: number; best: number; kg: number }
export function cleanFishLog(raw: unknown): Record<string, FishLog> {
  const out: Record<string, FishLog> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFish(id) || !v || typeof v !== 'object') continue;
    const { n, best, kg } = v as Record<string, unknown>;
    const num = (x: unknown, max: number, round: (v: number) => number) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.min(max, round(x)) : 0);
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[id] = { n: Math.min(99999, Math.floor(n)), best: num(best, 999, Math.floor), kg: num(kg, 999, (v) => Math.round(v * 100) / 100) };
  }
  return out;
}

/** 能不能在 (x,y) 面朝 dir 抛竿：面前 CAST_MIN..CAST_MAX 像素之间必须有水，而且脚下不是水 */
export type WaterAt = (px: number, py: number) => boolean;
export const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] } as const;
export function castTarget(isWater: WaterAt, x: number, y: number, facing: keyof typeof DIRS): { x: number; y: number } | null {
  const [dx, dy] = DIRS[facing];
  // 以胸口的高度为基准（脚点往上 8 像素），免得被"脚底盒"和水面的边缘判定带偏
  const bx = x, by = y - 8;
  if (isWater(bx, by)) return null;
  for (let d = FISHING.CAST_MIN; d <= FISHING.CAST_MAX; d += 4) if (isWater(bx + dx * d, by + dy * d)) return { x: bx + dx * (d + 12), y: by + dy * (d + 12) };
  return null;
}
