/**
 * 视野流式管理：世界里成千上万的摆件/建筑/地面块，只让镜头附近的存在于场景里。
 * 每个条目只需给出包围盒和 make()（创建并返回带 destroy 的对象）。
 * loadMargin 内创建、keepMargin 外销毁（滞回，避免边界抖动）。
 */
export interface Destroyable { destroy(): void }
export interface StreamItem { x: number; y: number; w: number; h: number; make: () => Destroyable; obj?: Destroyable | null }

export class Streamer {
  readonly items: StreamItem[] = [];
  active = 0;
  constructor(private loadMargin = 700, private keepMargin = 1500) {}
  /** 全部销毁（下一次 update 会按视野重新创建）：换季节、换贴图时用 */
  reset() { for (const it of this.items) if (it.obj) { it.obj.destroy(); it.obj = null; } this.active = 0; }
  add(it: StreamItem) { it.obj = null; this.items.push(it); }
  /** cx,cy,vw,vh = 镜头中心与可见世界尺寸（像素） */
  update(cx: number, cy: number, vw: number, vh: number) {
    const lx0 = cx - vw / 2 - this.loadMargin, lx1 = cx + vw / 2 + this.loadMargin, ly0 = cy - vh / 2 - this.loadMargin, ly1 = cy + vh / 2 + this.loadMargin;
    const kx0 = cx - vw / 2 - this.keepMargin, kx1 = cx + vw / 2 + this.keepMargin, ky0 = cy - vh / 2 - this.keepMargin, ky1 = cy + vh / 2 + this.keepMargin;
    let n = 0;
    for (const it of this.items) {
      const x1 = it.x + it.w, y1 = it.y + it.h;
      if (it.obj) {
        if (x1 < kx0 || it.x > kx1 || y1 < ky0 || it.y > ky1) { it.obj.destroy(); it.obj = null; } else n++;
      } else if (!(x1 < lx0 || it.x > lx1 || y1 < ly0 || it.y > ly1)) { it.obj = it.make(); n++; }
    }
    this.active = n;
  }
}
