/** 货架式图集打包：把若干 Img 排进 ≤maxW 宽的图集，输出 Phaser JSON-Hash 格式。 */
import { Img } from './px-core.ts';

export interface PackItem { key: string; img: Img }
export interface Atlas { img: Img; json: any; frames: Record<string, { x: number; y: number; w: number; h: number }> }

export function pack(items: PackItem[], maxW = 2048, pad = 2): Atlas {
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
  let x = pad, y = pad, rowH = 0;
  const place: { key: string; img: Img; x: number; y: number }[] = [];
  for (const it of sorted) {
    if (x + it.img.w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
    place.push({ key: it.key, img: it.img, x, y });
    x += it.img.w + pad; rowH = Math.max(rowH, it.img.h);
  }
  const H = y + rowH + pad;
  const atlas = new Img(maxW, H);
  const frames: Atlas['frames'] = {};
  const json: any = { frames: {}, meta: { app: 'pixel-campus', version: '1', size: { w: maxW, h: H }, scale: '1' } };
  for (const p of place) {
    atlas.blit(p.img, p.x, p.y);
    frames[p.key] = { x: p.x, y: p.y, w: p.img.w, h: p.img.h };
    json.frames[p.key] = { frame: { x: p.x, y: p.y, w: p.img.w, h: p.img.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: p.img.w, h: p.img.h }, sourceSize: { w: p.img.w, h: p.img.h } };
  }
  return { img: atlas, json, frames };
}

/** 货架式排版算出来的图集高度（不真正拼图，只为分页时估高） */
function shelfHeight(items: PackItem[], maxW: number, pad: number): number {
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
  let x = pad, y = pad, rowH = 0;
  for (const it of sorted) {
    if (x + it.img.w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
    x += it.img.w + pad; rowH = Math.max(rowH, it.img.h);
  }
  return y + rowH + pad;
}

/**
 * 按给定顺序分页（items 已按"先要用到的在前"排好，如离出生点由近到远）：每页高度 ≤ maxH，页内再按高度排版。
 * 比 packPages 页数多、每页小，客户端可以只下载附近要用的页（建筑图集按需加载）。单个精灵比 maxH 还高时独占一页。
 */
export function packPagesOrdered(items: PackItem[], maxW = 2048, maxH = 1024, pad = 2): (Atlas & { pageOf: Record<string, number> })[] {
  const groups: PackItem[][] = [];
  let cur: PackItem[] = [];
  for (const it of items) {
    if (cur.length && shelfHeight([...cur, it], maxW, pad) > maxH) { groups.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) groups.push(cur);
  return groups.map((pg, i) => { const a = pack(pg, maxW, pad); return { ...a, pageOf: Object.fromEntries(pg.map((p) => [p.key, i])) }; });
}

/** 多页图集：每页高度 ≤ maxH（避免超出低端 GPU 的纹理上限）。返回各页，frames 带页号。 */
export function packPages(items: PackItem[], maxW = 2048, maxH = 4096, pad = 2): (Atlas & { pageOf: Record<string, number> })[] {
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
  const pages: PackItem[][] = [[]];
  let x = pad, y = pad, rowH = 0;
  for (const it of sorted) {
    if (x + it.img.w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
    if (y + it.img.h + pad > maxH && pages.at(-1)!.length) { pages.push([]); x = pad; y = pad; rowH = 0; }
    pages.at(-1)!.push(it);
    x += it.img.w + pad; rowH = Math.max(rowH, it.img.h);
  }
  return pages.map((pg, i) => { const a = pack(pg, maxW, pad); return { ...a, pageOf: Object.fromEntries(pg.map((p) => [p.key, i])) }; });
}
