/**
 * 猫系精灵（客户端与服务器共用）：校园里 24 种毛色（含 4 种校猫专用毛色）各自一条进化线（幼崽 → 成年 → 王者），
 * 每条线有自己的属性、种族值体系和美术（tools/mons/cat-art.ts 按毛色程序化生成正面/背面 64×64）。
 * 技能是"老吴"系列（老吴咆哮、老吴撼地掌……）：每个属性 4 个——物理/特殊 × 普通/终极。
 * 全部由下面的表算出来，不需要逐个物种手写；物种 id = c<毛色两位><阶段 a/b/c>，如 c00a = 橘猫幼崽。
 */
import { COAT_LABELS, COAT_RARITY } from './cats';
import type { Base, Move, MoveCat, MoveStat, Species } from './mons';

export const CAT_EVO_LV = [16, 32] as const;
const STEM = ['橘', '黑', '白', '三花', '奶牛', '灰', '狸花', '橘白', '蓝白', '燕尾', '玳瑁', '银渐', '金渐', '银虎', '蓝', '奶油', '暹罗', '布偶', '异瞳', '胖橘', '胡椒', '芝士', '蒲公英', '领结'] as const;
const SUFFIX = ['崽', '猫', '猫王'] as const;
const TIER = ['a', 'b', 'c'] as const;

type Arche = 'bruiser' | 'tank' | 'speed' | 'mage' | 'balanced' | 'glass';
/** 体系（种族值分配系数，顺序：生命/攻击/防御/特攻/特防/速度） */
const ARCHE: Record<Arche, readonly number[]> = {
  bruiser: [1.1, 1.35, 1.0, 0.65, 0.8, 0.9], tank: [1.4, 0.9, 1.35, 0.65, 1.0, 0.5], speed: [0.8, 1.05, 0.7, 1.0, 0.8, 1.55],
  mage: [0.9, 0.55, 0.8, 1.5, 1.25, 1.0], balanced: [1, 1, 1, 1, 1, 1], glass: [0.8, 1.4, 0.6, 1.3, 0.65, 1.25],
};
/** 每种毛色的属性、体系和一句话（顺序同 COAT_LABELS） */
const LINE: { types: [string] | [string, string]; arche: Arche; blurb: string }[] = [
  { types: ['火'], arche: 'bruiser', blurb: '橘猫的热情是真的会冒火花，晒太阳时最危险。' },
  { types: ['恶', '幽灵'], arche: 'glass', blurb: '夜里一闪而过的黑影，你以为是错觉。' },
  { types: ['冰'], arche: 'mage', blurb: '雪一样的白猫，走过的地方会结一层薄霜。' },
  { types: ['妖精'], arche: 'balanced', blurb: '三种颜色是三种心情，今天是哪一种全看天气。' },
  { types: ['格斗', '一般'], arche: 'bruiser', blurb: '奶牛花纹，一拳下去像一头小牛撞过来。' },
  { types: ['钢'], arche: 'tank', blurb: '灰扑扑的外表下是一身铁打的肉垫。' },
  { types: ['草', '格斗'], arche: 'speed', blurb: '狸花猫，灌木丛里的老猎手，抓老鼠从不失手。' },
  { types: ['火', '一般'], arche: 'balanced', blurb: '一半橘一半白，性格也一半热情一半高冷。' },
  { types: ['水'], arche: 'mage', blurb: '蓝白相间，像湖面上翻起的一朵小浪。' },
  { types: ['超能力'], arche: 'mage', blurb: '燕尾服绅士，走路带风，念力拍人不用手。' },
  { types: ['地面', '恶'], arche: 'bruiser', blurb: '玳瑁色的脾气像泥土一样沉，发起火来会震地。' },
  { types: ['钢', '冰'], arche: 'tank', blurb: '银渐层的毛在月光下像一层冰甲。' },
  { types: ['电'], arche: 'speed', blurb: '金渐层炸毛的时候，毛尖会噼啪起电火花。' },
  { types: ['格斗', '钢'], arche: 'glass', blurb: '银虎斑天生一副硬汉脸，肉垫比铁还硬。' },
  { types: ['一般', '地面'], arche: 'tank', blurb: '圆滚滚的蓝猫，往那一趴，路都堵了。' },
  { types: ['妖精'], arche: 'mage', blurb: '奶油色的甜心，撒个娇谁都没办法。' },
  { types: ['超能力', '幽灵'], arche: 'speed', blurb: '暹罗猫的蓝眼睛能看穿人心，也能看穿零食藏在哪。' },
  { types: ['妖精', '冰'], arche: 'tank', blurb: '布偶猫软得像一团云，倒下去能压扁一排对手。' },
  { types: ['超能力', '妖精'], arche: 'glass', blurb: '一蓝一黄的异色瞳，盯着你看时世界都慢了半拍。' },
  { types: ['一般'], arche: 'tank', blurb: '胖橘：能躺着绝不坐着，一顿能吃三顿的量。' },
  { types: ['草'], arche: 'speed', blurb: '灰白狸花，背上的条纹像撒了一把黑胡椒，一阵风似的窜过草丛。' },
  { types: ['一般', '妖精'], arche: 'tank', blurb: '白底橘斑，脸上像打翻了一勺芝士酱；吃饭的时候谁也别想靠近。' },
  { types: ['妖精', '飞行'], arche: 'mage', blurb: '奶白长毛配深色的大尾巴，像一朵会走路的蒲公英，一阵风就飘起来。' },
  { types: ['一般', '超能力'], arche: 'balanced', blurb: '白胸口像系着领结，青色的眼睛有点狡黠，谁路过都想跟它握个手。' },
];
const RARITY_BONUS = { common: 0, uncommon: 15, rare: 30, epic: 40, legendary: 50, mythic: 60, junk: 0 } as const;
const STAGE_BST = [300, 400, 500] as const;
const STAGE_CATCH = [0.2, 0.1, 0.04] as const;

