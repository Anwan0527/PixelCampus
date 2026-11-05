/**
 * 翻垃圾桶（客户端与服务器共用）。
 * 站在校园里的垃圾桶旁按 E 翻一翻：绝大多数时候翻出一件没用的垃圾（商店收购价 1 校园币），
 * 1% 的概率摸出一件"好东西"（被误扔的 U 盘，商店收购价 999 校园币）。
 * 概率、每日次数、冷却都在这里；翻出什么由服务器抽，客户端只显示。设计见 docs/ECONOMY.md「翻垃圾桶」。
 */

/** 摸出好东西的概率 */
export const TRASH_TREASURE_P = 0.01;
/** 好东西的物品 id 和商店收购价 */
export const TREASURE_ID = 'bin_usb';
export const TREASURE_PRICE = 999;
/** 垃圾的商店收购价 */
export const TRASH_PRICE = 1;

/** 每人每天（北京时间）最多翻多少次：期望每次约 11 校园币，不设上限会比钓鱼赚得还快 */
export const TRASH_DAILY_MAX = 20;
/** 同一个垃圾桶，同一个人翻过之后要隔多久才能再翻（毫秒） */
export const BIN_COOLDOWN_MS = 5 * 60 * 1000;
/** 两次翻找之间至少隔多久（毫秒）；客户端的翻找动画比这短 */
export const SEARCH_GAP_MS = 1800;
/** 站得离垃圾桶多近才能翻（像素；垃圾桶的锚点是它的脚点） */
export const BIN_REACH = 34;

/** 没用的垃圾：[物品 id, 权重]。junk_can / junk_bottle 是钓鱼也会钓到的老杂物，同价 */
export const TRASH_JUNK: readonly (readonly [string, number])[] = [
  ['trash_paper', 28], ['trash_cup', 22], ['trash_wrapper', 22], ['trash_chopsticks', 12], ['trash_peel', 10], ['junk_can', 8], ['junk_bottle', 8],
];
/** 翻垃圾桶新增的物品（不含 junk_can / junk_bottle） */
export const TRASH_ONLY: readonly string[] = ['trash_paper', 'trash_cup', 'trash_wrapper', 'trash_chopsticks', 'trash_peel'];

/** 商店收购的"翻出来的东西"：垃圾 1 币，好东西 999 币；不是返回 0 */
export function trashPrice(id: string): number {
  if (id === TREASURE_ID) return TREASURE_PRICE;
  return TRASH_ONLY.includes(id) ? TRASH_PRICE : 0;
}
export const isTrashItem = (id: string) => trashPrice(id) > 0;

/** 抽一次：rnd() ∈ [0,1)。先决定是不是好东西，再按权重挑垃圾 */
export function rollTrash(rnd: () => number): { id: string; treasure: boolean } {
  if (rnd() < TRASH_TREASURE_P) return { id: TREASURE_ID, treasure: true };
  const total = TRASH_JUNK.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [id, w] of TRASH_JUNK) { r -= w; if (r < 0) return { id, treasure: false }; }
  return { id: TRASH_JUNK[0][0], treasure: false };
}

/** 垃圾桶的位置（像素，脚点）里离 (x,y) 最近、且在 reach 内的那个的编号；没有返回 -1 */
export function nearestBin(bins: readonly { x: number; y: number }[], x: number, y: number, reach = BIN_REACH): number {
  let best = -1, bd = reach;
  bins.forEach((b, i) => { const d = Math.hypot(b.x - x, b.y - y); if (d <= bd) { bd = d; best = i; } });
  return best;
}
