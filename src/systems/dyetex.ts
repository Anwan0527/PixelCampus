import type Phaser from 'phaser';
import { dyePixels } from '@/shared/dye';

/**
 * 染色后的家具贴图：从家具图集里取一帧，按 shared/dye.ts 的规则重新着色，每种（帧, 色号）只生成一次并缓存成 canvas / Phaser 贴图。
 * 图集没加载或这一帧不存在返回 null（调用方退回原色）。
 */
const cache = new Map<string, HTMLCanvasElement | null>();
const keyOf = (frame: string, c: number) => `dye:${frame}:${c}`;

export function dyedCanvas(textures: Phaser.Textures.TextureManager, frame: string, c: number): HTMLCanvasElement | null {
  const k = keyOf(frame, c), hit = cache.get(k); if (hit !== undefined) return hit;
  let out: HTMLCanvasElement | null = null;
  try {
    const tex = textures.exists('furniture') ? textures.get('furniture') : null, fr = tex?.get(frame);
    if (tex && fr && fr.cutWidth > 0 && fr.cutHeight > 0) {
      const cv = document.createElement('canvas'); cv.width = fr.cutWidth; cv.height = fr.cutHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tex.getSourceImage() as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
      const img = ctx.getImageData(0, 0, cv.width, cv.height); dyePixels(img.data, c); ctx.putImageData(img, 0, 0); out = cv;
    }
  } catch { out = null; /* 画布不可用（隐私模式 / 超大）：不染色 */ }
  if (out) cache.set(k, out); // 失败不缓存（图集可能还没加载好，下次再试）
  return out;
}

/** 染色贴图在 Phaser 里的 key（第一次用时注册）；染不了返回 null */
export function dyedKey(textures: Phaser.Textures.TextureManager, frame: string, c: number): string | null {
  const k = keyOf(frame, c);
  if (textures.exists(k)) return k;
  const cv = dyedCanvas(textures, frame, c); if (!cv) return null;
  textures.addCanvas(k, cv); return k;
}
