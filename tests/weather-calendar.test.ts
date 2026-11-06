import { describe, it, expect } from 'vitest';
import { CLOCK_EPOCH_MS, clockMsAt, clockMinutes } from '../src/shared/clock';
import { SEASONS, SEASON_DAYS, WEATHER_SLOT_MS, forecast, nextWet, skyAt, weatherOfSlot, weatherAt, FORECAST_EXACT, seasonAt } from '../src/shared/season';
import { applySoftCap, XP_SOFT_CAP } from '../src/shared/fishlevel';
import { resolveGear } from '../src/shared/gear';
import { cleanFz, fzName, FESTIVALS, FESTIVAL_DAYS, YEAR_DAYS, calendarOf, festivalAt, festivalOfDay, gameDayAt, nextFestival, yearGrid, festivalBuff, festivalDef, festivalByCode } from '../src/shared/calendar';

describe('天气：连续性、细节、预报', () => {
  it('同一时段内不变；概率仍按季节表（晴/阴/雨雪的占比在容许范围内）', () => {
    const t = CLOCK_EPOCH_MS + 5 * WEATHER_SLOT_MS;
    expect(weatherAt(t + 1000)).toEqual(weatherAt(t + WEATHER_SLOT_MS - 1000));
    const N = 20000, c = { sunny: 0, cloudy: 0, rain: 0, snow: 0 };
    for (let s = 0; s < N; s++) c[weatherOfSlot(s).kind]++;
    expect(c.sunny / N).toBeGreaterThan(0.4); expect(c.sunny / N).toBeLessThan(0.62);
    expect((c.rain + c.snow) / N).toBeGreaterThan(0.12); expect((c.rain + c.snow) / N).toBeLessThan(0.34);
  });
  it('连续性：相邻时段天气相同的比例明显高于独立抽签（≥ 55%）；大雨/晴不再来回跳', () => {
    let same = 0; const N = 5000;
    for (let s = 0; s < N; s++) if (weatherOfSlot(s).kind === weatherOfSlot(s + 1).kind) same++;
    expect(same / N).toBeGreaterThan(0.55);
  });
  it('skyAt：雷暴只在大雨里（kind 仍是 rain）；雾只在阴天；彩虹只在雨后的晴天白天；温度随季节变化、冬天比夏天冷', () => {
    let storm = 0, fog = 0, rainbow = 0; const temps: Record<string, number[]> = { spring: [], summer: [], autumn: [], winter: [] };
    for (let s = 0; s < 4000; s++) for (const off of [0.1, 0.5, 0.9]) {
      const ms = CLOCK_EPOCH_MS + (s + off) * WEATHER_SLOT_MS, k = skyAt(ms);
      if (k.storm) { storm++; expect(k.w.kind).toBe('rain'); expect(k.w.power).toBe(1); }
      if (k.fog > 0) { fog++; expect(k.w.kind).toBe('cloudy'); }
      if (k.rainbow > 0) { rainbow++; expect(k.w.kind).toBe('sunny'); expect(weatherOfSlot(s - 1).kind).toBe('rain'); }
      temps[seasonAt(ms)].push(k.tempC);
    }
    expect(storm).toBeGreaterThan(0); expect(fog).toBeGreaterThan(0); expect(rainbow).toBeGreaterThan(0);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(temps.winter)).toBeLessThan(avg(temps.autumn)); expect(avg(temps.autumn)).toBeLessThan(avg(temps.summer));
  });
  it('预报：第 0 个是当前时段，之后每个时段和 weatherOfSlot 一致；只有前几个是精准的；nextWet 找到的确实下雨/下雪', () => {
    const now = CLOCK_EPOCH_MS + 100 * WEATHER_SLOT_MS + 1234, f = forecast(now, 9);
    expect(f).toHaveLength(9); expect(f[0].w).toEqual(weatherAt(now));
    f.forEach((x, i) => { expect(x.w).toEqual(weatherOfSlot(x.slot)); expect(x.vague).toBe(i >= FORECAST_EXACT); if (i) expect(x.slot).toBe(f[i - 1].slot + 1); });
    const nw = nextWet(now)!; expect(nw).toBeTruthy(); expect(['rain', 'snow']).toContain(nw.w.kind); expect(nw.slot).toBeGreaterThan(f[0].slot);
    for (let s = f[0].slot + 1; s < nw.slot; s++) expect(['rain', 'snow']).not.toContain(weatherOfSlot(s).kind);
  });
});

