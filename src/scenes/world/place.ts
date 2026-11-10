/** 地点留言板入口（浮动按钮）与「所在地点」横幅。 */
import { TILE } from '@/core/const';
import { placeAt } from '@/shared/place';
import { placeBtnState } from '@/ui/placebtn';
import type { WorldScene } from '../WorldScene';

/** 屏幕上的浮动按钮「📝 留言板·地点名」：站在建筑 / 地标附近才出现，不改变按 E 的原有行为 */
export function setupPlaceBtn(sc: WorldScene) {
  const b = document.createElement('button'); b.type = 'button'; b.id = 'place-btn'; b.className = 'btn place-fab hidden';
  b.addEventListener('click', () => openPlaceBoard(sc));
  (document.getElementById('hud') ?? document.body).append(b); sc.placeBtn = b;
  sc.events.on('shutdown', () => { b.remove(); sc.placeBtn = undefined; });
  sc.events.on('sleep', () => b.classList.add('hidden')); // 进室内 / 宿舍：校园场景睡觉，按钮收起来
}

export function openPlaceBoard(sc: WorldScene) {
  const d = sc.curPlace; if (!d) return;
  if (sc.net.status !== 'online') { sc.hud.banner('📝 留言板', '连上服务器后才能留言（单机模式用不了）'); return; }
  if (sc.placeUi.isOpen || sc.hud.dialogOpen) return;
  sc.hud.hint(null); sc.placeUi.open({ key: d.key, name: d.name });
}

/** 每 200ms 看一眼玩家站在哪个地点，更新入口按钮 */
export function updateBoardEntry(sc: WorldScene) {
  const b = sc.placeBtn; if (!b || sc.time.now < sc.placeChkAt) return;
  sc.placeChkAt = sc.time.now + 200;
  sc.curPlace = placeAt(sc.places, sc.player.x / TILE, sc.player.y / TILE);
  const st = placeBtnState({ place: sc.curPlace?.name ?? null, online: sc.net.status === 'online', fishing: sc.fishPhase !== 'idle', riding: sc.player.riding, entering: sc.entering, blocked: sc.anyOverlay() });
  b.classList.toggle('hidden', !st.show);
  if (st.show) { const t = `📝 留言板·${st.label}${document.body.classList.contains('touch') ? '' : ' [.]'}`; if (b.textContent !== t) b.textContent = t; }
}

export function updatePlace(sc: WorldScene) {
  const tx = sc.player.x / TILE, ty = sc.player.y / TILE;
  let name = '', sub = '';
  for (const p of sc.wf.pois) {
    if (p.kind === 'spawn' || !p.r) continue;
    if ((p.x - tx) ** 2 + (p.y - ty) ** 2 < p.r * p.r) { name = p.name; sub = p.desc ?? ''; break; }
  }
  if (!name) {
    for (const b of sc.wf.buildings) {
      const bb = b.bbox;
      if (tx > bb.x - 2 && tx < bb.x + bb.w + 2 && ty > bb.y - 2 && ty < bb.y + bb.h + 3) { name = b.name; break; }
    }
  }
  if (name && name !== sc.lastPlace) sc.hud.banner(name, sub);
  sc.lastPlace = name;
}
