/**
 * 钓鱼（客户端与服务器共用）：鱼的目录、咬钩时间、按稀有度和昼夜抽鱼、尺寸。
 * 抛竿、等待、咬钩、收竿的判定全部在服务器（客户端只显示和上报"我收竿了"），鱼的种类和尺寸也由服务器抽。
 *
 * 新增鱼：在 FISH 里加一项，并在 items.ts 里加同名物品、tools/art/items.ts 里画图标（tests 会检查三者一致）。
 */
import type { Season } from './season';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'junk';
export type FishMove = 'smooth' | 'mixed' | 'dart';
/** 神话鱼的出现条件（全部满足才会进抽签池；饵 / 竿 / 时间 / 天气 / 季节 / 图鉴里的解锁条件） */
export interface FishNeeds {
  /** 饵：背包里用的是这些之一 */ baits?: readonly string[];
  /** 竿：用的是这些之一 */ rods?: readonly string[];
  /** true = 必须夜里，false = 必须白天 */ night?: boolean; rain?: boolean; seasons?: readonly Season[];
  /** 解锁：图鉴里这种鱼已经钓到 n 条 */ unlock?: { fish: string; n: number };
}
export interface FishDef {
  /** 物品 id（= 背包里的物品） */
  id: string; name: string; rarity: Rarity;
  /** 抽中的相对权重（同一档里的相对值，见 TIER_TOTAL）；下面几个是条件倍率（夜里 / 下雨天 / 各季节），没写 = 1，写 0 = 这个条件下钓不到 */
  weight: number; night?: number; rain?: number; seasons?: Partial<Record<Season, number>>;
  /** 尺寸范围（厘米，整数）和最大个体的重量（公斤）；杂物没有 */
  minCm?: number; maxCm?: number; maxKg?: number;
  /** 拉鱼小游戏里鱼的游法：smooth 慢悠悠 / mixed 时快时慢 / dart 突然窜动 */
  move?: FishMove;
  /** 图鉴 / 物品说明的一句话（2026-11-05 之后新增的鱼写在这里，物品目录自动取用） */
  blurb?: string;
  /** 来源：lake 湖里钓（默认）/ box 只能从盲盒里开出来 */
  source?: 'lake' | 'box';
  /** 神话鱼的出现条件 */
  needs?: FishNeeds;
  /** 拉鱼时：绿条长度倍率（<1 更难）；中途发力（隔几秒猛窜一次） */
  barMul?: number; burst?: boolean;
}

