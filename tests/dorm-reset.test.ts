import { describe, expect, it } from 'vitest';
import { defaultLay, layError, layCounts } from '../src/shared/decor';
import { RESET_UNDO_MS, layApply, layOf, layReset, layUndo, type DormSave } from '../src/shared/dorm';
import type { Inv } from '../src/shared/items';

const total = (inv: Inv) => Object.values(inv).reduce((a, b) => a + b, 0);

describe('宿舍一键还原 / 撤回', () => {
  it('没动过的默认房间：不用还原', () => {
    const d: DormSave = {}, inv: Inv = {};
    const r = layReset(d, inv); expect(r.ok).toBe(false); expect(r.msg).toContain('刚住进来'); expect(d.lay).toBeUndefined(); expect(inv).toEqual({});
  });
  it('收回一件再还原：默认件用背包里那一份摆回去，不会凭空多出家具', () => {
    const d: DormSave = {}, inv: Inv = {};
    const di = layOf(d).findIndex((p) => p.d === 'dc_deskpc');
    expect(layApply(d, inv, { op: 'pick', i: layOf(d).findIndex((p) => p.d === 'dc_chairup') }).ok).toBe(true);
    expect(layApply(d, inv, { op: 'pick', i: layOf(d).findIndex((p) => p.d === 'dc_deskpc') }).ok).toBe(true);
    expect(di).toBeGreaterThan(-1); expect(inv).toEqual({ dc_chairup: 1, dc_deskpc: 1 });
    const r = layReset(d, inv); expect(r.ok).toBe(true);
    expect(layOf(d)).toEqual(defaultLay(0)); expect(inv).toEqual({}); // 收回的两件被摆回了默认位置，背包还是空的
    expect(layReset(d, inv).ok).toBe(false); // 已经还原了，再点不会再多出东西
  });
  it('额外摆的家具全部回背包；染色褪掉；默认没有的不摆；撤回后一切照旧', () => {
    const d: DormSave = {}, inv: Inv = { dc_sofa: 1, dc_rug_red: 1 };
    expect(layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 5 }).ok).toBe(true);
    expect(layApply(d, inv, { op: 'place', d: 'dc_rug_red', x: 5, y: 6 }).ok).toBe(true); // 地毯可以叠在默认那块上
    const before = { lay: JSON.parse(JSON.stringify(layOf(d))), inv: { ...inv } };
    const r = layReset(d, inv); expect(r.ok).toBe(true);
    expect(layOf(d)).toEqual(defaultLay(0));
    expect(inv).toEqual({ dc_sofa: 1, dc_rug_red: 1 }); // 多摆的地毯和沙发回了背包，默认那套还在原位
    expect(layError(layOf(d))).toBeNull();
    const u = layUndo(d, inv, r.snap!); expect(u.ok).toBe(true);
    expect(layOf(d)).toEqual(before.lay); expect(inv).toEqual(before.inv);
  });
  it('背包总量守恒：还原前后「背包 + 房间」每种家具的总数不变', () => {
    const d: DormSave = {}, inv: Inv = { dc_sofa: 2, dc_plant: 3 };
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 5 }); layApply(d, inv, { op: 'place', d: 'dc_plant', x: 2, y: 9 });
    const sum = () => { const c = layCounts(layOf(d)); for (const [k, v] of Object.entries(inv)) c[k] = (c[k] ?? 0) + v; return c; };
    const before = sum(); expect(layReset(d, inv).ok).toBe(true); expect(sum()).toEqual(before);
  });
  it('反复还原不能刷家具：每个来回总量都不变', () => {
    const d: DormSave = {}, inv: Inv = {};
    layApply(d, inv, { op: 'pick', i: layOf(d).findIndex((p) => p.d === 'dc_plant') });
    const start = total(inv) + layOf(d).length;
    for (let k = 0; k < 4; k++) { const r = layReset(d, inv); if (r.ok) layUndo(d, inv, r.snap!); expect(total(inv) + layOf(d).length).toBe(start); }
  });
  it('撤回：背包里的东西不够了（卖了 / 用了）不能撤回；超时不能撤回；失败不改任何东西', () => {
    const d: DormSave = {}, inv: Inv = { dc_sofa: 1 };
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 5 });
    const r = layReset(d, inv, 1000); expect(r.ok).toBe(true);
    delete inv.dc_sofa; const keepLay = JSON.stringify(d.lay), keepInv = JSON.stringify(inv);
    const u = layUndo(d, inv, r.snap!, 2000); expect(u.ok).toBe(false); expect(u.msg).toContain('不够'); expect(JSON.stringify(d.lay)).toBe(keepLay); expect(JSON.stringify(inv)).toBe(keepInv);
    inv.dc_sofa = 1; expect(layUndo(d, inv, r.snap!, 1000 + RESET_UNDO_MS + 1).ok).toBe(false);
    expect(layUndo(d, inv, r.snap!, 1000 + RESET_UNDO_MS).ok).toBe(true);
  });
  it('背包放不下（单种 999）时拒绝还原，什么都不动', () => {
    const d: DormSave = {}, inv: Inv = { dc_sofa: 1 };
    layApply(d, inv, { op: 'place', d: 'dc_sofa', x: 3, y: 5 }); inv.dc_sofa = 999;
    const keep = JSON.stringify(d.lay); const r = layReset(d, inv); expect(r.ok).toBe(false); expect(r.msg).toContain('放不下'); expect(JSON.stringify(d.lay)).toBe(keep); expect(inv.dc_sofa).toBe(999);
  });
});
