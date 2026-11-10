// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { NetClient } from '@/net/client';

const net = () => new NetClient('ws://test', 'token', () => ({}) as never);

describe('联机消息 · 技能更换', () => {
  it('monReplace 发出 mon_replace，字段与契约一致', () => {
    const n = net();
    const sent: string[] = [];
    n.status = 'online';
    (n as unknown as { ws: { send(s: string): void } }).ws = { send: (s) => sent.push(s) };
    n.monReplace('m1', '火:s85', 0);
    expect(JSON.parse(sent[0])).toEqual({ t: 'mon_replace', id: 'm1', move: '火:s85', drop: 0 });
  });

  it('mon_data 的 learnable 原样交给界面', () => {
    const n = net();
    const got: unknown[] = [];
    n.handlers.mon = (d) => { got.push(d); };
    (n as unknown as { onServer(m: unknown): void }).onServer({
      t: 'mon_data', sq: [], bx: [], dex: {}, starter: false, starters: [], tamed: [],
      learnable: { m1: ['火:s85'] },
    });
    expect((got[0] as { learnable: Record<string, string[]> }).learnable).toEqual({ m1: ['火:s85'] });
  });
});
