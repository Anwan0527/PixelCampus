import { cleanText } from './profile';

/**
 * 称号（客户端与服务器共用）。
 * 称号显示在头顶昵称上方和学生证里；玩家可以在"称号"面板里选一个佩戴，别人看到的是服务器认定的那个。
 * 获得记录存在服务器的玩家档案里（称号 id → 获得时间）；多数称号由成就解锁时自动发放（见 achievements.ts 的 title 字段）。
 *
 * 新增称号：在 TITLES 里加一项；要由成就发放就在对应成就上写 title: '<id>'；其他来源在服务器调用 Progress.grantTitle。
 */
export interface TitleDef {
  id: string; name: string;
  /** 管理员手写的专属称号（名字和颜色就编码在 id 里，见 customTitleId） */
  custom?: boolean;
  /** 头顶牌子/学生证上的文字颜色 */
  color: string;
  /** 称号面板里"怎么得到"的说明 */
  how: string;
  /** 特殊称号：不会写进玩家档案，由服务器按状态临时给（管理员） */
  special?: boolean;
}

export const TITLES: readonly TitleDef[] = [
  { id: 'freshman', name: '新生', color: '#a6e3b0', how: '走进校园（成就「进入校园」）' },
  { id: 'real_hebei', name: '真·河工人', color: '#ffd35a', how: '摸摸南门的校名石，发现真正的校名' },
  { id: 'cat_lover', name: '铲屎官', color: '#ffb48a', how: '和一只校园小猫成为「亲密」好友' },
  { id: 'cat_guardian', name: '猫咪守护者', color: '#ffc0e0', how: '和一只小猫成为「挚友」' },
  { id: 'angler', name: '精工湖钓手', color: '#8fd8ff', how: '在精工湖钓到 5 种不同的鱼' },
  { id: 'giant_hunter', name: '巨物猎手', color: '#9fe0c0', how: '钓上来一条「巨物」个头的鱼' },
  { id: 'legend_angler', name: '传说钓手', color: '#ffd35a', how: '钓到一条传说级的鱼' },
  { id: 'fish_master', name: '钓遍精工湖', color: '#8fd8ff', how: '集齐精工湖里所有常规的鱼' },
  { id: 'fish_all', name: '钓鱼大师', color: '#7fe8d8', how: '钓鱼图鉴集齐全部种类（含神话鱼、盲盒限定鱼）' },
  { id: 'koi_return', name: '锦鲤的回礼', color: '#ff8a8a', how: '钓到神话鱼「河工锦」' },
  { id: 'lake_keeper', name: '镇湖人', color: '#9fd0b0', how: '钓到神话鱼「镇湖玄龟」' },
  { id: 'ying_long', name: '应龙', color: '#ffd24a', how: '钓到神话鱼「应龙」' },
  { id: 'three_treasures', name: '镇湖三宝', color: '#ff6f61', how: '钓到全部三条神话鱼' },
  { id: 'gear_collector', name: '钓具收藏家', color: '#c8b6ff', how: '集齐全部 9 根鱼竿' },
  { id: 'runner', name: '校园跑达人', color: '#ff9d8a', how: '在东区田径场完成一次校园跑' },
  { id: 'sprinter', name: '赛场飞人', color: '#ffe066', how: '和好友一起校园跑，并拿到第一名' },
  { id: 'diligent', name: '勤勉学子', color: '#d5b8ff', how: '累计 7 天做完当天全部每日任务' },
  { id: 'admin', name: '管理员', color: '#ff7a6b', how: '仅管理员', special: true },
];

const BY_ID = new Map(TITLES.map((t) => [t.id, t]));

/**
 * 专属称号：管理员可以手写名字、挑颜色发给某位玩家。不需要单独的目录——名字和颜色直接编码在称号 id 里：`~rrggbb~名字`，
 * 所以服务器存档、spawn 广播、学生证显示都沿用同一套"称号 id"，客户端解析 id 就知道怎么画。
 */
const CUSTOM_RE = /^~([0-9a-f]{6})~([^~]{1,8})$/u;
export const CUSTOM_TITLE_MAX = 8;
/** 按名字和颜色（#rrggbb）生成专属称号 id；名字或颜色不合法返回 null */
export function customTitleId(name: unknown, color: unknown): string | null {
  if (typeof name !== 'string' || typeof color !== 'string') return null;
  const n = cleanText(name, CUSTOM_TITLE_MAX).replace(/~/g, ''), c = color.replace(/^#/, '').toLowerCase();
  return n && /^[0-9a-f]{6}$/.test(c) ? `~${c}~${n}` : null;
}
export const isCustomTitle = (id: unknown): id is string => typeof id === 'string' && CUSTOM_RE.test(id) && customTitleId(CUSTOM_RE.exec(id)![2], CUSTOM_RE.exec(id)![1]) === id;
export const titleDef = (id: unknown): TitleDef | undefined => {
  if (typeof id !== 'string') return undefined;
  const t = BY_ID.get(id);
  if (t) return t;
  const m = isCustomTitle(id) ? CUSTOM_RE.exec(id) : null;
  return m ? { id, name: m[2], color: `#${m[1]}`, how: '管理员授予的专属称号', custom: true } : undefined;
};
/** 可以进玩家档案的称号（不含特殊称号） */
export const isOwnable = (id: unknown): id is string => typeof id === 'string' && ((BY_ID.get(id)?.special !== true && BY_ID.has(id)) || isCustomTitle(id));

/** 从磁盘/网络来的称号记录：只留认识的、可拥有的称号，时间必须是正整数 */
export function cleanTitles(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (isOwnable(id) && typeof t === 'number' && Number.isFinite(t) && t > 0) out[id] = Math.floor(t);
  }
  return out;
}
