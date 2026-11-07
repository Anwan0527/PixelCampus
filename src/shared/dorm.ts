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
import { DYE_ITEM, dyeName, isDyeIdx } from './dye';
import { LEGACY_STARTERS, cleanLay, decorDef, defaultLay, footOf, isRoomLevel, layError, ROOM_SIZES, type Placed, type Rot, type RoomLevel } from './decor';
import { FLOOR_SKINS, ROOM_NAMES, ROOM_PRICES, SKINS, WALL_SKINS, type SkinKind } from './dormskin';

export const DORM = {
  /** 宝箱最多放几种物品 / 每种最多放多少 */
  CHEST_KINDS: 24, CHEST_STACK: 999,
  /** 鱼缸：最多养几种鱼 / 每种最多几条（只是展示用，不是第二个仓库） */
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
  /** 点赞：一间宿舍最多记多少个赞（满了就不能再赞了）/ 每人每天最多赞几次 / 要累计在线满多少秒才能点赞（防小号刷赞） */
  LIKE_MAX: 500, LIKE_DAILY: 20, LIKE_MIN_PT: 600,
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
  /** 鱼缸：养在里面的鱼（物品 id → 条数）。放进去的鱼不在背包里，所以不能卖、不能交易；随时可以取回 */
  bt?: Inv;
  /** 家具摆放（装修过才有；没有 = 用原来的默认布局 defaultLay）。摆在房间里的家具不在背包里，收回来才还给背包 */
  lay?: Placed[];
  /** 2 = 摆放里已经包含固有家具（床、衣柜、宝箱、鱼缸、空调、门牌、窗）；没有这个标记的老存档读取时会把它们补在原来的位置上 */
  v?: 2;
  /** 点过赞的人（校园号）；最多 DORM.LIKE_MAX 个，赞数 = 人数 */
  lk?: number[];
  /** 1 = 不在资料卡上展示我的宿舍（默认展示） */
  hid?: 1;
  /** 房间级别：1 = 中屋、2 = 大屋（没有 = 小屋）。扩建不可退 */
  rm?: 1 | 2;
  /** 墙纸 / 地板：w、f = 正在用的样式下标（缺省 0 = 默认）；ow、of = 已买的样式（按位记，第 i 位 = 第 i 种；第 0 种永远拥有） */
  sk?: { w?: number; f?: number; ow?: number; of?: number };
}

/** 宿舍房间的尺寸与门（和 data/interiors/dorm.json 一致，测试里核对）：服务器据此限定屋里的位置范围、给新进屋的人定出生点 */
export const DORM_ROOM = { w: 16, h: 11, exitX: 7, exitW: 2 } as const;
/** 某一级房间的尺寸与门（门洞永远在 x 7..8，在南墙上） */
export const dormRoom = (level: number = 0) => { const r = ROOM_SIZES[isRoomLevel(level) ? level : 0]; return { w: r.w, h: r.h, exitX: 7, exitW: 2 } as const; };
export const roomLevel = (d: DormSave | undefined): RoomLevel => (d?.rm === 1 || d?.rm === 2 ? d.rm : 0);
/** 宿舍在室内数据里的 id：小屋 dorm、中屋 dorm-2、大屋 dorm-3 */
export const dormInteriorId = (level: number = 0) => (level === 1 ? 'dorm-2' : level === 2 ? 'dorm-3' : 'dorm');
export const isDormInterior = (id: unknown): boolean => id === 'dorm' || id === 'dorm-2' || id === 'dorm-3';
export const dormInteriorLevel = (id: unknown): RoomLevel => (id === 'dorm-2' ? 1 : id === 'dorm-3' ? 2 : 0);
/** 进屋出生点（像素）：门洞中间、门里面一点 */
export const roomSpawn = (level: number = 0) => { const r = dormRoom(level); return { x: (r.exitX + r.exitW / 2) * 16, y: (r.h - 2.2) * 16 }; };
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
  if (r.rm === 1 || r.rm === 2) out.rm = r.rm;
  { const sk = cleanSkin(r.sk); if (sk) out.sk = sk; }
  if (Array.isArray(r.lay)) { // 老存档（v1）的摆放里没有固有家具：补在原来固定的位置上（和旧规则一致，不会和玩家的摆放冲突）
    const lay = cleanLay(r.v === 2 ? r.lay : [...LEGACY_STARTERS, ...r.lay], out.rm ?? 0); if (lay) { out.lay = lay; out.v = 2; }
  }
  { const lk = cleanLikes(r.lk); if (lk.length) out.lk = lk; }
  if (r.hid === 1) out.hid = 1;
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

