/**
 * 宿舍（客户端与服务器共用）：每个玩家一间独立的小屋，跟着身份走。
 * - 楼栋：玩家选自己住在几社区几号楼（第一次可以随便选，之后每天最多改一次；改楼栋只换"门在哪"，房间里的东西不变）。
 * - 空调：关 / 制冷 / 制热，状态存档，进屋就能看到。
 * - 仓库（宝箱）：只有主人能开；物品种类有上限，单种有上限。
 * - 睡觉：上床后精灵队伍和背包里的精灵慢慢恢复（比自然恢复快、比长椅慢）。
 * 校验都在这里，服务器不信任客户端。
 */
import { itemDef, type Inv } from './items';
import { fishDef, type Rarity } from './fishing';
import { cleanText } from './profile';
import { cleanLay, decorDef, defaultLay, layError, type Placed, type Rot } from './decor';

export const DORM = {
  /** 宝箱最多放几种物品 / 每种最多放多少 */
  CHEST_KINDS: 24, CHEST_STACK: 999,
  /** 浴缸：最多养几种鱼 / 每种最多几条（只是展示用，不是第二个仓库） */
  BATH_KINDS: 12, BATH_STACK: 99,
  /** 睡觉：从 0 血睡到满血要多久（毫秒）。长椅 4 秒回满、自然恢复 10 分钟回满，这里夹在中间，算"慢慢恢复" */
  SLEEP_FULL_MS: 90000,
  /** 睡觉的最长时长（毫秒）：超过就自动起床（防止挂机一直占着服务器上的计时） */
  SLEEP_MAX_MS: 600000,
  /** 点「宿舍」按钮回宿舍的冷却（毫秒） */
  GO_COOLDOWN_MS: 3000,
  /** 在门口按 E 进屋：离自己宿舍楼的门最远多少像素（服务器校验，留出位置延迟的余量） */
  DOOR_REACH: 48,
  /** 一间宿舍同时最多几位访客（房主不算） */
  GUEST_MAX: 6,
  /** 邀请 / 敲门的有效期（毫秒） */
  INVITE_MS: 30000,
  /** 牌子上的名字最多几个字 */
  TITLE_MAX: 8,
  /** 屋里报位置的最小间隔（毫秒）与最大速度（像素/秒，含余量）：宿舍里的位置只是给别人看，服务器只做范围和速度的粗检查 */
  MOVE_GAP_MS: 60, MAX_SPEED: 220,
} as const;

/** 空调状态：0 关、1 制冷、2 制热 */
export type AcMode = 0 | 1 | 2;
export const AC_NAMES = ['关', '制冷', '制热'] as const;

export interface DormSave {
  /** 绑定的楼栋名（如「三社区B楼」）；没选过 = 还没绑定 */
  b?: string;
  /** 上次改楼栋的日期编号（北京时间的第几天）；第一次绑定不算改 */
  bd?: number;
  /** 空调 */
  ac?: AcMode;
  /** 宝箱：物品 id → 数量 */
  ch?: Inv;
  /** 门牌：房主给宿舍起的名字（最多 8 个字） */
  n?: string;
  /** 浴缸：养在里面的鱼（物品 id → 条数）。放进去的鱼不在背包里，所以不能卖、不能交易；随时可以取回 */
  bt?: Inv;
  /** 家具摆放（装修过才有；没有 = 用原来的默认布局 defaultLay）。摆在房间里的家具不在背包里，收回来才还给背包 */
  lay?: Placed[];
}

/** 宿舍房间的尺寸与门（和 data/interiors/dorm.json 一致，测试里核对）：服务器据此限定屋里的位置范围、给新进屋的人定出生点 */
export const DORM_ROOM = { w: 16, h: 11, exitX: 7, exitW: 2 } as const;
/** 进屋出生点（像素）：门洞中间、门里面一点 */
export const roomSpawn = () => ({ x: (DORM_ROOM.exitX + DORM_ROOM.exitW / 2) * 16, y: (DORM_ROOM.h - 2.2) * 16 });
/** 门牌上显示的名字：房主起过名就用，没起过——自己看到「我的宿舍」，别人看到「xx的宿舍」 */
export const roomTitle = (title: string | undefined, hostName: string, mine: boolean): string => title || (mine ? '我的宿舍' : `${hostName}的宿舍`);
export const cleanTitle = (v: unknown): string => cleanText(v, DORM.TITLE_MAX);

/** 能住的楼栋：一~四社区的 A~I 楼，加留学生公寓；浴室、服务楼不算 */
export const isDormName = (name: unknown): name is string =>
  typeof name === 'string' && (/^[一二三四]社区[A-I]楼$/.test(name) || name === '留学生公寓');

