/**
 * 宿舍家具与摆放（客户端与服务器共用）。
 * - 目录 DECOR：商店里卖的家具。每件家具就是一种背包物品（id 形如 dc_sofa），摆上去从背包扣一个、收回来还一个，
 *   所以不会复制，也能面对面交易。精灵图在家具图集里（k 是图集里的名字，tools/art/furniture-decor.ts 和 furniture*.ts 画的）。
 * - 摆放 Placed：{ d: 物品 id, x, y, r? }，存在 DormSave.lay；没装修过的玩家用 defaultLay()（原来房里的桌椅、盆栽、垃圾桶）。
 * - 校验 layError：服务器不信任客户端，客户端也用它判断"这里能不能放"（绿/红）。规则：
 *   地面家具不出界、不重叠、不挡门口；摆完之后门口到每件功能家具（床、衣柜、宝箱、鱼缸、空调、门牌）必须还走得通；
 *   小件（书、台灯、电脑…）只能放在桌子上；墙饰（窗、画、空调、门牌…）只能挂北墙、互相不重叠；
 *   地毯铺在地上、可以被家具压着；门垫是小地毯；地毯和门垫都能叠（同一处最多 RUG_LAYERS 层，摆得晚的在上面，门垫总在地毯上面）。
 * 家具能转向：有设计好四个朝向的（FACE）和地毯门垫（TURN_FLAT），见下面的说明。
 * 2026-11-07 起房间里**没有固定家具了**：床、衣柜、宝箱、鱼缸、空调、门牌、窗、大地毯、门垫都是「固有家具」（starter：不卖、不能交易、不能退货，
 * 每人一份），和别的家具一样可以收回、挪动。它们的功能（睡觉、换装、仓库、养鱼、空调、改门牌）跟着家具走：摆在哪儿就在哪儿用。
 * 房间尺寸要和 data/interiors/dorm*.json 一致（tests 核对）。
 */

import { isDyeIdx } from './dye';

export type Rot = 0 | 90 | 180 | 270;
export type DecorCat = '桌椅' | '柜架' | '电器' | '软装' | '地毯' | '墙饰' | '小件' | '固有';
/** floor = 占地的地面家具；rug = 地毯（铺在地上、不挡路）；mat = 门垫（小地毯，叠在地毯上面）；wall = 北墙上的挂件（窗、画、空调…）；top = 摆在桌面上的小件（1×1） */
export type DecorKind = 'floor' | 'rug' | 'mat' | 'wall' | 'top';
/** 家具的功能：走近按 E 触发，由宿舍场景处理 */
export type DecorAct = 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath';
export interface DecorDef {
  /** 背包物品 id */ id: string;
  /** 家具图集里的精灵名 */ k: string;
  name: string; cat: DecorCat; kind: DecorKind;
  /** 占地（格）；墙饰 fh = 0 */ fw: number; fh: number;
  /** 墙饰：精灵有几格高（挂在墙上占几行） */ wh?: number;
  /** 商店价（校园币）；0 = 不卖（固有家具） */ price: number;
  /** 桌子：小件可以放在它上面 */ surface?: boolean;
  /** 地毯 / 门垫：从正上方看，转 90 度就是把图案整个转过来（贴图直接旋转） */ turn?: boolean;
  /** 有专门画好的四个朝向（r：0 朝南 / 90 朝西 / 180 朝北 / 270 朝东，顺时针转）：每个朝向都是单独设计的贴图（看到的是正面、侧面或背面），不是把图转一下。tools/art/turn-*.ts */ face?: boolean;
  /** 朝向的起点：这件家具的原图朝哪边（默认朝南 0；「木椅（朝北）」的原图朝北 = 180）。转向时从它出发，四个朝向的贴图共用同一套 */ base?: Rot;
  /** 走近按 E 看到的一句话（可选） */ say?: string;
  /** 功能（床睡觉、衣柜换装、宝箱仓库、鱼缸养鱼、空调、门牌改名）：摆在哪儿就在哪儿用 */ act?: DecorAct;
  /** 固有家具：每人一份、不卖、不能交易、不能退货（可以收回背包再摆） */ starter?: boolean;
  /** 能坐的椅子 / 凳子 / 沙发 */ seat?: boolean;
  /** 能染色（见 dye.ts；DYE 集合里的家具） */ dye?: boolean;
  /** 小件摆在这张桌子上时再抬高多少像素（一行深的桌子，桌面比脚印高） */ lift?: number;
  /** 画的时候向左偏移多少像素（窗帘比窗框宽，向两边伸出去） */ ox?: number;
  note: string;
}

