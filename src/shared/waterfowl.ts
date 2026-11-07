/**
 * 水禽（精工湖里的鸭子和天鹅，客户端与服务器共用）。
 * 一共 9 只、编号固定（BIRDS 的顺序，只能往后追加）；外观 = 毛色种类（BIRD_KINDS，对应 tools/art/birds.ts 的 BIRD_LOOKS 顺序）。
 * 它们"在湖里的家"由 birdHomes 按固定种子从靠岸的水面格里挑，所有玩家算出来都一样；游来游去只发生在各自的客户端，不同步（和小猫一样）。
 * 玩家站在岸边、水禽游到身边，按 E 喂食：消耗 1 份鱼饵，服务器按概率回一份"钓鱼物品"（见 rollBirdFeed）。
 */
import type { Gain } from './items';
import type { WaterMask } from './water';

export interface BirdKind { key: string; name: string; swan: boolean }
/** 外观种类：编号对应 tools/art/birds.ts 的 BIRD_LOOKS */
export const BIRD_KINDS: readonly BirdKind[] = [
  { key: 'mallard_m', name: '公绿头鸭', swan: false },
  { key: 'mallard_f', name: '母绿头鸭', swan: false },
  { key: 'duck_white', name: '白鸭', swan: false },
  { key: 'swan_white', name: '白天鹅', swan: true },
  { key: 'swan_black', name: '黑天鹅', swan: true },
];
export interface BirdDef { id: number; kind: number; name: string }
/** 湖里的 9 只：6 只鸭子 + 2 只白天鹅 + 1 只黑天鹅（稀有）。编号 = 数组下标，只能往后追加 */
export const BIRDS: readonly BirdDef[] = ([
  [0, '青头'], [0, '老绿'], [1, '麻花'], [1, '花麻'], [2, '雪团'], [2, '团团'], [3, '雪衣'], [3, '素女'], [4, '墨羽'],
] as const).map(([kind, name], id) => ({ id, kind, name }));
export const BIRD_COUNT = BIRDS.length;
export const birdKind = (id: number): BirdKind | undefined => { const b = BIRDS[id]; return b ? BIRD_KINDS[b.kind] : undefined; };
export const isBirdId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < BIRD_COUNT;
export const isSwan = (id: number) => birdKind(id)?.swan === true;
export const isBlackSwan = (id: number) => BIRDS[id]?.kind === 4;

/** 玩家够得着水禽的距离（像素，脚点到水禽中心） */
export const BIRD_REACH = 30;
/** 喂食用的东西：1 份普通鱼饵 */
export const BIRD_FEED_ITEM = 'bait';
/** 同一只水禽对同一个玩家的冷却、每个玩家每天最多喂几次、每天最多收几份"稀有回礼" */
export const BIRD_COOLDOWN_MS = 30000;
export const BIRD_DAILY_CAP = 12;
export const BIRD_RARE_DAILY_CAP = 3;
/** 服务器校验：玩家周围这么多格（切比雪夫距离）以内要有湖水，才算在岸边 */
export const BIRD_SHORE_TILES = 4;

// ------------------------------------------------------------------ 家（客户端算；服务器不需要位置）
/**
 * 在靠岸的水面格里按固定种子挑出 count 个家（格坐标，格中心）：要求周围 2 格内全是水（身子放得下）、4 格内能找到岸（站在岸边的玩家看得到），
 * 彼此先隔 minDist 格，凑不够再逐步放宽。同样的水面永远得到同样的结果。
 */
export function birdHomes(mask: Pick<WaterMask, 'tileWater' | 'w' | 'h'>, count = BIRD_COUNT, seed = 20261108): [number, number][] {
  const roomy = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!mask.tileWater(x + dx, y + dy)) return false; return true; };
  const shoreNear = (x: number, y: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!mask.tileWater(x + dx, y + dy)) return true; return false; };
  const cand: [number, number][] = [];
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) if (mask.tileWater(x, y) && roomy(x, y) && shoreNear(x, y)) cand.push([x + 0.5, y + 0.5]);
  if (!cand.length) return [];
  let s = seed >>> 0;
  const rnd = () => { let t = (s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const out: [number, number][] = [];
  for (const minDist of [30, 24, 18, 12, 6, 0]) {
    for (const c of cand) {
      if (out.length >= count) break;
      if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= minDist)) out.push(c);
    }
    if (out.length >= count) break;
  }
  return out;
}

