/**
 * 野外 1 对 1 战斗（客户端与服务器共用，纯函数 + 注入随机源）。
 * 服务器持有 Battle，只接受"当前回合"的行动，用自己的随机数结算，把事件列表发给客户端播放；
 * 客户端只显示，不参与结算。捕捉道具的倍率由服务器按背包里真实的道具填，不信任客户端。
 *
 * 一个回合：玩家选一个行动（技能/道具/换精灵/逃跑）→ 按优先级和速度排出手顺序 → 结算 → 野生精灵反击 →
 * 判胜负。野生精灵血量归零 = 胜利（经验给出战的精灵）；我方首发倒下且队里还有活的 = 要求换人；全部倒下 = 失败。
 */
import {
  MON, STAGE_KEYS, STAGE_MAX, STRUGGLE, calcDamage, catchChance, learnsetOf, moveSlots, maxHp, monStats, stageMul, xpForLevel, xpGain,
  type Content, type Mon, type Move, type Rng, type StageKey, type Stats, type StatusKind, type StatusState,
} from './mons';

export type Action =
  | { t: 'move'; i: number }
  /** mul = 道具的捕捉倍率（服务器按背包里真实的道具填） */
  | { t: 'ball'; mul: number }
  | { t: 'swap'; i: number }
  | { t: 'run' };

export type Side = 'me' | 'foe';
export type BEvent =
  | { t: 'use'; side: Side; move: string }
  | { t: 'miss'; side: Side }
  | { t: 'hit'; side: Side; dmg: number; hp: number; mult: number; crit: boolean }
  | { t: 'faint'; side: Side }
  | { t: 'swap'; i: number }
  | { t: 'throw' }
  | { t: 'shake'; n: number }
  | { t: 'caught' }
  | { t: 'break' }
  | { t: 'escape' }
  | { t: 'stuck' }
  | { t: 'xp'; i: number; gain: number }
  | { t: 'level'; i: number; lv: number }
  | { t: 'learn'; i: number; move: string; full: boolean }
  /** 进化了：i = 队伍里的位置，to = 进化后的物种 */
  | { t: 'evolve'; i: number; to: string }
  /** 能力等级变化：k = 哪一项，d = 实际变化（可能被 ±6 截断），v = 变化后的等级 */
  | { t: 'stage'; side: Side; k: StageKey; d: number; v: number }
  /** 状态异常施加：k = 哪种，v = 睡眠剩余回合（其他状态没有） */
  | { t: 'status'; side: Side; k: StatusKind; v?: number }
  /** 状态异常每回合掉血（毒 / 灼伤） */
  | { t: 'statusdmg'; side: Side; k: StatusKind; dmg: number; hp: number }
  /** 状态解除：k = 哪种 */
  | { t: 'statusend'; side: Side; k: StatusKind }
  /** 因为状态（睡眠 / 冰冻 / 麻痹）这回合不能行动 */
  | { t: 'blocked'; side: Side; k: StatusKind };

export interface Battle {
  bid: string;
  turn: number;
  wild: Mon;
  squad: Mon[];
  /** 当前首发在 squad 里的下标 */
  lead: number;
  /** 参战过的下标（胜利后分经验） */
  fought: number[];
  phase: 'choose' | 'swap' | 'over';
  result?: 'win' | 'lose' | 'caught' | 'fled';
  /** 已经试过几次逃跑（越试越容易） */
  runs: number;
  /** 能力等级：按精灵 id 记（换下再上场沿用；倒下时删除）；只活在 Battle 里，不进存档 */
  stages: Map<string, StageStages>;
  /** 异常状态：按精灵 id 记（换下再上场保留；倒下 / 战斗结束时删除）；只活在 Battle 里，不进存档 */
  status: Map<string, StatusState>;
}

/** 一只精灵的战斗内能力等级（±6）；命中 / 闪避本批只记录、显示，不接入命中判定 */
export type StageStages = Record<StageKey, number>;

/** 全 0 的能力等级 */
export const zeroStages = (): StageStages => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

export interface StepResult { ok: boolean; err?: string; ev: BEvent[] }

export function startBattle(bid: string, wild: Mon, squad: Mon[]): Battle {
  const lead = squad.findIndex((m) => m.hp > 0);
  if (lead < 0) throw new Error('队伍里没有能战斗的精灵');
  return { bid, turn: 1, wild, squad, lead, fought: [lead], phase: 'choose', runs: 0, stages: new Map(), status: new Map() };
}


