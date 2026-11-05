/**
 * 钓具老板的委托（客户端与服务器共用）——设计见 docs/FISHING_V3_PLAN.md §3。
 *  - 每周 3 个（中等 / 困难 / 极难）：周一 0 点（东八区）换，全服一致；以「条件型」为主（特定时间 / 天气 / 季节 / 饵 / 个头 / 稀有度），光堆数量做不完；
 *  - 每天 1 个（简单）：0 点换，全服一致，不含雨天类（别被天气卡住）。
 * 进度全部由服务器在「钓到 / 开盲盒」事件里累计（commDelta），自动计数、不用交鱼；做完回钓具摊领取。
 * 全部是纯函数：同一个周 / 日永远抽出一样的委托；数值都在这个文件里，上线后看真实情况再调。
 */
import { FISH_TIERS, LAKE_FISH, RARITY_NAMES, fishDef, fishWeight, type FishDef, type Rarity } from './fishing';
import { BOXES } from './boxes';
import type { Gain } from './items';
import { itemDef } from './items';
import type { Season } from './season';
import { SEASONS } from './season';

export type CommTier = 'daily' | 'mid' | 'hard' | 'extreme';
export const TIER_NAMES: Record<CommTier, string> = { daily: '今日', mid: '中等', hard: '困难', extreme: '极难' };
/** 条件：没写的不限；全部满足才计数 */
export interface CommFilter {
  night?: boolean; rain?: boolean; season?: Season; minRarity?: Rarity;
  /** 用的饵是这些之一 */ baits?: readonly string[];
  perfect?: boolean; fish?: string;
  /** 个头达到该种鱼尺寸范围的这个比例以上（0.8 = 「特大」，0.95 = 「巨物」） */ minPct?: number;
  /** 本周 / 今天不同的种类数 */ distinct?: boolean;
  /** 开盲盒：open = 开了就算，gem = 开出珍品才算 */ box?: 'open' | 'gem';
}
export interface CommReward { coins: number; items: Gain[]; xp: number }
export interface Commission { id: CommTier; tier: CommTier; name: string; desc: string; goal: number; f: CommFilter; reward: CommReward }

/** 钓到 / 开盒事件（服务器在对应动作成功后构造） */
export type CommEvent =
  | { t: 'catch'; def: FishDef; cm: number; perfect: boolean; night: boolean; rain: boolean; season: Season; bait: string; n: number }
  | { t: 'box'; gem: boolean };

const rIdx = (r: Rarity) => FISH_TIERS.indexOf(r);
/** 这次事件让这个委托的进度增加多少（distinct 类的要把鱼 id 记进 seen，由调用方负责 push） */
export function commDelta(c: Commission, ev: CommEvent, seen: readonly string[] = []): number {
  const f = c.f;
  if (ev.t === 'box') return f.box === 'open' ? 1 : f.box === 'gem' && ev.gem ? 1 : 0;
  if (f.box || ev.def.rarity === 'junk') return 0;
  const d = ev.def;
  if (f.night !== undefined && f.night !== ev.night) return 0;
  if (f.rain !== undefined && f.rain !== ev.rain) return 0;
  if (f.season && f.season !== ev.season) return 0;
  if (f.minRarity && rIdx(d.rarity) < rIdx(f.minRarity)) return 0;
  if (f.baits && !f.baits.includes(ev.bait)) return 0;
  if (f.perfect && !ev.perfect) return 0;
  if (f.fish && d.id !== f.fish) return 0;
  if (f.minPct !== undefined && (d.minCm === undefined || d.maxCm === undefined || ev.cm < d.minCm + (d.maxCm - d.minCm) * f.minPct)) return 0;
  if (f.distinct) return seen.includes(d.id) ? 0 : 1;
  return f.perfect || f.minPct !== undefined ? 1 : ev.n;
}

