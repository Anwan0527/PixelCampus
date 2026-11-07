import { describe, expect, it } from 'vitest';
import { DYES, DYE_ITEM, dyeCss, dyeName, dyePixels, isDyeIdx } from '../src/shared/dye';
import { DECOR, cleanLay, decorDef, defaultLay, layError, type Placed } from '../src/shared/decor';
import { cleanDorm, layApply, layOf, type DormSave } from '../src/shared/dorm';
import { SHOP, shopItem } from '../src/shared/economy';
import { itemDef } from '../src/shared/items';
import { ICONS } from '../tools/art/items';

const P = (d: string, x: number, y: number, extra: Partial<Placed> = {}): Placed => ({ d, x, y, ...extra });
const px = (...rows: [number, number, number, number][]) => Uint8ClampedArray.from(rows.flat());
const hueOf = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
const lum = (r: number, g: number, b: number) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

describe('调色板与染料物品', () => {
  it('12 种颜色：名字不重复、参数合法；色号 1..12 合法，0 / 13 / 小数不合法', () => {
    expect(DYES.length).toBe(12); expect(new Set(DYES.map((d) => d.name)).size).toBe(12);
    for (const d of DYES) { expect(d.h).toBeGreaterThanOrEqual(0); expect(d.h).toBeLessThan(360); expect(d.s).toBeGreaterThanOrEqual(0); expect(d.s).toBeLessThanOrEqual(1); expect(d.l).toBeGreaterThan(0.2); expect(d.l).toBeLessThan(0.9); }
    expect([1, 12].every(isDyeIdx)).toBe(true); expect([0, 13, 1.5, -1, NaN, '1', null].some(isDyeIdx)).toBe(false);
    expect(dyeName(0)).toBe('原色'); expect(dyeName(1)).toBe('奶油白'); expect(dyeCss(0)).toBe('transparent'); expect(dyeCss(1)).toMatch(/^hsl\(/);
  });
  it('染料是背包物品、商店 3 份 40 校园币、有图标', () => {
    expect(itemDef(DYE_ITEM)).toMatchObject({ name: '染料', kind: 'tool' }); expect(shopItem('dye')).toMatchObject({ n: 3, price: 40 }); expect(SHOP.filter((s) => s.id === 'dye').length).toBe(1);
    expect(ICONS.dye).toBeTruthy(); expect(ICONS.dye().w).toBe(16);
  });
  it('能染的家具：桌椅、柜子、沙发、地毯门垫、玩偶、衣柜宝箱；屏幕灯画窗鱼缸床不能染', () => {
    const can = DECOR.filter((d) => d.dye).map((d) => d.id), cant = ['dc_deskpc', 'dc_tv', 'dc_tank', 'dc_bath', 'dc_bed', 'dc_lamp', 'dc_lamp_desk', 'dc_clock', 'dc_paint1', 'dc_win_blue', 'dc_window', 'dc_ac', 'dc_sign', 'dc_plant', 'dc_cactus', 'dc_books', 'dc_laptop', 'dc_pc', 'dc_whiteboard'];
    for (const id of ['dc_desk', 'dc_sofa', 'dc_chair', 'dc_cab2', 'dc_rug_home', 'dc_mat_door', 'dc_bear', 'dc_wardrobe', 'dc_chest', 'dc_beanbag']) expect(can, id).toContain(id);
    for (const id of cant) { expect(decorDef(id), id).toBeTruthy(); expect(can, id).not.toContain(id); }
    expect(can.length).toBe(30);
  });
});

describe('着色算法 dyePixels（按像素重新着色，保留明暗和描边）', () => {
  // 一块褐色木头：深描边、阴影、中间、高光，外加一个绿色小零件和一个透明像素
  const wood = () => px([40, 28, 20, 255], [120, 80, 40, 255], [170, 118, 60, 255], [214, 160, 96, 255], [60, 150, 70, 255], [0, 0, 0, 0]);
  it('主体色换成目标色相；描边、别的颜色的零件、透明像素不动；亮度顺序不变', () => {
    const d = wood(), t = DYES[9 - 1]; // 森林绿 h140
    dyePixels(d, 9);
    expect([d[0], d[1], d[2], d[3]]).toEqual([40, 28, 20, 255]);       // 描边
    expect([d[16], d[17], d[18], d[19]]).toEqual([60, 150, 70, 255]);  // 绿色小零件原样（它不是主体色）
    expect(d[23]).toBe(0);                                              // 透明
    for (const i of [1, 2, 3]) expect(Math.abs(hueOf(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) - t.h)).toBeLessThan(6);
    const L = [1, 2, 3].map((i) => lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])); expect(L[0]).toBeLessThan(L[1]); expect(L[1]).toBeLessThan(L[2]);
    expect(Math.abs(L[1] - t.l)).toBeLessThan(0.2);
  });
  it('原色 / 不合法的色号什么都不做；灰色家具也能染；全透明不出错', () => {
    const a = wood(), b = wood(); dyePixels(a, 0); dyePixels(a, 13); dyePixels(a, NaN); expect(Array.from(a)).toEqual(Array.from(b));
    const grey = px([30, 30, 34, 255], [120, 122, 128, 255], [150, 152, 158, 255], [200, 202, 206, 255]); dyePixels(grey, 10); // 天空蓝 h200
    expect([grey[0], grey[1], grey[2]]).toEqual([30, 30, 34]); for (const i of [1, 2, 3]) expect(Math.abs(hueOf(grey[i * 4], grey[i * 4 + 1], grey[i * 4 + 2]) - 200)).toBeLessThan(6);
    const none = px([0, 0, 0, 0], [0, 0, 0, 0]); dyePixels(none, 3); expect(Array.from(none)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('每种颜色染出来的主体亮度都落在目标亮度附近（深色染成白色、白色染成黑色都成立）', () => {
    for (let c = 1; c <= 12; c++) { const d = wood(); dyePixels(d, c); const l = lum(d[8], d[9], d[10]); expect(Math.abs(l - DYES[c - 1].l), DYES[c - 1].name).toBeLessThan(0.14); }
  });
});

describe('染色的摆放校验与存档清洗', () => {
  it('layError：色号必须是 1..12；不能染的家具不能带颜色；能染的带颜色合法', () => {
    const lay = defaultLay(0);
    expect(layError([...lay, P('dc_sofa', 3, 8, { c: 4 })])).toBeNull();
    expect(layError([...lay, P('dc_sofa', 3, 8, { c: 13 })])).toContain('颜色'); expect(layError([...lay, P('dc_sofa', 3, 8, { c: 0 })])).toContain('颜色'); expect(layError([...lay, P('dc_sofa', 3, 8, { c: 1.5 })])).toContain('颜色');
    expect(layError([...lay, P('dc_tv', 9, 3, { c: 2 })])).toContain('不能染色');
  });
  it('cleanLay：合法的颜色保留，不合法的 / 不能染家具的颜色丢掉但家具留着', () => {
    const out = cleanLay([{ d: 'dc_sofa', x: 3, y: 8, c: 5 }, { d: 'dc_stool', x: 5, y: 8, c: 99 }, { d: 'dc_tv', x: 9, y: 3, c: 2 }, { d: 'dc_chair', x: 11, y: 8, c: 'x' }], 0)!;
    expect(out).toEqual([{ d: 'dc_sofa', x: 3, y: 8, c: 5 }, { d: 'dc_stool', x: 5, y: 8 }, { d: 'dc_tv', x: 9, y: 3 }, { d: 'dc_chair', x: 11, y: 8 }]);
    expect(cleanDorm({ v: 2, lay: [{ d: 'dc_rug_paw', x: 2, y: 3, c: 7 }] })!.lay).toEqual([{ d: 'dc_rug_paw', x: 2, y: 3, c: 7 }]);
  });
});

describe('染色一步 layApply', () => {
  const setup = (inv: Record<string, number> = { dye: 2, dc_sofa: 1, dc_tv: 1 }) => { const d: DormSave = {}, v = { ...inv }; layApply(d, v, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); return { d, inv: v, i: layOf(d).length - 1 }; };
  it('染成颜色：用 1 份染料；同色不花钱；染回原色免费', () => {
    const { d, inv, i } = setup();
    expect(layApply(d, inv, { op: 'dye', i, c: 4 })).toMatchObject({ ok: true, msg: expect.stringContaining('樱粉') }); expect(inv.dye).toBe(1); // 2 份 → 染一次扣 1 份
    expect(layOf(d)[i].c).toBe(4);
  });
  it('染料：2 份染两次后没有了；第三次失败不改任何东西；同色失败不扣；0 = 免费染回', () => {
    const { d, inv, i } = setup({ dye: 2, dc_sofa: 1 });
    layApply(d, inv, { op: 'dye', i, c: 1 }); expect(inv.dye).toBe(1);
    expect(layApply(d, inv, { op: 'dye', i, c: 1 }).msg).toContain('已经是'); expect(inv.dye).toBe(1);
    layApply(d, inv, { op: 'dye', i, c: 2 }); expect(inv.dye).toBeUndefined(); expect(layOf(d)[i].c).toBe(2);
    const snap = JSON.stringify([d, inv]); expect(layApply(d, inv, { op: 'dye', i, c: 3 }).msg).toContain('没有染料'); expect(JSON.stringify([d, inv])).toBe(snap);
    expect(layApply(d, inv, { op: 'dye', i, c: 0 })).toMatchObject({ ok: true }); expect(layOf(d)[i].c).toBeUndefined(); expect(inv.dye).toBeUndefined();
    expect(layApply(d, inv, { op: 'dye', i, c: 0 }).msg).toContain('已经是');
  });
  it('不合法的操作：色号不对、不能染的家具、找不到那件；都不改任何东西', () => {
    const { d, inv, i } = setup({ dye: 5, dc_sofa: 1, dc_tv: 1 }); layApply(d, inv, { op: 'place', d: 'dc_tv', x: 9, y: 3 }); const tv = layOf(d).length - 1, snap = () => JSON.stringify([d, inv]), s0 = snap();
    for (const c of [13, -1, 1.5, NaN]) expect(layApply(d, inv, { op: 'dye', i, c }).ok).toBe(false);
    expect(layApply(d, inv, { op: 'dye', i: tv, c: 2 }).msg).toContain('不能染色'); expect(layApply(d, inv, { op: 'dye', i: 99, c: 2 }).ok).toBe(false); expect(layApply(d, inv, { op: 'dye', i: -1, c: 2 }).ok).toBe(false);
    expect(snap()).toBe(s0);
  });
  it('挪动、转向不褪色；收回背包会褪色（再摆出来是原色）；地毯重铺（放到最上面）也保留颜色', () => {
    const { d, inv, i } = setup({ dye: 3, dc_sofa: 1, dc_rug_red: 1 });
    layApply(d, inv, { op: 'dye', i, c: 6 });
    expect(layApply(d, inv, { op: 'move', i, x: 3, y: 7, r: 90 }).ok).toBe(true); expect(layOf(d)[i]).toMatchObject({ x: 3, y: 7, r: 90, c: 6 });
    layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 2, y: 3 }); const ri = layOf(d).length - 1; layApply(d, inv, { op: 'dye', i: ri, c: 3 });
    layApply(d, inv, { op: 'place', d: 'dc_mat_welcome', x: 2, y: 3 }); // 没有这件，无影响
    expect(layApply(d, inv, { op: 'move', i: ri, x: 2, y: 4 }).ok).toBe(true); expect(layOf(d).at(-1)).toMatchObject({ d: 'dc_rug_red', c: 3 });
    expect(layApply(d, inv, { op: 'pick', i }).ok).toBe(true); expect(inv.dc_sofa).toBe(1); layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 8 }); expect(layOf(d).at(-1)!.c).toBeUndefined();
  });
  it('摆新家具、不带颜色；染色后整体仍满足 layError', () => {
    const { d, inv, i } = setup(); layApply(d, inv, { op: 'dye', i, c: 12 }); expect(layError(layOf(d), 0)).toBeNull();
  });
});
