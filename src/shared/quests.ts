/**
 * 每日任务（客户端与服务器共用）。
 * 每天（东八区 0 点换日）所有人拿到同样的 5 个任务：「登录签到」「在线 10 分钟」两个靠上线就能完成，另外 3 个从任务池里按日期固定抽——
 * 所以同学们当天聊起来是同一批任务。完成后奖励自动发进背包，不用手动领；做不完不惩罚。
 * 进度和奖励都由服务器判断（事件从服务器自己的逻辑里触发，不信任客户端自称"我做完了"）。
 */
import type { Gain } from './items';

/** 任务事件：服务器在对应动作成功之后触发 */
export type QuestEv = 'login' | 'online' | 'pet' | 'feed' | 'ride' | 'sit' | 'emote' | 'chat' | 'photo' | 'catch' | 'run' | 'visit_lake' | 'visit_library';
export interface QuestDef {
  id: string; name: string; desc: string;
  ev: QuestEv; goal: number;
  reward: Gain[];
}

/** 固定的两个：上线就算 */
export const FIXED_QUESTS: readonly QuestDef[] = [
  { id: 'login', name: '登录签到', desc: '今天来校园报到。', ev: 'login', goal: 1, reward: [{ id: 'bait', n: 5 }, { id: 'cat_treat', n: 1 }, { id: 'fishing_rod', n: 1 }] },
  { id: 'online', name: '在校园待一会儿', desc: '今天在线满 10 分钟。', ev: 'online', goal: 600, reward: [{ id: 'bait', n: 3 }, { id: 'cat_treat', n: 1 }] },
];

/** 任务池：每天抽 3 个 */
export const QUEST_POOL: readonly QuestDef[] = [
  { id: 'pet', name: '摸摸小猫', desc: '摸 3 次校园里的小猫。', ev: 'pet', goal: 3, reward: [{ id: 'bait', n: 3 }] },
  { id: 'feed', name: '投喂小猫', desc: '给小猫喂一次吃的。', ev: 'feed', goal: 1, reward: [{ id: 'cat_treat', n: 1 }] },
  { id: 'ride', name: '骑一骑', desc: '骑一次共享单车。', ev: 'ride', goal: 1, reward: [{ id: 'bait', n: 2 }] },
  { id: 'sit', name: '歇歇脚', desc: '在长椅上坐一会儿。', ev: 'sit', goal: 1, reward: [{ id: 'cat_treat', n: 1 }] },
  { id: 'emote', name: '打个招呼', desc: '做一个表情动作。', ev: 'emote', goal: 1, reward: [{ id: 'bait', n: 2 }] },
  { id: 'chat', name: '说句话', desc: '在公屏发一条消息。', ev: 'chat', goal: 1, reward: [{ id: 'bait', n: 2 }] },
  { id: 'photo', name: '留个影', desc: '用拍照模式拍一张照片。', ev: 'photo', goal: 1, reward: [{ id: 'bait', n: 2 }] },
  { id: 'fish', name: '湖边垂钓', desc: '在精工湖钓上 2 条鱼。', ev: 'catch', goal: 2, reward: [{ id: 'cat_treat', n: 2 }] },
  { id: 'run', name: '操场跑一圈', desc: '在东区田径场完成一次校园跑。', ev: 'run', goal: 1, reward: [{ id: 'cat_treat', n: 2 }, { id: 'bait', n: 5 }] },
  { id: 'lake', name: '去湖边逛逛', desc: '走到精工湖边。', ev: 'visit_lake', goal: 1, reward: [{ id: 'bait', n: 2 }] },
  { id: 'library', name: '图书馆广场打卡', desc: '走到图书馆前的大广场。', ev: 'visit_library', goal: 1, reward: [{ id: 'bait', n: 2 }] },
];
/** 每天从任务池里抽几个 */
export const POOL_PICKS = 3;

const ALL = [...FIXED_QUESTS, ...QUEST_POOL];
const BY_ID = new Map(ALL.map((q) => [q.id, q]));
export const questDef = (id: unknown): QuestDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => { let t = (s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 某一天（日期编号，见 server/progress.dayNo）的全部任务：固定的在前，抽出来的在后；同一天永远一样 */
export function dailyQuests(day: number): QuestDef[] {
  const rnd = mulberry32(day * 2654435761 + 12345), pool = [...QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return [...FIXED_QUESTS, ...pool.slice(0, POOL_PICKS)];
}

/** 客户端看到的一项任务：进度与是否完成 */
export interface QuestState { id: string; prog: number; done: boolean }
/** 累计"做完当天全部任务"满这么多天，成就「勤勉学子」 */
export const DILIGENT_DAYS = 7;

/** 走到地点算"到过"：以格坐标 + 半径（格）表示的区域，地标来自世界的 pois。服务器每秒检查一次玩家位置 */
export const VISIT_SPOTS: { ev: QuestEv; poi: string; extra: number }[] = [
  { ev: 'visit_lake', poi: 'lake', extra: 8 },       // 湖的 poi 半径是"湖的大概范围"，岸边再放宽几格
  { ev: 'visit_library', poi: 'axis-plaza', extra: 4 },
];

/** 从磁盘来的任务进度：只留今天的、认识的任务 */
export interface QuestSave { day: number; prog: Record<string, number>; done: string[] }
export function cleanQuestSave(raw: unknown): QuestSave | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { day, prog, done } = raw as Record<string, unknown>;
  if (!Number.isInteger(day)) return undefined;
  const p: Record<string, number> = {};
  if (prog && typeof prog === 'object') for (const [id, n] of Object.entries(prog as Record<string, unknown>)) if (questDef(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) p[id] = Math.floor(n);
  const d = Array.isArray(done) ? done.filter((id): id is string => typeof id === 'string' && !!questDef(id)) : [];
  return { day: day as number, prog: p, done: [...new Set(d)] };
}
