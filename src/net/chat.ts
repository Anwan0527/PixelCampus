import type { ChatMessage } from '@/shared/chat';

export type ChatStatus = 'offline' | 'online';

/**
 * 公屏聊天通道。界面只依赖这个接口；实现是 src/net/client.ts 的 NetClient（离线时只回显给自己）。
 */
export interface ChatTransport {
  readonly status: ChatStatus;
  /** 在线人数（离线时未知） */
  readonly online?: number;
  /** 我的校园号（连上服务器后才有） */
  readonly selfUid?: number;
  send(text: string): void;
  onMessage(cb: (m: ChatMessage) => void): void;
  onStatus(cb: (s: ChatStatus) => void): void;
}
