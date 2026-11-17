import type { Profile } from '@/shared/profile';
import type { ServerMsg } from '@/shared/protocol';
import { defaultWsUrl } from './client';

/**
 * 「一键搬家」的网络层（方案见 docs/feature/20261117-domain-migration/spec.md）：
 * 和备份码恢复（restore.ts）一样，临时连一次服务器、发一条消息、拿到回复就断开，不建立游戏会话。
 */
export type TicketResult = { ok: true; ticket: string } | { ok: false; msg: string };
export type ClaimResult = { ok: true; token: string; profile: Profile } | { ok: false; msg: string };

/** 临时连接：发 msg，等到类型为 replyType 的回复；超时 / 断开 / 连不上都当失败 */
function ask<T extends ServerMsg['t']>(msg: object, replyType: T, url: string, timeoutMs: number): Promise<Extract<ServerMsg, { t: T }> | string> {
  return new Promise((resolve) => {
    let done = false, ws: WebSocket | null = null;
    const finish = (r: Extract<ServerMsg, { t: T }> | string) => { if (done) return; done = true; window.clearTimeout(timer); try { ws?.close(); } catch { /* 已关闭 */ } resolve(r); };
    const timer = window.setTimeout(() => finish('连接服务器超时，请检查网络后再试'), timeoutMs);
    try { ws = new WebSocket(url); } catch { finish('无法连接服务器'); return; }
    ws.onopen = () => ws!.send(JSON.stringify(msg));
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let m: ServerMsg; try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
      if (m.t === replyType) finish(m as Extract<ServerMsg, { t: T }>);
    };
    ws.onerror = () => finish('无法连接服务器，请稍后再试');
    ws.onclose = () => finish('与服务器断开了，请稍后再试');
  });
}

/** 老域名：用本机的 token 换一张搬家券 */
export async function makeMigrationTicket(token: string, url = defaultWsUrl(), timeoutMs = 8000): Promise<TicketResult> {
  const r = await ask({ t: 'migrate_make', token }, 'migrate_ticket', url, timeoutMs);
  if (typeof r === 'string') return { ok: false, msg: r };
  return r.ok && r.ticket ? { ok: true, ticket: r.ticket } : { ok: false, msg: r.msg ?? '没能生成搬家券' };
}

/** 新域名：凭搬家券换回 token 与学生证资料（券用一次即作废） */
export async function claimMigration(ticket: string, url = defaultWsUrl(), timeoutMs = 8000): Promise<ClaimResult> {
  const r = await ask({ t: 'migrate_claim', ticket }, 'migrate_claimed', url, timeoutMs);
  if (typeof r === 'string') return { ok: false, msg: r };
  return r.ok && r.token && r.profile ? { ok: true, token: r.token, profile: r.profile } : { ok: false, msg: r.msg ?? '搬家券已失效，请回到旧网址重新点一次' };
}
