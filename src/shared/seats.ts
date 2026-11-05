/**
 * 长椅座位（客户端与服务器共用）：从世界里的长椅（锚点 = 椅子底边中点）算出"坐下时人站的位置"。
 * 长椅本身是障碍物，所以人的位置要放在长椅正南面最近的一处可站的地方；画面上再把人抬到椅面上，位置本身仍然是合法位置，
 * 这样存档、重连、移动校验都不用为"坐着"开特例。
 */
import type { WorldMap } from '../world/WorldMap';

export interface Seat {
  /** 长椅锚点（像素）：画椅面前沿遮挡、把人摆到椅面上都以它为准 */
  bx: number; by: number;
  /** 坐下时玩家的位置（合法位置：脚底盒不在障碍里） */
  x: number; y: number;
}
/** 玩家离座位多近（像素）才能坐下：客户端提示用 / 服务器校验用（留出位置延迟的余量） */
export const SIT_REACH = 26;
export const SIT_SERVER_REACH = 70;

/** 长椅 → 座位：同一位置的重复长椅只留一个；周围没有可站位置的长椅不能坐 */
export function seatSpots(benches: readonly { x: number; y: number }[], map: Pick<WorldMap, 'boxBlocked'>): Seat[] {
  const seen = new Set<string>(), out: Seat[] = [];
  for (const b of benches) {
    const k = `${Math.round(b.x)},${Math.round(b.y)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const dy of [3, 6, 9, 12, 16, 20]) {
      const x = Math.round(b.x * 4) / 4, y = Math.round((b.y + dy) * 4) / 4; // 对齐 1/4 像素，与协议精度一致
      if (!map.boxBlocked(x, y)) { out.push({ bx: b.x, by: b.y, x, y }); break; }
    }
  }
  return out;
}

/** 离 (x,y) 最近、且在 reach 范围内的座位 */
export function nearestSeat(seats: readonly Seat[], x: number, y: number, reach: number): Seat | undefined {
  let best: Seat | undefined, bd = reach;
  for (const s of seats) { const d = Math.hypot(s.x - x, s.y - y); if (d <= bd) { bd = d; best = s; } }
  return best;
}
