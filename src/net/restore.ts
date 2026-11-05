import { decodeBackup } from '@/shared/backup';
import type { Profile } from '@/shared/profile';
import type { ServerMsg } from '@/shared/protocol';
import { defaultWsUrl } from './client';

export type RestoreResult = { ok: true; token: string; profile: Profile } | { ok: false; msg: string };

/**
 * 用备份码找回身份：先在本地解码并校验（抄错了立刻提示），再临时连一次服务器，
 * 确认服务器认识这个身份并取回学生证资料。不建立游戏会话，拿到结果就断开。
 */
export function restoreIdentity(code: string, url = defaultWsUrl(), timeoutMs = 8000): Promise<RestoreResult> {
  const token = decodeBackup(code);
  if (!token) return Promise.resolve({ ok: false, msg: '备份码不对：请检查有没有抄错、少抄（可以直接粘贴，大小写和横线都不用管）' });
  return new Promise((resolve) => {
    let done = false, ws: WebSocket | null = null;
    const finish = (r: RestoreResult) => { if (done) return; done = true; window.clearTimeout(timer); try { ws?.close(); } catch { /* 已关闭 */ } resolve(r); };
    const timer = window.setTimeout(() => finish({ ok: false, msg: '连接服务器超时，请检查网络后再试' }), timeoutMs);
    try { ws = new WebSocket(url); } catch { finish({ ok: false, msg: '无法连接服务器' }); return; }
    ws.onopen = () => ws!.send(JSON.stringify({ t: 'restore', token }));
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let m: ServerMsg; try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
      if (m.t !== 'restored') return;
      finish(m.ok && m.profile ? { ok: true, token, profile: m.profile } : { ok: false, msg: m.msg ?? '恢复失败' });
    };
    ws.onerror = () => finish({ ok: false, msg: '无法连接服务器，请稍后再试' });
    ws.onclose = () => finish({ ok: false, msg: '与服务器断开了，请稍后再试' });
  });
}
