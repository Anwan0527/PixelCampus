/**
 * 小猫的"设定"（客户端与服务器共用）：档案、喜好、故事、回礼表、成就判定用的名单。
 * 校猫（编号 46 起）有手写的档案（campus-cats.ts）；其余的猫按毛色和编号生成一份简短的通用档案，
 * 所以面板、图鉴对任何一只猫都能显示"档案"。
 */
import { COAT_LABELS, GIFT_DAILY_CAP, LEVEL_NAMES, REAL_CAT_COUNT, REAL_CAT_FIRST, isRealCat, type CatDef } from './cats';
import { GROUP_NAMES, REAL_CATS, type CatGroup, type RealCat } from './campus-cats';
import type { Gain } from './items';

export { GROUP_NAMES, REAL_CATS, GIFT_DAILY_CAP };
export type { CatGroup, RealCat };

/** 档案：任何一只猫都有 */
export interface CatProfile {
  /** 校猫（真猫的分身）才有手写的档案 */
  real: boolean;
  /** 毛色的叫法 */
  coatLabel: string;
  /** 它出没的地方 / 一句话外貌 / 性格关键词 */
  place: string; look: string; trait: string;
  /** 喜欢的口味（物品 id；喂到最爱好感翻倍） */
  likes: string[];
  /** 4 段档案故事，好感到「眼熟 / 熟悉 / 亲密 / 挚友」解锁（stories[i] 在等级 i+1 解锁） */
  stories: string[];
  /** 摸它时偶尔说的话 */
  quips: string[];
  /** 校猫的所在组（一A、三B…）；其他猫没有 */
  group?: CatGroup;
}

/** 校猫的原始档案（按编号），不是校猫返回 undefined */
export const realCatOf = (id: number): RealCat | undefined => (isRealCat(id) ? REAL_CATS[id - REAL_CAT_FIRST] : undefined);

/** 通用档案用的口味：猫粮、猫条、几种常见的鱼——按猫编号固定挑 */
const GENERIC_LIKES = ['cat_food', 'cat_treat', 'fish_crucian', 'fish_gudgeon', 'fish_shrimp', 'fish_loach', 'fish_whitebait', 'fish_carp'] as const;
const GENERIC_TRAITS = ['慵懒', '好奇', '胆小', '爱撒娇', '高冷', '贪吃', '机灵', '温和'] as const;

/** 档案（校猫手写，其余按毛色/编号生成） */
export function catProfile(def: Pick<CatDef, 'id' | 'name' | 'coat'>): CatProfile {
  const coatLabel = COAT_LABELS[def.coat] ?? '小猫';
  const r = realCatOf(def.id);
  if (r) return { real: true, coatLabel, place: r.place, look: r.look, trait: r.trait, likes: r.likes, stories: [...r.stories], quips: [...r.quips], group: r.group };
  const n = def.name;
  return {
    real: false, coatLabel, place: '校园里', look: `一只${coatLabel}。`, trait: GENERIC_TRAITS[def.id % GENERIC_TRAITS.length],
    likes: [GENERIC_LIKES[(def.id * 5 + def.coat) % GENERIC_LIKES.length]],
    stories: [
      `${n}总在自己的老地方转悠，见了人先看看，再决定要不要靠近。`,
      `${n}喜欢晒太阳，晴天一定能在固定的那块地方找到它。`,
      `熟了之后，${n}会在你经过的时候喵一声，像是在说"又来啦"。`,
      `${n}大概已经把你当成校园里的老朋友了。`,
    ],
    quips: [`${n}舒服地眯起了眼睛。`, `${n}轻轻蹭了蹭你的手。`],
  };
}

/** 档案里第几段故事已解锁（等级 ≥ i+1），返回已解锁的段数（0..4） */
export const storiesUnlocked = (level: number) => Math.max(0, Math.min(4, level));
/** 喜好什么时候告诉你：熟悉（2 档）起，或者已经喂到过它的最爱 */
export const LIKES_LEVEL = 2;
export const likesKnown = (level: number, fv: boolean) => fv || level >= LIKES_LEVEL;
/** 是不是它的最爱 */
export const isLiked = (def: Pick<CatDef, 'id' | 'name' | 'coat'>, item: string) => catProfile(def).likes.includes(item);

/** 摸它时的话：校猫偶尔（约 1/3）说自己的口头禅，其余用通用句；rnd 是 0..1 的随机数，方便测试 */
export function petLine(def: Pick<CatDef, 'id' | 'name' | 'coat'>, rnd: number): string {
  const p = catProfile(def);
  if (p.real && rnd < 0.4) return p.quips[Math.floor((rnd / 0.4) * p.quips.length) % p.quips.length];
  return `${def.name}舒服地眯起了眼睛`;
}

