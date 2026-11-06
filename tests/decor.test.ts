import { describe, it, expect } from 'vitest';
import { DECOR, DECOR_MAX, canTurn, nextRot, DOOR_KEEP, LEGACY_STARTERS, cleanLay, decorDef, decorRefund, defaultLay, doorKeep, footOf, isStarter, layCounts, layError, seatsOf, topRaise, wallRect, type Placed } from '../src/shared/decor';
import { cleanDorm, layApply, layOf, type DormSave } from '../src/shared/dorm';
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
/** 一间空房间：只留固有的功能家具（床、衣柜、宝箱、鱼缸、空调、门牌、窗），摆别的东西时好看清规则 */
const BASE = [...LEGACY_STARTERS.map((p) => ({ ...p }))];

describe('家具目录（decor.ts）和美术、物品、商店对得上', () => {
  it('每件家具：id 唯一、精灵存在、占地和美术一致、墙饰宽高和图一致、有图标、是背包物品；卖的在商店、固有的不卖', () => {
    const ids = new Set<string>();
    for (const d of DECOR) {
      expect(d.id.startsWith('dc_'), d.id).toBe(true); expect(ids.has(d.id), d.id).toBe(false); ids.add(d.id);
      const mk = ART[d.k]; expect(mk, `${d.id} 的精灵 ${d.k}`).toBeTruthy();
      const f = mk();
      expect([f.fw, f.fh], `${d.id} 占地`).toEqual([d.fw, d.fh]);
      if (d.kind === 'wall') { expect(d.fh, d.id).toBe(0); expect(d.wh, d.id).toBe(Math.ceil(f.img.h / 16)); expect(d.fw, d.id).toBe(Math.floor((f.img.w - 2 * (d.ox ?? 0)) / 16)); } // 窗帘伸出去的部分不算占地
      else expect(d.fh, d.id).toBeGreaterThan(0);
      if (d.kind === 'top') expect([d.fw, d.fh], d.id).toEqual([1, 1]);
      if (d.kind === 'rug' || d.kind === 'mat') expect(f.img.w, d.id).toBe(d.fw * 16 + 2);
      if (d.surface && d.fh === 1) expect(d.lift, `${d.id}：一行深的桌子要给小件抬高`).toBeGreaterThan(0);
      if (d.act) expect(d.starter, `${d.id}：有功能的家具是固有的`).toBe(true);
      expect(itemDef(d.id)?.kind, d.id).toBe('decor'); expect(itemDef(d.id)!.stack).toBe(d.starter ? 1 : STACK_MAX);
      expect(ICONS[d.id], `${d.id} 的图标`).toBeTruthy();
      expect(d.name.length, d.id).toBeGreaterThan(1); expect(d.note.length, d.id).toBeGreaterThan(3);
      if (d.starter) { expect(d.price, d.id).toBe(0); expect(shopItem(d.id), `${d.id} 不卖`).toBeUndefined(); expect(tradable(d.id), `${d.id} 不能交易`).toBe(false); expect(sellable(d.id), `${d.id} 不能退货`).toBe(false); expect(decorRefund(d.id)).toBe(0); expect(isStarter(d.id)).toBe(true); }
      else { expect(d.price, d.id).toBeGreaterThan(0); expect(shopItem(d.id)?.price, d.id).toBe(d.price); expect(tradable(d.id), `${d.id} 可以面对面交易`).toBe(true); expect(isStarter(d.id)).toBe(false); }
    }
    expect(shopItemsValid()).toBe(true);
    expect(ITEMS.filter((i) => i.kind === 'decor')).toHaveLength(DECOR.length);
  });
  it('能转向的：地毯、门垫（贴图直接转，圆的不用转）和一批有专门设计朝向的家具；挂墙的、四面一样的、床和鱼缸不转；转 90 度时占地宽高互换', () => {
    for (const d of DECOR) {
      if (d.kind === 'rug' || d.kind === 'mat') { expect(!!d.turn, d.id).toBe(!['dc_rug_round', 'dc_mat_straw'].includes(d.id)); expect(d.face, d.id).toBeFalsy(); }
      else expect(d.turn, d.id).toBeFalsy();
      if (d.face) { expect(['floor', 'top']).toContain(d.kind); expect(d.act === 'bed' || d.act === 'bath', d.id).toBe(false); }
    }
    for (const id of ['dc_stool', 'dc_beanbag', 'dc_lamp', 'dc_plant', 'dc_bin', 'dc_books', 'dc_thermos', 'dc_lamp_desk', 'dc_cactus', 'dc_bed', 'dc_bath', 'dc_ac', 'dc_clock']) expect(canTurn(decorDef(id)!), id).toBe(false);
    for (const id of ['dc_sofa', 'dc_desk', 'dc_chair', 'dc_chairup', 'dc_gamechair', 'dc_tv', 'dc_fridge', 'dc_wardrobe', 'dc_chest', 'dc_laptop', 'dc_pc', 'dc_rug_red', 'dc_mat_welcome']) expect(canTurn(decorDef(id)!), id).toBe(true);
    expect(decorDef('dc_chairup')!.base).toBe(180); expect(decorDef('dc_chair')!.base).toBeUndefined();
    expect([0, 90, 180, 270, 0].map((_, i, a) => (i ? nextRot(decorDef('dc_sofa')!, a[i - 1] as 0) : 0))).toEqual([0, 90, 180, 270, 0].slice(0, 1).concat([90, 180, 270, 0] as never)); // 家具一圈四个朝向（顺时针）
    expect(nextRot(decorDef('dc_rug_red')!, 0)).toBe(90); expect(nextRot(decorDef('dc_rug_red')!, 90)).toBe(0); // 地毯只在 0 和 90 之间切（转 180 度图案一样）
    const sofa = decorDef('dc_sofa')!; expect(footOf(sofa, 90)).toEqual({ fw: 1, fh: 2 }); expect(footOf(sofa, 180)).toEqual({ fw: 2, fh: 1 });
    const rug = decorDef('dc_rug_red')!; expect(footOf(rug, 0)).toEqual({ fw: 3, fh: 2 }); expect(footOf(rug, 90)).toEqual({ fw: 2, fh: 3 }); expect(footOf(rug, 270)).toEqual({ fw: 2, fh: 3 });
  });
  it('rotInfo：不转时占地在精灵左下；转 90 度后宽高互换、占地仍贴着精灵底边', () => {
    const f = ART.dc_rug_blue(), a = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 0), b = rotInfo(f.fw, f.fh, f.img.w, f.img.h, 90);
    expect([a.fw, a.fh, a.mx, a.my]).toEqual([4, 2, 1, f.img.h - 1 - 32]); expect([b.fw, b.fh, b.w, b.h]).toEqual([2, 4, f.img.h, f.img.w]);
    expect(b.my + b.fh * 16).toBe(b.h - 1); // 占地底缘 = 图底 −1
    const wall = ART.dc_clock(), w0 = rotInfo(wall.fw, wall.fh, wall.img.w, wall.img.h, 0); expect(w0.fh).toBe(0); expect(w0.my).toBe(wall.img.h - 1);
  });
  it('固有家具一共九件，就是原来房里「固定」的那些 + 暖橙大地毯和门垫；老存档补的是前七件', () => {
    expect(DECOR.filter((d) => d.starter).map((d) => d.id).sort()).toEqual(['dc_ac', 'dc_bath', 'dc_bed', 'dc_chest', 'dc_mat_door', 'dc_rug_home', 'dc_sign', 'dc_wardrobe', 'dc_window']);
    expect(LEGACY_STARTERS.map((p) => p.d)).toEqual(['dc_bed', 'dc_wardrobe', 'dc_chest', 'dc_bath', 'dc_ac', 'dc_sign', 'dc_window']);
  });
});

