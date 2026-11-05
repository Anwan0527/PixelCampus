import { MINUTES_PER_SEC, clockMinutes, nightness } from '@/shared/clock';
export { MINUTES_PER_SEC };

/**
 * 昼夜时钟：时间由服务器时间决定（见 shared/clock.ts），所有玩家一致。
 * offset = 服务器时间 - 本机时间（毫秒），连上服务器后由 time 消息校准；离线时为 0（用本机时间）。
 */
export class GameClock {
  /** 从游戏第 1 天 0 点起的分钟数（可大于 1440，表示第几天） */
  total: number;
  /** 服务器时间 - 本机时间（毫秒） */
  offset = 0;
  /** 开发调试用：把时间手动拨到某个钟点（只在本机生效） */
  private shift = 0;
  constructor() { this.total = clockMinutes(Date.now()); }
  /** 每帧调用：直接按（校准后的）当前时间算，所以不会累积误差 */
  update(_dtSec: number) { this.total = clockMinutes(Date.now() + this.offset) + this.shift; }
  /** 用服务器发来的"现在"校准本机时钟 */
  sync(serverNow: number) { this.offset = serverNow - Date.now(); }
  /** 开发调试：拨到当天的 hour 点 */
  devSetHour(hour: number) { this.shift += Math.floor(this.total / 1440) * 1440 + hour * 60 - this.total; this.total = clockMinutes(Date.now() + this.offset) + this.shift; }
  get minuteOfDay() { return this.total % 1440; }
  get day() { return Math.floor(this.total / 1440) + 1; }
  get hhmm() {
    const m = Math.floor(this.minuteOfDay);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  /** 夜晚强度 0..1（用于路灯发光） */
  get nightness(): number { return nightness(this.minuteOfDay); }
  /** 叠加色（MULTIPLY）：白色 = 无变化 */
  tint(): { r: number; g: number; b: number } {
    const h = this.minuteOfDay / 60;
    const K: [number, [number, number, number]][] = [
      [0, [70, 82, 140]], [5, [78, 92, 150]], [6.5, [238, 200, 190]], [8, [255, 252, 244]],
      [16.5, [255, 250, 238]], [18, [255, 205, 150]], [19.5, [160, 120, 160]], [21, [86, 94, 150]], [24, [70, 82, 140]],
    ];
    for (let i = 0; i + 1 < K.length; i++) {
      const [h0, c0] = K[i], [h1, c1] = K[i + 1];
      if (h >= h0 && h <= h1) {
        const t = (h - h0) / (h1 - h0);
        return { r: c0[0] + (c1[0] - c0[0]) * t, g: c0[1] + (c1[1] - c0[1]) * t, b: c0[2] + (c1[2] - c0[2]) * t };
      }
    }
    return { r: 255, g: 255, b: 255 };
  }
}