/** 取某个精灵的能力等级（没有就建一份全 0 的） */
export function stagesOf(b: Battle, mon: Mon): StageStages {
  let s = b.stages.get(mon.id);
  if (!s) { s = zeroStages(); b.stages.set(mon.id, s); }
  return s;
}
/** 改一项能力等级，截断到 ±6；返回实际变化（0 = 已经到顶 / 触底） */
export function bumpStage(b: Battle, mon: Mon, k: StageKey, d: number): { d: number; v: number } {
  const s = stagesOf(b, mon);
  const before = s[k];
  const after = Math.max(-STAGE_MAX, Math.min(STAGE_MAX, before + d));
  s[k] = after;
  return { d: after - before, v: after };
}
/** 把六维按能力等级放大：攻 / 防 / 特攻 / 特防 / 速度生效（生命不参与） */
export function stagedStats(st: Stats, s: StageStages): Stats {
  return { ...st, atk: st.atk * stageMul(s.atk), def: st.def * stageMul(s.def), spa: st.spa * stageMul(s.spa), spd: st.spd * stageMul(s.spd), spe: st.spe * stageMul(s.spe) };
}


// ------------------------------------------------------------------ 状态异常
const SLEEP_FREEZE: readonly StatusKind[] = ['sleep', 'freeze'];
/** 取某个精灵的状态（没有就是 undefined） */
export const statusOf = (b: Battle, mon: Mon): StatusState | undefined => b.status.get(mon.id);

/**
 * 施加状态：同种状态不叠加、不刷新；睡眠和冰冻互斥；成功返回 true。
 * 睡眠随机 1–3 回合（用注入的随机源）。
 */
export function applyStatus(b: Battle, mon: Mon, k: StatusKind, rnd: Rng): boolean {
  const cur = b.status.get(mon.id);
  if (cur) {
    if (cur.k === k) return false;                       // 同种：无效
    if (SLEEP_FREEZE.includes(cur.k) && SLEEP_FREEZE.includes(k)) return false; // 睡眠 / 冰冻互斥
  }
  b.status.set(mon.id, k === 'sleep' ? { k, n: 1 + Math.floor(rnd() * 3) } : { k });
  return true;
}
/** 解除状态；返回是否真的解除了 */
export function clearStatus(b: Battle, mon: Mon): boolean { return b.status.delete(mon.id); }

/** 灼伤：物理攻击威力减半（作用在攻击方的攻击力上） */
export const burnAtkMul = (b: Battle, mon: Mon): number => (statusOf(b, mon)?.k === 'burn' ? 0.5 : 1);
/** 麻痹：速度减半 */
export const paraSpeMul = (b: Battle, mon: Mon): number => (statusOf(b, mon)?.k === 'paralysis' ? 0.5 : 1);
/** 睡眠 / 冰冻：完全不能行动 */
export const cannotAct = (b: Battle, mon: Mon): StatusKind | null => {
  const st = statusOf(b, mon);
  return st && SLEEP_FREEZE.includes(st.k) ? st.k : null;
};
/** 捕捉加成：睡眠 / 冰冻 ×2 */
export const catchStatusMul = (b: Battle, mon: Mon): number => (statusOf(b, mon) && SLEEP_FREEZE.includes(statusOf(b, mon)!.k) ? 2 : 1);

const alive = (b: Battle) => b.squad.some((m) => m.hp > 0);

/** 逃跑成功率：速度比野生精灵快就容易，每失败一次 +10% */
export function runChance(mySpe: number, foeSpe: number, tries: number): number {
  return Math.max(0.25, Math.min(0.95, 0.5 + (mySpe - foeSpe) / (2 * Math.max(1, mySpe + foeSpe)) + 0.1 * tries));
}

const moveOf = (ct: Content, id: string): Move => ct.moves.get(id) ?? STRUGGLE;

