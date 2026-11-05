/**
 * 好友手拉手一起走（客户端与服务器共用）：好友之间，一方发出邀请、对方接受，由邀请的一方牵着另一方一起走。
 * 被牵的人的位置由服务器定（站在牵手的人身边），他自己的移动上报会被忽略；任何一方点「松手」、走散、
 * 去骑车/坐下/钓鱼/传送/战斗/下线，都会松开。
 */
export type Facing4 = 'down' | 'up' | 'left' | 'right';
/** 邀请有效期；邀请和接受时双方的最大距离；牵着走时距离超过这个就松手 */
export const HAND = { INVITE_MS: 15000, REACH_PX: 96, BREAK_PX: 112, SIDE_PX: 14, BACK_PX: 8 } as const;
/** 被牵的人站的位置（像素偏移）：在牵手的人旁边、稍微靠后一点——朝右走站在左后方偏下，朝下走站在右边偏上……像并肩走、手拉着手 */
export function handOffset(facing: Facing4): [number, number] {
  const S = HAND.SIDE_PX, B = HAND.BACK_PX;
  return facing === 'right' ? [-B, S] : facing === 'left' ? [B, S] : facing === 'down' ? [S, -B] : [S, B];
}
