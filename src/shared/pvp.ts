/**
 * 玩家对战（PvP）：客户端与服务器共用，纯函数 + 注入随机源。
 *
 * 与 PvE 的 `battle.ts` 不同：双方都是玩家，各自有自己的队伍和行动；每回合双方都提交后
 * 才结算（按速度 / 优先级排先后），服务器把同一个事件列表推给两边。
 *
 * 复用 `mons.ts` 的伤害、命中、能力等级、状态异常规则，不重写。
 * 不读也不写玩家存档：队伍是满血副本，打完就丢。
 */
import {
  calcDamage, hitRate, maxHp, monStats, restore, type Content, type Mon, type Move, type Rng, type Stats,
} from './mons';
import { stageMul, type StatusState } from './mons';
import {
  applyStatus, bumpStage, clearStatus, hasStatus, paraSpeMul, runChance, stagesOf, statusOf,
  type Action, type BEvent, type StageStages,
} from './battle';
import type { Battle } from './battle';

export type PvpResult = 'win' | 'lose' | 'fled' | 'timeout';

export interface PvpSide {
  uid: number;
  name: string;
  squad: Mon[];
  /** 当前上场在 squad 里的下标 */
  lead: number;
  /** 本回合提交的行动（结算前填） */
  act?: Action;
  /** 本回合是否已提交（包括超时自动跳过） */
  ready: boolean;
}

export interface PvpBattle {
  bid: string;
  turn: number;
  a: PvpSide;
  b: PvpSide;
  phase: 'choose' | 'over';
  result?: { winner: 'a' | 'b' | 'none'; reason: PvpResult };
  /** 双方的能力等级 / 状态（按精灵 id，各自独立） */
  stages: Map<string, StageStages>;
  status: Map<string, StatusState[]>;
  /** 逃跑尝试次数（按 uid） */
  runs: Map<number, number>;
}

/** 双方各自的事件列表（同一个回合里按出手顺序排列） */
export interface PvpStepResult { ok: boolean; err?: string; a: BEvent[]; b: BEvent[] }

const foeSide = (bb: PvpBattle, side: 'a' | 'b'): PvpSide => (side === 'a' ? bb.b : bb.a);
const selfSide = (bb: PvpBattle, side: 'a' | 'b'): PvpSide => (side === 'a' ? bb.a : bb.b);
const monOf = (s: PvpSide): Mon => s.squad[s.lead];

/** 满血副本：不碰存档 */
export const fullSquad = (ct: Content, squad: readonly Mon[]): Mon[] => squad.map((m) => { const c = { ...m, mv: m.mv.map((x) => ({ ...x })) }; restore(ct, c); return c; });

export function startPvp(bid: string, a: { uid: number; name: string; squad: Mon[] }, b: { uid: number; name: string; squad: Mon[] }): PvpBattle {
  return {
    bid, turn: 1, phase: 'choose',
    a: { ...a, lead: 0, ready: false }, b: { ...b, lead: 0, ready: false },
    stages: new Map(), status: new Map(), runs: new Map(),
  };
}

/** 某个玩家这一方 */
export const sideOfUid = (bb: PvpBattle, uid: number): 'a' | 'b' | null => (bb.a.uid === uid ? 'a' : bb.b.uid === uid ? 'b' : null);

const aliveSide = (s: PvpSide): boolean => s.squad.some((m) => m.hp > 0);

/** 提交行动；双方都提交后调用 `pvpStep` 结算 */
export function submit(bb: PvpBattle, uid: number, act: Action): { ok: boolean; err?: string } {
  if (bb.phase === 'over') return { ok: false, err: '战斗已经结束' };
  const side = sideOfUid(bb, uid);
  if (!side) return { ok: false, err: '你不在这场对战里' };
  const s = selfSide(bb, side);
  if (s.ready) return { ok: false, err: '这一回合已经提交过了' };
  // 校验：出招下标、PP、换人对象
  if (act.t === 'move') {
    const mon = monOf(s);
    if (!Number.isInteger(act.i) || act.i < 0 || act.i >= mon.mv.length) return { ok: false, err: '没有这个技能' };
    if (mon.mv[act.i].pp <= 0 && mon.mv.some((x) => x.pp > 0)) return { ok: false, err: '这个技能的 PP 用完了' };
  } else if (act.t === 'swap') {
    if (!Number.isInteger(act.i) || !s.squad[act.i] || s.squad[act.i].hp <= 0 || act.i === s.lead) return { ok: false, err: '这只精灵不能出战' };
  } else if (act.t === 'ball') return { ok: false, err: '对战里不能用零食包' };
  else if (act.t !== 'run') return { ok: false, err: '未知行动' };
  s.act = act; s.ready = true;
  return { ok: true };
}

