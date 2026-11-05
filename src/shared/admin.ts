/**
 * 管理员控制台的消息格式（客户端与服务器共用）。
 * 所有操作都由服务器校验"这条连接是不是管理员"（口令登录或令牌恢复），普通玩家发来的一律拒绝。
 * 管理员能做的：看谁在线与大致位置、禁言/解除、踢出、传送（去找他/拉他过来）、赠送物品/称号、给小猫改名、全服广播、全员禁言开关。
 */
import type { ChannelId } from './channels';

export type AdminOp =
  | { op: 'players'; offline?: boolean }
  | { op: 'cats' }
  /** min：禁言多少分钟；0 = 解除；-1 = 永久（十年） */
  | { op: 'mute'; uid: number; min: number }
  | { op: 'kick'; uid: number }
  | { op: 'goto'; uid: number }
  | { op: 'bring'; uid: number }
  | { op: 'give'; uid: number; item: string; n: number }
  | { op: 'title'; uid: number; id: string }
  /** 手写专属称号：名字 + 颜色（#rrggbb）；wear = 立刻替他戴上 */
  | { op: 'title_custom'; uid: number; name: string; color: string; wear?: boolean }
  /** 收回一个称号（正在佩戴的会被摘下） */
  | { op: 'title_take'; uid: number; id: string }
  /** 传送到地图上的任意位置（像素坐标）；落点不能站人时会找附近最近的能站的地方 */
  | { op: 'tp'; x: number; y: number }
  | { op: 'cat_name'; id: number; name: string }
  /** 查看某位玩家和小猫的关系（好感度、他给小猫取的专属名字） */
  | { op: 'cats_of'; uid: number }
  | { op: 'say'; text: string }
  | { op: 'lock'; on: boolean }
  /** 公屏里的「某某进入了校园 / 离开了校园」提示：默认关，管理员可以手动开关（开着时在线人数多于上限也不发，免得刷屏） */
  | { op: 'announce'; on: boolean }
  /** 敏感词：看当前状态 / 总开关 / 开关某个类别 / 加词（level 1 打码 2 拦截 3 拦截+禁言）/ 删词 / 加白名单短语 / 删白名单 / 重新读词库文件 */
  | { op: 'filter_get' }
  | { op: 'filter_toggle'; on: boolean }
  | { op: 'filter_cat'; cat: string; on: boolean }
  | { op: 'word_add'; word: string; level: 1 | 2 | 3; cat?: string }
  | { op: 'word_del'; word: string }
  | { op: 'white_add'; word: string }
  | { op: 'white_del'; word: string }
  | { op: 'filter_reload' }
  /** 撤回公屏消息：一条（mid）/ 某人最近 min 分钟内的全部（min ≤ 1440）。所有人屏幕上这几条会变成「已被管理员撤回」，历史记录里也不再显示（原文留档，管理员能查） */
  | { op: 'recall'; mid: number }
  | { op: 'recall_user'; uid: number; min: number }
  /** 查公屏历史记录：全部都存着。uid = 只看某人；q = 关键词；before = 翻页（这条 mid 之前的）；n ≤ 100 */
  | { op: 'log_chat'; uid?: number; q?: string; before?: number; n?: number; /** 只看某个世界：'public' = 公共世界；'solo' / 'group' = 所有个人 / 好友世界；也可以直接给某个世界的编号 */ world?: string; /** 只看某个频道（不写 = 全部；world = 世界里的话，包括没写频道的老记录） */ ch?: ChannelId }
  /** 查私聊记录（查看会被记进操作记录）：只给 uid = 这个人所有的会话列表；再给 peer = 他和 peer 的聊天内容 */
  | { op: 'log_dm'; uid: number; peer?: number; before?: number }
  /** 封禁：hours > 0 = 封多少小时，-1 = 永久（十年）；被封的人当场被踢下线、不能再进来。unban = 解封 */
  | { op: 'ban'; uid: number; hours: number; reason?: string }
  | { op: 'unban'; uid: number }
  | { op: 'bans' }
  /** 改玩家资料（昵称/学院/专业/签名）：给不合适的昵称整改用，不经过敏感词过滤；本人会收到通知 */
  | { op: 'profile_set'; uid: number; name?: string; college?: string; major?: string; motto?: string }
  /** 看某位玩家的详细情况 */
  | { op: 'player_info'; uid: number }
  /** 管理员操作记录（谁在什么时候做了什么，包括查看私聊）；before = 翻页；target = 只看对某位玩家做过的 */
  | { op: 'audit'; before?: number; target?: number }
  /** 找人：q 是校园号（精确，或前几位）、学生证号、昵称（包含即可，不分大小写）；档案库里所有人（含离线）都能搜，最多 20 个 */
  | { op: 'find'; q: string }
  /** 玩家档案：一次拿到某位玩家的全部情况（资料、背包与币、好友与屏蔽、相关举报、管理员对他做过的操作、小猫关系） */
  | { op: 'dossier'; uid: number }
  /** 加减校园币（delta 可以是负数，余额不会低于 0；每次最多 ±100000）；reason 记进操作记录 */
  | { op: 'coins_adj'; uid: number; delta: number; reason?: string }
  /** 收走背包里的物品 */
  | { op: 'item_take'; uid: number; item: string; n: number }
  /** 重发身份备份码（站长专属）：给这个校园号生成一个新的身份码并把档案换到它名下，旧身份码作废；新备份码只在回复里给这位站长看一次，不存、不记日志 */
  | { op: 'reissue_code'; uid: number }
  /** 任命 / 撤销协管员（只有站长）：协管员没有口令，被任命的玩家下次进游戏（在线的当场）自动成为协管员；站长在玩家档案里操作 */
  | { op: 'mod_set'; uid: number; on: boolean }
  /** 协管员名单（返回 adm_hits） */
  | { op: 'mods' }
  /** 给某位玩家单独发一条系统通知（警告、提醒）；不在线的会在他下次进来时收到 */
  | { op: 'notify'; uid: number; text: string }
  /** 世界：列出现在所有的世界 / 进入某个世界（ghost = 隐身观察：别人看不到你、你不能发言；不给 = 现身进入，世界里的人会收到提示）/ 离开，回到进来之前的世界 */
  | { op: 'worlds' }
  | { op: 'world_enter'; world: string; ghost?: boolean }
  | { op: 'world_leave' }
  /** 举报：看举报列表（open = 只看没处理的；before = 翻页）/ 处理一条（verdict：done 已处理，dismiss 驳回；同一条内容的其他举报一起处理；action 记下采取了什么措施） */
  | { op: 'reports'; open?: boolean; before?: number }
  | { op: 'rep_handle'; id: number; verdict: 'done' | 'dismiss'; action?: string };

