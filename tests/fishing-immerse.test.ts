import { describe, expect, it } from 'vitest';
import { FISHING_BLOCK_MSG, FISHING_OK_UI, fishingActive, fishingBlocksInteract, fishingBlocksUi, fishingPrefersCast, fishingRodOut, type FishLockState } from '../src/systems/fishlock';
import { ui, type UiAction } from '../src/ui/actions';

const st = (o: Partial<FishLockState> = {}): FishLockState => ({ phase: 'idle', cardOpen: false, catching: false, ...o });

describe('钓鱼沉浸（屏蔽其他互动）', () => {
  it('没在钓鱼：什么都不屏蔽', () => {
    expect(fishingActive(st())).toBe(false); expect(fishingBlocksInteract(st())).toBe(false); expect(fishingRodOut(st())).toBe(false);
    expect(fishingBlocksUi(st(), 'friends')).toBe(false);
  });
  it('抛竿 / 等鱼 / 咬钩 / 拉鱼：场景互动和会打断的界面入口都屏蔽', () => {
    for (const phase of ['wait', 'bite', 'fight'] as const) {
      expect(fishingBlocksInteract(st({ phase })), phase).toBe(true);
      for (const id of ['friends', 'teleport', 'mons', 'photo', 'emote', 'dorm', 'quest', 'board']) expect(fishingBlocksUi(st({ phase }), id), `${phase} ${id}`).toBe(true);
    }
  });
  it('背包（换竿换饵，含精灵页）、地图、设置（声音 / 聊天频道 / 沉浸 / 全屏 / 关于都在里面）：钓鱼中仍然可用', () => {
    for (const id of ['bag', 'map', 'settings']) { expect(FISHING_OK_UI.has(id)).toBe(true); expect(fishingBlocksUi(st({ phase: 'wait' }), id)).toBe(false); }
  });
  it('鱼飞出水面 / 结算卡片还在：场景互动继续屏蔽（只剩再抛一竿）；卡片停着的几秒里，界面入口可以正常开', () => {
    expect(fishingBlocksInteract(st({ catching: true }))).toBe(true); expect(fishingBlocksInteract(st({ cardOpen: true }))).toBe(true);
    expect(fishingBlocksUi(st({ catching: true }), 'friends')).toBe(true);
    expect(fishingBlocksUi(st({ cardOpen: true }), 'friends')).toBe(false);
    expect(fishingRodOut(st({ cardOpen: true }))).toBe(false);
  });
  it('站在能抛竿的岸边：抛竿优先（小猫、单车等让位）；不能抛（没竿 / 没饵 / 没面朝水）就不抢', () => {
    expect(fishingPrefersCast(st({ castable: true }))).toBe(true); expect(fishingPrefersCast(st({ castable: false }))).toBe(false); expect(fishingPrefersCast(st())).toBe(false);
  });
  it('ui 入口守卫：被挡下时不执行、只提示；放行时正常执行', () => {
    let ran = 0, said = '';
    const a: UiAction = { id: 'friends', label: '好友', run: () => { ran++; } };
    ui.guard = (x) => (fishingBlocksUi(st({ phase: 'wait' }), x.id) ? FISHING_BLOCK_MSG : null); ui.onBlocked = (m) => { said = m; };
    ui.invoke(a); expect(ran).toBe(0); expect(said).toBe(FISHING_BLOCK_MSG);
    ui.invoke({ id: 'bag', label: '背包', run: () => { ran++; } }); expect(ran).toBe(1);
    ui.guard = null; ui.onBlocked = null;
    ui.invoke(a); expect(ran).toBe(2);
  });
});
