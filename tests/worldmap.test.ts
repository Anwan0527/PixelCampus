import { describe, it, expect, vi } from 'vitest';
import { WorldMap } from '../src/world/WorldMap';
import { CLOCK_EPOCH_MS, DAY_SEGMENTS, MINUTES_PER_SEC, clockMinutes, clockMsAt, isNightAt, nightness, unwarpMinute, warpMinute } from '../src/shared/clock';
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
  const noon = (day = 0) => clockMsAt(12 * 60, day + 1); // 第 day+1 天的 12:00（白天走得慢，不能再用线性换算）
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
    const n = at(clockMsAt(23 * 60)); expect(n.hhmm).toBe('23:00'); expect(n.nightness).toBe(1); expect(n.tint().b).toBeLessThan(180);
    expect(isNightAt(noon())).toBe(false); expect(isNightAt(clockMsAt(23 * 60))).toBe(true);
    expect(nightness(0)).toBe(1); expect(nightness(12 * 60)).toBe(0);
    const dev = at(noon()); dev.devSetHour(23); expect(dev.hhmm).toBe('23:00'); // 开发调试的拨时间还在
  });
});

describe('昼夜节奏（白天更长）', () => {
  it('节奏表：钟点首尾相接、份数加起来是一天（1440 份 = 20 真实分钟）', () => {
    expect(DAY_SEGMENTS[0][0]).toBe(0); expect(DAY_SEGMENTS[DAY_SEGMENTS.length - 1][1]).toBe(24);
    for (let i = 1; i < DAY_SEGMENTS.length; i++) expect(DAY_SEGMENTS[i][0]).toBe(DAY_SEGMENTS[i - 1][1]);
    expect(DAY_SEGMENTS.reduce((s, x) => s + x[2], 0)).toBe(1440);
    expect(1440 / MINUTES_PER_SEC / 60).toBe(20);
  });
  it('连续、单调；往返换算回到原处；一天从 0 点开始到 24 点结束', () => {
    expect(warpMinute(0)).toBe(0); expect(warpMinute(1439.999)).toBeCloseTo(1440, 1);
    let prev = -1;
    for (let r = 0; r < 1440; r += 7) { const g = warpMinute(r); expect(g).toBeGreaterThan(prev); prev = g; expect(unwarpMinute(g)).toBeCloseTo(r, 6); }
    for (const [h0, , ] of DAY_SEGMENTS) expect(warpMinute(unwarpMinute(h0 * 60))).toBeCloseTo(h0 * 60, 6);
    // 跨天不跳：每天 0 点之后紧接着就是新的一天
    const day2 = clockMsAt(0, 2); expect(Math.floor(clockMinutes(day2 - 1000) / 1440)).toBe(0); expect(Math.floor(clockMinutes(day2 + 1000) / 1440)).toBe(1);
  });
  it('白天在真实时间里比以前长：7:30–17:30 超过 10 真实分钟（原来 8.3），全黑的夜不到 6 分钟（原来约 7.9）', () => {
    const real = (h0: number, h1: number) => ((unwarpMinute(h1 * 60) - unwarpMinute(h0 * 60)) / 1440) * 20;
    expect(real(7.5, 17.5)).toBeGreaterThan(10); expect(real(7.5, 17.5)).toBeLessThan(12);
    expect(real(0, 5.5) + real(20, 24)).toBeLessThan(6);
    // 实测：按秒采样一整天，白天（nightness=0）的秒数
    const t0 = clockMsAt(0, 3); let daySec = 0, nightSec = 0;
    for (let s = 0; s < 1200; s++) { const m = (clockMinutes(t0 + s * 1000) % 1440 + 1440) % 1440; const n = nightness(m); if (n === 0) daySec++; else if (n === 1) nightSec++; }
    expect(daySec).toBeGreaterThan(600); expect(nightSec).toBeLessThan(360);
  });
});

