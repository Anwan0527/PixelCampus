/**
 * 钓鱼图鉴的数据整理（纯函数，不碰界面，便于测试）：分组、剪影、神话条件、"现在能钓到什么"、装备图鉴的行、册页、装备栏的效果摘要。
 * 界面（CodexPanel / BackpackPanel）只负责把这些画出来。
 */
import { BOX_FISH, FISH_TIERS, LAKE_FISH, MYTHIC_FISH, RARITY_COLORS, RARITY_NAMES, fishWeight, habitat, type FishDef, type FishLog, type Rarity } from '@/shared/fishing';
import { BAITS, RODS, TACKLES, perkActive, type Gear, type GearEnv } from '@/shared/gear';
import { BUNDLES, MILESTONES, bundleDone, bundleProgress, speciesCount, type GearLog } from '@/shared/fishdex';
import { mythicProgress, type MythicCheck } from '@/shared/mythic';
import { MAX_LEVEL, barBonus, cumXp, levelReward, routeSlots } from '@/shared/fishlevel';
import { RECIPES } from '@/shared/craft';
import { ACHIEVEMENTS } from '@/shared/achievements';
import { achCoins } from '@/shared/economy';
import { itemDef } from '@/shared/items';

export type FishGroupId = Rarity | 'box';
export interface FishRow { def: FishDef; rec?: FishLog; /** 钓到过 */ known: boolean }
export interface FishGroup { id: FishGroupId; title: string; color: string; rows: FishRow[]; have: number; total: number }
export interface FishFilter { unseenOnly?: boolean; season?: GearEnv['season']; time?: 'day' | 'night'; rain?: boolean }

/** 鱼类页的分组：常见 → 传说（只含湖里的）、神话、盲盒限定；筛选：只看没钓到的 / 某个季节 / 夜里或白天 / 雨天 */
export function fishGroups(log: Record<string, FishLog>, f: FishFilter = {}): FishGroup[] {
  const keep = (d: FishDef) => {
    if (f.unseenOnly && log[d.id]) return false;
    const h = habitat(d);
    if (f.season && h.seasons[f.season] === 'off') return false;
    if (f.time && h.time !== 'any' && h.time !== f.time) return false;
    if (f.rain && !h.rain) return false;
    return true;
  };
  const mk = (id: FishGroupId, title: string, color: string, list: readonly FishDef[]): FishGroup => {
    const all = list.map((def) => ({ def, rec: log[def.id], known: !!log[def.id] }));
    return { id, title, color, rows: all.filter((r) => keep(r.def)), have: all.filter((r) => r.known).length, total: all.length };
  };
  const out: FishGroup[] = [];
  for (const t of FISH_TIERS) {
    if (t === 'mythic') out.push(mk('mythic', RARITY_NAMES.mythic, RARITY_COLORS.mythic, MYTHIC_FISH));
    else out.push(mk(t, RARITY_NAMES[t], RARITY_COLORS[t], LAKE_FISH.filter((d) => d.rarity === t)));
  }
  out.push(mk('box', '盲盒限定', '#2a8a9a', BOX_FISH));
  return out;
}
/** 一条鱼在图鉴里显示的"怎么得到"提示（没钓到时） */
export function fishHint(d: FishDef): string {
  if (d.source === 'box') return '只能从盲盒里开出来';
  if (d.rarity === 'mythic') return '神话：要满足特定的饵、鱼竿和环境';
  return '还没钓到';
}

/** "现在能钓到什么"：按当前的夜里 / 雨天 / 季节，列出湖里每种鱼的相对机会，从最容易遇到的排起 */
export interface NowRow { def: FishDef; pct: number; label: '常见' | '偶尔' | '稀少'; known: boolean }
export function availableNow(env: GearEnv, log: Record<string, FishLog>): NowRow[] {
  const ws = LAKE_FISH.map((d) => ({ d, w: fishWeight(d, { night: env.night, rain: env.rain, season: env.season }) }));
  const total = ws.reduce((a, x) => a + x.w, 0) || 1;
  return ws.filter((x) => x.w > 0 && x.d.rarity !== 'junk').map((x) => { const pct = (x.w / total) * 100; return { def: x.d, pct, label: pct >= 3 ? '常见' as const : pct >= 0.5 ? '偶尔' as const : '稀少' as const, known: !!log[x.d.id] }; }).sort((a, b) => b.pct - a.pct);
}
/** 神话鱼的条件逐条检查（图鉴里的 ✔ / ✘）：用现在的环境和装备栏里正在用的竿 / 饵 */
export function mythicChecks(d: FishDef, env: GearEnv, gear: { rod: string; bait: string }, log: Record<string, FishLog>): MythicCheck[] {
  return mythicProgress(d, { night: env.night, rain: !!env.rain, season: env.season ?? 'spring', rod: gear.rod, bait: gear.bait, log });
}

