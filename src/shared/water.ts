/**
 * 水面格查询（客户端与服务器共用）：从 world.json 的 waterRuns 还原成一张位图。
 * 钓鱼只认"精工湖"一带的水（以湖的地标为圆心的一个圈内），校园里别的小水景不算。
 */
export type WaterRuns = readonly (readonly [number, number, number])[];

export class WaterMask {
  private bits: Uint8Array;
  constructor(runs: WaterRuns, readonly w: number, readonly h: number, private tile = 16, private zone?: { x: number; y: number; r: number }) {
    this.bits = new Uint8Array(w * h);
    for (const [y, x0, x1] of runs) { if (y < 0 || y >= h) continue; for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) this.bits[y * w + x] = 1; }
  }
  /** 格坐标是不是（可钓鱼的）水 */
  tileWater(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || !this.bits[ty * this.w + tx]) return false;
    return !this.zone || Math.hypot(tx + 0.5 - this.zone.x, ty + 0.5 - this.zone.y) <= this.zone.r;
  }
  /** 像素坐标是不是水 */
  at = (px: number, py: number) => this.tileWater(Math.floor(px / this.tile), Math.floor(py / this.tile));
  get count() { let n = 0; for (const b of this.bits) n += b; return n; }
}

/** 钓鱼区域：以精工湖地标为圆心、这个半径（格）以内的水 */
export const LAKE_ZONE_R = 75;
export function lakeMask(runs: WaterRuns | undefined, w: number, h: number, pois: readonly { id: string; x: number; y: number }[], tile = 16): WaterMask | null {
  const lake = pois.find((p) => p.id === 'lake');
  if (!runs || !lake) return null;
  return new WaterMask(runs, w, h, tile, { x: lake.x, y: lake.y, r: LAKE_ZONE_R });
}