describe('默认布局', () => {
  it('各级房间的默认布局都合法；固有家具都在里面；原来的桌椅盆栽垃圾桶还在；门垫在门口的出生点那一格', () => {
    for (const lv of [0, 1, 2]) {
      const lay = defaultLay(lv); expect(layError(lay, lv), `级别 ${lv}`).toBeNull();
      for (const d of DECOR.filter((x) => x.starter)) expect(lay.filter((p) => p.d === d.id), d.id).toHaveLength(1);
      expect(lay.map((p) => p.d)).toEqual(expect.arrayContaining(['dc_deskpc', 'dc_chairup', 'dc_plant', 'dc_bin']));
      const mat = lay.find((p) => p.d === 'dc_mat_door')!; expect(mat.y).toBe(doorKeep(lv).y + 1); expect(mat.x).toBe(doorKeep(lv).x);
    }
    expect(layOf(undefined)).toEqual(defaultLay(0)); expect(layOf({ rm: 2 })).toEqual(defaultLay(2)); expect(layOf({ lay: [] })).toEqual([]); // 装修过、全收回了 = 空房间，不是默认
    expect(DOOR_KEEP).toEqual(doorKeep(0));
  });
});

describe('摆放规则 layError', () => {
  const ok = (...extra: Placed[]) => expect(layError([...BASE, ...extra])).toBeNull();
  const bad = (txt: string, ...extra: Placed[]) => expect(layError([...BASE, ...extra]), txt).toContain(txt);
  it('地面家具：不出界、不重叠、不挡门口；床、衣柜这些也是普通家具，同样不能被压', () => {
    ok(P('dc_sofa', 3, 8)); ok(P('dc_tv', 9, 3));
    bad('地面', P('dc_sofa', 0, 8)); bad('地面', P('dc_sofa', 14, 8)); bad('地面', P('dc_sofa', 3, 2)); bad('地面', P('dc_sofa', 3, 10)); // 出界
    bad('已经有家具', P('dc_chair', 1, 3)); bad('已经有家具', P('dc_sofa', 12, 3)); bad('已经有家具', P('dc_chair', 12, 6)); // 床 / 衣柜 / 鱼缸
    bad('门口', P('dc_chair', 7, 9)); bad('门口', P('dc_chair', 8, 8));
    bad('不能转方向', P('dc_stool', 3, 8, 90)); ok(P('dc_sofa', 3, 8, 90)); ok(P('dc_sofa', 3, 8, 180)); bad('方向不对', { d: 'dc_sofa', x: 3, y: 8, r: 45 as never }); // 沙发能转（占地变成 1×2），凳子四面一样不能转
    expect(layError([P('nope', 1, 1)])).toContain('没有这件家具'); expect(layError([{ d: 'dc_sofa', x: 1.5, y: 3 }])).toContain('位置');
    expect(layError([P('dc_bed', 1, 3), P('dc_bed', 5, 3)])).toContain('只有一件'); // 固有家具每人一份
  });
  it('固有家具也能挪：床换个地方、鱼缸换个地方都行', () => {
    const moved = BASE.map((p) => (p.d === 'dc_bed' ? P('dc_bed', 4, 4) : p.d === 'dc_bath' ? P('dc_bath', 2, 7) : p));
    expect(layError(moved)).toBeNull();
    expect(layError(BASE.filter((p) => p.d !== 'dc_bed'))).toBeNull(); // 床收回背包也行（房间里就没床了）
  });
  it('转向后占地跟着变：转过来的家具照新占地检查出界、重叠、挡路', () => {
    bad('地面', P('dc_sofa', 14, 9, 90)); ok(P('dc_sofa', 3, 7, 90)); bad('地面', P('dc_sofa', 15, 7, 90)); // 竖着的沙发往下伸两行，出了南边界 / 东边界
    bad('已经有家具', P('dc_sofa', 3, 7, 90), P('dc_chair', 3, 8)); ok(P('dc_sofa', 3, 7, 90), P('dc_chair', 4, 8));
    bad('桌子上', P('dc_desk', 4, 5, 90), P('dc_books', 5, 5)); ok(P('dc_desk', 4, 5, 90), P('dc_books', 4, 6)); // 书桌转成 1×2 后，桌面是它新的占地
    const lay = [...BASE, P('dc_desk', 4, 5, 90), P('dc_books', 4, 6)]; expect(topRaise(lay, P('dc_books', 4, 6))).toBe(8 + 12); // 第二行抬 8 + 桌子的 lift
    expect(seatsOf(P('dc_sofa', 3, 8, 90))).toHaveLength(2); expect(seatsOf(P('dc_sofa', 3, 8, 90)).map((s) => s.bx)).toEqual([56, 56]); expect(seatsOf(P('dc_sofa', 3, 8)).map((s) => s.bx)).toEqual([56, 72]); // 竖着的沙发两个座位沿纵向排
  });
  it('地毯铺在地上：能被家具压着、不挡路、能层层叠（最多 3 层）；门垫是小地毯，叠在地毯上面，门口也能放', () => {
    ok(P('dc_rug_red', 5, 5)); ok(P('dc_rug_red', 5, 5), P('dc_sofa', 5, 5)); ok(P('dc_rug_round', 1, 6));
    ok(P('dc_rug_red', 5, 5), P('dc_rug_paw', 6, 6)); ok(P('dc_rug_red', 5, 5), P('dc_rug_paw', 8, 5)); // 地毯压地毯也行
    ok(P('dc_rug_red', 3, 4, 90)); bad('地面', P('dc_rug_red', 13, 8, 90)); bad('地面', P('dc_rug_blue', 12, 3));
    ok(P('dc_rug_red', 5, 5), P('dc_mat_welcome', 5, 5)); ok(P('dc_rug_red', 5, 5), P('dc_mat_welcome', 6, 6)); // 叠放
    ok(P('dc_mat_welcome', 7, 9), P('dc_mat_paw', 7, 8)); ok(P('dc_mat_straw', 7, 8)); // 门口放门垫不算挡路
    ok(P('dc_mat_welcome', 5, 5), P('dc_mat_paw', 6, 5)); // 门垫压门垫也行
    ok(P('dc_rug_red', 5, 5), P('dc_rug_blue', 5, 5), P('dc_mat_paw', 5, 5)); bad('最多叠 3 层', P('dc_rug_red', 5, 5), P('dc_rug_blue', 5, 5), P('dc_mat_paw', 5, 5), P('dc_mat_welcome', 5, 5)); // 一处最多 3 层
    bad('最多叠 3 层', P('dc_mat_paw', 5, 5), P('dc_mat_paw', 5, 5), P('dc_mat_paw', 5, 5), P('dc_mat_paw', 5, 5));
  });
  it('小件只能放在桌子上，一格一件；两行深的桌子两行都能放；一行深的桌子（木书桌、小木桌）也能放，画得抬高一点', () => {
    bad('桌子上', P('dc_books', 4, 5));
    ok(P('dc_dtable', 4, 5), P('dc_books', 4, 5), P('dc_laptop', 5, 6), P('dc_pc', 5, 5));
    bad('已经有东西', P('dc_dtable', 4, 5), P('dc_books', 4, 5), P('dc_cactus', 4, 5));
    bad('桌子上', P('dc_dtable', 4, 5), P('dc_books', 6, 5)); // 桌子外面
    ok(P('dc_desk', 4, 5), P('dc_pc', 4, 5), P('dc_lamp_desk', 5, 5)); bad('桌子上', P('dc_chair', 4, 5), P('dc_pc', 4, 5)); // 椅子上放不了
    expect(topRaise([P('dc_dtable', 4, 5)], P('dc_books', 4, 5))).toBe(0); expect(topRaise([P('dc_dtable', 4, 5)], P('dc_books', 5, 6))).toBe(8); expect(topRaise([], P('dc_books', 4, 5))).toBe(0);
    expect(topRaise([P('dc_desk', 4, 5)], P('dc_pc', 4, 5))).toBe(decorDef('dc_desk')!.lift);
  });
  it('墙上的东西（窗、画、空调、门牌）：挂在北墙上、互相不重叠、高度够才挂得上；窗可以多开、换窗帘', () => {
    ok(P('dc_clock', 4, 3)); ok(P('dc_paint1', 9, 3)); // 空调只占最上面一行，它下面能挂画
    bad('挡住别的墙上', P('dc_clock', 6, 3)); bad('挡住别的墙上', P('dc_clock', 10, 1)); bad('挡住别的墙上', P('dc_poster', 1, 3)); // 窗 / 空调 / 门牌
    bad('挡住别的墙上', P('dc_clock', 4, 3), P('dc_poster', 4, 3)); ok(P('dc_clock', 4, 3), P('dc_clock', 5, 3));
    bad('北墙', P('dc_poster', 4, 1)); bad('北墙', P('dc_clock', 4, 4)); bad('北墙', P('dc_clock', 0, 3)); bad('北墙', P('dc_whiteboard', 14, 3));
    expect(wallRect(decorDef('dc_paint1')!, P('dc_paint1', 9, 3))).toEqual({ x: 9, y: 1, w: 2, h: 2 });
    // 再开一扇窗：原来的窗在 6..8，右边 12..14 空着（大屋更宽）
    bad('挡住别的墙上', P('dc_win_blue', 7, 3)); ok(P('dc_win_blue', 12, 3)); ok(P('dc_win_lace', 12, 3));
    expect(layError([...BASE, P('dc_win_plain', 15, 3)], 0)).toContain('北墙'); expect(layError([...BASE, P('dc_win_plain', 15, 3)], 1)).toBeNull();
    // 换窗帘：把原来的紫窗帘收起来，换成别的
    expect(layError([...BASE.filter((p) => p.d !== 'dc_window'), P('dc_win_pink', 6, 3)])).toBeNull();
    // 空调也能挪
    expect(layError([...BASE.filter((p) => p.d !== 'dc_ac'), P('dc_ac', 4, 1)])).toContain('挡住'); expect(layError([...BASE.filter((p) => p.d !== 'dc_ac'), P('dc_ac', 12, 1)])).toBeNull();
  });
  it('不能把床、衣柜、宝箱、鱼缸、空调和门牌前面堵死；挪到哪儿都按新位置算', () => {
    const full = [3, 4, 5, 6, 7, 8, 9].map((y) => P('dc_chair', 4, y)); // 整列椅子把左边（床、垃圾桶）和门口隔开
    expect(layError([...BASE, ...full])).toContain('堵住');
    expect(layError([...BASE, ...full.slice(0, 6)])).toBeNull(); // 留一个缺口（y=9）就走得通
    const gate = [8, 9].flatMap((y) => [1, 2, 3, 4, 5, 6].map((x) => P('dc_stool', x, y))); // 底下两行堆满凳子，但右边门口留着
    expect(layError([...BASE, ...gate])).toBeNull();
    // 把床挪进一个封死的角落：床周围八格全被占 → 报堵住
    const corner = [P('dc_bed', 1, 7), P('dc_chair', 3, 7), P('dc_chair', 3, 8), P('dc_chair', 3, 9), P('dc_chair', 1, 6), P('dc_chair', 2, 6), P('dc_chair', 3, 6), P('dc_chair', 1, 10), P('dc_chair', 2, 10)];
    expect(layError([...BASE.filter((p) => p.d !== 'dc_bed'), ...corner])).toBeTruthy();
    // 空调下面堵死
    const under = [8, 9, 10, 11].flatMap((x) => [3, 4].map((y) => P('dc_stool', x, y)));
    expect(layError([...BASE.filter((p) => p.d !== 'dc_wardrobe' && p.d !== 'dc_chest'), ...under])).toContain('堵住');
  });
  it('数量上限', () => { expect(layError(Array.from({ length: DECOR_MAX + 1 }, () => P('dc_rug_paw', 1, 3)))).toContain('最多'); });
});

