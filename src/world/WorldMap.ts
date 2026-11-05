/** 室内/室外共用：只需要宽高与碰撞行 */
export interface CollisionData { width: number; height: number; collision: string[] }
import { FOOT_HALF_W, FOOT_H, TILE } from '@/core/const';

/** 世界数据与碰撞查询（tile 格阻挡 + 像素脚底盒，滑动式移动）。 */
export class WorldMap {
  readonly w: number;
  readonly h: number;
  private readonly blocked: Uint8Array;
  constructor(readonly data: CollisionData) {
    this.w = data.width; this.h = data.height;
    this.blocked = new Uint8Array(this.w * this.h);
    data.collision.forEach((row, y) => { for (let x = 0; x < this.w; x++) this.blocked[y * this.w + x] = row.charCodeAt(x) === 49 ? 1 : 0; });
  }
  get pxW() { return this.w * TILE; }
  get pxH() { return this.h * TILE; }
  tileBlocked(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.blocked[ty * this.w + tx] === 1;
  }
  /** 脚点 (x,y)（像素）处的脚底盒是否碰撞 */
  boxBlocked(x: number, y: number): boolean {
    const x0 = Math.floor((x - FOOT_HALF_W) / TILE), x1 = Math.floor((x + FOOT_HALF_W - 0.01) / TILE);
    const y0 = Math.floor((y - FOOT_H) / TILE), y1 = Math.floor((y - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tileBlocked(tx, ty)) return true;
    return false;
  }
  /** 尝试移动，轴向分离（可贴墙滑动），返回新位置 */
  move(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
    let nx = x, ny = y;
    if (dx !== 0 && !this.boxBlocked(x + dx, y)) nx = x + dx;
    if (dy !== 0 && !this.boxBlocked(nx, y + dy)) ny = y + dy;
    return { x: nx, y: ny };
  }
}
