/**
 * 野外遭遇（客户端与服务器共用）：遭遇区域、草地位图、按昼夜/天气/季节抽野生精灵。
 * 触发和结算都在服务器；区域是"格坐标矩形"（数据在 data/mons/zones.json），再与 world.json 里的草地位图相交——
 * 只有区域内的草地才会遇到，道路、广场、建筑门前、水边的石岸都是安全的。
 */
import type { Season } from './season';
import type { Rng } from './mons';

export interface WildEntry {
  sp: string; w: number;
  /** 条件倍率（没写 = 1，写 0 = 这个条件下遇不到）：夜里 / 下雨 / 各季节 */
  night?: number; rain?: number; seasons?: Partial<Record<Season, number>>;
  /** 比区域等级再高几级（稀有的更强） */
  lvPlus?: number;
}
export interface Zone { id: string; name: string; rect: readonly [number, number, number, number]; lv: readonly [number, number]; table: readonly WildEntry[] }

export const WILD = {
  /** 每走这么多像素算一步 */
  STEP_PX: 16,
  /** 一次遭遇之后至少走多少步才可能再遇到；之后每步触发的概率 */
  MIN_STEPS: 8, CHANCE: 0.06,
  /** 战斗结束 / 拒绝之后的冷却；提示出现后多久不答复算走开；战斗中多久没操作算逃跑 */
  COOLDOWN_MS: 20000, OFFER_MS: 10000, BATTLE_IDLE_MS: 90000,
  /** 坐在长椅上休息多久队伍回满；不坐也会慢慢回血：多久回满 */
  REST_MS: 4000, REGEN_MS: 600000,
} as const;

/** 草地位图（world.json 的 grass：每格 1 位，按行优先的 base64） */
export class GrassMask {
  private bits: Uint8Array;
  constructor(b64: string, readonly w: number, readonly h: number) {
    const bin = atob(b64);
    this.bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.bits[i] = bin.charCodeAt(i);
  }
  at(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return false;
    const i = cy * this.w + cx;
    return ((this.bits[i >> 3] >> (i & 7)) & 1) === 1;
  }
}

export const zoneAt = (zones: readonly Zone[], cx: number, cy: number): Zone | undefined => zones.find((z) => cx >= z.rect[0] && cx < z.rect[2] && cy >= z.rect[1] && cy < z.rect[3]);

export interface WildEnv { night: boolean; rain: boolean; season: Season }
/** 按权重抽一只野生精灵和它的等级（等级 = 区域范围内随机 + 稀有加成） */
export function rollWild(zone: Zone, env: WildEnv, rnd: Rng): { sp: string; lv: number } {
  const ws = zone.table.map((e) => Math.max(0, e.w * (env.night ? e.night ?? 1 : 1) * (env.rain ? e.rain ?? 1 : 1) * (e.seasons?.[env.season] ?? 1)));
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rnd() * total, i = 0;
  if (total > 0) for (; i < ws.length - 1; i++) { if (r < ws[i]) break; r -= ws[i]; }
  const e = zone.table[total > 0 ? i : 0];
  const lv = zone.lv[0] + Math.floor(rnd() * (zone.lv[1] - zone.lv[0] + 1)) + (e.lvPlus ?? 0);
  return { sp: e.sp, lv };
}
