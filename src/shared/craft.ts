/**
 * 合成（客户端与服务器共用）：把没用的杂物和小鱼变成饵，把龙鳞和珍珠变成神话饵、龙骨竿。
 * 在校园商店旁的「合成」页里做；材料够不够、扣料、发物都由服务器执行（applyCraft 是纯函数，原地修改背包）。
 */
import { LAKE_FISH, fishDef } from './fishing';
import { invAdd, invCount, invTake, itemDef, type Gain, type Inv } from './items';

/** 杂物（钓上来的 + 垃圾桶里翻出来的）、可以拆成饵的小鱼、"稀有鱼"（神话饵的辅料）的范围 */
export const JUNK_GROUP: readonly string[] = ['junk_weed', 'junk_can', 'junk_bottle', 'junk_boot', 'trash_paper', 'trash_cup', 'trash_wrapper', 'trash_chopsticks', 'trash_peel'];
export const SMALL_GROUP: readonly string[] = ['fish_gudgeon', 'fish_bitterling', 'fish_whitebait', 'fish_shrimp'];
export const RARE_GROUP: readonly string[] = LAKE_FISH.filter((f) => f.rarity === 'rare').map((f) => f.id);
/** 指名饵：用 3 条同种鱼合成，这种鱼必须是湖里的常见 / 少见 / 稀有 */
export const isNamedFish = (id: unknown): boolean => { const d = fishDef(id); return !!d && d.source !== 'box' && (d.rarity === 'common' || d.rarity === 'uncommon' || d.rarity === 'rare'); };

export type CraftNeed = { id: string; n: number } | { group: 'junk' | 'small' | 'rare' | 'same'; n: number };
export interface Recipe { id: string; name: string; desc: string; out: Gain; coins: number; needs: readonly CraftNeed[] }
export const RECIPES: readonly Recipe[] = [
  { id: 'junk_bait', name: '杂物换鱼饵', desc: '5 件杂物（钓上来的、垃圾桶里翻出来的都行）+ 1 币 → 1 个鱼饵', out: { id: 'bait', n: 1 }, coins: 1, needs: [{ group: 'junk', n: 5 }] },
  { id: 'small_bait', name: '小鱼做鱼饵', desc: '3 条小鱼（麦穗鱼 / 鳑鲏 / 白条 / 河虾）→ 2 个鱼饵', out: { id: 'bait', n: 2 }, coins: 0, needs: [{ group: 'small', n: 3 }] },
  { id: 'named_bait', name: '指名饵', desc: '3 条同种的鱼（常见 / 少见 / 稀有）→ 1 个指名饵；用的时候在装备栏指定一种图鉴里已有的鱼', out: { id: 'bait_name', n: 1 }, coins: 0, needs: [{ group: 'same', n: 3 }] },
  { id: 'myth_bait', name: '神话饵', desc: '龙鳞 + 珍珠 + 1 条稀有鱼 → 2 个神话饵', out: { id: 'bait_myth', n: 2 }, coins: 0, needs: [{ id: 'dragon_scale', n: 1 }, { id: 'pearl', n: 1 }, { group: 'rare', n: 1 }] },
  { id: 'bone_rod', name: '龙骨竿', desc: '金龙鱼竿 + 4 片龙鳞 + 1500 币 → 龙骨竿（顶级，2 个配件槽）', out: { id: 'rod_bone', n: 1 }, coins: 1500, needs: [{ id: 'rod_golden', n: 1 }, { id: 'dragon_scale', n: 4 }] },
];
export const recipeDef = (id: unknown): Recipe | undefined => RECIPES.find((r) => r.id === id);

/** 这份配方要扣哪些东西；材料不够 / 参数不对 / 背包放不下产出，返回原因字符串 */
export function craftPlan(inv: Inv, r: Recipe, param?: string): Gain[] | string {
  const take: Gain[] = [], used = new Map<string, number>();
  const have = (id: string) => invCount(inv, id) - (used.get(id) ?? 0);
  const use = (id: string, n: number) => { take.push({ id, n }); used.set(id, (used.get(id) ?? 0) + n); };
  for (const need of r.needs) {
    if ('id' in need) { if (have(need.id) < need.n) return `${itemDef(need.id)?.name ?? need.id}不够`; use(need.id, need.n); continue; }
    if (need.group === 'same') {
      if (!isNamedFish(param)) return '先选一种鱼（常见 / 少见 / 稀有）';
      if (have(param!) < need.n) return `${fishDef(param)?.name}不够 ${need.n} 条`;
      use(param!, need.n); continue;
    }
    const list = need.group === 'junk' ? JUNK_GROUP : need.group === 'small' ? SMALL_GROUP : RARE_GROUP;
    let left = need.n;
    for (const id of list) { const k = Math.min(left, have(id)); if (k > 0) { use(id, k); left -= k; } if (left <= 0) break; }
    if (left > 0) return need.group === 'junk' ? `杂物不够（要 ${need.n} 件）` : need.group === 'small' ? `小鱼不够（要 ${need.n} 条）` : '稀有鱼不够（要 1 条）';
  }
  const od = itemDef(r.out.id);
  const tookOut = take.filter((t) => t.id === r.out.id).reduce((a, t) => a + t.n, 0);
  if (!od || invCount(inv, r.out.id) - tookOut + r.out.n > od.stack) return `背包里的${od?.name ?? '东西'}已经放不下了`;
  return take;
}
/** 币够不够 + 材料够不够；返回 null = 可以做 */
export function craftWhy(inv: Inv, coins: number, r: Recipe, param?: string): string | null {
  const plan = craftPlan(inv, r, param);
  if (typeof plan === 'string') return plan;
  return coins < r.coins ? `校园币不够（要 ${r.coins}）` : null;
}
/** 执行合成（原地修改背包；币由调用方扣 r.coins）。成功返回实际扣掉的材料，失败 null（不动任何东西） */
export function applyCraft(inv: Inv, r: Recipe, param?: string): Gain[] | null {
  const plan = craftPlan(inv, r, param);
  if (typeof plan === 'string') return null;
  for (const g of plan) invTake(inv, g.id, g.n);
  invAdd(inv, r.out.id, r.out.n);
  return plan;
}
