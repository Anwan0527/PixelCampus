import type Phaser from 'phaser';
import { appKey, type Appearance } from '@/shared/appearance';
import { appToLook, renderPortrait } from '@/art/char-rig';

/** 把人物图集里的一帧画到 DOM canvas（创建界面、学生证照片、左上角头像）。不做平滑，保持像素风。 */
export function drawLook(
  canvas: HTMLCanvasElement, textures: Phaser.Textures.TextureManager, look: number,
  opts: { frame?: string; scale?: number; crop?: { x: number; y: number; w: number; h: number } } = {},
) {
  const tex = textures.get('chars');
  const fr = tex.get(`c${look}_${opts.frame ?? 'down_0'}`);
  const src = tex.getSourceImage() as CanvasImageSource;
  const sc = opts.scale ?? 3;
  const c = opts.crop ?? { x: 0, y: 0, w: fr.cutWidth, h: fr.cutHeight };
  canvas.width = c.w * sc; canvas.height = c.h * sc;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, fr.cutX + c.x, fr.cutY + c.y, c.w, c.h, 0, 0, c.w * sc, c.h * sc);
}

/** 头像裁切（地图小人帧 26×46）：身体左缘在 x=5，头顶含丸子头约在 y=6，下巴约在 y=24 */
export const HEAD_CROP = { x: 5, y: 6, w: 16, h: 19 };
/** 全身像裁切：去掉四周留白，只留人物（创建角色里的造型按钮） */
export const LOOK_CROP = { x: 3, y: 5, w: 20, h: 39 };

/**
 * 证件照：2 倍分辨率的半身像（40×58，透明底），由 tools/art 的 renderPortrait 生成。
 * expr：neutral 标准脸 / smile 微笑。地图上的小人仍是 1 倍，这里才是"高清"。
 */
export function drawPortrait(
  canvas: HTMLCanvasElement, textures: Phaser.Textures.TextureManager, look: number,
  opts: { expr?: 'neutral' | 'smile'; scale?: number; crop?: { x: number; y: number; w: number; h: number }; /** 自定义外观：有就现场画，没有就用预置造型的证件照图集 */ app?: Appearance } = {},
) {
  if (opts.app) { drawAppPortrait(canvas, opts.app, opts); return; }
  const tex = textures.get('portraits'), fr = tex.get(`p${look}_${opts.expr ?? 'neutral'}`);
  const src = tex.getSourceImage() as CanvasImageSource, sc = opts.scale ?? 2;
  const c = opts.crop ?? { x: 0, y: 0, w: fr.cutWidth, h: fr.cutHeight };
  canvas.width = c.w * sc; canvas.height = c.h * sc;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, fr.cutX + c.x, fr.cutY + c.y, c.w, c.h, 0, 0, c.w * sc, c.h * sc);
}
/** 自定义外观的证件照：现场用 Rig 画（40×58，几毫秒），按 外观+表情 缓存最近 64 张 */
const portraitCache = new Map<string, HTMLCanvasElement>();
function appPortraitSource(app: Appearance, expr: 'neutral' | 'smile'): HTMLCanvasElement {
  const key = `${appKey(app)}_${expr}`, hit = portraitCache.get(key);
  if (hit) { portraitCache.delete(key); portraitCache.set(key, hit); return hit; }
  const img = renderPortrait(appToLook(app), { bg: null, expr }), c = document.createElement('canvas');
  c.width = img.w; c.height = img.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  portraitCache.set(key, c);
  if (portraitCache.size > 64) portraitCache.delete(portraitCache.keys().next().value as string);
  return c;
}
export function drawAppPortrait(canvas: HTMLCanvasElement, app: Appearance, opts: { expr?: 'neutral' | 'smile'; scale?: number; crop?: { x: number; y: number; w: number; h: number } } = {}) {
  const src = appPortraitSource(app, opts.expr ?? 'neutral'), sc = opts.scale ?? 2, c = opts.crop ?? { x: 0, y: 0, w: src.width, h: src.height };
  canvas.width = c.w * sc; canvas.height = c.h * sc;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, c.w * sc, c.h * sc);
}
/** 小头像（好友列表、左上角信息）：只取证件照里的头部 */
export const PORTRAIT_HEAD = { x: 5, y: 7, w: 30, h: 30 };

/** 把任意图集里的一帧画到 DOM canvas（背包物品图标等）；不做平滑，保持像素风 */
export function drawFrame(canvas: HTMLCanvasElement, textures: Phaser.Textures.TextureManager, atlas: string, frame: string, scale = 3) {
  const tex = textures.get(atlas), fr = tex.get(frame);
  const src = tex.getSourceImage() as CanvasImageSource;
  canvas.width = fr.cutWidth * scale; canvas.height = fr.cutHeight * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, canvas.width, canvas.height);
}
export const drawItem = (canvas: HTMLCanvasElement, textures: Phaser.Textures.TextureManager, id: string, scale = 3) => drawFrame(canvas, textures, 'items', `item_${id}`, scale);
