import type { FishLog } from '@/shared/fishing';
import { emptyGearLog, type GearLog } from '@/shared/fishdex';
import type { GearEnv } from '@/shared/gear';
import type { NetClient } from '@/net/client';

/**
 * 钓鱼相关的客户端数据（图鉴记录、装备图鉴、"现在"的环境）：服务器推来什么就存什么，几个面板（背包装备栏、图鉴、开盲盒、合成）共用，
 * 变了就通知它们刷新。NetClient 的每种消息只有一个处理函数，所以由这里统一接，再分发。
 */
export const fishData = {
  log: {} as Record<string, FishLog>,
  gd: emptyGearLog() as GearLog,
  /** 现在的环境（夜里 / 雨天 / 季节，服务器时间）；由场景提供 */
  env: ((): GearEnv => ({ night: false })) as () => GearEnv,
  listeners: new Set<() => void>(),
  notify() { for (const f of this.listeners) f(); },
  attach(net: NetClient) {
    net.handlers.fishdex = (log) => { this.log = log; this.notify(); };
    net.handlers.geardex = (gd) => { this.gd = gd; this.notify(); };
  },
};