/**
 * 管理员分两级：站长（owner，唯一的管理员口令登录）和协管员（mod，**没有口令**，由站长在玩家档案里任命，存在被任命者的档案里，进游戏自动生效；站长随时可撤销）。
 * 协管员做日常巡查：看玩家、禁言（最长 1 天）、踢出、撤回消息、处理举报、传送、隐身进世界看看、发通知、删留言 / 校园墙；
 * 下面这些操作只有站长能做（封禁、改资料、发物品 / 币、称号、小猫改名、全服广播与公屏开关、敏感词、看私聊、发公告）。
 * 服务器按这张表拒绝越权操作，界面也据此隐藏按钮；要调整权限只改这一个集合。
 */
export type AdminRole = 'owner' | 'mod';
export const ROLE_NAMES: Record<AdminRole, string> = { owner: '站长', mod: '协管员' };
export const OWNER_ONLY_OPS: ReadonlySet<AdminOp['op']> = new Set<AdminOp['op']>([
  'ban', 'unban', 'profile_set', 'give', 'title', 'title_custom', 'title_take', 'coins_adj', 'item_take', 'cat_name',
  'mod_set', 'mods', 'reissue_code', 'say', 'lock', 'announce', 'filter_get', 'filter_toggle', 'filter_cat', 'word_add', 'word_del', 'white_add', 'white_del', 'filter_reload', 'log_dm',
]);
export const canOp = (role: AdminRole | null | undefined, op: AdminOp['op']): boolean => role === 'owner' || (role === 'mod' && !OWNER_ONLY_OPS.has(op));
/** 协管员名单结果的 q 标记（adm_hits.q） */
export const MODS_Q = '🛡 协管员名单';
/** 协管员最长能禁言多久（分钟） */
export const MOD_MUTE_MAX_MIN = 1440;
/** 站长一次最多加减多少校园币 */
export const COINS_ADJ_MAX = 100000;

/** 搜索结果的一项 */
export interface AdminHit { /** 是协管员 */ mod?: boolean; uid: number; name: string; college: string; major: string; cardNo: string; online: boolean; seen: number; mutedMin: number; banned: boolean }
/** 玩家档案里的一条举报（不含原文；要看原文去「举报」页） */
export interface DossierReport { id: number; ts: number; kind: string; reason: number; /** against = 他被举报，by = 他举报别人 */ role: 'against' | 'by'; other: string; done?: 'done' | 'dismiss' }
/** 玩家档案：管理员对一位玩家做处理之前要看的全部情况 */
export interface AdminDossier {
  info: AdminInfo;
  inv: { id: string; n: number }[];
  coins: number;
  /** 获得过的称号 id */ titles: string[];
  friends: { uid: number; name: string; online: boolean }[];
  /** 他屏蔽的人 */ blocked: { uid: number; name: string }[];
  /** 有多少人屏蔽了他 */ blockedBy: number;
  reports: DossierReport[];
  /** 管理员对他做过的操作（新的在前，最多 30 条） */ audit: AuditEntry[];
  /** 还没送到的系统通知条数（他不在线时发的） */ pendingNotes: number;
  cats: { id: number; name: string; aff: number; level: number; nick?: string; following: boolean }[];
}

