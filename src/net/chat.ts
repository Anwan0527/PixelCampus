import type { ChatMessage } from '@/shared/chat';
import type { ChannelId, ChannelState } from '@/shared/channels';

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
  /** ch 不写 = 世界；没连上服务器时只回显给自己 */
  send(text: string, ch?: ChannelId): void;
  /** 我现在有哪些频道和状态（离线时只有世界 / 系统） */
  readonly channels: readonly ChannelState[];
  /** 改某个频道的开关 / 静音（离线时只在本机生效，不存档） */
  chSet(ch: ChannelId, set: { on?: boolean; mute?: boolean }): void;
  onChannels(cb: (items: readonly ChannelState[]) => void): void;
  /** 服务器对频道操作的回复（被拒时的原因，如「先把这个频道打开」） */
  onChResult(cb: (ok: boolean, msg: string) => void): void;
  onMessage(cb: (m: ChatMessage) => void): void;
  onStatus(cb: (s: ChatStatus) => void): void;
}
