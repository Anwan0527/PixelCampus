/**
 * 家具转向的贴图登记：每件能转向的家具（src/shared/decor.ts 里 face: true）的 90 / 180 / 270 三个朝向各有一张**单独设计**的贴图，
 * 不是把原图转一下——转过去看到的是侧面 / 背面（椅背、柜子的背板、电视的后壳、书桌的侧板……）。
 *
 * 约定（和 furniture*.ts 一样）：
 *  - 朝向 r 顺时针转：0 = 原图（朝南，面朝屏幕下方）→ 90 = 朝西 → 180 = 朝北（背对镜头）→ 270 = 朝东；
 *    原图朝北的家具（dc_chairup，base = 180）从它的朝向起转，四个朝向和「木椅」共用同一套画法；
 *  - 脚印 fw×fh 是**转向后**的占地：90 / 270 时宽高互换（2×1 的柜子转过来是 1×2）；
 *  - 精灵左缘 = 脚印左缘（带 1px 描边，所以图左多 1px），精灵底边 = 脚印底缘，精灵可以往上超出脚印；
 *  - 画完用 .outlined(PAL.outline) 描边，和别的家具一样；
 *  - 可以登记 0 来换掉原图（想把原图也重画得和另外三面一致时用）。
 * 键是家具目录里的精灵名 k（DecorDef.k），不是物品 id。
 */
import type { Furn } from './furniture.ts';
import { SEAT_VIEWS } from './turn-seats.ts';
import { TABLE_VIEWS } from './turn-tables.ts';
import { STORAGE_VIEWS } from './turn-storage.ts';

export type ViewMap = Partial<Record<0 | 90 | 180 | 270, () => Furn>>;
export const TURN_VIEWS: Record<string, ViewMap> = { ...SEAT_VIEWS, ...TABLE_VIEWS, ...STORAGE_VIEWS };
