import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECOR, DECOR_MAX, DECOR_ROOM, DOOR_KEEP, FIXED_FLOOR, FIXED_WALL, cleanLay, decorDef, decorRefund, defaultLay, footOf, layCounts, layError, topRaise, wallRect, type Placed } from '../src/shared/decor';
import { DORM_ROOM, cleanDorm, layApply, layOf, type DormSave } from '../src/shared/dorm';
import { ITEMS, itemDef, STACK_MAX, type Inv } from '../src/shared/items';
import { SHOP, sellPrice, sellable, shopItem, shopItemsValid, sellList } from '../src/shared/economy';
import { rotInfo } from '../src/shared/interior';
import { tradable } from '../src/shared/trade';
import { FURNITURE } from '../tools/art/furniture';
import { OFFICE_FURNITURE } from '../tools/art/furniture-office';
import { DORM_FURNITURE } from '../tools/art/furniture-dorm';
import { DECOR_FURNITURE } from '../tools/art/furniture-decor';
import { ICONS } from '../tools/art/items';

const ART = { ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE };
const P = (d: string, x: number, y: number, r?: 90 | 180 | 270): Placed => ({ d, x, y, ...(r ? { r } : {}) });

describe('家具目录（decor.ts）和美术、物品、商店对得上', () => {
  it('每件家具：id 唯一、精灵存在、占地和美术一致、墙饰高度和图一致、有图标、是背包物品、商店在卖', () => {
    const ids = new Set<string>();
    for (const d of DECOR) {
      expect(d.id.startsWith('dc_'), d.id).toBe(true); expect(ids.has(d.id), d.id).toBe(false); ids.add(d.id);
      const mk = ART[d.k]; expect(mk, `${d.id} 的精灵 ${d.k}`).toBeTruthy();
      const f = mk();
      expect([f.fw, f.fh], `${d.id} 占地`).toEqual([d.fw, d.fh]);
      if (d.kind === 'wall') { expect(d.fh, d.id).toBe(0); expect(d.wh, d.id).toBe(Math.ceil(f.img.h / 16)); expect(d.fw, d.id).toBe(Math.floor(f.img.w / 16)); }
      else expect(d.fh, d.id).toBeGreaterThan(0);
      if (d.kind === 'top') expect([d.fw, d.fh], d.id).toEqual([1, 1]);
      if (d.kind === 'rug') expect(f.img.w, d.id).toBe(d.fw * 16 + 2);
      if (d.surface) expect(d.fh, `${d.id}：桌子要两行深，小件才摆得上`).toBe(2);
      expect(itemDef(d.id)?.kind, d.id).toBe('decor'); expect(itemDef(d.id)!.stack).toBe(STACK_MAX);
      expect(ICONS[d.id], `${d.id} 的图标`).toBeTruthy();
      expect(d.price, d.id).toBeGreaterThan(0); expect(shopItem(d.id)?.price, d.id).toBe(d.price);
      expect(tradable(d.id), `${d.id} 可以面对面交易`).toBe(true);
      expect(d.name.length, d.id).toBeGreaterThan(1); expect(d.note.length, d.id).toBeGreaterThan(3);
    }
    expect(shopItemsValid()).toBe(true);
    expect(ITEMS.filter((i) => i.kind === 'decor')).toHaveLength(DECOR.length);
  });
  it('地毯能转方向、别的不能；转 90 度时占地宽高互换', () => {
    for (const d of DECOR) expect(!!d.turn, d.id).toBe(d.kind === 'rug' && d.fw !== d.fh);
    const rug = decorDef('dc_rug_red')!; expect(footOf(rug, 0)).toEqual({ fw: 3, fh: 2 }); expect(footOf(rug, 90)).toEqual({ fw: 2, fh: 3 }); expect(footOf(rug, 270)).toEqual({ fw: 2, fh: 3 });
  });
  it('rotInfo：不转时占地在精灵左下；转 90 度后宽高互换、占地仍贴着精灵底边', () => {
    const f = ART.dc_rug_blue(), a = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 0), b = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 90);
    expect([a.fw, a.fh, a.mx, a.my]).toEqual([4, 2, 1, f.img.h - 1 - 32]); expect([b.fw, b.fh, b.w, b.h]).toEqual([2, 4, f.img.h, f.img.w]);
    expect(b.my + b.fh * 16).toBe(b.h - 1); // 占地底缘 = 图底 −1
    const sofa = ART.sofa(), r0 = rotInfo(sofa.fw, sofa.fh, sofa.img.w, sofa.img.h, 0); expect(r0.mx).toBe(1);
    const wall = ART.dc_clock(), w0 = rotInfo(wall.fw, wall.fh, wall.img.w, wall.img.h, 0); expect(w0.fh).toBe(0); expect(w0.my).toBe(wall.img.h - 1);
  });
});

