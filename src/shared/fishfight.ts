/**
 * 拉鱼小游戏（客户端运行、服务器只校验时间）：参考星露谷的钓鱼——
 * 右边一根竖直的"水柱"，鱼的图标在里面上下游动，你控制一根绿条（电脑按住空格上浮、松开下沉；手机按住/连点按钮），
 * 让鱼一直待在绿条里，进度条就一点点涨满 = 钓到；鱼逃出绿条，进度条会掉，掉光 = 鱼跑了。
 *
 * 鱼的游动由服务器给的 seed 决定（同一条鱼每次游法一样），所以这里是纯函数式的模拟，可以脱离界面做单元测试。
 * 服务器不重放整个过程（客户端结果可以伪造），只检查：必须在咬钩后真的进入过小游戏、耗时不能短于不可能的最短时间、超时算输。
 * 这是单机小游戏性质的玩法（没有排行榜），防的是手滑的 bug 和最明显的乱发消息，不是专业外挂。
 */
import type { FishDef, FishMove, Rarity } from './fishing';

export const FIGHT = {
  /** 整场最长时间；超过服务器算鱼跑了 */
  TIMEOUT_MS: 45000,
  /** 最快也要这么久才可能拉满（进度从 START 涨到 1，每秒最多涨 FILL_MAX）：服务器据此拒绝"瞬间通关" */
  MIN_MS: 2000,
  START: 0.35,
  FILL_MAX: 0.26,
} as const;

/** 各稀有度的基础难度 0~1 */
const BASE_DIFF: Record<Rarity, number> = { common: 0.04, uncommon: 0.13, rare: 0.26, epic: 0.4, legendary: 0.56, mythic: 0.7, junk: 0.03 };

/** 配件给的拉鱼加成（都没有 = 不变）：bar 绿条长度倍率；sink 下沉加速度倍率；cling 黏鱼强度；drop 进度下降速度倍率 */
export interface FightGear { bar?: number; sink?: number; cling?: number; drop?: number }
export interface FightParams extends FightGear { seed: number; diff: number; move: FishMove; /** 中途发力（神话鱼应龙） */ burst?: boolean }
/**
 * 这条鱼的拉鱼参数：难度 = 稀有度基础 + 个头越大越难（最多 +0.1），再减去鱼竿的减难度加成（高级鱼竿 ease > 0；最低 0）；
 * 配件（gear）和鱼本身的绿条倍率（镇湖玄龟的绿条更短）合并到 bar。
 */
export function fightOf(def: FishDef, cm: number, seed: number, ease = 0, gear?: FightGear): FightParams {
  const t = def.minCm !== undefined && def.maxCm !== undefined && def.maxCm > def.minCm ? (cm - def.minCm) / (def.maxCm - def.minCm) : 0;
  const out: FightParams = { seed: seed >>> 0, diff: Math.max(0, Math.min(1, BASE_DIFF[def.rarity] + 0.1 * Math.max(0, Math.min(1, t)) - ease)), move: def.move ?? 'mixed' };
  const bar = (gear?.bar ?? 1) * (def.barMul ?? 1);
  if (bar !== 1) out.bar = Math.round(bar * 1000) / 1000;
  if (gear?.sink !== undefined && gear.sink !== 1) out.sink = gear.sink;
  if (gear?.cling) out.cling = gear.cling;
  if (gear?.drop !== undefined && gear.drop !== 1) out.drop = gear.drop;
  if (def.burst) out.burst = true;
  return out;
}

