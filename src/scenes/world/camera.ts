/** 镜头缩放：按屏幕宽度自动挑档位，用户 +/- 在此基础上调整。 */
import Phaser from 'phaser';
import { TILE, ZOOMS } from '@/core/const';
import type { WorldScene } from '../WorldScene';

/** 默认档位：让横向大约看到 26~30 格；用户用 +/- 在此基础上调整 */
export function autoZoomIndex(sc: WorldScene) {
  const target = sc.scale.width / (28 * TILE);
  let best = 0;
  ZOOMS.forEach((z, i) => { if (Math.abs(z - target) < Math.abs(ZOOMS[best] - target)) best = i; });
  return best;
}

export function applyZoom(sc: WorldScene) {
  sc.zoomIndex = Phaser.Math.Clamp(autoZoomIndex(sc) + sc.userZoomOffset, 0, ZOOMS.length - 1);
  sc.cameras.main.setZoom(ZOOMS[sc.zoomIndex]);
}

export function changeZoom(sc: WorldScene, d: number) {
  const n = Phaser.Math.Clamp(sc.zoomIndex + d, 0, ZOOMS.length - 1);
  if (n !== sc.zoomIndex) { sc.userZoomOffset += d; applyZoom(sc); }
}
