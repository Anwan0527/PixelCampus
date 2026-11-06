/**
 * 好友手拉手一起走（客户端与服务器共用）：好友之间，一方发出邀请、对方接受，由邀请的一方（队头）牵着对方一起走。
 * **最多 3 人并排**：队头在中间，左右各牵一位（队头邀请第二个人时，站在另一侧）。被牵的人的位置由服务器定
 * （站在队头身边，朝向变化时**平滑滑过去**，不瞬移），他自己的移动上报会被忽略；任何一方点「松手」、走散、
 * 去骑车/坐下/钓鱼/传送/战斗/下线，都会松开——被牵的人松手只松他自己那一边，队头松手则全部松开。
 */
export type Facing4 = 'down' | 'up' | 'left' | 'right';
/** 邀请有效期；邀请和接受时双方的最大距离；牵着走时距离超过这个就松手；GLIDE_PXS = 被牵的人追到目标位置的最大速度（像素/秒），大于跑步速度 */
export const HAND = { INVITE_MS: 15000, REACH_PX: 96, BREAK_PX: 112, SIDE_PX: 14, BACK_PX: 8, MAX_FOLLOWERS: 2, GLIDE_PXS: 190, SNAP_PX: 64 } as const;
/** 站在队头的哪一侧：第一位站「右手边」(+1)，第二位站另一侧 (−1) */
export type HandSide = 1 | -1;
export const handSideOf = (index: number): HandSide => (index % 2 === 0 ? 1 : -1);
/** 被牵的人站的位置（像素偏移）：在牵手的人旁边、稍微靠后一点——朝右走站在左后方偏下，朝下走站在右边偏上……像并肩走、手拉着手；side = −1 时站在另一侧 */
export function handOffset(facing: Facing4, side: HandSide = 1): [number, number] {
  const S = HAND.SIDE_PX * side, B = HAND.BACK_PX;
  return facing === 'right' ? [-B, S] : facing === 'left' ? [B, S] : facing === 'down' ? [S, -B] : [S, B];
}
/** 从 (cx,cy) 朝 (tx,ty) 走一步，最多 maxStep 像素；离得太远（> SNAP_PX）直接到位 */
export function glide(cx: number, cy: number, tx: number, ty: number, maxStep: number): [number, number] {
  const dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy);
  if (d <= maxStep || d > HAND.SNAP_PX) return [tx, ty];
  return [cx + (dx / d) * maxStep, cy + (dy / d) * maxStep];
}