/** 老吴系列技能名：属性 → [物理, 特殊] */
const MOVE_NAME: Record<string, [string, string]> = {
  一般: ['抓挠', '咆哮'], 火: ['烈焰爪', '火焰喷嚏'], 水: ['水花拳', '水炮'], 电: ['电光爪', '静电呼噜'], 草: ['落叶爪', '花粉喷嚏'], 冰: ['寒霜掌', '冰霜哈气'],
  格斗: ['猫猫拳', '气合吼'], 毒: ['毒牙', '毒雾'], 地面: ['撼地掌', '沙尘喷嚏'], 飞行: ['旋风尾', '旋风吼'], 超能力: ['念力拍', '念力凝视'], 虫: ['扑蝶', '蜂鸣喵'],
  岩石: ['岩崩掌', '落石吼'], 幽灵: ['鬼影爪', '幽灵凝视'], 龙: ['龙尾甩', '龙息'], 恶: ['暗袭', '暗影嗷'], 钢: ['钢铁肉垫', '金属嘶鸣'], 妖精: ['月光踩奶', '月光呼噜'],
};
export const catMoveId = (el: string, k: 'p50' | 's50' | 'p85' | 's85') => `cat:${el}:${k}`;

/** 老吴系列四档各自附带的能力变化：物理降对方防御（20%），特殊降对方特攻（30%） */
const CAT_STAT: Record<'p50' | 's50' | 'p85' | 's85', MoveStat> = {
  p50: { k: 'def', d: -1, target: 'foe', chance: 20 },
  p85: { k: 'def', d: -1, target: 'foe', chance: 20 },
  s50: { k: 'spa', d: -1, target: 'foe', chance: 30 },
  s85: { k: 'spa', d: -1, target: 'foe', chance: 30 },
};

/** 老吴系列技能：每个属性 4 个。特殊技能（咆哮 / 喷嚏 / 呼噜…）有 30% 概率降低对方特攻，物理技能有 20% 概率降低对方防御 */
export function catMoves(elements: readonly string[]): Move[] {
  const out: Move[] = [];
  for (const el of elements) {
    const [p, s] = MOVE_NAME[el] ?? ['抓挠', '咆哮'];
    for (const [k, cat, power, acc, pp, name] of [
      ['p50', 'physical', 50, 100, 25, `老吴${p}`], ['s50', 'special', 50, 100, 25, `老吴${s}`],
      ['p85', 'physical', 85, 90, 15, `老吴终极${p}`], ['s85', 'special', 85, 90, 15, `老吴终极${s}`],
    ] as [('p50' | 's50' | 'p85' | 's85'), MoveCat, number, number, number, string][]) out.push({ id: catMoveId(el, k), name, type: el, cat, power, acc, pp, stat: CAT_STAT[k] });
  }
  return out;
}

const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; return (Math.imul(h, 2246822519) >>> 0) / 4294967296; };

export const catSpeciesId = (coat: number, stage: 1 | 2 | 3) => `c${String(coat).padStart(2, '0')}${TIER[stage - 1]}`;
/** 登录赠送的「耄耋」猫的物种 id */
export const DM_ID = 'dm';
export const DM_LEVEL = 10;
export const isCatSpecies = (id: string) => id === DM_ID || /^c\d\d[abc]$/.test(id);

