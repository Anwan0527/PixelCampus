/**
 * 精灵图鉴的纯展示逻辑（无 DOM、无网络）：分组、排序、筛选、未见过剪影、栖息地、进化链、进度。
 * 数据只来自 `mon_data.dex`（见过 / 收服次数）和共享物种表；不本地推断。
 */
import type { Content, Species } from '@/shared/mons';
import type { DexEntry } from '@/shared/monbox';
import type { Zone } from '@/shared/wild';
import { monArt } from '@/shared/mons-content';
import { isCatSpecies } from '@/shared/cat-mons';

export interface MonDexChain { id: string; name: string; seen: boolean; lv?: number }
export interface MonDexRow {
  sp: Species;
  /** 图鉴 No.，用于排序 / 显示 */
  no: number;
  seen: boolean;
  /** 见过次数（dex.s） */
  seenCount: number;
  /** 收服次数（dex.c） */
  caught: number;
  /** 没见过的物种：名字 / 描述 / 属性 / 图 / 栖息地 / 进化链都不返回 */
  name: string;
  desc: string;
  types: string[];
  art: string | null;
  habitat: string;
  chain: MonDexChain[];
}

export interface MonDexFilter { type?: string; caughtOnly?: boolean; zone?: string }
export type MonDexGroupId = 'open' | 'cat' | 'dm';
export interface MonDexGroup {
  id: MonDexGroupId;
  title: string;
  rows: MonDexRow[];
  seen: number;
  caught: number;
  total: number;
}

const GROUP_TITLES: Record<MonDexGroupId, string> = { open: '开放包', cat: '猫系', dm: '登录赠送' };
const groupOf = (id: string): MonDexGroupId => (id === 'dm' ? 'dm' : isCatSpecies(id) ? 'cat' : 'open');

/** 当前物种 + 已经过的前序阶段；没有 chain 返回空（图鉴不显示进化链块） */
export function chainOf(sp: Species, ct: Content, dex: Record<string, DexEntry>): MonDexChain[] {
  const chain = sp.chain;
  if (!chain?.length) return [];
  const out: MonDexChain[] = [];
  for (let i = 0; i < chain.length; i++) {
    const id = chain[i]!;
    const s = ct.species.get(id);
    if (!s) continue;
    const seen = (dex[id]?.s ?? 0) > 0;
    const prev = i > 0 ? ct.species.get(chain[i - 1]!) : undefined;
    const lv = prev?.evo?.to === id ? prev.evo.lv : undefined;
    out.push({ id, name: seen ? s.name : '？？？', seen, ...(lv !== undefined ? { lv } : {}) });
  }
  return out;
}

/** 栖息地：野外区域出没表反查；猫系 / 耄耋给对应说明；都没有就是「—」 */
export function habitatOf(spId: string, zones: readonly Zone[]): string {
  const names = zones.filter((z) => z.table.some((e) => e.sp === spId)).map((z) => z.name);
  if (names.length) return names.join('、');
  if (spId === 'dm') return '登录赠送';
  if (isCatSpecies(spId)) return '校园猫';
  return '—';
}

/** 区域筛选选项：三个野外区域 + 校园猫 + 登录赠送 */
export function monDexZoneOptions(zones: readonly Zone[]): { id: string; name: string }[] {
  return [...zones.map((z) => ({ id: z.id, name: z.name })), { id: 'cat', name: '校园猫' }, { id: 'dm', name: '登录赠送' }];
}

/**
 * 按 No. 排序的全部物种行。未见过只保留 No. +「？？？」，其余字段为空。
 * 类型 / 收服 / 区域筛选只作用于见过的精灵；未见过只出现在「全部」。
 */
export function monDexRows(ct: Content, dex: Record<string, DexEntry>, zones: readonly Zone[], filter: MonDexFilter = {}): MonDexRow[] {
  const filtering = !!(filter.type || filter.caughtOnly || filter.zone);
  const rows: MonDexRow[] = [];
  for (const sp of ct.species.values()) {
    const entry = dex[sp.id];
    const seen = (entry?.s ?? 0) > 0;
    const seenCount = entry?.s ?? 0;
    const caught = entry?.c ?? 0;
    if (filtering && !seen) continue;
    if (filter.type && !sp.types.includes(filter.type)) continue;
    if (filter.caughtOnly && caught <= 0) continue;
    if (filter.zone) {
      const g = groupOf(sp.id);
      if (filter.zone === 'cat') { if (g !== 'cat') continue; }
      else if (filter.zone === 'dm') { if (g !== 'dm') continue; }
      else {
        const z = zones.find((x) => x.id === filter.zone);
        if (!z || !z.table.some((e) => e.sp === sp.id)) continue;
      }
    }
    rows.push({
      sp, no: sp.no, seen, seenCount, caught,
      name: seen ? sp.name : '？？？',
      desc: seen ? sp.desc ?? '' : '',
      types: seen ? [...sp.types] : [],
      art: seen ? monArt(sp.id, 'front') : null,
      habitat: seen ? habitatOf(sp.id, zones) : '',
      chain: seen ? chainOf(sp, ct, dex) : [],
    });
  }
  return rows.sort((a, b) => a.no - b.no || a.sp.id.localeCompare(b.sp.id));
}

/** 分组（开放包 / 猫系 / 登录赠送）；组内保持 No. 排序；空组也返回，UI 自己隐藏 */
export function monDexGroups(ct: Content, dex: Record<string, DexEntry>, zones: readonly Zone[], filter: MonDexFilter = {}): MonDexGroup[] {
  const rows = monDexRows(ct, dex, zones, filter);
  return (['open', 'cat', 'dm'] as const).map((id) => {
    const g = rows.filter((r) => groupOf(r.sp.id) === id);
    return { id, title: GROUP_TITLES[id], rows: g, seen: g.filter((r) => r.seen).length, caught: g.filter((r) => r.caught > 0).length, total: g.length };
  });
}

/** 进度：见过 / 已收服（按物种数，不是收服总次数）/ 总数 */
export function monDexProgress(rows: MonDexRow[]): { seen: number; caught: number; total: number } {
  return { seen: rows.filter((r) => r.seen).length, caught: rows.filter((r) => r.caught > 0).length, total: rows.length };
}