// ------------------------------------------------------------------ 鱼缸
/** 能放进鱼缸的：钓上来的鱼（杂物不算）。稀有度越高，缸里越闪 */
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

/** 鱼缸存取（原地修改 bath 与 inv）：只收鱼；放进去后背包里就没有了（所以不能卖、不能交易），取回才有 */
export function bathMove(bath: Inv, inv: Inv, op: 'put' | 'take', id: unknown, n: unknown): { ok: boolean; msg: string; moved: number } {
  const d = typeof id === 'string' ? itemDef(id) : undefined;
  if (!d) return { ok: false, msg: '没有这种东西', moved: 0 };
  if (!isBathFish(d.id)) return { ok: false, msg: `${d.name}不能放进鱼缸（只能养钓上来的鱼）`, moved: 0 };
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 999) return { ok: false, msg: '数量不对', moved: 0 };
  const want = n as number;
  if (op === 'put') {
    const have = inv[d.id] ?? 0; if (have < 1) return { ok: false, msg: `背包里没有${d.name}`, moved: 0 };
    if (!(d.id in bath) && Object.keys(bath).length >= DORM.BATH_KINDS) return { ok: false, msg: `鱼缸里最多养 ${DORM.BATH_KINDS} 种鱼，已经满了`, moved: 0 };
    const room = DORM.BATH_STACK - (bath[d.id] ?? 0);
    const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `鱼缸里的${d.name}已经够多了（每种最多 ${DORM.BATH_STACK} 条）`, moved: 0 };
    inv[d.id] = have - k; if (inv[d.id] <= 0) delete inv[d.id];
    bath[d.id] = (bath[d.id] ?? 0) + k;
    return { ok: true, msg: `放进鱼缸：${d.name} ×${k}`, moved: k };
  }
  const have = bath[d.id] ?? 0; if (have < 1) return { ok: false, msg: `鱼缸里没有${d.name}`, moved: 0 };
  const room = d.stack - (inv[d.id] ?? 0);
  const k = Math.min(want, have, room); if (k < 1) return { ok: false, msg: `背包里的${d.name}已经拿满了`, moved: 0 };
  inv[d.id] = (inv[d.id] ?? 0) + k;
  bath[d.id] = have - k; if (bath[d.id] <= 0) delete bath[d.id];
  return { ok: true, msg: `取回来：${d.name} ×${k}`, moved: k };
}

/** 给场景和访客看的鱼缸概览：r = 少见/稀有/史诗/传说/神话各有几条；f = 最多 6 种在缸里游的鱼（稀有度高的优先） */
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
export const layOf = (d: DormSave | undefined): Placed[] => d?.lay ?? defaultLay(roomLevel(d));

export type LayOp = { op: 'place'; d: string; x: number; y: number; r?: number } | { op: 'move'; i: number; x: number; y: number; r?: number } | { op: 'pick'; i: number } | { op: 'dye'; i: number; c: number };
const asRot = (r: unknown): Rot | undefined => (r === 90 || r === 180 || r === 270 ? r : undefined);

/**
 * 装修一步（原地修改存档 d 和背包 inv；校验失败什么都不改）：
 * place = 从背包拿一件摆上去；move = 把已摆的一件挪个位置/转个方向（颜色跟着走）；pick = 收回背包（会褪色）；
 * dye = 给已摆的一件染色（c = 1..12 花 1 份染料；c = 0 染回原色免费；已经是这个颜色就什么都不花）。
 * 摆完整体再校验一遍（layError：不重叠、不堵路、小件在桌上…），所以改任何一件都不会让房间变成非法状态。
 */
