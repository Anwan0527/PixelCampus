/**
 * 宿舍家具与摆放（客户端与服务器共用）。
 * - 目录 DECOR：商店里卖的家具。每件家具就是一种背包物品（id 形如 dc_sofa），摆上去从背包扣一个、收回来还一个，
 *   所以不会复制，也能面对面交易。精灵图在家具图集里（k 是图集里的名字，tools/art/furniture-decor.ts 和 furniture*.ts 画的）。
 * - 摆放 Placed：{ d: 物品 id, x, y, r? }，存在 DormSave.lay；没装修过的玩家用 defaultLay()（原来房里的桌椅、盆栽、垃圾桶）。
 * - 校验 layError：服务器不信任客户端，客户端也用它判断"这里能不能放"（绿/红）。规则：
 *   地面家具不出界、不重叠、不压在床/衣柜/宝箱/浴缸上、不挡门口；摆完之后门口到每件功能家具必须还走得通；
 *   小件（书、台灯…）只能放在桌子上；墙饰只能挂北墙、不挡窗户/空调/门牌；地毯铺在地上，可以被家具压着。
 * 房间尺寸、固定家具的位置要和 data/interiors/dorm.json 一致（tests/decor.test.ts 核对）。
 */

export type DecorCat = '桌椅' | '柜架' | '电器' | '软装' | '地毯' | '墙饰' | '小件';
/** floor = 占地的地面家具；rug = 地毯（铺在地上、不挡路）；wall = 北墙上的挂件；top = 摆在桌面上的小件（1×1） */
export type DecorKind = 'floor' | 'rug' | 'wall' | 'top';
export interface DecorDef {
  /** 背包物品 id */ id: string;
  /** 家具图集里的精灵名 */ k: string;
  name: string; cat: DecorCat; kind: DecorKind;
  /** 占地（格）；墙饰 fh = 0 */ fw: number; fh: number;
  /** 墙饰：精灵有几格高（挂在墙上占几行） */ wh?: number;
  /** 商店价（校园币）；0 = 不卖（目前没有） */ price: number;
  /** 桌子：小件可以放在它上面 */ surface?: boolean;
  /** 地毯可以转 90 度 */ turn?: boolean;
  /** 走近按 E 看到的一句话（可选） */ say?: string;
  note: string;
}

const D = (id: string, k: string, name: string, cat: DecorCat, kind: DecorKind, fw: number, fh: number, price: number, note: string, extra: Partial<DecorDef> = {}): DecorDef =>
  ({ id, k, name, cat, kind, fw, fh, price, note, ...extra });

