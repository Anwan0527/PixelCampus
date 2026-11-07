/**
 * 校园小猫（客户端与服务器共用）。
 * 小猫的"家"（出生位置、毛色、名字）由世界里的行人出生点按固定种子挑出来——服务器和每个客户端算出来的完全一样，
 * 所以大家在同一个地方看到同一只猫；小猫在家附近的游走只发生在各自的客户端，不同步。
 * 好感度跟着玩家的身份存在服务器上，服务器按小猫的"家"判断玩家是不是真的在猫附近。
 */
import { TILE } from '../core/const';
import type { Gain } from './items';
import { cleanText } from './profile';
import type { Rarity } from './fishing';
import { REAL_CATS } from './campus-cats';

export interface CatDef { id: number; name: string; coat: number; /** 家（像素坐标，脚点） */ hx: number; hy: number }

/** 毛色编号 → 名字候选（毛色对应 tools/art/cats.ts 的 COATS 顺序） */
export const COAT_NAMES: string[][] = [
  ['橘座', '大黄', '栗子', '桂花', '南瓜'],   // 0 橘猫
  ['煤球', '小黑', '芝麻', '墨墨'],           // 1 黑猫
  ['雪饼', '汤圆', '年糕', '糯米', '元宵'],   // 2 白猫
  ['三花', '花卷', '点点', '阿花'],           // 3 三花
  ['奶牛', '奶盖', '包子', '熊猫'],           // 4 奶牛猫
  ['小灰', '云朵', '烟灰', '灰灰'],           // 5 银渐层/灰猫
  // 6 起是第二批毛色（tools/art/cat-rig.ts 的 CAT_PRESETS 顺序），只给"新增的猫"用——老猫的毛色和名字冻结，随机分布的猫永远只从前 6 种里挑
  ['虎妞'], ['白袜'], ['云雀'], ['礼服'], ['琥珀'], ['银杏'], ['金桂'], ['灰虎'], ['蓝莓'], ['奶茶'], ['咖啡'], ['棉花'], ['月牙'], ['肉球'],
  // 20 起是「校猫」专用毛色（照真猫的照片补的）：只有 campus-cats.ts 里的校猫用，不参与随机分布，名字栏只是占位
  ['胡椒'], ['芝士'], ['蒲公英'], ['领结'],
];
export const COAT_COUNT = COAT_NAMES.length;
/** 毛色的叫法与稀有度（动物图鉴用；稀有度沿用钓鱼的五档名字与颜色）：编号对应 tools/art/cat-rig.ts 的 CAT_PRESETS */
export const COAT_LABELS = ['橘猫', '黑猫', '白猫', '三花', '奶牛猫', '灰猫', '狸花', '橘白', '蓝白', '燕尾服', '玳瑁', '银渐层', '金渐层', '银虎斑', '蓝猫', '奶油', '暹罗', '布偶', '异瞳白猫', '胖橘', '灰白狸花', '白底橘斑', '奶白长毛', '青眼燕尾服'] as const;
export const COAT_RARITY: readonly Rarity[] = ['common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'uncommon', 'uncommon', 'uncommon', 'uncommon', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'common', 'common', 'common', 'uncommon', 'common'];

export const CAT_COUNT = 28;
/** 猫在家附近游走的半径、被吓跑时最远能离家多远（牵绳长度，客户端保证猫不会超出）、玩家够得着的距离（像素） */
export const CAT_WANDER = 48;
export const CAT_LEASH = 80;
export const CAT_REACH = 32;
/** 服务器校验：玩家离猫的"家"不超过 牵绳长度 + 够得着的距离 + 网络/位置延迟余量（旧值 116 比猫被吓跑后的实际位置还近，会出现"面板开了但提示离得太远"） */
export const CAT_SERVER_REACH = CAT_LEASH + CAT_REACH + 48;

export const PET_COOLDOWN_MS = 6000;
export const FEED_COOLDOWN_MS = 20000;
export const PET_GAIN = 1;
export const FEED_GAIN = { cat_food: 3, cat_treat: 8 } as const;

/**
 * 好感度档位（2026-11-08 起 7 档）：到达各数值进入下一档。
 *   陌生 0   ：可以摸、喂；见到奔跑/骑车的人会躲
 *   眼熟 4   ：不再躲你；解锁档案的第 1 段故事
 *   熟悉 12  ：升档奖励猫条；投喂时有机会叼来银杏叶回赠；它会悄悄告诉你它爱吃什么
 *   亲密 30  ：升档奖励猫条 ×2 + 爱猫徽章；**可以让它跟着你走**、**给它取一个只有你看得到的专属名字**；每天第一次互动可能收到回礼
 *   挚友 80  ：升档奖励猫条 ×3 + 成就/称号「猫咪守护者」；**可以抱抱它、收服为精灵**；回礼更好
 *   知己 200 ：升档奖励旧木箱 + 香饵 ×3；回礼里会有盲盒、磁铁饵、万能饵
 *   家人 500 ：升档奖励沉船箱 + 珍珠 ×2；回礼里有机会出龙鳞、神话饵
 * 涨好感：摸一摸 +1（每猫 6 秒冷却）、猫粮 +3、猫条 +8、鱼 +5~+50（每猫 20 秒冷却；喂到它的最爱翻倍）、抱抱 +2、每天第一次互动额外 +2（连续探望还会加）。
 */
export const LEVEL_AT = [0, 4, 12, 30, 80, 200, 500] as const;
export const LEVEL_NAMES = ['陌生', '眼熟', '熟悉', '亲密', '挚友', '知己', '家人'] as const;
/** 每一档解锁的东西（面板里显示） */
export const LEVEL_PERKS = ['可以摸一摸、喂食', '不再躲着你；档案第 1 段故事', '投喂时可能叼来银杏叶；它会告诉你它爱吃什么', '可以带它走、给它取专属名字；每天第一次互动可能有回礼', '称号「猫咪守护者」；可以抱抱它、收服为精灵', '回礼里出现盲盒、磁铁饵、万能饵', '回礼里有机会出龙鳞、神话饵'] as const;
/** 跟随、专属改名需要到达的档位（"亲密"）；抱抱、收服为精灵需要的档位（"挚友"） */
export const BOND_LEVEL = 3;
export const HUG_LEVEL = 4;
export const TAME_AFF_LEVEL = 4;
/** 收服为精灵需要的好感度（= 挚友那一档的起点） */
export const TAME_AT = LEVEL_AT[TAME_AFF_LEVEL];
export const MAX_LEVEL_IDX = LEVEL_AT.length - 1;
export const CAT_NICK_MAX = 8;
export const catLevel = (aff: number) => LEVEL_AT.reduce<number>((lv, at, i) => (aff >= at ? i : lv), 0);
/** 距离下一档还差多少（已满档返回 0） */
export const catNext = (aff: number) => { const lv = catLevel(aff); return lv >= LEVEL_AT.length - 1 ? 0 : LEVEL_AT[lv + 1] - aff; };

/** 抱抱：挚友以上；每只猫每个玩家 45 秒冷却；好感 +2，当天第一次抱 +4 */
export const HUG_COOLDOWN_MS = 45000;
export const HUG_GAIN = 2;
export const HUG_FIRST_GAIN = 4;
/** 每天第一次和一只猫互动（摸 / 喂 / 抱）的额外好感；连续探望每满 3 天再 +1，最多 +3 */
export const DAILY_BOND = 2;
export const dailyBond = (streak: number) => DAILY_BOND + Math.min(3, Math.floor(Math.max(0, streak - 1) / 3));
/** 喂到它的最爱：好感翻倍 */
export const LIKE_MULT = 2;
/** 每天最多收到几份小猫的回礼（所有猫加起来） */
export const GIFT_DAILY_CAP = 6;

/** 这只猫和我的"小账本"（存在服务器、跟着身份走）：d = 最近一次探望的日期编号、st = 连续探望天数、fv = 喂到过它的最爱、hg = 最近一次抱抱的日期、gf = 最近一次收到它回礼的日期 */
export interface CatX { d?: number; st?: number; fv?: 1; hg?: number; gf?: number }
/** 发给客户端的"今天的状态"（服务器按当天日期算好，客户端不用知道日期编号） */
export interface CatInfo { /** 连续探望天数（今天或昨天探望过才算数） */ st: number; /** 今天已经探望过 */ vt?: 1; /** 今天已经抱过 */ hg?: 1; /** 今天已经收到过它的回礼 */ gf?: 1; /** 喂到过它的最爱（所以档案里的"爱吃"已揭晓） */ fv?: 1 }

/** 小猫单次互动的结果（服务器 → 客户端） */
export interface CatResult {
  ok: boolean; msg: string; aff: number; level: number; gifts: Gain[]; leveled?: boolean;
  /** 喂到了它的最爱 / 今日首次互动的额外好感 / 当前连续探望天数 / 这次它回了礼 */
  loved?: boolean; bonus?: number; streak?: number; gift?: boolean;
}

/** 专属名字：猫编号 → 名字（只有取名的玩家自己看得到，管理员可以查看）；从磁盘/网络来的只留合法的 */
export function cleanNicks(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = cleanText(v, CAT_NICK_MAX);
    if (/^\d{1,3}$/.test(k) && n) out[k] = n;
  }
  return out;
}