// ------------------------------------------------------------------ 回礼 / 升档奖励（和钓鱼联动）
/**
 * 回礼：好感到「亲密」以上，每天第一次和一只猫互动时，有概率收到它叼来的小礼物（每只猫每天一次，所有猫加起来每天最多 GIFT_DAILY_CAP 份）。
 * 档位越高，礼物越好——后面几档是钓鱼里的稀有东西：盲盒（漂流瓶 / 旧木箱 / 沉船箱）、磁铁饵、万能饵、珍珠、龙鳞、神话饵。
 */
export const GIFT_CHANCE = [0, 0, 0, 0.35, 0.5, 0.7, 1] as const;
export const GIFT_TABLE: Record<number, readonly { w: number; gain: Gain }[]> = {
  3: [{ w: 5, gain: { id: 'ginkgo_leaf', n: 1 } }, { w: 3, gain: { id: 'bait_pro', n: 2 } }, { w: 1, gain: { id: 'bait_season', n: 1 } }],
  4: [{ w: 3, gain: { id: 'bait_pro', n: 3 } }, { w: 2, gain: { id: 'bait_glow', n: 2 } }, { w: 2, gain: { id: 'bait_wild', n: 2 } }, { w: 2, gain: { id: 'pearl', n: 1 } }, { w: 2, gain: { id: 'box_bottle', n: 1 } }],
  5: [{ w: 3, gain: { id: 'box_crate', n: 1 } }, { w: 2, gain: { id: 'box_bottle', n: 1 } }, { w: 2, gain: { id: 'bait_magnet', n: 2 } }, { w: 2, gain: { id: 'pearl', n: 2 } }, { w: 1, gain: { id: 'bait_any', n: 1 } }, { w: 1, gain: { id: 'relic_badge', n: 1 } }],
  6: [{ w: 3, gain: { id: 'box_crate', n: 1 } }, { w: 2, gain: { id: 'box_wreck', n: 1 } }, { w: 2, gain: { id: 'dragon_scale', n: 1 } }, { w: 2, gain: { id: 'pearl', n: 2 } }, { w: 1, gain: { id: 'bait_any', n: 2 } }, { w: 1, gain: { id: 'bait_myth', n: 1 } }],
};
/** 按档位和 0..1 的随机数挑一份回礼（不到「亲密」没有） */
export function pickGift(level: number, rnd: number): Gain | null {
  const t = GIFT_TABLE[Math.min(6, level)];
  if (!t) return null;
  const total = t.reduce((a, b) => a + b.w, 0);
  let r = rnd * total;
  for (const e of t) { if (r < e.w) return { ...e.gain }; r -= e.w; }
  return { ...t[t.length - 1].gain };
}
/** 升到某一档时的一次性奖励（挚友以下沿用老规则，见服务器 bump；这里是新增的两档） */
export const LEVEL_UP_GIFTS: Record<number, readonly Gain[]> = {
  5: [{ id: 'box_crate', n: 1 }, { id: 'bait_pro', n: 3 }],
  6: [{ id: 'box_wreck', n: 1 }, { id: 'pearl', n: 2 }],
};

// ------------------------------------------------------------------ 成就判定用的名单
/** 某一组校猫的编号 */
export const groupIds = (g: CatGroup): number[] => REAL_CATS.map((c, i) => (c.group === g ? REAL_CAT_FIRST + i : -1)).filter((i) => i >= 0);
export const ALL_REAL_IDS: readonly number[] = Array.from({ length: REAL_CAT_COUNT }, (_, i) => REAL_CAT_FIRST + i);

/** 一组校猫是不是都"认识"了（好感度 > 0）；aff = 猫编号 → 好感 */
export const metAll = (ids: readonly number[], aff: Record<string, number>) => ids.length > 0 && ids.every((i) => (aff[i] ?? 0) > 0);
/** 好感到了某一档的猫有几只 */
export const countAtLevel = (aff: Record<string, number>, minLevel: number, levelOf: (a: number) => number) => Object.values(aff).filter((a) => levelOf(a) >= minLevel).length;
export const metCount = (aff: Record<string, number>) => Object.values(aff).filter((a) => a > 0).length;

/** 面板里"离下一档还差多少、下一档解锁什么"的提示用 */
export const levelName = (lv: number) => LEVEL_NAMES[Math.max(0, Math.min(LEVEL_NAMES.length - 1, lv))];