export const DECOR: readonly DecorDef[] = [
  // ---- 桌椅
  D('dc_desk', 'desk', '木书桌', '桌椅', 'floor', 2, 1, 60, '朴素的木书桌，带一个抽屉。'),
  D('dc_deskpc', 'deskpc', '木桌+电脑', '桌椅', 'floor', 2, 1, 120, '带一台电脑的木书桌，宿舍原来就有的那张。', { say: '屏幕亮着：教务系统的课表上写着「今天没课」。右下角弹出一条消息——「河北工程大学新校区欢迎你」。' }),
  D('dc_table2', 'table2', '小木桌', '桌椅', 'floor', 2, 1, 50, '放点小东西的小木桌。'),
  D('dc_dtable', 'dc_dtable', '书桌', '桌椅', 'floor', 2, 2, 90, '干净的浅色木书桌，桌面上可以摆书、台灯和小盆栽。', { surface: true }),
  D('dc_dtable3', 'dc_dtable3', '长桌', '桌椅', 'floor', 3, 2, 130, '三格宽的长桌，桌面上能摆好多小东西。', { surface: true }),
  D('dc_chair', 'chair', '木椅（朝南）', '桌椅', 'floor', 1, 1, 30, '朝南的木椅。'),
  D('dc_chairup', 'chairup', '木椅（朝北）', '桌椅', 'floor', 1, 1, 30, '朝北的木椅，配书桌用。'),
  D('dc_stool', 'stool', '蓝凳子', '桌椅', 'floor', 1, 1, 20, '蓝色的小圆凳。'),
  D('dc_gamechair', 'dc_gamechair', '电竞椅', '桌椅', 'floor', 1, 1, 150, '黑红配色的电竞椅，靠背高高的。'),
  D('dc_beanbag', 'dc_beanbag', '懒人沙发', '桌椅', 'floor', 1, 1, 90, '软塌塌的橙色懒人沙发，一坐就不想起来。'),
  D('dc_sofa', 'sofa', '双人沙发', '桌椅', 'floor', 2, 1, 220, '酒红色的双人沙发。'),
  // ---- 柜架
  D('dc_shelf2', 'shelf2', '书架（2格）', '柜架', 'floor', 2, 1, 120, '塞满书的两格书架。'),
  D('dc_shelf3', 'shelf3', '书架（3格）', '柜架', 'floor', 3, 1, 170, '三格宽的大书架。'),
  D('dc_cab2', 'cab2', '双门柜', '柜架', 'floor', 2, 1, 150, '灰色的双门储物柜。'),
  D('dc_shoebox', 'dc_shoebox', '鞋柜', '柜架', 'floor', 2, 1, 110, '门口放鞋的鞋柜，上面还摆着一盆小草。'),
  D('dc_coatrack', 'dc_coatrack', '衣帽架', '柜架', 'floor', 1, 1, 70, '挂着外套和帽子的衣帽架。'),
  // ---- 电器
  D('dc_fridge', 'fridge', '冰箱', '电器', 'floor', 1, 1, 260, '嗡嗡响的小冰箱。', { say: '冰箱里只有半瓶没喝完的汽水，和一盒写着名字的酸奶。' }),
  D('dc_tv', 'dc_tv', '电视柜', '电器', 'floor', 2, 1, 380, '电视机配电视柜。', { say: '电视里正在放校园新闻：「新校区的银杏又黄了。」' }),
  D('dc_tank', 'dc_tank', '观赏鱼缸', '电器', 'floor', 2, 1, 420, '带灯的观赏鱼缸，几条小鱼游来游去。', { say: '几条小鱼在缸里游来游去，你一靠近，它们都围了过来。' }),
  D('dc_lamp', 'dc_lamp', '落地灯', '电器', 'floor', 1, 1, 120, '暖黄色的落地灯。'),
  // ---- 软装
  D('dc_bear', 'dc_bear', '大熊玩偶', '软装', 'floor', 1, 1, 160, '一只软软的棕色大熊。', { say: '软乎乎的大熊，抱一下，心情好多了。' }),
  D('dc_guitar', 'dc_guitar', '吉他', '软装', 'floor', 1, 1, 240, '靠在墙边的木吉他。', { say: '琴弦有点松，你拨了一下，居然还挺好听。' }),
  D('dc_plant', 'plant', '绿植', '软装', 'floor', 1, 1, 40, '一盆精神的绿植。'),
  D('dc_bin', 'bin', '垃圾桶', '软装', 'floor', 1, 1, 15, '灰色的小垃圾桶。'),
  // ---- 地毯（铺在地上，不挡路）
  D('dc_rug_red', 'dc_rug_red', '红格地毯', '地毯', 'rug', 3, 2, 80, '红色格纹的长方形地毯。', { turn: true }),
  D('dc_rug_blue', 'dc_rug_blue', '蓝条地毯', '地毯', 'rug', 4, 2, 120, '蓝白条纹的大地毯。', { turn: true }),
  D('dc_rug_round', 'dc_rug_round', '圆形地毯', '地毯', 'rug', 3, 3, 140, '米色带花边的圆形地毯。'),
  D('dc_rug_paw', 'dc_rug_paw', '爪印地毯', '地毯', 'rug', 2, 2, 100, '粉色底的小猫爪印地毯。'),
  // ---- 墙饰（挂在北墙上）
  D('dc_clock', 'dc_clock', '挂钟', '墙饰', 'wall', 1, 0, 60, '圆圆的挂钟，指针不会动。', { wh: 1 }),
  D('dc_paint1', 'dc_paint1', '风景画', '墙饰', 'wall', 2, 0, 120, '一幅湖光山色的风景画。', { wh: 2 }),
  D('dc_paint2', 'dc_paint2', '竖幅画', '墙饰', 'wall', 1, 0, 100, '一幅竖着的小画，画着一株银杏。', { wh: 2 }),
  D('dc_pennant', 'dc_pennant', '校旗', '墙饰', 'wall', 1, 0, 90, '红底的三角校旗。', { wh: 2 }),
  D('dc_poster', 'dc_poster', '海报', '墙饰', 'wall', 1, 0, 40, '一张贴着胶带的海报。', { wh: 2 }),
  D('dc_whiteboard', 'whiteboard', '白板', '墙饰', 'wall', 3, 0, 150, '三格宽的白板，空空的。', { wh: 2 }),
  // ---- 小件（摆在桌面上）
  D('dc_books', 'books', '书堆', '小件', 'top', 1, 1, 20, '一摞书。'),
  D('dc_laptop', 'laptop', '笔记本电脑', '小件', 'top', 1, 1, 200, '合着盖的笔记本电脑。'),
  D('dc_thermos', 'thermos', '保温壶', '小件', 'top', 1, 1, 30, '红色的保温壶。'),
  D('dc_lamp_desk', 'dc_lamp_desk', '台灯', '小件', 'top', 1, 1, 70, '亮着暖光的小台灯。'),
  D('dc_cactus', 'dc_cactus', '仙人掌', '小件', 'top', 1, 1, 25, '一盆圆滚滚的小仙人掌。'),
];
const BY_ID = new Map(DECOR.map((d) => [d.id, d]));
export const decorDef = (id: unknown): DecorDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
export const isDecorId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);
export const DECOR_CATS: readonly DecorCat[] = ['桌椅', '柜架', '电器', '软装', '地毯', '墙饰', '小件'];
/** 退货：商店按原价的一半收回 */
export const DECOR_REFUND = 0.5;
export const decorRefund = (id: string): number => { const d = BY_ID.get(id); return d ? Math.max(1, Math.floor(d.price * DECOR_REFUND)) : 0; };

