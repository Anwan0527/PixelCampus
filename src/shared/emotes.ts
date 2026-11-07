/**
 * 表情动作（客户端与服务器共用）：头顶冒出一个图标，配一点小动作 / 姿势动画 / 特效。
 * 服务器只做限频、状态校验和广播（谁、哪个表情），动作完全在客户端表现，所以编号必须稳定：新增只能加在后面。
 * 2026-11 扩充：9 → 23 个。持续型表情（躺下、坐地）一直保持到人走动、或再点一次；服务器记住谁在做，新来的人也能看到。
 */
export type EmoteAnim = 'none' | 'shake' | 'jump' | 'dance' | /** 原地转圈圈：四个朝向快速轮流 + 小跳 */ 'spin';
/** 头顶 / 身边的小特效（客户端画）：泪滴、💢、💤、爱心、冷汗、闪光 */
export type EmoteFx = 'tears' | 'anger' | 'zzz' | 'hearts' | 'sweat' | 'sparkle';
/** 面板里的分组：情绪 / 社交 / 动作 */
export type EmoteGroup = 'mood' | 'social' | 'action';
export interface EmoteDef {
  id: number; icon: string; name: string; anim: EmoteAnim; ms: number;
  /** 人物姿势动画（src/art/char-rig 的动作名）：有它就播姿势，没有就用 anim 的抖动/跳跃 */
  pose?: string;
  group: EmoteGroup;
  /** 持续型：姿势一直保持，直到人走动、做了别的表情、或再点一次（服务器也记着，新进视野的人看得到） */
  hold?: boolean;
  /** 要求站着：骑车、坐着（椅子）、后座、钓鱼、被牵着走的时候不能做 */
  stand?: boolean;
  fx?: EmoteFx;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 0, icon: '👋', name: '挥手', anim: 'shake', ms: 1600, pose: 'wave', group: 'social' },
  { id: 1, icon: '❤️', name: '爱心', anim: 'none', ms: 1800, pose: 'laugh', group: 'mood', fx: 'hearts' },
  { id: 2, icon: '😂', name: '大笑', anim: 'shake', ms: 1800, pose: 'laugh', group: 'mood' },
  { id: 3, icon: '😢', name: '难过', anim: 'none', ms: 2000, pose: 'sad', group: 'mood' },
  { id: 4, icon: '💃', name: '跳舞', anim: 'dance', ms: 2600, pose: 'dance', group: 'action' },
  { id: 5, icon: '🙌', name: '欢呼', anim: 'jump', ms: 1500, pose: 'cheer', group: 'social', fx: 'sparkle' },
  { id: 6, icon: '💤', name: '打盹', anim: 'none', ms: 2400, pose: 'sit', group: 'mood' },
  { id: 7, icon: '❓', name: '疑惑', anim: 'none', ms: 1800, pose: 'think', group: 'mood' },
  { id: 8, icon: '👍', name: '点赞', anim: 'jump', ms: 1500, pose: 'cheer', group: 'social' },
  // ---- 2026-11 新增 ----
  { id: 9, icon: '😭', name: '痛哭', anim: 'none', ms: 3200, pose: 'cry', group: 'mood', fx: 'tears' },
  { id: 10, icon: '😠', name: '生气', anim: 'shake', ms: 2400, pose: 'angry', group: 'mood', fx: 'anger' },
  { id: 11, icon: '😳', name: '害羞', anim: 'none', ms: 2600, pose: 'shy', group: 'mood', fx: 'hearts' },
  { id: 12, icon: '😱', name: '受惊', anim: 'jump', ms: 1600, pose: 'shock', group: 'mood', fx: 'sweat' },
  { id: 13, icon: '🥱', name: '哈欠', anim: 'none', ms: 2400, pose: 'yawn', group: 'mood' },
  { id: 14, icon: '🤷', name: '耸肩', anim: 'none', ms: 2200, pose: 'shrug', group: 'mood', fx: 'sweat' },
  { id: 15, icon: '💭', name: '发呆', anim: 'none', ms: 3000, pose: 'daze', group: 'mood' },
  { id: 16, icon: '👏', name: '拍手', anim: 'none', ms: 2200, pose: 'clap', group: 'social' },
  { id: 17, icon: '🙇', name: '鞠躬', anim: 'none', ms: 1800, pose: 'bow', group: 'social' },
  { id: 18, icon: '✌️', name: '比耶', anim: 'none', ms: 2200, pose: 'peace', group: 'social', fx: 'sparkle' },
  { id: 19, icon: '🙆', name: '伸懒腰', anim: 'none', ms: 2200, pose: 'stretch', group: 'action' },
  { id: 20, icon: '🌀', name: '转圈圈', anim: 'spin', ms: 2200, group: 'action', stand: true },
  { id: 21, icon: '🛌', name: '躺下', anim: 'none', ms: 2400, pose: 'lie', group: 'action', hold: true, stand: true, fx: 'zzz' },
  { id: 22, icon: '🧘', name: '坐地', anim: 'none', ms: 1500, pose: 'sitg', group: 'action', hold: true, stand: true },
];
export const EMOTE_COOLDOWN_MS = 1200;
export const emoteDef = (id: unknown): EmoteDef | undefined => (Number.isInteger(id) ? EMOTES[id as number] : undefined);

/** 表情面板的分组与顺序（常用的排前面）；按数字键 1–9 仍然对应编号 0–8 的老表情，不随排版变 */
export const EMOTE_GROUPS: readonly { id: EmoteGroup; name: string; ids: readonly number[] }[] = [
  { id: 'mood', name: '情绪', ids: [1, 2, 3, 9, 10, 11, 12, 7, 14, 15, 13, 6] },
  { id: 'social', name: '社交', ids: [0, 8, 5, 16, 17, 18] },
  { id: 'action', name: '动作', ids: [4, 20, 21, 22, 19] },
];

/** 在哪些状态下不能做"要求站着"的表情（服务器和客户端共用的判断） */
export function emoteBlocked(d: EmoteDef, st: { riding?: boolean; sitting?: boolean; pax?: boolean; fishing?: boolean; led?: boolean }): string | null {
  if (!d.stand) return null;
  if (st.riding) return '先下车再做这个动作';
  if (st.pax) return '坐在后座上，做不了这个动作';
  if (st.sitting) return '先从椅子上站起来';
  if (st.fishing) return '正在钓鱼，先收竿';
  if (st.led) return '正牵着手，松开再做这个动作';
  return null;
}
