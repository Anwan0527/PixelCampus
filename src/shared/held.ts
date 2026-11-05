/**
 * 手持物（客户端与服务器共用）：玩家可以拿着书、奶茶、咖啡、手机、篮球、相机在校园里逛。
 * 只是外观：服务器只存"现在拿的是几号"（不落盘，下线就放下）并转发给看得见这个玩家的人，不影响任何玩法。
 */
export interface HeldDef {
  id: number; key: string; name: string; icon: string;
  /** 拿法：chest = 双手捧在胸前（书/手机/相机）；hand = 一只手提在身侧（奶茶/咖啡/篮球） */
  grip: 'chest' | 'hand';
}
export const HELD: readonly HeldDef[] = [
  { id: 1, key: 'book', name: '书', icon: '📘', grip: 'chest' },
  { id: 2, key: 'tea', name: '奶茶', icon: '🧋', grip: 'hand' },
  { id: 3, key: 'coffee', name: '咖啡', icon: '☕', grip: 'hand' },
  { id: 4, key: 'phone', name: '手机', icon: '📱', grip: 'chest' },
  { id: 5, key: 'ball', name: '篮球', icon: '🏀', grip: 'hand' },
  { id: 6, key: 'camera', name: '相机', icon: '📷', grip: 'chest' },
];
export const HELD_MAX = HELD.length;
/** 从网络来的手持物编号：不是 0–HELD_MAX 的整数一律当"什么都没拿" */
export const cleanHeld = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= HELD_MAX ? (v as number) : 0);
export const heldDef = (id: number): HeldDef | undefined => HELD.find((h) => h.id === id);
