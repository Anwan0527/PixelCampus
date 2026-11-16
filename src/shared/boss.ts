/**
 * 世界 BOSS（组队 PVE）：客户端与服务器共用，纯函数 + 注入随机源。
 *
 * 与 PvP 的差别：
 * - 多人（1–4）共享同一个 BOSS 血条；所有玩家都提交后才结算。
 * - BOSS 在所有人行动后反击一次（打随机存活玩家）。
 * - 阶段：血量跨过 70% / 40% 时切换，只触发一次。
 *
 * 复用 `mons.ts` 与 `battle.ts` 的伤害、命中、能力等级、状态规则。
 * 不写玩家存档：队伍是满血副本。
 */
import {
  calcDamage, hitRate, makeRng, maxHp, monStats, newMon, restore, type Content, type Mon, type Move, type Rng, type StatusState,
} from './mons';
import {
  applyStatus, bumpStage, clearStatus, stagesOf, statusOf,
  type Action, type BEvent, type StageStages,
} from './battle';

/** 一号 BOSS：精工湖·青鳞（现有物种 o09 放大） */
export const BOSS_DEF = {
  id: 'lake-qinglin',
  name: '精工湖·青鳞',
  sp: 'o09',
  lv: 30,
  /** 1–4 人时的血量倍数（占位值，之后按实测调） */
  hpMul: [8, 12, 16, 20] as const,
  /** 阶段阈值与攻击倍率（占位值） */
  stages: [
    { at: 0.7, atkMul: 1.2, label: '第二阶段' },
    { at: 0.4, atkMul: 1.5, label: '第三阶段' },
  ] as const,
  /** 首杀奖励 */
  reward: { coins: 2000, items: [{ id: 'box_crate', n: 1 }] },
  /** 重复击杀：每人平分（占位值） */
  repeatCoins: 200,
  /** 每回合行动超时 */
  turnMs: 45000,
  /** 断线可重连时间 */
  disconnectMs: 30000,
  /** 全员断线多久结束 */
  allGoneMs: 60000,
  /** 挑战距离（像素）；10 格 = 必须站在岛上或栈桥尽头，对岸够不着。客户端提示与服务端校验共用 */
  reachPx: 160,
} as const;

/**
 * 入口：精工湖**湖心岛亭台**正北的空地（世界格坐标）。
 * 湖心岛在 `data/campus/terrain/10-lake.json` 的 grass 多边形里，亭台 rect 是 (198.6, 97.4, 3 × 3.6)；
 * 选这儿是因为它在岛上、离亭台的碰撞有 0.6 格余量，服务器 `standNear` 兜底时也不会把人放进水里。
 * 客户端提示 / 服务端校验 / 传送点都读这一个值，别在别处再写坐标。
 */
export const BOSS_SPOT = { x: 399, y: 193 } as const; // = (199.5, 96.5) 原 5 m/格 × 2

/** 传送面板里的「湖心岛 · 世界 BOSS」落点（**世界格**坐标 = 原始 5 m/格 × geo 的 scale；其它传送点也都用世界格） */
export const BOSS_POI = { tx: 399, ty: 193 } as const;

/**
 * 世界 BOSS 的战斗事件：在通用 `BEvent` 上附带 uid（这条事件是哪个玩家的精灵/行动）。
 * 单人战斗用 `BEvent` 就够了；多人共享一场时界面要靠 uid 认出「谁被打中了」。
 */
export type BossEvent = BEvent & { uid?: number };

export interface BossPlayer {
  uid: number;
  name: string;
  squad: Mon[];
  lead: number;
  act?: Action;
  ready: boolean;
  /** 全部精灵倒下 = 退出（不再出招） */
  down: boolean;
}

export interface BossBattle {
  bid: string;
  turn: number;
  boss: Mon;
  bossMax: number;
  /** 当前阶段（0 = 初始，1 = 第二阶段，2 = 第三阶段） */
  stage: number;
  players: BossPlayer[];
  phase: 'choose' | 'over';
  result?: { winner: 'players' | 'boss'; reason: 'faint' | 'timeout' | 'left' };
  stages: Map<string, StageStages>;
  status: Map<string, StatusState[]>;
  rnd: Rng;
}

/** 唯一状态容器（Pvp/Boss 共用同一套 helper，但 status 用数组） */
type Holder = { stages: Map<string, StageStages>; status: Map<string, StatusState[]> };

export function startBoss(ct: Content, players: { uid: number; name: string; squad: Mon[] }[], rnd: Rng): BossBattle {
  const boss = newMon(ct, BOSS_DEF.sp, BOSS_DEF.lv, makeRng(123456), `boss-${Date.now()}`, 0);
  const mul = BOSS_DEF.hpMul[Math.max(0, Math.min(3, players.length - 1))];
  boss.hp = maxHp(ct, boss) * mul;
  const bossMax = boss.hp;
  return {
    bid: `boss${Date.now().toString(36)}`,
    turn: 1, boss, bossMax, stage: 0, phase: 'choose',
    players: players.map((p) => ({ ...p, lead: 0, ready: false, down: false })),
    stages: new Map(), status: new Map(), rnd,
  };
}

