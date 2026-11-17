import { claimMigration } from '@/net/migrate';
import { ticketFromHash } from '@/shared/migrate';
import { loadProfile, peekToken, saveProfile, setToken } from './profileStore';

/**
 * 新域名页面启动时：如果地址里带着搬家券（#m=…），先把它从地址栏抹掉，再凭券换回老身份并刷新进游戏。
 * 返回 `reloading`（页面马上刷新，不要再启动游戏）/ `none`（没有券，正常启动）/ `failed` / `cancelled`（都继续正常启动）。
 * 方案见 docs/feature/20261117-domain-migration/spec.md。
 */
export type BootMigration = 'none' | 'reloading' | 'failed' | 'cancelled';

const say = (text: string) => { const e = document.getElementById('loading-text'); if (e) e.textContent = text; };
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export async function receiveMigration(): Promise<BootMigration> {
  const ticket = ticketFromHash(location.hash);
  if (!ticket) return 'none';
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 抹不掉也不影响：券用一次就作废 */ }
  say('正在导入你的角色…');
  const r = await claimMigration(ticket);
  if (!r.ok) { say(`${r.msg}（先按新生报到进入，之后可以在「备份」里用备份码找回）`); await sleep(3500); return 'failed'; }
  // 这个浏览器在新域名上已经有另一个角色：替换会让它找不回来，必须玩家确认
  const cur = loadProfile();
  if (cur && peekToken() !== r.token) {
    const ok = window.confirm(`这个浏览器里已经有一个新角色「${cur.name}」。\n导入老角色「${r.profile.name}」会替换掉它（新角色如果没有备份码就找不回来了）。\n\n要导入老角色吗？`);
    if (!ok) { say('已取消导入，继续使用现在的角色'); await sleep(900); return 'cancelled'; }
  }
  setToken(r.token); saveProfile(r.profile);
  say(`已导入「${r.profile.name}」，正在进入校园…`);
  await sleep(600);
  location.replace(location.pathname + location.search);
  return 'reloading';
}
