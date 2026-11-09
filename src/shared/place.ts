/**
 * 地点留言板（客户端与服务器共用）：每栋建筑、每个地标都有一块留言板，站在附近才能看、能写；
 * 留言可以带一张图，其他人可以点赞、评论；管理员有一个总览，一次看到所有地点的留言和图片。
 *
 * 地点 = 世界里有名字的建筑（同名的几个楼翼算一个地点，key = `b:建筑名`）+ 有名字的地标（key = `p:地标id`，出生点除外）。
 * 位置判定在这里（纯函数）：客户端用它决定要不要显示「留言板」入口，服务器用同一个函数校验"你真的在这个地点附近"。
 *
 * 图片：客户端压缩成 WebP（不支持就 JPEG）——大图最长边 PLACE_IMG.FULL_EDGE、缩略图最长边 THUMB_EDGE，一次 POST 上传
 * （`[4 字节大端：缩略图长度][缩略图][大图]`，见 packPlaceImg）；上传前先在 WebSocket 里要一张一次性上传券（place_up → place_up_ticket）。
 * 服务器按魔数检查格式、按字节数检查大小，原样落盘（`<id>.<ext>` 大图、`<id>t.<ext>` 缩略图），不做转码。
 */
import { cleanText } from './profile';
import { wallHotScore } from './wall';

// ------------------------------------------------------------ 限制
export const PLACE_TEXT_MAX = 120;            // 一条留言最多字数
export const PLACE_COMMENT_MAX = 80;          // 一条评论最多字数
export const PLACE_POST_COOLDOWN_MS = 20_000; // 同一个人两条留言的最短间隔
export const PLACE_POST_DAILY = 12;           // 同一个人 24 小时内最多几条留言
export const PLACE_IMG_DAILY = 3;             // 同一个人 24 小时内最多传几张图
export const PLACE_COMMENT_COOLDOWN_MS = 5_000;
export const PLACE_COMMENT_DAILY = 80;
export const PLACE_DAY_CAP = 600;             // 全服每天最多收多少条留言（防刷）
export const PLACE_IMG_DAY_CAP = 300;         // 全服每天最多收多少张图
export const PLACE_PAGE = 10;                 // 一页留言数（每条可能带一张缩略图，所以页不大）
export const PLACE_THREAD_MAX = 100;          // 一条留言下最多显示的评论数
export const PLACE_REPORT_HIDE = 3;           // 被这么多人举报，普通玩家就看不到了（等管理员处理）
/** 带图的留言是不是要管理员先审核才对别人可见（作者自己和管理员马上能看到）；文字留言不审核，直接发布 */
export const PLACE_IMG_PRE_REVIEW = true;
/** 站在建筑多远以内算"在这个地点"（格）；地标没写半径时的默认半径（格） */
export const PLACE_REACH_TILES = 3;
export const PLACE_POI_R = 6;

export const PLACE_IMG = {
  /** 大图 / 缩略图 最长边（像素）、最大字节数（服务器硬上限；客户端压到更小） */
  FULL_EDGE: 960, THUMB_EDGE: 240, FULL_MAX: 120 * 1024, THUMB_MAX: 24 * 1024,
  /** 一次上传 POST 的最大字节数（大图 + 缩略图 + 4 字节头） */
  BODY_MAX: 120 * 1024 + 24 * 1024 + 4,
  /** 上传券有效期（毫秒）、同时在传的最多几张 */
  TICKET_MS: 60_000, CONCURRENT: 3,
  /** 图片存储总上限（字节）：超过就不再收新图，等管理员清理 */
  TOTAL_MAX: 2 * 1024 * 1024 * 1024,
} as const;

// ------------------------------------------------------------ 地点
export interface PlaceDef {
  key: string; name: string; kind: 'building' | 'poi';
  /** 建筑：每个楼翼的包围盒（格坐标，已按 PLACE_REACH_TILES 外扩） */ rects?: { x: number; y: number; w: number; h: number }[];
  /** 地标：圆心（格坐标）和半径（格） */ circle?: { x: number; y: number; r: number };
}
type BuildingLike = { name?: string; bbox: { x: number; y: number; w: number; h: number } };
type PoiLike = { id: string; name?: string; kind?: string; x: number; y: number; r?: number };

