// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { Mon } from '@/shared/mons';
import { CONTENT } from '@/shared/mons-content';
import { MonPanel } from '@/ui/MonPanel';

type MonData = Extract<ServerMsg, { t: 'mon_data' }>;
type Sent = { t: string; id: string; move: string; drop: number };

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  sent: Sent[] = [];
  monGet = vi.fn();
  monReplace = vi.fn((id: string, move: string, drop: number) => { this.sent.push({ t: 'mon_replace', id, move, drop }); });
  monMove = vi.fn();
  monOrder = vi.fn();
  monNick = vi.fn();
  monFree = vi.fn();
  monStarter = vi.fn();
}

const data = (moves: string[], learnable?: string[]): MonData => {
  const m: Mon = {
    id: 'm1', sp: 'o01', lv: 20, xp: 0, hp: 20, iv: [0, 0, 0, 0, 0, 0],
    mv: moves.map((id) => ({ id, pp: CONTENT.moves.get(id)!.pp })), at: 0,
  };
  return { t: 'mon_data', sq: [m], bx: [], dex: {}, starter: true, starters: [], tamed: [], ...(learnable ? { learnable: { m1: learnable } } : {}) };
};

const pickFirst = () => (document.querySelector('.mon-row') as HTMLElement).click();
const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[];
const exact = (text: string) => buttons().filter((b) => b.textContent === text);
const learnButtons = () => [...document.querySelectorAll('.mon-learn-btn')] as HTMLButtonElement[];

let net: FakeNet;
let panel: MonPanel;
beforeEach(() => {
  document.body.replaceChildren();
  const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
  net = new FakeNet();
  panel = new MonPanel(net as unknown as NetClient);
  hud.append(panel.view);
});

describe('精灵面板 · 技能更换（B 方案）', () => {
  it('满 4 技能：每条技能有「更换」，选中后发 mon_replace 带槽位下标', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50'], ['火:s85']) as never);
    panel.enter(); pickFirst();
    expect(exact('更换')).toHaveLength(4);
    exact('更换')[0].click();
    const learn = learnButtons().find((b) => b.textContent?.includes('火·轰炸'));
    expect(learn).toBeTruthy();
    learn!.click();
    expect(net.sent).toEqual([{ t: 'mon_replace', id: 'm1', move: '火:s85', drop: 0 }]);
  });

  it('有空槽：显示「学习新技能」，点击后发 drop = -1', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85'], ['火:s85']) as never);
    panel.enter(); pickFirst();
    expect(exact('学习新技能')).toHaveLength(1);
    exact('学习新技能')[0].click();
    learnButtons().find((b) => b.textContent?.includes('火·轰炸'))!.click();
    expect(net.sent).toEqual([{ t: 'mon_replace', id: 'm1', move: '火:s85', drop: -1 }]);
  });

  it('空槽学会后，服务器推回的数据显示追加结果', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85'], ['火:s85']) as never);
    panel.enter(); pickFirst();
    exact('学习新技能')[0].click();
    learnButtons().find((b) => b.textContent?.includes('火·轰炸'))!.click();
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '火:s85']) as never);
    const rows = [...document.querySelectorAll('.mon-move')].map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(4);
    expect(rows[3]).toContain('火·轰炸');
  });

  it('没有 learnable：不显示任何更换 / 学习入口', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50']) as never);
    panel.enter(); pickFirst();
    expect(exact('更换')).toHaveLength(0);
    expect(exact('学习新技能')).toHaveLength(0);
    expect(learnButtons()).toHaveLength(0);
  });

  it('learnable 里的未知技能被跳过，不渲染、不崩溃', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50'], ['nope:move', '火:s85']) as never);
    panel.enter(); pickFirst(); exact('更换')[0].click();
    expect(learnButtons()).toHaveLength(1);
    expect(learnButtons()[0].textContent).toContain('火·轰炸');
    expect(document.body.textContent).not.toContain('nope:move');
  });

  it('点击替换后、服务器推回前：面板不本地修改 mv', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50'], ['火:s85']) as never);
    panel.enter(); pickFirst(); exact('更换')[0].click();
    learnButtons().find((b) => b.textContent?.includes('火·轰炸'))!.click();
    const rows = [...document.querySelectorAll('.mon-move')].map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(4);
    expect(rows.join('|')).toContain('火·冲击');
    expect(rows.join('|')).not.toContain('火·轰炸');
    expect(net.sent).toHaveLength(1);
  });

  it('服务器推回 mon_data 后：显示新技能与满 PP（重连 / 刷新后一致）', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50'], ['火:s85']) as never);
    panel.enter(); pickFirst(); exact('更换')[0].click();
    learnButtons().find((b) => b.textContent?.includes('火·轰炸'))!.click();
    net.handlers.mon?.(data(['火:s85', '火:s50', '火:p85', '一般:p50']) as never);
    const rows = [...document.querySelectorAll('.mon-move')].map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('火·轰炸');
    expect(rows[0]).toMatch(/PP 15\/15/);
    expect(rows.join('|')).not.toContain('火·冲击');
  });

  it('服务器 mon_result 返回后关闭选择器，避免二次点击', () => {
    net.handlers.mon?.(data(['火:p50', '火:s50', '火:p85', '一般:p50'], ['火:s85']) as never);
    panel.enter(); pickFirst(); exact('更换')[0].click();
    expect(learnButtons().length).toBeGreaterThan(0);
    net.handlers.monResult?.(true, '已学会');
    expect(learnButtons()).toHaveLength(0);
  });
});
