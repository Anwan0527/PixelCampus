/**
 * "大概在哪儿"（客户端与服务器共用）：把一个位置说成人话——在哪个地标/建筑里、靠近哪里、相对我在哪个方向多远。
 * 只给大致位置（地标名 + 八方位 + 取整到 50 米的距离），不给精确坐标；玩家也可以选择对好友隐藏位置。
 */
import { TILE } from '../core/const';

export interface WherePoi { id: string; name?: string; kind?: string; x: number; y: number; r?: number }
export interface WhereBuilding { name: string; bbox: { x: number; y: number; w: number; h: number } }
export interface WhereCtx { pois: readonly WherePoi[]; buildings: readonly WhereBuilding[]; /** 世界宽高（格） */ w: number; h: number }

/** 离最近的命名地点多远（格）以内算"附近" */
const NEAR_TILES = 22;

/** 像素坐标 → 地点说明：所在地标/建筑名；不在任何一个里就说"靠近 xx"；都不近就说校园的哪个方位 */
export function whereIs(px: number, py: number, c: WhereCtx): string {
  const tx = px / TILE, ty = py / TILE;
  for (const p of c.pois) if (p.name && p.kind !== 'spawn' && p.r && (p.x - tx) ** 2 + (p.y - ty) ** 2 < p.r * p.r) return p.name;
  for (const b of c.buildings) { const bb = b.bbox; if (tx > bb.x - 2 && tx < bb.x + bb.w + 2 && ty > bb.y - 2 && ty < bb.y + bb.h + 3) return b.name; }
  let best = '', bd = NEAR_TILES;
  const consider = (name: string | undefined, x: number, y: number) => { if (!name) return; const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = name; } };
  for (const p of c.pois) if (p.kind !== 'spawn') consider(p.name, p.x, p.y);
  for (const b of c.buildings) consider(b.name, b.bbox.x + b.bbox.w / 2, b.bbox.y + b.bbox.h / 2);
  if (best) return `${best}附近`;
  const col = tx < c.w / 3 ? '西' : tx > (c.w * 2) / 3 ? '东' : '', row = ty < c.h / 3 ? '北' : ty > (c.h * 2) / 3 ? '南' : '';
  if (row && col) return `校园${col}${row}部`; // 复合方位按习惯说：东北 / 西北 / 东南 / 西南（东西在前）
  return row || col ? `校园${row || col}部` : '校园中部';
}

const DIR8 = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'] as const;
/** 从 (ax,ay) 看 (bx,by)：八方位 + 距离（米，取整到 50）；很近时 near = true */
export function bearing(ax: number, ay: number, bx: number, by: number): { dir: string; m: number; near: boolean } {
  const dx = bx - ax, dy = by - ay, meters = (Math.hypot(dx, dy) / TILE) * 2.5;
  const ang = Math.atan2(dy, dx), i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return { dir: DIR8[i], m: Math.max(50, Math.round(meters / 50) * 50), near: meters < 40 };
}

/** 好友位置：服务器按"我"的视角算好发给我 */
export interface FriendLoc { uid: number; /** 对方选择了隐藏位置 */ hidden?: true; /** 对方在另一个世界里（个人/好友世界）：不给位置，where 就是「在个人世界」之类 */ other?: true; where?: string; dir?: string; m?: number; near?: boolean }
/** 一行文字：「精工湖 · 东北方向约 300 米」 */
export function locText(l: FriendLoc | undefined): string {
  if (!l) return '';
  if (l.hidden) return '位置已隐藏';
  if (l.other) return l.where ?? '在另一个世界';
  if (!l.where) return '';
  return l.near ? `${l.where} · 就在你身边` : `${l.where} · ${l.dir}方向约 ${l.m} 米`;
}
