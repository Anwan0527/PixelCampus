/**
 * 精灵规则（客户端与服务器共用）：纯函数，随机源由调用方注入，方便服务器权威结算与单元测试。
 * 内容（物种、属性相克表）来自"内容包"（data/mons/packs/*）；这里不写死任何物种或属性，
 * 换一个内容包只需要换 ElementPack 和 Species 列表。设计稿见 docs/CREATURES_PLAN.md。
 *
 * 规则取向：回合制抓宠式——六维、等级、个体值、技能带 PP、双属性相乘、同属加成、暴击、一次掷骰的捕捉。
 * 第一版没有性格、特性、异常状态（字段不预留进存档，加的时候再迁移）。
 */
export type Rng = () => number;

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export const STAT_KEYS: readonly StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_NAMES: Record<StatKey, string> = { hp: '生命', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
export type Stats = Record<StatKey, number>;
/** 种族值，顺序同 STAT_KEYS */
export type Base = readonly [number, number, number, number, number, number];

export const MON = {
  /** 等级上限（猫系精灵 16 级、32 级进化，所以要大于 32） */
  LEVEL_CAP: 36,
  /** 个体值范围 0..MAX_IV */
  MAX_IV: 31,
  SQUAD_MAX: 6,
  BOX_MAX: 60,
  MOVES_MAX: 4,
  /** 异色概率 1/SHINY_ODDS */
  SHINY_ODDS: 64,
  CRIT: 1 / 16,
  /** 捕捉成功率的下限/上限（再难抓的也有 5%，再容易的也不是必中） */
  CATCH_FLOOR: 0.05,
  CATCH_CEIL: 0.95,
  /** 昵称最长字数 */
  NICK_MAX: 8,
} as const;

// ------------------------------------------------------------------ 内容包
export interface ElementDef { id: string; name: string; color: string }
/** 属性（元素）包：chart[攻][防] = 倍率（2 / 0.5 / 0），没写 = 1；normal = "没有克制关系"的那个基础属性 */
export interface ElementPack { id: string; name?: string; normal: string; elements: ElementDef[]; chart: Record<string, Record<string, number>> }

export interface Species {
  id: string; no: number; name: string;
  /** 1~2 个属性（元素 id） */
  types: readonly string[];
  base: Base;
  /** 满血、普通道具时的捕捉概率（0~1） */
  catch: number;
  /** 战斗经验基数；没写 = 种族值总和 ÷ 5 */
  exp?: number;
  /** 进化链（物种 id，从低阶到高阶）；第一版只用于图鉴显示 */
  chain?: readonly string[];
  gen?: number; desc?: string;
  /** 进化：达到这个等级自动进化成 to（进化链最后一阶没有） */
  evo?: { to: string; lv: number };
  /** 自带技能表（没写就按规则生成，见 learnsetOf） */
  learnset?: readonly LearnEntry[];
  /** 没有备用配色美术的物种不会出异色 */
  noShiny?: boolean;
  /** 技能槽数（没写 = MOVES_MAX 个）：特别全面的物种可以多带几个技能 */
  moveSlots?: number;
  /** 猫系精灵：毛色编号与阶段（1 幼崽 / 2 成年 / 3 王者） */
  coat?: number; stage?: 1 | 2 | 3;
}

export type MoveCat = 'physical' | 'special';
export interface Move { id: string; name: string; type: string; cat: MoveCat; power: number; acc: number; pp: number; priority?: number }

export interface MonMove { id: string; pp: number }
/** 一只精灵（存档里的样子）。id 是实例编号，不是物种号；iv 顺序同 STAT_KEYS */
export interface Mon { id: string; sp: string; lv: number; xp: number; hp: number; iv: number[]; mv: MonMove[]; nick?: string; sh?: 1; at: number; /** 来自哪只校园小猫（猫编号） */ cat?: number }

export interface Content { elements: ElementPack; species: Map<string, Species>; moves: Map<string, Move> }

/** 通用技能的四个档次：id 形如 "火:p50"（属性:档次） */
const MOVE_KINDS = [
  { k: 'p50', cat: 'physical', power: 50, acc: 100, pp: 25, suffix: '冲击' },
  { k: 's50', cat: 'special', power: 50, acc: 100, pp: 25, suffix: '波动' },
  { k: 'p85', cat: 'physical', power: 85, acc: 90, pp: 15, suffix: '猛击' },
  { k: 's85', cat: 'special', power: 85, acc: 90, pp: 15, suffix: '轰炸' },
] as const;
type MoveKind = (typeof MOVE_KINDS)[number]['k'];
export const moveId = (el: string, k: MoveKind) => `${el}:${k}`;
/** 没有可用 PP 时使用的"挣扎"（不扣 PP） */
export const STRUGGLE: Move = { id: 'struggle', name: '挣扎', type: '', cat: 'physical', power: 40, acc: 100, pp: 1 };

/** 每个属性生成 4 个通用技能（冲击/波动/猛击/轰炸）。内容包以后可以自带技能表覆盖 */
export function genMoves(pack: ElementPack): Move[] {
  const out: Move[] = [];
  for (const e of pack.elements) for (const m of MOVE_KINDS) out.push({ id: moveId(e.id, m.k), name: `${e.name}·${m.suffix}`, type: e.id, cat: m.cat, power: m.power, acc: m.acc, pp: m.pp });
  return out;
}

export function makeContent(elements: ElementPack, species: readonly Species[], extraMoves: readonly Move[] = []): Content {
  return { elements, species: new Map(species.map((s) => [s.id, s])), moves: new Map([...genMoves(elements), ...extraMoves].map((m) => [m.id, m])) };
}

/** 确定性随机数（服务器记录种子 + 行动序列就能复盘） */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ 属性
/** 一次攻击的属性倍率：攻击属性对每个防守属性的倍率相乘（双属性可到 ×4 / ×0.25，免疫 = 0） */
export function typeMult(pack: ElementPack, atk: string, def: readonly string[]): number {
  let m = 1;
  for (const d of def) m *= pack.chart[atk]?.[d] ?? 1;
  return m;
}
export const elementName = (pack: ElementPack, id: string) => pack.elements.find((e) => e.id === id)?.name ?? id;

// ------------------------------------------------------------------ 能力值、经验
/** 等级 L 的能力值：⌊(2×种族值+个体值)×L÷100⌋ + 5（生命再 + L + 5，即总共 + L + 10） */
export function calcStats(base: Base, iv: readonly number[], lv: number): Stats {
  const s = {} as Stats;
  STAT_KEYS.forEach((k, i) => {
    const v = Math.floor(((2 * base[i] + (iv[i] ?? 0)) * lv) / 100);
    s[k] = k === 'hp' ? v + lv + 10 : v + 5;
  });
  return s;
}
/** 能力值；物种不认识时（比如页面是旧版本、服务器已经加了新物种）按一个很弱的占位值算，不要抛错把整个界面带崩 */
const UNKNOWN_BASE: Base = [1, 1, 1, 1, 1, 1];
export const monStats = (ct: Content, m: Mon): Stats => calcStats(ct.species.get(m.sp)?.base ?? UNKNOWN_BASE, m.iv, m.lv);
export const maxHp = (ct: Content, m: Mon): number => monStats(ct, m).hp;

/** 升到 lv 级累计需要的经验（立方曲线） */
export const xpForLevel = (lv: number): number => lv * lv * lv;
export function levelForXp(xp: number, cap: number = MON.LEVEL_CAP): number {
  let lv = 1;
  while (lv < cap && xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}
/** 打败一只 enemyLv 级的野生精灵得到的经验；share 是分到的比例（出战 1，没出战的队友 0.5） */
export function xpGain(sp: Species, enemyLv: number, share = 1): number {
  const baseExp = sp.exp ?? Math.round(sp.base.reduce((a, b) => a + b, 0) / 5);
  return Math.max(1, Math.floor((baseExp * enemyLv * share) / 7));
}

// ------------------------------------------------------------------ 捕捉
/**
 * 捕捉成功率：满血时就是物种的捕捉概率，血越少越高（最多 ×3），再乘道具倍率，夹在 [CATCH_FLOOR, CATCH_CEIL]。
 * 服务器掷一次骰子；道具无论成败都消耗。
 */
export function catchChance(sp: Species, hp: number, maxHp: number, ballMul = 1): number {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  return Math.max(MON.CATCH_FLOOR, Math.min(MON.CATCH_CEIL, sp.catch * (3 - 2 * ratio) * ballMul));
}

// ------------------------------------------------------------------ 技能
export interface LearnEntry { lv: number; id: string }
/**
 * 按规则算出的技能表（不需要逐个物种写数据）：偏物理/偏特殊看攻击和特攻哪个高；
 * 本系的基础技能 1 级、另一类 7 级、强力技能 16 / 26 级；第二属性 12 / 22 级；再加一个"一般"属性的通用技能。
 */
export function learnsetOf(ct: Content, sp: Species): LearnEntry[] {
  if (sp.learnset) return sp.learnset.filter((e) => ct.moves.has(e.id)).slice().sort((a, b) => a.lv - b.lv);
  const phys = sp.base[1] >= sp.base[3];
  const same = (el: string, big: boolean): string => moveId(el, `${phys ? 'p' : 's'}${big ? '85' : '50'}` as MoveKind);
  const other = (el: string, big: boolean): string => moveId(el, `${phys ? 's' : 'p'}${big ? '85' : '50'}` as MoveKind);
  const [t0, t1] = sp.types, nor = ct.elements.normal;
  const list: LearnEntry[] = [{ lv: 1, id: same(t0, false) }, { lv: 1, id: t0 === nor ? other(nor, false) : same(nor, false) }, { lv: 7, id: other(t0, false) }];
  if (t1) list.push({ lv: 12, id: same(t1, false) }, { lv: 22, id: same(t1, true) });
  list.push({ lv: 16, id: same(t0, true) }, { lv: 26, id: other(t0, true) });
  const seen = new Set<string>();
  return list.filter((e) => ct.moves.has(e.id) && !seen.has(e.id) && seen.add(e.id)).sort((a, b) => a.lv - b.lv);
}
/** 这个物种最多带几个技能 */
export const moveSlots = (sp: Pick<Species, 'moveSlots'> | undefined): number => sp?.moveSlots ?? MON.MOVES_MAX;
/** 这个等级时会的技能：已学到的里取最近学的几个（技能槽数见 moveSlots），PP 满 */
export function movesAtLevel(ct: Content, sp: Species, lv: number): MonMove[] {
  return learnsetOf(ct, sp).filter((e) => e.lv <= lv).slice(-moveSlots(sp)).map((e) => ({ id: e.id, pp: ct.moves.get(e.id)!.pp }));
}

// ------------------------------------------------------------------ 生成一只精灵
export function newMon(ct: Content, spId: string, lv: number, rnd: Rng, id: string, now: number): Mon {
  const sp = ct.species.get(spId);
  if (!sp) throw new Error(`未知物种 ${spId}`);
  lv = Math.max(1, Math.min(MON.LEVEL_CAP, Math.floor(lv)));
  const iv = STAT_KEYS.map(() => Math.floor(rnd() * (MON.MAX_IV + 1)));
  const sh = rnd() < 1 / MON.SHINY_ODDS && !sp.noShiny;
  const m: Mon = { id, sp: spId, lv, xp: xpForLevel(lv), hp: 0, iv, mv: movesAtLevel(ct, sp, lv), at: now, ...(sh ? { sh: 1 as const } : {}) };
  m.hp = maxHp(ct, m);
  return m;
}

/** 回复：战斗外休息（hp 回满、PP 回满） */
export function restore(ct: Content, m: Mon): void {
  m.hp = maxHp(ct, m);
  for (const x of m.mv) x.pp = ct.moves.get(x.id)?.pp ?? x.pp;
}

// ------------------------------------------------------------------ 伤害
export interface DamageSide { lv: number; stats: Stats; types: readonly string[] }
export interface DamageResult { dmg: number; mult: number; crit: boolean; stab: boolean }
/**
 * 伤害 = (⌊(⌊2L/5+2⌋ × 威力 × 攻 ÷ 防) ÷ 50⌋ + 2) × 暴击(×1.5) × 随机(0.85~1) × 同属(×1.5) × 属性倍率。
 * 物理技能用攻击/防御，特殊技能用特攻/特防。免疫（倍率 0）时伤害 0，否则至少 1。
 * 随机数调用顺序固定：先暴击、再浮动，所以同一个随机序列结果完全一致。
 */
export function calcDamage(ct: Content, att: DamageSide, def: { stats: Stats; types: readonly string[] }, mv: Move, rnd: Rng): DamageResult {
  const mult = typeMult(ct.elements, mv.type, def.types);
  const crit = rnd() < MON.CRIT, roll = 0.85 + rnd() * 0.15;
  const stab = !!mv.type && att.types.includes(mv.type);
  if (mult === 0) return { dmg: 0, mult, crit, stab };
  const a = mv.cat === 'physical' ? att.stats.atk : att.stats.spa, d = mv.cat === 'physical' ? def.stats.def : def.stats.spd;
  const base = Math.floor((Math.floor(2 * att.lv / 5 + 2) * mv.power * a) / Math.max(1, d) / 50) + 2;
  const dmg = Math.max(1, Math.floor(base * (crit ? 1.5 : 1) * roll * (stab ? 1.5 : 1) * mult));
  return { dmg, mult, crit, stab };
}

// ------------------------------------------------------------------ 进化
/** 沿进化链走：这个物种在 lv 级时应该是哪一阶（野生/对战的精灵按等级决定形态） */
export function stageAt(ct: Content, spId: string, lv: number): string {
  let id = spId;
  for (let i = 0; i < 4; i++) { const e = ct.species.get(id)?.evo; if (e && lv >= e.lv && ct.species.has(e.to)) id = e.to; else break; }
  return id;
}
