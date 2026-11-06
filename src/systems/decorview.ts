import type Phaser from 'phaser';
import { decorDef, footOf, topRaise, type Placed } from '@/shared/decor';
import { rotInfo } from '@/shared/interior';

/** 一件摆好的家具在室内场景里怎么画：图集里的哪一帧、左上角像素位置、层级（和室内编译 tools/world/interiors.ts 的约定一致） */
export interface Spot { frame: string; x: number; y: number; depth: number }
export function spotOf(textures: Phaser.Textures.TextureManager, lay: readonly Placed[], p: Placed): Spot | null {
  const def = decorDef(p.d); if (!def) return null;
  const fr = textures.getFrame('furniture', def.k); if (!fr) return null;
  const rot = def.turn ? (p.r ?? 0) : 0, ri = rotInfo(def.fw, def.fh, fr.realWidth, fr.realHeight, rot);
  const frame = rot ? `${def.k}@${rot}` : def.k;
  const ox = def.ox ?? 0; // 窗帘比窗框宽，向左多画出去 ox 像素
  if (def.kind === 'rug') return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: 0.5 }; // 地毯铺在地上：压在所有家具和人的下面
  if (def.kind === 'mat') return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: 0.6 }; // 门垫叠在地毯上面
  if (def.kind === 'wall') return { frame, x: p.x * 16 - ri.mx - ox, y: p.y * 16 - ri.my, depth: p.y * 16 };
  if (def.kind === 'top') { const raise = topRaise(lay, p); return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my - raise, depth: (p.y + 1) * 16 + 24.1 }; } // 桌面小件：层级抬高，盖在桌子上面
  return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: (p.y + footOf(def, p.r).fh) * 16 };
}
