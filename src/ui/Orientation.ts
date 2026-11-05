import { ui } from './actions';

/**
 * 手机横屏：布局由 style.css 的横屏媒体查询自动切换（竖屏、横屏都能玩）；这里只做两件事：
 *  1. 菜单里的「全屏横屏」：进入全屏，并（Android Chrome 等支持的浏览器）把屏幕锁定成横向；再点一次退出。
 *     iPhone 的 Safari 不允许网页全屏、也不能锁方向，这个入口会自动隐藏，手动把手机横过来就行（加到主屏幕再打开会更像全屏）。
 *  2. 竖屏进游戏时提示一次「横屏更舒服」，8 秒后自己消失，每台设备只提示一次（记在本机 localStorage）。
 */
const TIP_KEY = 'pc_rotate_tip';

export const isLandscape = () => { try { return window.matchMedia('(orientation: landscape)').matches; } catch { return window.innerWidth > window.innerHeight; } };

/** 浏览器支持网页全屏吗（iPhone Safari 不支持） */
export const canFullscreen = () => { const d = document as Document & { webkitFullscreenEnabled?: boolean }; return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled); };
const isFs = () => { const d = document as Document & { webkitFullscreenElement?: Element | null }; return !!(document.fullscreenElement || d.webkitFullscreenElement); };

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };
const orient = () => (screen.orientation ?? undefined) as LockableOrientation | undefined;

async function toggleFullscreen() {
  try {
    if (isFs()) {
      try { orient()?.unlock?.(); } catch { /* 没锁过 */ }
      await (document.exitFullscreen?.() ?? (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.());
      return;
    }
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); else root.webkitRequestFullscreen?.();
    try { await orient()?.lock?.('landscape'); } catch { /* 不支持锁定方向：用户自己横过来 */ }
  } catch { /* 被拒绝（没有用户手势、策略禁止）：什么也不做 */ }
}

export function mountOrientation() {
  ui.add({ id: 'fullscreen', label: '⛶ 全屏', run: () => { void toggleFullscreen(); }, desktop: false, visible: canFullscreen });
  document.addEventListener('fullscreenchange', () => { if (!isFs()) { try { orient()?.unlock?.(); } catch { /* 没锁过 */ } } });
  showRotateTip();
}

function showRotateTip() {
  let seen = false;
  try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch { /* 存储被禁用：每次都提示也无妨 */ }
  if (seen || isLandscape()) return;
  const tip = document.createElement('div');
  tip.id = 'rotate-tip'; tip.className = 'box'; tip.setAttribute('role', 'status');
  const text = document.createElement('span'); text.textContent = '📱 把手机横过来玩，视野更宽、按键更好按';
  const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = '知道了';
  tip.append(text, ok);
  (document.getElementById('hud') ?? document.body).append(tip);
  const done = () => { tip.remove(); mq?.removeEventListener?.('change', onChange); window.clearTimeout(timer); };
  const onChange = () => { if (isLandscape()) done(); };
  const mq = (() => { try { return window.matchMedia('(orientation: landscape)'); } catch { return null; } })();
  mq?.addEventListener?.('change', onChange);
  ok.addEventListener('click', done);
  const timer = window.setTimeout(done, 8000);
  try { localStorage.setItem(TIP_KEY, '1'); } catch { /* 同上 */ }
}
