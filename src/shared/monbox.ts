/**
 * 玩家的精灵存档与整理规则（客户端与服务器共用，纯函数）：出战队伍 sq（≤6，第 1 只是首发）、精灵背包 bx（≤60）、
 * 图鉴 dex（物种 id → 见过/收服次数）。所有改动都由服务器按这里的规则执行，客户端只发"想做什么"。
 */
import { MON, STAT_KEYS, maxHp, moveSlots, newMon, restore, type Content, type Mon, type Rng } from './mons';
import { WILD } from './wild';
import { catSpeciesId, isCatSpecies } from './cat-mons';
import { cleanText } from './profile';

export interface DexEntry { s: number; c: number }
export interface MonSave {
  /** 出战队伍（第 1 只 = 首发） */
  sq: Mon[];
  /** 精灵背包（仓库） */
  bx: Mon[];
  dex: Record<string, DexEntry>;
  /** 是否领过初始精灵 */
  starter: boolean;
  /** 实例编号计数器（只增不减） */
  n: number;
  /** 上次按时间回血的时间戳（毫秒） */
  rt?: number;
  /** 已经收到过登录赠送的耄耋猫（每人一次，放生了也不再送） */
  dm?: 1;
  /** 已经收服过的校园猫编号（每只猫每个玩家只能收服一次：好感度满值收服或对战中收服都算） */
  ct?: number[];
}
export interface OpResult { ok: boolean; msg: string }

export const emptyMonSave = (): MonSave => ({ sq: [], bx: [], dex: {}, starter: false, n: 0 });

const int = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);

/** 从磁盘来的数据：不认识的物种/技能丢掉，数值收敛到合法范围，重复 id 丢掉，超出容量的丢掉 */
export function cleanMon(raw: unknown, ct: Content): Mon | null {
  const r = raw as Partial<Mon> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 24 || typeof r.sp !== 'string' || !ct.species.has(r.sp)) return null;
  const lv = int(r.lv, 1, MON.LEVEL_CAP, 1);
  const iv = STAT_KEYS.map((_, i) => int(Array.isArray(r.iv) ? r.iv[i] : 0, 0, MON.MAX_IV, 0));
  const mv = (Array.isArray(r.mv) ? r.mv : []).flatMap((m) => {
    const d = typeof m?.id === 'string' ? ct.moves.get(m.id) : undefined;
    return d ? [{ id: d.id, pp: int(m.pp, 0, d.pp, d.pp) }] : [];
  }).slice(0, moveSlots(ct.species.get(r.sp)));
  const m: Mon = { id: r.id, sp: r.sp, lv, xp: int(r.xp, lv * lv * lv, 1e9, lv * lv * lv), hp: 0, iv, mv, at: int(r.at, 0, 8.64e15, 0) };
  m.hp = int(r.hp, 0, maxHp(ct, m), maxHp(ct, m));
  if (typeof r.nick === 'string') { const n = cleanText(r.nick, MON.NICK_MAX); if (n) m.nick = n; }
  if (r.sh === 1) m.sh = 1;
  if (Number.isInteger(r.cat) && (r.cat as number) >= 0 && (r.cat as number) < 256) m.cat = r.cat;
  return m;
}

export function cleanMonSave(raw: unknown, ct: Content): MonSave | undefined {
  const r = raw as Partial<MonSave> | null;
  if (!r || typeof r !== 'object') return undefined;
  const seen = new Set<string>();
  const list = (a: unknown, cap: number): Mon[] => (Array.isArray(a) ? a : []).flatMap((x) => { const m = cleanMon(x, ct); if (!m || seen.has(m.id)) return []; seen.add(m.id); return [m]; }).slice(0, cap);
  const dex: Record<string, DexEntry> = {};
  for (const [id, e] of Object.entries((r.dex ?? {}) as Record<string, Partial<DexEntry>>)) if (ct.species.has(id) && e) dex[id] = { s: int(e.s, 0, 1e9, 0), c: int(e.c, 0, 1e9, 0) };
  const s: MonSave = { sq: list(r.sq, MON.SQUAD_MAX), bx: list(r.bx, MON.BOX_MAX), dex, starter: r.starter === true, n: int(r.n, 0, 1e9, 0) };
  if (Array.isArray(r.ct)) { const ct = [...new Set(r.ct.filter((c): c is number => Number.isInteger(c) && c >= 0 && c < 256))].slice(0, 64); if (ct.length) s.ct = ct; }
  if (r.rt !== undefined) { const rt = int(r.rt, 0, 8.64e15, 0); if (rt) s.rt = rt; }
  if (r.dm === 1) s.dm = 1;
  return s;
}

