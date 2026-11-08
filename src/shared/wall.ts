/** 校园墙（玩家发帖、评论、点赞；可以匿名）：消息格式与限制。客户端、服务器共用。 */
import { cleanText } from './profile';

export const WALL_POST_MAX = 200;        // 一条帖子最多字数
export const WALL_COMMENT_MAX = 100;     // 一条评论最多字数
export const WALL_POST_COOLDOWN_MS = 45_000;   // 同一个人两条帖子的最短间隔
export const WALL_POST_DAILY = 6;        // 同一个人 24 小时内最多发几条帖子
export const WALL_COMMENT_COOLDOWN_MS = 6_000;
export const WALL_COMMENT_DAILY = 60;
export const WALL_DAY_CAP = 400;         // 全服每天最多收多少条帖子（防刷）
export const WALL_PAGE = 20;             // 一页帖子数
export const WALL_THREAD_MAX = 150;      // 一条帖子下最多显示的评论数
export const WALL_REPORT_HIDE = 3;       // 被这么多人举报，普通玩家就看不到了（等管理员处理）
export const WALL_ANON_NAME = '匿名同学';

/** 排序：new = 发布时间（id）倒序；hot = 热度分倒序（同分新的在前） */
export const WALL_SORTS = ['new', 'hot'] as const;
export type WallSort = (typeof WALL_SORTS)[number];
export const cleanWallSort = (s: unknown): WallSort => (s === 'hot' ? 'hot' : 'new');
/** 热度分衰减指数（越大越偏向新帖；0.8：一天前的 10 赞仍压过刚发的空帖，约一周后淡出）；一条帖子 hours 小时后：score = (赞 + 评论×2 + 1) / (hours + 2)^GRAVITY */
export const WALL_HOT_GRAVITY = 0.8;
export function wallHotScore(likes: number, comments: number, ts: number, now: number): number {
  const hours = Math.max(0, (now - ts) / 3600_000);
  return (Math.max(0, likes) + 2 * Math.max(0, comments) + 1) / Math.pow(hours + 2, WALL_HOT_GRAVITY);
}

/** 便利贴：纸色（粉 / 黄 / 蓝 / 绿，按作者名的 hue 取）、固定倾斜角（按帖子 id，-1.5°~1.5°，重画不变） */
export const WALL_NOTE_PAPERS = [
  { name: '粉', bg: '#ffe2ea', edge: '#f0a8bc' }, { name: '黄', bg: '#fff3b4', edge: '#e6c85a' },
  { name: '蓝', bg: '#dcecff', edge: '#94bce8' }, { name: '绿', bg: '#def5d4', edge: '#9cd08a' },
] as const;
export const notePaper = (hue: number) => WALL_NOTE_PAPERS[Math.floor((((hue % 360) + 360) % 360) / 90) % 4];
export function noteTilt(id: number): number {
  const h = Math.imul((id | 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  return Math.round(((h % 3001) / 1000 - 1.5) * 10) / 10;
}
/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超过 30 天显示月-日 */
export function wallRelTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(ts); return `${d.getMonth() + 1}-${d.getDate()}`;
}

export interface WallPost {
  id: number; name: string; hue: number; anon: boolean; text: string; ts: number;
  likes: number; liked: boolean; comments: number; mine: boolean;
  /** 还在等管理员审核：只有作者本人和管理员看得到，别人看不到、也不能点赞评论 */
  pending?: boolean;
  /** 被举报多次、暂时折叠（管理员和作者本人才看得到内容） */
  hidden?: boolean;
  /** 只发给管理员：作者身份标识、真名、校园号、被举报次数 */
  by?: string; real?: string; uid?: number; reports?: number;
}
export interface WallComment {
  id: number; post: number; name: string; hue: number; anon: boolean; /** 是不是楼主 */ op: boolean; text: string; ts: number; mine: boolean;
  by?: string; real?: string; uid?: number;
}

export const cleanWallText = (s: unknown, max: number) => cleanText(s, max);
