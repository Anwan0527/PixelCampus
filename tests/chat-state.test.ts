import { describe, it, expect } from 'vitest';
import { ChatState, KEEP, bubbleStyle, channelOf } from '../src/ui/chatState';
import { DEFAULT_CHANNEL_STATES, OFFLINE_CHANNEL_STATES, type ChannelState } from '../src/shared/channels';
import type { ChatMessage } from '../src/shared/chat';

let id = 0;
const chat = (text: string, ch?: ChatMessage['ch'], mid?: number): ChatMessage => ({ id: ++id, kind: 'chat', from: '甲', hue: 1, text, ts: 1, uid: 10001, ...(ch ? { ch } : {}), ...(mid ? { mid } : {}) });
const sys = (text: string): ChatMessage => ({ id: ++id, kind: 'system', text, ts: 1 });
const st = (o: Partial<Record<string, Partial<ChannelState>>> = {}, withParty = false): ChannelState[] => [
  { id: 'world', on: true, mute: false, n: 5, ...o.world }, { id: 'near', on: true, mute: false, ...o.near },
  ...(withParty ? [{ id: 'party' as const, on: true, mute: false, n: 2, ...o.party }] : []), { id: 'sys', on: true, mute: false, ...o.sys },
];

describe('消息归属 channelOf', () => {
  it('系统消息一律进系统频道；聊天按 ch，不写 = 世界；乱写的 ch 当世界', () => {
    expect(channelOf(sys('欢迎'))).toBe('sys');
    expect(channelOf({ kind: 'system', ch: 'party' })).toBe('sys');
    expect(channelOf(chat('你好'))).toBe('world'); expect(channelOf(chat('你好', 'near'))).toBe('near'); expect(channelOf(chat('你好', 'party'))).toBe('party');
    expect(channelOf({ kind: 'chat', ch: 'grp:1' as never })).toBe('world');
  });
});

describe('ChatState 频道列表', () => {
  it('默认频道：世界 / 附近 / 系统；离线：世界 / 系统；按固定顺序排列，丢掉不认识的', () => {
    expect(new ChatState().channels.map((c) => c.id)).toEqual(['world', 'near', 'sys']);
    const s = new ChatState(); s.setChannels(OFFLINE_CHANNEL_STATES); expect(s.channels.map((c) => c.id)).toEqual(['world', 'sys']);
    s.setChannels([{ id: 'sys', on: true, mute: false }, { id: 'party', on: true, mute: false }, { id: 'world', on: true, mute: false }, { id: 'bogus' as never, on: true, mute: false }]);
    expect(s.channels.map((c) => c.id)).toEqual(['world', 'party', 'sys']);
    expect(DEFAULT_CHANNEL_STATES.length).toBe(3);
  });
  it('队伍出现 / 消失：消失时清掉它的消息和未读，当前就在队伍标签上的话回到世界；world 缓冲不受影响', () => {
    const s = new ChatState(); const d1 = s.setChannels(st({}, true)); expect(d1.added).toEqual(['party']);
    s.setActive('party'); s.receive(chat('队伍话', 'party')); s.receive(chat('世界话')); expect(s.buffers.party.length).toBe(1); expect(s.unread.world).toBe(1);
    const d2 = s.setChannels(st()); expect(d2.removed).toEqual(['party']);
    expect(s.buffers.party).toEqual([]); expect(s.unread.party).toBe(0); expect(s.active).toBe('world'); expect(s.buffers.world.length).toBe(1);
  });
  it('patch 乐观更新开关 / 静音，服务器的 channels 回来再覆盖', () => {
    const s = new ChatState(); s.patch('world', { on: false }); expect(s.isOn('world')).toBe(false); s.patch('near', { mute: true }); expect(s.isMuted('near')).toBe(true);
    s.patch('party', { on: false }); // 没有的频道：忽略
    s.setChannels(st()); expect(s.isOn('world')).toBe(true); expect(s.isMuted('near')).toBe(false);
  });
});

