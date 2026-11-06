/**
 * 钓鱼装备（客户端与服务器共用）：鱼竿、鱼饵、配件，以及把它们合成一组最终参数的 resolveGear。
 * 设计见 私有设计稿；数值先给第一版，上线后看钓鱼榜和余额分布再调。
 *
 * 规则（防止叠爆）：
 *  - 竿和饵的"咬钩时间倍率 / 好运倍率"相乘（和 2026-11-03 之前一致），但整体有上限（WAIT_MIN / LUCK_MAX）；
 *  - 同一种条件的加成（比如"夜里"，竿有、饵也有）取最高的一个，不相乘；
 *  - 双钓、盲盒概率、配件的拉鱼加成都是"同类取最高"。
 * 新增装备：在下面的表里加一项，再在 items.ts 加同名物品、tools/art/items.ts 画图标（tests 会检查一致）。
 */
import type { FishDef } from './fishing';
import type { Season } from './season';

// ------------------------------------------------------------ 鱼竿
export interface RodPerk {
  /** 夜里：咬钩时间倍率、夜行鱼权重倍率 */ night?: { wait: number; boost: number };
  /** 雨天：同上（雨天鱼） */ rain?: { wait: number; boost: number };
  /** 冬天：所有鱼（不含杂物）权重倍率、冰湖银鱼王额外倍率、收竿窗口加长（毫秒） */ winter?: { boost: number; ice: number; window: number };
  /** 盲盒 / 宝物概率倍率 */ treasure?: number;
  /** 一次钓两条的概率 */ double?: number;
  /** 拉鱼绿条加长的比例（0.1 = +10%） */ bar?: number;
}
export interface RodDef {
  id: string; name: string;
  /** 拉鱼难度减去这么多（绿条更长、鱼更慢） */ ease: number;
  /** 咬钩等待时间倍率 */ wait: number;
  /** 稀有及以上的鱼权重倍率 */ luck: number;
  /** 配件槽数 */ slots: number;
  perk?: RodPerk;
  /** 场合标签（图鉴 / 背包里提示什么时候最好用） */ tag?: '夜里' | '雨天' | '冬天';
  /** 一句话效果、怎么得到 */ eff: string; how: string;
}
/** 从差到好；"自动"时用背包里最低级的 */
export const RODS: readonly RodDef[] = [
  { id: 'fishing_rod', name: '竹节鱼竿', ease: 0, wait: 1, luck: 1, slots: 0, eff: '最普通的鱼竿', how: '每天登录送；商店 40 币' },
  { id: 'rod_carbon', name: '碳素鱼竿', ease: 0.1, wait: 0.8, luck: 1.25, slots: 1, eff: '拉鱼更轻松、咬钩更快、稀有鱼更多；1 个配件槽', how: '商店 420 币' },
  { id: 'rod_glow', name: '萤火竿', ease: 0.12, wait: 0.75, luck: 1.3, slots: 1, tag: '夜里', perk: { night: { wait: 0.6, boost: 1.5 } }, eff: '夜里咬钩更快（×0.6）、夜行鱼更多；白天没有额外加成', how: '商店 900 币' },
  { id: 'rod_rain', name: '听雨竿', ease: 0.12, wait: 0.75, luck: 1.3, slots: 1, tag: '雨天', perk: { rain: { wait: 0.6, boost: 1.5 } }, eff: '雨天咬钩更快（×0.6）、雨天的鱼更多；晴天没有额外加成', how: '商店 900 币' },
  { id: 'rod_frost', name: '寒江竿', ease: 0.15, wait: 0.75, luck: 1.3, slots: 1, tag: '冬天', perk: { winter: { boost: 1.3, ice: 2, window: 300 } }, eff: '冬天鱼更多、冰湖银鱼王概率翻倍、收竿窗口更长（手不冻）', how: '沉船箱 / 钓到冰湖银鱼王后在盲盒里更容易开出' },
  { id: 'rod_pickup', name: '拾遗竿', ease: 0.1, wait: 0.85, luck: 1.1, slots: 1, perk: { treasure: 2 }, eff: '钓到盲盒的概率 ×2', how: '商店 1500 币' },
  { id: 'rod_twin', name: '并蒂竿', ease: 0.15, wait: 0.8, luck: 1.2, slots: 1, perk: { double: 0.08 }, eff: '8% 的概率一次钓上两条同种鱼（拉鱼只拉一次）', how: '旧木箱 / 沉船箱' },
  { id: 'rod_golden', name: '金龙鱼竿', ease: 0.2, wait: 0.62, luck: 1.6, slots: 1, eff: '拉鱼大幅放宽、咬钩最快、稀有鱼显著增多', how: '商店 1800 币' },
  { id: 'rod_bone', name: '龙骨竿', ease: 0.3, wait: 0.5, luck: 2.2, slots: 2, perk: { night: { wait: 0.88, boost: 1.15 }, rain: { wait: 0.88, boost: 1.15 }, winter: { boost: 1.1, ice: 1.3, window: 100 }, treasure: 1.3, double: 0.03, bar: 0.1 }, eff: '顶级鱼竿：拉鱼绿条 +10%、2 个配件槽，夜 / 雨 / 冬的特长都有一点、盲盒 ×1.3、3% 双钓；神话鱼的入场券之一', how: '合成：金龙鱼竿 + 龙鳞 ×4 + 1500 币' },
];
const ROD_BY_ID = new Map(RODS.map((r) => [r.id, r]));
export const rodDef = (id: unknown): RodDef | undefined => (typeof id === 'string' ? ROD_BY_ID.get(id) : undefined);
export const bestRod = (inv: Record<string, number>): RodDef | undefined => [...RODS].reverse().find((r) => (inv[r.id] ?? 0) > 0);