/** 一个回合的结算；改动 b（和里面的 Mon），返回事件。非法行动不改任何东西 */
export function step(ct: Content, b: Battle, act: Action, rnd: Rng): StepResult {
  if (b.phase === 'over') return { ok: false, err: '战斗已经结束', ev: [] };
  const ev: BEvent[] = [];
  const me = () => b.squad[b.lead], foe = b.wild;
  const mySt = (): Stats => monStats(ct, me()), foeSt = (): Stats => monStats(ct, foe);
  const mySp = () => ct.species.get(me().sp)!, foeSp = () => ct.species.get(foe.sp)!;

  // ---- 强制换人阶段：只能换到还活着的精灵（不耗回合，野生精灵不出手）
  if (b.phase === 'swap') {
    if (act.t !== 'swap') return { ok: false, err: '首发精灵倒下了，要先换一只', ev };
    if (!Number.isInteger(act.i) || !b.squad[act.i] || b.squad[act.i].hp <= 0) return { ok: false, err: '这只精灵不能出战', ev };
    b.lead = act.i; if (!b.fought.includes(act.i)) b.fought.push(act.i);
    b.phase = 'choose'; ev.push({ t: 'swap', i: act.i });
    return { ok: true, ev };
  }

  // ---- 校验行动
  let mv: Move | null = null, slot = -1;
  if (act.t === 'move') {
    const mon = me();
    if (!Number.isInteger(act.i) || act.i < 0 || act.i >= mon.mv.length) return { ok: false, err: '没有这个技能', ev };
    if (mon.mv[act.i].pp <= 0 && mon.mv.some((x) => x.pp > 0)) return { ok: false, err: '这个技能的 PP 用完了', ev };
    slot = act.i; mv = mon.mv.every((x) => x.pp <= 0) ? STRUGGLE : moveOf(ct, mon.mv[act.i].id);
  } else if (act.t === 'swap') {
    if (!Number.isInteger(act.i) || !b.squad[act.i] || b.squad[act.i].hp <= 0 || act.i === b.lead) return { ok: false, err: '这只精灵不能出战', ev };
  } else if (act.t === 'ball') {
    if (!(act.mul > 0)) return { ok: false, err: '没有捕捉道具', ev };
  } else if (act.t !== 'run') return { ok: false, err: '未知行动', ev };

  /** 一次攻击；返回目标是否倒下 */
  const attack = (side: Side, m: Move): boolean => {
    const atk = side === 'me' ? me() : foe, def = side === 'me' ? foe : me();
    const atkRaw = side === 'me' ? mySt() : foeSt(), defRaw = side === 'me' ? foeSt() : mySt();
    const atkSt = stagedStats(atkRaw, stagesOf(b, atk)), defSt = stagedStats(defRaw, stagesOf(b, def));
    if (m.cat === 'physical') atkSt.atk *= burnAtkMul(b, atk); // 灼伤：物理攻击减半
    const atkSp = side === 'me' ? mySp() : foeSp(), defSp = side === 'me' ? foeSp() : mySp();
    ev.push({ t: 'use', side, move: m.id });
    // 命中 / 闪避等级本批只记录、显示，不参与这里的命中判定
    if (rnd() * 100 >= m.acc) { ev.push({ t: 'miss', side }); return false; }
    const r = calcDamage(ct, { lv: atk.lv, stats: atkSt, types: atkSp.types }, { stats: defSt, types: defSp.types }, m, rnd);
    def.hp = Math.max(0, def.hp - r.dmg);
    ev.push({ t: 'hit', side: side === 'me' ? 'foe' : 'me', dmg: r.dmg, hp: def.hp, mult: r.mult, crit: r.crit });
    // 招式附带的状态异常（命中后才判定；已有同种 / 互斥状态时无效）
    if (m.status && def.hp > 0) {
      if (rnd() * 100 < m.status.chance && applyStatus(b, def, m.status.s, rnd)) {
        ev.push({ t: 'status', side: side === 'me' ? 'foe' : 'me', k: m.status.s, v: statusOf(b, def)?.n });
      }
    }
    // 招式附带的能力变化（命中后才判定；chance 未命中不改等级）
    if (m.stat && def.hp > 0) {
      const st = m.stat, targetMon = st.target === 'self' ? atk : def, targetSide: Side = st.target === 'self' ? side : (side === 'me' ? 'foe' : 'me');
      if (rnd() * 100 < (st.chance ?? 100)) {
        const { d, v } = bumpStage(b, targetMon, st.k, st.d);
        if (d !== 0) ev.push({ t: 'stage', side: targetSide, k: st.k, d, v });
      }
    }
    if (def.hp <= 0) { ev.push({ t: 'faint', side: side === 'me' ? 'foe' : 'me' }); b.stages.delete(def.id); return true; }
    return false;
  };
  const wildMove = (): Move => { const list = foe.mv.length ? foe.mv : [{ id: 'struggle', pp: 1 }]; return moveOf(ct, list[Math.floor(rnd() * list.length)].id); };

  let over = false;
  const foeTurn = () => { if (!over && foe.hp > 0 && me().hp > 0) attack('foe', wildMove()); };

  // ---- 回合开始：冰冻先掷解冻；睡 / 冻 / 麻痹（25%）不能行动（完全不能行动：不送出招 / 换人 / 扔球 / 逃跑）
  const canMyAct = (): boolean => {
    const st = statusOf(b, me());
    if (!st) return true;
    if (st.k === 'freeze') {
      if (rnd() < 0.2) { clearStatus(b, me()); ev.push({ t: 'statusend', side: 'me', k: 'freeze' }); return true; }
      ev.push({ t: 'blocked', side: 'me', k: 'freeze' }); return false;
    }
    if (st.k === 'sleep') { ev.push({ t: 'blocked', side: 'me', k: 'sleep' }); return false; }
    if (st.k === 'paralysis' && rnd() < 0.25) { ev.push({ t: 'blocked', side: 'me', k: 'paralysis' }); return false; }
    return true;
  };
  const canFoeAct = (): boolean => {
    const st = statusOf(b, foe);
    if (!st) return true;
    if (st.k === 'freeze') {
      if (rnd() < 0.2) { clearStatus(b, foe); ev.push({ t: 'statusend', side: 'foe', k: 'freeze' }); return true; }
      ev.push({ t: 'blocked', side: 'foe', k: 'freeze' }); return false;
    }
    if (st.k === 'sleep') { ev.push({ t: 'blocked', side: 'foe', k: 'sleep' }); return false; }
    if (st.k === 'paralysis' && rnd() < 0.25) { ev.push({ t: 'blocked', side: 'foe', k: 'paralysis' }); return false; }
    return true;
  };
  const myAct = canMyAct();
  const foeAct = canFoeAct();

  if (act.t === 'move' && mv) {
    if (!myAct) {
      // 自己不能行动：本回合什么都不做，但野生精灵仍可能行动
      if (foeAct) foeTurn();
    } else {
      if (slot >= 0 && mv !== STRUGGLE) me().mv[slot].pp--;
      const mySpe = mySt().spe * stageMul(stagesOf(b, me()).spe) * paraSpeMul(b, me()), foeSpe = foeSt().spe * stageMul(stagesOf(b, foe).spe) * paraSpeMul(b, foe);
      const myFirst = (mv.priority ?? 0) !== 0 ? (mv.priority ?? 0) > 0 : mySpe !== foeSpe ? mySpe > foeSpe : rnd() < 0.5;
      if (myFirst) { if (attack('me', mv)) over = true; else if (foeAct) foeTurn(); }
      else { if (foeAct) attack('foe', wildMove()); if (me().hp > 0) { if (attack('me', mv)) over = true; } }
    }
  } else if (!myAct) {
    // 不能行动：换人 / 扔球 / 逃跑也一并无效；野生精灵照常行动
    if (foeAct) foeTurn();
  } else if (act.t === 'swap') {
    b.lead = act.i; if (!b.fought.includes(act.i)) b.fought.push(act.i);
    ev.push({ t: 'swap', i: act.i }); foeTurn();
  } else if (act.t === 'run') {
    if (rnd() < runChance(mySt().spe, foeSt().spe, b.runs++)) { ev.push({ t: 'escape' }); b.phase = 'over'; b.result = 'fled'; return { ok: true, ev }; }
    ev.push({ t: 'stuck' }); foeTurn();
  } else if (act.t === 'ball') {
    ev.push({ t: 'throw' });
    const p = catchChance(foeSp(), foe.hp, maxHp(ct, foe), act.mul, catchStatusMul(b, foe));
    if (rnd() < p) { ev.push({ t: 'shake', n: 3 }, { t: 'caught' }); b.phase = 'over'; b.result = 'caught'; return { ok: true, ev }; }
    // 没抓到：晃 0~2 下就挣脱（只影响动画）
    ev.push({ t: 'shake', n: Math.min(2, Math.floor(rnd() * 3)) }, { t: 'break' }); foeTurn();
  }

  // ---- 回合结束：毒 / 灼伤掉血、睡眠计数
  const tick = (side: Side, mon: Mon): void => {
    const st = statusOf(b, mon);
    if (!st || mon.hp <= 0) return;
    if (st.k === 'poison' || st.k === 'burn') {
      const dmg = Math.max(1, Math.floor(maxHp(ct, mon) / (st.k === 'poison' ? 8 : 16)));
      mon.hp = Math.max(0, mon.hp - dmg);
      ev.push({ t: 'statusdmg', side, k: st.k, dmg, hp: mon.hp });
      if (mon.hp <= 0) { ev.push({ t: 'faint', side }); b.stages.delete(mon.id); return; }
    }
  };
  if (!over) { tick('me', me()); tick('foe', foe); }
  if (!over) {
    const sst = statusOf(b, me());
    if (sst?.k === 'sleep' && sst.n !== undefined) {
      sst.n--;
      if (sst.n <= 0) { clearStatus(b, me()); ev.push({ t: 'statusend', side: 'me', k: 'sleep' }); }
    }
    const fst = statusOf(b, foe);
    if (fst?.k === 'sleep' && fst.n !== undefined) {
      fst.n--;
      if (fst.n <= 0) { clearStatus(b, foe); ev.push({ t: 'statusend', side: 'foe', k: 'sleep' }); }
    }
  }

  // ---- 判胜负
  if (foe.hp <= 0) {
    b.phase = 'over'; b.result = 'win';
    for (const i of b.fought) {
      const m = b.squad[i]; if (!m || m.hp <= 0) continue;
      gainXp(ct, m, i, xpGain(foeSp(), foe.lv, i === b.lead ? 1 : 0.5), ev);
    }
    return { ok: true, ev };
  }
  if (me().hp <= 0) {
    if (alive(b)) b.phase = 'swap'; else { b.phase = 'over'; b.result = 'lose'; }
  }
  b.turn++;
  return { ok: true, ev };
}