// ------------------------------------------------------------------ 房间与固定家具（和 data/interiors/dorm*.json 一致）
/** 房间的三个级别（扩建：1500 / 4000 校园币，见 dorm.ts 的 ROOM_PRICES）：小屋 16×11、中屋 20×13、大屋 24×15。
 *  向右、向下扩：北墙一行、床/衣柜/宝箱/浴缸/空调/门牌的位置都不变，门洞仍在 x 7..8，只是随房间变深而下移——所以升级后原来的摆放仍然合法 */
export const ROOM_SIZES = [{ w: 16, h: 11 }, { w: 20, h: 13 }, { w: 24, h: 15 }] as const;
export type RoomLevel = 0 | 1 | 2;
export const isRoomLevel = (v: unknown): v is RoomLevel => v === 0 || v === 1 || v === 2;
/** 房间尺寸与地面范围：北墙占上面 3 行；地面是 x 1..w-2、y 3..h-2；南墙（第 h-1 行）中间 2 格是门洞 */
export const roomDims = (level: number = 0) => { const r = ROOM_SIZES[isRoomLevel(level) ? level : 0]; return { w: r.w, h: r.h, x0: 1, x1: r.w - 2, y0: 3, y1: r.h - 2 }; };
export const DECOR_ROOM = roomDims(0);
export interface Rect { x: number; y: number; w: number; h: number }
/** 房里原有的、不能动的地面家具：床、衣柜、宝箱、浴缸（各级房间位置相同） */
export const FIXED_FLOOR: readonly Rect[] = [{ x: 1, y: 3, w: 2, h: 3 }, { x: 12, y: 3, w: 2, h: 1 }, { x: 14, y: 3, w: 1, h: 1 }, { x: 11, y: 6, w: 3, h: 2 }];
/** 门口要留空（进屋的出生点在这里），随房间变深下移 */
export const doorKeep = (level: number = 0): Rect => ({ x: 7, y: roomDims(level).h - 3, w: 2, h: 2 });
export const DOOR_KEEP: Rect = doorKeep(0);
/** 北墙上不能再挂东西的地方：门牌、窗户、空调，以及衣柜、宝箱（它们的精灵向上挡住了墙面） */
export const FIXED_WALL: readonly Rect[] = [{ x: 1, y: 0, w: 5, h: 2 }, { x: 6, y: 0, w: 3, h: 3 }, { x: 9, y: 0, w: 3, h: 1 }, { x: 12, y: 0, w: 2, h: 3 }, { x: 14, y: 2, w: 1, h: 1 }];
/** 摆完之后必须还走得到的地方：床、衣柜、宝箱、浴缸的四周（八个方向都算），门牌和空调下面的地面 */
const REACH_RECTS: readonly Rect[] = FIXED_FLOOR;
const REACH_WALL: readonly Rect[] = [{ x: 1, y: 3, w: 5, h: 2 }, { x: 8, y: 3, w: 4, h: 2 }];

