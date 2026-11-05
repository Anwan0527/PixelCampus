/**
 * 成就（客户端与服务器共用）。
 * 解锁记录存在服务器的玩家档案里（成就 id → 解锁时间），跟着身份走：换设备/用备份码恢复后还在。
 * 客户端只显示；解锁由服务器按规则判断，不信任客户端自称"我完成了"。
 *
 * 新增成就：在 ACHIEVEMENTS 里加一项（placeholder 去掉），再在服务器 `Progress.unlock` 的调用处接上触发条件。
 * 占位成就（placeholder）只在列表里显示为"？？？"，服务器不会解锁它们。
 * title：解锁这个成就时顺便发放的称号 id（见 titles.ts）。
 */
export interface AchievementDef {
  id: string;
  name: string;
  /** 解锁后显示的说明 */
  desc: string;
  /** 解锁前显示的线索（不剧透） */
  hint: string;
  /** 占位：还没做，列表里显示"？？？ 敬请期待"，不可解锁 */
  placeholder?: boolean;
  /** 解锁时发放的称号 */
  title?: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'enter_campus', name: '进入校园', desc: '第一次走进河北工程大学新校区。', hint: '走进校园，故事就开始了。', title: 'freshman' },
  { id: 'real_hebei', name: '真正的河北工程', desc: '摸摸南门的校名石，发现了真正的校名。', hint: '南门的校名石，好像有点不一样……', title: 'real_hebei' },
  { id: 'cat_friend', name: '铲屎官', desc: '和一只校园小猫成为「亲密」好友。', hint: '多摸摸、多喂喂校园里的小猫。', title: 'cat_lover' },
  { id: 'cat_bestie', name: '形影不离', desc: '和一只校园小猫成为「挚友」。', hint: '好感度攒到最高，小猫会成为你最亲的朋友。', title: 'cat_guardian' },
  { id: 'first_sit', name: '小憩片刻', desc: '在长椅上坐了下来，歇一歇。', hint: '校园里到处都有长椅。' },
  { id: 'say_cheese', name: '咔嚓！', desc: '用拍照模式留下了第一张校园照片。', hint: '按 P 进入拍照模式。' },
  { id: 'first_catch', name: '初次垂钓', desc: '在精工湖钓上了第一条鱼。', hint: '去精工湖边，抛下鱼竿。' },
  { id: 'angler', name: '精工湖钓手', desc: '在精工湖钓到了 5 种不同的鱼。', hint: '湖里的鱼不止一种。', title: 'angler' },
  { id: 'runner', name: '校园跑达人', desc: '在东区田径场跑完了一次校园跑。', hint: '东区田径场的起跑线在等你。', title: 'runner' },
  { id: 'race_win', name: '赛场飞人', desc: '和好友一起校园跑，拿到了第一名。', hint: '约上好友，来一场比赛。', title: 'sprinter' },
  { id: 'diligent', name: '勤勉学子', desc: '累计 7 天做完了当天的全部每日任务。', hint: '每天的任务别落下。', title: 'diligent' },
  { id: 'fish_giant', name: '巨物猎手', desc: '钓上来一条「巨物」个头的鱼。', hint: '有的鱼长得特别大，拉鱼时要稳住。', title: 'giant_hunter' },
  { id: 'fish_legend', name: '传说降临', desc: '钓到了一条传说级的鱼。', hint: '夜里、雨天、冬天……传说中的鱼有自己的脾气。', title: 'legend_angler' },
  { id: 'fish_master', name: '钓鱼大师', desc: '钓鱼图鉴集齐了所有种类的鱼。', hint: '把图鉴填满。', title: 'fish_master' },
  { id: 'bike_wall', name: '墙是实心的', desc: '骑着共享单车全速撞上了墙。墙，确实是实心的。', hint: '共享单车骑得太快，刹不住。' },
  { id: 'dawn_4', name: '你看过凌晨四点的太阳吗', desc: '在凌晨四点（你设备上的时间）还在线。', hint: '有些人，天还没亮就醒着。' },
  { id: 'trash_all', name: '垃圾桶里什么都有', desc: '翻了一次校园里的垃圾桶。运气好的话，能翻出好东西。', hint: '校园里的垃圾桶，好像可以翻一翻。' },
  { id: 'daily_999', name: '日进九百九', desc: '一天之内在校园商店卖东西，一共赚到 999 校园币。', hint: '一天里卖出的东西，加起来要值很多钱。' },
  { id: 'first_trade', name: '开市大吉', desc: '和另一位玩家完成了第一次交易。', hint: '找个同学，换点东西。' },
  /** 占位：传说中的"厕所传送"，以后再做（服务器不会解锁；做的时候把 placeholder 去掉、名字改成「芝麻开门」） */
  { id: 'sesame', name: '？？？', desc: '', hint: '有些门，要用特别的方式才会打开……', placeholder: true },
  { id: 'soon_1', name: '？？？', desc: '', hint: '更多成就，敬请期待。', placeholder: true },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achDef = (id: string) => BY_ID.get(id);
/** 可以真正解锁的成就 id（不含占位） */
export const isUnlockable = (id: unknown): id is string => typeof id === 'string' && BY_ID.get(id)?.placeholder !== true && BY_ID.has(id);
/** 可解锁的成就总数（"已解锁 n/m" 的分母） */
export const ACH_TOTAL = ACHIEVEMENTS.filter((a) => !a.placeholder).length;

/**
 * 客户端可以上报的"事件"：服务器据此（并校验位置等条件）决定是否解锁。
 * 校名石彩蛋走完一轮、拍了一张照、骑车撞墙（服务器核对在骑车且身边真有障碍）、凌晨四点还在线（带设备的时区偏移，服务器用自己的时钟换算）
 */
export const ACH_EVENTS = ['egg_done', 'photo', 'bike_crash', 'dawn4'] as const;
export type AchEvent = (typeof ACH_EVENTS)[number];
export const isAchEvent = (e: unknown): e is AchEvent => typeof e === 'string' && (ACH_EVENTS as readonly string[]).includes(e);

/** 从磁盘/网络来的解锁记录：只保留可解锁的成就，时间必须是正整数 */
export function cleanAch(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (isUnlockable(id) && typeof t === 'number' && Number.isFinite(t) && t > 0) out[id] = Math.floor(t);
  }
  return out;
}