const D = (id: string, k: string, name: string, cat: DecorCat, kind: DecorKind, fw: number, fh: number, price: number, note: string, extra: Partial<DecorDef> = {}): DecorDef =>
  ({ id, k, name, cat, kind, fw, fh, price, note, ...extra });

const RAW: readonly DecorDef[] = [
  // ---- 桌椅
  D('dc_desk', 'desk', '木书桌', '桌椅', 'floor', 2, 1, 60, '朴素的木书桌，带一个抽屉；桌面上能摆小件。', { surface: true, lift: 12 }),
  D('dc_deskpc', 'deskpc', '木桌+电脑', '桌椅', 'floor', 2, 1, 120, '带一台电脑的木书桌，宿舍原来就有的那张。', { say: '屏幕亮着：教务系统的课表上写着「今天没课」。右下角弹出一条消息——「河北工程大学新校区欢迎你」。' }),
  D('dc_table2', 'table2', '小木桌', '桌椅', 'floor', 2, 1, 50, '放点小东西的小木桌；桌面上能摆小件。', { surface: true, lift: 12 }),
  D('dc_dtable', 'dc_dtable', '书桌', '桌椅', 'floor', 2, 2, 90, '干净的浅色木书桌，桌面上可以摆书、台灯和小盆栽。', { surface: true }),
  D('dc_dtable3', 'dc_dtable3', '长桌', '桌椅', 'floor', 3, 2, 130, '三格宽的长桌，桌面上能摆好多小东西。', { surface: true }),
  D('dc_chair', 'chair', '木椅（朝南）', '桌椅', 'floor', 1, 1, 30, '朝南的木椅，可以坐。', { seat: true }),
  D('dc_chairup', 'chairup', '木椅（朝北）', '桌椅', 'floor', 1, 1, 30, '朝北的木椅，配书桌用，可以坐。', { seat: true }),
  D('dc_stool', 'stool', '蓝凳子', '桌椅', 'floor', 1, 1, 20, '蓝色的小圆凳，可以坐。', { seat: true }),
  D('dc_gamechair', 'dc_gamechair', '电竞椅', '桌椅', 'floor', 1, 1, 150, '黑红配色的电竞椅，靠背高高的，可以坐。', { seat: true }),
  D('dc_beanbag', 'dc_beanbag', '懒人沙发', '桌椅', 'floor', 1, 1, 90, '软塌塌的橙色懒人沙发，一坐就不想起来。', { seat: true }),
  D('dc_sofa', 'sofa', '双人沙发', '桌椅', 'floor', 2, 1, 220, '酒红色的双人沙发，两个人都能坐。', { seat: true }),
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
  D('dc_rug_red', 'dc_rug_red', '红格地毯', '地毯', 'rug', 3, 2, 80, '红色格纹的长方形地毯。'),
  D('dc_rug_blue', 'dc_rug_blue', '蓝条地毯', '地毯', 'rug', 4, 2, 120, '蓝白条纹的大地毯。'),
  D('dc_rug_round', 'dc_rug_round', '圆形地毯', '地毯', 'rug', 3, 3, 140, '米色带花边的圆形地毯。'),
  D('dc_rug_paw', 'dc_rug_paw', '爪印地毯', '地毯', 'rug', 2, 2, 100, '粉色底的小猫爪印地毯。'),
  // ---- 门垫（小地毯，叠在地毯上面；门口也能放）
  D('dc_mat_welcome', 'dc_mat_welcome', '欢迎门垫', '地毯', 'mat', 2, 1, 40, '写着 WELCOME 的棕色门垫。'),
  D('dc_mat_paw', 'dc_mat_paw', '猫爪门垫', '地毯', 'mat', 2, 1, 50, '粉色的猫爪印门垫。'),
  D('dc_mat_straw', 'dc_mat_straw', '草编圆垫', '地毯', 'mat', 2, 2, 70, '草编的圆形垫子，放在地毯上也好看。'),
  D('dc_mat_towel', 'dc_mat_towel', '蓝条毛巾垫', '地毯', 'mat', 2, 1, 45, '蓝白条纹的软毛巾垫。'),
  // ---- 墙饰（挂在北墙上）
  D('dc_clock', 'dc_clock', '挂钟', '墙饰', 'wall', 1, 0, 60, '圆圆的挂钟，指针不会动。', { wh: 1 }),
  D('dc_paint1', 'dc_paint1', '风景画', '墙饰', 'wall', 2, 0, 120, '一幅湖光山色的风景画。', { wh: 2 }),
  D('dc_paint2', 'dc_paint2', '竖幅画', '墙饰', 'wall', 1, 0, 100, '一幅竖着的小画，画着一株银杏。', { wh: 2 }),
  D('dc_pennant', 'dc_pennant', '校旗', '墙饰', 'wall', 1, 0, 90, '红底的三角校旗。', { wh: 2 }),
  D('dc_poster', 'dc_poster', '海报', '墙饰', 'wall', 1, 0, 40, '一张贴着胶带的海报。', { wh: 2 }),
  D('dc_whiteboard', 'whiteboard', '白板', '墙饰', 'wall', 3, 0, 150, '三格宽的白板，空空的。', { wh: 2 }),
  // 窗：三格宽，窗帘向两边伸出去一点；大屋可以多开几扇
  D('dc_win_plain', 'dc_win_plain', '窗（无窗帘）', '墙饰', 'wall', 3, 0, 60, '白框窗，外面是校园的天空。', { wh: 3 }),
  D('dc_win_blue', 'dc_win_blue', '窗（蓝窗帘）', '墙饰', 'wall', 3, 0, 90, '挂着蓝色窗帘的窗。', { wh: 3, ox: 9 }),
  D('dc_win_pink', 'dc_win_pink', '窗（粉窗帘）', '墙饰', 'wall', 3, 0, 90, '挂着粉色窗帘的窗。', { wh: 3, ox: 9 }),
  D('dc_win_green', 'dc_win_green', '窗（绿窗帘）', '墙饰', 'wall', 3, 0, 90, '挂着绿色窗帘的窗。', { wh: 3, ox: 9 }),
  D('dc_win_lace', 'dc_win_lace', '窗（白纱帘）', '墙饰', 'wall', 3, 0, 100, '挂着白色蕾丝纱帘的窗。', { wh: 3, ox: 9 }),
  // ---- 小件（摆在桌面上）
  D('dc_books', 'books', '书堆', '小件', 'top', 1, 1, 20, '一摞书。'),
  D('dc_laptop', 'laptop', '笔记本电脑', '小件', 'top', 1, 1, 200, '合着盖的笔记本电脑。'),
  D('dc_thermos', 'thermos', '保温壶', '小件', 'top', 1, 1, 30, '红色的保温壶。'),
  D('dc_lamp_desk', 'dc_lamp_desk', '台灯', '小件', 'top', 1, 1, 70, '亮着暖光的小台灯。'),
  D('dc_cactus', 'dc_cactus', '仙人掌', '小件', 'top', 1, 1, 25, '一盆圆滚滚的小仙人掌。'),
  D('dc_pc', 'dc_pc', '台式电脑', '小件', 'top', 1, 1, 220, '显示器、键盘和小主机，放在桌子上就能用。', { say: '屏幕亮着：教务系统的课表上写着「今天没课」。' }),
  // ---- 固有家具（房间里原来就有的，每人一份：不卖、不能交易、不能退货；可以收回、挪动）
  D('dc_bed', 'dbed', '单人床', '固有', 'floor', 2, 3, 0, '你的床：靠近按 E 上床睡觉，精灵会慢慢恢复。', { starter: true, act: 'bed' }),
  D('dc_wardrobe', 'dwardrobe', '衣柜', '固有', 'floor', 2, 1, 0, '你的衣柜：靠近按 E 换装。', { starter: true, act: 'wardrobe' }),
  D('dc_chest', 'dchest', '宝箱', '固有', 'floor', 1, 1, 0, '你的宝箱（仓库）：只有你能打开。', { starter: true, act: 'chest' }),
  D('dc_bath', 'dbath', '鱼缸（养鱼）', '固有', 'floor', 3, 2, 0, '你的鱼缸：把钓上来的鱼放进去养着，稀有的会发光。', { starter: true, act: 'bath' }),
  D('dc_ac', 'ac', '空调', '固有', 'wall', 2, 0, 0, '挂在墙上的空调：靠近按 E 切换 关 / 制冷 / 制热。', { starter: true, act: 'ac', wh: 1 }),
  D('dc_sign', 'dsign', '门牌', '固有', 'wall', 5, 0, 0, '宿舍的门牌：房主可以改名字。', { starter: true, act: 'sign', wh: 2 }),
  D('dc_window', 'dc_win_purple', '窗（紫窗帘）', '固有', 'wall', 3, 0, 0, '宿舍原来的窗，挂着紫色窗帘。', { starter: true, wh: 3, ox: 9 }),
  D('dc_rug_home', 'dc_rug_home', '暖橙大地毯', '固有', 'rug', 6, 3, 0, '宿舍原来铺着的大地毯。', { starter: true }),
  D('dc_mat_door', 'dc_mat_door', '棕色门垫', '固有', 'mat', 2, 1, 0, '门口原来的门垫。', { starter: true }),
];
/**
 * 能转向的家具（贴图见 tools/art/turn-*.ts）：
 *  - FACE：有四个专门设计的朝向（正面 / 侧面 / 背面），转一下看到的是另一面，不是把图转一下；
 *  - TURN_FLAT：地毯、门垫，从正上方看，转 90 度就是把图案整个转过来；
 *  - 其余的（凳子、懒人沙发、落地灯、绿植、垃圾桶、书堆、保温壶、台灯、仙人掌、圆形地毯和草编圆垫）四面一模一样，转了也看不出区别，所以不设转向；
 *    床和鱼缸的睡觉姿势 / 缸里的鱼是照着现在的朝向做的，这一版先不转；挂在北墙上的东西（窗、画、空调、门牌）只能朝南挂。
 * 原图朝北的「木椅（朝北）」用 base 记下起点，和「木椅」共用一套四个朝向。
 */