export const DECOR_MAX = 60;

export type Rot = 0 | 90 | 180 | 270;
export interface Placed { d: string; x: number; y: number; r?: Rot }
export const isRot = (r: unknown): r is Rot => r === 0 || r === 90 || r === 180 || r === 270;
/** 摆完之后占地的宽高（地毯转 90/270 度时宽高互换） */
export const footOf = (def: DecorDef, r: number | undefined): { fw: number; fh: number } => (r === 90 || r === 270 ? { fw: def.fh, fh: def.fw } : { fw: def.fw, fh: def.fh });
/** 墙饰占的格子：列 x..x+fw-1，行 y-wh .. y-1（y 是挂件底边所在的行线） */
export const wallRect = (def: DecorDef, p: Placed): Rect => ({ x: p.x, y: p.y - (def.wh ?? 1), w: def.fw, h: def.wh ?? 1 });

/** 没装修过的宿舍：原来房里的木桌+电脑、椅子、绿植、垃圾桶 */
export const defaultLay = (): Placed[] => [{ d: 'dc_deskpc', x: 6, y: 3 }, { d: 'dc_chairup', x: 6, y: 4 }, { d: 'dc_plant', x: 14, y: 8 }, { d: 'dc_bin', x: 1, y: 8 }];

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (x: number, y: number, r: Rect) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const KW = 32; // 格子编号的行宽（比任何级别的房间都宽）
const key = (x: number, y: number) => y * KW + x;