export const FISH: readonly FishDef[] = [
  // 常见
  { id: 'fish_crucian', name: '鲫鱼', rarity: 'common', weight: 30, minCm: 12, maxCm: 28, maxKg: 0.6, move: 'smooth' },
  { id: 'fish_carp', name: '鲤鱼', rarity: 'common', weight: 22, minCm: 25, maxCm: 60, maxKg: 5, move: 'mixed' },
  { id: 'fish_grass', name: '草鱼', rarity: 'common', weight: 16, minCm: 30, maxCm: 80, maxKg: 8, move: 'mixed' },
  { id: 'fish_gudgeon', name: '麦穗鱼', rarity: 'common', weight: 18, minCm: 5, maxCm: 12, maxKg: 0.03, move: 'dart' },
  { id: 'fish_loach', name: '泥鳅', rarity: 'common', weight: 14, rain: 1.8, minCm: 10, maxCm: 25, maxKg: 0.15, move: 'dart' },
  { id: 'fish_shrimp', name: '河虾', rarity: 'common', weight: 14, seasons: { summer: 1.6, winter: 0.4 }, minCm: 4, maxCm: 9, maxKg: 0.02, move: 'dart' },
  { id: 'fish_bitterling', name: '鳑鲏', rarity: 'common', weight: 10, seasons: { spring: 1.5 }, minCm: 4, maxCm: 9, maxKg: 0.02, move: 'dart', blurb: '春天雄鱼会披上婚姻色，小得像一片彩色的叶子。' },
  { id: 'fish_whitebait', name: '白条', rarity: 'common', weight: 12, night: 0.6, minCm: 8, maxCm: 16, maxKg: 0.05, move: 'dart', blurb: '成群在水面打转的小银鱼，反应快得很。' },
  { id: 'fish_clam', name: '河蚌', rarity: 'common', weight: 8, seasons: { summer: 1.4 }, minCm: 6, maxCm: 14, maxKg: 0.15, move: 'smooth', blurb: '慢吞吞的贝类，偶尔会在壳里藏着一颗珍珠。' },
  // 少见
  { id: 'fish_bream', name: '鳊鱼', rarity: 'uncommon', weight: 10, minCm: 20, maxCm: 40, maxKg: 1.2, move: 'smooth' },
  { id: 'fish_snakehead', name: '黑鱼', rarity: 'uncommon', weight: 8, night: 1.6, minCm: 30, maxCm: 65, maxKg: 4, move: 'mixed' },
  { id: 'fish_catfish', name: '鲶鱼', rarity: 'uncommon', weight: 7, night: 1.6, minCm: 25, maxCm: 70, maxKg: 6, move: 'mixed' },
  { id: 'fish_silver', name: '鲢鱼', rarity: 'uncommon', weight: 7, minCm: 35, maxCm: 90, maxKg: 9, move: 'smooth' },
  { id: 'fish_bighead', name: '鳙鱼', rarity: 'uncommon', weight: 6, minCm: 40, maxCm: 95, maxKg: 12, move: 'smooth' },
  { id: 'fish_crayfish', name: '小龙虾', rarity: 'uncommon', weight: 6, seasons: { summer: 2.2, autumn: 1.2, winter: 0.2 }, minCm: 8, maxCm: 14, maxKg: 0.06, move: 'dart' },
  { id: 'fish_yellowcat', name: '黄颡鱼', rarity: 'uncommon', weight: 6, night: 1.4, minCm: 12, maxCm: 30, maxKg: 0.4, move: 'mixed', blurb: '背鳍有硬刺，当地人叫它"昂刺"，抓的时候小心扎手。' },
  { id: 'fish_bass', name: '大口黑鲈', rarity: 'uncommon', weight: 6, seasons: { summer: 1.3 }, minCm: 25, maxCm: 60, maxKg: 3.5, move: 'mixed', blurb: '外来的凶猛鱼类，一口吞下比自己小的鱼——它本不该出现在这里。' },
  { id: 'fish_wuchang', name: '团头鲂', rarity: 'uncommon', weight: 5, seasons: { autumn: 1.5 }, minCm: 25, maxCm: 45, maxKg: 1.5, move: 'smooth', blurb: '俗称武昌鱼，秋天最肥。' },
  { id: 'fish_goby', name: '虾虎鱼', rarity: 'uncommon', weight: 6, rain: 1.5, minCm: 8, maxCm: 18, maxKg: 0.1, move: 'dart', blurb: '趴在石头缝里的小家伙，下雨天更活跃。' },
  // 稀有
  { id: 'fish_goldfish', name: '金鱼', rarity: 'rare', weight: 4, minCm: 8, maxCm: 20, maxKg: 0.2, move: 'smooth' },
  { id: 'fish_koi', name: '锦鲤', rarity: 'rare', weight: 3, night: 0.6, minCm: 40, maxCm: 90, maxKg: 7, move: 'mixed' },
  { id: 'fish_culter', name: '翘嘴鲌', rarity: 'rare', weight: 2.6, minCm: 40, maxCm: 90, maxKg: 5, move: 'dart' },
  { id: 'fish_mandarin', name: '鳜鱼', rarity: 'rare', weight: 2.4, seasons: { spring: 1.5 }, minCm: 25, maxCm: 55, maxKg: 3.5, move: 'mixed' },
  { id: 'fish_turtle', name: '中华鳖', rarity: 'rare', weight: 2, night: 1.5, seasons: { winter: 0.3 }, minCm: 15, maxCm: 35, maxKg: 3, move: 'smooth' },
  { id: 'fish_eel', name: '黄鳝', rarity: 'rare', weight: 2.2, night: 1.5, rain: 1.6, minCm: 40, maxCm: 90, maxKg: 1.5, move: 'dart' },
  { id: 'fish_crab', name: '河蟹', rarity: 'rare', weight: 2.4, seasons: { spring: 0.3, summer: 0.3, autumn: 3, winter: 0.3 }, minCm: 6, maxCm: 12, maxKg: 0.35, move: 'dart', blurb: '横着跑的甲壳类，秋天蟹黄最满。' },
  { id: 'fish_yellowcarp', name: '黄河鲤', rarity: 'rare', weight: 2.2, seasons: { spring: 1.3, autumn: 1.3 }, minCm: 40, maxCm: 85, maxKg: 8, move: 'mixed', blurb: '金红色的大鲤鱼，北方人宴席上的头牌。' },
  { id: 'fish_silverling', name: '银鱼', rarity: 'rare', weight: 2.2, seasons: { winter: 2, spring: 1.3 }, minCm: 6, maxCm: 12, maxKg: 0.01, move: 'dart', blurb: '透明得能看见内脏的小鱼，只在清冷的水里出现。' },
  // 史诗
  { id: 'fish_blackcarp', name: '青鱼', rarity: 'epic', weight: 0.9, minCm: 80, maxCm: 150, maxKg: 40, move: 'mixed' },
  { id: 'fish_salamander', name: '娃娃鱼', rarity: 'epic', weight: 0.7, night: 2, rain: 2, minCm: 60, maxCm: 120, maxKg: 25, move: 'mixed' },
  { id: 'fish_arowana', name: '银龙鱼', rarity: 'epic', weight: 0.7, seasons: { summer: 1.5 }, minCm: 50, maxCm: 90, maxKg: 4.5, move: 'dart' },
  { id: 'fish_sturgeon', name: '鲟鱼', rarity: 'epic', weight: 0.6, seasons: { winter: 1.6 }, minCm: 90, maxCm: 200, maxKg: 80, move: 'smooth' },
  { id: 'fish_ganoid', name: '鳡鱼', rarity: 'epic', weight: 0.6, night: 1.4, minCm: 80, maxCm: 180, maxKg: 30, move: 'dart', blurb: '淡水里的"水老虎"，追着小鱼满湖跑。' },
  { id: 'fish_sucker', name: '胭脂鱼', rarity: 'epic', weight: 0.6, seasons: { spring: 1.5 }, minCm: 60, maxCm: 120, maxKg: 20, move: 'smooth', blurb: '少年时一身彩带，长大变成胭脂红；是国家保护动物，钓到了请好好对它。' },
  { id: 'fish_gar', name: '雀鳝', rarity: 'epic', weight: 0.5, seasons: { summer: 1.5 }, minCm: 80, maxCm: 200, maxKg: 40, move: 'dart', blurb: '外来入侵的大怪鱼，一嘴尖牙——校园湖里本不该有它。' },
  // 传说
  { id: 'fish_goldkoi', name: '黄金锦鲤', rarity: 'legendary', weight: 0.14, night: 0.2, minCm: 60, maxCm: 110, maxKg: 15, move: 'mixed' },
  { id: 'fish_icefish', name: '冰湖银鱼王', rarity: 'legendary', weight: 0.12, seasons: { spring: 0, summer: 0, autumn: 0, winter: 5 }, minCm: 30, maxCm: 45, maxKg: 0.5, move: 'dart' },
  { id: 'fish_lakedragon', name: '精工湖神龙', rarity: 'legendary', weight: 0.08, night: 2.5, rain: 3, minCm: 150, maxCm: 300, maxKg: 120, move: 'dart' },
  { id: 'fish_paddlefish', name: '白鲟', rarity: 'legendary', weight: 0.06, night: 2, rain: 2, minCm: 200, maxCm: 350, maxKg: 200, move: 'smooth', blurb: '长江里的"象鱼"，传说它已经在人间消失了——可这一条，就在你的鱼钩上。' },
  { id: 'fish_dragongate', name: '龙门鲤', rarity: 'legendary', weight: 0.07, rain: 2, seasons: { spring: 3, summer: 0.3, autumn: 0.3, winter: 0.3 }, minCm: 70, maxCm: 130, maxKg: 18, move: 'mixed', blurb: '传说中跃过龙门的那一条，只在春天的雨里才肯露头。' },
  // 神话：必须满足 needs 里的全部条件（饵 + 竿 + 环境）才会出现；首次钓到的奖励见 mythic.ts
  { id: 'fish_hegongjin', name: '河工锦', rarity: 'mythic', weight: 28, minCm: 80, maxCm: 140, maxKg: 20, move: 'mixed', blurb: '一条身上带着校徽花纹的锦鲤，只有真正钓满过锦鲤的人，才会等到它的回礼。',
    needs: { unlock: { fish: 'fish_koi', n: 20 }, seasons: ['spring'], night: false, baits: ['bait_pro', 'bait_glow', 'bait_season', 'bait_wild', 'bait_magnet', 'bait_myth'], rods: ['rod_carbon', 'rod_golden', 'rod_glow', 'rod_rain', 'rod_frost', 'rod_pickup', 'rod_twin', 'rod_bone'] } },
  { id: 'fish_xuangui', name: '镇湖玄龟', rarity: 'mythic', weight: 24, minCm: 100, maxCm: 180, maxKg: 150, move: 'smooth', barMul: 0.78, blurb: '背上驮着一整座湖的老龟，冬天的夜里才会浮上来换一口气。',
    needs: { baits: ['bait_myth'], rods: ['rod_frost', 'rod_golden', 'rod_bone'], seasons: ['winter'], night: true } },
  { id: 'fish_yinglong', name: '应龙', rarity: 'mythic', weight: 20, minCm: 200, maxCm: 400, maxKg: 300, move: 'dart', burst: true, blurb: '有翼的龙，据说是它招来的雨。暴雨的夜里，水面下有金光一闪而过。',
    needs: { baits: ['bait_myth'], rods: ['rod_rain', 'rod_bone'], rain: true, night: true } },
  // 盲盒限定：只能从盲盒里开出来，不会在湖里钓到
  { id: 'fish_guppy', name: '孔雀鱼', rarity: 'rare', source: 'box', weight: 1, minCm: 3, maxCm: 6, maxKg: 0.005, move: 'dart', blurb: '尾巴像开屏的孔雀——不知道是谁倒进湖里的。' },
  { id: 'fish_neon', name: '热带灯鱼', rarity: 'rare', source: 'box', weight: 1, minCm: 2, maxCm: 4, maxKg: 0.003, move: 'dart', blurb: '身上一条荧蓝的细线，在水里一闪一闪。' },
  { id: 'fish_oranda', name: '龙睛', rarity: 'rare', source: 'box', weight: 1, minCm: 8, maxCm: 15, maxKg: 0.3, move: 'smooth', blurb: '一对鼓出来的大眼睛，鱼缸里的明星。' },
  { id: 'fish_butterfly', name: '蝴蝶鲤', rarity: 'epic', source: 'box', weight: 1, minCm: 30, maxCm: 60, maxKg: 2, move: 'mixed', blurb: '长长的飘带尾，游起来像一只蝴蝶。' },
  { id: 'fish_discus', name: '七彩神仙', rarity: 'epic', source: 'box', weight: 1, minCm: 12, maxCm: 20, maxKg: 0.4, move: 'smooth', blurb: '热带鱼里的"贵族"，一身流光。' },
  // 杂物
  { id: 'junk_boot', name: '旧球鞋', rarity: 'junk', weight: 5 },
  { id: 'junk_weed', name: '水草', rarity: 'junk', weight: 5 },
  { id: 'junk_can', name: '空易拉罐', rarity: 'junk', weight: 3 },
  { id: 'junk_bottle', name: '空饮料瓶', rarity: 'junk', weight: 3 },
];
const BY_ID = new Map(FISH.map((f) => [f.id, f]));
export const fishDef = (id: unknown): FishDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
/** 真正的鱼（不含杂物）：图鉴的分母（含神话鱼和盲盒限定鱼） */
export const REAL_FISH = FISH.filter((f) => f.rarity !== 'junk');
/** 湖里能钓到的"常规"鱼（不含神话和盲盒限定）：按稀有度归一化的那一批 */
export const LAKE_FISH = FISH.filter((f) => f.source !== 'box' && f.rarity !== 'mythic');
export const MYTHIC_FISH = FISH.filter((f) => f.rarity === 'mythic');
export const BOX_FISH = FISH.filter((f) => f.source === 'box');
export const isFish = (id: unknown): boolean => { const d = fishDef(id); return !!d && d.rarity !== 'junk'; };
export const RARITY_NAMES: Record<Rarity, string> = { common: '常见', uncommon: '少见', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话', junk: '杂物' };
/** 稀有度的显示颜色（图鉴、钓到时的卡片） */
export const RARITY_COLORS: Record<Rarity, string> = { common: '#8a8a7a', uncommon: '#3f9a58', rare: '#3b6ea8', epic: '#8a5aa8', legendary: '#e0a020', mythic: '#d0384a', junk: '#7a6a5a' };
/** 稀有度从低到高的顺序（小猫图鉴等用，不含神话） */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** 鱼类图鉴的分组顺序（比上面多一档神话） */
export const FISH_TIERS: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** 拿鱼喂猫：好感度增量（按稀有度） */
export const FISH_FEED_GAIN: Record<Exclude<Rarity, 'junk'>, number> = { common: 5, uncommon: 8, rare: 14, epic: 20, legendary: 30, mythic: 50 };

/**
 * 这一钩要不要全服播报：神话鱼，或破了该玩家的个人纪录。
 * 客户端与服务端共用（服务端结算时判定，客户端只渲染服务端下发的广播）。放宽门槛只改这一处 + 测试。
 */
export function shouldBroadcastCatch(def: FishDef, record: boolean): boolean {
  return def.rarity === 'mythic' || record === true;
}

/**
 * 每一档在湖里的"总权重"（杂物也算一档）：新增 / 删除一条鱼不会改变这一档整体出现的概率，只是在档内重新分。
 * 条件倍率（夜里 / 雨天 / 季节）仍乘在单条鱼上。神话鱼不在这里（权重是绝对值，条件满足才进抽签池）。
 */
export const TIER_TOTAL: Readonly<Record<'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'junk', number>> = { common: 114, uncommon: 44, rare: 16.2, epic: 2.9, legendary: 0.34, junk: 16 };
const TIER_SUM = new Map<Rarity, number>();
for (const f of LAKE_FISH) TIER_SUM.set(f.rarity, (TIER_SUM.get(f.rarity) ?? 0) + f.weight);
/** 归一化后的基础权重（档内相对值已折算到 TIER_TOTAL） */
export function baseWeight(f: FishDef): number {
  if (f.source === 'box') return 0;
  if (f.rarity === 'mythic') return f.weight;
  return f.weight * TIER_TOTAL[f.rarity] / (TIER_SUM.get(f.rarity) ?? f.weight);
}

/** 难度星级 1–5（图鉴里显示）：按稀有度，窜动型（dart）再加一星 */
export function diffStars(def: FishDef): number {
  const base: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 5, junk: 1 };
  return Math.min(5, base[def.rarity] + (def.move === 'dart' && base[def.rarity] < 5 ? 1 : 0));
}
export const MOVE_NAMES: Record<FishMove, string> = { smooth: '慢悠悠', mixed: '时快时慢', dart: '突然窜动' };

