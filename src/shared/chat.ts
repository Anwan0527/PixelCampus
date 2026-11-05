/** 公共聊天频道（公屏）的消息格式与清洗。客户端、服务器共用。 */
export const CHAT_MAX = 80;
export const CHAT_COOLDOWN_MS = 800;

export interface ChatMessage {
  id: number;
  kind: 'chat' | 'system';
  /** 发言者在服务器上的编号（用来在头顶冒气泡；离线/系统消息没有） */
  pid?: number;
  /** 发言者的校园号（点名字可以看资料、加好友）；离线回显/系统消息没有 */
  uid?: number;
  /** 发言者昵称（system 没有） */
  from?: string;
  /** 昵称配色色相 */
  hue?: number;
  text: string;
  /** 记录编号（服务器给的；管理员撤回、查记录用）；离线回显/系统消息没有 */
  mid?: number;
  /** 毫秒时间戳 */
  ts: number;
}

/** 与 profile.cleanText 同一套规则：去控制/零宽字符，折叠空白，按字截断；清洗后为空则返回 '' */
export function cleanChatText(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, CHAT_MAX).join('');
}