/** 摆放是否合法：返回第一个问题（给玩家看的话），没问题返回 null。服务器和客户端用同一个函数 */
export function layError(lay: readonly Placed[], level: number = 0): string | null {
  if (lay.length > DECOR_MAX) return `最多摆 ${DECOR_MAX} 件`;
  const { x0, x1, y0, y1 } = roomDims(level), DOOR = doorKeep(level);
  const fixed = new Set<number>(), keep = new Set<number>(), floor = new Set<number>(), rug = new Set<number>(), surf = new Set<number>(), top = new Set<number>();
  for (const r of FIXED_FLOOR) for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) fixed.add(key(r.x + i, r.y + j));
  for (let j = 0; j < DOOR.h; j++) for (let i = 0; i < DOOR.w; i++) keep.add(key(DOOR.x + i, DOOR.y + j));
  const walls: Rect[] = [...FIXED_WALL], tops: { def: DecorDef; p: Placed }[] = [];
  for (const p of lay) {
    const def = decorDef(p?.d);
    if (!def) return '没有这件家具';
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return '位置不对';
    if (p.r !== undefined && !isRot(p.r)) return '方向不对';
    if (p.r && !def.turn) return `${def.name}不能转方向`;
    const { fw, fh } = footOf(def, p.r);
    if (def.kind === 'wall') {
      const wh = def.wh ?? 1;
      if (p.x < x0 || p.x + fw > x1 + 1 || p.y < wh || p.y > 3) return `${def.name}要挂在北墙上`;
      const rc = wallRect(def, p);
      for (const w of walls) if (hit(rc, w)) return `${def.name}挂在这里会挡住窗户、空调、门牌或别的挂件`;
      walls.push(rc);
    } else if (def.kind === 'top') {
      tops.push({ def, p });
    } else {
      if (p.x < x0 || p.y < y0 || p.x + fw > x1 + 1 || p.y + fh > y1 + 1) return `${def.name}要放在房间的地面上`;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const c = key(p.x + i, p.y + j);
        if (def.kind === 'rug') { if (rug.has(c)) return '地毯不能叠在另一块地毯上'; rug.add(c); continue; }
        if (fixed.has(c)) return `${def.name}压在床、衣柜、宝箱或浴缸上了`;
        if (keep.has(c)) return '门口要留出路来';
        if (floor.has(c)) return '这里已经有家具了';
        floor.add(c); if (def.surface) surf.add(c);
      }
    }
  }
  for (const { def, p } of tops) {
    if (p.x < x0 || p.y < y0 || p.x > x1 || p.y > y1) return `${def.name}要放在桌子上`;
    const c = key(p.x, p.y);
    if (!surf.has(c)) return `${def.name}要放在桌子上`;
    if (top.has(c)) return '这一格桌面上已经有东西了';
    top.add(c);
  }
  // 摆完之后：从门口出发，必须还能走到床、衣柜、宝箱、浴缸的旁边和门牌/空调下面
  const seen = new Set<number>(), q: number[] = [];
  for (const [x, y] of [[DOOR.x, y1], [DOOR.x + 1, y1]]) { seen.add(key(x, y)); q.push(key(x, y)); }
  const free = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !fixed.has(key(x, y)) && !floor.has(key(x, y));
  while (q.length) {
    const c = q.pop()!, x = c % KW, y = Math.floor(c / KW);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && free(nx, ny)) { seen.add(k); q.push(k); } }
  }
  for (const r of REACH_RECTS) {
    let ok = false;
    for (let j = r.y - 1; j <= r.y + r.h && !ok; j++) for (let i = r.x - 1; i <= r.x + r.w && !ok; i++) if (seen.has(key(i, j)) && !within(i, j, r)) ok = true;
    if (!ok) return '这样摆会把床、衣柜、宝箱或浴缸堵住，人走不过去';
  }
  for (const r of REACH_WALL) {
    let ok = false;
    for (let j = r.y; j < r.y + r.h && !ok; j++) for (let i = r.x; i < r.x + r.w && !ok; i++) if (seen.has(key(i, j))) ok = true;
    if (!ok) return '这样摆会把空调和门牌前面的路堵住';
  }
  return null;
}

/** 从磁盘/网络来的摆放：逐件校验，不合法的丢掉；地面家具排在小件前面（小件要放在桌子上，桌子得先有） */
export function cleanLay(raw: unknown, level: number = 0): Placed[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cand: Placed[] = [];
  for (const e of raw.slice(0, DECOR_MAX * 2)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (!isDecorId(r.d) || !Number.isInteger(r.x) || !Number.isInteger(r.y)) continue;
    const p: Placed = { d: r.d as string, x: r.x as number, y: r.y as number };
    if (isRot(r.r) && r.r) p.r = r.r;
    cand.push(p);
  }
  cand.sort((a, b) => Number(decorDef(a.d)!.kind === 'top') - Number(decorDef(b.d)!.kind === 'top'));
  const out: Placed[] = [];
  for (const p of cand) { if (out.length >= DECOR_MAX) break; const next = [...out, p]; if (!layError(next, level)) out.push(p); }
  return out;
}

/** 摆放里每件家具的物品数量（收回时检查背包放得下、统计用） */
export const layCounts = (lay: readonly Placed[]): Record<string, number> => { const c: Record<string, number> = {}; for (const p of lay) c[p.d] = (c[p.d] ?? 0) + 1; return c; };

/** 小件摆在桌子的第几行上（从桌子最上面一行起数）：下面的行画得往上抬一点，看起来还在桌面上（每行抬 8 像素） */
export function topRaise(lay: readonly Placed[], p: Placed): number {
  for (const q of lay) { const d = decorDef(q.d); if (d?.surface && p.x >= q.x && p.x < q.x + d.fw && p.y >= q.y && p.y < q.y + d.fh) return (p.y - q.y) * 8; }
  return 0;
}