const holder = (bb: BossBattle): Holder => ({ stages: bb.stages, status: bb.status });

/** 玩家是否有活精灵 */
const playerAlive = (p: BossPlayer): boolean => p.squad.some((m) => m.hp > 0);
const leadMon = (p: BossPlayer): Mon => p.squad[p.lead];

/** 提交行动 */
export function submitBoss(bb: BossBattle, uid: number, act: Action): { ok: boolean; err?: string } {
  if (bb.phase === 'over') return { ok: false, err: '挑战已经结束' };
  const p = bb.players.find((x) => x.uid === uid);
  if (!p) return { ok: false, err: '你不在这场挑战里' };
  if (p.down) return { ok: false, err: '你的精灵都倒下了' };
  if (p.ready) return { ok: false, err: '这一回合已经提交过了' };
  if (act.t === 'ball') return { ok: false, err: 'BOSS 战不能用零食包' };
  if (act.t === 'move') {
    const mon = leadMon(p);
    if (!Number.isInteger(act.i) || act.i < 0 || act.i >= mon.mv.length) return { ok: false, err: '没有这个技能' };
    if (mon.mv[act.i].pp <= 0 && mon.mv.some((x) => x.pp > 0)) return { ok: false, err: '这个技能的 PP 用完了' };
  } else if (act.t === 'swap') {
    if (!Number.isInteger(act.i) || !p.squad[act.i] || p.squad[act.i].hp <= 0 || act.i === p.lead) return { ok: false, err: '这只精灵不能出战' };
  }
  p.act = act; p.ready = true;
  return { ok: true };
}

const moveOf = (ct: Content, id: string): Move => ct.moves.get(id) ?? ({ id: 'struggle', name: '挣扎', type: '', cat: 'physical', power: 40, acc: 100, pp: 1 } as Move);

/** 当前阶段应有的攻击倍率 */
const stageAtkMul = (bb: BossBattle): number => (bb.stage === 0 ? 1 : BOSS_DEF.stages[bb.stage - 1]?.atkMul ?? 1);

/**
 * 超时跳过：还没提交的玩家这一回合自动「空过」，不阻塞其他人和 BOSS 反击。
 * 已经提交的玩家不受影响。返回被跳过的 uid。
 */
export function skipIdle(bb: BossBattle): number[] {
  const skipped: number[] = [];
  for (const p of bb.players) {
    if (p.down || p.ready) continue;
    p.act = undefined; p.ready = true;
    skipped.push(p.uid);
  }
  return skipped;
}

/**
 * 一个回合：所有 ready 的玩家依次出招 → BOSS 反击一次 → 阶段 / 胜负检查。
 * 返回给每个玩家的事件（同一个回放列表）。
 */