export function layApply(d: DormSave, inv: Inv, op: LayOp): { ok: boolean; msg: string } {
  const cur = layOf(d), lv = roomLevel(d), bad = (msg: string) => ({ ok: false, msg });
  let next: Placed[], done: string;
  if (op.op === 'place') {
    const def = decorDef(op.d); if (!def) return bad('没有这件家具');
    if ((inv[def.id] ?? 0) < 1) return bad(`背包里没有${def.name}`);
    const p: Placed = { d: def.id, x: op.x, y: op.y }; const r = asRot(op.r); if (r) p.r = r;
    next = [...cur, p]; done = `摆上了${def.name}`;
    const err = layError(next, lv); if (err) return bad(err);
    inv[def.id] -= 1; if (inv[def.id] <= 0) delete inv[def.id];
  } else {
    if (!Number.isInteger(op.i) || op.i < 0 || op.i >= cur.length) return bad('找不到这件家具');
    const old = cur[op.i], def = decorDef(old.d)!;
    if (op.op === 'move') {
      const p: Placed = { d: old.d, x: op.x, y: op.y }; const r = asRot(op.r); if (r) p.r = r;
      if (old.c) p.c = old.c; // 挪动、转向不褪色
      // 地毯、门垫是按摆放顺序叠的（摆得晚的在上面）：挪动它就是把它拿起来重新铺，所以放到最上面去
      next = def.kind === 'rug' || def.kind === 'mat' ? [...cur.filter((_, i) => i !== op.i), p] : cur.map((q, i) => (i === op.i ? p : q)); done = `挪好了${def.name}`;
      const err = layError(next, lv); if (err) return bad(err);
    } else if (op.op === 'dye') {
      const c = op.c;
      if (c !== 0 && !isDyeIdx(c)) return bad('颜色不对');
      if (!def.dye) return bad(`${def.name}不能染色`);
      if ((old.c ?? 0) === c) return bad(`${def.name}已经是${dyeName(c)}了`);
      if (c !== 0 && (inv[DYE_ITEM] ?? 0) < 1) return bad('背包里没有染料了，去校园商店买');
      const p: Placed = { ...old }; if (c) p.c = c; else delete p.c;
      next = cur.map((q, i) => (i === op.i ? p : q)); done = c ? `${def.name}染成了${dyeName(c)}` : `${def.name}染回了原色`;
      const err = layError(next, lv); if (err) return bad(err);
      if (c !== 0) { inv[DYE_ITEM] -= 1; if (inv[DYE_ITEM] <= 0) delete inv[DYE_ITEM]; }
    } else {
      if (def.surface) { const { fw, fh } = footOf(def, old.r); if (cur.some((q) => decorDef(q.d)?.kind === 'top' && q.x >= old.x && q.y >= old.y && q.x < old.x + fw && q.y < old.y + fh)) return bad('桌子上还有东西，先把桌上的小件收起来'); }
      const have = inv[def.id] ?? 0; if (have + 1 > STACKCAP) return bad(`背包里的${def.name}放不下了`);
      next = cur.filter((_, i) => i !== op.i); done = `收回了${def.name}`;
      const err = layError(next, lv); if (err) return bad(err);
      inv[def.id] = have + 1;
    }
  }
  d.lay = next; d.v = 2;
  return { ok: true, msg: done };
}
const STACKCAP = 999;

// ------------------------------------------------------------------ 资料卡上的宿舍与点赞
/** 资料卡上展示的宿舍：门牌、楼栋、家具摆放（没装修过 = 默认布局）、赞数、我有没有赞过 */
export interface DormCard { title?: string; b: string; lay: Placed[]; likes: number; liked: boolean; /** 房间级别、墙纸/地板（缩略图按它画） */ rm?: 1 | 2; sk?: { w?: number; f?: number } }
export function cleanLikes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const v of raw) if (Number.isInteger(v) && (v as number) > 0 && seen.size < DORM.LIKE_MAX) seen.add(v as number);
  return [...seen];
}
/** 点赞 / 取消赞（原地修改）：不能赞自己；已满不能再加；再点一次取消。每天上限、在线时长在服务器另外检查 */
export function likeToggle(d: DormSave, by: number, host: number): { ok: boolean; msg: string; liked: boolean; n: number } {
  if (by === host) return { ok: false, msg: '不能给自己的宿舍点赞', liked: false, n: d.lk?.length ?? 0 };
  const lk = (d.lk ??= []), at = lk.indexOf(by);
  if (at >= 0) { lk.splice(at, 1); if (!lk.length) delete d.lk; return { ok: true, msg: '取消了赞', liked: false, n: lk.length }; }
  if (lk.length >= DORM.LIKE_MAX) return { ok: false, msg: `这间宿舍的赞已经满啦（${DORM.LIKE_MAX}）`, liked: false, n: lk.length };
  lk.push(by);
  return { ok: true, msg: '赞了这间宿舍 ♥', liked: true, n: lk.length };
}