/** 从磁盘来的"小账本"（见 CatX）：只保留合法的猫编号与整数 */
export function cleanCatX(raw: unknown): Record<string, CatX> {
  const out: Record<string, CatX> = {};
  if (!raw || typeof raw !== 'object') return out;
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : undefined);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{1,3}$/.test(k) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>, x: CatX = {};
    const d = int(r.d, 1e6), st = int(r.st, 9999), hg = int(r.hg, 1e6), gf = int(r.gf, 1e6);
    if (d) x.d = d; if (st) x.st = st; if (hg) x.hg = hg; if (gf) x.gf = gf; if (r.fv === 1) x.fv = 1;
    if (Object.keys(x).length) out[k] = x;
  }
  return out;
}

/** 从磁盘来的好感度：只保留合法的猫编号与数值 */
export function cleanCats(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d{1,3}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.min(9999, Math.floor(v));
  }
  return out;
}

/**
 * 图书馆门口常驻的几只猫（玩家留言要求）：家（格坐标）、毛色、名字写死，排在随机分布的猫后面。
 * 编号接在 genCats 的结果后面（真实世界里是 28 号起），所以老玩家已有的好感度编号不变。
 */
const LIBRARY_CATS: { name: string; coat: number; tx: number; ty: number }[] = [
  { name: '书虫', coat: 2, tx: 355.5, ty: 362.6 },  // 白猫，在门前台阶西侧
  { name: '墨水', coat: 1, tx: 368.5, ty: 362.6 },  // 黑猫，台阶东侧
  { name: '书签', coat: 3, tx: 357.8, ty: 367.6 },  // 三花，台阶下的广场
  { name: '馆长', coat: 0, tx: 365.8, ty: 367.6 },  // 橘猫，最有派头
];