const FACE = new Set(['dc_desk', 'dc_deskpc', 'dc_table2', 'dc_dtable', 'dc_dtable3', 'dc_chair', 'dc_chairup', 'dc_gamechair', 'dc_sofa', 'dc_shelf2', 'dc_shelf3', 'dc_cab2', 'dc_shoebox', 'dc_coatrack',
  'dc_fridge', 'dc_tv', 'dc_tank', 'dc_wardrobe', 'dc_chest', 'dc_bear', 'dc_guitar', 'dc_laptop', 'dc_pc']);
const TURN_FLAT = new Set(['dc_rug_red', 'dc_rug_blue', 'dc_rug_paw', 'dc_mat_welcome', 'dc_mat_paw', 'dc_mat_towel', 'dc_mat_door', 'dc_rug_home']); // 圆形的（圆形地毯、草编圆垫）转了一样，不设
const BASE: Record<string, Rot> = { dc_chairup: 180 };
/**
 * 能染色的家具（见 dye.ts）：有"主体色"的桌椅、柜架、沙发、玩偶、地毯门垫、衣柜宝箱。
 * 不能染的：带屏幕 / 会发光的（电脑桌、电视、台灯、落地灯）、画和挂钟和白板和校旗（画面本身就是内容）、窗（窗帘颜色有单独的款式卖）、
 * 鱼缸（缸里的鱼和水）、床（睡觉时盖在上面的被子是另一张图，染了会对不上）、空调和门牌（功能件）、绿植和仙人掌（本来就是植物的颜色）、桌上的小件、吉他。
 */