/** 世界里的全部地点（顺序：先建筑后地标；同名建筑合并成一个地点） */
export function buildPlaces(buildings: readonly BuildingLike[], pois: readonly PoiLike[]): PlaceDef[] {
  const out: PlaceDef[] = [], byName = new Map<string, PlaceDef>(), E = PLACE_REACH_TILES;
  for (const b of buildings) {
    const name = typeof b.name === 'string' ? b.name.trim() : ''; if (!name) continue;
    const rc = { x: b.bbox.x - E, y: b.bbox.y - E, w: b.bbox.w + 2 * E, h: b.bbox.h + 2 * E };
    const have = byName.get(name);
    if (have) have.rects!.push(rc); else { const d: PlaceDef = { key: `b:${name}`, name, kind: 'building', rects: [rc] }; byName.set(name, d); out.push(d); }
  }
  for (const p of pois) {
    const name = typeof p.name === 'string' ? p.name.trim() : ''; if (!name || p.kind === 'spawn' || !p.id) continue;
    out.push({ key: `p:${p.id}`, name, kind: 'poi', circle: { x: p.x, y: p.y, r: Number.isFinite(p.r) && (p.r as number) > 0 ? (p.r as number) : PLACE_POI_R } });
  }
  return out;
}
/** 格坐标 (tx, ty) 在不在这个地点附近 */
export function inPlace(d: PlaceDef, tx: number, ty: number): boolean {
  if (d.rects) return d.rects.some((r) => tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h);
  const c = d.circle; return !!c && Math.hypot(tx - c.x, ty - c.y) <= c.r;
}
/** 玩家（格坐标）现在在哪个地点：建筑优先（离包围盒中心最近的那个），其次地标（离圆心最近的）；都不在返回 null */
export function placeAt(places: readonly PlaceDef[], tx: number, ty: number): PlaceDef | null {
  let best: PlaceDef | null = null, bd = Infinity;
  for (const kind of ['building', 'poi'] as const) {
    for (const d of places) {
      if (d.kind !== kind || !inPlace(d, tx, ty)) continue;
      const dist = d.rects ? Math.min(...d.rects.map((r) => Math.hypot(tx - (r.x + r.w / 2), ty - (r.y + r.h / 2)))) : Math.hypot(tx - d.circle!.x, ty - d.circle!.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (best) return best;
  }
  return null;
}
export const placeByKey = (places: readonly PlaceDef[], key: unknown): PlaceDef | undefined => (typeof key === 'string' ? places.find((d) => d.key === key) : undefined);

// ------------------------------------------------------------ 内容
export const cleanPlaceText = (s: unknown, max: number) => cleanText(s, max);
export const placeHot = wallHotScore;

/** 一条留言（发给玩家的样子）。admin 字段只发给管理员 */
export interface PlacePost {
  id: number; /** 地点 key */ key: string; name: string; hue: number; text: string; ts: number;
  /** 图片：`<24 位十六进制>.<webp|jpg>`；缩略图地址见 placeThumbName */ img?: string;
  likes: number; liked: boolean; comments: number; mine: boolean;
  /** 带图、还在等管理员审核：只有作者本人和管理员看得到 */ pending?: boolean;
  /** 被举报多次、暂时折叠（管理员和作者本人才看得到内容） */ hidden?: boolean;
  /** 只发给管理员：地点名、作者身份标识、真名、校园号、被举报次数 */ place?: string; by?: string; real?: string; uid?: number; reports?: number;
}
export interface PlaceComment { id: number; post: number; name: string; hue: number; /** 是不是留言的作者 */ op: boolean; text: string; ts: number; mine: boolean; by?: string; real?: string; uid?: number }

// ------------------------------------------------------------ 图片格式
export type ImgExt = 'webp' | 'jpg';
/** 按魔数判断图片格式（RIFF....WEBP / FFD8FF）；不是支持的格式返回 null */
export function sniffImg(b: Uint8Array): ImgExt | null {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}
const IMG_RE = /^([0-9a-f]{24})\.(webp|jpg)$/;
export const isPlaceImg = (s: unknown): s is string => typeof s === 'string' && IMG_RE.test(s);
/** 大图文件名 = img；缩略图文件名 = `<id>t.<ext>` */
export const placeThumbName = (img: string): string => img.replace(IMG_RE, '$1t.$2');
export const placeImgExt = (img: string): ImgExt | null => IMG_RE.exec(img)?.[2] as ImgExt | undefined ?? null;

/** 上传包：`[4 字节大端：缩略图长度][缩略图][大图]` */
export function packPlaceImg(thumb: Uint8Array, full: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + thumb.length + full.length);
  new DataView(out.buffer).setUint32(0, thumb.length, false); out.set(thumb, 4); out.set(full, 4 + thumb.length);
  return out;
}
/** 拆上传包并校验格式、大小；大图和缩略图必须是同一种格式；不合格返回错误提示 */
export function unpackPlaceImg(buf: Uint8Array): { thumb: Uint8Array; full: Uint8Array; ext: ImgExt } | string {
  if (buf.length < 4 + 12 + 12) return '图片不完整';
  if (buf.length > PLACE_IMG.BODY_MAX) return '图片太大了';
  const tl = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
  if (tl < 12 || tl > PLACE_IMG.THUMB_MAX || 4 + tl >= buf.length) return '缩略图不对';
  const thumb = buf.subarray(4, 4 + tl), full = buf.subarray(4 + tl);
  if (full.length > PLACE_IMG.FULL_MAX) return '图片太大了';
  const a = sniffImg(thumb), b = sniffImg(full);
  if (!a || !b || a !== b) return '只支持 WebP 或 JPEG 图片';
  return { thumb, full, ext: a };
}
