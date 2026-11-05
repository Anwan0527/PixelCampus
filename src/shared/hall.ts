/**
 * 名人堂（客户端与服务器共用）：三张榜，服务器按玩家档案实时算，客户端打开面板后每几秒刷新一次。
 *  - 游玩榜：累计在线时间（秒）；
 *  - 猫缘榜：和校园小猫的好感度总和（也显示"结缘的小猫只数"，可以切换成按只数排）；
 *  - 钓鱼榜：钓上来的鱼的总价值（按鱼的标准收购价算，不含今日行情；杂物不计）。
 * 榜单只给"校园号 + 名字 + 称号 + 数值"，点名字可以看学生证。
 */
import { fishPrice } from './economy';
import { fishDef, isFish, type FishLog } from './fishing';
import { catLevel } from './cats';

export const HALL_TOP = 20;
export type HallBoard = 'play' | 'cat' | 'fish';
export interface HallRow { uid: number; name: string; title?: string; online: boolean; value: number; /** 猫缘榜：结缘的小猫只数；钓鱼榜：钓到的鱼的条数 */ extra: number }
export interface HallMe { value: number; extra: number; /** 我在这张榜里排第几（没上过榜 = 0） */ rank: number }
export interface HallData {
  play: HallRow[]; cat: HallRow[]; /** 猫缘榜按"结缘只数"排的版本 */ catN: HallRow[]; fish: HallRow[];
  me: { play: HallMe; cat: HallMe; catN: HallMe; fish: HallMe };
  /** 榜上一共多少人 */ total: Record<'play' | 'cat' | 'fish', number>;
}

/** 钓鱼榜的数值：图鉴里每个种类的条数 × 标准收购价之和（杂物不在图鉴里） */
export function fishValue(fd: Record<string, FishLog> | undefined): { value: number; count: number } {
  let value = 0, count = 0;
  for (const [id, log] of Object.entries(fd ?? {})) { const d = isFish(id) ? fishDef(id) : undefined; if (d) { value += fishPrice(d) * log.n; count += log.n; } }
  return { value, count };
}
/** 猫缘榜的数值：好感度总和、结缘的小猫只数（好感达到"熟悉"以上才算结缘） */
export function catScore(cats: Record<string, number> | undefined): { value: number; n: number } {
  let value = 0, n = 0;
  for (const a of Object.values(cats ?? {})) { if (typeof a !== 'number') continue; value += a; if (catLevel(a) >= 1) n++; }
  return { value, n };
}
/** 时间显示："12 小时 05 分" / "35 分钟" */
export function fmtPlay(sec: number): string {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h} 小时 ${String(m % 60).padStart(2, '0')} 分` : `${m} 分钟`;
}