/** 加经验、升级（血量跟着上限涨）、学新技能（技能满 4 个就只提示，不自动替换） */
export function gainXp(ct: Content, m: Mon, i: number, gain: number, ev: BEvent[]): void {
  m.xp += gain; ev.push({ t: 'xp', i, gain });
  const sp = ct.species.get(m.sp)!;
  while (m.lv < MON.LEVEL_CAP && m.xp >= xpForLevel(m.lv + 1)) {
    const before = maxHp(ct, m);
    m.lv++; m.hp += maxHp(ct, m) - before;
    ev.push({ t: 'level', i, lv: m.lv });
    for (const e of learnsetOf(ct, sp)) {
      if (e.lv !== m.lv || m.mv.some((x) => x.id === e.id)) continue;
      const full = m.mv.length >= moveSlots(sp);
      if (!full) m.mv.push({ id: e.id, pp: ct.moves.get(e.id)!.pp });
      ev.push({ t: 'learn', i, move: e.id, full });
    }
  }
  evolveCheck(ct, m, i, ev);
}

/** 到了进化等级就自动进化：血量上限涨多少当前血量跟着涨多少；新物种在这个等级及以下的技能，有空位就学上 */
export function evolveCheck(ct: Content, m: Mon, i: number, ev: BEvent[]): void {
  for (let n = 0; n < 3; n++) {
    const e = ct.species.get(m.sp)?.evo;
    if (!e || m.lv < e.lv || !ct.species.has(e.to)) return;
    const before = maxHp(ct, m);
    m.sp = e.to; m.hp += Math.max(0, maxHp(ct, m) - before);
    ev.push({ t: 'evolve', i, to: e.to });
    for (const l of learnsetOf(ct, ct.species.get(e.to)!)) {
      if (l.lv > m.lv || m.mv.some((x) => x.id === l.id)) continue;
      const full = m.mv.length >= moveSlots(ct.species.get(m.sp));
      if (!full) m.mv.push({ id: l.id, pp: ct.moves.get(l.id)!.pp });
      ev.push({ t: 'learn', i, move: l.id, full });
    }
  }
}