describe('椅子能坐', () => {
  it('椅子、凳子、电竞椅、懒人沙发、沙发都能坐；沙发有两个座位；座位在椅面上、人站的位置在椅子下沿外面一点', () => {
    expect(DECOR.filter((d) => d.seat).map((d) => d.id).sort()).toEqual(['dc_beanbag', 'dc_chair', 'dc_chairup', 'dc_gamechair', 'dc_sofa', 'dc_stool']);
    expect(seatsOf(P('dc_table2', 3, 3))).toEqual([]); expect(seatsOf(P('dc_chair', 3, 8))).toEqual([{ x: 56, y: 145, bx: 56, by: 136 }]);
    const sofa = seatsOf(P('dc_sofa', 4, 8)); expect(sofa).toHaveLength(2); expect(sofa[0].bx).toBe(72); expect(sofa[1].bx).toBe(88); expect(sofa[0].y).toBeGreaterThan(sofa[0].by); // 椅面在脚点上面、人站在脚点下面一点（画在椅子前面）
  });
});

describe('装修一步 layApply（背包 ⇄ 房间，数量守恒）', () => {
  const inv0 = (): Inv => ({ dc_sofa: 2, dc_dtable: 1, dc_books: 3, dc_rug_red: 1, dc_clock: 1 });
  it('摆放：从背包扣一件；没有/位置不合法什么都不改；第一次装修从默认布局开始', () => {
    const d: DormSave = {}, inv = inv0(), n0 = defaultLay().length;
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 })).toMatchObject({ ok: true }); expect(inv.dc_sofa).toBe(1); expect(d.lay).toHaveLength(n0 + 1); expect(d.lay!.slice(0, n0)).toEqual(defaultLay()); expect(d.v).toBe(2); // 默认的家具（含床、衣柜）也成了「已摆」
    const before = JSON.stringify([d, inv]);
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 6, y: 3 }).ok).toBe(false); // 压在电脑桌上
    expect(layApply(d, inv, { op: 'place', d: 'dc_tank', x: 3, y: 5 }).msg).toContain('背包里没有');
    expect(layApply(d, inv, { op: 'place', d: 'nope', x: 3, y: 5 }).ok).toBe(false); expect(layApply(d, inv, { op: 'place', d: 'dc_books', x: 3, y: 5 }).msg).toContain('桌子');
    expect(JSON.stringify([d, inv])).toBe(before);
  });
  it('地毯、门垫按摆放顺序叠：挪动它等于重新铺，放到最上面；转向（含桌子转过来后桌上有小件的限制）', () => {
    const d: DormSave = {}, inv: Inv = { dc_rug_red: 1, dc_rug_blue: 1, dc_mat_paw: 1, dc_dtable: 1, dc_books: 1, dc_sofa: 1 };
    layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 2, y: 3 }); layApply(d, inv, { op: 'place', d: 'dc_rug_blue', x: 2, y: 3 }); layApply(d, inv, { op: 'place', d: 'dc_mat_paw', x: 2, y: 3 });
    const names = () => d.lay!.map((p) => p.d).filter((x) => /rug_red|rug_blue|mat_paw/.test(x));
    expect(names()).toEqual(['dc_rug_red', 'dc_rug_blue', 'dc_mat_paw']);
    expect(layApply(d, inv, { op: 'move', i: d.lay!.findIndex((p) => p.d === 'dc_rug_red'), x: 2, y: 3 }).ok).toBe(true); expect(names()).toEqual(['dc_rug_blue', 'dc_mat_paw', 'dc_rug_red']); // 红毯被拿起来重铺，到最上面
    expect(layApply(d, inv, { op: 'move', i: d.lay!.findIndex((p) => p.d === 'dc_rug_red'), x: 2, y: 3, r: 90 }).ok).toBe(true); expect(d.lay!.find((p) => p.d === 'dc_rug_red')!.r).toBe(90); // 地毯转 90 度
    // 沙发转向：往南转到 180 度再转回 0（r 不存 0）；桌上有小件的桌子收不回
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); const iSofa = d.lay!.findIndex((p) => p.d === 'dc_sofa');
    expect(layApply(d, inv, { op: 'move', i: iSofa, x: 3, y: 8, r: 180 }).ok).toBe(true); expect(d.lay![iSofa].r).toBe(180);
    expect(layApply(d, inv, { op: 'move', i: iSofa, x: 3, y: 8, r: 0 }).ok).toBe(true); expect(d.lay![iSofa].r).toBeUndefined();
    layApply(d, inv, { op: 'place', d: 'dc_dtable', x: 4, y: 5 }); layApply(d, inv, { op: 'place', d: 'dc_books', x: 5, y: 6 });
    const iT = d.lay!.findIndex((p) => p.d === 'dc_dtable'); expect(layApply(d, inv, { op: 'pick', i: iT }).msg).toContain('桌子上还有东西');
  });
  it('收回 / 挪动：收回还给背包；桌上有小件不能收桌子；挪动不改数量；下标不对被拒；固有家具也一样', () => {
    const d: DormSave = {}, inv = inv0();
    layApply(d, inv, { op: 'place', d: 'dc_dtable', x: 4, y: 5 }); layApply(d, inv, { op: 'place', d: 'dc_books', x: 4, y: 5 }); expect(inv.dc_books).toBe(2);
    const iDesk = d.lay!.findIndex((p) => p.d === 'dc_dtable'), iBook = d.lay!.findIndex((p) => p.d === 'dc_books');
    expect(layApply(d, inv, { op: 'pick', i: iDesk }).msg).toContain('桌子上还有东西'); expect(layApply(d, inv, { op: 'move', i: iDesk, x: 5, y: 5 }).ok).toBe(false); // 挪桌子会把小件落空
    expect(layApply(d, inv, { op: 'move', i: iBook, x: 5, y: 6 }).ok).toBe(true); expect(d.lay![iBook]).toMatchObject({ d: 'dc_books', x: 5, y: 6 });
    expect(layApply(d, inv, { op: 'pick', i: iBook }).ok).toBe(true); expect(inv.dc_books).toBe(3);
    expect(layApply(d, inv, { op: 'pick', i: d.lay!.findIndex((p) => p.d === 'dc_dtable') }).ok).toBe(true); expect(inv.dc_dtable).toBe(1);
    expect(layApply(d, inv, { op: 'pick', i: 99 }).ok).toBe(false); expect(layApply(d, inv, { op: 'move', i: -1, x: 1, y: 1 }).ok).toBe(false); expect(layApply(d, inv, { op: 'pick', i: 1.5 }).ok).toBe(false);
    // 床挪个地方
    const iBed = d.lay!.findIndex((p) => p.d === 'dc_bed'); expect(layApply(d, inv, { op: 'move', i: iBed, x: 4, y: 5 }).ok).toBe(true); expect(d.lay![iBed]).toMatchObject({ d: 'dc_bed', x: 4, y: 5 });
    // 全部收回 = 空房间（不会回到默认布局）；固有家具回到背包，每种一件，不会多
    while (d.lay!.length) layApply(d, inv, { op: 'pick', i: 0 }); expect(layOf(d)).toEqual([]);
    for (const id of ['dc_deskpc', 'dc_chairup', 'dc_plant', 'dc_bin', 'dc_bed', 'dc_wardrobe', 'dc_chest', 'dc_bath', 'dc_ac', 'dc_sign', 'dc_window', 'dc_rug_home', 'dc_mat_door']) expect(inv[id], id).toBe(1);
    // 收回的床再摆回来；摆了就不能再摆第二张（背包里没有了）
    expect(layApply(d, inv, { op: 'place', d: 'dc_bed', x: 1, y: 3 }).ok).toBe(true); expect(layApply(d, inv, { op: 'place', d: 'dc_bed', x: 5, y: 5 }).msg).toContain('背包里没有');
  });
  it('总量守恒：背包 + 房间里的件数 = 买到的件数；背包满了收不回', () => {
    const d: DormSave = {}, inv = inv0(); const total = () => (inv.dc_sofa ?? 0) + (layCounts(layOf(d)).dc_sofa ?? 0);
    const n0 = defaultLay().length;
    expect(total()).toBe(2); layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); expect(total()).toBe(2); layApply(d, inv, { op: 'pick', i: n0 }); expect(total()).toBe(2);
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); inv.dc_sofa = STACK_MAX; expect(layApply(d, inv, { op: 'pick', i: n0 }).msg).toContain('放不下'); expect(d.lay).toHaveLength(n0 + 1);
  });
  it('地毯转向 90 度，占地跟着变', () => {
    const d: DormSave = {}, inv = inv0(), n0 = defaultLay().length;
    expect(layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 12, y: 8, r: 90 }).ok).toBe(false); // 竖着占 x12..13、y8..10 → 出界
    expect(layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 12, y: 7, r: 90 }).ok).toBe(true); expect(d.lay![n0]).toEqual({ d: 'dc_rug_red', x: 12, y: 7, r: 90 });
    expect(layApply(d, inv, { op: 'place', d: 'dc_clock', x: 4, y: 3, r: 90 }).ok).toBe(false); // 墙饰不能转
  });
});

