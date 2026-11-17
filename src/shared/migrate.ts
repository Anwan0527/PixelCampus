/**
 * 老域名 → 备案新域名的「一键搬家」：共享的常量与纯函数（客户端与服务端共用）。
 * 方案见 docs/feature/20261117-domain-migration/spec.md：服务器发一次性搬家券（内存、3 分钟、只能用一次），
 * 老域名带着券跳到新域名（券放在网址 # 后面，不进服务器日志），新域名凭券换回 token 与资料后刷新进游戏。
 */

/** 备案好的新域名（正式环境） */
export const NEW_HOST = 'huepixel.top';
/** 新域名上的游戏地址（游戏构建带 /pixel/ 前缀） */
export const NEW_URL = `https://${NEW_HOST}/pixel/`;

/** 搬家券有效期（毫秒） */
export const MIGRATE_TTL_MS = 3 * 60 * 1000;
/** 服务器内存里最多同时保留多少张券 */
export const MIGRATE_MAX = 500;
/** 每个 IP 每 10 分钟最多发券 / 认领各多少次（和备份码恢复同量级） */
export const MIGRATE_LIMIT = 10;
/** 第二阶段开关（以后主人定日期再改成 true）：老域名不再进游戏，只显示「请到新网址」的搬家页 */
export const OLD_HOST_GATE = false;

/** 券格式：24 字节随机数的 base64url（32 个字符） */
export const validTicket = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);

/** 带着券跳到新域名的地址（券在 # 后面） */
export const migrateUrl = (ticket: string, base: string = NEW_URL): string => `${base}#m=${ticket}`;

/** 从 location.hash 里取出券；没有 / 格式不对返回 null */
export function ticketFromHash(hash: string): string | null {
  const m = /^#(?:.*&)?m=([A-Za-z0-9_-]+)(?:&.*)?$/.exec(hash);
  return m && validTicket(m[1]) ? m[1] : null;
}

/**
 * 当前页面该不该提供「搬到新网址」：只有正式环境的老域名才提供。
 * 新域名自己、本机开发（localhost / 127.* / 局域网 IP）、测试环境（路径里带 pixel-test）都不提供。
 */
export function shouldOfferMigration(loc: { hostname: string; pathname: string }): boolean {
  const h = loc.hostname.toLowerCase();
  if (h === NEW_HOST || h.endsWith(`.${NEW_HOST}`)) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
  if (loc.pathname.includes('pixel-test')) return false;
  return true;
}
