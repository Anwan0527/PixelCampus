/**
 * 像素字体按字切片（见 tools/assets/font-slices.py，@font-face 在 src/ui/fonts.css）：
 * 浏览器渲染时只下载"该字实际落在的那一片"，但 document.fonts.load(font, text) 不认"后声明的优先"，
 * c 片范围较粗、和 a/b 重叠，用它会把 450 KB 的 c 片一起下载。所以这里自己找出每个字生效的那一片（后声明的优先，和渲染规则一致），只加载它们。
 * DOM 文字浏览器会自己等字体到位后重排；Phaser 的 Text 画好就固化成备用字体，所以玩家写的字要等切片下完再让它重画一次。
 */
type Slice = { face: FontFace; ranges: [number, number][] };
let slices: Slice[] | null = null;
const known = new Set<number>();   // 已确认字体就绪的字

function parseRanges(u: string): [number, number][] {
  return u.split(',').map((r) => { const [a, b] = r.trim().replace(/^U\+/i, '').split('-'); return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number]; }).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}
function list(): Slice[] {
  if (!slices) slices = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'ArkPixel').map((face) => ({ face, ranges: parseRanges(face.unicodeRange) }));
  return slices;
}
/** text 里每个字实际生效的字体片里，还没加载好的那些 */
function pending(text: string): FontFace[] {
  const fs = list(), out = new Set<FontFace>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (known.has(cp)) continue;
    let hit: Slice | undefined;
    for (let i = fs.length - 1; i >= 0; i--) if (fs[i].ranges.some(([a, b]) => cp >= a && cp <= b)) { hit = fs[i]; break; }   // 后声明的优先
    if (!hit) { known.add(cp); continue; }                       // 没有任何片管它（emoji 等）：走备用字体，不下载
    if (hit.face.status === 'loaded') known.add(cp); else out.add(hit.face);
  }
  return [...out];
}
/** 把 text 用到的字体片加载好（BootScene 启动时用，保证世界里的文字牌一次画对） */
export function loadGlyphs(text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all(pending(text).map((f) => f.load())).then(() => undefined);
}
/** 玩家写的字可能在还没下载的切片里：等它们到位后让 Phaser 文字重画（纯 ASCII 或已就绪时什么都不做） */
export function redrawWhenGlyphsReady(text: string, redraw: () => void): void {
  if (typeof document === 'undefined' || !document.fonts || !text || /^[\x00-\x7f]*$/.test(text)) return;
  const need = pending(text);
  if (!need.length) return;
  Promise.all(need.map((f) => f.load())).then(() => redraw(), () => { /* 加载失败就继续用备用字体 */ });
}
