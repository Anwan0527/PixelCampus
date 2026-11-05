/** 留言板（收集玩家意见）：消息格式、分类与限制。客户端、服务器共用。 */
import { cleanText } from './profile';

export const BOARD_CATS = ['建议', '问题', '想要的功能', '闲聊'] as const;
export const BOARD_MAX = 200;           // 一条留言最多字数
export const BOARD_COOLDOWN_MS = 20_000; // 同一个人两条留言的最短间隔
export const BOARD_DAILY = 10;          // 同一个人 24 小时内最多条数
export const BOARD_DAY_CAP = 500;       // 全服每天最多收多少条（防刷）
export const BOARD_LIST = 50;           // 面板里显示最近多少条

export interface BoardItem {
  id: number; name: string; hue: number; cat: number; text: string; ts: number;
  /** 作者身份哈希的前 12 位——只会发给管理员（用来识别刷屏的人并"删此人全部"），普通玩家收不到 */
  by?: string;
  /** 作者的校园号——只会发给管理员（直接对这个人禁言 / 封禁）；老留言可能没有 */
  uid?: number;
  /** 这条是我自己发的（只有作者本人收到）：可以自己删除 */
  mine?: boolean;
}

export const validCat = (c: unknown): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) < BOARD_CATS.length;
/** 单行文本：去控制/零宽字符、折叠空白、按字截断；清洗后为空返回 '' */
export const cleanBoardText = (s: unknown) => cleanText(s, BOARD_MAX);