describe('房间与固定家具和 dorm.json 一致', () => {
  const j = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'interiors', 'dorm.json'), 'utf8')) as { w: number; h: number; exit: { x: number; w: number }; furniture: { k: string; x: number; y: number; act?: string }[] };
  it('房间尺寸、门洞、床/衣柜/宝箱/浴缸的占地、门牌/空调的位置', () => {
    expect([DECOR_ROOM.w, DECOR_ROOM.h]).toEqual([j.w, j.h]); expect([DORM_ROOM.w, DORM_ROOM.h]).toEqual([j.w, j.h]);
    expect(DOOR_KEEP).toMatchObject({ x: j.exit.x, w: j.exit.w }); expect(DOOR_KEEP.y + DOOR_KEEP.h).toBe(j.h - 1); // 门口留空的区域正好在门洞里面
    for (const k of ['dbed', 'dwardrobe', 'dchest', 'dbath']) {
      const f = j.furniture.find((x) => x.k === k)!, fx = ART[k]();
      expect(FIXED_FLOOR.some((r) => r.x === f.x && r.y === f.y && r.w === fx.fw && r.h === fx.fh), `${k} 的占地要在 FIXED_FLOOR 里`).toBe(true);
    }
    expect(j.furniture.filter((f) => ART[f.k]().fh > 0).map((f) => f.k).sort()).toEqual(['dbath', 'dbed', 'dchest', 'dwardrobe']); // 地面上只剩这四件固定家具，别的都走摆放数据
    for (const k of ['dsign', 'ac']) { const f = j.furniture.find((x) => x.k === k)!, fx = ART[k](); expect(FIXED_WALL.some((r) => f.x >= r.x && f.x + fx.fw <= r.x + r.w + 1 && r.y === 0), `${k} 在墙上的位置要在 FIXED_WALL 里`).toBe(true); }
  });
  it('默认布局合法，里面的家具都是目录里的、都不是桌上小件', () => {
    expect(layError(defaultLay())).toBeNull(); for (const p of defaultLay()) expect(decorDef(p.d)!.kind).toBe('floor');
    expect(layOf(undefined)).toEqual(defaultLay()); expect(layOf({ lay: [] })).toEqual([]); // 装修过、全收回了 = 空房间，不是默认
  });
});