// ------------------------------------------------------------ 描述
const SEASON_ZH: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export function describe(f: CommFilter, goal: number, scope: 'week' | 'day'): string {
  if (f.box === 'open') return `开 ${goal} 个盲盒`;
  if (f.box === 'gem') return `开出 ${goal} 个盲盒里的珍品（保底也算）`;
  if (f.distinct) return `${scope === 'week' ? '本周' : '今天'}钓到 ${goal} 种不同的鱼`;
  const cond = [f.season ? `${SEASON_ZH[f.season]}天` : '', f.night === true ? '夜里' : f.night === false ? '白天' : '', f.rain ? '下雨时' : ''].filter(Boolean).join('');
  const what = f.fish ? (fishDef(f.fish)?.name ?? '鱼') : f.minRarity && f.minRarity !== 'common' ? `${RARITY_NAMES[f.minRarity]}及以上的鱼` : '鱼';
  const how = [f.baits ? `用${f.baits.map((b) => itemDef(b)?.name ?? b).join('或')}` : '', f.minPct !== undefined ? `个头达到 ${Math.round(f.minPct * 100)}% 以上（${f.minPct >= 0.95 ? '巨物' : '特大'}）` : ''].filter(Boolean).join('，');
  if (f.perfect) return `${cond}完美拉鱼 ${goal} 次${what !== '鱼' ? `（${what}）` : ''}`;
  return `${cond}${how ? `${how}，` : ''}钓到 ${goal} ${f.minPct !== undefined || f.fish ? '条' : '条'}${what}`;
}