export interface GearRow { id: string; name: string; owned: boolean; eff: string; how: string; tag?: string; active: boolean; note: string }
/** 鱼竿 / 饵料 / 配件三页的行：拥有状态、效果、怎么得到、特长场合当前是否满足、"拥有时间 / 用过几次" */
export function gearRows(kind: 'rods' | 'baits' | 'tackles', inv: Record<string, number>, gd: GearLog, env: GearEnv): GearRow[] {
  if (kind === 'rods') return RODS.map((r) => ({ id: r.id, name: r.name, owned: (inv[r.id] ?? 0) > 0 || !!gd.rods[r.id], eff: r.eff, how: `${r.how}${r.slots ? `；${r.slots} 个配件槽` : ''}`, tag: r.tag, active: perkActive(r.tag, env), note: gd.rods[r.id] ? '拥有过' : '' }));
  if (kind === 'baits') return BAITS.map((b) => ({ id: b.id, name: b.name, owned: (inv[b.id] ?? 0) > 0 || (gd.baits[b.id] ?? 0) > 0, eff: b.eff, how: b.how, tag: b.tag, active: perkActive(b.tag, env), note: gd.baits[b.id] ? `用过 ${gd.baits[b.id]} 次` : '' }));
  return TACKLES.map((t) => ({ id: t.id, name: t.name, owned: (inv[t.id] ?? 0) > 0 || !!gd.tackles[t.id], eff: t.eff, how: t.how, active: false, note: gd.tackles[t.id] ? '拥有过' : '' }));
}

/** 册页的显示：进度、集齐没有、领过没有（可以领） */
export interface BundleView { id: string; name: string; desc: string; have: number; need: number; done: boolean; claimed: boolean; reward: string }
export function bundleViews(log: Record<string, FishLog>, gd: GearLog, itemName: (id: string) => string): BundleView[] {
  return BUNDLES.map((b) => { const p = bundleProgress(b, log); return { id: b.id, name: b.name, desc: b.desc, have: p.have, need: p.need, done: bundleDone(b, log), claimed: gd.claimed.includes(b.id), reward: `${b.reward.coins} 校园币${b.reward.items.map((g) => `、${itemName(g.id)} ×${g.n}`).join('')}` }; });
}
/** 里程碑：钓到多少种；达到的标 done */
export function milestoneViews(log: Record<string, FishLog>): { n: number; name: string; done: boolean }[] {
  const c = speciesCount(log); return MILESTONES.map((m) => ({ n: m.n, name: m.name, done: c >= m.n }));
}

/** 装备栏下面那一行效果摘要：咬钩快多少、稀有度、绿条、双钓、盲盒、声呐…… */
export function gearSummary(g: Gear): string[] {
  const out: string[] = [];
  if (g.wait < 1) out.push(`咬钩 −${Math.round((1 - g.wait) * 100)}%`);
  if (g.luck > 1) out.push(`稀有鱼 ×${g.luck.toFixed(2).replace(/\.?0+$/, '')}`);
  if (g.ease > 0) out.push(`拉鱼更轻松`);
  if (g.fight.bar > 1) out.push(`绿条 +${Math.round((g.fight.bar - 1) * 100)}%`);
  if (g.fight.sink < 1) out.push('下沉更稳');
  if (g.fight.cling > 0) out.push('黏鱼');
  if (g.fight.drop < 1) out.push(`掉进度 −${Math.round((1 - g.fight.drop) * 100)}%`);
  if (g.double > 0) out.push(`双钓 ${Math.round(g.double * 100)}%`);
  if (g.treasure > 1) out.push(`盲盒 ×${g.treasure}`);
  if (g.sonar) out.push('声呐');
  if (g.ignoreEnv) out.push('无视季节 / 天气 / 昼夜');
  if (g.only) out.push('只钓指定的鱼');
  if (g.mythicBait) out.push('神话饵');
  return out;
}

// ------------------------------------------------------------ 钓鱼等级页（钓鱼 3.0）
export interface LevelRow { lv: number; /** 到这一级需要的累计经验 */ cum: number; /** 每级奖励（币 + 饵） */ reward: string; /** 这一级新解锁的东西：绿条、配方、路线槽、称号 */ perks: string[]; reached: boolean }
export function levelRows(cur: number): LevelRow[] {
  const out: LevelRow[] = [];
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    const rw = levelReward(lv), perks: string[] = [];
    if (barBonus(lv) > barBonus(lv - 1)) perks.push(`拉鱼绿条 +${Math.round(barBonus(lv) * 100)}%（累计）`);
    for (const r of RECIPES) if (r.minLevel === lv) perks.push(`解锁合成「${r.name}」`);
    if (routeSlots(lv) > routeSlots(lv - 1)) perks.push(lv === 5 ? '解锁第 1 个「路线」槽' : '解锁第 2 个「路线」槽');
    const a = rw.ach ? ACHIEVEMENTS.find((x) => x.id === rw.ach) : undefined;
    if (a) perks.push(`称号「${a.name}」+ ${achCoins(a.id)} 币`);
    out.push({ lv, cum: cumXp(lv), reward: `${rw.coins} 币 + ${rw.items.map((g) => `${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('')}`, perks, reached: cur >= lv });
  }
  return out;
}