/** 管理面板「世界」页的一项：一个世界和里面的人 */
export interface AdminWorld {
  id: string; kind: 'public' | 'solo' | 'group'; owner: number; ownerName: string; since: number;
  /** 世界里有几个人（不含隐身的管理员） */ size: number;
  members: { uid: number; name: string; /** 管理员 */ admin?: boolean; /** 隐身观察中 */ ghost?: boolean; state: string }[];
}

/** 一条公屏记录（mid = 记录编号；del = 已被撤回，by = 谁撤回的） */
export interface AdminChatItem { mid: number; ts: number; uid?: number; from: string; text: string; del?: boolean; by?: string; /** 在哪个世界说的（公共世界没有这个字段） */ w?: string; /** 在哪个频道说的（world 不写） */ ch?: ChannelId }
/** 一条私聊记录 */
export interface AdminDm { id: number; from: number; to: number; text: string; ts: number }
/** 某人的私聊会话列表里的一项 */
export interface AdminDmPeer { uid: number; name: string; count: number; last: number }
export interface AdminInfo {
  uid: number; name: string; gender: string; college: string; major: string; year: number; motto: string; cardNo: string; /** 是协管员（站长任命的） */ mod?: boolean;
  online: boolean; seen: number; /** 累计在线秒数 */ playSec: number; coins: number; friends: number; mutedMin: number;
  ban?: { until: number; reason: string; by: string }; title?: string; where: string;
  /** 他现在在哪个世界（在线才有） */ world?: { id: string; kind: 'public' | 'solo' | 'group' };
}
export interface BanEntry { uid: number; name: string; until: number; reason: string; by: string }
/** 管理员操作记录 */
export interface AuditEntry { ts: number; admin: string; aid: number; op: string; target?: number; detail?: string }

/** 一条敏感词命中记录（只记被打码/拦截的；原文含玩家隐私，保留 30 天，只有管理员看得到） */
export interface FilterLogEntry { ts: number; uid: number; name: string; where: string; cats: string[]; level: number; /** 命中的词（归一化后的） */ words: string[]; text: string }
/** 管理面板「敏感词」页的数据 */
export interface AdminFilter {
  on: boolean; off: string[]; size: number; counts: Record<string, number>;
  custom: { word: string; level: number; cat: string }[]; white: string[]; hits: FilterLogEntry[]; warnings: string[];
  /** 类别 → 中文名 */ names: Record<string, string>;
}

export interface AdminPlayer {
  uid: number; name: string; college: string; online: boolean;
  /** 位置（格坐标，一位小数）与大致地点 */
  tx: number; ty: number; where: string;
  /** 在线时的状态：走路 / 骑车 / 坐着 / 钓鱼 / 校园跑 */
  state: string;
  /** 还剩多少分钟被禁言（0 = 没被禁言；永久禁言是个很大的数） */
  mutedMin: number;
  title?: string;
  /** 最后一次在线（毫秒）；在线时就是现在 */
  seen: number;
}
export interface AdminCat { id: number; name: string; coat: number; tx: number; ty: number; where: string }

/** 永久禁言就是"十年" */
export const MUTE_FOREVER_MS = 10 * 365 * 24 * 3600e3;
export const MUTE_PRESETS: { label: string; min: number }[] = [
  { label: '禁言 10 分钟', min: 10 }, { label: '禁言 1 小时', min: 60 }, { label: '禁言 1 天', min: 1440 }, { label: '永久禁言', min: -1 }, { label: '解除禁言', min: 0 },
];

/** 操作记录里显示的中文名（没列出的就显示原名） */
export const OP_NAMES: Record<string, string> = {
  mute: '禁言', kick: '踢出', ban: '封禁', unban: '解封', goto: '传送到他身边', bring: '叫他过来', give: '赠送物品', title: '授予称号', title_custom: '授予专属称号', title_take: '收回称号',
  profile_set: '改资料', recall: '撤回消息', recall_user: '撤回他的发言', log_chat: '查公屏记录', log_dm: '查私聊', player_info: '看资料', dossier: '看档案',
  coins_adj: '调整校园币', mod_set: '任命/撤销协管员', reissue_code: '重发身份备份码', item_take: '收走物品', notify: '发通知', world_enter: '进入世界', world_leave: '离开世界', rep_handle: '处理举报',
  say: '全服广播', lock: '公屏开关', announce: '进出提示开关', cat_name: '小猫改名', filter_toggle: '敏感词总开关', filter_cat: '敏感词类别', word_add: '加敏感词', word_del: '删敏感词', white_add: '加白名单', white_del: '删白名单',
};

