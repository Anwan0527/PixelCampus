// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@/audio/sfx', () => ({ sfx: vi.fn() }));

import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { BEvent } from '@/shared/battle';
import type { Mon } from '@/shared/mons';
import { BattleUi } from '@/ui/BattleUi';

type Bt = Extract<ServerMsg, { t: 'mon_bt' }>;

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  monGo = vi.fn();
  monAct = vi.fn();
}

const mon = (): Mon => ({
  id: 'm1', sp: 'o01', lv: 20, xp: 0, hp: 30, iv: [0, 0, 0, 0, 0, 0],
  mv: [
    { id: '火:p50', pp: 25 }, { id: '火:s50', pp: 25 },
    { id: '火:p85', pp: 15 }, { id: '一般:p50', pp: 25 },
  ], at: 0,
});

const bt = (over: Partial<Bt> = {}): Bt => ({
  t: 'mon_bt', bid: 'b1', turn: 1, phase: 'choose', lead: 0, sq: [mon()],
  foe: { sp: 'o04', lv: 5, hp: 10, max: 20 }, ev: [], ball: 3, zone: '测试', ...over,
});

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const tick = async () => { await vi.runAllTimersAsync(); await flush(); };

let net: FakeNet;
let ui: BattleUi;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.body.replaceChildren();
  const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
  net = new FakeNet();
  ui = new BattleUi(net as unknown as NetClient);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const send = async (msg: Bt) => { net.handlers.monBt?.(msg); await tick(); };
const showMoves = () => {
  const b = [...document.querySelectorAll('.bt-menu .btn')].find((x) => x.textContent === '战斗') as HTMLButtonElement;
  b.click();
};

describe('战斗界面 · 招式信息 / 血量 / 结算 / 快进', () => {
  it('出招菜单显示属性、物理/特殊、威力、命中、PP、克制', async () => {
    await send(bt());
    showMoves();
    const moves = [...document.querySelectorAll('.bt-move')] as HTMLButtonElement[];
    expect(moves).toHaveLength(4);
    const fire = moves[0].textContent ?? '';
    expect(fire).toContain('火');
    expect(fire).toContain('物理');
    expect(fire).toContain('威力50');
    expect(fire).toContain('命中100%');
    expect(fire).toContain('PP 25/25');
    expect(fire).toContain('克制');
    const normal = moves[3].textContent ?? '';
    expect(normal).not.toContain('克制');
    expect(normal).not.toContain('削弱');
  });

  it('对手显示 hp/max，我方显示属性；max = 0 不出现 NaN', async () => {
    await send(bt());
    expect(document.querySelector('.bt-card.foe')?.textContent).toContain('10/20');
    expect(document.querySelector('.bt-card.me')?.textContent).toContain('火');
    document.body.replaceChildren();
    const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
    ui = new BattleUi(net as unknown as NetClient);
    await send(bt({ foe: { sp: 'o04', lv: 5, hp: 10, max: 0 } }));
    const text = document.querySelector('.bt-card.foe')?.textContent ?? '';
    expect(text).toContain('10/1');
    expect(text).not.toMatch(/NaN|Infinity/);
  });

  it('结算页显示经验 / 升级 / 进化 / 学招 / 收服，每项一次', async () => {
    const ev: BEvent[] = [
      { t: 'xp', i: 0, gain: 12 }, { t: 'level', i: 0, lv: 21 }, { t: 'evolve', i: 0, to: 'o02' },
      { t: 'learn', i: 0, move: '火:s85', full: true }, { t: 'caught' },
    ];
    await send(bt({ phase: 'over', result: 'win', ev }));
    const rows = [...document.querySelectorAll('.bt-sum-row')].map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(5);
    expect(rows.join('|')).toContain('获得 12 点经验');
    expect(rows.join('|')).toContain('升到了 Lv.21');
    expect(rows.join('|')).toContain('进化完成');
    expect(rows.join('|')).toContain('想学会 火·轰炸，但技能已满；可在精灵面板更换');
    expect(rows.join('|')).toContain('收服了 葱头');
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('over 但没有事件：只显示结果，不显示空行', async () => {
    await send(bt({ phase: 'over', result: 'win', ev: [] }));
    expect(document.querySelector('.bt-sum-title')?.textContent).toContain('战斗胜利');
    expect(document.querySelectorAll('.bt-sum-row')).toHaveLength(0);
  });

  it('升级满技能：战斗日志出现「可在精灵面板更换」', async () => {
    await send(bt({ turn: 1 }));
    await send(bt({ turn: 2, ev: [{ t: 'learn', i: 0, move: '火:s85', full: true }] }));
    expect(document.querySelector('.bt-log')?.textContent).toContain('想学会 火·轰炸，但技能已满；可在精灵面板更换');
  });

  it('进化满技能：日志出现进化 + 可在精灵面板更换', async () => {
    await send(bt({ turn: 1 }));
    await send(bt({ turn: 2, ev: [{ t: 'evolve', i: 0, to: 'o02' }, { t: 'learn', i: 0, move: '火:s85', full: true }] }));
    const log = document.querySelector('.bt-log')?.textContent ?? '';
    expect(log).toContain('进化成了');
    expect(log).toContain('想学会 火·轰炸，但技能已满；可在精灵面板更换');
  });

  it('快进按钮切换 aria-pressed 并持久化到 localStorage', async () => {
    await send(bt());
    const fast = document.querySelector('.bt-fast') as HTMLButtonElement;
    expect(fast.getAttribute('aria-pressed')).toBe('false');
    fast.click();
    expect(fast.getAttribute('aria-pressed')).toBe('true');
    expect(fast.textContent).toContain('开');
    expect(localStorage.getItem('pixelcampus.mon.btFast')).toBe('1');
    document.body.replaceChildren();
    const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
    ui = new BattleUi(net as unknown as NetClient);
    expect((document.querySelector('.bt-fast') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('localStorage 抛异常时快进默认关闭、不报错', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no storage'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('no storage'); });
    document.body.replaceChildren();
    const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
    expect(() => { ui = new BattleUi(net as unknown as NetClient); }).not.toThrow();
    const fast = document.querySelector('.bt-fast') as HTMLButtonElement;
    expect(fast.getAttribute('aria-pressed')).toBe('false');
    expect(() => fast.click()).not.toThrow();
  });
});
