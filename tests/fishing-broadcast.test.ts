import { describe, it, expect } from 'vitest';
import { shouldBroadcastCatch, fishDef } from '../src/shared/fishing';
import { ChatState, bubbleStyle, channelOf } from '../src/ui/chatState';
import { DEFAULT_CHANNEL_STATES, type ChannelState } from '../src/shared/channels';
import type { ChatMessage } from '../src/shared/chat';

const def = (id: string) => {
  const d = fishDef(id);
  if (!d) throw new Error(`no fish: ${id}`);
  return d;
};

describe('钓鱼全服播报门槛 shouldBroadcastCatch', () => {
  it('神话鱼恒播报（无论是否破纪录）', () => {
    for (const id of ['fish_hegongjin', 'fish_xuangui', 'fish_yinglong']) {
      expect(shouldBroadcastCatch(def(id), false), id).toBe(true);
      expect(shouldBroadcastCatch(def(id), true), id).toBe(true);
    }
  });

  it('破个人纪录时播报（任何稀有度）', () => {
    expect(shouldBroadcastCatch(def('fish_crucian'), true)).toBe(true); // common
    expect(shouldBroadcastCatch(def('fish_arowana'), true)).toBe(true); // epic
  });

  it('非神话且没破纪录：不播报', () => {
    expect(shouldBroadcastCatch(def('fish_crucian'), false)).toBe(false); // common
    expect(shouldBroadcastCatch(def('fish_arowana'), false)).toBe(false); // epic
    expect(shouldBroadcastCatch(def('fish_goldkoi'), false)).toBe(false); // legendary
    expect(shouldBroadcastCatch(def('junk_boot'), false)).toBe(false); // junk
  });
});

describe('广播消息的频道归类与气泡', () => {
  let id = 0;
  const broadcast = (text: string, tone?: ChatMessage['tone']): ChatMessage => ({ id: ++id, kind: 'broadcast', text, ts: 1, ch: 'world', ...(tone ? { tone } : {}) });

  it('所有广播（神话鱼 / 刷新纪录）都进系统频道，不占世界频道；就算服务端写了 ch=world 也进系统', () => {
    expect(channelOf(broadcast('🎣 某某钓到了神话·河工锦！', 'mythic'))).toBe('sys');
    expect(channelOf(broadcast('🎣 某某刷新了「鲫鱼」的个人纪录！', 'record'))).toBe('sys');
    const noCh: Pick<ChatMessage, 'kind' | 'ch'> = { kind: 'broadcast' };
    expect(channelOf(noCh)).toBe('sys');
    const s = new ChatState(); s.setChannels(DEFAULT_CHANNEL_STATES.map((c) => ({ ...c })));
    for (const tone of ['mythic', 'record'] as const) {
      const m = broadcast('🎣 播报', tone);
      expect(s.receive(m).ch).toBe('sys'); expect(s.buffers.world.some((x) => x.id === m.id)).toBe(false);
    }
  });

  it('广播消息不冒气泡（不是真实玩家发言）', () => {
    const s = new ChatState();
    const st: ChannelState[] = DEFAULT_CHANNEL_STATES.map((c) => ({ ...c }));
    s.setChannels(st);
    expect(bubbleStyle(s, broadcast('🎣 某某刷新了纪录！'))).toBe(null);
    expect(bubbleStyle(s, broadcast('🎣 某某刷新了纪录！', 'mythic'))).toBe(null);
  });

  it('广播消息能被 receive 收进系统频道缓冲（可静音/关闭仍走现有机制）', () => {
    const s = new ChatState();
    s.setChannels(DEFAULT_CHANNEL_STATES.map((c) => ({ ...c })));
    const m = broadcast('🎣 某某钓到了神话·应龙！');
    const r = s.receive(m);
    expect(r.ch).toBe('sys');
    expect(r.accepted).toBe(true);
    expect(s.buffers.sys.some((x) => x.id === m.id)).toBe(true);
  });
});
