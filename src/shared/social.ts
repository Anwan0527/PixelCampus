import { cleanText } from './profile';
/** 好友 / 私聊：消息格式与限制。客户端、服务器共用。身份用服务器分配的"校园号"(uid)，不用客户端自己填的任何东西。 */
export const FRIEND_MAX = 100;       // 好友上限
export const INCOMING_MAX = 50;      // 待处理的好友申请上限（再多的忽略）
export const DM_MAX = 300;           // 一条私聊最多字数
export const DM_PAGE = 50;           // 打开会话时加载最近多少条
export const DM_PER_MIN = 20;        // 每人每分钟最多发多少条私聊
export const UID_START = 10001;      // 校园号从这里起编
export const NOTE_MAX = 12;          // 好友备注最多几个字（只有自己看得到）

export interface PersonInfo { uid: number; name: string; look: number; /** 外观自定义（没有就按 look 显示预置造型） */ app?: number[]; gender: 'm' | 'f'; college: string; major: string; /** 佩戴的称号 id */ title?: string }
export interface FriendInfo extends PersonInfo {
  online: boolean;
  /** 最后一次在线的时间（毫秒） */
  seen: number;
  unread: number;
  /** 我给 TA 写的备注（只有我自己看得到） */
  note?: string;
  /** 最近一条私聊的预览（没有聊过为空） */
  last?: { text: string; ts: number; mine: boolean };
}
/** 从磁盘来的好友备注：只留合法的校园号和清洗过的文字，条数不超过好友上限 */
export function cleanFriendNotes(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{5,9}$/.test(k) || !validUid(Number(k))) continue;
    const n = cleanText(v, NOTE_MAX); if (n) out[k] = n;
    if (Object.keys(out).length >= FRIEND_MAX) break;
  }
  return Object.keys(out).length ? out : undefined;
}
export interface DmMsg { id: number; from: number; to: number; text: string; ts: number }
export interface ChatHistoryItem { from: string; hue: number; text: string; ts: number; uid?: number; /** 记录编号（第几条公屏消息，从 1 开始；撤回按它找） */ mid?: number; /** 发言所在的世界（公共世界不写这个字段；个人/好友世界是世界编号） */ w?: string }

export const validUid = (u: unknown): u is number => Number.isInteger(u) && (u as number) >= UID_START && (u as number) < 1e9;
