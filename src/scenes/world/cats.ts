/** 小猫互动面板：打开 / 关闭 / 刷新、喂鱼选择、宿舍养猫状态、摸 / 喂的动作。 */
import { Cat } from '@/entities/Cat';
import { isFish, FISH, REAL_FISH, RARITY_ORDER } from '@/shared/fishing';
import { dormCatCap } from '@/shared/cats';
import { defaultLay } from '@/shared/decor';
import type { WorldScene } from '../WorldScene';

export function openCat(sc: WorldScene, c: Cat) {
  c.hold(true, sc.player.x);
  { const dx = c.x - sc.player.x, dy = c.y - sc.player.y; if (!sc.player.riding && !sc.player.sitting) { sc.player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); sc.player.setCrouch(true); } }   // 面朝小猫蹲下
  sc.catUi.open(c.def);
  sc.hud.hint(null);
  refreshCatPanel(sc);
  sc.time.delayedCall(0, () => reframeForCatPanel(sc));
  const root = document.querySelector('.cat-panel');
  if (root && !sc.catRo) { sc.catRo = new ResizeObserver(() => { if (sc.catUi.isOpen) reframeForCatPanel(sc); }); sc.catRo.observe(root); } // 换页签面板变高 / 变矮：镜头跟着重新取景
}

/** 猫面板打开时把镜头往面板另一侧挪一点，别让面板盖住人和猫（竖屏：面板在下方，画面往上挪；手机横屏面板靠右停靠，画面往左挪） */
export function reframeForCatPanel(sc: WorldScene) {
  const cam = sc.cameras.main, root = document.querySelector('.cat-panel') as HTMLElement | null;
  if (!sc.catUi.isOpen || !root) { cam.setFollowOffset(0, 0); return; }
  const r = root.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, z = cam.zoom || 1;
  if (r.left > vw * 0.4 && r.width < vw * 0.6) cam.setFollowOffset(-(r.width / 2) / z, 0);      // 靠右停靠
  else cam.setFollowOffset(0, -Math.max(0, vh / 2 + 60 - r.top) / z);                         // 在下方：把人推到面板上沿之上（再留 60 像素，猫在人的南边也看得到）
}

export function closeCat(sc: WorldScene) {
  const id = sc.catUi.current?.id;
  sc.catUi.close();
  sc.cameras.main.setFollowOffset(0, 0);
  sc.player.setCrouch(false);
  if (id !== undefined) sc.cats[id]?.hold(false);
}

export function refreshCatPanel(sc: WorldScene) {
  const cat = sc.catUi?.current; if (!cat) return;
  const inv = sc.backpackUi.inv;
  const pid = sc.catWith.get(cat.id);
  sc.catUi.update(sc.catAff[cat.id] ?? 0, inv.cat_food ?? 0, inv.cat_treat ?? 0, fishCount(sc), sc.net.status === 'online', { info: sc.catInfo[cat.id], fish: fishList(sc), bed: inv.cat_bed ?? 0, hasBed: sc.catBeds.has(cat.id), following: pid === sc.net.selfId && pid !== undefined, withOther: pid !== undefined && pid !== sc.net.selfId, nick: sc.catNick[cat.id], tamed: sc.monUi.tamed.includes(cat.id), hasCatSpirit: sc.monUi.hasCatSpirit, dorm: dormCatState(sc, cat.id, pid === sc.net.selfId && pid !== undefined) });
}

/** 这只猫和"养在宿舍"的关系：已经住着 / 能不能接回来（不能时给原因，面板里显示在按钮的提示上） */
export function dormCatState(sc: WorldScene, id: number, following: boolean): { inDorm: boolean; why?: string } {
  const d = sc.dormUi?.data, dc = d?.dc ?? [];
  if (dc.includes(id)) return { inDorm: true };
  if (!d?.b) return { inDorm: false, why: '还没选宿舍楼：先在「宿舍」里选你住的楼栋' };
  if (following) return { inDorm: false, why: '它正跟着你：先让它回家，再接回宿舍' };
  const cap = dormCatCap(d.rm ?? 0), beds = (d.lay ?? defaultLay(d.rm ?? 0)).filter((p) => p.d === 'dc_catbed').length;
  if (dc.length >= cap) return { inDorm: false, why: `这间宿舍最多养 ${cap} 只猫（扩建后能养更多）` };
  if (beds <= dc.length) return { inDorm: false, why: `宿舍里要先摆一个空着的「宿舍猫窝」（现在 ${beds} 个，已经住了 ${dc.length} 只）：商店买、装修里摆进去` };
  return { inDorm: false };
}

/** 背包里能喂猫的鱼（真鱼，不含杂物）总数 */
export function fishCount(sc: WorldScene) { return Object.entries(sc.backpackUi.inv).reduce((n, [id, c]) => n + (isFish(id) ? c : 0), 0); }

/** 喂鱼时先拿最常见的（稀有的留着）：FISH 目录按常见到稀有排好 */
export function pickFish(sc: WorldScene) : string | undefined { return FISH.find((f) => isFish(f.id) && (sc.backpackUi.inv[f.id] ?? 0) > 0)?.id; }

/** 背包里的真鱼（喂鱼选择列表用），按稀有度从常见到稀有排 */
export function fishList(sc: WorldScene): { id: string; name: string; n: number; rarity: string }[] {
  const inv = sc.backpackUi.inv, ord = (r: string) => { const i = (RARITY_ORDER as readonly string[]).indexOf(r); return i < 0 ? 99 : i; };
  return REAL_FISH.filter((f) => (inv[f.id] ?? 0) > 0).map((f) => ({ id: f.id, name: f.name, n: inv[f.id], rarity: f.rarity })).sort((a, b) => ord(a.rarity) - ord(b.rarity));
}

export function catAction(sc: WorldScene, kind: 'pet' | 'feed', which?: 'cat_food' | 'cat_treat' | 'fish' | 'cat_bed', fishId?: string) {
  const item = which === 'fish' ? (fishId && isFish(fishId) && (sc.backpackUi.inv[fishId] ?? 0) > 0 ? fishId : pickFish(sc)) : which;
  const cat = sc.catUi.current; if (!cat) return;
  if (sc.net.status !== 'online') { // 单人模式：摸摸只有动画，不记好感，也不能喂
    if (kind === 'pet') { sc.cats[cat.id]?.pet(); sc.catUi.say('摸了摸（单机模式，好感度不会记录）', true); }
    return;
  }
  if (kind === 'pet') sc.net.catPet(cat.id); else if (item) sc.net.catFeed(cat.id, item); else sc.catUi.say('背包里没有鱼了', false);
}
