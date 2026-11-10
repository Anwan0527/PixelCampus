/** 钓鱼：服务器状态驱动的阶段切换、钓到鱼的特效、钓鱼沉浸（锁住会打断钓鱼的界面）。 */
import { FISHING_BLOCK_MSG, type FishLockState } from '@/systems/fishlock';
import { fishDef, fmtKg, sizeTier, FISHING } from '@/shared/fishing';
import type { ServerMsg } from '@/shared/protocol';
import { sfx } from '@/audio/sfx';
import { itemDef } from '@/shared/items';
import type { WorldScene } from '../WorldScene';

/** 服务器告诉我钓鱼进行到哪一步了：等鱼 → 咬钩 → 拉鱼小游戏 → 钓到（鱼飞出水面 + 卡片） / 鱼跑了 */
export function onFishState(sc: WorldScene, m: Extract<ServerMsg, { t: 'fish_state' }>) {
  const p = sc.player;
  if (m.s === 'wait') { sc.fishPhase = 'wait'; if (m.x !== undefined && m.y !== undefined) sc.bobber = { x: m.x, y: m.y }; p.setFishing(true, sc.bobber ?? undefined); sfx('cast'); return; }
  if (m.s === 'bite') { sc.fishPhase = 'bite'; p.setFishing(true, sc.bobber ?? undefined, true); sfx('bite'); sc.hud.banner('🎣 咬钩了！', `${m.sonar === undefined ? '' : m.sonar === '?' ? '声呐：一条没见过的鱼　' : `声呐：${fishDef(m.sonar)?.name ?? '？'}　`}快按 E 提竿（${(FISHING.REEL_WINDOW_MS / 1000).toFixed(1)} 秒内）`); return; }
  if (m.s === 'fight' && m.seed !== undefined && m.diff !== undefined) {
    sc.fishPhase = 'fight'; p.setFishing(true, sc.bobber ?? undefined, true); sfx('reel');
    sc.fightUi.start({ seed: m.seed, diff: m.diff, move: m.move ?? 'mixed', bar: m.bar, sink: m.sink, cling: m.cling, drop: m.drop, burst: m.burst }, (win, perfect) => { sc.net.fishEnd(win, perfect); sfx(win ? 'reel' : 'fail'); }, !!m.crown);
    return;
  }
  const bobber = sc.bobber;
  sc.fightUi.close(); stopFishing(sc);
  if (m.s === 'catch') sc.catchUntil = sc.time.now + 1400; // 鱼飞出水面 + 卡片弹出之前，也算钓鱼流程
  if (m.s === 'catch' && m.id) {
    const d = fishDef(m.id), name = d?.name ?? '东西', kg = m.kg ?? 0;
    playCatch(sc, m.id, bobber, d?.rarity ?? 'common', !!m.junk, () => sc.fishCard.show({ id: m.id!, cm: m.cm ?? 0, kg, isNew: m.isNew, record: m.record, junk: m.junk, perfect: m.perfect, msg: m.msg, twin: m.twin, box: m.box, pearl: m.pearl, first: m.first, xp: m.xp, lv: m.lv }));
    if (m.junk) { sfx('splash'); sc.net.system(`🎣 钓上来一个${name}……`); }
    else {
      sfx(d?.rarity === 'legendary' || d?.rarity === 'epic' || d?.rarity === 'mythic' ? 'achieve' : 'catch');
      const tier = d ? sizeTier(d, m.cm ?? 0).name : '';
      const tags = [tier, m.perfect ? '完美拉鱼' : '', m.twin ? '双钓！' : '', m.isNew ? '图鉴新种类！' : '', m.record ? '新纪录！' : '', m.box ? `顺带钓到一个${itemDef(m.box)?.name ?? '盲盒'}` : ''].filter(Boolean).join(' ');
      sc.net.system(`🎣 钓到一条${name}（${m.cm} cm${kg ? ` · ${fmtKg(kg)}` : ''}）${tags ? ` · ${tags}` : ''}`);
    }
  } else if (m.msg) { sfx(m.s === 'miss' ? 'fail' : 'lock'); sc.hud.banner('🎣 钓鱼', m.msg); }
}