const moveOf = (ct: Content, id: string): Move => ct.moves.get(id) ?? ({ id: 'struggle', name: '挣扎', type: '', cat: 'physical', power: 40, acc: 100, pp: 1 } as Move);

/**
 * 一个回合的结算：双方都已提交后调用。
 * 返回给两边各自的事件列表（顺序一致，只是视角不同）。
 */
export function pvpStep(ct: Content, bb: PvpBattle, rnd: Rng): PvpStepResult {
  const evA: BEvent[] = [], evB: BEvent[] = [];
  if (bb.phase === 'over') return { ok: false, err: '战斗已经结束', a: evA, b: evB };
  if (!bb.a.ready || !bb.b.ready) return { ok: false, err: '还没准备好', a: evA, b: evB };
  const actOf = (s: PvpSide): Action => s.act ?? { t: 'run' };
  const overRef = bb as { phase: 'choose' | 'over'; result?: { winner: 'a' | 'b' | 'none'; reason: PvpResult } };

  /** 一方出手：返回对方是否倒下 */
  const perform = (atkSide: 'a' | 'b', act: Action): boolean => {
    const atk = selfSide(bb, atkSide), def = foeSide(bb, atkSide);
    const me = monOf(atk), foe = monOf(def);
    if (me.hp <= 0) return false;
    // 不能行动：睡 / 冻直接跳过；麻痹 25%
    const st = statusOf(bb, me);
    if (st.some((x) => x.k === 'sleep')) { evA.push({ t: 'blocked', side: 'me', k: 'sleep' }); evB.push({ t: 'blocked', side: 'foe', k: 'sleep' }); return false; }
    if (st.some((x) => x.k === 'freeze')) {
      if (rnd() < 0.2) { clearStatus(bb, me, 'freeze'); evA.push({ t: 'statusend', side: 'me', k: 'freeze' }); evB.push({ t: 'statusend', side: 'foe', k: 'freeze' }); }
      else { evA.push({ t: 'blocked', side: 'me', k: 'freeze' }); evB.push({ t: 'blocked', side: 'foe', k: 'freeze' }); return false; }
    } else if (hasStatus(bb, me, 'paralysis') && rnd() < 0.25) {
      evA.push({ t: 'blocked', side: 'me', k: 'paralysis' }); evB.push({ t: 'blocked', side: 'foe', k: 'paralysis' }); return false;
    }

    const pushBoth = (e: BEvent, mirror: (m: BEvent) => BEvent) => { evA.push(e); evB.push(mirror(e)); };

    if (act.t === 'run') {
      const tries = bb.runs.get(atk.uid) ?? 0; bb.runs.set(atk.uid, tries + 1);
      const mySpe = monStats(ct, me).spe * stageMul(stagesOf(bb, me).spe) * paraSpeMul(bb, me);
      const foeSpe = monStats(ct, foe).spe * stageMul(stagesOf(bb, foe).spe) * paraSpeMul(bb, foe);
      if (rnd() < runChance(mySpe, foeSpe, tries)) {
        pushBoth({ t: 'escape' }, (x) => x);
        bb.phase = 'over'; bb.result = { winner: atkSide === 'a' ? 'b' : 'a', reason: 'fled' };
        return false;
      }
      pushBoth({ t: 'stuck' }, (x) => x);
      return false;
    }

    if (act.t === 'swap') {
      atk.lead = act.i;
      pushBoth({ t: 'swap', i: act.i }, (x) => x);
      return false;
    }

    if (act.t === 'move') {
      const mv = me.mv[act.i];
      if (!mv) return false;
      if (mv.pp > 0) mv.pp--;
      const move = monOf(atk).mv.every((x) => x.pp <= 0) ? moveOf(ct, 'struggle') : moveOf(ct, mv.id);
      pushBoth({ t: 'use', side: 'me', move: move.id }, (x) => ({ t: 'use', side: 'foe', move: (x as Extract<BEvent, { t: 'use' }>).move }));
      const atkStats = monStats(ct, me), defStats = monStats(ct, foe);
      const accDiff = stagesOf(bb, me).acc - stagesOf(bb, foe).eva;
      if (rnd() * 100 >= hitRate(move.acc, accDiff)) { pushBoth({ t: 'miss', side: 'me' }, (x) => ({ t: 'miss', side: 'foe' })); return false; }
      const r = calcDamage(ct,
        { lv: me.lv, stats: atkStats, types: ct.species.get(me.sp)?.types ?? [] },
        { stats: defStats, types: ct.species.get(foe.sp)?.types ?? [] }, move, rnd);
      foe.hp = Math.max(0, foe.hp - r.dmg);
      pushBoth({ t: 'hit', side: 'foe', dmg: r.dmg, hp: foe.hp, mult: r.mult, crit: r.crit }, (x) => ({ t: 'hit', side: 'me', dmg: r.dmg, hp: foe.hp, mult: r.mult, crit: r.crit }));
      // 附带状态
      if (move.status && foe.hp > 0 && rnd() * 100 < move.status.chance && applyStatus(bb, foe, move.status.s, rnd)) {
        pushBoth({ t: 'status', side: 'foe', k: move.status.s }, (x) => ({ t: 'status', side: 'me', k: (x as Extract<BEvent, { t: 'status' }>).k }));
      }
      // 附带能力变化
      if (move.stat && foe.hp > 0 && rnd() * 100 < (move.stat.chance ?? 100)) {
        const target = move.stat.target === 'self' ? me : foe;
        const targetSide = move.stat.target === 'self' ? 'me' : 'foe';
        const { d, v } = bumpStage(bb, target, move.stat.k, move.stat.d);
        if (d !== 0) pushBoth({ t: 'stage', side: targetSide, k: move.stat.k, d, v }, (x) => ({ t: 'stage', side: (x as Extract<BEvent, { t: 'stage' }>).side === 'me' ? 'foe' : 'me', k: move.stat!.k, d, v }));
      }
      if (foe.hp <= 0) { pushBoth({ t: 'faint', side: 'foe' }, (x) => ({ t: 'faint', side: 'me' })); bb.stages.delete(foe.id); return true; }
    }
    return false;
  };

  // 先手：优先级 > 速度（含能力等级 / 麻痹）
  const aAct = actOf(bb.a), bAct = actOf(bb.b);
  const prio = (act: Action): number => (act.t === 'move' ? (moveOf(ct, monOf(bb.a).mv[act.i]?.id ?? '').priority ?? 0) : 0);
  const speOf = (s: PvpSide): number => { const m = monOf(s); return monStats(ct, m).spe * stageMul(stagesOf(bb, m).spe) * paraSpeMul(bb, m); };
  const aFirst = prio(aAct) !== prio(bAct) ? prio(aAct) > prio(bAct) : speOf(bb.a) !== speOf(bb.b) ? speOf(bb.a) > speOf(bb.b) : rnd() < 0.5;

  let over = false;
  const aDown = () => !aliveSide(bb.a), bDown = () => !aliveSide(bb.b);
  if (aFirst) {
    const d = perform('a', aAct);
    if (!d && overRef.phase !== 'over') perform('b', bAct);
  } else {
    const d = perform('b', bAct);
    if (!d && overRef.phase !== 'over') perform('a', aAct);
  }

  // 倒下的一方自动换下一只（还有活的就继续）
  const autoSwap = (s: PvpSide, ev: BEvent[], mine: boolean): void => {
    if (monOf(s).hp > 0) return;
    const next = s.squad.findIndex((m) => m.hp > 0);
    if (next < 0) return;
    s.lead = next;
    ev.push({ t: 'swap', i: next });
    void mine;
  };
  if (overRef.phase !== 'over') { autoSwap(bb.a, evA, true); autoSwap(bb.b, evA, false); }

  // 判胜负
  if (overRef.phase !== 'over') {
    if (aDown() && bDown()) { bb.phase = 'over'; bb.result = { winner: 'none', reason: 'lose' }; }
    else if (aDown()) { bb.phase = 'over'; bb.result = { winner: 'b', reason: 'lose' }; }
    else if (bDown()) { bb.phase = 'over'; bb.result = { winner: 'a', reason: 'lose' }; }
  }

  // 清理提交状态
  bb.a.ready = false; bb.b.ready = false; bb.a.act = undefined; bb.b.act = undefined;
  if (bb.phase === 'over') return { ok: true, a: evA, b: evB };
  bb.turn++;
  return { ok: true, a: evA, b: evB };
}

/** 某一方的公开状态（客户端显示用） */
export function sideView(ct: Content, s: PvpSide, bb: PvpBattle) {
  return {
    uid: s.uid, name: s.name, lead: s.lead,
    squad: s.squad.map((m) => ({ sp: m.sp, lv: m.lv, hp: m.hp, max: maxHp(ct, m), ...(m.sh ? { sh: 1 as const } : {}) })),
    stages: stagesOf(bb, monOf(s)) as Record<string, number>,
    status: statusOf(bb, monOf(s)).map((x) => x.k),
  };
}
