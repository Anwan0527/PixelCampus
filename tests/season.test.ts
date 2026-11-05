import { describe, it, expect } from 'vitest';
import { CLOCK_EPOCH_MS } from '../src/shared/clock';
import { SEASONS, SEASON_DAYS, WEATHER_SLOT_MS, hash01, seasonAt, seasonOfDay, weatherAt, weatherOfSlot, needsUmbrella } from '../src/shared/season';

describe('季节', () => {
  it('第 1 天是秋天；每个季节 SEASON_DAYS 天，按 秋→冬→春→夏 轮换', () => {
    expect(seasonOfDay(1)).toBe('autumn'); expect(seasonOfDay(SEASON_DAYS)).toBe('autumn');
    expect(seasonOfDay(SEASON_DAYS + 1)).toBe('winter'); expect(seasonOfDay(SEASON_DAYS * 2 + 1)).toBe('spring');
    expect(seasonOfDay(SEASON_DAYS * 3 + 1)).toBe('summer'); expect(seasonOfDay(SEASON_DAYS * 4 + 1)).toBe('autumn'); // 一年 4 个季节后回到秋天
  });
  it('季节只由服务器时间决定：同一时刻任何人算出来都一样；一个游戏日 = 20 真实分钟', () => {
    expect(seasonAt(CLOCK_EPOCH_MS)).toBe('autumn');
    const t = CLOCK_EPOCH_MS + SEASON_DAYS * 20 * 60e3; // 往后整整一个季节（起点是 08:00，不影响天数边界按午夜算：这里只验证"之后不久进入冬天"）
    expect(seasonAt(t + 20 * 60e3)).toBe('winter');
    expect(seasonAt(t + 60e3)).toBe(seasonAt(t + 60e3));
  });
  it('一年里四个季节都会出现', () => { expect(new Set(Array.from({ length: SEASON_DAYS * 4 }, (_, i) => seasonOfDay(i + 1)))).toEqual(new Set(SEASONS)); });
  it('非法天数（0、负数）也不会算出奇怪的季节', () => { expect(SEASONS).toContain(seasonOfDay(0)); expect(SEASONS).toContain(seasonOfDay(-5)); });
});

describe('天气', () => {
  it('hash01 落在 [0,1) 且确定', () => {
    for (let i = -50; i < 500; i++) { const v = hash01(i, 3); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); expect(hash01(i, 3)).toBe(v); }
  });
  it('同一个天气时段内天气不变；换时段可能变', () => {
    const t = CLOCK_EPOCH_MS + 5 * WEATHER_SLOT_MS;
    expect(weatherAt(t + 1000)).toEqual(weatherAt(t + WEATHER_SLOT_MS - 1000));
  });
  it('冬天只下雪不下雨，其它季节只下雨不下雪；晴/阴都没有降水强度', () => {
    for (let slot = 0; slot < 2000; slot++) {
      const w = weatherOfSlot(slot), season = seasonAt(CLOCK_EPOCH_MS + slot * WEATHER_SLOT_MS);
      if (season === 'winter') expect(w.kind).not.toBe('rain'); else expect(w.kind).not.toBe('snow');
      if (w.kind === 'sunny' || w.kind === 'cloudy') expect(w.power).toBe(0); else expect(w.power).toBeGreaterThan(0);
      expect(w.name.length).toBeGreaterThan(0);
    }
  });
  it('长期看晴天最多、各种天气都会出现；降水占比在 1~4 成', () => {
    const c: Record<string, number> = { sunny: 0, cloudy: 0, rain: 0, snow: 0 }; const N = 4000;
    for (let slot = 0; slot < N; slot++) c[weatherOfSlot(slot).kind]++;
    expect(c.sunny).toBeGreaterThan(c.cloudy); expect(c.sunny).toBeGreaterThan(c.rain);
    expect(c.rain).toBeGreaterThan(0); expect(c.snow).toBeGreaterThan(0); expect(c.cloudy).toBeGreaterThan(0);
    const wet = (c.rain + c.snow) / N; expect(wet).toBeGreaterThan(0.1); expect(wet).toBeLessThan(0.4);
  });
  it('下雨才打伞（下雪、晴、阴都不打）', () => {
    const find = (k: string) => { for (let s = 0; s < 500; s++) { const w = weatherOfSlot(s); if (w.kind === k) return w; } throw new Error(k); };
    expect(needsUmbrella(find('rain'))).toBe(true); expect(needsUmbrella(find('snow'))).toBe(false); expect(needsUmbrella(find('sunny'))).toBe(false); expect(needsUmbrella(find('cloudy'))).toBe(false);
  });
});
