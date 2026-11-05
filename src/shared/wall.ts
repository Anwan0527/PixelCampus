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
