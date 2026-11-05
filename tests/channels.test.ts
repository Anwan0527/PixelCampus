import { describe, it, expect } from 'vitest';
import {
  CHANNELS, CHANNEL_IDS, applyChannelSet, cleanChannelPrefs, isChannelId, isChannelMuted, isChannelOn, isSendable, parseSlash,
  type ChannelPrefsMap, type ChannelState,
} from '../src/shared/channels';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '../src/shared/protocol';

describe('频道定义', () => {
  it('四个频道：world / near / party / sys；每个都有名字、图标、颜色、占位符；默认全开', () => {
    expect([...CHANNEL_IDS]).toEqual(['world', 'near', 'party', 'sys']);
    for (const id of CHANNEL_IDS) {
      const c = CHANNELS[id]; expect(c.id).toBe(id);
      expect(c.name.length).toBeGreaterThan(0); expect(c.icon.length).toBeGreaterThan(0); expect(c.placeholder.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i); expect(c.defaultOn).toBe(true);
    }
  });
  it('系统频道不能发言，其余三个可以；isChannelId / isSendable 拒绝一切别的东西', () => {
    expect(isSendable('world') && isSendable('near') && isSendable('party')).toBe(true);
    expect(isSendable('sys')).toBe(false); expect(CHANNELS.sys.sendable).toBe(false);
    for (const bad of ['', 'WORLD', 'grp:1', 'dm:1', 'constructor', '__proto__', null, undefined, 3, {}, ['world']]) { expect(isChannelId(bad), String(bad)).toBe(false); expect(isSendable(bad)).toBe(false); }
  });
});

describe('前缀命令 parseSlash', () => {
  it('三个频道的前缀和中文别名；前缀大小写不敏感', () => {
    expect(parseSlash('/w 大家好')).toEqual({ ch: 'world', text: '大家好' });
    expect(parseSlash('/n 有人吗')).toEqual({ ch: 'near', text: '有人吗' });
    expect(parseSlash('/p 去图书馆')).toEqual({ ch: 'party', text: '去图书馆' });
    expect(parseSlash('/世界 你好')).toEqual({ ch: 'world', text: '你好' });
    expect(parseSlash('/附近 你好')).toEqual({ ch: 'near', text: '你好' });
    expect(parseSlash('/队伍 你好')).toEqual({ ch: 'party', text: '你好' });
    expect(parseSlash('/P 大写也行')).toEqual({ ch: 'party', text: '大写也行' });
  });
  it('没有前缀就是原文；全角空格、多个空格、前后空白都能处理，正文里的 / 不受影响', () => {
    expect(parseSlash('你好')).toEqual({ text: '你好' });
    expect(parseSlash('')).toEqual({ text: '' });
    expect(parseSlash('/p　你好')).toEqual({ ch: 'party', text: '你好' });
    expect(parseSlash('/p     你好   ')).toEqual({ ch: 'party', text: '你好' });
    expect(parseSlash('/p 5/3 去哪')).toEqual({ ch: 'party', text: '5/3 去哪' });
    expect(parseSlash('今天 /p 不是命令')).toEqual({ text: '今天 /p 不是命令' });
    expect(parseSlash(' /p 前面有空格就不是命令')).toEqual({ text: ' /p 前面有空格就不是命令' });
  });
  it('只有前缀、后面没内容：返回频道和空串（客户端据此只切换频道、不发话）', () => {
    expect(parseSlash('/p')).toEqual({ ch: 'party', text: '' });
    expect(parseSlash('/p ')).toEqual({ ch: 'party', text: '' });
    expect(parseSlash('/w　')).toEqual({ ch: 'world', text: '' });
  });
  it('不认识的前缀 → unknown（不发送）；sys 没有前缀；前缀后面直接跟字不算前缀', () => {
    expect(parseSlash('/哈哈 你好')).toEqual({ text: '/哈哈 你好', unknown: '哈哈' });
    expect(parseSlash('/g 群名 内容')).toEqual({ text: '/g 群名 内容', unknown: 'g' }); // 群聊是 P2
    expect(parseSlash('/s 系统')).toEqual({ text: '/s 系统', unknown: 's' });
    expect(parseSlash('/p你好')).toEqual({ text: '/p你好', unknown: 'p你好' });
  });
  it('单独的 / 、"/ 你好"、路径之类当普通话', () => {
    expect(parseSlash('/')).toEqual({ text: '/' });
    expect(parseSlash('/ 你好')).toEqual({ text: '/ 你好' });
    expect(parseSlash('/usr/bin')).toEqual({ text: '/usr/bin' });
    expect(parseSlash('//p 你好')).toEqual({ text: '//p 你好' });
  });
  it('非字符串输入不会崩', () => {
    expect(parseSlash(undefined as unknown as string)).toEqual({ text: '' });
    expect(parseSlash(5 as unknown as string)).toEqual({ text: '' });
  });
});