// ------------------------------------------------------------------ 回礼
export interface BirdOutcome { gifts: Gain[]; /** 这次抽到的是"稀有回礼" */ rare: boolean; /** 什么也没给 */ nothing: boolean }
interface Entry { w: number; gain: Gain }
const E = (w: number, id: string, n = 1): Entry => ({ w, gain: { id, n } });
/** 普通回礼：鸭子 / 天鹅各一张表（鱼饵、香饵、小鱼、杂物） */
export const DUCK_COMMON: readonly Entry[] = [E(30, 'bait'), E(12, 'bait', 2), E(10, 'bait_pro'), E(8, 'fish_gudgeon'), E(8, 'fish_shrimp'), E(6, 'fish_crucian'), E(8, 'junk_weed')];
export const SWAN_COMMON: readonly Entry[] = [E(22, 'bait', 2), E(16, 'bait_pro'), E(8, 'bait_pro', 2), E(8, 'fish_bream'), E(8, 'fish_carp'), E(6, 'fish_crucian', 2)];
/** 稀有回礼：特殊饵、珍珠、盲盒；天鹅更好，黑天鹅最好（每人每天最多 BIRD_RARE_DAILY_CAP 份） */
export const DUCK_RARE: readonly Entry[] = [E(5, 'bait_glow'), E(5, 'bait_season'), E(4, 'bait_wild'), E(2, 'bait_magnet'), E(3, 'pearl'), E(3, 'box_bottle')];
export const SWAN_RARE: readonly Entry[] = [E(4, 'bait_glow', 2), E(4, 'bait_season', 2), E(3, 'bait_wild', 2), E(3, 'bait_magnet'), E(4, 'pearl'), E(4, 'box_bottle'), E(2, 'box_crate')];
export const BLACK_SWAN_RARE: readonly Entry[] = [E(4, 'pearl', 2), E(4, 'box_crate'), E(3, 'box_bottle'), E(2, 'bait_any'), E(1, 'relic_badge')];
/** 每种水禽"什么也没给"和"给稀有回礼"的概率（其余是普通回礼） */
export const BIRD_ODDS = { duck: { nothing: 0.18, rare: 0.12 }, swan: { nothing: 0.1, rare: 0.3 }, black: { nothing: 0.05, rare: 0.45 } } as const;

const pickW = (t: readonly Entry[], r: number): Gain => { const total = t.reduce((a, b) => a + b.w, 0); let x = r * total; for (const e of t) { if (x < e.w) return { ...e.gain }; x -= e.w; } return { ...t[t.length - 1].gain }; };

/**
 * 喂一次的结果：r1 决定"没有 / 普通 / 稀有"，r2 在对应的表里挑；rareLeft = 今天还能不能再给稀有回礼（不能就降成普通回礼）。
 * 纯函数，随机数由调用方给（服务器用 Math.random，测试用定值）。
 */
export function rollBirdFeed(id: number, r1: number, r2: number, rareLeft: boolean): BirdOutcome {
  const k = BIRDS[id]?.kind ?? 0, odds = k === 4 ? BIRD_ODDS.black : k >= 3 ? BIRD_ODDS.swan : BIRD_ODDS.duck;
  if (r1 < odds.nothing) return { gifts: [], rare: false, nothing: true };
  const wantRare = r1 >= 1 - odds.rare;
  if (wantRare && rareLeft) return { gifts: [pickW(k === 4 ? BLACK_SWAN_RARE : k >= 3 ? SWAN_RARE : DUCK_RARE, r2)], rare: true, nothing: false };
  return { gifts: [pickW(k >= 3 ? SWAN_COMMON : DUCK_COMMON, r2)], rare: false, nothing: false };
}

/** 喂食时它说的话（按外观挑一句；nothing = 这次没有回礼） */
const SAYS: Record<string, string[]> = {
  duck: ['嘎嘎！', '嘎、嘎嘎——', '它歪着头"嘎"了一声'],
  swan: ['它优雅地低下了头', '它轻轻"嗯"了一声，脖子弯成一个问号', '它慢悠悠地游近了一点'],
};
export function birdLine(id: number, outcome: BirdOutcome, gifted: string, rnd: number): string {
  const b = BIRDS[id], k = birdKind(id);
  const say = (SAYS[k?.swan ? 'swan' : 'duck'])[Math.floor(rnd * 3) % 3];
  if (outcome.nothing) return `${b.name}吃完了鱼饵，${say}（这次没有回礼）`;
  return `${b.name}吃得很开心，${say}${gifted ? `，还把${gifted}推到了岸边送你` : ''}`;
}

// ------------------------------------------------------------------ 每天的账（存在玩家档案里）
/** 喂食记录：day = 日期编号、n = 今天喂了几次、r = 今天收了几份稀有回礼、t = 累计喂了几次、m = 喂过哪几只（位掩码） */
export interface BirdLog { day: number; n: number; r: number; t: number; m: number }
const nn = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);
/** 从磁盘来的记录：全部收敛成非负整数；掩码只保留合法的位 */
export function cleanBirdLog(raw: unknown): BirdLog | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const log = { day: nn(o.day, 1e6), n: nn(o.n, 9999), r: nn(o.r, 9999), t: nn(o.t, 1e7), m: nn(o.m, 2 ** 30) & ((1 << BIRD_COUNT) - 1) };
  return log.day || log.t ? log : undefined;
}
/** 今天（day）还能喂几次 / 还能收几份稀有回礼 */
export const birdLeft = (log: BirdLog | undefined, day: number) => ({ feeds: Math.max(0, BIRD_DAILY_CAP - (log && log.day === day ? log.n : 0)), rare: Math.max(0, BIRD_RARE_DAILY_CAP - (log && log.day === day ? log.r : 0)) });
export const birdsFed = (log: BirdLog | undefined) => { let n = 0; for (let i = 0; i < BIRD_COUNT; i++) if (log && (log.m >> i) & 1) n++; return n; };
