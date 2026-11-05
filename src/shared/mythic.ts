/**
 * 神话鱼（客户端与服务器共用）：出现条件的判断与进度、首次钓到的奖励。
 * 条件写在 fishing.ts 每条神话鱼的 needs 里（饵 + 竿 + 环境 + 图鉴里的解锁条件）；服务器按自己的时间 / 天气 / 季节判断，不信任客户端。
 */
import { fishDef, type FishDef, type FishLog } from './fishing';
import { baitDef, rodDef } from './gear';
import type { Gain } from './items';
import type { Season } from './season';

export interface MythicCtx { night: boolean; rain: boolean; season: Season; rod: string; bait: string; log: Record<string, FishLog> }
export interface MythicCheck { text: string; ok: boolean }
const SEASON_ZH: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

/** 逐条条件的检查结果（图鉴里显示 ✔ / ✘） */
export function mythicProgress(def: FishDef, ctx: MythicCtx): MythicCheck[] {
  const n = def.needs, out: MythicCheck[] = [];
  if (!n) return out;
  if (n.unlock) { const have = ctx.log[n.unlock.fish]?.n ?? 0; out.push({ text: `钓满 ${n.unlock.n} 条${fishDef(n.unlock.fish)?.name ?? ''}（已 ${Math.min(have, n.unlock.n)}）`, ok: have >= n.unlock.n }); }
  if (n.baits) out.push({ text: n.baits.length === 1 ? `鱼饵：${baitDef(n.baits[0])?.name}` : '鱼饵：香饵或更好的饵', ok: n.baits.includes(ctx.bait) });
  if (n.rods) out.push({ text: n.rods.length > 3 ? '鱼竿：碳素鱼竿及以上' : `鱼竿：${n.rods.map((r) => rodDef(r)?.name).join(' / ')}`, ok: n.rods.includes(ctx.rod) });
  if (n.seasons) out.push({ text: `季节：${n.seasons.map((k) => SEASON_ZH[k]).join('、')}天`, ok: n.seasons.includes(ctx.season) });
  if (n.night !== undefined) out.push({ text: n.night ? '时间：夜里' : '时间：白天', ok: n.night === ctx.night });
  if (n.rain) out.push({ text: '天气：下雨', ok: ctx.rain });
  return out;
}
export const mythicOk = (def: FishDef, ctx: MythicCtx): boolean => !!def.needs && mythicProgress(def, ctx).every((c) => c.ok);
/** 给 rollFish 的 env.mythic 用 */
export const mythicChecker = (ctx: MythicCtx) => (f: FishDef): boolean => mythicOk(f, ctx);

/** 每条神话鱼"第一次钓到"的奖励物品（币和称号走成就：achievements.ts 的 myth_*；每人每种只给一次） */
export const MYTHIC_REWARDS: Record<string, { ach: string; items: Gain[] }> = {
  fish_hegongjin: { ach: 'myth_hegongjin', items: [{ id: 'dragon_scale', n: 2 }, { id: 'bait_myth', n: 1 }] },
  fish_xuangui: { ach: 'myth_xuangui', items: [{ id: 'dragon_scale', n: 2 }] },
  fish_yinglong: { ach: 'myth_yinglong', items: [{ id: 'dragon_scale', n: 3 }] },
};
