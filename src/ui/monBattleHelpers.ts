/**
 * 精灵对战 / 精灵面板的纯展示逻辑（无 DOM、无网络），方便单测。
 * 真正的结算在服务器；这里只把数据变成文字和显示用的字段。
 */
import type { BEvent } from '@/shared/battle';
import { elementName, typeMult, type Content, type Move, type MonMove } from '@/shared/mons';

export interface MoveView {
  name: string;
  type: string;
  typeName: string;
  cat: '物理' | '特殊';
  power: number;
  acc: number;
  pp: number;
  maxPp: number;
  effect: string;
}

/** 倍率 → 克制文字；1 倍不显示。 */
export function effectText(mult: number): string {
  if (mult === 0) return '无效';
  if (mult >= 2) return `效果拔群 ×${mult}`;
  if (mult > 0 && mult < 1) return `效果不佳 ×${mult}`;
  return '';
}

/** 出招菜单 / 可学列表用的技能信息。 */
export function moveView(ct: Content, move: Move, pp: number, foeTypes: readonly string[]): MoveView {
  return {
    name: move.name,
    type: move.type,
    typeName: elementName(ct.elements, move.type),
    cat: move.cat === 'physical' ? '物理' : '特殊',
    power: move.power,
    acc: move.acc,
    pp,
    maxPp: move.pp,
    effect: effectText(typeMult(ct.elements, move.type, foeTypes)),
  };
}

/** 血量文字；max 为 0 / 缺失时按 1 显示，避免 NaN。 */
export const hpText = (hp: number, max: number): string => `${hp}/${Math.max(1, max)}`;

/** 升级 / 进化学技能时的一句话。 */
export const learnLogText = (name: string, moveName: string, full: boolean): string =>
  full ? `${name} 想学会 ${moveName}，但技能已满；可在精灵面板更换` : `${name} 学会了 ${moveName}！`;

export interface SummaryLabels {
  mon(i: number): string;
  move(id: string): string;
  species(id: string): string;
  foe: string;
}

/** 战斗结算页的文字行；只按事件顺序遍历一次。 */
export function summaryRows(ev: readonly BEvent[], labels: SummaryLabels): string[] {
  const rows: string[] = [];
  for (const e of ev) {
    switch (e.t) {
      case 'xp': rows.push(`${labels.mon(e.i)} 获得 ${e.gain} 点经验`); break;
      case 'level': rows.push(`${labels.mon(e.i)} 升到了 Lv.${e.lv}！`); break;
      case 'evolve': rows.push(`${labels.species(e.to)} 进化完成`); break;
      case 'learn': rows.push(learnLogText(labels.mon(e.i), labels.move(e.move), e.full)); break;
      case 'caught': rows.push(`收服了 ${labels.foe}`); break;
    }
  }
  return rows;
}

/** 服务端下发的可学列表 → 可显示项：去掉未知 id、当前已带、重复项，保留服务器顺序。 */
export function filterLearnable(ids: readonly string[] | undefined, ct: Content, mv: readonly MonMove[]): string[] {
  const known = new Set(mv.map((x) => x.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !ct.moves.has(id) || known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 快进：动画等待时长；关 = 原样，开 = 35%（最短 80ms）。 */
export const fastDelay = (ms: number, fast: boolean): number => (fast ? Math.max(80, Math.round(ms * 0.35)) : ms);

const FAST_KEY = 'pixelcampus.mon.btFast';

/** 读取快进偏好；localStorage 不可用 / 抛异常 → false。 */
export function readFast(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const s = storage ?? globalThis.localStorage;
    return s?.getItem(FAST_KEY) === '1';
  } catch {
    return false;
  }
}

/** 保存快进偏好；localStorage 不可用 / 抛异常 → 忽略。 */
export function writeFast(on: boolean, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const s = storage ?? globalThis.localStorage;
    s?.setItem(FAST_KEY, on ? '1' : '0');
  } catch {
    /* 存储不可用：仅本次有效 */
  }
}