const DYE = new Set(['dc_desk', 'dc_table2', 'dc_dtable', 'dc_dtable3', 'dc_chair', 'dc_chairup', 'dc_stool', 'dc_gamechair', 'dc_beanbag', 'dc_sofa', 'dc_shelf2', 'dc_shelf3', 'dc_cab2', 'dc_shoebox', 'dc_coatrack',
  'dc_fridge', 'dc_bear', 'dc_bin', 'dc_rug_red', 'dc_rug_blue', 'dc_rug_round', 'dc_rug_paw', 'dc_mat_welcome', 'dc_mat_paw', 'dc_mat_straw', 'dc_mat_towel', 'dc_wardrobe', 'dc_chest', 'dc_rug_home', 'dc_mat_door']);
export const DECOR: readonly DecorDef[] = RAW.map((d) => {
  const x: DecorDef = FACE.has(d.id) ? { ...d, face: true, ...(BASE[d.id] ? { base: BASE[d.id] } : {}) } : TURN_FLAT.has(d.id) ? { ...d, turn: true } : d;
  return DYE.has(d.id) ? { ...x, dye: true } : x;
});
const BY_ID = new Map(DECOR.map((d) => [d.id, d]));
export const decorDef = (id: unknown): DecorDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
export const isDecorId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);
export const DECOR_CATS: readonly DecorCat[] = ['桌椅', '柜架', '电器', '软装', '地毯', '墙饰', '小件', '固有'];
/** 退货：商店按原价的一半收回（固有家具不卖也不收） */
export const DECOR_REFUND = 0.5;
export const decorRefund = (id: string): number => { const d = BY_ID.get(id); return d && d.price > 0 ? Math.max(1, Math.floor(d.price * DECOR_REFUND)) : 0; };
/** 固有家具：每人一份，不卖、不能交易、不能退货 */
export const isStarter = (id: unknown): boolean => !!decorDef(id)?.starter;

