import { describe, expect, it } from 'vitest';
import { castHint, decideInteraction, type InteractInput } from '../src/scenes/world/interaction-rules';
import { CAT_REACH } from '../src/shared/cats';

/** 什么都没有、站在空地上的一帧 */
const base = (o: Partial<InteractInput> = {}): InteractInput => ({
  press: false, paxPid: 0, runActive: false, fishPhase: 'idle', sitting: false, riding: false, mateNear: false, online: true,
  lock: { phase: 'idle', cardOpen: false, catching: false }, cast: { state: 'ok', rodName: '竹节竿', baitName: '鱼饵', baitN: 5 }, fishSpot: false,
  near: null, home: false, cat: null, bird: null, baitN: 3, egg: null, mateBike: null, mateFar: null,
  bike: false, bin: -1, binLeft: -1, seat: null, inStart: false, npc: null, ...o,
});
const door = { ref: 'B', name: '图书馆', interior: false };
const cat = (dist: number) => ({ ref: 'C', label: '蒲公英', dist });

describe('按 E 的优先级（纯规则）', () => {
  it('空地上：清掉提示，没有动作', () => { expect(decideInteraction(base({ press: true }))).toEqual({ hint: null }); });
  it('只有按了键才有动作，提示一直有', () => {
    expect(decideInteraction(base({ seat: { ref: 's' } }))).toEqual({ hint: 'E  坐下', act: undefined });
    expect(decideInteraction(base({ seat: { ref: 's' }, press: true }))).toEqual({ hint: 'E  坐下', act: { t: 'sit', ref: 's' } });
  });
  it('状态优先：坐队友的车 > 校园跑 > 拉鱼 > 钓鱼中 > 坐着 > 骑车，都盖住门口和猫', () => {
    const all = { near: door, cat: cat(1), seat: { ref: 's' }, bike: true, press: true };
    expect(decideInteraction(base({ ...all, paxPid: 7 }))).toEqual({ hint: 'E  下车', act: { t: 'pax_leave' } });
    expect(decideInteraction(base({ ...all, runActive: true })).hint).toContain('校园跑进行中');
    expect(decideInteraction(base({ ...all, runActive: true })).act).toBeUndefined();
    expect(decideInteraction(base({ ...all, fishPhase: 'fight' }))).toEqual({ hint: undefined }); // 拉鱼：不碰提示
    expect(decideInteraction(base({ ...all, fishPhase: 'wait' }))).toEqual({ hint: 'E  收线（等鱼咬钩…）', act: { t: 'fish_cancel' } });
    expect(decideInteraction(base({ ...all, fishPhase: 'bite' }))).toEqual({ hint: 'E  提竿！！', act: { t: 'fish_reel' } });
    expect(decideInteraction(base({ ...all, sitting: true }))).toEqual({ hint: 'E  起身　X  表情', act: { t: 'stand' } });
    expect(decideInteraction(base({ ...all, riding: true }))).toEqual({ hint: 'E  锁车下车', act: { t: 'dismount' } });
    expect(decideInteraction(base({ ...all, riding: true, mateNear: true })).hint).toBe('E  锁车下车（想坐队友的后座，要先下车）');
  });
  it('猫 vs 建筑门口：站在门口时猫要够近（< 0.75 个够得着的距离）才抢提示', () => {
    expect(decideInteraction(base({ near: door, cat: cat(CAT_REACH * 0.5), press: true }))).toEqual({ hint: 'E  和「蒲公英」玩', act: { t: 'open_cat', ref: 'C' } });
    expect(decideInteraction(base({ near: door, cat: cat(CAT_REACH * 0.9), press: true })).hint).toBe('E  查看：图书馆');
    expect(decideInteraction(base({ cat: cat(CAT_REACH * 0.9) })).hint).toBe('E  和「蒲公英」玩'); // 没有门口：猫够得着就行
  });
  it('建筑门口：自己的宿舍楼回宿舍（要在线）；能进的进；不能进的弹说明', () => {
    expect(decideInteraction(base({ near: { ...door, name: '四社区E楼' }, home: true, press: true }))).toEqual({ hint: 'E  回宿舍（四社区E楼）', act: { t: 'dorm_enter' } });
    expect(decideInteraction(base({ near: { ...door, interior: true }, press: true }))).toEqual({ hint: 'E  进入：图书馆', act: { t: 'enter_interior', ref: 'B' } });
    expect(decideInteraction(base({ near: door, press: true })).act).toEqual({ t: 'dialog', title: '图书馆', text: '图书馆。内部暂未开放。' });
    expect(decideInteraction(base({ near: { ...door, desc: '藏书百万' }, press: true })).act).toEqual({ t: 'dialog', title: '图书馆', text: '藏书百万' });
  });
  it('彩蛋区：商店 / 钓具摊 / 校园墙 / 留言板各开各的面板，其余是彩蛋文字', () => {
    const egg = (action?: string) => base({ egg: { ref: 'E', hint: '按 E 看看', action }, press: true });
    expect(decideInteraction(egg('shop')).act).toEqual({ t: 'panel', which: 'shop' });
    expect(decideInteraction(egg('fishshop')).act).toEqual({ t: 'panel', which: 'fishshop' });
    expect(decideInteraction(egg('wall')).act).toEqual({ t: 'panel', which: 'wall' });
    expect(decideInteraction(egg('board')).act).toEqual({ t: 'panel', which: 'board' });
    expect(decideInteraction(egg()).act).toEqual({ t: 'egg', ref: 'E' });
    expect(decideInteraction(egg()).hint).toBe('按 E 看看');
  });
  it('水禽：在岸边够得着时优先于小猫；没连服务器 / 没饵只提示；门口和彩蛋区仍优先于水禽', () => {
    const bird = { id: 2, label: '白天鹅' };
    expect(decideInteraction(base({ bird, cat: cat(1), press: true }))).toEqual({ hint: 'E  喂「白天鹅」（鱼饵 ×3）', act: { t: 'bird_feed', id: 2 } });
    expect(decideInteraction(base({ bird, online: false, press: true })).act).toBeUndefined();
    expect(decideInteraction(base({ bird, baitN: 0, press: true })).hint).toContain('鱼饵用完了');
    expect(decideInteraction(base({ bird, near: door })).hint).toBe('E  查看：图书馆');
  });
  it('钓鱼沉浸：能抛竿的岸边抛竿优先于猫 / 单车 / 垃圾桶 / 长椅；结算卡片开着只剩抛竿', () => {
    const lock = { phase: 'idle' as const, cardOpen: false, catching: false, castable: true };
    const d = decideInteraction(base({ lock, fishSpot: true, cat: cat(1), bike: true, bin: 0, seat: { ref: 's' }, press: true }));
    expect(d).toEqual({ hint: 'E  抛竿钓鱼（竹节竿，鱼饵 ×5）', act: { t: 'cast' } });
    expect(decideInteraction(base({ lock: { phase: 'idle', cardOpen: true, catching: false }, fishSpot: false, cat: cat(1) }))).toEqual({ hint: null }); // 卡片开着、不在岸边：什么都不提示
    expect(decideInteraction(base({ lock: { phase: 'idle', cardOpen: true, catching: false }, fishSpot: true, press: true })).act).toEqual({ t: 'cast' });
  });
  it('湖边抛竿提示：没竿 / 没饵 / 指名饵没指定都只提示不动作', () => {
    for (const [state, text] of [['norod', '需要鱼竿'], ['nobait', '鱼饵用完了'], ['needtarget', '指名饵要先在背包']] as const) {
      const d = decideInteraction(base({ fishSpot: true, cast: { state }, press: true }));
      expect(d.hint).toContain(text); expect(d.act).toBeUndefined();
    }
    expect(castHint({ state: 'ok', rodName: '碳素竿', baitName: '香饵', baitN: 2 })).toBe('E  抛竿钓鱼（碳素竿，香饵 ×2）');
  });
  it('其余优先级：队友单车 > 共享单车 > 垃圾桶 > 长椅 > 校园跑起点（要在线）> 湖边 > 路人', () => {
    const p = { press: true };
    expect(decideInteraction(base({ ...p, mateBike: { uid: 9, name: '小明' }, bike: true, bin: 1 }))).toEqual({ hint: 'E  坐上 小明 的车后座', act: { t: 'pax_join', uid: 9 } });
    expect(decideInteraction(base({ ...p, mateFar: { name: '小红' } })).hint).toBe('小红 在骑车：走近他的车，按 E 坐后座');
    expect(decideInteraction(base({ ...p, mateFar: { name: '小红' }, bike: true })).act).toEqual({ t: 'mount' }); // 旁边有车就先扫码骑行
    expect(decideInteraction(base({ ...p, bike: true, bin: 1, seat: { ref: 's' } })).act).toEqual({ t: 'mount' });
    expect(decideInteraction(base({ ...p, bin: 4, binLeft: 7, seat: { ref: 's' } }))).toEqual({ hint: 'E  翻垃圾桶（今天还能翻 7 次）', act: { t: 'bin', idx: 4 } });
    expect(decideInteraction(base({ ...p, bin: 0 })).hint).toBe('E  翻垃圾桶');
    expect(decideInteraction(base({ ...p, seat: { ref: 's' }, inStart: true })).act).toEqual({ t: 'sit', ref: 's' });
    expect(decideInteraction(base({ ...p, inStart: true })).act).toEqual({ t: 'run_open' });
    expect(decideInteraction(base({ ...p, inStart: true, online: false })).hint).toBeNull(); // 离线：没有校园跑
    expect(decideInteraction(base({ ...p, fishSpot: true, npc: { ref: 'N' } })).act).toEqual({ t: 'cast' });
    expect(decideInteraction(base({ ...p, npc: { ref: 'N' } }))).toEqual({ hint: 'E  和同学聊聊', act: { t: 'talk', ref: 'N' } });
  });
});
