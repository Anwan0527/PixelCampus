/**
 * 表情动作（客户端与服务器共用）：头顶冒出一个图标，配一点小动作。
 * 服务器只做限频和广播（谁、哪个表情），动作完全在客户端表现，所以编号必须稳定：新增只能加在后面。
 */
export type EmoteAnim = 'none' | 'shake' | 'jump' | 'dance';
export interface EmoteDef { id: number; icon: string; name: string; anim: EmoteAnim; ms: number; /** 人物姿势动画（tools/art/char-rig 的动作名）：有它就播姿势，没有就用 anim 的抖动/跳跃 */ pose?: string }

export const EMOTES: readonly EmoteDef[] = [
  { id: 0, icon: '👋', name: '挥手', anim: 'shake', ms: 1600, pose: 'wave' },
  { id: 1, icon: '❤️', name: '爱心', anim: 'none', ms: 1800, pose: 'laugh' },
  { id: 2, icon: '😂', name: '大笑', anim: 'shake', ms: 1800, pose: 'laugh' },
  { id: 3, icon: '😢', name: '难过', anim: 'none', ms: 2000, pose: 'sad' },
  { id: 4, icon: '💃', name: '跳舞', anim: 'dance', ms: 2600, pose: 'dance' },
  { id: 5, icon: '🙌', name: '欢呼', anim: 'jump', ms: 1500, pose: 'cheer' },
  { id: 6, icon: '💤', name: '打盹', anim: 'none', ms: 2400, pose: 'sit' },
  { id: 7, icon: '❓', name: '疑惑', anim: 'none', ms: 1800, pose: 'think' },
  { id: 8, icon: '👍', name: '点赞', anim: 'jump', ms: 1500, pose: 'cheer' },
];
export const EMOTE_COOLDOWN_MS = 1200;
export const emoteDef = (id: unknown): EmoteDef | undefined => (Number.isInteger(id) ? EMOTES[id as number] : undefined);