describe('摆放规则 layError', () => {
  const base = defaultLay();
  const ok = (...extra: Placed[]) => expect(layError([...base, ...extra])).toBeNull();
  const bad = (txt: string, ...extra: Placed[]) => expect(layError([...base, ...extra]), txt).toContain(txt);
  it('地面家具：不出界、不重叠、不压床/衣柜/宝箱/浴缸、不挡门口', () => {
    ok(P('dc_sofa', 3, 8)); ok(P('dc_tv', 9, 3));
    bad('地面', P('dc_sofa', 0, 8)); bad('地面', P('dc_sofa', 14, 8)); bad('地面', P('dc_sofa', 3, 2)); bad('地面', P('dc_sofa', 3, 10)); // 出界
    bad('已经有家具', P('dc_sofa', 6, 3)); // 压在木桌+电脑上
    bad('压在床', P('dc_chair', 1, 3)); bad('压在床', P('dc_sofa', 12, 3)); bad('压在床', P('dc_chair', 12, 6)); // 床 / 衣柜 / 浴缸
    bad('门口', P('dc_chair', 7, 9)); bad('门口', P('dc_chair', 8, 8));
    bad('不能转方向', P('dc_sofa', 3, 8, 90));
    expect(layError([P('nope', 1, 1)])).toContain('没有这件家具'); expect(layError([{ d: 'dc_sofa', x: 1.5, y: 3 }])).toContain('位置');
  });
  it('地毯铺在地上：能被家具压着，不挡路，但两块地毯不能叠', () => {
    ok(P('dc_rug_red', 5, 5)); ok(P('dc_rug_red', 5, 5), P('dc_sofa', 5, 5)); ok(P('dc_rug_round', 1, 6)); // 铺在床/垃圾桶旁边也行
    bad('地毯', P('dc_rug_red', 5, 5), P('dc_rug_paw', 6, 6)); ok(P('dc_rug_red', 5, 5), P('dc_rug_paw', 8, 5));
    ok(P('dc_rug_red', 3, 4, 90)); bad('地面', P('dc_rug_red', 13, 8, 90)); bad('地面', P('dc_rug_blue', 12, 3));
  });
  it('小件只能放在桌子上，一格一件；桌子要两行深', () => {
    bad('桌子上', P('dc_books', 4, 5)); // 没桌子
    ok(P('dc_dtable', 4, 5), P('dc_books', 4, 5), P('dc_laptop', 5, 6)); // 书桌两行都能放
    bad('已经有东西', P('dc_dtable', 4, 5), P('dc_books', 4, 5), P('dc_cactus', 4, 5));
    bad('桌子上', P('dc_dtable', 4, 5), P('dc_books', 6, 5)); // 桌子外面
    bad('桌子上', P('dc_desk', 4, 5), P('dc_books', 4, 5)); // 一行深的木桌不算
    expect(topRaise([P('dc_dtable', 4, 5)], P('dc_books', 4, 5))).toBe(0); expect(topRaise([P('dc_dtable', 4, 5)], P('dc_books', 5, 6))).toBe(8); expect(topRaise([], P('dc_books', 4, 5))).toBe(0);
  });
  it('墙饰：挂在北墙上，不挡窗户/空调/门牌/衣柜/宝箱，墙饰之间不重叠；高度够才挂得上', () => {
    ok(P('dc_clock', 4, 3)); ok(P('dc_paint1', 9, 3), P('dc_poster', 14, 2)); // 空调只占最上面一行，它下面能挂两格高的画；门牌下面只剩一行
    bad('挂在这里会挡住', P('dc_clock', 6, 3)); bad('挂在这里会挡住', P('dc_clock', 10, 1)); bad('挂在这里会挡住', P('dc_poster', 1, 3)); bad('挂在这里会挡住', P('dc_pennant', 13, 3)); bad('挂在这里会挡住', P('dc_clock', 14, 3)); // 窗户 / 空调 / 门牌 / 衣柜 / 宝箱
    bad('挂在这里会挡住', P('dc_clock', 4, 3), P('dc_poster', 4, 3)); ok(P('dc_clock', 4, 3), P('dc_clock', 5, 3)); ok(P('dc_clock', 14, 1), P('dc_clock', 14, 2)); // 上下错开能挂两个
    bad('北墙', P('dc_poster', 4, 1)); // 两格高的挂件，底边在第 1 行线上，顶就出了墙
    bad('北墙', P('dc_clock', 4, 4)); bad('北墙', P('dc_clock', 0, 3)); bad('北墙', P('dc_whiteboard', 13, 3)); bad('北墙', P('dc_whiteboard', 14, 3));
    expect(wallRect(decorDef('dc_paint1')!, P('dc_paint1', 9, 3))).toEqual({ x: 9, y: 1, w: 2, h: 2 });
  });
  it('不能把床、衣柜、宝箱、浴缸、空调和门牌前面堵死', () => {
    const full = [3, 4, 5, 6, 7, 8, 9].map((y) => P('dc_chair', 4, y)); // 整列椅子把左边（床、垃圾桶）和门口隔开
    expect(layError(full)).toContain('堵住');
    expect(layError(full.slice(0, 6))).toBeNull(); // 留一个缺口（y=9）就走得通
    const gate = [8, 9].flatMap((y) => [1, 2, 3, 4, 5, 6].map((x) => P('dc_stool', x, y))); // 底下两行堆满凳子，但右边门口留着，通得过去
    expect(layError(gate.filter((p) => !(p.x === 1 && p.y === 8)))).toBeNull(); // 垃圾桶在 (1,8)，别重叠
  });
  it('数量上限', () => { expect(layError(Array.from({ length: DECOR_MAX + 1 }, () => P('dc_rug_paw', 1, 3)))).toContain('最多'); });
});

