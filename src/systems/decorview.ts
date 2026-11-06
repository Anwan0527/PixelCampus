import type Phaser from 'phaser';
import { canTurn, decorDef, footOf, topRaise, type Placed } from '@/shared/decor';
import { rotInfo } from '@/shared/interior';

/** 一件摆好的家具在室内场景里怎么画：图集里的哪一帧、左上角像素位置、层级（和室内编译 tools/world/interiors.ts 的约定一致） */
export interface Spot { frame: string; x: number; y: number; depth: number }
export function spotOf(textures: Phaser.Textures.TextureManager, lay: readonly Placed[], p: Placed): Spot | null {
  const def = decorDef(p.d); if (!def) return null;
  const base = textures.getFrame('furniture', def.k); if (!base) return null;
  const rot = canTurn(def) ? (p.r ?? 0) : 0, frame = rot ? `${def.k}@${rot}` : def.k;
  let ri;
  if (def.face && rot) { // 设计好的朝向：贴图自带转向后的占地，占地在精灵左下角（和 rotInfo 不转时的约定一样）
    const fr = textures.getFrame('furniture', frame); if (!fr) return null;
    const f = footOf(def, rot); ri = rotInfo(f.fw, f.fh, fr.realWidth, fr.realHeight, 0);
  } else ri = rotInfo(def.fw, def.fh, base.realWidth, base.realHeight, rot); // 地毯 / 门垫：贴图是原图转出来的，占地跟着转
  const ox = def.ox ?? 0; // 窗帘比窗框宽，向左多画出去 ox 像素
  // 地毯铺在地上：压在所有家具和人的下面；门垫叠在地毯上面；同一种里摆得晚的盖在摆得早的上面（按摆放顺序每件抬 0.001）
  const stack = (lay.indexOf(p) + 1 || lay.findIndex((q) => q.d === p.d && q.x === p.x && q.y === p.y) + 1) * 0.001;
  if (def.kind === 'rug') return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: 0.5 + stack };
  if (def.kind === 'mat') return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: 0.6 + stack };
  if (def.kind === 'wall') return { frame, x: p.x * 16 - ri.mx - ox, y: p.y * 16 - ri.my, depth: p.y * 16 };
  if (def.kind === 'top') { const raise = topRaise(lay, p); return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my - raise, depth: (p.y + 1) * 16 + 24.1 }; } // 桌面小件：层级抬高，盖在桌子上面
  return { frame, x: p.x * 16 - ri.mx, y: p.y * 16 - ri.my, depth: (p.y + footOf(def, p.r).fh) * 16 };
}