describe('频道偏好 cleanChannelPrefs / applyChannelSet', () => {
  it('合法的原样保留；只留 off / mute；1 和 true 都认；没有任何开关的频道不留', () => {
    expect(cleanChannelPrefs({ world: { off: 1 }, party: { mute: true }, near: { off: 1, mute: 1, junk: 'x' } })).toEqual({ world: { off: 1 }, party: { mute: 1 }, near: { off: 1, mute: 1 } });
    expect(cleanChannelPrefs({ world: {}, near: { off: 0, mute: false }, party: { off: 'yes' } })).toEqual({});
  });
  it('脏数据：未知频道、原型污染、非对象、数组、null 一律清掉', () => {
    expect(cleanChannelPrefs({ foo: { off: 1 }, 'grp:1': { off: 1 }, __proto__: { world: { off: 1 } } })).toEqual({});
    for (const bad of [null, undefined, 5, 'x', [], [{ off: 1 }], true]) expect(cleanChannelPrefs(bad)).toEqual({});
    expect(cleanChannelPrefs({ world: null, near: 'off', party: [1] })).toEqual({});
    expect(({} as Record<string, unknown>).off).toBeUndefined(); // 没有污染
  });
  it('applyChannelSet：关 / 开 / 静音 / 取消静音；改回默认就把那个频道去掉；不改原对象；没给的字段不动', () => {
    const base: ChannelPrefsMap = {};
    const a = applyChannelSet(base, 'world', { on: false }); expect(a).toEqual({ world: { off: 1 } }); expect(base).toEqual({});
    const b = applyChannelSet(a, 'world', { mute: true }); expect(b).toEqual({ world: { off: 1, mute: 1 } });
    const c = applyChannelSet(b, 'world', { on: true }); expect(c).toEqual({ world: { mute: 1 } });
    const d = applyChannelSet(c, 'world', { mute: false }); expect(d).toEqual({}); // 回到默认：不留空字段
    expect(applyChannelSet(a, 'near', { mute: true })).toEqual({ world: { off: 1 }, near: { mute: 1 } });
    expect(applyChannelSet(a, 'world', {})).toEqual({ world: { off: 1 } });
    expect(a).toEqual({ world: { off: 1 } }); // 原对象没被改
  });
  it('isChannelOn / isChannelMuted：没有记录 = 开、不静音', () => {
    const p = cleanChannelPrefs({ party: { off: 1 }, near: { mute: 1 } });
    expect(isChannelOn(p, 'world')).toBe(true); expect(isChannelOn(p, 'party')).toBe(false); expect(isChannelOn(p, 'near')).toBe(true);
    expect(isChannelMuted(p, 'near')).toBe(true); expect(isChannelMuted(p, 'world')).toBe(false);
  });
});

describe('协议：频道消息（编译期 + 版本）', () => {
  it('协议版本 ≥ 9（聊天频道上线后旧页面必须刷新；钓鱼 2.0 升到 10）', () => { expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(9); });
  it('新消息的类型：chat 带 ch、ch_get、ch_set；服务器的 chat 带 ch、channels、ch_result；举报带 ch', () => {
    const toServer: ClientMsg[] = [
      { t: 'chat', text: '你好' }, { t: 'chat', text: '你好', ch: 'party' }, { t: 'ch_get' },
      { t: 'ch_set', ch: 'world', on: false }, { t: 'ch_set', ch: 'near', mute: true },
      { t: 'report', kind: 'chat', ref: 7, reason: 0, ch: 'party' },
    ];
    const items: ChannelState[] = [{ id: 'world', on: true, mute: false, n: 23 }, { id: 'near', on: true, mute: false }, { id: 'party', on: false, mute: true, n: 3 }, { id: 'sys', on: true, mute: false }];
    const toClient: ServerMsg[] = [
      { t: 'chat', pid: 1, uid: 10001, from: '甲', hue: 3, text: '你好', ts: 1 },
      { t: 'chat', pid: 1, uid: 10001, from: '甲', hue: 3, text: '队伍里的话', ts: 1, mid: 9, ch: 'party' },
      { t: 'channels', items }, { t: 'ch_result', ok: false, msg: '先把这个频道打开' },
    ];
    // 能 JSON 往返、字段不丢（真正的类型检查由 npx tsc --noEmit 做）
    for (const m of [...toServer, ...toClient]) expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(toClient.some((m) => m.t === 'chat' && m.ch === 'party')).toBe(true);
  });
});