/** 世界里能选的楼栋（按社区分组、组内按名字排序）。同名的多个楼翼只算一栋 */
export function dormOptions(buildings: readonly { name: string }[]): { group: string; names: string[] }[] {
  const set = new Set<string>();
  for (const b of buildings) if (isDormName(b.name)) set.add(b.name);
  const groups = new Map<string, string[]>();
  for (const n of set) { const g = n === '留学生公寓' ? '留学生公寓' : n.slice(0, 3); (groups.get(g) ?? groups.set(g, []).get(g)!).push(n); }
  const order = ['一社区', '二社区', '三社区', '四社区', '留学生公寓'];
  return order.filter((g) => groups.has(g)).map((g) => ({ group: g, names: groups.get(g)!.sort() }));
}

export function cleanChest(raw: unknown): Inv {
  const out: Inv = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!itemDef(id) || typeof n !== 'number' || !Number.isFinite(n)) continue;
    const v = Math.min(DORM.CHEST_STACK, Math.floor(n));
    if (v >= 1) out[id] = v;
    if (Object.keys(out).length >= DORM.CHEST_KINDS) break;
  }
  return out;
}

/** 从磁盘来的宿舍存档：楼栋名由调用方（知道世界里有哪些楼）再核对，这里只收敛类型和范围 */
export function cleanDorm(raw: unknown): DormSave | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>, out: DormSave = {};
  if (isDormName(r.b)) out.b = r.b;
  if (Number.isInteger(r.bd) && (r.bd as number) > 0) out.bd = r.bd as number;
  { const n = cleanTitle(r.n); if (n) out.n = n; }
  { const bt = cleanBath(r.bt); if (Object.keys(bt).length) out.bt = bt; }
  if (r.ac === 1 || r.ac === 2) out.ac = r.ac;
  const ch = cleanChest(r.ch); if (Object.keys(ch).length) out.ch = ch;
  { const lay = cleanLay(r.lay); if (lay) out.lay = lay; }
  return Object.keys(out).length ? out : undefined;
}

/** 换楼栋：第一次（还没绑定）随便选；之后每天最多改一次，选原来的楼栋不算改 */
export function bindDorm(d: DormSave, name: unknown, day: number, known: ReadonlySet<string>): { ok: boolean; msg: string } {
  if (!isDormName(name) || !known.has(name)) return { ok: false, msg: '没有这栋楼' };
  if (d.b === name) return { ok: true, msg: `你已经住在${name}了` };
  if (d.b && d.bd === day) return { ok: false, msg: '今天已经改过楼栋了，明天再来吧（每天只能改一次）' };
  const first = !d.b;
  d.b = name; if (!first) d.bd = day;
  return { ok: true, msg: first ? `宿舍安在${name}了。以后在这栋楼的门口按 E，或者点「宿舍」就能回家；明天起每天可以换一次楼栋` : `宿舍搬到${name}了，房间里的东西都在` };
}

/** 空调循环：关 → 制冷 → 制热 → 关 */
export const nextAc = (m: AcMode | undefined): AcMode => (((m ?? 0) + 1) % 3) as AcMode;

/** 宝箱存取（原地修改 chest 与 inv）。返回结果与移动的数量 */
export function chestMove(chest: Inv, inv: Inv, op: 'put' | 'take', id: unknown, n: unknown): { ok: boolean; msg: string; moved: number } {
  const d = typeof id === 'string' ? itemDef(id) : undefined;
  if (!d) return { ok: false, msg: '没有这种物品', moved: 0 };
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 999) return { ok: false, msg: '数量不对', moved: 0 };
  const want = n as number;
  if (op === 'put') {
    const have = inv[d.id] ?? 0; if (have < 1) return { ok: false, msg: `背包里没有${d.name}`, moved: 0 };
    if (!(d.id in chest) && Object.keys(chest).length >= DORM.CHEST_KINDS) return { ok: false, msg: `宝箱最多放 ${DORM.CHEST_KINDS} 种物品，已经满了`, moved: 0 };
    const room = DORM.CHEST_STACK - (chest[d.id] ?? 0);
    const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `宝箱里的${d.name}已经放满了`, moved: 0 };
    inv[d.id] = have - k; if (inv[d.id] <= 0) delete inv[d.id];
    chest[d.id] = (chest[d.id] ?? 0) + k;
    return { ok: true, msg: `放进宝箱：${d.name} ×${k}`, moved: k };
  }
  const have = chest[d.id] ?? 0; if (have < 1) return { ok: false, msg: `宝箱里没有${d.name}`, moved: 0 };
  const room = d.stack - (inv[d.id] ?? 0);
  const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `背包里的${d.name}已经拿满了`, moved: 0 };
  inv[d.id] = (inv[d.id] ?? 0) + k;
  chest[d.id] = have - k; if (chest[d.id] <= 0) delete chest[d.id];
  return { ok: true, msg: `拿出来：${d.name} ×${k}`, moved: k };
}