describe('存档清洗和老存档升级', () => {
  it('不合法的丢掉，合法的留下；小件排到桌子后面；超出上限截断', () => {
    expect(cleanLay('x')).toBeUndefined(); expect(cleanLay([])).toEqual([]);
    const raw = [{ d: 'dc_books', x: 4, y: 5 }, { d: 'dc_dtable', x: 4, y: 5 }, { d: 'nope', x: 1, y: 1 }, { d: 'dc_sofa', x: 1, y: 3 }, { d: 'dc_sofa', x: 3, y: 8, r: 45 }, null, { d: 'dc_clock', x: 4, y: 3 }];
    expect(cleanLay(raw)).toEqual([{ d: 'dc_dtable', x: 4, y: 5 }, { d: 'dc_sofa', x: 1, y: 3 }, { d: 'dc_sofa', x: 3, y: 8 }, { d: 'dc_clock', x: 4, y: 3 }, { d: 'dc_books', x: 4, y: 5 }]);
    expect(cleanDorm({ lay: [], v: 2 })).toEqual({ lay: [], v: 2 });
  });
  it('老存档（v1：摆放里没有固有家具）读取时补上床、衣柜、宝箱、鱼缸、空调、门牌、窗，位置和旧规则一致，玩家原来的摆放一件不丢', () => {
    // 旧规则下合法的摆放：木桌电脑、沙发、地毯、窗外的画、右边的海报
    const old = [{ d: 'dc_deskpc', x: 6, y: 3 }, { d: 'dc_sofa', x: 3, y: 8 }, { d: 'dc_rug_red', x: 5, y: 5 }, { d: 'dc_clock', x: 4, y: 3 }, { d: 'dc_paint1', x: 9, y: 3 }, { d: 'dc_poster', x: 14, y: 2 }];
    const lay = cleanDorm({ lay: old })!.lay!;
    for (const id of ['dc_bed', 'dc_wardrobe', 'dc_chest', 'dc_bath', 'dc_ac', 'dc_sign', 'dc_window']) expect(lay.filter((p) => p.d === id), id).toHaveLength(1);
    for (const p of old) expect(lay.some((q) => q.d === p.d && q.x === p.x && q.y === p.y), p.d).toBe(true); // 原来的摆放一件不丢
    expect(cleanDorm({ lay: old })!.v).toBe(2); expect(layError(lay)).toBeNull();
    // 已经是 v2 的不再补
    expect(cleanDorm({ lay: old, v: 2 })!.lay!.some((p) => p.d === 'dc_bed')).toBe(false);
    // 没有 lay 的（没装修过）不动：用默认布局
    expect(cleanDorm({ b: '三社区B楼' })).toEqual({ b: '三社区B楼' });
  });
});