function build(): Species[] {
  const out: Species[] = [];
  for (let coat = 0; coat < LINE.length; coat++) {
    const ln = LINE[coat], bonus = RARITY_BONUS[COAT_RARITY[coat]];
    for (const stage of [1, 2, 3] as const) {
      const bst = STAGE_BST[stage - 1] + bonus + Math.round(hash(coat * 7 + stage) * 16 - 8); // 每只略有差异
      const w = ARCHE[ln.arche].map((m, k) => m * (0.94 + hash(coat * 13 + k) * 0.12)), sum = w.reduce((a, b) => a + b, 0);
      const base = w.map((x) => Math.max(20, Math.round((x / sum) * bst))) as unknown as Base;
      const phys = base[1] >= base[3], [t0, t1] = ln.types, pick = (el: string, big: boolean, p: boolean) => catMoveId(el, `${p ? 'p' : 's'}${big ? '85' : '50'}` as 'p50');
      const normal = t0 === '一般';
      const learnset = [
        { lv: 1, id: catMoveId('一般', 'p50') }, { lv: 1, id: normal ? catMoveId('一般', 's50') : pick(t0, false, phys) }, { lv: 6, id: catMoveId('一般', 's50') }, { lv: 10, id: pick(t0, false, !phys) },
        ...(t1 ? [{ lv: 14, id: pick(t1, false, phys) }] : []), { lv: 18, id: pick(t0, true, phys) },
        ...(t1 ? [{ lv: 24, id: pick(t1, true, !phys) }] : []), { lv: 28, id: pick(t0, true, !phys) }, { lv: 34, id: catMoveId('一般', 'p85') },
      ].filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);
      const sp: Species = {
        id: catSpeciesId(coat, stage), no: 100 + coat * 3 + stage, name: `${STEM[coat]}${SUFFIX[stage - 1]}`, types: ln.types, base,
        catch: STAGE_CATCH[stage - 1] * (COAT_RARITY[coat] === 'common' ? 1 : COAT_RARITY[coat] === 'uncommon' ? 0.7 : 0.45), desc: ln.blurb,
        learnset, noShiny: true, coat, stage,
        chain: [catSpeciesId(coat, 1), catSpeciesId(coat, 2), catSpeciesId(coat, 3)],
        ...(stage < 3 ? { evo: { to: catSpeciesId(coat, (stage + 1) as 2 | 3), lv: CAT_EVO_LV[stage - 1] } } : {}),
      };
      out.push(sp);
    }
  }
  return out;
}
export const CAT_SPECIES: readonly Species[] = build();
export const CAT_COAT_LABELS = COAT_LABELS;

/** 一只校园小猫在对战里的形态：等级由猫编号和稀有度决定（10~18，稀有的更强），形态按等级走进化链 */
export function catBattleLevel(catId: number, coat: number): number {
  const rar = COAT_RARITY[coat] ?? 'common';
  return 10 + Math.floor(hash(catId * 31 + 7) * 8) + (rar === 'rare' ? 3 : rar === 'uncommon' ? 1 : 0);
}

// ------------------------------------------------------------------ 耄耋（每个玩家登录赠送的橘猫）
/**
 * 「耄耋」：网络上"圆头耄耋"的梗——一只脾气很大的橘色流浪猫，生气时耳朵压平、脑袋看起来是圆的，
 * 动不动就哈气，弓起背来像一条龙。这里把它做成一只强力的、技能全面的一般系猫精灵（只借梗的形象，画面是我们自己画的）：
 * 5 个技能槽：默认带哈气、圆头冲撞、一般系的两招和格斗；地面/火/水/电/冰的老吴技能可以随时在精灵面板换上来。
 */
export const DM_MOVES: Move[] = [
  { id: 'dm:hiss', name: '耄耋哈气', type: '一般', cat: 'special', power: 70, acc: 100, pp: 20 },
  { id: 'dm:round', name: '圆头冲撞', type: '一般', cat: 'physical', power: 75, acc: 95, pp: 20 },
];
export const DM_SPECIES: Species = {
  id: DM_ID, no: 99, name: '耄耋', types: ['一般'], base: [78, 82, 72, 82, 72, 80], catch: 0.02, noShiny: true, coat: 0, moveSlots: 5,
  desc: '圆头耄耋：耳朵一压，脑袋就圆了；背一弓，像条龙；一开口就是哈——气。传说它的叫声听上去像“老吴”。',
  learnset: [
    { lv: 1, id: catMoveId('地面', 'p50') }, { lv: 1, id: catMoveId('火', 's50') }, { lv: 2, id: catMoveId('水', 's50') }, { lv: 2, id: catMoveId('电', 's50') }, { lv: 2, id: catMoveId('冰', 's50') },
    { lv: 3, id: catMoveId('一般', 'p50') }, { lv: 4, id: catMoveId('一般', 's50') }, { lv: 5, id: 'dm:hiss' }, { lv: 6, id: 'dm:round' }, { lv: 7, id: catMoveId('格斗', 'p50') },
  ],
};