describe('游戏日历与节日', () => {
  it('第 1 天 = 秋 1 日（第 1 年）；一季 6 天、一年 24 天；第 13 天进入冬、第 19 天进入第 2 年春', () => {
    expect(calendarOf(1)).toMatchObject({ year: 1, season: 'autumn', dayInSeason: 1 });
    expect(calendarOf(7)).toMatchObject({ season: 'winter', dayInSeason: 1, year: 1 });
    expect(calendarOf(13)).toMatchObject({ season: 'spring', year: 2, dayInSeason: 1 });
    expect(YEAR_DAYS).toBe(SEASON_DAYS * SEASONS.length);
    for (let d = 1; d < 200; d++) { const a = calendarOf(d), b = calendarOf(d + 1); expect(b.day).toBe(a.day + 1); }
  });
  it('gameDayAt 和时钟一致', () => {
    const ms = clockMsAt(12 * 60, 5); expect(gameDayAt(ms)).toBe(5); expect(Math.floor(clockMinutes(ms) / 1440) + 1).toBe(5);
  });
  it('每个季节一个节日，各持续 FESTIVAL_DAYS 天；按日历推：春 3、4 日是樱花节；其余日子没有节日', () => {
    expect(FESTIVALS.map((f) => f.season).sort()).toEqual([...SEASONS].sort()); expect(FESTIVAL_DAYS).toBe(2);
    const spring = (d: number) => 13 + d - 1; // 第 2 年春
    expect(festivalOfDay(spring(3))?.f.id).toBe('sakura'); expect(festivalOfDay(spring(4))?.f.id).toBe('sakura'); expect(festivalOfDay(spring(4))?.nth).toBe(2);
    for (const d of [1, 2, 5, 6]) expect(festivalOfDay(spring(d))).toBeNull();
    let days = 0; for (let d = 1; d <= YEAR_DAYS; d++) if (festivalOfDay(d)) days++; expect(days).toBe(FESTIVALS.length * FESTIVAL_DAYS);
    expect(festivalAt(clockMsAt(10 * 60, spring(3)))?.f.id).toBe('sakura');
  });
  it('nextFestival：节日期间返回正在过的；否则返回下一个，天数正确；不会跳过', () => {
    for (let d = 1; d < 60; d++) {
      const n = nextFestival(d); expect(n.inDays).toBeGreaterThanOrEqual(0); expect(festivalOfDay(n.startDay)?.nth).toBe(1);
      expect(n.active).toBe(!!festivalOfDay(d)); if (!n.active) { expect(n.startDay).toBe(d + n.inDays); for (let x = d; x < n.startDay; x++) expect(festivalOfDay(x)).toBeNull(); }
    }
  });
  it('节日福利：存在、描述齐全；装扮编号 1..N 互不重复；festivalBuff 与节日一致', () => {
    const codes = FESTIVALS.map((f) => f.costume.code); expect(new Set(codes).size).toBe(codes.length); expect(Math.min(...codes)).toBe(1);
    for (const f of FESTIVALS) { expect(f.buff.text.length).toBeGreaterThan(3); expect(festivalDef(f.id)).toBe(f); expect(festivalByCode(f.costume.code)).toBe(f); if (f.buff.key !== 'gift') expect(f.buff.value).toBeGreaterThan(0); }
    expect(festivalBuff(1)).toBeNull(); expect(festivalBuff(13 + 2)?.buff.key).toBe('luck');
  });
  it('yearGrid：24 格，每季 6 格，节日格数对；第 1 年的春夏在开服前（day ≤ 0）', () => {
    const g = yearGrid(1); expect(g).toHaveLength(24); expect(g.filter((x) => x.fest).length).toBe(FESTIVALS.length * FESTIVAL_DAYS);
    expect(g[0].day).toBeLessThanOrEqual(0); expect(g[12].day).toBe(1); expect(g[12].season).toBe('autumn');
  });
});

describe('节日装扮存档与福利入口', () => {
  it('cleanFz：只留认识的装扮编号、戴着的必须已获得；乱数据收敛', () => {
    expect(cleanFz(null)).toBeUndefined(); expect(cleanFz({ c: [9, 'x'] })).toBeUndefined();
    expect(cleanFz({ c: [4, 1, 1, 7], on: 4, g: 55 })).toEqual({ c: [1, 4], on: 4, g: 55 });
    expect(cleanFz({ c: [1], on: 2 })).toEqual({ c: [1] }); // 没获得的不能戴
    expect(fzName(3)).toBe('玉兔发箍'); expect(fzName(99)).toBe('');
  });
  it('经验软上限可以带自定义上限（中秋 700）：同样的当日累计，上限高的拿到更多；默认不变', () => {
    expect(applySoftCap(590, 20).granted).toBe(applySoftCap(590, 20, XP_SOFT_CAP).granted);
    expect(applySoftCap(590, 20, 700).granted).toBe(20); expect(applySoftCap(590, 20).granted).toBeLessThan(20);
  });
  it('resolveGear 的运气倍数（樱花节）：乘进去、仍受 LUCK_MAX 封顶', () => {
    const inv = { fishing_rod: 1, bait: 5 }, env = { night: false, rain: false, season: 'spring' as const };
    const a = resolveGear(inv, undefined, env), b = resolveGear(inv, undefined, env, { luck: 1.05 });
    expect(b.luck).toBeCloseTo(a.luck * 1.05); expect(resolveGear(inv, undefined, env, { luck: 99 }).luck).toBeLessThanOrEqual(3);
  });
});
