export const TILE = 16;
/** 摄像机整数缩放档位（1 个游戏像素 = ZOOM 个 CSS 像素），保证像素不糊 */
export const ZOOMS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_ZOOM_INDEX = 1;
export const WALK_SPEED = 92;   // px/s（≈5.75 tile/s，与星露谷步速接近）
export const RUN_MULT = 1.65;
/** 脚底碰撞盒（像素）：宽 10，向上 6 */
export const FOOT_HALF_W = 5;
export const FOOT_H = 6;

/**
 * 共享单车：骑行速度 = 步行速度 × BIKE_MULT（先按"10 倍"做，玩家反馈过快，2026-11-01 调成 5 倍）。
 * 想调快慢只改这一个数：服务器的速度额度、客户端的碰撞分步、地面预读都由它推出来。
 * BIKE_ACCEL / BIKE_BRAKE：起步加速与松手刹车用的时间（秒）——不是瞬间满速，看起来才协调。
 */
export const BIKE_MULT = 5;
export const BIKE_SPEED = WALK_SPEED * BIKE_MULT; // px/s
export const BIKE_ACCEL = 0.7;
export const BIKE_BRAKE = 0.3;
