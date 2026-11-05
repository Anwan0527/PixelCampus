import type { FishLog } from '@/shared/fishing';
import { emptyGearLog, type GearLog } from '@/shared/fishdex';
import type { GearEnv } from '@/shared/gear';
import { routeBonus, type Route } from '@/shared/fishlevel';
import type { ServerMsg } from '@/shared/protocol';
import type { NetClient } from '@/net/client';

export type FxInfo = Extract<ServerMsg, { t: 'fx' }>;
export type WqInfo = Extract<ServerMsg, { t: 'wq' }>;

/**
 * 钓鱼相关的客户端数据（图鉴记录、装备图鉴、钓鱼等级、委托、"现在"的环境）：服务器推来什么就存什么，几个面板（背包装备栏、图鉴、开盲盒、合成、钓具摊）共用，
 * 变了就通知它们刷新。NetClient 的每种消息只有一个处理函数，所以由这里统一接，再分发。
 */
export const fishData = {
  log: {} as Record<string, FishLog>,
  gd: emptyGearLog() as GearLog,
  /** 钓鱼等级信息（没收到过 = 1 级）和委托 */
  fx: null as FxInfo | null,
  wq: null as WqInfo | null,
  /** 现在的环境（夜里 / 雨天 / 季节，服务器时间）；由场景提供 */
  env: ((): GearEnv => ({ night: false })) as () => GearEnv,
  listeners: new Set<() => void>(),
  /** 升级时的回调（场景弹横幅） */
  onLevelUp: null as ((m: FxInfo) => void) | null,
  notify() { for (const f of this.listeners) f(); },
  get level(): number { return this.fx?.lv ?? 1; },
  /** 卖鱼价加成（渔夫路线） */
  get sellBonus(): number { return this.fx ? routeBonus(this.fx.rt as Route[], this.fx.lv).sell : 0; },
  attach(net: NetClient) {
    net.handlers.fishdex = (log) => { this.log = log; this.notify(); };
    net.handlers.geardex = (gd) => { this.gd = gd; this.notify(); };
    net.handlers.fx = (m) => { this.fx = m; if (m.up) this.onLevelUp?.(m); this.notify(); };
    net.handlers.wq = (m) => { this.wq = m; this.notify(); };
  },
};
