/**
 * 放生（客户端与服务器共用）：钓到保护动物时可以选择放生——给少量币和一点经验，并累计放生次数；攒够有称号。
 * 保护动物名单是现实里的国家保护动物；放生不影响图鉴（钓到的那一刻已经记过了）。
 */
import { fishDef } from './fishing';
import { fishPrice } from './economy';
import { XP_BASE } from './fishlevel';

export const PROTECTED: Readonly<Record<string, string>> = {
  fish_sucker: '胭脂鱼是国家二级保护动物，放回水里它们才能长成大鱼。',
  fish_paddlefish: '白鲟是国家一级保护动物，曾经被叫作"长江象鱼"。能再遇见它，就让它游走吧。',
  fish_salamander: '娃娃鱼（大鲵）是国家二级保护动物，野外的数量已经很少了。',
  fish_sturgeon: '鲟鱼是国家重点保护动物，一条要长很多年才能成年。',
};
export const isProtected = (id: unknown): boolean => typeof id === 'string' && Object.hasOwn(PROTECTED, id);
/** 放生的奖励：币 = 卖价的约 25%（至少 5）、经验 = 基础经验的 50%（至少 1，不受每日软上限限制） */
export function releaseReward(id: string): { coins: number; xp: number } | null {
  const d = fishDef(id);
  if (!d || !isProtected(id)) return null;
  return { coins: Math.max(5, Math.floor(fishPrice(d) * 0.25)), xp: Math.max(1, Math.floor(XP_BASE[d.rarity] * 0.5)) };
}
/** 累计放生次数的成就（达到就解锁，带称号和币） */
export const RELEASE_ACH: readonly { n: number; ach: string }[] = [{ n: 5, ach: 'release_5' }, { n: 20, ach: 'release_20' }, { n: 50, ach: 'release_50' }];