// ------------------------------------------------------------ 鱼饵
export interface BaitDef {
  id: string; name: string;
  /** 咬钩时间倍率 / 稀有及以上权重倍率 */ wait: number; luck: number;
  /** 夜里的特长（咬钩倍率、夜行鱼权重倍率） */ night?: { wait: number; boost: number };
  /** 当季鱼（这个季节权重 > 1 的鱼）权重倍率 */ seasonBoost?: number;
  /** 双钓概率 */ double?: number;
  /** 盲盒 / 宝物概率倍率 */ treasure?: number;
  /** 万能饵：无视夜 / 雨 / 季节（传说和神话除外） */ ignoreEnv?: boolean;
  /** 指名饵：只会咬装备栏里指定的那一种 */ named?: boolean;
  /** 神话饵：神话鱼的条件之一 */ mythic?: boolean;
  tag?: '夜里';
  eff: string; how: string;
}
export const BAITS: readonly BaitDef[] = [
  { id: 'bait', name: '鱼饵', wait: 1, luck: 1, eff: '最普通的鱼饵', how: '每天登录和做每日任务送；商店 10 币 ×5' },
  { id: 'bait_pro', name: '香饵', wait: 0.75, luck: 1.25, eff: '咬钩更快（×0.75），稀有鱼更爱上钩（×1.25）', how: '商店 30 币 ×5' },
  { id: 'bait_glow', name: '夜光饵', wait: 1, luck: 1, tag: '夜里', night: { wait: 0.7, boost: 1.4 }, eff: '夜里咬钩更快（×0.7）、夜行鱼更多', how: '商店 40 币 ×5；盲盒' },
  { id: 'bait_season', name: '应季饵', wait: 1, luck: 1, seasonBoost: 1.5, eff: '当季的鱼更多（按现在的季节自动算）', how: '商店 40 币 ×5；盲盒' },
  { id: 'bait_wild', name: '野饵', wait: 1, luck: 1, double: 0.12, eff: '12% 的概率一次钓上两条', how: '商店 60 币 ×5；盲盒' },
  { id: 'bait_magnet', name: '磁铁饵', wait: 1, luck: 1, treasure: 2, eff: '钓到盲盒的概率 ×2', how: '商店 60 币 ×5；盲盒' },
  { id: 'bait_any', name: '万能饵', wait: 1, luck: 1, ignoreEnv: true, eff: '无视季节、天气和昼夜：所有鱼按基础概率出现（传说、神话除外），用来补图鉴', how: '盲盒（不卖）' },
  { id: 'bait_name', name: '指名饵', wait: 1, luck: 1, named: true, eff: '在装备栏指定一种鱼：这一杆只会咬它（限常见 / 少见 / 稀有，且图鉴里已有）', how: '合成：3 条同种鱼；盲盒' },
  { id: 'bait_myth', name: '神话饵', wait: 1, luck: 1, mythic: true, eff: '神话鱼的条件之一：只有它能引来传说里的东西', how: '合成：龙鳞 + 珍珠 + 稀有鱼；沉船箱' },
];
const BAIT_BY_ID = new Map(BAITS.map((b) => [b.id, b]));
export const baitDef = (id: unknown): BaitDef | undefined => (typeof id === 'string' ? BAIT_BY_ID.get(id) : undefined);
/** 所有鱼饵 id（装备栏用） */
export const BAIT_IDS: readonly string[] = BAITS.map((b) => b.id);
/** "自动"时会考虑的鱼饵（从低级到高级）：万能 / 指名 / 神话饵不会被自动用掉，要自己在装备栏里选 */
export const AUTO_BAITS: readonly string[] = ['bait', 'bait_pro', 'bait_glow', 'bait_season', 'bait_wild', 'bait_magnet'];
/** 兼容旧代码：香饵的两个倍率 */
export const PRO_BAIT = { id: 'bait_pro', wait: 0.75, luck: 1.25 } as const;

