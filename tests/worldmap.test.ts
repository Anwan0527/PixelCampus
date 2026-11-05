import { describe, it, expect, vi } from 'vitest';
import { WorldMap } from '../src/world/WorldMap';
import { CLOCK_EPOCH_MS, MINUTES_PER_SEC, clockMinutes, isNightAt, nightness } from '../src/shared/clock';
import { GameClock } from '../src/systems/clock';

// 5x5，中间一格阻挡
const rows = ['00000', '00000', '00100', '00000', '00000'];
const map = new WorldMap({ width: 5, height: 5, collision: rows });

describe('WorldMap 碰撞', () => {
  it('空地可走，阻挡格不可进入', () => {
    expect(map.boxBlocked(8, 10)).toBe(false);
    expect(map.boxBlocked(2.5 * 16, 2.5 * 16 + 4)).toBe(true);
  });
  it('贴墙滑动：被挡的轴不动，另一轴继续', () => {
    // 站在阻挡格左侧，向右下移动：x 被挡，y 可走
    const p = map.move(2 * 16 - 6, 2 * 16 + 8, 4, 3);
    expect(p.x).toBe(2 * 16 - 6); expect(p.y).toBeGreaterThan(2 * 16 + 8);
  });
  it('世界边界外一律阻挡', () => {
    expect(map.tileBlocked(-1, 0)).toBe(true); expect(map.tileBlocked(0, 5)).toBe(true);
  });
});

describe('GameClock（服务器统一时间）', () => {
  const noon = (day = 0) => CLOCK_EPOCH_MS + ((4 * 60 + day * 1440) / MINUTES_PER_SEC) * 1000; // 起点是 08:00，再过 4 游戏小时 = 12:00
  const at = (ms: number) => { const c = new GameClock(); c.offset = ms - Date.now(); c.update(0); return c; };

  it('时间只由服务器时间决定：起点是第 1 天 08:00；一天 = 20 真实分钟', () => {
    const c = at(CLOCK_EPOCH_MS); expect(c.hhmm).toBe('08:00'); expect(c.day).toBe(1);
    expect(at(CLOCK_EPOCH_MS + 1200e3).day).toBe(2); expect(at(CLOCK_EPOCH_MS + 1200e3).hhmm).toBe('08:00'); // 1200 真实秒后是第 2 天同一时刻
    expect(at(noon()).hhmm).toBe('12:00'); expect(at(noon(5)).day).toBe(6);
  });
  it('不同玩家：本机时钟差几分钟也会校准到同一个时间（offset = 服务器时间 - 本机时间）', () => {
    const server = noon(3);
    const a = new GameClock(), b = new GameClock();
    a.sync(server + 0); b.sync(server + 0);
    // 两台机器的本机时间不同，但都向服务器校准过：此刻算出的时间必然一致（容许几毫秒的运行误差）
    a.update(0); b.update(0);
    expect(Math.abs(a.total - b.total)).toBeLessThan(0.5);
    expect(a.hhmm).toBe(b.hhmm); expect(a.day).toBe(b.day);
    // 本机时间慢了 10 分钟的机器：校准之后也一样
    vi.useFakeTimers(); vi.setSystemTime(Date.now() - 10 * 60e3);
    try { const skewed = new GameClock(); skewed.sync(server); skewed.update(0); expect(Math.abs(skewed.total - clockMinutes(server))).toBeLessThan(0.5); expect(skewed.hhmm).toBe(a.hhmm); } finally { vi.useRealTimers(); }
  });
  it('夜晚强度与叠色随时间变化；服务器判断"夜里"和画面一致', () => {
    const d = at(noon()); expect(d.nightness).toBe(0); expect(d.tint().r).toBeGreaterThan(240);
    const n = at(CLOCK_EPOCH_MS + ((15 * 60) / MINUTES_PER_SEC) * 1000); expect(n.hhmm).toBe('23:00'); expect(n.nightness).toBe(1); expect(n.tint().b).toBeLessThan(180);
    expect(isNightAt(noon())).toBe(false); expect(isNightAt(CLOCK_EPOCH_MS + ((15 * 60) / MINUTES_PER_SEC) * 1000)).toBe(true);
    expect(nightness(0)).toBe(1); expect(nightness(12 * 60)).toBe(0);
    const dev = at(noon()); dev.devSetHour(23); expect(dev.hhmm).toBe('23:00'); // 开发调试的拨时间还在
  });
});