/** 确定性随机数 */
function mulberry32(a: number) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** 位置都是 0（水柱底）~ 1（水柱顶） */
export class FightSim {
  readonly half: number;
  /** 绿条中心、速度；鱼的位置；进度 */
  bar: number; vel = 0; fish = 0.5; progress: number = FIGHT.START;
  elapsed = 0; inside = 0;
  result: 'win' | 'lose' | null = null;
  private rnd: () => number; private target = 0.5; private timer = 0; private mode: 'smooth' | 'dart' = 'smooth'; private burstT = 3;
  constructor(readonly p: FightParams) {
    this.rnd = mulberry32(p.seed);
    this.half = ((0.31 - 0.12 * p.diff) * (p.bar ?? 1)) / 2; // 难的鱼绿条更短（2026-11-03 再调易：绿条整体又放长了）；长浮漂等配件让绿条更长
    this.bar = this.half + 0.02;
    this.fish = 0.35 + this.rnd() * 0.4; this.target = this.fish;
  }
  /** 鱼现在在不在绿条里（略放宽一点：鱼的图标有大小） */
  get hit(): boolean { return Math.abs(this.fish - this.bar) <= this.half + 0.025; }
  /** 整场里鱼在绿条里的时间占比（>= 0.85 算"完美"） */
  get ratio(): number { return this.elapsed > 0 ? this.inside / this.elapsed : 0; }

  /** 往前走 dt 秒；hold = 此刻有没有按住。返回当前结果（null = 还在进行） */
  step(dt: number, hold: boolean): 'win' | 'lose' | null {
    if (this.result) return this.result;
    dt = Math.min(dt, 0.05); // 卡顿时不让它一步跳太远
    const { diff, move } = this.p;
    // 绿条：按住往上加速，松开往下加速（有重力感）；碰到底有一点反弹
    this.vel = Math.max(-1.1, Math.min(1.1, this.vel + (hold ? 2.4 : -2.0 * (this.p.sink ?? 1)) * dt));
    this.bar += this.vel * dt;
    if (this.bar < this.half) { this.bar = this.half; this.vel = this.vel < -0.3 ? -this.vel * 0.3 : 0; }
    if (this.bar > 1 - this.half) { this.bar = 1 - this.half; this.vel = 0; }
    // 中途发力（应龙）：隔几秒猛地窜向远处一次
    if (this.p.burst) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = 4 + this.rnd() * 3; this.mode = 'dart'; this.target = this.fish > 0.5 ? 0.18 : 0.82; this.timer = 0.7; }
    }
    // 鱼：隔一阵挑一个新目标，朝它游过去；dart 型目标远、换得勤、游得快
    this.timer -= dt;
    if (this.timer <= 0) {
      this.mode = move === 'dart' ? 'dart' : move === 'smooth' ? 'smooth' : (this.rnd() < 0.5 ? 'dart' : 'smooth');
      const range = this.mode === 'dart' ? 0.34 : 0.16 + 0.2 * diff;
      const t = Math.max(0.04, Math.min(0.96, this.fish + (this.rnd() * 2 - 1) * range));
      this.target = 0.5 + (t - 0.5) * 0.66; // 往中间收一点：鱼不会老待在最顶/最底，不按键或一直按住都赢不了
      this.timer = this.mode === 'dart' ? 0.42 + this.rnd() * 0.65 : 1.0 + this.rnd() * 1.0;
    }
    const speed = (this.mode === 'dart' ? 0.62 + 0.7 * diff : 0.2 + 0.34 * diff) * (this.p.burst && this.burstT > 3.3 ? 1.5 : 1) * dt;
    const d = this.target - this.fish;
    this.fish += Math.abs(d) <= speed ? d : Math.sign(d) * speed;
    // 进度
    const hit = this.hit;
    // 倒刺钩：鱼在绿条里时，绿条慢慢被鱼带着走（窜动型的鱼挣得太快，黏不住）
    if (hit && this.p.cling && move !== 'dart' && this.mode !== 'dart') this.bar += (this.fish - this.bar) * Math.min(1, 2.2 * this.p.cling * dt);
    this.elapsed += dt; if (hit) this.inside += dt;
    this.progress += (hit ? FIGHT.FILL_MAX * (1 - 0.2 * diff) : -0.1 * (0.7 + 0.7 * diff) * (this.p.drop ?? 1)) * dt;
    if (this.progress >= 1) { this.progress = 1; this.result = 'win'; }
    else if (this.progress <= 0) { this.progress = 0; this.result = 'lose'; }
    return this.result;
  }
}
