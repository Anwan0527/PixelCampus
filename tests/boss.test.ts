import { describe, it, expect } from 'vitest';
import { teleportCell, teleportDef } from '@/shared/teleport';
import { TILE } from '@/core/const';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import {
  BOSS_DEF, BOSS_POI, BOSS_SPOT, alivePlayers, bossMaxHp, bossSquad, bossStep, skipIdle, startBoss, submitBoss, type BossBattle,
} from '@/shared/boss';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, types: string[]): Species => ({ id, no: 1, name: id, types, base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset: [{ lv: 1, id: '一般:p50' }] });
const CT: Content = makeContent(OPEN, [sp('a', ['一般']), sp('o09', ['龙'])]);
const mon = (id: string, s = 'a') => newMon(CT, s, 30, () => 0.5, id, 0);

const mk = (n = 2): BossBattle => {
  const players = Array.from({ length: n }, (_, i) => ({ uid: i + 1, name: `P${i + 1}`, squad: bossSquad(CT, [mon(`p${i + 1}`), mon(`p${i + 1}b`)]) }));
  return startBoss(CT, players, makeRng(5));
};

describe('BOSS 定义与缩放', () => {
  it('P3：血量按人数缩放 8 / 12 / 16 / 20 倍', () => {
    const base = bossMaxHp(CT, 1);
    expect(bossMaxHp(CT, 2)).toBe(base * 1.5);
    expect(bossMaxHp(CT, 3)).toBe(base * 2);
    expect(bossMaxHp(CT, 4)).toBe(base * 2.5);
    expect(BOSS_DEF.hpMul).toEqual([8, 12, 16, 20]);
  });

  it('N5：BOSS 血量不超上限、不低于 0', () => {
    const bb = mk();
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    bossStep(CT, bb);
    expect(bb.boss.hp).toBeGreaterThanOrEqual(0);
    expect(bb.boss.hp).toBeLessThanOrEqual(bb.bossMax);
  });
});

describe('共享血条', () => {
  it('P3：多人伤害累计到同一个血条', () => {
    const bb = mk(2);
    const hp0 = bb.boss.hp;
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    const r = bossStep(CT, bb);
    const hits = r.ev.filter((e) => e.t === 'hit' && e.side === 'foe').length;
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(bb.boss.hp).toBeLessThan(hp0);
  });

  it('全员 ready 才结算；只提交一人不推进', () => {
    const bb = mk(2);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    expect(bb.turn).toBe(1);
    submitBoss(bb, 2, { t: 'move', i: 0 });
    bossStep(CT, bb);
    expect(bb.turn).toBe(2);
  });
});

describe('阶段', () => {
  it('P4/P5/N6：跨过 70% / 40% 才触发，且只触发一次', () => {
    const bb = mk(2);
    bb.boss.hp = Math.floor(bb.bossMax * 0.69);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    bossStep(CT, bb);
    expect(bb.stage).toBe(1);
    const stage1 = bb.stage;
    bb.boss.hp = Math.floor(bb.bossMax * 0.39);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    bossStep(CT, bb);
    expect(bb.stage).toBe(2);
    expect(bb.stage).toBeGreaterThan(stage1);
  });
});

describe('胜负与退出', () => {
  it('P6：单人全倒 → down，但队伍继续', () => {
    const bb = mk(2);
    bb.players[0].squad.forEach((m) => { m.hp = 1; });
    bb.boss.hp = 99999;
    let guard = 0;
    while (!bb.players[0].down && guard++ < 20) {
      submitBoss(bb, 1, { t: 'move', i: 0 });
      submitBoss(bb, 2, { t: 'move', i: 0 });
      bossStep(CT, bb);
    }
    expect(bb.players[0].down).toBe(true);
    expect(bb.phase).toBe('choose');
  });

  it('P7/N11：全员倒下 → 失败', () => {
    const bb = mk(2);
    bb.players.forEach((p) => p.squad.forEach((m) => { m.hp = 1; }));
    bb.boss.hp = 99999;
    let guard = 0;
    while (bb.phase !== 'over' && guard++ < 40) {
      submitBoss(bb, 1, { t: 'move', i: 0 });
      submitBoss(bb, 2, { t: 'move', i: 0 });
      bossStep(CT, bb);
    }
    expect(bb.phase).toBe('over');
    expect(bb.result?.winner).toBe('boss');
  });

  it('P8：BOSS 血量归零 → 玩家胜利', () => {
    const bb = mk(1);
    bb.boss.hp = 1;
    submitBoss(bb, 1, { t: 'move', i: 0 });
    bossStep(CT, bb);
    expect(bb.phase).toBe('over');
    expect(bb.result?.winner).toBe('players');
  });

  it('N8：相同种子结果一致', () => {
    const run = (seed: number) => {
      const players = [1, 2].map((i) => ({ uid: i, name: `P${i}`, squad: bossSquad(CT, [mon(`p${i}`)]) }));
      const bb = startBoss(CT, players, makeRng(seed));
      submitBoss(bb, 1, { t: 'move', i: 0 });
      submitBoss(bb, 2, { t: 'move', i: 0 });
      const r = bossStep(CT, bb);
      return { ev: r.ev, hp: bb.boss.hp };
    };
    expect(run(9)).toEqual(run(9));
  });

  it('N2：非法 / 不存在玩家被拒', () => {
    const bb = mk(2);
    expect(submitBoss(bb, 99, { t: 'move', i: 0 }).ok).toBe(false);
  });

  it('N4：零食包被拒', () => {
    const bb = mk(2);
    expect(submitBoss(bb, 1, { t: 'ball', mul: 1 }).ok).toBe(false);
  });

  it('alivePlayers 正确统计', () => {
    const bb = mk(3);
    expect(alivePlayers(bb)).toBe(3);
    bb.players[0].down = true;
    expect(alivePlayers(bb)).toBe(2);
  });
});