// ------------------------------------------------------------ 配件（不消耗）
export interface TackleDef {
  id: string; name: string;
  /** 绿条长度倍率 */ bar?: number;
  /** 绿条下沉的加速度倍率（<1 更稳） */ sink?: number;
  /** "黏鱼"强度（鱼在绿条里时绿条被带着走；对窜动型的鱼无效） */ cling?: number;
  /** 鱼不在绿条里时进度下降速度倍率（<1 掉得慢） */ drop?: number;
  /** 咬钩时告诉你是什么鱼（图鉴里已有的才显示名字） */ sonar?: boolean;
  /** 盲盒 / 宝物概率倍率 */ treasure?: number;
  price: number; eff: string; how: string;
}
export const TACKLES: readonly TackleDef[] = [
  { id: 'tk_float', name: '长浮漂', bar: 1.12, price: 250, eff: '拉鱼时绿条 +12%', how: '商店 250 币；盲盒' },
  { id: 'tk_lead', name: '铅坠', sink: 0.7, price: 250, eff: '绿条下沉更稳（适合手机连点）', how: '商店 250 币；盲盒' },
  { id: 'tk_barb', name: '倒刺钩', cling: 1, price: 400, eff: '鱼在绿条里时，绿条会黏着它走（对窜动型的鱼无效）', how: '商店 400 币；盲盒' },
  { id: 'tk_buffer', name: '缓冲浮标', drop: 0.65, price: 600, eff: '鱼不在绿条里时，进度掉得慢 35%', how: '商店 600 币；盲盒' },
  { id: 'tk_sonar', name: '声呐浮标', sonar: true, price: 700, eff: '咬钩时告诉你是什么鱼（图鉴里已经钓到过的才显示名字），再决定要不要收竿', how: '商店 700 币；盲盒' },
  { id: 'tk_treasure', name: '寻宝钩', treasure: 1.5, price: 800, eff: '钓到盲盒的概率 ×1.5', how: '商店 800 币；盲盒' },
];
const TACKLE_BY_ID = new Map(TACKLES.map((t) => [t.id, t]));
export const tackleDef = (id: unknown): TackleDef | undefined => (typeof id === 'string' ? TACKLE_BY_ID.get(id) : undefined);
export const MAX_TACKLE = 2;

// ------------------------------------------------------------ 装备栏
/**
 * 钓鱼装备栏：鱼竿、鱼饵、配件（龙骨竿 2 格，其余 1 格，竹节竿 0 格）、指名饵的目标；选了哪件就用哪件（背包里要有）；
 * ''（竿 / 饵）= 自动，默认用背包里**最低级**的（2026-11-03：之前是"有最好的就用最好的"，香饵、金龙竿会在你不知情时被用掉）。
 */
export interface Equip { rod: string; bait: string; tackle: string[]; target: string }
export const NO_EQUIP: Equip = { rod: '', bait: '', tackle: [], target: '' };
export function cleanEquip(raw: unknown, isTarget: (id: string) => boolean = () => true): Equip {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tackle: string[] = [];
  if (Array.isArray(r.tackle)) for (const t of r.tackle) if (typeof t === 'string' && tackleDef(t) && !tackle.includes(t) && tackle.length < MAX_TACKLE) tackle.push(t);
  return {
    rod: typeof r.rod === 'string' && rodDef(r.rod) ? r.rod : '', bait: typeof r.bait === 'string' && baitDef(r.bait) ? r.bait : '',
    tackle, target: typeof r.target === 'string' && isTarget(r.target) ? r.target : '',
  };
}
/** 这次抛竿用哪根竿：装备栏选的（背包里有才算）；没选/没有就用背包里最低级的 */
export const pickRod = (inv: Record<string, number>, eq?: Partial<Equip>): RodDef | undefined => RODS.find((r) => r.id === eq?.rod && (inv[r.id] ?? 0) > 0) ?? RODS.find((r) => (inv[r.id] ?? 0) > 0);
/** 这次抛竿用哪种饵（同上；自动时只在普通饵 / 香饵 / 夜光 / 应季 / 野饵 / 磁铁里挑最低级的） */
export const pickBait = (inv: Record<string, number>, eq?: Partial<Equip>): string | undefined => BAIT_IDS.find((b) => b === eq?.bait && (inv[b] ?? 0) > 0) ?? AUTO_BAITS.find((b) => (inv[b] ?? 0) > 0);