/** 钓到了：水花 + 鱼从浮漂处划着弧线飞到头顶、转着圈放大，停一下再淡出；飞完才弹出卡片（传说/史诗多一圈金光） */
export function playCatch(sc: WorldScene, id: string, from: { x: number; y: number } | null, rarity: string, junk: boolean, done: () => void) {
  const frame = `item_${id}`, P = sc.player, start = from ?? { x: P.x, y: P.y - 30 };
  if (!sc.textures.get('items').has(frame)) { done(); return; }
  const big = rarity === 'legendary' || rarity === 'epic' || rarity === 'mythic';
  const depth = 900000, tint = big ? 0xffe27a : 0xbfe4ff;
  // 水花：一圈涟漪 + 向上溅起的水滴
  const ring = sc.add.graphics().setDepth(depth);
  const rg = { r: 3, a: 0.9 };
  sc.tweens.add({ targets: rg, r: big ? 26 : 16, a: 0, duration: 520, ease: 'Quad.easeOut', onUpdate: () => { ring.clear(); ring.lineStyle(2, big ? 0xffe27a : 0xffffff, rg.a).strokeEllipse(start.x, start.y, rg.r * 2, rg.r); }, onComplete: () => ring.destroy() });
  const n = big ? 16 : 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.0, v = 22 + Math.random() * 30;
    const dr = sc.add.image(start.x, start.y, 'puff').setTint(tint).setDepth(depth).setScale(0.35 + Math.random() * 0.3);
    sc.tweens.add({ targets: dr, x: start.x + Math.cos(a) * v, y: start.y + Math.sin(a) * v + 14, alpha: 0, duration: 520 + Math.random() * 240, ease: 'Quad.easeOut', onComplete: () => dr.destroy() });
  }
  // 鱼：从水里弹出，划弧飞向头顶
  const img = sc.add.image(start.x, start.y, 'items', frame).setDepth(depth + 1).setScale(1.2).setAlpha(0.2);
  const k = { t: 0 }, tx = P.x, ty = P.y - 48;
  sc.tweens.add({ targets: k, t: 1, duration: 640, ease: 'Sine.easeInOut',
    onUpdate: () => {
      const t = k.t;
      img.setPosition(start.x + (tx - start.x) * t, start.y + (ty - start.y) * t - Math.sin(Math.PI * t) * 38)
        .setRotation(t * Math.PI * (junk ? 2 : 3)).setScale(1.2 + 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.1))).setAlpha(Math.min(1, 0.2 + t * 3));
    },
    onComplete: () => {
      img.setRotation(0).setScale(2.4);
      if (big) for (let i = 0; i < 10; i++) { // 举在头顶时迸出金色小光点
        const a = (i / 10) * Math.PI * 2, sp = sc.add.image(img.x, img.y, 'puff').setTint(0xffd35a).setDepth(depth).setScale(0.5);
        sc.tweens.add({ targets: sp, x: img.x + Math.cos(a) * 26, y: img.y + Math.sin(a) * 20, alpha: 0, duration: 520, onComplete: () => sp.destroy() });
      }
      done();
      sc.tweens.add({ targets: img, scale: 3, duration: 200, yoyo: true, onComplete: () => sc.tweens.add({ targets: img, alpha: 0, y: img.y - 12, duration: 420, delay: 500, onComplete: () => img.destroy() }) });
    } });
}

export function stopFishing(sc: WorldScene) { sc.fishPhase = 'idle'; sc.player.setFishing(false); }

export function fishLockState(sc: WorldScene): FishLockState {
  return { phase: sc.fishPhase, cardOpen: sc.fishCard?.isOpen ?? false, catching: sc.time.now < sc.catchUntil };
}

/** 钓鱼中按了会打断画面的键 / 点了入口：提示一句（别刷屏） */
export function fishBlocked(sc: WorldScene) { if (sc.time.now - sc.fishBlockAt < 1500) return; sc.fishBlockAt = sc.time.now; sc.hud.banner('🎣 钓鱼中', FISHING_BLOCK_MSG); }
