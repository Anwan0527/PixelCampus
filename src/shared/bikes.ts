/**
 * 校门口的共享单车停放点（客户端与服务器共用）：全部在校园里面——南门（正门）墙内侧、门内东西向小路两边的草坪上，每侧 2 排（路北一排、路南一排）× 5 辆，共 20 辆
 * （2026-11-02 起不再有放在墙外的）。
 * 位置写死在这里（像素坐标，车的脚点）：客户端据此摆车，服务器据此判断"上车时是不是真的在车旁边"。
 * 黄色停放块（每排一条，刚好盖住 5 辆车，不压路面）在 data/campus/terrain/30-plazas.json（"…侧单车停放块"），要挪位置两边一起改。
 * 车架旁随机停的车见 WorldScene.buildBikes。
 */
import { TILE } from '../core/const';

export interface BikeSpot { x: number; y: number; flip: boolean }

/** 每排辆数、车距（像素）；南门内两侧各两排：小路北侧草坪一排、南侧草坪（紧靠门墙）一排 */
const PER_ROW = 5, STEP = 30;
/**
 * [第一辆的格坐标 x, 两排的格坐标 y（车的脚点）]：东西向小路（沥青，原 5 m 格 y≈237.4–239.4）的北侧草坪一排、
 * 南侧草坪一排（铁栏 y≈481 以北）；西侧 x 325–335（原 5 m 格 162.5–167.3），东侧 x 384–394。
 */
const PADS: { x0: number; rows: number[] }[] = [
  { x0: 326, rows: [474.1, 480.3] },
  { x0: 385, rows: [474.1, 480.3] },
];

export function gateBikes(): BikeSpot[] {
  const out: BikeSpot[] = [];
  for (const pad of PADS) pad.rows.forEach((ty, r) => { for (let i = 0; i < PER_ROW; i++) out.push({ x: Math.round(pad.x0 * TILE + i * STEP), y: Math.round(ty * TILE), flip: (i + r) % 2 === 1 }); });
  return out;
}

/**
 * 下车后留在原地的单车：玩家锁车下车（或掉线）后，车就停在脚边，任何人走近按 E 都能骑走；
 * 超过 BIKE_DROP_TTL_MS 没人动它就消失（"被共享单车公司收走了"）。同时最多 BIKE_DROP_MAX 辆，满了最早的先消失。
 * 位置由服务器定（玩家下车的位置 + 朝向方向偏一点，免得压在人身上），所有人看到的一样。
 */
export const BIKE_DROP_TTL_MS = 10 * 60 * 1000;
export const BIKE_DROP_MAX = 60;
/** 离已有的留车不到这么近（像素）就不再多停一辆，只刷新那一辆的时间 */
export const BIKE_DROP_MERGE_PX = 14;
/** 车停在玩家脚边：沿朝向方向偏多少像素 */
export const BIKE_DROP_SIDE_PX = 12;
export interface DroppedBike { id: number; x: number; y: number; flip: boolean }
