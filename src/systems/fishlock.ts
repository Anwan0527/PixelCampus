/**
 * 钓鱼沉浸：玩家进入钓鱼流程（抛竿 → 等鱼 → 咬钩 → 拉鱼 → 鱼飞出水面 → 结算卡片）后，其他场景互动（小猫、单车、长椅、垃圾桶、建筑、NPC、校园跑起点……）
 * 和会打断画面的界面入口（小猫、商店、好友、传送、拍照……）都暂时失效，只保留钓鱼自己的操作；收竿（走动 / 按 E）之后才能做别的。
 * 纯函数：WorldScene 每帧拿状态问一下，测试也直接测它。
 */
export type FishPhase = 'idle' | 'wait' | 'bite' | 'fight';
export interface FishLockState {
  phase: FishPhase;
  /** 结算卡片还在屏幕上 */
  cardOpen: boolean;
  /** 鱼正在飞出水面（卡片弹出之前） */
  catching: boolean;
  /** 站在岸边、面朝湖水、背包里有竿有饵（随时能抛竿） */
  castable?: boolean;
}

/** 钓鱼流程进行中（含收杆后的结算画面） */
export const fishingActive = (s: FishLockState): boolean => s.phase !== 'idle' || s.cardOpen || s.catching;
/** 屏蔽场景互动：只剩钓鱼自己的操作（提竿 / 收线 / 结算后再抛竿） */
export const fishingBlocksInteract = (s: FishLockState): boolean => fishingActive(s);
/** 站在能抛竿的地方时，抛竿优先于小猫、单车、长椅、垃圾桶、NPC、校园跑起点（建筑门口、摊位、彩蛋区仍然优先，免得进不了店） */
export const fishingPrefersCast = (s: FishLockState): boolean => !!s.castable;

/** 在「鱼竿还在水里 / 鱼正在飞」的阶段（结算卡片不算：卡片要停几秒，那几秒里别的界面可以正常开） */
export const fishingRodOut = (s: FishLockState): boolean => s.phase !== 'idle' || s.catching;

/** 钓鱼中仍然可用的界面入口（ui 注册表的 id）：背包（换竿换饵，含精灵页）、地图、设置（声音 / 聊天频道 / 沉浸 / 全屏 / 小地图 / 关于）、图鉴里的钓鱼页（G 键单独处理） */
export const FISHING_OK_UI: ReadonlySet<string> = new Set(['bag', 'map', 'settings']);
/** 钓鱼中这个界面入口要不要屏蔽 */
export const fishingBlocksUi = (s: FishLockState, id: string): boolean => fishingRodOut(s) && !FISHING_OK_UI.has(id);

/** 被屏蔽时的提示 */
export const FISHING_BLOCK_MSG = '正在钓鱼：先收竿（走动或按 E）再做别的';