describe('超时跳过（P10 / N8）', () => {
  it('没提交的人被跳过，其他人照常结算，BOSS 反击', () => {
    const bb = mk(2);
    const hp0 = bb.boss.hp;
    submitBoss(bb, 1, { t: 'move', i: 0 });
    expect(skipIdle(bb)).toEqual([2]);
    expect(bb.players[1].ready).toBe(true);
    const r = bossStep(CT, bb);
    expect(r.ok).toBe(true);
    expect(bb.turn).toBe(2);          // 不卡死
    expect(bb.boss.hp).toBeLessThan(hp0);
  });

  it('倒下的玩家不会被跳过计数', () => {
    const bb = mk(2);
    bb.players[1].down = true;
    expect(skipIdle(bb)).toEqual([1]);
  });

  it('已经提交的人不会被跳过', () => {
    const bb = mk(2);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    expect(skipIdle(bb)).toEqual([]);
  });
});

describe('阶段事件', () => {
  it('阶段切换发 bossphase，带阶段号与中文叫法（不再借用 learn）', () => {
    const bb = mk(2);
    bb.boss.hp = Math.floor(bb.bossMax * 0.69);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    const r = bossStep(CT, bb);
    const ph = r.ev.filter((e) => e.t === 'bossphase');
    expect(ph).toHaveLength(1);
    expect(ph[0]).toMatchObject({ n: 2, label: '第二阶段' });
    expect(r.ev.some((e) => e.t === 'learn' && String((e as { move: string }).move).startsWith('__stage'))).toBe(false);
  });
});

describe('多人事件归属', () => {
  it('玩家事件带 uid，界面才能认出是谁的精灵', () => {
    const bb = mk(2);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    const r = bossStep(CT, bb);
    const mine = r.ev.filter((e) => 'side' in e && e.side === 'me' && 'uid' in e);
    expect(mine.length).toBeGreaterThan(0);
    for (const e of mine) expect([1, 2]).toContain((e as { uid: number }).uid);
  });

  it('perUid 每人都拿到同一份回放', () => {
    const bb = mk(2);
    submitBoss(bb, 1, { t: 'move', i: 0 });
    submitBoss(bb, 2, { t: 'move', i: 0 });
    const r = bossStep(CT, bb);
    expect(r.perUid.get(1)).toBe(r.ev);
    expect(r.perUid.get(2)).toBe(r.ev);
  });
});

describe('入口坐标', () => {
  it('BOSS 点在湖心岛上，且离亭台不远（客户端提示与服务端校验共用）', () => {
    expect(BOSS_SPOT).toEqual({ x: 399, y: 193 });
    // 世界格坐标 = 原 5 m/格 × 2；入口离亭台中心（198.6..201.6, 97.4..101.0 的格）不超过 5 格
    expect(Math.hypot(BOSS_SPOT.x - 2 * 200, BOSS_SPOT.y - 2 * 99.2)).toBeLessThan(2 * 5);
  });

  it('传送落点与入口用同一套世界格坐标（别再写成原始 5 m/格，会把玩家传到别处）', () => {
    expect(BOSS_POI).toEqual({ tx: BOSS_SPOT.x, ty: BOSS_SPOT.y });
  });

  it('传送点解析出来就落在入口上，玩家传过去立刻能挑战', () => {
    const def = teleportDef('boss');
    expect(def?.name).toContain('世界 BOSS');
    const c = teleportCell(def!, { pois: [], buildings: [] });
    expect(c).toEqual({ x: BOSS_SPOT.x, y: BOSS_SPOT.y });
    // 服务端把人放在目标格中心；这个距离必须 < 挑战半径
    expect(Math.hypot(0.5 * TILE, 0.5 * TILE)).toBeLessThan(BOSS_DEF.reachPx);
  });
});

describe('N13：不碰存档血量', () => {
  it('startBoss 复制的是满血副本，原数组不被改', () => {
    const orig = [mon('keep')];
    orig[0].hp = 1;
    const bb = startBoss(CT, [{ uid: 1, name: 'A', squad: bossSquad(CT, orig) }], makeRng(1));
    expect(orig[0].hp).toBe(1);
    expect(bb.players[0].squad[0].hp).toBe(maxHp(CT, bb.players[0].squad[0]));
  });
});