/** 第二批毛色的猫的数量（毛色 6–19 各一只，编号接在图书馆猫后面，即 32 起；老猫的编号、好感度不受影响） */
export const NEW_COAT_FIRST = 6;
export const NEW_COAT_LAST = 19;
export const NEW_CAT_COUNT = NEW_COAT_LAST - NEW_COAT_FIRST + 1;
/** 校猫（真的住在新校区的小猫，见 campus-cats.ts）的编号从这里开始（46 号起）、一共几只 */
export const REAL_CAT_FIRST = CAT_COUNT + 4 + NEW_CAT_COUNT;
export const REAL_CAT_COUNT = REAL_CATS.length;
export const isRealCat = (id: number) => id >= REAL_CAT_FIRST && id < REAL_CAT_FIRST + REAL_CAT_COUNT;

/** 全部小猫：随机分布的 + 图书馆门口的 + 第二批毛色的新猫 + 校猫（真猫的像素分身，位置固定）。出生点为空（没有世界数据）时一只也没有 */
export function allCats(points: readonly (readonly [number, number])[], count = CAT_COUNT, seed = 20261101): CatDef[] {
  const cats = genCats(points, count, seed);
  if (!points.length) return cats;
  for (const c of LIBRARY_CATS) cats.push({ id: cats.length, name: c.name, coat: c.coat, hx: c.tx * TILE, hy: c.ty * TILE });
  cats.push(...genNewCats(points, cats, seed));
  for (const c of REAL_CATS) cats.push({ id: cats.length, name: c.name, coat: c.coat, hx: c.tx * TILE, hy: c.ty * TILE });
  return cats;
}

