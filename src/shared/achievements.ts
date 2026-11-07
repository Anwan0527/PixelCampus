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
  { id: 'cat_bestie', name: '形影不离', desc: '和一只校园小猫成为「挚友」。', hint: '好感度攒到 80，小猫会成为你最亲的朋友。', title: 'cat_guardian' },
  { id: 'cat_hello', name: '猫缘', desc: '第一次摸了、喂了校园里的小猫。', hint: '走近一只小猫，按 E。' },
  { id: 'cat_meet_10', name: '猫缘不浅', desc: '结识了 10 只不同的小猫。', hint: '校园里的小猫不止一两只。' },
  { id: 'cat_meet_30', name: '全校猫缘', desc: '结识了 30 只不同的小猫。', hint: '每个角落的小猫都去打个招呼。' },
  { id: 'cat_real_all', name: '校猫普查', desc: '认识了全部 16 只「校猫」——真的住在新校区里的小猫，在游戏里有了像素分身。', hint: '一社区、三社区、四社区、一餐旁……真猫出没的地方，也有它们的分身。', title: 'cat_census' },
  { id: 'cat_1a', name: '一A猫委会', desc: '认识了一社区 A 楼的全部 5 只猫。', hint: '一社区 A 楼下，热闹得很。' },
  { id: 'cat_3b', name: '三B三剑客', desc: '认识了三社区 B 楼的 3 只猫。', hint: '三社区 B 楼下有三位老住户。' },
  { id: 'cat_fav', name: '投其所好', desc: '喂到了一只小猫的最爱，好感翻倍。', hint: '每只猫都有自己爱吃的口味，熟悉以后它会告诉你。' },
  { id: 'cat_hug', name: '软乎乎', desc: '抱了一次小猫。', hint: '和小猫成为「挚友」之后，试试抱一抱。' },
  { id: 'cat_night', name: '夜猫子', desc: '在深夜摸了一只小猫。', hint: '夜里，有的猫比白天更精神。' },
  { id: 'cat_rain', name: '雨中送暖', desc: '下雨天给小猫喂了吃的。', hint: '下雨的时候，小猫更需要一点温暖。' },
  { id: 'cat_streak_7', name: '风雨无阻', desc: '连续 7 天探望同一只小猫。', hint: '每天都去看看同一只猫。' },
  { id: 'cat_bestie_3', name: '三五知己', desc: '和 3 只小猫成为「挚友」。', hint: '多交几个猫朋友。' },
  { id: 'cat_bestie_10', name: '猫界社交达人', desc: '和 10 只小猫成为「挚友」。', hint: '全校的猫都认得你。', title: 'cat_social' },
  { id: 'cat_kin', name: '一家人', desc: '和一只小猫成为「家人」（好感 500）。', hint: '比挚友更进一步，需要很长很长的陪伴。', title: 'cat_family' },
  { id: 'cat_gift_10', name: '礼尚往来', desc: '一共收到了小猫的 10 份回礼。', hint: '亲密的小猫，每天第一次见面会送你点什么。' },
  { id: 'first_sit', name: '小憩片刻', desc: '在长椅上坐了下来，歇一歇。', hint: '校园里到处都有长椅。' },
  { id: 'say_cheese', name: '咔嚓！', desc: '用拍照模式留下了第一张校园照片。', hint: '按 P 进入拍照模式。' },
  { id: 'first_catch', name: '初次垂钓', desc: '在精工湖钓上了第一条鱼。', hint: '去精工湖边，抛下鱼竿。' },
  { id: 'angler', name: '精工湖钓手', desc: '在精工湖钓到了 5 种不同的鱼。', hint: '湖里的鱼不止一种。', title: 'angler' },
  { id: 'runner', name: '校园跑达人', desc: '在东区田径场跑完了一次校园跑。', hint: '东区田径场的起跑线在等你。', title: 'runner' },
  { id: 'race_win', name: '赛场飞人', desc: '和好友一起校园跑，拿到了第一名。', hint: '约上好友，来一场比赛。', title: 'sprinter' },
  { id: 'diligent', name: '勤勉学子', desc: '累计 7 天做完了当天的全部每日任务。', hint: '每天的任务别落下。', title: 'diligent' },
  { id: 'fish_giant', name: '巨物猎手', desc: '钓上来一条「巨物」个头的鱼。', hint: '有的鱼长得特别大，拉鱼时要稳住。', title: 'giant_hunter' },
  { id: 'fish_legend', name: '传说降临', desc: '钓到了一条传说级的鱼。', hint: '夜里、雨天、冬天……传说中的鱼有自己的脾气。', title: 'legend_angler' },
  { id: 'fish_master', name: '钓遍精工湖', desc: '集齐了精工湖里所有常规的鱼（不含神话鱼和盲盒限定鱼）。', hint: '把湖里的鱼都钓一遍。', title: 'fish_master' },
  { id: 'fish_10', name: '小有收获', desc: '钓鱼图鉴里有了 10 种鱼。', hint: '多钓几种不一样的鱼。' },
  { id: 'fish_25', name: '渔获颇丰', desc: '钓鱼图鉴里有了 25 种鱼。', hint: '夜里、雨天、不同的季节，鱼都不一样。' },
  { id: 'fish_40', name: '满载而归', desc: '钓鱼图鉴里有了 40 种鱼。', hint: '稀有的鱼要靠条件和运气。' },
  { id: 'fish_all', name: '钓鱼大师', desc: '钓鱼图鉴集齐了全部种类的鱼：湖里的、神话的、盲盒里的。', hint: '把整本图鉴填满。', title: 'fish_all' },
  { id: 'myth_hegongjin', name: '锦鲤的回礼', desc: '钓到了神话鱼「河工锦」。', hint: '钓满 20 条锦鲤，等一个春天的白天。', title: 'koi_return' },
  { id: 'myth_xuangui', name: '镇湖人', desc: '钓到了神话鱼「镇湖玄龟」。', hint: '冬天的夜里，湖底有一只老龟……', title: 'lake_keeper' },
  { id: 'myth_yinglong', name: '应龙', desc: '钓到了神话鱼「应龙」。', hint: '暴雨的夜里，水面下有金光一闪而过。', title: 'ying_long' },
  { id: 'myth_all', name: '镇湖三宝', desc: '三条神话鱼（河工锦、镇湖玄龟、应龙）都钓到了。', hint: '精工湖有三个传说。', title: 'three_treasures' },
  { id: 'box_first', name: '开箱有礼', desc: '打开了第一个盲盒。', hint: '钓鱼时偶尔会多钓上来一个盒子。' },
  { id: 'box_10', name: '拆盒爱好者', desc: '累计打开了 10 个盲盒。', hint: '漂流瓶、旧木箱、沉船箱，都值得拆一拆。' },
  { id: 'gear_rods', name: '钓具收藏家', desc: '集齐了全部 9 根鱼竿。', hint: '特殊的鱼竿有商店卖的，也有盲盒里的，还有要合成的。', title: 'gear_collector' },
  { id: 'gear_baits', name: '饵料百科', desc: '用过全部 9 种鱼饵。', hint: '每种饵都用一次。' },
  { id: 'fishlv_5', name: '湖边学徒', desc: '钓鱼等级达到 5 级。', hint: '多钓鱼，攒经验。', title: 'fish_lv5' },
  { id: 'fishlv_10', name: '老钓手', desc: '钓鱼等级达到 10 级。', hint: '新种类和完美拉鱼的经验更多。', title: 'fish_lv10' },
  { id: 'fishlv_15', name: '钓鱼达人', desc: '钓鱼等级达到 15 级。', hint: '长线的积累。', title: 'fish_lv15' },
  { id: 'fishlv_20', name: '钓鱼宗师', desc: '钓鱼等级达到 20 级。', hint: '精工湖上没几个人到得了这里。', title: 'fish_lv20' },
  { id: 'fishlv_25', name: '渔圣门徒', desc: '钓鱼等级达到 25 级。', hint: '快到顶了。', title: 'fish_lv25' },
  { id: 'fishlv_30', name: '渔圣', desc: '钓鱼等级达到满级 30 级。', hint: '传说中的渔圣。', title: 'fish_lv30' },
  { id: 'release_5', name: '护鱼人', desc: '放生了 5 条保护动物。', hint: '钓到胭脂鱼、白鲟这些鱼时，可以选择放生。', title: 'fish_guard' },
  { id: 'release_20', name: '水域守护者', desc: '累计放生了 20 条保护动物。', hint: '继续放生。', title: 'water_guardian' },
  { id: 'release_50', name: '生态卫士', desc: '累计放生了 50 条保护动物。', hint: '精工湖因为你更热闹了。', title: 'eco_guard' },
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
