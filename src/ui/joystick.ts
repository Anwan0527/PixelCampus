/** 虚拟摇杆的纯计算（便于测试）：拖动偏移 → 方向与是否奔跑。偏移小于死区不动；推到边缘附近算奔跑。 */
export interface JoyState { x: number; y: number; run: boolean }
export const JOY_R = 56;
export const JOY_DEAD = 0.18;
export const JOY_RUN = 0.92;
export const JOY_IDLE: JoyState = { x: 0, y: 0, run: false };

export function joyVec(dx: number, dy: number, r = JOY_R): JoyState {
  const len = Math.hypot(dx, dy);
  if (len === 0 || len / r < JOY_DEAD) return JOY_IDLE;
  return { x: dx / len, y: dy / len, run: len / r >= JOY_RUN };
}