/** 睡觉：这段时间里一只精灵该恢复多少血（上限 maxHp） */
export const sleepHeal = (maxHp: number, ms: number): number => Math.max(0, Math.ceil((maxHp * Math.max(0, ms)) / DORM.SLEEP_FULL_MS));

/** 宿舍楼的门口：同名的楼可能有好几个楼翼，取有门的、面积最大的那个楼翼的第一个门；返回格坐标（门前一格） */
export function dormDoor(name: string, buildings: readonly { name: string; bbox: { w: number; h: number }; doors?: readonly { x: number; y: number; w: number; h: number }[] }[]): { x: number; y: number } | null {
  let best: (typeof buildings)[number] | undefined;
  for (const b of buildings) if (b.name === name && b.doors?.length && (!best || b.bbox.w * b.bbox.h > best.bbox.w * best.bbox.h)) best = b;
  const d = best?.doors?.[0];
  return d ? { x: d.x + d.w / 2, y: d.y + 1 } : null;
}
/** 玩家（格坐标）在不在这栋楼的某个门口 */
export function atDormDoor(name: string, tx: number, ty: number, buildings: readonly { name: string; doors?: readonly { x: number; y: number; w: number; h: number }[] }[], slack = 0): boolean {
  for (const b of buildings) if (b.name === name) for (const d of b.doors ?? []) if (tx >= d.x - 0.5 - slack && tx <= d.x + d.w + 0.5 + slack && ty >= d.y - 0.3 - slack && ty <= d.y + d.h + slack) return true;
  return false;
}

// ------------------------------------------------------------------ 浴缸
/** 能放进浴缸的：钓上来的鱼（杂物不算）。稀有度越高，缸里越闪 */
export const isBathFish = (id: unknown): id is string => { const d = typeof id === 'string' ? fishDef(id) : undefined; return !!d && d.rarity !== 'junk' && !!itemDef(d.id); };
/** 会发光的稀有度（常见的鱼只是在缸里游，不发光） */
export const GLOW_RARITIES = ['uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const satisfies readonly Rarity[];
/** 闪光的颜色：少见绿 / 稀有蓝 / 史诗紫 / 传说金 / 神话彩虹（界面和宿舍场景共用） */
export const GLOW_COLORS: Record<(typeof GLOW_RARITIES)[number], string> = { uncommon: '#7ad28a', rare: '#6aa8ff', epic: '#c08aff', legendary: '#ffd24a', mythic: '#ff7a8a' };

export function cleanBath(raw: unknown): Inv {
  const out: Inv = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBathFish(id) || typeof n !== 'number' || !Number.isFinite(n)) continue;
    const v = Math.min(DORM.BATH_STACK, Math.floor(n));
    if (v >= 1) out[id] = v;
    if (Object.keys(out).length >= DORM.BATH_KINDS) break;
  }
  return out;
}

/** 浴缸存取（原地修改 bath 与 inv）：只收鱼；放进去后背包里就没有了（所以不能卖、不能交易），取回才有 */
export function bathMove(bath: Inv, inv: Inv, op: 'put' | 'take', id: unknown, n: unknown): { ok: boolean; msg: string; moved: number } {
  const d = typeof id === 'string' ? itemDef(id) : undefined;
  if (!d) return { ok: false, msg: '没有这种东西', moved: 0 };
  if (!isBathFish(d.id)) return { ok: false, msg: `${d.name}不能放进浴缸（只能养钓上来的鱼）`, moved: 0 };
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 999) return { ok: false, msg: '数量不对', moved: 0 };
  const want = n as number;
  if (op === 'put') {
    const have = inv[d.id] ?? 0; if (have < 1) return { ok: false, msg: `背包里没有${d.name}`, moved: 0 };
    if (!(d.id in bath) && Object.keys(bath).length >= DORM.BATH_KINDS) return { ok: false, msg: `浴缸里最多养 ${DORM.BATH_KINDS} 种鱼，已经满了`, moved: 0 };
    const room = DORM.BATH_STACK - (bath[d.id] ?? 0);
    const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `浴缸里的${d.name}已经够多了（每种最多 ${DORM.BATH_STACK} 条）`, moved: 0 };
    inv[d.id] = have - k; if (inv[d.id] <= 0) delete inv[d.id];
    bath[d.id] = (bath[d.id] ?? 0) + k;
    return { ok: true, msg: `放进浴缸：${d.name} ×${k}`, moved: k };
  }
  const have = bath[d.id] ?? 0; if (have < 1) return { ok: false, msg: `浴缸里没有${d.name}`, moved: 0 };
  const room = d.stack - (inv[d.id] ?? 0);
  const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `背包里的${d.name}已经拿满了`, moved: 0 };
  inv[d.id] = (inv[d.id] ?? 0) + k;
  bath[d.id] = have - k; if (bath[d.id] <= 0) delete bath[d.id];
  return { ok: true, msg: `取回来：${d.name} ×${k}`, moved: k };
}