// ------------------------------------------------------------------ 墙纸、地板、扩建
export function cleanSkin(raw: unknown): DormSave['sk'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>, out: NonNullable<DormSave['sk']> = {};
  const idx = (v: unknown, n: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) < n ? (v as number) : 0);
  const mask = (v: unknown, n: number) => (Number.isInteger(v) ? ((v as number) & ((1 << n) - 2)) : 0); // 只留第 1..n-1 位（第 0 种不用记）
  const w = idx(r.w, WALL_SKINS.length), f = idx(r.f, FLOOR_SKINS.length), ow = mask(r.ow, WALL_SKINS.length), of = mask(r.of, FLOOR_SKINS.length);
  if (w) out.w = w; if (f) out.f = f; if (ow) out.ow = ow; if (of) out.of = of;
  return Object.keys(out).length ? out : undefined;
}
/** 正在用的墙纸、地板样式（没选过 = 0 = 默认） */
export const skinOf = (d: DormSave | undefined): { w: number; f: number } => ({ w: d?.sk?.w ?? 0, f: d?.sk?.f ?? 0 });
/** 拥有这个样式吗（第 0 种默认永远拥有；买了的也一直拥有，当前正在用的一定拥有） */
export function skinOwned(d: DormSave | undefined, kind: SkinKind, idx: number): boolean {
  if (idx === 0) return true;
  const m = kind === 'w' ? d?.sk?.ow : d?.sk?.of;
  return !!m && (m & (1 << idx)) !== 0;
}
/**
 * 买墙纸/地板或换着用（原地修改存档）。coins = 我现在有多少校园币；返回 cost = 要扣的币（调用方扣，保证够才会改存档）。
 * buy：没买过才买（买下就用上）；use：只能用已经拥有的。选原来正在用的什么也不做。
 */
export function skinApply(d: DormSave, kind: SkinKind, idx: unknown, op: unknown, coins: number): { ok: boolean; msg: string; cost: number } {
  const list = SKINS[kind], name = (i: number) => list[i].name;
  if (kind !== 'w' && kind !== 'f') return { ok: false, msg: '没有这种东西', cost: 0 };
  if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= list.length) return { ok: false, msg: '没有这个样式', cost: 0 };
  const i = idx as number, cur = skinOf(d)[kind];
  if (op === 'use') {
    if (!skinOwned(d, kind, i)) return { ok: false, msg: `还没买${name(i)}`, cost: 0 };
    if (i === cur) return { ok: true, msg: `正在用${name(i)}`, cost: 0 };
  } else if (op === 'buy') {
    if (skinOwned(d, kind, i)) return { ok: false, msg: `已经有${name(i)}了，直接用就行`, cost: 0 };
    if (coins < list[i].price) return { ok: false, msg: `校园币不够：要 ${list[i].price}，你有 ${coins}`, cost: 0 };
  } else return { ok: false, msg: '操作不对', cost: 0 };
  const sk = (d.sk ??= {}), price = op === 'buy' ? list[i].price : 0;
  if (op === 'buy') { if (kind === 'w') sk.ow = (sk.ow ?? 0) | (1 << i); else sk.of = (sk.of ?? 0) | (1 << i); }
  if (kind === 'w') { if (i) sk.w = i; else delete sk.w; } else { if (i) sk.f = i; else delete sk.f; }
  if (!Object.keys(sk).length) delete d.sk;
  return { ok: true, msg: op === 'buy' ? `买下并换上了${name(i)}（花了 ${price} 校园币）` : `换上了${name(i)}`, cost: price };
}
/** 扩建一级（小屋 → 中屋 → 大屋，不可退）。coins 够才改存档，cost 由调用方扣；摆放不变（升级后仍合法，见 decor.ts） */
export function expandApply(d: DormSave, coins: number): { ok: boolean; msg: string; cost: number } {
  const lv = roomLevel(d);
  if (lv >= 2) return { ok: false, msg: '已经是最大的房间了', cost: 0 };
  const next = (lv + 1) as 1 | 2, price = ROOM_PRICES[next];
  if (coins < price) return { ok: false, msg: `校园币不够：扩建${ROOM_NAMES[next]}要 ${price}，你有 ${coins}`, cost: 0 };
  d.rm = next;
  return { ok: true, msg: `房间扩建成${ROOM_NAMES[next]}了（${dormRoom(next).w}×${dormRoom(next).h}），花了 ${price} 校园币`, cost: price };
}
