/**
 * 世界 BOSS 的源码安全扫描（spec N1 / N12）：
 * - 客户端只发请求、按服务器事件播放，不能自己结算 BOSS 伤害或判定胜负。
 * - 玩家可见文字一律 textContent，不用 innerHTML。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(f(p), 'utf8');

const UI = read('../src/ui/BossUi.ts');
const SHARED = read('../src/shared/boss.ts');
const CLIENT_NET = read('../src/net/client.ts');

describe('N12：玩家可见文字不用 innerHTML', () => {
  it('BossUi 不出现 innerHTML / outerHTML / insertAdjacentHTML', () => {
    expect(UI).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
});

describe('N1：客户端不结算', () => {
  it('BossUi 不调用伤害 / 阶段 / 胜负判定（只用 CONTENT 查名字）', () => {
    expect(UI).not.toMatch(/calcDamage|bossStep|skipIdle|startBoss|submitBoss/);
    // 界面里不该出现「自己算血」的写法
    expect(UI).not.toMatch(/boss\.hp\s*[-+]?=/);
  });

  it('shared/boss.ts 不写存档字段（负责战斗的只有纯逻辑）', () => {
    expect(SHARED).not.toMatch(/progress\.|store\.|addCoins|grant\(/);
  });

  it('客户端网络层只发消息，不判定结果', () => {
    expect(CLIENT_NET).toMatch(/bossChallenge\(\)/);
    expect(CLIENT_NET).toMatch(/bossAct\(/);
    expect(CLIENT_NET).not.toMatch(/boss\.hp\s*[-+]?=/);
  });
});

describe('协议：7 条 BOSS 消息', () => {
  it('客户端 4 条、服务器 3 条', () => {
    const proto = read('../src/shared/protocol.ts');
    for (const t of ['boss_challenge', 'boss_reply', 'boss_act', 'boss_leave']) expect(proto).toContain(`t: '${t}'`);
    for (const t of ['boss_invite', 'boss_state', 'boss_end']) expect(proto).toContain(`t: '${t}'`);
  });

  it('client.ts 的 handler 与 case 都接上了', () => {
    for (const t of ['boss_invite', 'boss_state', 'boss_end']) {
      expect(CLIENT_NET).toContain(`case '${t}'`);
    }
  });
});