// ------------------------------------------------------------ 合成一组最终参数
export interface GearEnv { night: boolean; rain?: boolean; season?: Season }
export interface Gear {
  rod?: RodDef; bait?: BaitDef; tackle: TackleDef[];
  /** 咬钩等待时间倍率 / 好运倍率 / 拉鱼减难度 */ wait: number; luck: number; ease: number;
  /** 收竿窗口多给多少毫秒 */ window: number;
  /** 双钓概率、盲盒概率倍率 */ double: number; treasure: number;
  ignoreEnv: boolean; only?: string; mythicBait: boolean; sonar: boolean;
  /** 拉鱼参数：绿条长度倍率、下沉倍率、黏鱼、进度下降倍率 */ fight: { bar: number; sink: number; cling: number; drop: number };
  /** 额外的权重倍率（特长竿 / 夜光饵 / 应季饵） */ mul: (f: FishDef) => number;
}
export const WAIT_MIN = 0.35, LUCK_MAX = 3, TREASURE_MAX = 3, BAR_MAX = 1.3;

/** extra：钓鱼等级和路线给的加成（bar = 绿条加成的比例，如 0.02；treasure = 盲盒倍率，如 1.3），都不传 = 没有 */
export function resolveGear(inv: Record<string, number>, eq: Partial<Equip> | undefined, env: GearEnv, extra?: { bar?: number; treasure?: number; /** 运气倍数（节日福利等） */ luck?: number }): Gear {
  const rod = pickRod(inv, eq), baitId = pickBait(inv, eq), bait = baitId ? baitDef(baitId) : undefined;
  const tackle = (eq?.tackle ?? []).map((t) => tackleDef(t)).filter((t): t is TackleDef => !!t && (inv[t.id] ?? 0) > 0).slice(0, rod?.slots ?? 0);
  const rp = rod?.perk ?? {};
  // 同一种条件：竿和饵都有的取最强（咬钩倍率取最小、权重倍率取最大）
  const nightWait = env.night ? Math.min(rp.night?.wait ?? 1, bait?.night?.wait ?? 1) : 1;
  const rainWait = env.rain ? rp.rain?.wait ?? 1 : 1;
  const nightBoost = env.night ? Math.max(rp.night?.boost ?? 1, bait?.night?.boost ?? 1) : 1;
  const rainBoost = env.rain ? rp.rain?.boost ?? 1 : 1;
  const winter = env.season === 'winter' ? rp.winter : undefined;
  const seasonBoost = bait?.seasonBoost && env.season ? bait.seasonBoost : 1;
  const season = env.season;
  const wait = Math.max(WAIT_MIN, (rod?.wait ?? 1) * (bait?.wait ?? 1) * nightWait * rainWait);
  const luck = Math.min(LUCK_MAX, (rod?.luck ?? 1) * (bait?.luck ?? 1) * (extra?.luck ?? 1));
  const best = (xs: (number | undefined)[]) => Math.max(...xs.filter((x): x is number => typeof x === 'number'), 0);
  const treasure = Math.min(TREASURE_MAX, Math.max(1, best([rp.treasure, bait?.treasure, ...tackle.map((t) => t.treasure)])) * (extra?.treasure ?? 1));
  const barBonus = Math.max(...tackle.map((t) => (t.bar ?? 1) - 1), 0) + (rp.bar ?? 0) + (extra?.bar ?? 0);
  const only = bait?.named && eq?.target ? eq.target : undefined;
  return {
    rod, bait, tackle, wait, luck, ease: rod?.ease ?? 0, window: winter?.window ?? 0,
    double: best([rp.double, bait?.double]), treasure,
    ignoreEnv: !!bait?.ignoreEnv, only, mythicBait: !!bait?.mythic, sonar: tackle.some((t) => t.sonar),
    fight: {
      bar: Math.min(BAR_MAX, 1 + barBonus), sink: Math.min(1, ...tackle.map((t) => t.sink ?? 1)),
      cling: Math.max(0, ...tackle.map((t) => t.cling ?? 0)), drop: Math.min(1, ...tackle.map((t) => t.drop ?? 1)),
    },
    mul: (f) => {
      let m = 1;
      if (f.rarity === 'junk') return m;
      if ((f.night ?? 1) > 1) m *= nightBoost;
      if ((f.rain ?? 1) > 1) m *= rainBoost;
      if (season && (f.seasons?.[season] ?? 1) > 1) m *= seasonBoost;
      if (winter) m *= f.id === 'fish_icefish' ? winter.boost * winter.ice : winter.boost;
      return m;
    },
  };
}

/** 这件装备在当前环境下有没有"特长加成"（图鉴 / 背包里高亮场合标签用） */
export function perkActive(tag: string | undefined, env: GearEnv): boolean {
  return (tag === '夜里' && env.night) || (tag === '雨天' && !!env.rain) || (tag === '冬天' && env.season === 'winter');
}