// ------------------------------------------------------------------ 房间（和 data/interiors/dorm*.json 一致）
/** 房间的三个级别（扩建：1500 / 4000 校园币，见 dormskin.ts 的 ROOM_PRICES）：小屋 16×11、中屋 20×13、大屋 24×15。
 *  向右、向下扩：北墙一行、默认家具的位置都不变，门洞仍在 x 7..8，只是随房间变深而下移——所以升级后原来的摆放仍然合法 */
export const ROOM_SIZES = [{ w: 16, h: 11 }, { w: 20, h: 13 }, { w: 24, h: 15 }] as const;
export type RoomLevel = 0 | 1 | 2;
export const isRoomLevel = (v: unknown): v is RoomLevel => v === 0 || v === 1 || v === 2;
/** 房间尺寸与地面范围：北墙占上面 3 行；地面是 x 1..w-2、y 3..h-2；南墙（第 h-1 行）中间 2 格是门洞 */
export const roomDims = (level: number = 0) => { const r = ROOM_SIZES[isRoomLevel(level) ? level : 0]; return { w: r.w, h: r.h, x0: 1, x1: r.w - 2, y0: 3, y1: r.h - 2 }; };
export const DECOR_ROOM = roomDims(0);
export interface Rect { x: number; y: number; w: number; h: number }
/** 门口要留空（进屋的出生点在这里），随房间变深下移。只有地面家具不能放在这里；地毯、门垫可以 */
export const doorKeep = (level: number = 0): Rect => ({ x: 7, y: roomDims(level).h - 3, w: 2, h: 2 });
export const DOOR_KEEP: Rect = doorKeep(0);

/**
 * 一间宿舍最多摆几件（2026-11-08 起按房间大小：小屋 160 / 中屋 200 / 大屋 240；以前不分大小都是 72）。
 * 一件约 30 字节，满了也就 7KB，存档和访客收到的消息都不大；客户端每件一张贴图，几百件没问题。
 * 数量只是兜底，真正限制的是地面格子、桌面格子和北墙。
 */
export const DECOR_MAX_BY_LEVEL = [160, 200, 240] as const;
export const decorMax = (level: number = 0): number => DECOR_MAX_BY_LEVEL[isRoomLevel(level) ? level : 0];
/** 所有房间里最大的上限（清洗存档时先按它截一刀） */
export const DECOR_MAX = DECOR_MAX_BY_LEVEL[2];

export interface Placed { d: string; x: number; y: number; r?: Rot; /** 染色色号（1..12；缺省 = 原色，见 dye.ts） */ c?: number }
export const isRot = (r: unknown): r is Rot => r === 0 || r === 90 || r === 180 || r === 270;
/** 这件家具能不能转向 */
export const canTurn = (def: DecorDef): boolean => !!(def.turn || def.face);
/** 转向时依次经过的朝向：有设计好的朝向的家具一圈四个（顺时针），地毯 / 门垫只在 0 和 90 之间切换（转 180 度图案一样） */
export const nextRot = (def: DecorDef, r: number | undefined): Rot => (def.face ? ((((r ?? 0) + 90) % 360) as Rot) : r === 90 ? 0 : 90);
/** 地毯、门垫最多叠几层（同一格上地毯 + 门垫一共几件）：想铺得花哨可以层层叠，但不能无限叠 */
export const RUG_LAYERS = 3;
/** 摆完之后占地的宽高（地毯转 90/270 度时宽高互换） */
export const footOf = (def: DecorDef, r: number | undefined): { fw: number; fh: number } => (r === 90 || r === 270 ? { fw: def.fh, fh: def.fw } : { fw: def.fw, fh: def.fh });
/** 墙饰占的格子：列 x..x+fw-1，行 y-wh .. y-1（y 是挂件底边所在的行线） */
export const wallRect = (def: DecorDef, p: Placed): Rect => ({ x: p.x, y: p.y - (def.wh ?? 1), w: def.fw, h: def.wh ?? 1 });

