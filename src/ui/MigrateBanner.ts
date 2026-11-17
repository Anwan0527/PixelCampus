import { makeMigrationTicket } from '@/net/migrate';
import { peekToken } from '@/core/profileStore';
import { NEW_HOST, NEW_URL, OLD_HOST_GATE, migrateUrl, shouldOfferMigration } from '@/shared/migrate';
import { ui } from './actions';

/**
 * 老域名上的「搬到新网址」入口（方案见 docs/feature/20261117-domain-migration/spec.md）：
 * 第一阶段（现在）：进游戏几秒后顶上一条可关闭的提示（关了 3 天后再提醒一次）+ 菜单里常驻一项「搬到新网址」；两个域名都能继续玩。
 * 第二阶段（`OLD_HOST_GATE = true` 时，以后主人定日期）：老域名只显示一个「请到新网址」的搬家页，不再进游戏。
 * 点「一键搬家」：用本机身份换一张一次性搬家券，跳到新域名；新域名自动接收，之后新老域名都是同一个玩家。
 */
/** 本地开发才有的两个开关（正式构建里这段会被摘掉）：?oldhost = 把当前页面当成老域名；?newurl=… = 搬到哪个地址（本地用另一个来源模拟新域名） */
const DEV_PARAMS = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const asOldHost = () => (DEV_PARAMS?.has('oldhost') ?? false) || shouldOfferMigration(location);
const newBase = () => (DEV_PARAMS?.get('newurl') ?? NEW_URL);
const DISMISS_KEY = 'pixelcampus.migrateDismissed';
const DISMISS_MS = 3 * 24 * 3600 * 1000;
const SHOW_DELAY_MS = 6000;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 点「一键搬家」：成功就跳转（页面离开），失败返回原因 */
export async function startMigration(): Promise<string | null> {
  const token = peekToken();
  if (!token) { window.location.href = newBase(); return null; } // 这个浏览器还没有角色：直接去新网址新生报到
  const r = await makeMigrationTicket(token);
  if (!r.ok) return r.msg;
  window.location.href = migrateUrl(r.ticket, newBase());
  return null;
}

const recentlyDismissed = (): boolean => { try { const t = Number(localStorage.getItem(DISMISS_KEY)); return Number.isFinite(t) && t > 0 && Date.now() - t < DISMISS_MS; } catch { return false; } };

/** 搬家卡片的内容（提示条和拦截页共用）：说明 + 按钮 + 状态行 */
function card(onClose?: () => void): HTMLElement {
  const box = el('div', 'migrate-card');
  const msg = el('div', 'migrate-msg');
  const go = el('button', 'btn primary', '一键搬家'); go.type = 'button';
  go.addEventListener('click', async () => {
    go.disabled = true; msg.classList.remove('bad'); msg.textContent = '正在准备搬家券…';
    const err = await startMigration();
    if (err) { msg.textContent = `${err}（也可以在「备份」里用备份码找回）`; msg.classList.add('bad'); go.disabled = false; } else msg.textContent = '正在带你去新网址…';
  });
  const row = el('div', 'migrate-row'); row.append(go);
  if (onClose) { const x = el('button', 'btn', '以后再说'); x.type = 'button'; x.addEventListener('click', onClose); row.append(x); }
  box.append(
    el('div', 'migrate-title', '🏠 我们有新家啦！'),
    el('div', 'migrate-text', `游戏已经搬到备案的新网址 ${NEW_HOST}。点「一键搬家」，带着你现在的角色、好友和背包过去——之后新老网址登录的都是你自己。别把搬家后跳转的链接发给别人。`),
    row, msg,
  );
  return box;
}

export function mountMigrateBanner() {
  if (!asOldHost()) return;
  ui.add({ id: 'migrate', label: '搬到新网址', run: () => { showOverlay(false); } });
  if (OLD_HOST_GATE) { showOverlay(true); return; }
  if (recentlyDismissed()) return;
  window.setTimeout(() => {
    if (document.getElementById('migrate-bar')) return;
    const bar = el('div', 'migrate-bar'); bar.id = 'migrate-bar';
    const close = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* 不记也行 */ } bar.remove(); };
    bar.append(card(close));
    (document.getElementById('hud') ?? document.body).append(bar);
  }, SHOW_DELAY_MS);
}

function showOverlay(gate: boolean) {
  if (document.getElementById('migrate-overlay')) return;
  const wrap = el('div', 'screen migrate-overlay'); wrap.id = 'migrate-overlay';
  const close = gate ? undefined : () => wrap.remove();
  wrap.append(card(close));
  (document.getElementById('hud') ?? document.body).append(wrap);
}