export function bossStep(ct: Content, bb: BossBattle, now = 0): { ok: boolean; err?: string; ev: BossEvent[]; perUid: Map<number, BossEvent[]> } {
  const ev: BossEvent[] = [], perUid = new Map<number, BossEvent[]>();
  void now;
  if (bb.phase === 'over') return { ok: false, err: '挑战已经结束', ev, perUid };
  const ready = bb.players.filter((p) => p.ready && !p.down);
  for (const p of ready) {
    const act = p.act; if (!act) continue;
    const h = holder(bb), me = leadMon(p), boss = bb.boss;
    if (act.t === 'run') { ev.push({ t: 'escape', uid: p.uid }); p.down = true; p.ready = false; continue; }
    if (act.t === 'swap') { p.lead = act.i; ev.push({ t: 'swap', i: act.i, uid: p.uid }); p.ready = false; continue; }
    if (act.t !== 'move') { p.ready = false; continue; }
    const slot = act.i, mv = me.mv[slot]; if (!mv) { p.ready = false; continue; }
    if (mv.pp > 0) mv.pp--;
    const move = moveOf(ct, mv.id);
    ev.push({ t: 'use', side: 'me', move: move.id, uid: p.uid });
    const st = statusOf(h, me);
    if (st.some((x) => x.k === 'sleep')) { ev.push({ t: 'blocked', side: 'me', k: 'sleep', uid: p.uid }); p.ready = false; continue; }
    if (st.some((x) => x.k === 'freeze')) {
      if (bb.rnd() < 0.2) { clearStatus(h, me, 'freeze'); ev.push({ t: 'statusend', side: 'me', k: 'freeze', uid: p.uid }); }
      else { ev.push({ t: 'blocked', side: 'me', k: 'freeze', uid: p.uid }); p.ready = false; continue; }
    }
    const accDiff = stagesOf(h, me).acc - stagesOf(h, boss).eva;
    if (bb.rnd() * 100 >= hitRate(move.acc, accDiff)) { ev.push({ t: 'miss', side: 'me', uid: p.uid }); p.ready = false; continue; }
    const r = calcDamage(ct,
      { lv: me.lv, stats: monStats(ct, me), types: ct.species.get(me.sp)?.types ?? [] },
      { stats: monStats(ct, boss), types: ct.species.get(boss.sp)?.types ?? [] }, move, bb.rnd);
    boss.hp = Math.max(0, boss.hp - r.dmg);
    ev.push({ t: 'hit', side: 'foe', uid: p.uid, dmg: r.dmg, hp: boss.hp, mult: r.mult, crit: r.crit });
    if (move.status && boss.hp > 0 && bb.rnd() * 100 < move.status.chance && applyStatus(h, boss, move.status.s, bb.rnd)) {
      ev.push({ t: 'status', side: 'foe', k: move.status.s, uid: p.uid });
    }
    if (move.stat && boss.hp > 0 && bb.rnd() * 100 < (move.stat.chance ?? 100)) {
      const target = move.stat.target === 'self' ? me : boss;
      const { d, v } = bumpStage(h, target, move.stat.k, move.stat.d);
      if (d !== 0) ev.push({ t: 'stage', side: move.stat.target === 'self' ? 'me' : 'foe', k: move.stat.k, d, v, uid: p.uid });
    }
    p.ready = false;
    if (boss.hp <= 0) break;
  }

  // 阶段：跨过阈值才触发，只触发一次
  for (let i = bb.stage; i < BOSS_DEF.stages.length; i++) {
    const st = BOSS_DEF.stages[i];
    if (bb.boss.hp / bb.bossMax <= st.at) {
      bb.stage = i + 1;
      ev.push({ t: 'bossphase', n: bb.stage + 1, label: st.label });
    }
  }

  // BOSS 反击一次：打随机存活玩家
  if (bb.boss.hp > 0) {
    const alive = bb.players.filter((p) => !p.down && playerAlive(p));
    if (alive.length) {
      const target = alive[Math.floor(bb.rnd() * alive.length)];
      const h = holder(bb), boss = bb.boss;
      const mv = moveOf(ct, boss.mv.length ? boss.mv[Math.floor(bb.rnd() * boss.mv.length)].id : 'struggle');
      ev.push({ t: 'use', side: 'foe', move: mv.id });
      const r = calcDamage(ct,
        { lv: boss.lv, stats: monStats(ct, boss), types: ct.species.get(boss.sp)?.types ?? [] },
        { stats: monStats(ct, target.squad[target.lead]), types: ct.species.get(target.squad[target.lead].sp)?.types ?? [] },
        { ...mv, power: Math.round(mv.power * stageAtkMul(bb)) }, bb.rnd);
      const me = target.squad[target.lead];
      me.hp = Math.max(0, me.hp - r.dmg);
      ev.push({ t: 'hit', side: 'me', uid: target.uid, dmg: r.dmg, hp: me.hp, mult: r.mult, crit: r.crit });
      if (me.hp <= 0) {
        ev.push({ t: 'faint', side: 'me', uid: target.uid });
        bb.stages.delete(me.id);
        bb.status.delete(me.id);
      }
    }
  }

  // 倒下处理：换下一只 or 标记 down
  // 注意：倒下那只的 faint 事件已经在 BOSS 反击里发过了，这里不再重复发（否则界面会喊两次「倒下了」）
  for (const p of bb.players) {
    if (p.down) continue;
    if (leadMon(p).hp > 0) continue;
    const next = p.squad.findIndex((m) => m.hp > 0);
    if (next >= 0) { p.lead = next; ev.push({ t: 'swap', i: next, uid: p.uid }); }
    else { p.down = true; p.ready = false; ev.push({ t: 'bossout', uid: p.uid }); }
  }

  // 胜负
  if (bb.boss.hp <= 0) { bb.phase = 'over'; bb.result = { winner: 'players', reason: 'faint' }; }
  else if (bb.players.every((p) => p.down)) { bb.phase = 'over'; bb.result = { winner: 'boss', reason: 'faint' }; }
  else { for (const p of bb.players) p.ready = false; bb.turn++; }

  // 便于客户端：同一份事件给所有人（附带 uid 时也别让每个人只看到自己的那一份）
  for (const p of bb.players) perUid.set(p.uid, ev);
  return { ok: true, ev, perUid };
}

/** 剩余活着的玩家数（显示用） */
export const alivePlayers = (bb: BossBattle): number => bb.players.filter((p) => !p.down).length;

/** 按人数缩放后的血量上限 */
export function bossMaxHp(ct: Content, players: number): number {
  return maxHp(ct, { sp: BOSS_DEF.sp, lv: BOSS_DEF.lv, iv: [0, 0, 0, 0, 0, 0], hp: 0, xp: 0, mv: [], at: 0, id: '' }) * BOSS_DEF.hpMul[Math.max(0, Math.min(3, players - 1))];
}

/** 满血副本 */
export const bossSquad = (ct: Content, squad: readonly Mon[]): Mon[] => squad.map((m) => { const c = { ...m, mv: m.mv.map((x) => ({ ...x })) }; restore(ct, c); return c; });