describe('装修一步 layApply（背包 ⇄ 房间，数量守恒）', () => {
  const inv0 = (): Inv => ({ dc_sofa: 2, dc_dtable: 1, dc_books: 3, dc_rug_red: 1, dc_clock: 1 });
  it('摆放：从背包扣一件；没有/位置不合法什么都不改；第一次装修从默认布局开始', () => {
    const d: DormSave = {}, inv = inv0();
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 })).toMatchObject({ ok: true }); expect(inv.dc_sofa).toBe(1); expect(d.lay).toHaveLength(5); expect(d.lay!.slice(0, 4)).toEqual(defaultLay()); // 默认的四件也成了"已摆"
    const before = JSON.stringify([d, inv]);
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 6, y: 3 }).ok).toBe(false); // 压在电脑桌上
    expect(layApply(d, inv, { op: 'place', d: 'dc_tank', x: 3, y: 5 }).msg).toContain('背包里没有');
    expect(layApply(d, inv, { op: 'place', d: 'nope', x: 3, y: 5 }).ok).toBe(false); expect(layApply(d, inv, { op: 'place', d: 'dc_books', x: 3, y: 5 }).msg).toContain('桌子');
    expect(JSON.stringify([d, inv])).toBe(before);
  });
  it('收回 / 挪动：收回还给背包；桌上有小件不能收桌子；挪动不改数量；下标不对被拒', () => {
    const d: DormSave = {}, inv = inv0();
    layApply(d, inv, { op: 'place', d: 'dc_dtable', x: 4, y: 5 }); layApply(d, inv, { op: 'place', d: 'dc_books', x: 4, y: 5 }); expect(inv.dc_books).toBe(2);
    const iDesk = d.lay!.findIndex((p) => p.d === 'dc_dtable'), iBook = d.lay!.findIndex((p) => p.d === 'dc_books');
    expect(layApply(d, inv, { op: 'pick', i: iDesk }).msg).toContain('桌子上还有东西'); expect(layApply(d, inv, { op: 'move', i: iDesk, x: 5, y: 5 }).ok).toBe(false); // 挪桌子会把小件落空
    expect(layApply(d, inv, { op: 'move', i: iBook, x: 5, y: 6 }).ok).toBe(true); expect(d.lay![iBook]).toMatchObject({ d: 'dc_books', x: 5, y: 6 });
    expect(layApply(d, inv, { op: 'pick', i: iBook }).ok).toBe(true); expect(inv.dc_books).toBe(3);
    expect(layApply(d, inv, { op: 'pick', i: d.lay!.findIndex((p) => p.d === 'dc_dtable') }).ok).toBe(true); expect(inv.dc_dtable).toBe(1);
    expect(layApply(d, inv, { op: 'pick', i: 99 }).ok).toBe(false); expect(layApply(d, inv, { op: 'move', i: -1, x: 1, y: 1 }).ok).toBe(false); expect(layApply(d, inv, { op: 'pick', i: 1.5 }).ok).toBe(false);
    // 全部收回 = 空房间（不会回到默认布局）
    while (d.lay!.length) layApply(d, inv, { op: 'pick', i: 0 }); expect(layOf(d)).toEqual([]);
    expect(inv.dc_deskpc).toBe(1); expect(inv.dc_chairup).toBe(1); expect(inv.dc_plant).toBe(1); expect(inv.dc_bin).toBe(1);
  });
  it('总量守恒：背包 + 房间里的件数 = 买到的件数；背包满了收不回', () => {
    const d: DormSave = {}, inv = inv0(); const total = () => (inv.dc_sofa ?? 0) + (layCounts(layOf(d)).dc_sofa ?? 0);
    expect(total()).toBe(2); layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); expect(total()).toBe(2); layApply(d, inv, { op: 'pick', i: 4 }); expect(total()).toBe(2);
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); inv.dc_sofa = STACK_MAX; expect(layApply(d, inv, { op: 'pick', i: 4 }).msg).toContain('放不下'); expect(d.lay).toHaveLength(5);
  });
  it('地毯转向 90 度，占地跟着变', () => {
    const d: DormSave = {}, inv = inv0();
    expect(layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 12, y: 8, r: 90 }).ok).toBe(false); // 竖着占 x12..13、y8..10 → 出界
    expect(layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 12, y: 7, r: 90 }).ok).toBe(true); expect(d.lay![4]).toEqual({ d: 'dc_rug_red', x: 12, y: 7, r: 90 });
    expect(layApply(d, inv, { op: 'place', d: 'dc_clock', x: 4, y: 3, r: 90 }).ok).toBe(false); // 墙饰不能转
  });
});