/** 习性（图鉴详情用）：时段 / 各季节 / 雨天 */
export function habitat(def: FishDef): { time: 'day' | 'night' | 'any'; seasons: Record<Season, 'more' | 'normal' | 'less' | 'off'>; rain: boolean } {
  const seasons = {} as Record<Season, 'more' | 'normal' | 'less' | 'off'>;
  for (const k of ['spring', 'summer', 'autumn', 'winter'] as const) { const m = def.seasons?.[k] ?? 1; seasons[k] = m <= 0 ? 'off' : m > 1 ? 'more' : m < 1 ? 'less' : 'normal'; }
  const n = def.needs, nt = def.night ?? 1;
  if (n?.seasons) for (const k of ['spring', 'summer', 'autumn', 'winter'] as const) seasons[k] = n.seasons.includes(k) ? 'more' : 'off';
  const time = n?.night === true ? 'night' : n?.night === false ? 'day' : nt > 1 ? 'night' : nt < 1 ? 'day' : 'any';
  return { time, seasons, rain: n?.rain === true || (def.rain ?? 1) > 1 };
}

/** 这种鱼什么时候容易遇到（图鉴里解锁后显示）：夜里/雨天/季节 */
export function habitatText(def: FishDef): string {
  const names: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const out: string[] = [];
  if (def.source === 'box') return '只能从盲盒里开出来';
  if (def.needs) {
    const n = def.needs;
    if (n.seasons) out.push(`只在${n.seasons.map((k) => names[k]).join('、')}天`);
    if (n.night === true) out.push('夜里'); else if (n.night === false) out.push('白天');
    if (n.rain) out.push('下雨时');
    return `${out.join('')}出没（还需要特定的鱼饵和鱼竿）`;
  }
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

/**
 * 抽鱼时的环境：夜里 / 下雨 / 季节会改变各种鱼出现的概率。
 * luck = 鱼竿/鱼饵的好运倍率：稀有 ×luck，史诗/传说 ×luck^1.5（1 = 不变；神话鱼不吃好运）
 * mul = 装备给的额外倍率（特殊竿 / 夜光饵 / 应季饵，见 gear.ts 的 resolveGear）；ignoreEnv = 万能饵（无视夜 / 雨 / 季节，传说和神话除外）
 * only = 指名饵：这一杆只会咬这一种；mythic = 判断这条神话鱼的条件是不是都满足了（不传 = 神话鱼不出现）
 */
export interface FishEnv { night: boolean; rain?: boolean; season?: Season; luck?: number; mul?: (f: FishDef) => number; ignoreEnv?: boolean; only?: string; mythic?: (f: FishDef) => boolean;
  /** 最低稀有度（神话饵 = 'epic'：稀有及以下的鱼、杂物都不会出现）；这一档以上在当前环境下一条都抽不到时，会放宽夜 / 雨 / 季节再抽，见 rollFish */
  floor?: Rarity }
/** 稀有度的高低（杂物最低） */
const rarityRank = (r: Rarity): number => (r === 'junk' ? -1 : FISH_TIERS.indexOf(r));
/** 一条鱼在这个环境下的抽中权重（0 = 抽不到） */
export function fishWeight(f: FishDef, env: FishEnv): number {
  if (f.source === 'box') return 0;
  if (env.only) return f.id === env.only ? 1 : 0;
  if (env.floor && rarityRank(f.rarity) < rarityRank(env.floor)) return 0; // 神话饵：稀有及以下一律不出
  if (f.rarity === 'mythic') return env.mythic?.(f) ? f.weight : 0;
  const luck = env.luck ?? 1, lk = f.rarity === 'rare' ? luck : f.rarity === 'epic' || f.rarity === 'legendary' ? luck ** 1.5 : 1;
  const base = baseWeight(f) * lk;
  if (env.ignoreEnv && f.rarity !== 'legendary') return base;
  return base * (env.night ? f.night ?? 1 : 1) * (env.rain ? f.rain ?? 1 : 1) * (env.season ? f.seasons?.[env.season] ?? 1 : 1) * (env.mul?.(f) ?? 1);
}
/** 抽一条鱼（还没拉上来，只决定是什么、多大）。rnd 返回 [0,1)；尺寸偏小的更常见（取两个随机数里较小的） */
export function rollFish(rnd: () => number, env: FishEnv): { def: FishDef; cm: number } {
  let w = FISH.map((f) => fishWeight(f, env));
  let total = w.reduce((a, b) => a + b, 0);
  if (total <= 0 && env.floor) { // 兜底：这一档以上在当前夜 / 雨 / 季节下一条都抽不到——放宽环境倍率，只按基础权重抽（仍然不会出稀有及以下，也不白白浪费神话饵）
    const relaxed: FishEnv = { night: false, luck: env.luck, floor: env.floor, mythic: env.mythic, ignoreEnv: true };
    w = FISH.map((f) => (f.rarity === 'legendary' && !f.seasons ? baseWeight(f) : fishWeight(f, relaxed)));
    total = w.reduce((a, b) => a + b, 0);
  }
  let r = rnd() * total, i = 0, last = -1;
  for (; i < FISH.length; i++) { if (w[i] <= 0) continue; last = i; if (r < w[i]) break; r -= w[i]; }
  if (i >= FISH.length) i = last >= 0 ? last : FISH.findIndex((f) => f.id === 'junk_bottle');
  const def = FISH[i];
  if (def.minCm === undefined || def.maxCm === undefined) return { def, cm: 0 };
  return { def, cm: rollCm(def, rnd) };
}
/** 抽尺寸：偏小的更常见（取两个随机数里较小的）；杂物没有尺寸 */
export function rollCm(def: FishDef, rnd: () => number): number {
  if (def.minCm === undefined || def.maxCm === undefined) return 0;
  return Math.round(def.minCm + (def.maxCm - def.minCm) * Math.min(rnd(), rnd()));
}

/**
 * 图鉴记录：鱼 id → { n 钓到几条, best 最大尺寸（厘米）, kg 最重的一条（公斤）, first 第一次钓到的日期（东八区日期编号）,
 * last 最近一次的日期编号, perfect 拉鱼"完美"的次数 }；从磁盘来的数据只保留认识的真鱼，新字段没有就不写（老档案兼容）
 */
export interface FishLog { n: number; best: number; kg: number; first?: number; last?: number; perfect?: number }
export function cleanFishLog(raw: unknown): Record<string, FishLog> {
  const out: Record<string, FishLog> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFish(id) || !v || typeof v !== 'object') continue;
    const { n, best, kg, first, last, perfect } = v as Record<string, unknown>;
    const num = (x: unknown, max: number, round: (v: number) => number) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.min(max, round(x)) : 0);
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) {
      const e: FishLog = { n: Math.min(99999, Math.floor(n)), best: num(best, 999, Math.floor), kg: num(kg, 999, (v) => Math.round(v * 100) / 100) };
      const f = num(first, 99999, Math.floor), l = num(last, 99999, Math.floor), pf = num(perfect, 99999, Math.floor);
      if (f) e.first = f; if (l) e.last = l; if (pf) e.perfect = pf;
      out[id] = e;
    }
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
