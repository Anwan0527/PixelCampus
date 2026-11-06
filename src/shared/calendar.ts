/**
 * 游戏日历与节日（客户端与服务器共用）。
 * 日历按**游戏时间**走（见 clock.ts / season.ts）：1 游戏日 = 20 真实分钟，一个季节 6 游戏日（= 2 真实小时），一年 4 季 = 24 游戏日（= 8 真实小时）。
 * 第 1 天是秋季第 1 天（开服在 11 月），所以第 1 年从秋天开始、第 2 年从春天开始。
 * 节日也按这套日历：每个季节一个，各持续 FESTIVAL_DAYS 个游戏日（≈ 40 真实分钟）。
 * 节日只由服务器时间决定，不存档、不用同步；节日福利（buff）很小、走统一入口（见 festivalBuff），由服务器结算。
 */
import { SEASONS, SEASON_DAYS, SEASON_NAME, START_SEASON, type Season } from './season';
import { clockMinutes } from './clock';

export const YEAR_DAYS = SEASON_DAYS * SEASONS.length;

export interface CalDate {
  /** 游戏第几天（1 起） */
  day: number;
  /** 第几年（第 1 天所在的年 = 1） */
  year: number;
  season: Season;
  /** 季节序号 0 春 … 3 冬 */
  seasonIdx: number;
  /** 本季第几天 1..SEASON_DAYS */
  dayInSeason: number;
  /** 本年第几天 1..YEAR_DAYS（春 1 日起算） */
  dayOfYear: number;
}
export function calendarOf(day: number): CalDate {
  const d = Math.max(1, Math.floor(day)), n = Math.floor((d - 1) / SEASON_DAYS) + START_SEASON, seasonIdx = n % SEASONS.length;
  const dayInSeason = ((d - 1) % SEASON_DAYS) + 1;
  return { day: d, year: Math.floor(n / SEASONS.length) + 1, season: SEASONS[seasonIdx], seasonIdx, dayInSeason, dayOfYear: seasonIdx * SEASON_DAYS + dayInSeason };
}
/** 服务器时间（毫秒时间戳）→ 游戏第几天（1 起） */
export const gameDayAt = (ms: number): number => Math.floor(clockMinutes(ms) / 1440) + 1;
export const dateLabel = (d: CalDate): string => `第 ${d.year} 年 ${SEASON_NAME[d.season]} ${d.dayInSeason} 日`;

// ------------------------------------------------------------------ 节日
export const FESTIVAL_DAYS = 2;

/** 节日福利：key 对应的效果由服务器统一结算（festivalBuff 只描述，不改数值） */
export type BuffKey = 'luck' | 'nightBox' | 'xpCap' | 'gift';
export interface FestivalBuff {
  key: BuffKey;
  /** 一句话说明（界面显示） */
  text: string;
  /** luck：钓鱼运气倍数；nightBox：夜里盲盒概率倍数；xpCap：钓鱼经验每日软上限（取代默认 600） */
  value?: number;
  /** gift：节日第一次登录送的东西（每个节日只送一次） */
  items?: { id: string; n: number }[];
}
export interface Festival {
  id: string;
  name: string;
  icon: string;
  season: Season;
  /** 本季第几天开始 */
  from: number;
  blurb: string;
  /** 这几天校园里会有什么（界面显示） */
  scene: string[];
  buff: FestivalBuff;
  /** 限定装扮：编号写进玩家数据（1..），别人看到你戴着 */
  costume: { code: number; name: string };
  /** 画面的整体叠色（乘数，缺省不变）和粒子 */
  tint?: [number, number, number];
  particles?: 'petal' | 'firefly' | 'leaf' | 'snow';
  /** 只在夜里出现的装饰 */
  night?: boolean;
}