const find = (s: MonSave, id: string): { m: Mon; where: 'sq' | 'bx'; i: number } | null => {
  let i = s.sq.findIndex((m) => m.id === id); if (i >= 0) return { m: s.sq[i], where: 'sq', i };
  i = s.bx.findIndex((m) => m.id === id); return i >= 0 ? { m: s.bx[i], where: 'bx', i } : null;
};
export const findMon = (s: MonSave, id: string): Mon | null => find(s, id)?.m ?? null;
export const monCount = (s: MonSave): number => s.sq.length + s.bx.length;
const fail = (msg: string): OpResult => ({ ok: false, msg });

/** 图鉴记账：见过 / 收服 */
export function dexMark(s: MonSave, spId: string, caught: boolean): void {
  const e = (s.dex[spId] ??= { s: 0, c: 0 });
  e.s++; if (caught) e.c++;
}

/** 收服记账：收服次数 +1（见过的次数在遭遇时已经记过，这里只保证"收服 ≤ 见过"） */
export function dexCaught(s: MonSave, spId: string): void {
  const e = (s.dex[spId] ??= { s: 0, c: 0 });
  e.c++; if (e.s < e.c) e.s = e.c;
}

/** 按时间慢慢回血：从上次算起经过 REGEN_MS 回满；回满的精灵技能 PP 也补满。返回有没有变化 */
export function regenSave(ct: Content, s: MonSave, now: number): boolean {
  const last = s.rt ?? now; s.rt = now;
  const frac = Math.max(0, now - last) / WILD.REGEN_MS;
  if (frac <= 0) return false;
  let changed = false;
  for (const m of [...s.sq, ...s.bx]) {
    const max = maxHp(ct, m);
    if (m.hp < max) { m.hp = Math.min(max, m.hp + Math.ceil(max * frac)); changed = true; }
    if (m.hp >= max) for (const x of m.mv) { const d = ct.moves.get(x.id); if (d && x.pp < d.pp) { x.pp = d.pp; changed = true; } }
  }
  return changed;
}
/** 在宿舍睡觉：每过一段时间，全体精灵按"睡满 fullMs 从 0 回满"的速度慢慢恢复（倒下的也会醒过来）；回满的精灵技能 PP 也补满。返回有没有变化 */
export function sleepSave(ct: Content, s: MonSave, ms: number, fullMs: number): boolean {
  if (!(ms > 0) || !(fullMs > 0)) return false;
  let changed = false;
  for (const m of [...s.sq, ...s.bx]) {
    const max = maxHp(ct, m);
    if (m.hp < max) { m.hp = Math.min(max, m.hp + Math.max(1, Math.ceil((max * ms) / fullMs))); changed = true; }
    if (m.hp >= max) for (const x of m.mv) { const d = ct.moves.get(x.id); if (d && x.pp < d.pp) { x.pp = d.pp; changed = true; } }
  }
  return changed;
}
/** 队伍和背包里还有没有没恢复满的精灵（睡觉时用来判断要不要提示"都睡饱了"） */
export const anyHurt = (ct: Content, s: MonSave): boolean => [...s.sq, ...s.bx].some((m) => m.hp < maxHp(ct, m));
/** 队伍和背包里的精灵全部回满（长椅上休息） */
export function restAll(ct: Content, s: MonSave): boolean {
  const hurt = [...s.sq, ...s.bx].some((m) => m.hp < maxHp(ct, m) || m.mv.some((x) => x.pp < (ct.moves.get(x.id)?.pp ?? x.pp)));
  for (const m of [...s.sq, ...s.bx]) restore(ct, m);
  return hurt;
}

/** 新精灵放进队伍（满了进背包；背包也满了返回 null，不收） */
export function addMon(s: MonSave, m: Mon): 'sq' | 'bx' | null {
  if (s.sq.length < MON.SQUAD_MAX) { s.sq.push(m); return 'sq'; }
  if (s.bx.length < MON.BOX_MAX) { s.bx.push(m); return 'bx'; }
  return null;
}

/** 领取初始精灵（只能领一次，只能从 starters 里选） */
export function pickStarter(ct: Content, s: MonSave, starters: readonly string[], spId: string, level: number, rnd: Rng, now: number): OpResult {
  if (s.starter) return fail('你已经领过初始精灵了');
  if (!starters.includes(spId) || !ct.species.has(spId)) return fail('不能选这只精灵');
  const m = newMon(ct, spId, level, rnd, `m${now.toString(36)}${(++s.n).toString(36)}`, now);
  addMon(s, m); s.starter = true; dexMark(s, spId, true);
  return { ok: true, msg: `${ct.species.get(spId)!.name} 成为了你的伙伴` };
}

