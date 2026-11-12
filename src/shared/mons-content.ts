/**
 * 当前启用的精灵内容包（客户端与服务器共用）：开放包 = 18 属性相克表（Pokémon Showdown，MIT）+
 * Zoonami CC0 怪物包美术 + 我们自己的 10 只精灵。数据在 data/mons/packs/open/。
 * 本机的"本地包"（data/mons/packs/local-*）不在这里引用，所以不会被打进构建产物。
 */
import elements from '../../data/mons/packs/open/elements.json';
import species from '../../data/mons/packs/open/species.json';
import zones from '../../data/mons/zones.json';
import type { Zone } from './wild';
import { makeContent, type Base, type ElementPack, type Species } from './mons';
import { CAT_SPECIES, DM_MOVES, DM_SPECIES, catMoves } from './cat-mons';
import { ALL_ND_MOVES } from './nondamage-moves';

export interface OpenSpecies extends Species { art: { pack: string; n: number } }

const SPECIES: OpenSpecies[] = (species as unknown as (Omit<OpenSpecies, 'base'> & { base: number[] })[]).map((s) => ({ ...s, base: s.base as unknown as Base }));
const ELEMENTS = elements as unknown as ElementPack;
// 开放包按属性各给 1–2 个非伤害招式（机制复用，名字按属性风味）
const ND_BY_TYPE: Record<string, string[]> = {
  火: ['nd:swords'], 水: ['nd:regen'], 电: ['nd:agility'], 草: ['nd:drain', 'nd:small'],
  冰: ['nd:iron'], 格斗: ['nd:swords'], 一般: ['nd:small'], 岩石: ['nd:iron', 'nd:guard'],
  幽灵: ['nd:clone'], 恶: ['nd:smoke'], 飞行: ['nd:agility'], 超能力: ['nd:regen'],
  虫: ['nd:iron'], 钢: ['nd:iron', 'nd:guard'], 地面: ['nd:iron'], 毒: ['nd:smoke'],
  龙: ['nd:swords'], 妖精: ['nd:small'],
};
const ND_LEVEL = 12;
const SPECIES_ND: Species[] = SPECIES.map((sp) => {
  const add = [...new Set(sp.types.flatMap((t) => ND_BY_TYPE[t] ?? []))];
  if (!add.length) return sp;
  return { ...sp, learnset: [...(sp.learnset ?? []), ...add.map((id) => ({ lv: ND_LEVEL, id }))] };
});
export const CONTENT = makeContent(ELEMENTS, [...SPECIES_ND, ...CAT_SPECIES, DM_SPECIES], [...catMoves(ELEMENTS.elements.map((e) => e.id)), ...DM_MOVES, ...ALL_ND_MOVES]);
export const SPECIES_LIST: readonly OpenSpecies[] = SPECIES;
/** 任意物种（开放包的 10 只 + 猫系 60 阶） */
export const speciesOf = (id: string): Species | undefined => CONTENT.species.get(id);

/** 初始精灵三选一：火 / 水冰 / 草毒（焰尾、湖鲸、葱头） */
export const STARTERS: readonly string[] = ['o01', 'o02', 'o04'];
export const STARTER_LEVEL = 5;

/** 精灵图地址（相对页面；由 tools/mons/build-art.ts 生成到 public/assets/generated/mons/）。alt = 备用配色（异色） */
export const monArt = (spId: string, side: 'front' | 'back', alt = false): string => `assets/generated/mons/${spId}-${side}${alt ? '-alt' : ''}.png`;

/** 野外遭遇区域（格坐标矩形 + 出没表） */
export const ZONES: readonly Zone[] = zones as unknown as Zone[];