describe('商店：买、退货', () => {
  it('卖的家具都在商店卖；退货价 = 原价的一半（至少 1）；固有家具不卖不收；退货不在「一键卖出」里', () => {
    for (const d of DECOR.filter((x) => !x.starter)) {
      expect(SHOP.some((s) => s.id === d.id && s.n === 1 && s.price === d.price), d.id).toBe(true);
      expect(decorRefund(d.id)).toBe(Math.max(1, Math.floor(d.price / 2))); expect(sellable(d.id), d.id).toBe(true); expect(sellPrice(d.id, 20000)).toBe(decorRefund(d.id)); expect(sellPrice(d.id, 20001, 0.5)).toBe(decorRefund(d.id)); // 没有行情、没有加成
    }
    for (const d of DECOR.filter((x) => x.starter)) expect(SHOP.some((s) => s.id === d.id), d.id).toBe(false);
    const rows = sellList({ dc_sofa: 2, cat_food: 3, dc_bed: 1 }, 1); expect(rows.map((r) => r.id)).toEqual(['dc_sofa']); expect(rows[0]).toMatchObject({ n: 2, price: 110 });
    expect(decorRefund('bait')).toBe(0); expect(decorDef('bait')).toBeUndefined();
  });
  it('买进再退货不会赚钱：买 1 件花 price，退 1 件拿 floor(price/2)', () => { for (const d of DECOR.filter((x) => !x.starter)) expect(decorRefund(d.id)).toBeLessThan(d.price); });
});
