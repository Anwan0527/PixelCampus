import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(f(p), 'utf8');

describe('PvP · 源码安全约定', () => {
  it('N12：PvP 界面 / 共享规则不使用 innerHTML', () => {
    for (const p of ['../src/ui/PvpUi.ts', '../src/shared/pvp.ts']) {
      expect(read(p), p).not.toMatch(/innerHTML|outerHTML/);
    }
  });

  it('N1：客户端不结算（PvpUi 不引用 calcDamage / pvpStep）', () => {
    const ui = read('../src/ui/PvpUi.ts');
    expect(ui).not.toMatch(/calcDamage|pvpStep|submit\(/);
  });

  it('协议里有 PvP 消息', () => {
    const proto = read('../src/shared/protocol.ts');
    for (const t of ['pvp_invite', 'pvp_reply', 'pvp_act', 'pvp_leave', 'pvp_state', 'pvp_end']) {
      expect(proto, t).toContain(`'${t}'`);
    }
  });
});
