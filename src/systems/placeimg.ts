/**
 * 地点留言的图片：选图 → 在浏览器里压缩（缩放 + 重编码成 WebP，不支持就 JPEG；重编码会去掉 EXIF 里的拍摄位置等隐私信息）
 * → 打成上传包 → POST 到服务器给的一次性上传地址。服务器不转码，只检查格式和大小（规则见 shared/place.ts）。
 * 纯计算（目标尺寸、质量阶梯、地址拼接）单独导出，方便测试。
 */
import { PLACE_IMG, packPlaceImg, placeThumbName, type ImgExt } from '@/shared/place';

/** 客户端自己的压缩目标（比服务器的硬上限更小，留出余量） */
export const PLACE_TARGET = { full: 100 * 1024, thumb: 20 * 1024 } as const;
/** 质量阶梯：从好到差，直到不超过目标大小 */
export const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5] as const;
/** 质量降到底还太大时，边长再缩到原来的这个比例重试 */
export const SHRINK_STEPS = [1, 0.8, 0.64] as const;
/** 选图的原文件最大字节数（再大的原图不处理，免得手机卡死） */
export const PICK_MAX_BYTES = 30 * 1024 * 1024;

/** 把 w×h 缩到最长边不超过 maxEdge（不放大小图），返回整数边长（至少 1） */
export function fitSize(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const m = Math.max(w, h);
  if (!(m > 0)) return { w: 1, h: 1 };
  if (m <= maxEdge) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  const k = maxEdge / m;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 网页根地址（部署在 /pixel/ 下、开发时是 /），保证以 / 结尾 */
export const baseUrl = (): string => { const b = String(import.meta.env?.BASE_URL ?? '/'); return b.endsWith('/') ? b : `${b}/`; };
/** 大图 / 缩略图的访问地址 */
export const placeImgSrc = (img: string): string => `${baseUrl()}img/${img}`;
export const placeThumbSrc = (img: string): string => `${baseUrl()}img/${placeThumbName(img)}`;
/** 上传地址：服务器给的是相对网页根的地址（如 up/<券>） */
export const uploadUrl = (rel: string, loc: string = typeof location !== 'undefined' ? location.href : 'http://localhost/'): string => new URL(rel, new URL(baseUrl(), loc)).toString();

/** 该选哪个质量：sizes[i] 是质量 QUALITY_STEPS[i] 下编码出来的字节数；返回第一个不超过 limit 的下标，都超了返回 -1 */
export function pickQuality(sizes: readonly number[], limit: number): number {
  for (let i = 0; i < sizes.length; i++) if (sizes[i] <= limit) return i;
  return -1;
}

export interface Packed { body: Uint8Array; ext: ImgExt; /** 缩略图（给选图后的预览用） */ thumb: Blob }

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob((b) => res(b), type, q));

/** 画到画布上并编码：先试 WebP；浏览器给的不是 WebP（老 Safari 会悄悄给 PNG）就换 JPEG。返回 [字节, 格式] */
async function encode(src: CanvasImageSource, w: number, h: number, limit: number, hard: number, mime: { v: 'image/webp' | 'image/jpeg' }): Promise<{ bytes: Uint8Array; blob: Blob; ext: ImgExt } | null> {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); // JPEG 没有透明：透明的地方铺白
  g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
  let last: { bytes: Uint8Array; blob: Blob; ext: ImgExt } | null = null;
  for (const q of QUALITY_STEPS) {
    let b = await toBlob(c, mime.v, q);
    if (b && mime.v === 'image/webp' && b.type !== 'image/webp') { mime.v = 'image/jpeg'; b = await toBlob(c, 'image/jpeg', q); }
    if (!b) return null;
    last = { bytes: new Uint8Array(await b.arrayBuffer()), blob: b, ext: mime.v === 'image/webp' ? 'webp' : 'jpg' };
    if (last.bytes.length <= limit) return last;
  }
  return last && last.bytes.length <= hard ? last : null; // 质量降到底只要不超过服务器硬上限也行
}

/** 读文件、压缩成大图 + 缩略图、打包。失败返回给玩家看的话 */
export async function compressImage(file: File): Promise<Packed | string> {
  if (!file.type.startsWith('image/')) return '请选一张图片';
  if (file.size > PICK_MAX_BYTES) return '图片太大了（原图请控制在 30MB 以内）';
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return '这张图片打不开（换一张试试，支持 JPG / PNG / WebP）'; }
  try {
    const mime: { v: 'image/webp' | 'image/jpeg' } = { v: 'image/webp' };
    let full: Awaited<ReturnType<typeof encode>> = null;
    for (const k of SHRINK_STEPS) {
      const sz = fitSize(bmp.width, bmp.height, Math.round(PLACE_IMG.FULL_EDGE * k));
      full = await encode(bmp, sz.w, sz.h, PLACE_TARGET.full, PLACE_IMG.FULL_MAX, mime);
      if (full && full.bytes.length <= PLACE_TARGET.full) break;
    }
    if (!full) return '图片压缩失败了，换一张试试';
    const ts = fitSize(bmp.width, bmp.height, PLACE_IMG.THUMB_EDGE);
    const thumb = await encode(bmp, ts.w, ts.h, PLACE_TARGET.thumb, PLACE_IMG.THUMB_MAX, mime);
    if (!thumb || thumb.ext !== full.ext) return '图片压缩失败了，换一张试试';
    return { body: packPlaceImg(thumb.bytes, full.bytes), ext: full.ext, thumb: thumb.blob };
  } finally { bmp.close(); }
}

/** 把打好的包 POST 到上传地址；返回服务器给的图片名，或错误提示 */
export async function uploadPacked(rel: string, body: Uint8Array, signal?: AbortSignal): Promise<{ ok: true; img: string } | { ok: false; msg: string }> {
  try {
    const r = await fetch(uploadUrl(rel), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: body as unknown as BodyInit, signal });
    let j: { ok?: boolean; img?: string; msg?: string } = {};
    try { j = await r.json(); } catch { /* 不是 JSON */ }
    if (j.ok && typeof j.img === 'string') return { ok: true, img: j.img };
    return { ok: false, msg: j.msg || (r.status === 413 ? '图片太大了' : r.status === 401 || r.status === 403 ? '上传券失效了，再试一次' : `上传失败（${r.status}）`) };
  } catch (e) { return { ok: false, msg: (e as Error)?.name === 'AbortError' ? '上传超时了，网络有点慢，再试一次' : '上传失败，检查一下网络' }; }
}