export const FESTIVALS: readonly Festival[] = [
  {
    id: 'sakura', name: '樱花节', icon: '🌸', season: 'spring', from: 3,
    blurb: '春风一吹，校园的树都开了花。花瓣落了一地，走在路上头发里都是粉色。',
    scene: ['校园飘着樱花花瓣', '画面偏暖粉色', '限定装扮「樱花发饰」'],
    buff: { key: 'luck', value: 1.05, text: '钓鱼运气 +5%' },
    costume: { code: 1, name: '樱花发饰' }, tint: [1, 0.96, 0.97], particles: 'petal',
  },
  {
    id: 'lantern', name: '荷灯夜', icon: '🏮', season: 'summer', from: 3,
    blurb: '夏夜的精工湖上漂着一盏盏荷花灯，萤火虫在岸边闪。',
    scene: ['夜里湖边有萤火虫', '湖面荷花灯', '限定装扮「荷花灯笼」'],
    buff: { key: 'nightBox', value: 1.2, text: '夜里钓到盲盒的概率 ×1.2' },
    costume: { code: 2, name: '荷花灯笼' }, particles: 'firefly', night: true,
  },
  {
    id: 'moon', name: '中秋月圆夜', icon: '🌕', season: 'autumn', from: 3,
    blurb: '月亮又大又圆，桂花的香味飘了一整个校园。',
    scene: ['夜里有一轮满月', '桂花飘落', '限定装扮「玉兔发箍」'],
    buff: { key: 'xpCap', value: 700, text: '钓鱼经验每天的满额上限 600 → 700' },
    costume: { code: 3, name: '玉兔发箍' }, tint: [1, 0.98, 0.92], particles: 'leaf',
  },
  {
    id: 'lights', name: '雪夜灯会', icon: '⛄', season: 'winter', from: 3,
    blurb: '下雪的夜里，校园挂满了彩灯，大家围着雪人拍照。',
    scene: ['校园挂彩灯', '雪花飘落', '限定装扮「毛线围巾帽」'],
    buff: { key: 'gift', text: '节日第一次登录送「漂流瓶 ×1 + 鱼饵 ×10」', items: [{ id: 'box_bottle', n: 1 }, { id: 'bait', n: 10 }] },
    costume: { code: 4, name: '毛线围巾帽' }, tint: [0.97, 0.98, 1], particles: 'snow',
  },
];
const FEST_BY_ID = new Map(FESTIVALS.map((f) => [f.id, f]));
export const festivalDef = (id: unknown): Festival | undefined => (typeof id === 'string' ? FEST_BY_ID.get(id) : undefined);
export const festivalByCode = (code: unknown): Festival | undefined => FESTIVALS.find((f) => f.costume.code === code);

/** 某个季节的第 d 天有没有节日（及它是节日的第几天） */
export function festivalOn(season: Season, dayInSeason: number): { f: Festival; nth: number } | null {
  for (const f of FESTIVALS) if (f.season === season && dayInSeason >= f.from && dayInSeason < f.from + FESTIVAL_DAYS) return { f, nth: dayInSeason - f.from + 1 };
  return null;
}
/** 这一天有没有节日（及它是节日的第几天；occ = 第几个节日轮次，用来记"这个节日领过礼物了"） */
export function festivalOfDay(day: number): { f: Festival; nth: number; occ: number } | null {
  const c = calendarOf(day), x = festivalOn(c.season, c.dayInSeason);
  return x ? { ...x, occ: c.year * SEASONS.length + c.seasonIdx } : null;
}
export const festivalAt = (ms: number) => festivalOfDay(gameDayAt(ms));
/** 节日期间的福利（没有节日 = null） */
export const festivalBuff = (day: number): { f: Festival; buff: FestivalBuff; occ: number } | null => { const x = festivalOfDay(day); return x ? { f: x.f, buff: x.f.buff, occ: x.occ } : null; };

/** 下一个节日（含今天正在过的）：返回开始那天和还有几天（正在过 = 0） */
export function nextFestival(day: number): { f: Festival; startDay: number; inDays: number; active: boolean } {
  const cur = festivalOfDay(day);
  if (cur) return { f: cur.f, startDay: day - (cur.nth - 1), inDays: 0, active: true };
  for (let d = Math.floor(day) + 1; d <= day + YEAR_DAYS; d++) { const x = festivalOfDay(d); if (x && x.nth === 1) return { f: x.f, startDay: d, inDays: d - day, active: false }; }
  const f = FESTIVALS[0]; return { f, startDay: day + YEAR_DAYS, inDays: YEAR_DAYS, active: false }; // 兜底（正常走不到）
}
/** 一整年（从春 1 日起）的 24 格：日历面板用。day 是对应的游戏日（第 1 年春夏在开服之前，day ≤ 0） */
export function yearGrid(year: number): { day: number; season: Season; seasonIdx: number; dayInSeason: number; fest: { f: Festival; nth: number } | null }[] {
  const first = ((year - 1) * SEASONS.length - START_SEASON) * SEASON_DAYS + 1;
  return Array.from({ length: YEAR_DAYS }, (_, i) => {
    const seasonIdx = Math.floor(i / SEASON_DAYS), season = SEASONS[seasonIdx], dayInSeason = (i % SEASON_DAYS) + 1;
    return { day: first + i, season, seasonIdx, dayInSeason, fest: festivalOn(season, dayInSeason) };
  });
}