/** 在队伍和背包之间移动。移出队伍后队伍至少要留 1 只；移进队伍要有空位 */
export function moveMon(s: MonSave, id: string, to: 'sq' | 'bx'): OpResult {
  const f = find(s, id); if (!f) return fail('找不到这只精灵');
  if (f.where === to) return fail(to === 'sq' ? '它已经在队伍里了' : '它已经在精灵背包里了');
  if (to === 'sq') {
    if (s.sq.length >= MON.SQUAD_MAX) return fail(`队伍已满（最多 ${MON.SQUAD_MAX} 只），先放一只回精灵背包`);
    s.bx.splice(f.i, 1); s.sq.push(f.m);
  } else {
    if (s.sq.length <= 1) return fail('队伍里至少要留一只精灵');
    if (s.bx.length >= MON.BOX_MAX) return fail('精灵背包已满');
    s.sq.splice(f.i, 1); s.bx.push(f.m);
  }
  return { ok: true, msg: to === 'sq' ? '加入了出战队伍' : '放回了精灵背包' };
}

/** 重新排队伍：ids 必须正好是当前队伍里的那几只（只是换顺序） */
export function reorderSquad(s: MonSave, ids: unknown): OpResult {
  if (!Array.isArray(ids) || ids.length !== s.sq.length || new Set(ids).size !== ids.length) return fail('队伍顺序不对');
  const by = new Map(s.sq.map((m) => [m.id, m]));
  const next = ids.map((i) => (typeof i === 'string' ? by.get(i) : undefined));
  if (next.some((m) => !m)) return fail('队伍顺序不对');
  s.sq = next as Mon[];
  return { ok: true, msg: '队伍顺序已调整' };
}

/** 取昵称（空 = 恢复原名）；文字过服务器的清洗 */
export function nickMon(s: MonSave, id: string, name: unknown): OpResult {
  const m = findMon(s, id); if (!m) return fail('找不到这只精灵');
  if (typeof name !== 'string') return fail('昵称不对');
  const n = cleanText(name, MON.NICK_MAX);
  if (n) m.nick = n; else delete m.nick;
  return { ok: true, msg: n ? `昵称改成了「${n}」` : '恢复了原名' };
}

/** 放生：队伍里至少留 1 只、总数至少留 1 只（不能把自己放成没有精灵） */
export function freeMon(s: MonSave, id: string): OpResult {
  const f = find(s, id); if (!f) return fail('找不到这只精灵');
  if (monCount(s) <= 1) return fail('这是你唯一的精灵，不能放生');
  if (f.where === 'sq') { if (s.sq.length <= 1) return fail('队伍里至少要留一只精灵（先把背包里的精灵加入队伍）'); s.sq.splice(f.i, 1); }
  else s.bx.splice(f.i, 1);
  return { ok: true, msg: '放生了，它回到了校园里' };
}

// ------------------------------------------------------------------ 猫系精灵
export const TAME_LEVEL = 12;
/** 队伍里有没有还能战斗的猫系精灵（"老吴对战"的参赛条件） */
export const hasCatFighter = (s: MonSave): boolean => s.sq.some((m) => isCatSpecies(m.sp) && m.hp > 0);
export const isTamed = (s: MonSave, catId: number): boolean => !!s.ct?.includes(catId);
/** 记一只猫已经被收服 */
export function markTamed(s: MonSave, catId: number): void { const ct = (s.ct ??= []); if (!ct.includes(catId)) ct.push(catId); }

/**
 * 把一只校园小猫收服成精灵（好感度要不要满由调用方——服务器——检查；对战中收服不需要好感度）：
 * 校园里的猫还在，玩家得到的是一只新的精灵（以猫的名字为昵称，可以改名），每只猫每个玩家只能收服一次。
 */
export function tameCat(ct: Content, s: MonSave, cat: { id: number; coat: number; name: string }, rnd: Rng, now: number): OpResult & { mon?: Mon } {
  if (isTamed(s, cat.id)) return { ok: false, msg: `你已经收服过${cat.name}了` };
  const m = newMon(ct, catSpeciesId(cat.coat, 1), TAME_LEVEL, rnd, `m${now.toString(36)}${(++s.n).toString(36)}`, now);
  m.cat = cat.id; m.nick = cleanText(cat.name, MON.NICK_MAX) || undefined; if (!m.nick) delete m.nick;
  if (!addMon(s, m)) { s.n--; return { ok: false, msg: '精灵背包已满，先放生一些再来' }; }
  markTamed(s, cat.id); dexMark(s, m.sp, true);
  return { ok: true, msg: `${cat.name}成为了你的精灵！`, mon: m };
}