/**
 * 第二批毛色的新猫：每种新毛色一只，家从行人出生点里挑，离已有的猫至少隔 minDist 格（凑不够逐步放宽），
 * 同样的输入永远得到同样的结果；编号接在已有的猫后面。
 */
export function genNewCats(points: readonly (readonly [number, number])[], existing: readonly CatDef[], seed = 20261101): CatDef[] {
  const rnd = mulberry32(seed ^ 0x5eed), chosen: [number, number][] = [];
  const order = points.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const homes = (): [number, number][] => [...existing.map((c): [number, number] => [c.hx / TILE, c.hy / TILE]), ...chosen];
  for (const minDist of [20, 16, 12, 8, 5, 2, 0]) {
    if (chosen.length >= NEW_CAT_COUNT) break;
    for (const i of order) {
      if (chosen.length >= NEW_CAT_COUNT) break;
      const [x, y] = points[i];
      if (chosen.some(([cx, cy]) => cx === x && cy === y)) continue;
      if (homes().every(([cx, cy]) => Math.hypot(cx - x, cy - y) >= minDist)) chosen.push([x, y]);
    }
  }
  return chosen.map(([x, y], k) => ({ id: existing.length + k, name: COAT_NAMES[NEW_COAT_FIRST + k][0], coat: NEW_COAT_FIRST + k, hx: x * TILE, hy: y * TILE }));
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => { let t = (s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * 在行人出生点（格坐标）里挑出分散的 count 个家：先要求彼此至少隔 minDist 格，凑不够再逐步放宽。
 * 同样的输入永远得到同样的结果。
 */
export function genCats(points: readonly (readonly [number, number])[], count = CAT_COUNT, seed = 20261101): CatDef[] {
  if (!points.length) return [];
  const rnd = mulberry32(seed), chosen: [number, number][] = [];
  const order = points.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const minDist of [26, 22, 18, 14, 10, 6, 2, 0]) {
    if (chosen.length >= Math.min(count, points.length)) break;
    for (const i of order) {
      if (chosen.length >= count) break;
      const [x, y] = points[i];
      if (chosen.some(([cx, cy]) => cx === x && cy === y)) continue;
      if (chosen.every(([cx, cy]) => Math.hypot(cx - x, cy - y) >= minDist)) chosen.push([x, y]);
    }
  }
  const used = COAT_NAMES.map(() => 0);
  const weights = [3, 2, 2, 2, 2, 2]; // 橘猫稍多一点（校园里最常见）
  const total = weights.reduce((a, b) => a + b, 0);
  return chosen.map(([x, y], id) => {
    let r = rnd() * total, coat = 0;
    for (; coat < weights.length - 1; coat++) { if (r < weights[coat]) break; r -= weights[coat]; }
    const names = COAT_NAMES[coat], name = names[used[coat]++ % names.length] + (used[coat] > names.length ? String(Math.ceil(used[coat] / names.length)) : '');
    return { id, name, coat, hx: x * TILE, hy: y * TILE };
  });
}

/** 把点 (x, y) 夹到以家 (hx, hy) 为圆心、半径 r（默认牵绳长度）的圆内：猫游走 / 被吓跑 / 回家的目标点都要过一遍，保证它不会跑出服务器判定"够得着"的范围 */
export function clampToLeash(hx: number, hy: number, x: number, y: number, r = CAT_LEASH): { x: number; y: number } {
  const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy);
  return d <= r || d === 0 ? { x, y } : { x: hx + (dx / d) * r, y: hy + (dy / d) * r };
}
