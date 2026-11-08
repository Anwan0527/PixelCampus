import { describe, expect, it } from 'vitest';
import { FISH_GEAR_IDS, SHOP, sellList } from '../src/shared/economy';
import { TRASH_ONLY, TREASURE_ID } from '../src/shared/trash';
import { DECOR } from '../src/shared/decor';
import { QTY_STEPS, SHOP_CHIPS, SELL_CHIPS, buyMax, clampQty, sellGroup, shopChipsFor, shopGroup, shopItemsFor, type ShopTab } from '../src/ui/shopModel';
import { commClaimable } from '../src/ui/commissionsView';

const TABS: ShopTab[] = ['supply', 'gear', 'furn'];

describe('商店分类（补给 / 钓具 / 家具）', () => {
  it('每一件商品都归到唯一的页签 + 一个真实存在的筛选标签，没有"其他"', () => {
    for (const s of SHOP) {
      const g = shopGroup(s.id);
      expect(TABS, s.id).toContain(g.tab);
      expect(SHOP_CHIPS[g.tab], `${s.id} → ${g.chip}`).toContain(g.chip);
      expect(g.chip).not.toBe('其他');
    }
    const seen = TABS.flatMap((t) => shopItemsFor(t, '', false).map((s) => s.id));
    expect(seen.sort()).toEqual(SHOP.map((s) => s.id).sort());       // 不漏、不重
  });
  it('分类符合直觉：猫粮猫条猫窝 → 补给·猫咪，零食包 → 补给·精灵，鱼竿 / 饵 / 配件 → 钓具，染料和宿舍家具 → 家具', () => {
    expect(shopGroup('cat_food')).toEqual({ tab: 'supply', chip: '猫咪' }); expect(shopGroup('cat_bed')).toEqual({ tab: 'supply', chip: '猫咪' }); expect(shopGroup('mon_ball')).toEqual({ tab: 'supply', chip: '精灵' });
    expect(shopGroup('rod_carbon')).toEqual({ tab: 'gear', chip: '鱼竿' }); expect(shopGroup('fishing_rod').chip).toBe('鱼竿'); expect(shopGroup('bait_pro')).toEqual({ tab: 'gear', chip: '鱼饵' }); expect(shopGroup('tk_float')).toEqual({ tab: 'gear', chip: '配件' });
    expect(shopGroup('dye')).toEqual({ tab: 'furn', chip: '染料' });
    const furn = DECOR.filter((d) => d.price > 0);
    expect(furn.length).toBeGreaterThan(10);
    for (const d of furn) expect(shopGroup(d.id).tab, d.id).toBe('furn');
  });
  it('钓具摊只卖钓具（和 FISH_GEAR_IDS 一致）；筛选标签只列真有商品的', () => {
    expect(new Set(shopItemsFor('gear', '', true).map((s) => s.id))).toEqual(new Set(FISH_GEAR_IDS));
    expect(shopItemsFor('supply', '', true)).toEqual([]); expect(shopItemsFor('furn', '', true)).toEqual([]);
    for (const t of TABS) for (const c of shopChipsFor(t, false)) expect(shopItemsFor(t, c, false).length).toBeGreaterThan(0);
    expect(shopChipsFor('gear', true)).toEqual(['鱼竿', '鱼饵', '配件']);
    expect(shopChipsFor('furn', false)).toContain('染料');
  });
});

describe('购买数量', () => {
  const bait = SHOP.find((s) => s.id === 'bait')!, rod = SHOP.find((s) => s.id === 'rod_carbon')!;
  it('一次最多买几份：受校园币、背包上限、每份个数限制；单件有了就不能再买', () => {
    expect(buyMax(bait, 100, 0, 999)).toBe(10);                 // 10 币一份
    expect(buyMax(bait, 100000, 0, 999)).toBe(Math.floor(999 / bait.n));   // 背包放不下 → 按每份 5 个算
    expect(buyMax(bait, 100000, 990, 999)).toBe(1);
    expect(buyMax(bait, 5, 0, 999)).toBe(0);
    expect(buyMax(rod, rod.price, 0, 1)).toBe(1); expect(buyMax(rod, rod.price - 1, 0, 1)).toBe(0); expect(buyMax(rod, 99999, 1, 1)).toBe(0);
  });
  it('数量夹到 1..max；max<1 时是 0；快捷数量是 1 / 5 / 10', () => {
    expect(clampQty(0, 5)).toBe(1); expect(clampQty(9, 5)).toBe(5); expect(clampQty(2.7, 5)).toBe(2); expect(clampQty(NaN, 5)).toBe(1); expect(clampQty(3, 0)).toBe(0);
    expect(QTY_STEPS).toEqual([1, 5, 10]);
  });
});

describe('出售分类', () => {
  it('鱼 / 杂物 / 宝物 / 家具（退货）', () => {
    expect(sellGroup('fish_carp')).toBe('鱼'); expect(sellGroup('junk_boot')).toBe('杂物'); expect(sellGroup('trash_paper')).toBe('杂物');
    expect(sellGroup(TREASURE_ID)).toBe('宝物'); expect(sellGroup('pearl')).toBe('宝物'); expect(sellGroup('relic_badge')).toBe('宝物');
    const d = DECOR.find((x) => x.price > 0)!; expect(sellGroup(d.id)).toBe('家具');
  });
  it('出售清单里的每一件都落在四个标签之一', () => {
    const inv: Record<string, number> = { fish_carp: 2, junk_boot: 1, pearl: 1, [TREASURE_ID]: 1, [TRASH_ONLY[0]]: 3, [DECOR.find((x) => x.price > 0)!.id]: 1 };
    for (const r of sellList(inv, 1)) expect(SELL_CHIPS, r.id).toContain(sellGroup(r.id));
  });
});

describe('委托红点', () => {
  const c = (done: boolean, claimed: boolean) => ({ id: 'mid', tier: 'mid', name: 'x', desc: '', goal: 1, prog: done ? 1 : 0, done, claimed, reward: { coins: 1, items: [], xp: 1 } });
  it('今日或本周有做完没领的 → 亮；没有 / 没数据 → 不亮', () => {
    const wq = (daily: ReturnType<typeof c>, list: ReturnType<typeof c>[]) => ({ t: 'wq', week: 1, list, daily, allDone: false, allClaimed: false }) as never;
    expect(commClaimable(null)).toBe(false);
    expect(commClaimable(wq(c(false, false), [c(false, false)]))).toBe(false);
    expect(commClaimable(wq(c(true, true), [c(true, true)]))).toBe(false);
    expect(commClaimable(wq(c(true, false), [c(false, false)]))).toBe(true);
    expect(commClaimable(wq(c(false, false), [c(false, false), c(true, false)]))).toBe(true);
  });
});
