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

/** 连续性：每 BLOCK 个天气时段为一组"天气系统"，组内每个时段有 STICK 的概率沿用这一组的天气（概率仍严格按季节表，只是不再晴↔大雨来回跳） */
const WX_BLOCK = 3, WX_STICK = 0.72;

/** 某个天气时段的天气 */
export function weatherOfSlot(slot: number): WeatherState {
  const season = seasonAt(CLOCK_EPOCH_MS + slot * WEATHER_SLOT_MS);
  const [sun, cloud] = ODDS[season], block = Math.floor(slot / WX_BLOCK), sticky = hash01(slot, 13) < WX_STICK;
  const r = sticky ? hash01(block, 17) : hash01(slot, 7);
  if (r < sun) return { kind: 'sunny', power: 0, name: '晴', icon: '☀️' };
  if (r < sun + cloud) return { kind: 'cloudy', power: 0, name: '阴', icon: '☁️' };
  const power = hash01(sticky ? block : slot, 11) < 0.55 ? 0.55 : 1;
  if (season === 'winter') return { kind: 'snow', power, name: power < 0.8 ? '小雪' : '大雪', icon: '❄️' };
  return { kind: 'rain', power, name: power < 0.8 ? '小雨' : '大雨', icon: power < 0.8 ? '🌦️' : '🌧️' };
}
/** 服务器时间（毫秒时间戳）对应的天气 */
export const weatherAt = (ms: number): WeatherState => weatherOfSlot(weatherSlot(ms));

/** 这种天气下要不要打伞（下雨时人人打伞；下雪不用） */
export const needsUmbrella = (w: WeatherState): boolean => w.kind === 'rain';

// ------------------------------------------------------------------ 天气的细节（雾 / 雷暴 / 彩虹 / 温度）与预报
/**
 * 在四种基础天气之上的"表现层"细节，同样只由服务器时间决定（所有玩家一致）。
 * 它们**不改变** WeatherState.kind：雷暴仍是 rain，所以钓鱼、委托、野生精灵、伞等所有按 kind 判断的规则都不受影响。
 */
export interface Sky {
  w: WeatherState;
  /** 雾的浓度 0~1：只在阴天的清晨出现（雨后更容易），日出后散去 */
  fog: number;
  /** 雷暴：大雨里的一部分（春夏秋），会打闪 */
  storm: boolean;
  /** 彩虹强度 0~1：雨时段之后紧接着的晴天、白天里，头几分钟出现然后淡去 */
  rainbow: number;
  /** 体感温度（℃，取整）：季节 + 昼夜 + 天气 + 每天一点小波动 */
  tempC: number;
  /** 一个名字：晴 / 阴 / 雾 / 小雨 / 雷暴 / …… */
  name: string;
  icon: string;
}
const SEASON_TEMP: Record<Season, number> = { spring: 15, summer: 27, autumn: 13, winter: -3 };
const WX_TEMP: Record<WeatherKind, number> = { sunny: 2, cloudy: -1, rain: -3, snow: -2 };

export function skyAt(ms: number): Sky {
  const slot = weatherSlot(ms), w = weatherOfSlot(slot), season = seasonAt(ms);
  const mins = clockMinutes(ms), day = Math.floor(mins / 1440), h = (mins - day * 1440) / 60;
  const prevWet = weatherOfSlot(slot - 1).kind === 'rain';
  let fog = 0;
  if (w.kind === 'cloudy' && hash01(slot, 23) < (prevWet ? 0.7 : 0.35)) {
    fog = h >= 4.5 && h < 6 ? (h - 4.5) / 1.5 : h >= 6 && h < 8.5 ? 1 : h >= 8.5 && h < 10 ? (10 - h) / 1.5 : 0;
  }
  const storm = w.kind === 'rain' && w.power >= 1 && hash01(slot, 29) < 0.45;
  const since = (ms - CLOCK_EPOCH_MS) - slot * WEATHER_SLOT_MS; // 这个天气时段已经过了多少真实毫秒
  const rainbow = w.kind === 'sunny' && prevWet && h >= 7 && h < 17 && since < 5 * 60 * 1000 ? Math.min(1, since / 30000, (5 * 60 * 1000 - since) / 60000) : 0;
  const tempC = Math.round(SEASON_TEMP[season] + 5 * Math.cos(((h - 14) / 24) * Math.PI * 2) + WX_TEMP[w.kind] - (storm ? 1 : 0) + (hash01(day, 31) - 0.5) * 6);
  const name = storm ? '雷暴' : fog > 0.3 ? '大雾' : w.name;
  const icon = storm ? '⛈️' : fog > 0.3 ? '🌫️' : rainbow > 0.3 ? '🌈' : w.icon;
  return { w, fog, storm, rainbow: Math.max(0, rainbow), tempC, name, icon };
}

export interface ForecastItem {
  slot: number;
  /** 这个时段开始的服务器时间 */
  startMs: number;
  w: WeatherState;
  sky: Sky;
  /** 离得远的时段只给"有没有降水"的大致趋势（界面上不显示具体天气名） */
  vague: boolean;
}
/** 精准预报覆盖几个时段（≈ 24 真实分钟）；再往后只给趋势 */
export const FORECAST_EXACT = 3;
/** 从 ms 起往后 count 个天气时段（第 0 个是当前这个）的预报 */
export function forecast(ms: number, count = 9): ForecastItem[] {
  const s0 = weatherSlot(ms), out: ForecastItem[] = [];
  for (let i = 0; i < count; i++) {
    const slot = s0 + i, startMs = CLOCK_EPOCH_MS + slot * WEATHER_SLOT_MS, at = i === 0 ? ms : startMs + WEATHER_SLOT_MS / 2;
    out.push({ slot, startMs, w: weatherOfSlot(slot), sky: skyAt(at), vague: i >= FORECAST_EXACT });
  }
  return out;
}
/** 往后第一个有降水（雨 / 雪）的天气时段（不含当前）；maxSlots 个时段内没有就返回 null */
export function nextWet(ms: number, maxSlots = 48): ForecastItem | null {
  const s0 = weatherSlot(ms);
  for (let i = 1; i <= maxSlots; i++) { const w = weatherOfSlot(s0 + i); if (w.kind === 'rain' || w.kind === 'snow') { const startMs = CLOCK_EPOCH_MS + (s0 + i) * WEATHER_SLOT_MS; return { slot: s0 + i, startMs, w, sky: skyAt(startMs + WEATHER_SLOT_MS / 2), vague: i >= FORECAST_EXACT }; } }
  return null;
}