describe('存档清洗 cleanLay / cleanDorm', () => {
  it('不合法的丢掉，合法的留下；小件排到桌子后面；超出上限截断', () => {
    expect(cleanLay('x')).toBeUndefined(); expect(cleanLay([])).toEqual([]);
    const raw = [{ d: 'dc_books', x: 4, y: 5 }, { d: 'dc_dtable', x: 4, y: 5 }, { d: 'nope', x: 1, y: 1 }, { d: 'dc_sofa', x: 1, y: 3 }, { d: 'dc_sofa', x: 3, y: 8, r: 45 }, null, { d: 'dc_clock', x: 4, y: 3 }];
    expect(cleanLay(raw)).toEqual([{ d: 'dc_dtable', x: 4, y: 5 }, { d: 'dc_sofa', x: 3, y: 8 }, { d: 'dc_clock', x: 4, y: 3 }, { d: 'dc_books', x: 4, y: 5 }]);
    expect(cleanDorm({ lay: [] })).toEqual({ lay: [] }); expect(cleanDorm({ lay: 5 })).toBeUndefined(); expect(cleanDorm({ lay: [{ d: 'dc_sofa', x: 3, y: 8 }] })).toEqual({ lay: [{ d: 'dc_sofa', x: 3, y: 8 }] });
  });
});

describe('商店：买、退货', () => {
  it('家具都在商店卖；退货价 = 原价的一半（至少 1）；退货算「商店收」，不在「一键卖出」里', () => {
    for (const d of DECOR) {
      expect(SHOP.some((s) => s.id === d.id && s.n === 1 && s.price === d.price), d.id).toBe(true);
      expect(decorRefund(d.id)).toBe(Math.max(1, Math.floor(d.price / 2))); expect(sellable(d.id), d.id).toBe(true); expect(sellPrice(d.id, 20000)).toBe(decorRefund(d.id)); expect(sellPrice(d.id, 20001, 0.5)).toBe(decorRefund(d.id)); // 没有行情、没有加成
    }
    const rows = sellList({ dc_sofa: 2, cat_food: 3 }, 1); expect(rows.map((r) => r.id)).toEqual(['dc_sofa']); expect(rows[0]).toMatchObject({ n: 2, price: 110 });
    expect(decorRefund('bait')).toBe(0); expect(decorDef('bait')).toBeUndefined();
  });
  it('买进再退货不会赚钱：买 1 件花 price，退 1 件拿 floor(price/2)', () => { for (const d of DECOR) expect(decorRefund(d.id)).toBeLessThan(d.price); });
});