/** 原来「固定」的七件，在原来的位置上（老存档升级时补进摆放里；位置和旧规则一致，所以不会和玩家原有的摆放冲突） */
export const LEGACY_STARTERS: readonly Placed[] = [
  { d: 'dc_bed', x: 1, y: 3 }, { d: 'dc_wardrobe', x: 12, y: 3 }, { d: 'dc_chest', x: 14, y: 3 }, { d: 'dc_bath', x: 11, y: 6 },
  { d: 'dc_ac', x: 9, y: 1 }, { d: 'dc_sign', x: 1, y: 2 }, { d: 'dc_window', x: 6, y: 3 },
];
/** 没装修过的宿舍：固有家具 + 暖橙大地毯 + 门垫 + 原来的木桌电脑、椅子、绿植、垃圾桶（和以前的房间一模一样） */
export const defaultLay = (level: number = 0): Placed[] => [
  ...LEGACY_STARTERS.map((p) => ({ ...p })), { d: 'dc_rug_home', x: 5, y: 6 }, { d: 'dc_mat_door', x: 7, y: roomDims(level).h - 2 },
  { d: 'dc_deskpc', x: 6, y: 3 }, { d: 'dc_chairup', x: 6, y: 4 }, { d: 'dc_plant', x: 14, y: 8 }, { d: 'dc_bin', x: 1, y: 8 },
];

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (x: number, y: number, r: Rect) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const KW = 32; // 格子编号的行宽（比任何级别的房间都宽）
const key = (x: number, y: number) => y * KW + x;

/** 摆放是否合法：返回第一个问题（给玩家看的话），没问题返回 null。服务器和客户端用同一个函数 */
export function layError(lay: readonly Placed[], level: number = 0): string | null {
  if (lay.length > decorMax(level)) return `这间屋最多摆 ${decorMax(level)} 件`;
  const { x0, x1, y0, y1 } = roomDims(level), DOOR = doorKeep(level);
  const keep = new Set<number>(), floor = new Set<number>(), layers = new Map<number, number>(), surf = new Set<number>(), top = new Set<number>();
  for (let j = 0; j < DOOR.h; j++) for (let i = 0; i < DOOR.w; i++) keep.add(key(DOOR.x + i, DOOR.y + j));
  const walls: Rect[] = [], tops: { def: DecorDef; p: Placed }[] = [], acts: { def: DecorDef; p: Placed }[] = [], seenIds = new Set<string>();
  for (const p of lay) {
    const def = decorDef(p?.d);
    if (!def) return '没有这件家具';
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return '位置不对';
    if (p.r !== undefined && !isRot(p.r)) return '方向不对';
    if (p.r && !canTurn(def)) return `${def.name}不能转方向`;
    if (p.c !== undefined) { if (!isDyeIdx(p.c)) return '颜色不对'; if (!def.dye) return `${def.name}不能染色`; }
    if (def.starter) { if (seenIds.has(def.id)) return `${def.name}只有一件`; seenIds.add(def.id); } // 固有家具每人一份
    if (def.act) acts.push({ def, p });
    const { fw, fh } = footOf(def, p.r);
    if (def.kind === 'wall') {
      const wh = def.wh ?? 1;
      if (p.x < x0 || p.x + fw > x1 + 1 || p.y < wh || p.y > 3) return `${def.name}要挂在北墙上`;
      const rc = wallRect(def, p);
      for (const w of walls) if (hit(rc, w)) return `${def.name}挂在这里会挡住别的墙上的东西（窗、画、空调、门牌）`;
      walls.push(rc);
    } else if (def.kind === 'top') {
      tops.push({ def, p });
    } else {
      if (p.x < x0 || p.y < y0 || p.x + fw > x1 + 1 || p.y + fh > y1 + 1) return `${def.name}要放在房间的地面上`;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const c = key(p.x + i, p.y + j);
        if (def.kind === 'rug' || def.kind === 'mat') { const n = (layers.get(c) ?? 0) + 1; if (n > RUG_LAYERS) return `地毯、门垫一处最多叠 ${RUG_LAYERS} 层`; layers.set(c, n); continue; } // 地毯、门垫可以层层叠：摆得晚的盖在上面
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
  // 摆完之后：从门口出发，必须还能走到每件功能家具（床、衣柜、宝箱、鱼缸）的旁边，和空调、门牌下面的地面
  const seen = new Set<number>(), q: number[] = [];
  for (const [x, y] of [[DOOR.x, y1], [DOOR.x + 1, y1]]) { seen.add(key(x, y)); q.push(key(x, y)); }
  const free = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !floor.has(key(x, y));
  while (q.length) {
    const c = q.pop()!, x = c % KW, y = Math.floor(c / KW);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && free(nx, ny)) { seen.add(k); q.push(k); } }
  }
  for (const { def, p } of acts) {
    let ok = false;
    if (def.kind === 'wall') { // 墙上的空调、门牌：它下面（第 3、4 行）要有走得到的地面
      for (let j = y0; j < y0 + 2 && !ok; j++) for (let i = p.x - 1; i <= p.x + def.fw && !ok; i++) if (seen.has(key(i, j))) ok = true;
      if (!ok) return `这样摆会把${def.name}前面的路堵住`;
    } else {
      const { fw, fh } = footOf(def, p.r), r: Rect = { x: p.x, y: p.y, w: fw, h: fh };
      for (let j = r.y - 1; j <= r.y + r.h && !ok; j++) for (let i = r.x - 1; i <= r.x + r.w && !ok; i++) if (seen.has(key(i, j)) && !within(i, j, r)) ok = true;
      if (!ok) return `这样摆会把${def.name}堵住，人走不过去`;
    }
  }
  return null;
}

