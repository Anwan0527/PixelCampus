/**
 * 聊天频道（客户端与服务器共用）。设计见 私有设计稿，P1 任务拆分见 私有设计稿。
 *
 * 一条消息永远属于**一个频道**，频道决定"谁能收到、怎么管"：
 *  - world 世界：当前世界里的人（就是原来的公屏：公共世界所有人 / 个人世界只有自己 / 好友世界的成员）
 *  - near  附近：同一世界里能看见发言人的玩家
 *  - party 队伍：当前队伍的成员（只在有队伍时存在）
 *  - sys   系统：只有自己；**客户端本地频道**，所有系统提示都进这里，不能发言，服务器不为它转发任何东西
 * 每个频道玩家自己有两个开关（存在玩家档案的 `Saved.ch`）：关闭 = 服务器不再下发、也不能在里面发言；静音 = 仍收、但不弹小条、不冒气泡，只涨未读数。
 */
export const CHANNEL_IDS = ['world', 'near', 'party', 'sys'] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export interface ChannelMeta {
  id: ChannelId; name: string; icon: string;
  /** 标签和消息行前缀色块的颜色 */
  color: string;
  /** 能不能在里面发言 */
  sendable: boolean;
  /** 默认是不是开着 */
  defaultOn: boolean;
  /** 输入框占位符 */
  placeholder: string;
}
export const CHANNELS: Readonly<Record<ChannelId, ChannelMeta>> = {
  world: { id: 'world', name: '世界', icon: '🌍', color: '#8a5a30', sendable: true, defaultOn: true, placeholder: '对世界说点什么…' },
  near: { id: 'near', name: '附近', icon: '📍', color: '#2a6a8a', sendable: true, defaultOn: true, placeholder: '对附近的人说点什么…' },
  party: { id: 'party', name: '队伍', icon: '👥', color: '#3f7a24', sendable: true, defaultOn: true, placeholder: '对队伍说点什么…' },
  sys: { id: 'sys', name: '系统', icon: '🔔', color: '#7a7a7a', sendable: false, defaultOn: true, placeholder: '系统频道不能发言' },
};

export const isChannelId = (v: unknown): v is ChannelId => typeof v === 'string' && (CHANNEL_IDS as readonly string[]).includes(v);
/** 能发言的频道 */
export const isSendable = (v: unknown): v is ChannelId => isChannelId(v) && CHANNELS[v].sendable;

/** 一个频道的个人偏好；没有字段 = 开、不静音 */
export interface ChannelPrefs { off?: 1; mute?: 1 }
/** 玩家档案里的 `Saved.ch`：频道 → 偏好。只存和默认不一样的，所以全默认时是 undefined / 空对象 */
export type ChannelPrefsMap = Partial<Record<ChannelId, ChannelPrefs>>;

/** 读档 / 收到消息时清洗：只认已知频道、只认 off / mute 两个字段（值必须是 1 或 true），全默认的频道不留；整个都是默认时返回 {} */
export function cleanChannelPrefs(v: unknown): ChannelPrefsMap {
  const out: ChannelPrefsMap = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const id of CHANNEL_IDS) {
    if (!Object.hasOwn(v, id)) continue; // 只认自己的属性，不读原型链上继承来的
    const p = (v as Record<string, unknown>)[id];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const r = p as Record<string, unknown>, c: ChannelPrefs = {};
    if (r.off === 1 || r.off === true) c.off = 1;
    if (r.mute === 1 || r.mute === true) c.mute = 1;
    if (c.off || c.mute) out[id] = c;
  }
  return out;
}
/** 改一个频道的偏好后的新 map（on / mute 不给 = 不改；改回默认就把那个频道从 map 里去掉）；不改原对象 */
export function applyChannelSet(prefs: ChannelPrefsMap, ch: ChannelId, set: { on?: boolean; mute?: boolean }): ChannelPrefsMap {
  const cur = { ...(prefs[ch] ?? {}) };
  if (set.on === true) delete cur.off; else if (set.on === false) cur.off = 1;
  if (set.mute === true) cur.mute = 1; else if (set.mute === false) delete cur.mute;
  const next: ChannelPrefsMap = { ...prefs };
  if (cur.off || cur.mute) next[ch] = cur; else delete next[ch];
  return next;
}
export const isChannelOn = (prefs: ChannelPrefsMap, ch: ChannelId): boolean => !prefs[ch]?.off;
export const isChannelMuted = (prefs: ChannelPrefsMap, ch: ChannelId): boolean => !!prefs[ch]?.mute;

/** 刚连上、服务器的 channels 还没到之前客户端先用的默认频道 */
export const DEFAULT_CHANNEL_STATES: readonly ChannelState[] = [{ id: 'world', on: true, mute: false }, { id: 'near', on: true, mute: false }, { id: 'sys', on: true, mute: false }];
/** 没连上服务器（单机）时的频道：只有世界（只回显自己）和系统 */
export const OFFLINE_CHANNEL_STATES: readonly ChannelState[] = [{ id: 'world', on: true, mute: false }, { id: 'sys', on: true, mute: false }];

/** 服务器发给客户端的频道状态（见 protocol.ts 的 `channels` 消息） */
export interface ChannelState {
  id: ChannelId; on: boolean; mute: boolean;
  /** 频道里现在有多少人（world = 世界人数，party = 队伍人数；near / sys 不报） */
  n?: number;
}

/** 前缀命令：/w 世界、/n 附近、/p 队伍（也认中文别名） */
const SLASH: Record<string, ChannelId> = { w: 'world', n: 'near', p: 'party', 世界: 'world', 附近: 'near', 队伍: 'party' };
export interface SlashResult {
  /** 前缀指定的频道（没有前缀 / 前缀不认识时没有这个字段） */
  ch?: ChannelId;
  /** 去掉前缀后的内容；没有前缀就是原文 */
  text: string;
  /** 以 / 开头但不认识的前缀（不带 /）；客户端提示"没有这个频道"，不要发送 */
  unknown?: string;
}
/**
 * 解析 "/p 你好" → { ch: 'party', text: '你好' }。
 * 规则：前缀必须是开头的 `/名字`，后面跟空白（半角、全角空格都行）或直接结束；`/p` 后面没内容 → text 是空串（客户端据此只切换频道不发话）。
 * `/` 开头但名字不认识 → `unknown`（如 `/哈哈`）；名字里不能再有 `/`，所以 `/usr/bin` 这种路径当普通话；真想发 `/哈哈` 这样的话，前面加个空格。
 */
export function parseSlash(input: string): SlashResult {
  if (typeof input !== 'string' || input[0] !== '/') return { text: typeof input === 'string' ? input : '' };
  const m = /^\/([^\s　/]*)([\s　]+([\s\S]*))?$/.exec(input);
  if (!m) return { text: input };
  const name = m[1];
  if (!name) return { text: input }; // 单独一个 "/" 或 "/ 你好"：当普通话
  const ch = SLASH[name.toLowerCase()];
  if (!ch) return { text: input, unknown: name };
  return { ch, text: (m[3] ?? '').trim() };
}