describe('收消息与未读', () => {
  it('按频道进缓冲；非当前频道涨未读；当前频道（展开）不涨；收起（手机）时当前频道也涨', () => {
    const s = new ChatState(); s.setChannels(st({}, true));
    expect(s.receive(chat('世界话')).ch).toBe('world'); expect(s.unread.world).toBe(0);
    s.receive(chat('附近话', 'near')); s.receive(chat('队伍话', 'party')); s.receive(sys('系统话'));
    expect(s.unread).toMatchObject({ near: 1, party: 1, sys: 1, world: 0 });
    expect(s.buffers.near.map((m) => m.text)).toEqual(['附近话']); expect(s.buffers.sys.map((m) => m.text)).toEqual(['系统话']);
    s.receive(chat('收起时的世界话'), true); expect(s.unread.world).toBe(1);
    s.setActive('near'); expect(s.unread.near).toBe(0); expect(s.active).toBe('near');
    expect(s.setActive('nope' as never)).toBe(false);
  });
  it('自己发的话不涨未读（哪怕发到别的频道标签里）', () => {
    const s = new ChatState(); s.setChannels(st({}, true));
    s.receive(chat('我发的附近话', 'near'), false, true); s.receive(chat('我发的队伍话', 'party'), true, true);
    expect(s.unread).toMatchObject({ near: 0, party: 0, world: 0 }); expect(s.buffers.near.length).toBe(1);
  });
  it('静音：照样收、涨未读（灰色），但 muted = true 且不计入角标总数；关闭的频道不收', () => {
    const s = new ChatState(); s.setChannels(st({ near: { mute: true }, sys: { on: false } }, true));
    const r = s.receive(chat('静音的话', 'near')); expect(r).toEqual({ ch: 'near', accepted: true, muted: true }); expect(s.unread.near).toBe(1);
    s.receive(chat('队伍', 'party')); expect(s.totalUnread()).toBe(1); // 只算没静音的：队伍 1
    const c = s.receive(sys('被关的系统频道')); expect(c.accepted).toBe(false); expect(s.buffers.sys).toEqual([]);
    s.setChannels(st({ world: { on: false } })); expect(s.receive(chat('世界已关')).accepted).toBe(false);
  });
  it('频道不存在（队伍已解散后才到的话）不收；每个频道最多留 KEEP 条', () => {
    const s = new ChatState(); expect(s.receive(chat('晚到的队伍话', 'party')).accepted).toBe(false);
    for (let i = 0; i < KEEP + 15; i++) s.receive(chat(`第${i}条`));
    expect(s.buffers.world.length).toBe(KEEP); expect(s.buffers.world[0].text).toBe('第15条');
  });
  it('历史记录只进世界频道，不涨未读', () => {
    const s = new ChatState(); s.setActive('near'); s.addHistory(chat('历史')); expect(s.buffers.world.length).toBe(1); expect(s.unread.world).toBe(0);
  });
});

describe('发言权限 canSend / Tab 循环', () => {
  it('系统频道不能发；关闭的不能发并提示怎么打开；没有队伍给出组队提示；世界 / 附近可以', () => {
    const s = new ChatState(); s.setChannels(st({ near: { on: false } }));
    expect(s.canSend('world')).toEqual({ ok: true });
    const sy = s.canSend('sys'); expect(sy.ok).toBe(false); if (!sy.ok) expect(sy.reason).toContain('不能发言');
    const nr = s.canSend('near'); expect(nr.ok).toBe(false); if (!nr.ok) expect(nr.reason).toContain('已关闭');
    const pt = s.canSend('party'); expect(pt.ok).toBe(false); if (!pt.ok) expect(pt.reason).toContain('组队');
  });
  it('nextSendable 只在能发言且开着的频道里循环；只有一个就停在原地', () => {
    const s = new ChatState(); s.setChannels(st({}, true));
    expect(s.nextSendable('world')).toBe('near'); expect(s.nextSendable('near')).toBe('party'); expect(s.nextSendable('party')).toBe('world');
    s.setChannels(st({ near: { on: false } }, true)); expect(s.nextSendable('world')).toBe('party');
    s.setChannels(st({ near: { on: false } })); expect(s.nextSendable('world')).toBe('world');
    expect(s.nextSendable('sys')).toBe('world'); // 从系统标签出发：回到第一个能发言的
  });
});

describe('切世界 / 撤回 / 气泡', () => {
  it('切世界：清世界和附近（含未读），保留队伍和系统', () => {
    const s = new ChatState(); s.setChannels(st({}, true)); s.setActive('party');
    s.receive(chat('世界')); s.receive(chat('附近', 'near')); s.receive(chat('队伍', 'party')); s.receive(sys('系统'));
    s.clearWorldScoped(); expect(s.buffers.world).toEqual([]); expect(s.buffers.near).toEqual([]); expect(s.unread.world + s.unread.near).toBe(0);
    expect(s.buffers.party.length).toBe(1); expect(s.buffers.sys.length).toBe(1); expect(s.unread.sys).toBe(1);
  });
  it('撤回：在缓冲里找到哪些编号（队伍的话也能找到）', () => {
    const s = new ChatState(); s.setChannels(st({}, true)); s.receive(chat('一', undefined, 11)); s.receive(chat('二', 'party', 12));
    expect(s.recall([12, 99])).toEqual([12]); expect(s.recall([11, 12]).sort()).toEqual([11, 12]); expect(s.recall([])).toEqual([]);
  });
  it('气泡：世界 / 附近是普通气泡，队伍是另一种；系统、静音、关闭、不存在的频道都不冒', () => {
    const s = new ChatState(); s.setChannels(st({ near: { mute: true }, world: {} }, true));
    expect(bubbleStyle(s, chat('世界'))).toBe('normal'); expect(bubbleStyle(s, chat('队伍', 'party'))).toBe('party');
    expect(bubbleStyle(s, chat('附近静音', 'near'))).toBeNull(); expect(bubbleStyle(s, sys('系统'))).toBeNull();
    s.setChannels(st({ world: { on: false } })); expect(bubbleStyle(s, chat('世界关闭'))).toBeNull(); expect(bubbleStyle(s, chat('队伍没了', 'party'))).toBeNull();
  });
});