/** 从磁盘/网络来的摆放：逐件校验，不合法的丢掉；地面家具排在小件前面（小件要放在桌子上，桌子得先有） */
export function cleanLay(raw: unknown, level: number = 0): Placed[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cand: Placed[] = [];
  const cap = decorMax(level);
  for (const e of raw.slice(0, cap * 2)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (!isDecorId(r.d) || !Number.isInteger(r.x) || !Number.isInteger(r.y)) continue;
    const p: Placed = { d: r.d as string, x: r.x as number, y: r.y as number };
    if (isRot(r.r) && r.r) p.r = r.r;
    if (isDyeIdx(r.c) && decorDef(p.d)!.dye) p.c = r.c as number; // 不能染的家具、不合法的色号：丢掉颜色，家具照留
    cand.push(p);
  }
  cand.sort((a, b) => Number(decorDef(a.d)!.kind === 'top') - Number(decorDef(b.d)!.kind === 'top'));
  const out: Placed[] = [];
  for (const p of cand) { if (out.length >= cap) break; const next = [...out, p]; if (!layError(next, level)) out.push(p); }
  return out;
}

/** 摆放里每件家具的物品数量（收回时检查背包放得下、统计用） */
export const layCounts = (lay: readonly Placed[]): Record<string, number> => { const c: Record<string, number> = {}; for (const p of lay) c[p.d] = (c[p.d] ?? 0) + 1; return c; };

/** 小件摆在桌子的第几行上（从桌子最上面一行起数）：下面的行画得往上抬一点，看起来还在桌面上（每行抬 8 像素）；一行深的桌子再按它的 lift 抬高 */
export function topRaise(lay: readonly Placed[], p: Placed): number {
  for (const q of lay) { const d = decorDef(q.d); if (!d?.surface) continue; const { fw, fh } = footOf(d, q.r); if (p.x >= q.x && p.x < q.x + fw && p.y >= q.y && p.y < q.y + fh) return (p.y - q.y) * 8 + (d.lift ?? 0); }
  return 0;
}

/** 椅子 / 沙发上能坐的位置（格坐标 → 像素）：座位中心的 x、椅面的 y；沙发有两个座位（沿着它长的那一边排，转向后跟着变） */
export function seatsOf(p: Placed): { x: number; y: number; bx: number; by: number }[] {
  const def = decorDef(p.d); if (!def?.seat) return [];
  const { fw, fh } = footOf(def, p.r), n = Math.max(fw, fh), out: { x: number; y: number; bx: number; by: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (fw >= fh) { const bx = (p.x + (i + 0.5) * fw / n) * 16, by = (p.y + fh) * 16 - 8; out.push({ x: bx, y: (p.y + fh) * 16 + 1, bx, by }); }
    else { const bx = (p.x + 0.5) * 16, by = (p.y + (i + 1) * fh / n) * 16 - 8; out.push({ x: bx, y: by + 9, bx, by }); }
  }
  return out;
}
