/**
 * 游戏时间（客户端与服务器共用）：由"服务器时间"唯一决定，所有玩家看到的时间、昼夜、路灯、背景音乐的日夜都完全一样。
 * 时间 = 固定起点之后经过的真实时间 × 加速倍率：一个游戏日 = 20 真实分钟（平均 1 真实秒 = 1.2 游戏分钟）；白天走得慢、夜里走得快（见 DAY_SEGMENTS），所以白天更长。
 * 起点是 2026-11-01 00:00（北京时间）的游戏 08:00，所以"第 N 天"也是全服统一的。
 * 客户端用服务器告知的当前时间校准本机时钟偏差（见 net/client 的 time 消息）；离线单人时用本机时间。
 * 想改成"真实北京时间"：把 MINUTES_PER_SEC 改成 1/60，START_MINUTE 改成 0，DAY_SEGMENTS 改成 [[0, 24, 1440]]，EPOCH 对齐到某天 0 点即可。
 */
export const MINUTES_PER_SEC = 1.2;
/** 起点：2026-11-01 00:00 北京时间 = 2026-10-31 16:00 UTC */
export const CLOCK_EPOCH_MS = Date.UTC(2026, 9, 31, 16, 0, 0);

/**
 * 昼夜节奏：一个游戏日仍是 20 真实分钟，但白天走得慢、夜里走得快，所以**白天在真实时间里更长**。
 * 每一段 = [游戏钟点起, 游戏钟点止, 占这一天 1440 份里的多少份]（份数加起来必须是 1440，钟点要首尾相接）。
 * 例：7:30–17:30 的 10 个游戏小时占 790 份（≈ 11 真实分钟，原来 8.3 分钟）；0:00–5:30 和 20:00–24:00 的深夜各占 190 份（夜晚总共约 5.3 真实分钟，原来约 7.9 分钟）。
 * 想让白天更长 / 更短，只改这张表（每段占的份数此消彼长，总和保持 1440）。
 */
export const DAY_SEGMENTS: readonly (readonly [number, number, number])[] = [
  [0, 5.5, 190], [5.5, 7.5, 120], [7.5, 17.5, 790], [17.5, 20, 150], [20, 24, 190],
];
/** 一天里的"真实进度"（0..1440 份）→ 游戏钟点（分钟，0..1440） */
export function warpMinute(share: number): number {
  let a = 0;
  for (const [h0, h1, len] of DAY_SEGMENTS) {
    if (share < a + len) return (h0 + ((share - a) / len) * (h1 - h0)) * 60;
    a += len;
  }
  return 1440;
}
/** 游戏钟点（分钟，0..1440）→ 一天里的"真实进度"（warpMinute 的反函数；测试和开发调试用） */
export function unwarpMinute(minuteOfDay: number): number {
  const h = minuteOfDay / 60; let a = 0;
  for (const [h0, h1, len] of DAY_SEGMENTS) {
    if (h < h1) return a + ((h - h0) / (h1 - h0)) * len;
    a += len;
  }
  return 1440;
}
/** 起点时的"真实进度"：对应游戏钟点 08:00（起点 = 2026-11-01 00:00 北京时间时游戏是 08:00） */
export const START_MINUTE = unwarpMinute(8 * 60);
/** 第 day 天（从 1 起）的 minuteOfDay 钟点，对应的服务器时间（毫秒时间戳）；测试用 */
export const clockMsAt = (minuteOfDay: number, day = 1): number => Math.ceil(CLOCK_EPOCH_MS + (((day - 1) * 1440 + unwarpMinute(minuteOfDay) - START_MINUTE) / MINUTES_PER_SEC) * 1000); // 向上取整到毫秒，免得浮点误差让 12:00 显示成 11:59

/** 服务器时间（毫秒时间戳）对应的游戏时间：从游戏第 1 天 0 点起的总分钟数（按上面的昼夜节奏，白天走得慢） */
export const clockMinutes = (ms: number): number => {
  const linear = START_MINUTE + ((ms - CLOCK_EPOCH_MS) / 1000) * MINUTES_PER_SEC; // 均匀走的"真实进度"
  const day = Math.floor(linear / 1440);
  return day * 1440 + warpMinute(linear - day * 1440);
};

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
