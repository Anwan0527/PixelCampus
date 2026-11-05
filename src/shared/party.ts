/**
 * 好友组队（客户端与服务器共用）。
 * 队伍只存在于服务器内存里（掉线就退出，不落盘），最多 PARTY_MAX 人，成员必须互为好友（邀请时按"队长和被邀请人是好友"检查）。
 * 队员之间可以：看到彼此的大致位置、一键传送到队友身旁、同骑一辆共享单车（队友载人）。
 */
export const PARTY_MAX = 4;
export const PARTY_INVITE_MS = 60 * 1000;
/** 传送到队友身边的冷却（毫秒） */
export const PARTY_TP_COOLDOWN_MS = 15 * 1000;
/**
 * 坐上队友的车：客户端出现「按 E 坐后座」提示的距离 / 服务器校验的最大距离（像素）。
 * 以前只有 44 像素（人几乎要站在车上才有提示），实际玩起来站得稍远就按不动，所以放宽；
 * PAX_NEAR 以内但够不着时，提示「再走近一点」。
 */
export const PAX_REACH = 80;
export const PAX_SERVER_REACH = 140;
export const PAX_NEAR = 300;

export interface PartyMember {
  uid: number; name: string; leader: boolean; self?: true;
  /** 队友所在地标 + 相对"我"的方位和距离（对自己没有） */
  where?: string; dir?: string; m?: number; near?: boolean;
  /** 状态：走路 / 骑车 / 坐在队友车上 / 坐着 / 钓鱼 / 校园跑 */
  state: string;
}

/** 服务器发给客户端的组队消息 */
export type PartyMsg =
  | { t: 'party_invite'; pid: number; from: number; name: string }
  /** 我所在队伍的完整状态（成员的位置是按我的视角算好的） */
  | { t: 'party'; id: number; leader: number; members: PartyMember[] }
  /** 没有队伍了（退出/被请出/解散）；msg 可能为空 */
  | { t: 'party_gone'; msg: string }
  | { t: 'party_result'; ok: boolean; msg: string }
  /** 坐上/离开队友的车：pid = 我正在坐的那辆车的车主的玩家编号（0 = 没坐车）。客户端据此跟着车主走 */
  | { t: 'pax_result'; ok: boolean; pid: number; msg?: string };
