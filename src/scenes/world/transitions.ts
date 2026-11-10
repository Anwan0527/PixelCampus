/** 进出室内：建筑内部、我的宿舍 / 好友宿舍（淡出 → 睡眠本场景 → 启动 Interior 场景）。 */
import type { BuildingOut } from '@/shared/world-format';
import { TILE } from '@/core/const';
import { dormInteriorId } from '@/shared/dorm';
import { groundInterior } from '@/shared/teleport';
import type { WorldScene } from '../WorldScene';

export function enterInterior(sc: WorldScene, b: BuildingOut, interiorId: string | undefined = b.interior) {
  if (sc.entering || !b.interior || !interiorId) return;
  sc.entering = true;
  sc.hud.hint(null);
  const d = b.doors[0];
  sc.enterPos = { x: (d.x + d.w / 2) * TILE, y: (d.y + 1.0) * TILE };
  const cam = sc.cameras.main;
  cam.fadeOut(220, 20, 14, 10);
  cam.once('camerafadeoutcomplete', () => { sc.scene.sleep(); sc.scene.launch('Interior', { id: interiorId }); });
}

/** 服务器说可以回宿舍了（x,y = 宿舍楼门口）：淡出进入「我的宿舍」；出来时人站在这个位置 */
export function enterDorm(sc: WorldScene, x: number, y: number) {
  if (sc.entering || !sc.scene.isActive()) return; // 已经在进门，或者人已经在宿舍里
  sc.entering = true; sc.hud.hint(null);
  sc.player.setRiding(false); sc.player.setSitting(false);
  sc.dormUi.close(); sc.tpUi.close();
  sc.enterPos = { x, y };
  const cam = sc.cameras.main;
  cam.fadeOut(220, 20, 14, 10);
  cam.once('camerafadeoutcomplete', () => { sc.scene.sleep(); const v = sc.registry.get('dormVisit') as { rm?: number } | null | undefined; sc.scene.launch('Interior', { id: dormInteriorId(v ? v.rm ?? 0 : sc.dormUi.data?.rm ?? 0) }); });
}

/** 传送面板里选了某一层：人已被服务器传到建筑门口，直接进入那一层（找到一层室内 = 这栋楼的 interior 的建筑） */
export function enterFloor(sc: WorldScene, interiorId: string) {
  const ground = groundInterior(interiorId), b = sc.wf.buildings.find((x) => x.interior === ground);
  if (b) enterInterior(sc, b, interiorId);
}