// ------------------------------------------------------------ 周编号
/** 日期编号（东八区，见 economy.marketDay）→ 周编号：周一 0 点换周（1970-01-01 是周四，所以 +3） */
export const weekNo = (day: number): number => Math.floor((day + 3) / 7);

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => { let t = (s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const range = (rnd: () => number, a: number, b: number, step = 10) => a + Math.floor((rnd() * (b - a)) / step + 1e-9) * step;

const SPECIAL_BAITS = ['bait_glow', 'bait_season', 'bait_wild', 'bait_magnet'] as const;
const TACKLE_IDS = ['tk_float', 'tk_lead', 'tk_barb', 'tk_buffer', 'tk_sonar', 'tk_treasure'] as const;
const commonish = LAKE_FISH.filter((f) => f.rarity === 'common' || f.rarity === 'uncommon');
const rareLake = LAKE_FISH.filter((f) => f.rarity === 'rare');

interface Tpl { kind: string; name: string; goal: number; f: (rnd: () => number) => CommFilter }
const season = (rnd: () => number) => pick(rnd, SEASONS);
const MID: Tpl[] = [
  { kind: 'night', name: '夜钓', goal: 40, f: () => ({ night: true }) },
  { kind: 'rain', name: '雨钓', goal: 25, f: () => ({ rain: true }) },
  { kind: 'season', name: '时令', goal: 40, f: (r) => ({ season: season(r) }) },
  { kind: 'species', name: '图鉴', goal: 14, f: () => ({ distinct: true }) },
  { kind: 'perfect', name: '稳手', goal: 10, f: () => ({ perfect: true }) },
  { kind: 'rare', name: '稀客', goal: 6, f: () => ({ minRarity: 'rare' }) },
  { kind: 'box', name: '开箱', goal: 5, f: () => ({ box: 'open' }) },
  { kind: 'bait', name: '特饵', goal: 12, f: () => ({ baits: SPECIAL_BAITS, minRarity: 'uncommon' }) },
  { kind: 'size', name: '大个头', goal: 1, f: () => ({ minPct: 0.85, minRarity: 'uncommon' }) },
];
const HARD: Tpl[] = [
  { kind: 'night', name: '夜钓老手', goal: 45, f: () => ({ night: true, minRarity: 'uncommon' }) },
  { kind: 'rain', name: '雨钓老手', goal: 45, f: () => ({ rain: true, minRarity: 'uncommon' }) },
  { kind: 'season', name: '时令老手', goal: 45, f: (r) => ({ season: season(r), minRarity: 'uncommon' }) },
  { kind: 'species', name: '图鉴', goal: 26, f: () => ({ distinct: true }) },
  { kind: 'perfect', name: '稳手', goal: 40, f: () => ({ perfect: true }) },
  { kind: 'rare', name: '稀客', goal: 20, f: () => ({ minRarity: 'rare' }) },
  { kind: 'box', name: '开箱', goal: 12, f: () => ({ box: 'open' }) },
  { kind: 'combo', name: '冬夜', goal: 100, f: () => ({ season: 'winter', night: true }) },
  { kind: 'size', name: '大个头', goal: 1, f: () => ({ minPct: 0.95, minRarity: 'uncommon' }) },
  { kind: 'named', name: '指名', goal: 6, f: (r) => ({ baits: ['bait_name'], fish: pick(r, rareLake).id }) },
];
const EXTREME: Tpl[] = [
  { kind: 'perfect', name: '稳手', goal: 20, f: () => ({ perfect: true, minRarity: 'rare' }) },
  { kind: 'epic', name: '史诗', goal: 14, f: () => ({ minRarity: 'epic' }) },
  { kind: 'combo', name: '雨夜', goal: 50, f: () => ({ rain: true, night: true, minRarity: 'rare' }) },
  { kind: 'species', name: '图鉴', goal: 34, f: () => ({ distinct: true }) },
  { kind: 'gem', name: '开珍品', goal: 2, f: () => ({ box: 'gem' }) },
  { kind: 'size', name: '大个头', goal: 3, f: () => ({ minPct: 0.8, minRarity: 'rare' }) },
  { kind: 'season', name: '时令', goal: 45, f: (r) => ({ season: season(r), minRarity: 'rare' }) },
  { kind: 'bait', name: '特饵', goal: 45, f: () => ({ baits: SPECIAL_BAITS, minRarity: 'rare' }) },
];
const DAILY: Tpl[] = [
  { kind: 'count', name: '随手钓', goal: 20, f: () => ({}) },
  { kind: 'night', name: '夜钓', goal: 6, f: () => ({ night: true }) },
  { kind: 'species', name: '图鉴', goal: 4, f: () => ({ distinct: true }) },
  { kind: 'perfect', name: '稳手', goal: 3, f: () => ({ perfect: true }) },
  { kind: 'rare', name: '稀客', goal: 1, f: () => ({ minRarity: 'rare' }) },
  { kind: 'bait', name: '香饵', goal: 5, f: () => ({ baits: ['bait_pro'] }) },
  { kind: 'size', name: '大个头', goal: 1, f: (r) => ({ fish: pick(r, commonish.filter((x) => x.rarity === 'common')).id, minPct: 0.6 }) },
];
export const COMM_TEMPLATES: Record<CommTier, readonly Tpl[]> = { daily: DAILY, mid: MID, hard: HARD, extreme: EXTREME };

function rewardOf(tier: CommTier, rnd: () => number): CommReward {
  if (tier === 'daily') return { coins: range(rnd, 40, 80, 10), items: rnd() < 0.5 ? [{ id: 'bait', n: 3 }] : [{ id: 'bait_pro', n: 2 }], xp: 10 };
  if (tier === 'mid') return { coins: range(rnd, 300, 450), items: [{ id: pick(rnd, SPECIAL_BAITS), n: 5 }], xp: 60 };
  if (tier === 'hard') return { coins: range(rnd, 600, 900), items: [rnd() < 0.7 ? { id: pick(rnd, TACKLE_IDS), n: 1 } : { id: 'pearl', n: 1 }], xp: 120 };
  const r = rnd();
  return { coins: range(rnd, 1000, 1500), items: [r < 0.1 ? { id: 'bait_myth', n: 1 } : r < 0.5 ? { id: 'dragon_scale', n: 1 } : r < 0.75 ? { id: 'pearl', n: 2 } : { id: pick(rnd, ['tk_sonar', 'tk_treasure', 'tk_buffer'] as const), n: 1 }], xp: 250 };
}
function build(tier: CommTier, t: Tpl, rnd: () => number): Commission {
  const f = t.f(rnd);
  return { id: tier, tier, name: t.name, desc: describe(f, t.goal, tier === 'daily' ? 'day' : 'week'), goal: t.goal, f, reward: rewardOf(tier, rnd) };
}
/** 某一周（周编号）的三个委托：中等 / 困难 / 极难，同一周永远一样；三档不选同类型 */
export function weeklyCommissions(week: number): Commission[] {
  const rnd = mulberry32(week * 2654435761 + 777), used = new Set<string>(), out: Commission[] = [];
  for (const tier of ['mid', 'hard', 'extreme'] as const) {
    const pool = COMM_TEMPLATES[tier].filter((t) => !used.has(t.kind)), t = pick(rnd, pool.length ? pool : COMM_TEMPLATES[tier]);
    used.add(t.kind); out.push(build(tier, t, rnd));
  }
  return out;
}
/** 某一天（日期编号）的每日委托（简单） */
export function dailyCommission(day: number): Commission {
  const rnd = mulberry32(day * 40503 + 99);
  return build('daily', pick(rnd, DAILY), rnd);
}
/** 三个周委托全部完成的额外奖励（旧木箱 ×2 + 150 经验 + 全勤周数 +1） */
export const WEEK_ALL_REWARD: { items: Gain[]; xp: number } = { items: [{ id: 'box_crate', n: 2 }], xp: 150 };

/** 档案里的委托进度：周委托（按档名）+ 今日委托；sp = 本周 / 今天已钓到的种类（distinct 类用） */
export interface CommSave {
  week: number; prog: Record<string, number>; done: string[]; claimed: string[]; sp: string[];
  d: { day: number; prog: number; done: boolean; claimed: boolean; sp: string[] };
}
export const emptyCommSave = (week = 0, day = 0): CommSave => ({ week, prog: {}, done: [], claimed: [], sp: [], d: { day, prog: 0, done: false, claimed: false, sp: [] } });
export function cleanCommSave(raw: unknown): CommSave | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>, num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const tiers = ['mid', 'hard', 'extreme'], ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && tiers.includes(x)))] : []);
  const sp = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!fishDef(x)))].slice(0, 60) : []);
  const prog: Record<string, number> = {};
  if (r.prog && typeof r.prog === 'object') for (const t of tiers) { const n = num((r.prog as Record<string, unknown>)[t]); if (n) prog[t] = Math.min(n, 9999); }
  const d = (r.d && typeof r.d === 'object' ? r.d : {}) as Record<string, unknown>;
  return { week: num(r.week), prog, done: ids(r.done), claimed: ids(r.claimed), sp: sp(r.sp), d: { day: num(d.day), prog: Math.min(num(d.prog), 9999), done: d.done === true, claimed: d.claimed === true, sp: sp(d.sp) } };
}

