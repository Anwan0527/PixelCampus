// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import { CodexPanel } from '@/ui/CodexPanel';

type MonData = Extract<ServerMsg, { t: 'mon_data' }>;
type Dex = Record<string, { s: number; c: number }>;
const data = (dex: Dex): MonData => ({ t: 'mon_data', sq: [], bx: [], dex, starter: true, starters: [], tamed: [] });

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  status = 'online';
  monGet = vi.fn();
  getFishdex = vi.fn();
  getGeardex = vi.fn();
  getFx = vi.fn();
  getInv = vi.fn();
  bundleClaim = vi.fn();
}

const deps = (mons: () => MonData | null) => ({
  cats: () => ({ defs: [], aff: {}, nicks: {}, info: {} }),
  inv: () => ({}),
  gear: () => ({ rod: '', bait: '' }),
  mons,
});

const cells = () => [...document.querySelectorAll('.mon-dex-cell')] as HTMLElement[];
const cellOf = (text: string) => cells().find((c) => (c.textContent ?? '').includes(text));
const detail = () => document.querySelector('.mon-dex-detail')?.textContent ?? '';

let net: FakeNet;
beforeEach(() => {
  document.body.replaceChildren();
  const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
  net = new FakeNet();
});

const make = (mons: () => MonData | null) => new CodexPanel(net as unknown as NetClient, {} as never, deps(mons));

describe('精灵图鉴 · CodexPanel', () => {
  it('P1：打开精灵图鉴，显示总进度和 83 个格子', () => {
    const panel = make(() => data({ o01: { s: 1, c: 1 }, o02: { s: 1, c: 0 } }));
    panel.open('mons');
    expect(net.monGet).toHaveBeenCalled();
    expect(document.querySelector('.mon-dex-sum')?.textContent).toContain('已见 2 / 83');
    expect(document.querySelector('.mon-dex-sum')?.textContent).toContain('已收服 1 / 83');
    expect(cells()).toHaveLength(83);
  });

  it('P5：未见过卡片只显示剪影 + No. +「？？？」；详情只有「还没遇到」', () => {
    const panel = make(() => data({ o01: { s: 1, c: 0 } }));
    panel.open('mons');
    const cell = cellOf('？？？');
    expect(cell).toBeTruthy();
    expect(cell!.querySelector('.mon-dex-silhouette')).toBeTruthy();
    expect(cell!.querySelector('img')).toBeNull();
    cell!.click();
    expect(detail()).toContain('？？？');
    expect(detail()).toContain('还没遇到');
    expect(detail()).not.toContain('焰尾');
  });

  it('P7/P9：点见过精灵显示 No.、属性、描述、栖息地、记录', () => {
    const panel = make(() => data({ o01: { s: 3, c: 1 } }));
    panel.open('mons');
    cellOf('焰尾')!.click();
    expect(detail()).toContain('焰尾');
    expect(detail()).toContain('No.001');
    expect(detail()).toContain('火');
    expect(detail()).toContain('尾巴');
    expect(detail()).toContain('图书馆西侧林地');
    expect(detail()).toContain('见过 3');
    expect(detail()).toContain('收服 1');
  });

  it('P11：关闭图鉴后筛选重置，「全部」恢复', () => {
    const panel = make(() => data({ o01: { s: 1, c: 0 }, o02: { s: 1, c: 0 } }));
    panel.open('mons');
    const sel = document.querySelector('select[aria-label="按属性筛选"]') as HTMLSelectElement;
    sel.value = '火'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(cells().length).toBe(1);
    panel.close();
    panel.open('mons');
    expect((document.querySelector('select[aria-label="按属性筛选"]') as HTMLSelectElement).value).toBe('');
    expect(cells().length).toBe(83);
  });

  it('N8：筛选为空显示「没有符合条件的精灵」', () => {
    const panel = make(() => data({ o01: { s: 1, c: 0 } }));
    panel.open('mons');
    const sel = document.querySelector('select[aria-label="按属性筛选"]') as HTMLSelectElement;
    sel.value = '水'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(cells()).toHaveLength(0);
    expect(document.querySelector('.mon-dex-empty')?.textContent).toContain('没有符合条件的精灵');
  });

  it('P10：没有 mon_data 时显示「读取中…」', () => {
    const panel = make(() => null);
    panel.open('mons');
    expect(document.querySelector('.mon-dex-empty')?.textContent).toContain('读取中…');
  });
});
