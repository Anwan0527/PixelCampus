/**
 * 游戏时间（客户端与服务器共用）：由"服务器时间"唯一决定，所有玩家看到的时间、昼夜、路灯、背景音乐的日夜都完全一样。
 * 时间 = 固定起点之后经过的真实时间 × 加速倍率：1 真实秒 = 1.2 游戏分钟（一个游戏日 = 20 真实分钟）。
 * 起点是 2026-11-01 00:00（北京时间）的游戏 08:00，所以"第 N 天"也是全服统一的。
 * 客户端用服务器告知的当前时间校准本机时钟偏差（见 net/client 的 time 消息）；离线单人时用本机时间。
 * 想改成"真实北京时间"：把 MINUTES_PER_SEC 改成 1/60，START_MINUTE 改成 0，EPOCH 对齐到某天 0 点即可。
 */
export const MINUTES_PER_SEC = 1.2;
/** 起点：2026-11-01 00:00 北京时间 = 2026-10-31 16:00 UTC */
export const CLOCK_EPOCH_MS = Date.UTC(2026, 9, 31, 16, 0, 0);
/** 起点时的游戏时刻（从 0 点起的分钟数）：08:00 */
export const START_MINUTE = 8 * 60;

/** 服务器时间（毫秒时间戳）对应的游戏时间：从游戏第 1 天 0 点起的总分钟数 */
export const clockMinutes = (ms: number): number => START_MINUTE + ((ms - CLOCK_EPOCH_MS) / 1000) * MINUTES_PER_SEC;

/** 夜晚强度 0..1（路灯发光、钓鱼"夜里"都用它） */
export function nightness(minuteOfDay: number): number {
  const h = minuteOfDay / 60;
  if (h >= 5.5 && h < 7.5) return 1 - (h - 5.5) / 2;
  if (h >= 7.5 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5;
  return 1;
}
/** 现在是不是夜里（强度过半） */
export const isNightAt = (ms: number): boolean => nightness(((clockMinutes(ms) % 1440) + 1440) % 1440) > 0.5;
