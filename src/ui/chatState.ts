import { CHANNELS, CHANNEL_IDS, DEFAULT_CHANNEL_STATES, OFFLINE_CHANNEL_STATES, isChannelId, type ChannelId, type ChannelState } from '@/shared/channels';
import type { ChatMessage } from '@/shared/chat';

/**
 * 聊天窗口的纯逻辑（不碰 DOM，方便测试）：每个频道各自的消息缓冲、未读数、当前频道、开关 / 静音状态。
 * ChatPanel 只负责把这里的状态画出来。
 */
export const KEEP = 60;
export { DEFAULT_CHANNEL_STATES, OFFLINE_CHANNEL_STATES };

/** 这条消息属于哪个频道：系统消息一律进系统频道；「刷新个人纪录」的播报也进系统频道（不占世界频道）；其他广播（神话鱼）进它带的频道（服务端写 world），聊天消息按 ch（不写 = 世界） */
export const channelOf = (m: Pick<ChatMessage, 'kind' | 'ch'> & { tone?: ChatMessage['tone'] }): ChannelId => (m.kind === 'system' || (m.kind === 'broadcast' && m.tone === 'record') ? 'sys' : m.ch && isChannelId(m.ch) ? m.ch : 'world');

export interface Received {
  ch: ChannelId;
  /** 这个频道现在是不是开着（关着的话客户端也不收，比如离线回显或系统频道被关） */
  accepted: boolean;
  /** 静音的频道：不弹小条、不冒气泡 */
  muted: boolean;
}

export class ChatState {
  private chans: ChannelState[] = DEFAULT_CHANNEL_STATES.map((c) => ({ ...c }));
  readonly buffers: Record<ChannelId, ChatMessage[]> = { world: [], near: [], party: [], sys: [] };
  readonly unread: Record<ChannelId, number> = { world: 0, near: 0, party: 0, sys: 0 };
  active: ChannelId = 'world';

  /** 现在有的频道（按 world / near / party / sys 的顺序） */
  get channels(): readonly ChannelState[] { return this.chans; }
  has(ch: ChannelId) { return this.chans.some((c) => c.id === ch); }
  stateOf(ch: ChannelId): ChannelState | undefined { return this.chans.find((c) => c.id === ch); }
  isOn(ch: ChannelId) { return this.stateOf(ch)?.on === true; }
  isMuted(ch: ChannelId) { return this.stateOf(ch)?.mute === true; }

  /** 服务器发来（或本地离线默认）的频道状态：按固定顺序排列，丢掉不认识的；没有了的频道（队伍解散）清掉缓冲和未读，当前频道没了就回到世界 */
  setChannels(items: readonly ChannelState[]): { removed: ChannelId[]; added: ChannelId[] } {
    const next = CHANNEL_IDS.map((id) => items.find((x) => x.id === id)).filter((x): x is ChannelState => !!x).map((x) => ({ ...x }));
    const before = new Set(this.chans.map((c) => c.id)), after = new Set(next.map((c) => c.id));
    const removed = [...before].filter((id) => !after.has(id)), added = [...after].filter((id) => !before.has(id));
    this.chans = next;
    for (const id of removed) { this.buffers[id] = []; this.unread[id] = 0; }
    if (!after.has(this.active)) this.active = 'world';
    return { removed, added };
  }
  /** 本地先改一下（乐观更新）：界面马上变，服务器的 channels 回来后会再覆盖一次 */
  patch(ch: ChannelId, set: { on?: boolean; mute?: boolean }) {
    const s = this.stateOf(ch); if (!s) return;
    if (typeof set.on === 'boolean') s.on = set.on;
    if (typeof set.mute === 'boolean') s.mute = set.mute;
  }

  /**
   * 收到一条消息：放进它所在频道的缓冲，涨未读。
   * 未读：不是当前频道，或者聊天框收起着（`collapsed`，手机上）；当前频道且聊天框展开就不算未读。
   * 自己发的话（`own`）不算未读。
   * 频道不存在（比如队伍已解散后才到的话）或已关闭：不收（返回 accepted = false）。
   */
  receive(m: ChatMessage, collapsed = false, own = false): Received {
    const ch = channelOf(m), s = this.stateOf(ch);
    if (!s || !s.on) return { ch, accepted: false, muted: !!s?.mute };
    const buf = this.buffers[ch]; buf.push(m); while (buf.length > KEEP) buf.shift();
    if (!own && (ch !== this.active || collapsed)) this.unread[ch]++;
    return { ch, accepted: true, muted: s.mute };
  }
  /** 历史记录（进游戏时的最近公屏）：只进世界频道，不涨未读 */
  addHistory(m: ChatMessage) { const b = this.buffers.world; b.push(m); while (b.length > KEEP) b.shift(); }

  /** 切到某个频道（必须是现有的频道）：清它的未读 */
  setActive(ch: ChannelId): boolean {
    if (!this.has(ch)) return false;
    this.active = ch; this.unread[ch] = 0; return true;
  }
  /** 聊天框展开时：当前频道的未读清零 */
  markActiveRead() { this.unread[this.active] = 0; }

  /** 能不能在这个频道发言：不存在 / 系统频道 / 已关闭都不行，并给出原因（界面直接显示） */
  canSend(ch: ChannelId): { ok: true } | { ok: false; reason: string } {
    if (!CHANNELS[ch].sendable) return { ok: false, reason: `${CHANNELS[ch].name}频道不能发言` };
    const s = this.stateOf(ch);
    if (!s) return { ok: false, reason: ch === 'party' ? '你还没有队伍：先邀请好友组队' : `没有${CHANNELS[ch].name}频道` };
    if (!s.on) return { ok: false, reason: `${CHANNELS[ch].name}频道已关闭，点 ⚙ 打开后再发言` };
    return { ok: true };
  }
  /** 下一个能发言的频道（Tab 循环用）；没有别的就返回当前 */
  nextSendable(from: ChannelId = this.active): ChannelId {
    const list = this.chans.filter((c) => CHANNELS[c.id].sendable && c.on).map((c) => c.id);
    if (!list.length) return from;
    const i = list.indexOf(from);
    return list[(i + 1) % list.length];
  }

  /** 世界切换：世界和附近的消息是"上一个世界"的，清掉；队伍、系统保留 */
  clearWorldScoped() { for (const id of ['world', 'near'] as const) { this.buffers[id] = []; this.unread[id] = 0; } }
  /** 撤回：返回有没有在缓冲里找到（界面据此把那一行改成灰字） */
  recall(mids: readonly number[]): number[] {
    const hit: number[] = [];
    for (const id of CHANNEL_IDS) for (const m of this.buffers[id]) if (m.mid !== undefined && mids.includes(m.mid)) { hit.push(m.mid); }
    return hit;
  }

  /** 所有没静音、没关闭的频道的未读总数（手机底部「聊天」按钮的角标） */
  totalUnread(): number { let n = 0; for (const c of this.chans) if (c.on && !c.mute) n += this.unread[c.id]; return n; }
}

/** 这条消息要不要在 NPC / 玩家头上冒气泡：系统不冒；广播不冒；静音和关闭的频道不冒；世界 / 附近普通气泡，队伍另一种样式 */
export function bubbleStyle(state: ChatState, m: ChatMessage): 'normal' | 'party' | null {
  const ch = channelOf(m);
  if (ch === 'sys' || m.kind === 'broadcast') return null;
  const s = state.stateOf(ch);
  if (!s || !s.on || s.mute) return null;
  return ch === 'party' ? 'party' : 'normal';
}
