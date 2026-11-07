import type { CatDef, CatResult } from '@/shared/cats';
import type { Placed } from '@/shared/decor';

/**
 * 养在宿舍的小猫：校园场景和宿舍场景之间的"桥"（校园场景创建时放进 registry，宿舍场景用它拿猫的资料、好感度，打开同一个小猫面板）。
 * 猫本身只有校园场景里的一份数据（名字、毛色、专属名、好感度）；宿舍里画的是另一只 Cat 实体，家在猫窝旁边。
 */
export interface CatBridge {
  def(id: number): CatDef | undefined;
  aff(id: number): number;
  nick(id: number): string | undefined;
  /** 在宿舍里打开这只猫的小猫面板（摸 / 喂 / 抱 / 羁绊页里的「送回校园」） */
  open(id: number): void;
  /** 小猫面板现在开着吗、开的是哪只 */
  panel(): { isOpen: boolean; id: number | undefined };
}
/** 校园场景在收到猫的互动结果时，转发给宿舍场景（让宿舍里那只猫做出反应）；宿舍场景进屋时登记、出屋时取消 */
export type DormCatFx = (id: number, kind: 'pet' | 'feed' | 'hug', r: CatResult) => void;

/** 宿舍里每个「宿舍猫窝」的位置（脚点，像素）：猫趴在窝里，脚点落在窝的下半部 */
export const bedSpots = (lay: readonly Placed[]): { x: number; y: number }[] => lay.filter((p) => p.d === 'dc_catbed').map((p) => ({ x: p.x * 16 + 8, y: p.y * 16 + 13 }));

/** 给第 i 只住在宿舍的猫分家：有猫窝就在猫窝，没有（猫窝被收回去了）就在 fallback 附近（房间中间的空地），错开一点 */
export function dormCatHome(i: number, beds: readonly { x: number; y: number }[], fallback: { x: number; y: number }): { x: number; y: number; bed: boolean } {
  if (beds[i]) return { ...beds[i], bed: true };
  return { x: fallback.x + (i % 2 ? 18 : -18), y: fallback.y + (i >= 2 ? 14 : 0), bed: false };
}
