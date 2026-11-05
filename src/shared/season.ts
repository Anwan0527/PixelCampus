/**
 * 季节与天气（客户端、服务器、地图编译器共用）。
 * 和游戏时间一样，季节和天气只由"服务器时间"决定——不用额外同步任何消息，所有玩家看到的季节、天气完全一致。
 *  - 季节按游戏天数轮换：每个季节 SEASON_DAYS 个游戏日（1 游戏日 = 20 真实分钟），所以一个季节 = 2 真实小时，一年 = 8 真实小时。
 *  - 天气每 WEATHER_SLOT_MS（真实 8 分钟）按季节的概率重新抽一次：晴 / 阴 / 雨（冬天下雪），同一个时段内不变。
 */
import { CLOCK_EPOCH_MS, clockMinutes } from './clock';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 每个季节持续几个游戏日 */
export const SEASON_DAYS = 6;
/** 游戏第 1 天所处的季节：开服在 11 月，从秋天开始 */
export const START_SEASON = 2;
export const SEASON_NAME: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const isSeason = (s: unknown): s is Season => typeof s === 'string' && (SEASONS as readonly string[]).includes(s);

/** 游戏第 day 天（1 起）的季节 */
export function seasonOfDay(day: number): Season {
  const n = Math.floor((Math.max(1, day) - 1) / SEASON_DAYS) + START_SEASON;
  return SEASONS[n % SEASONS.length];
}
/** 服务器时间（毫秒时间戳）对应的季节 */
export const seasonAt = (ms: number): Season => seasonOfDay(Math.floor(clockMinutes(ms) / 1440) + 1);

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow';
export interface WeatherState {
  kind: WeatherKind;
  /** 降水强度 0~1（晴/阴为 0）：小雨 / 大雨 */
  power: number;
  /** 中文名：晴 / 阴 / 小雨 / 大雨 / 小雪 / 大雪 */
  name: string;
  icon: string;
}

/** 天气换一次的间隔（真实毫秒） */
export const WEATHER_SLOT_MS = 8 * 60 * 1000;

/** 各季节抽到 [晴, 阴, 降水] 的概率（冬天的降水是雪） */
const ODDS: Record<Season, [number, number, number]> = {
  spring: [0.46, 0.27, 0.27],
  summer: [0.5, 0.2, 0.3],
  autumn: [0.56, 0.3, 0.14],
  winter: [0.46, 0.3, 0.24],
};

/** 整数 → [0,1) 的确定性哈希（客户端、服务器必须一模一样，所以只用整数运算） */
export function hash01(n: number, salt = 0): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt + 0x85ebca6b, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const weatherSlot = (ms: number): number => Math.floor((ms - CLOCK_EPOCH_MS) / WEATHER_SLOT_MS);

/** 某个天气时段的天气 */
export function weatherOfSlot(slot: number): WeatherState {
  const season = seasonAt(CLOCK_EPOCH_MS + slot * WEATHER_SLOT_MS);
  const [sun, cloud] = ODDS[season], r = hash01(slot, 7);
  if (r < sun) return { kind: 'sunny', power: 0, name: '晴', icon: '☀️' };
  if (r < sun + cloud) return { kind: 'cloudy', power: 0, name: '阴', icon: '☁️' };
  const power = hash01(slot, 11) < 0.55 ? 0.55 : 1;
  if (season === 'winter') return { kind: 'snow', power, name: power < 0.8 ? '小雪' : '大雪', icon: '❄️' };
  return { kind: 'rain', power, name: power < 0.8 ? '小雨' : '大雨', icon: power < 0.8 ? '🌦️' : '🌧️' };
}
/** 服务器时间（毫秒时间戳）对应的天气 */
export const weatherAt = (ms: number): WeatherState => weatherOfSlot(weatherSlot(ms));

/** 这种天气下要不要打伞（下雨时人人打伞；下雪不用） */
export const needsUmbrella = (w: WeatherState): boolean => w.kind === 'rain';
