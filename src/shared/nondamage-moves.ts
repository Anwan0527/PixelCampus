/**
 * 非伤害招式（客户端与服务器共用）：回复 / 变化 / 保护三类，外加命中与闪避的上下调整。
 * 机制只有一套，名字按属性 / 物种给不同风味；数值统一，避免平衡分叉。
 *
 * power = 0，`heal` / `guard` / `stat` 描述效果；`desc` 是菜单里的一行说明。
 */
import type { Move } from './mons';

/** 回复类 */
export const HEAL_MOVES: Move[] = [
  { id: 'nd:sleep', name: '打盹', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 5, heal: { ratio: 1, selfSleep: 2 }, desc: '回满生命，但会睡 2 回合' },
  { id: 'nd:regen', name: '自我再生', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 5, heal: { ratio: 0.5 }, desc: '回复 1/2 生命' },
  { id: 'nd:small', name: '小憩', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, heal: { ratio: 0.25 }, desc: '回复 1/4 生命' },
  { id: 'nd:drain', name: '吸取', type: '草', cat: 'special', power: 40, acc: 100, pp: 10, drain: 0.5, desc: '造成伤害的一半回复自身' },
];

/** 变化类：升自己 / 降对方 */
export const STAT_MOVES: Move[] = [
  { id: 'nd:swords', name: '剑舞', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, stat: { k: 'atk', d: 2, target: 'self' }, desc: '自身攻击 +2' },
  { id: 'nd:iron', name: '铁壁', type: '钢', cat: 'physical', power: 0, acc: 100, pp: 10, stat: { k: 'def', d: 2, target: 'self' }, desc: '自身防御 +2' },
  { id: 'nd:agility', name: '高速移动', type: '超能力', cat: 'special', power: 0, acc: 100, pp: 10, stat: { k: 'spe', d: 2, target: 'self' }, desc: '自身速度 +2' },
  { id: 'nd:glare', name: '瞪眼', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 15, stat: { k: 'def', d: -1, target: 'foe' }, desc: '对方防御 −1' },
  { id: 'nd:clone', name: '影分身', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, stat: { k: 'eva', d: 1, target: 'self' }, desc: '自身闪避 +1' },
  { id: 'nd:smoke', name: '烟雾', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 15, stat: { k: 'acc', d: -1, target: 'foe' }, desc: '对方命中 −1' },
];

/** 保护类 */
export const GUARD_MOVES: Move[] = [
  { id: 'nd:guard', name: '守住', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, guard: true, desc: '本回合免伤（连续使用成功率减半）' },
];

/** 猫系「老吴」风味的非伤害招式：机制和上面完全一样，只是名字不同 */
export const CAT_ND_MOVES: Move[] = [
  { id: 'catnd:hiss-guard', name: '老吴哈气护体', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, guard: true, desc: '本回合免伤（连续使用成功率减半）' },
  { id: 'catnd:nap', name: '老吴打盹', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 5, heal: { ratio: 1, selfSleep: 2 }, desc: '回满生命，但会睡 2 回合' },
  { id: 'catnd:lick', name: '老吴舔毛', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, heal: { ratio: 0.25 }, desc: '回复 1/4 生命' },
  { id: 'catnd:stare', name: '老吴瞪眼', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 15, stat: { k: 'def', d: -1, target: 'foe' }, desc: '对方防御 −1' },
  { id: 'catnd:step', name: '老吴影步', type: '幽灵', cat: 'physical', power: 0, acc: 100, pp: 10, stat: { k: 'eva', d: 1, target: 'self' }, desc: '自身闪避 +1' },
  { id: 'catnd:scratch', name: '老吴磨爪', type: '一般', cat: 'physical', power: 0, acc: 100, pp: 10, stat: { k: 'atk', d: 2, target: 'self' }, desc: '自身攻击 +2' },
];

/** 中文名 → 招式 id（内容包的 learnset 用） */
export const ND_BY_NAME: Record<string, string> = Object.fromEntries(
  [...HEAL_MOVES, ...STAT_MOVES, ...GUARD_MOVES].map((m) => [m.name, m.id]),
);

export const ALL_ND_MOVES: Move[] = [...HEAL_MOVES, ...STAT_MOVES, ...GUARD_MOVES, ...CAT_ND_MOVES];