// ------------------------------------------------------------ 难度估算（测试 / 调数值用，不参与游戏逻辑）
/**
 * 「玩家总是在最合适的环境里钓、装备中上（好运 1.6）」时，完成这个委托大约要抛多少次竿（下限估计）。
 * 用来防止出现"几十次抛竿就能刷完"的委托，以及保证周委托不是纯堆数量能完成的。
 */
export function estimateCasts(c: Commission): number {
  const f = c.f, luck = 1.6;
  if (f.box) {
    const boxP = (night: boolean, rain: boolean) => 1 - BOXES.reduce((p, b) => p * (1 - Math.min(0.5, b.rate * (b.id === 'box_bottle' && rain ? 1.5 : b.id === 'box_crate' && night ? 1.5 : b.id === 'box_wreck' && night && rain ? 2 : 1))), 1);
    if (f.box === 'open') return c.goal / boxP(true, true);
    const gem = BOXES.reduce((p, b) => { const t = b.loot.reduce((a, l) => a + l.w, 0), g = b.loot.filter((l) => l.gem).reduce((a, l) => a + l.w, 0); return p + (b.rate * (b.id === 'box_wreck' ? 2 : b.id === 'box_crate' ? 1.5 : 1)) * (g / t); }, 0);
    return c.goal / gem;
  }
  const envs: { night: boolean; rain: boolean; season: Season }[] = [];
  for (const night of [false, true]) for (const rain of [false, true]) for (const s of SEASONS) {
    if (f.night !== undefined && f.night !== night) continue;
    if (f.rain !== undefined && f.rain !== rain) continue;
    if (f.season && f.season !== s) continue;
    envs.push({ night, rain, season: s });
  }
  const perfectP = 0.4;
  const sizeP = (pct: number) => (1 - perfectP) * (1 - pct) ** 2 + perfectP * Math.min(1, ((1 - pct) / 0.7) ** 2);
  let best = Infinity;
  for (const e of envs) {
    const w = LAKE_FISH.map((x) => fishWeight(x, { ...e, luck })), tot = w.reduce((a, b) => a + b, 0);
    const match = (x: FishDef) => x.rarity !== 'junk' && (!f.minRarity || rIdx(x.rarity) >= rIdx(f.minRarity)) && (!f.fish || x.id === f.fish);
    if (f.distinct) {
      const ps = LAKE_FISH.map((x, i) => (match(x) ? w[i] / tot : 0)).filter((p) => p > 0).sort((a, b) => b - a);
      if (ps.length < c.goal) continue;
      let E = 0; for (let i = 0; i < c.goal; i++) E += 1 / ps.slice(i).reduce((a, b) => a + b, 0);
      best = Math.min(best, E); continue;
    }
    let p = LAKE_FISH.reduce((a, x, i) => a + (match(x) ? (w[i] / tot) * (f.minPct !== undefined ? sizeP(f.minPct) : 1) : 0), 0);
    if (f.perfect) p *= perfectP;
    if (p > 0) best = Math.min(best, c.goal / p);
  }
  return best;
}