/** 给场景和访客看的浴缸概览：r = 少见/稀有/史诗/传说/神话各有几条；f = 最多 6 种在缸里游的鱼（稀有度高的优先） */
export interface BathView { r: number[]; f: string[] }
const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
export function bathView(bath: Inv | undefined): BathView {
  const r = GLOW_RARITIES.map(() => 0), list: { id: string; rank: number; n: number }[] = [];
  for (const [id, n] of Object.entries(bath ?? {})) { const d = fishDef(id); if (!d || !(n >= 1)) continue; const rank = RANK[d.rarity] ?? 0; if (rank >= 1) r[rank - 1] += n; list.push({ id, rank, n }); }
  list.sort((a, b) => b.rank - a.rank || b.n - a.n || (a.id < b.id ? -1 : 1));
  return { r, f: list.slice(0, 6).map((x) => x.id) };
}
/** 最高的发光稀有度：0 = 没有会发光的鱼，1..5 = 少见..神话 */
export const glowTier = (v: BathView): number => { for (let i = v.r.length - 1; i >= 0; i--) if (v.r[i] > 0) return i + 1; return 0; };
/** 闪光的密度 0..1：发光的鱼越多越密（封顶） */
export const glowDensity = (v: BathView): number => Math.min(1, 0.15 + v.r.reduce((a, b) => a + b, 0) / 40);

// ------------------------------------------------------------------ 装修（家具摆放）
/** 房间里现在的摆放：装修过就用存档里的，没装修过用原来的默认布局 */
export const layOf = (d: DormSave | undefined): Placed[] => d?.lay ?? defaultLay();

export type LayOp = { op: 'place'; d: string; x: number; y: number; r?: number } | { op: 'move'; i: number; x: number; y: number; r?: number } | { op: 'pick'; i: number };
const asRot = (r: unknown): Rot | undefined => (r === 90 || r === 180 || r === 270 ? r : undefined);

/**
 * 装修一步（原地修改存档 d 和背包 inv；校验失败什么都不改）：
 * place = 从背包拿一件摆上去；move = 把已摆的一件挪个位置/转个方向；pick = 收回背包。
 * 摆完整体再校验一遍（layError：不重叠、不堵路、小件在桌上…），所以改任何一件都不会让房间变成非法状态。
 */
export function layApply(d: DormSave, inv: Inv, op: LayOp): { ok: boolean; msg: string } {
  const cur = layOf(d), bad = (msg: string) => ({ ok: false, msg });
  let next: Placed[], done: string;
  if (op.op === 'place') {
    const def = decorDef(op.d); if (!def) return bad('没有这件家具');
    if ((inv[def.id] ?? 0) < 1) return bad(`背包里没有${def.name}`);
    const p: Placed = { d: def.id, x: op.x, y: op.y }; const r = asRot(op.r); if (r) p.r = r;
    next = [...cur, p]; done = `摆上了${def.name}`;
    const err = layError(next); if (err) return bad(err);
    inv[def.id] -= 1; if (inv[def.id] <= 0) delete inv[def.id];
  } else {
    if (!Number.isInteger(op.i) || op.i < 0 || op.i >= cur.length) return bad('找不到这件家具');
    const old = cur[op.i], def = decorDef(old.d)!;
    if (op.op === 'move') {
      const p: Placed = { d: old.d, x: op.x, y: op.y }; const r = asRot(op.r); if (r) p.r = r;
      next = cur.map((q, i) => (i === op.i ? p : q)); done = `挪好了${def.name}`;
      const err = layError(next); if (err) return bad(err);
    } else {
      if (def.surface && cur.some((q) => decorDef(q.d)?.kind === 'top' && q.x >= old.x && q.y >= old.y && q.x < old.x + def.fw && q.y < old.y + def.fh)) return bad('桌子上还有东西，先把桌上的小件收起来');
      const have = inv[def.id] ?? 0; if (have + 1 > STACKCAP) return bad(`背包里的${def.name}放不下了`);
      next = cur.filter((_, i) => i !== op.i); done = `收回了${def.name}`;
      const err = layError(next); if (err) return bad(err);
      inv[def.id] = have + 1;
    }
  }
  d.lay = next;
  return { ok: true, msg: done };
}
const STACKCAP = 999;
