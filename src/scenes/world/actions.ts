/** 玩家自己的小动作：声音、坐下 / 起身、表情、手持物、拍照。 */
import { savePhoto } from '@/ui/PhotoMode';
import { emoteBlocked, emoteDef } from '@/shared/emotes';
import { type Seat } from '@/shared/seats';
import { audio } from '@/audio/engine';
import { music } from '@/audio/music';
import { sfx } from '@/audio/sfx';
import { ambient } from '@/audio/ambient';
import { HELD_MAX, heldDef } from '@/shared/held';
import type { WorldScene } from '../WorldScene';

/** 声音：第一次点击/按键唤醒音频，之后背景音乐随昼夜切换，按钮有点击声，走路有轻轻的脚步声 */
export function setupAudio(sc: WorldScene) {
  const wake = () => { audio.unlock(); music.start(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, wake, { passive: true });
  document.getElementById('hud')?.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) sfx('click'); });
}

export function updateAudio(sc: WorldScene, dt: number) {
  sc.moodT -= dt;
  if (sc.moodT <= 0) { sc.moodT = 1; music.setMood(sc.clock.nightness > 0.5 ? 'night' : 'day'); ambient.set(sc.weather.rain, sc.weather.snow); }
  const p = sc.player;
  if (p.moving && !p.riding && !p.sitting) { sc.stepT -= dt; if (sc.stepT <= 0) { sc.stepT = sc.runNow ? 0.23 : 0.36; sfx('step'); } } else sc.stepT = 0;
}

/** 坐下：把人放到座位上（服务器会再核对一次位置） */
export function sitDown(sc: WorldScene, seat: Seat) {
  sc.player.x = seat.x; sc.player.y = seat.y; sc.player.halt();
  sc.player.setSitting(true, { bx: seat.bx, by: seat.by });
  sc.net.sit(true); sfx('sit');
  sc.lastSent = { x: -1, y: -1, flags: -1 };
}

export function standUp(sc: WorldScene) {
  sc.player.setSitting(false); sc.net.sit(false); sfx('stand');
  sc.lastSent = { x: -1, y: -1, flags: -1 };
}

export function doEmote(sc: WorldScene, id: number) {
  const d = emoteDef(id); if (!d) return;
  const why = emoteBlocked(d, { riding: sc.player.riding, sitting: sc.player.sitting, pax: sc.player.pax, fishing: sc.player.fishing, led: sc.player.led });
  if (why) { sc.hud.banner('表情', why); return; }
  if (sc.net.status === 'online') sc.net.emote(id); else if (d.hold && sc.player.holdingEmote === id) sc.player.endPose(); else { sc.player.emote(d); sfx('emote'); } // 联机时由服务器回传（带限频），离线直接演
}

export function cycleHeld(sc: WorldScene) {
  sc.heldId = (sc.heldId + 1) % (HELD_MAX + 1);
  sc.player.setHeld(sc.heldId);
  if (sc.net.status === 'online') sc.net.held(sc.heldId);
  const d = heldDef(sc.heldId);
  sc.hud.banner(d ? `${d.icon} 手里拿着：${d.name}` : '🖐 放下了手里的东西', '再按 V 换下一样');
}

/** 拍照模式里：方向键/摇杆平移镜头（速度随缩放调整，画面上看起来速度一致） */
export function photoPan(sc: WorldScene, dt: number, joy?: { x: number; y: number }) {
  const k = sc.keys, c = sc.cameras.main;
  const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
  const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
  const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0);
  const sp = (k.shift.isDown ? 420 : 210) / c.zoom * dt;
  c.scrollX += ix * sp; c.scrollY += iy * sp;
}

/** 截下当前画面，加水印后保存成 PNG */
export function takePhoto(sc: WorldScene) {
  sc.net.achEvent('photo'); sfx('shutter');
  sc.game.renderer.snapshot((img) => { if (img instanceof HTMLImageElement) savePhoto(img, sc.profileUi.profile.name, sc.lastPlace); }, 'image/png');
}
