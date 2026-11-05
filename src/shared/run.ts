/**
 * 校园跑（客户端与服务器共用）：东区田径场的跑道几何、检查点、规则常量。
 * 跑道是一个竖放的"胶囊形"（两条直道 + 上下两个半圆），数据来自蓝图 data/campus/terrain/40-sports.json 的跑道（红）与内场，
 * 蓝图是 5 米一格，游戏世界放大了 2 倍（1 格 = 2.5 米），所以这里的格坐标 = 蓝图坐标 × 2。
 * 沿着跑道中线均匀放一圈"检查点"：必须按顺序依次经过才算一圈（服务器按玩家位置判断，不信任客户端）。
 */
import { TILE } from '../core/const';

/** 跑道中线：中心、半圆半径、直道半长（格） */
const CX = 634.6, CY = 128.8, RC = 16.8, HL = 14.9;
export const TRACK = { cx: CX * TILE, cy: CY * TILE, rc: RC * TILE, hl: HL * TILE } as const;
/** 一圈的长度（像素 / 米） */
export const LAP_PX = 4 * TRACK.hl + 2 * Math.PI * TRACK.rc;
export const LAP_M = Math.round((LAP_PX / TILE) * 2.5);

export const RUN = {
  /** 每次校园跑几圈 */
  LAPS: 2,
  /** 一圈上的检查点数（第 0 个是起终点线） */
  GATES: 16,
  /** 经过检查点的判定半径（像素）：比跑道半宽（约 48）略大，走哪条道都算 */
  GATE_R: 56,
  /** 倒计时（毫秒，从通知起算到发令） */
  COUNTDOWN_MS: 3500,
  /** 比赛最长时间；超时没跑完算没完成 */
  MAX_MS: 4 * 60 * 1000,
  /** 房间里最多几个人（含发起人） */
  MAX_PLAYERS: 4,
  /** 邀请的有效期；候场（还没开始）的房间最多保留多久 */
  INVITE_MS: 60 * 1000, LOBBY_MS: 3 * 60 * 1000,
  /** 离开田径场多远（像素）算放弃 */
  LEAVE_R: 36 * TILE,
  /** 起跑区：站在起跑线附近这个范围内才能发起/开始 */
  START_HALF_W: 5 * TILE, START_HALF_H: 8 * TILE,
} as const;

/** 沿跑道中线（逆时针：起跑线在西侧直道中点，先向南）走了 s 像素之后所在的点 */
export function trackPoint(s: number): { x: number; y: number } {
  const { cx, cy, rc, hl } = TRACK;
  s = ((s % LAP_PX) + LAP_PX) % LAP_PX;
  if (s < hl) return { x: cx - rc, y: cy + s }; // 西直道，下半段，向南
  s -= hl;
  const arc = Math.PI * rc;
  if (s < arc) { const th = Math.PI - s / rc; return { x: cx + rc * Math.cos(th), y: cy + hl + rc * Math.sin(th) }; } // 下半圆：从西经南到东
  s -= arc;
  if (s < 2 * hl) return { x: cx + rc, y: cy + hl - s }; // 东直道，向北
  s -= 2 * hl;
  if (s < arc) { const th = -s / rc; return { x: cx + rc * Math.cos(th), y: cy - hl + rc * Math.sin(th) }; } // 上半圆：从东经北到西
  s -= arc;
  return { x: cx - rc, y: cy - hl + s }; // 西直道，上半段，向南回到起跑线
}

/** 检查点（像素坐标）：均匀分布，第 0 个就是起终点线 */
export const GATES: readonly { x: number; y: number }[] = Array.from({ length: RUN.GATES }, (_, i) => trackPoint((LAP_PX * i) / RUN.GATES));

/** 第 i 位参赛者的起跑位置：横向排开在起跑线上（越靠后越靠外道），最多 4 人 */
export function startSpot(i: number, n: number): { x: number; y: number } {
  const g = GATES[0];
  return { x: g.x + (i - (n - 1) / 2) * 18, y: g.y };
}
/** 在不在起跑区里（margin = 额外放宽的像素，服务器要留出位置延迟的余量） */
export function inStartZone(x: number, y: number, margin = 0): boolean {
  const g = GATES[0];
  return Math.abs(x - g.x) <= RUN.START_HALF_W + margin && Math.abs(y - g.y) <= RUN.START_HALF_H + margin;
}
/** 离田径场中心太远（放弃比赛） */
export const farFromTrack = (x: number, y: number) => Math.hypot(x - TRACK.cx, y - TRACK.cy) > RUN.LEAVE_R;

/** 一个人的比赛进度：lap 已跑完几圈，gate 下一个要经过的检查点（0 = 起终点线，刚起跑时是 1） */
export interface RunProg { lap: number; gate: number }
export const startProg = (): RunProg => ({ lap: 0, gate: 1 });
/**
 * 玩家在 (x,y)：如果正好到了下一个检查点就前进一格（回到 0 号检查点 = 跑完一圈）。返回是否前进。
 * 一次只前进一个检查点，所以抄近道跳过中间的点是不算数的。
 */
export function advance(p: RunProg, x: number, y: number): boolean {
  const g = GATES[p.gate];
  if (Math.hypot(x - g.x, y - g.y) > RUN.GATE_R) return false;
  if (p.gate === 0) p.lap++;
  p.gate = (p.gate + 1) % RUN.GATES;
  return true;
}
export const finished = (p: RunProg) => p.lap >= RUN.LAPS;
/** 总进度（用来给参赛者排名次）：已经过的检查点数 */
export const progressOf = (p: RunProg) => p.lap * RUN.GATES + (p.gate === 0 ? RUN.GATES : p.gate) - 1;

/** 成绩的显示：毫秒 → 12.34 秒 / 1:02.3 */
export function fmtTime(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} 秒`;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

export interface RunPlayerInfo { uid: number; name: string; lap: number; gate: number; /** 跑完用的毫秒（没跑完没有） */ ms?: number }
export type RunPhase = 'lobby' | 'count' | 'go' | 'done';

/** 服务器发给客户端的比赛消息 */
export type RunMsg =
  /** 有人邀请我一起跑 */
  | { t: 'run_invite'; rid: number; from: number; name: string }
  /** 比赛房间的完整状态：now 是服务器发送时的时间，客户端据此校准倒计时 */
  | { t: 'run_state'; rid: number; phase: RunPhase; laps: number; startAt: number; now: number; host: number; you: number; players: RunPlayerInfo[] }
  | { t: 'run_end'; rid: number; results: RunPlayerInfo[] }
  /** 比赛被取消/我被请出/邀请失效等：msg 说明原因，客户端据此收起比赛界面 */
  | { t: 'run_gone'; msg: string }
  /** 我的校园跑成绩：best 最好成绩（毫秒，还没跑完过就没有）、n 跑完几次、wins 和好友比赛拿过几次第一 */
  | { t: 'run_best'; best?: number; n: number; wins: number };

/** 玩家档案里的校园跑记录 */
export interface RunRecord { best?: number; n: number; wins: number }
export function cleanRun(raw: unknown): RunRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { best, n, wins } = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
  const b = num(best, 24 * 3600e3);
  return { ...(b > 0 ? { best: b } : {}), n: num(n, 999999), wins: num(wins, 999999) };
}
