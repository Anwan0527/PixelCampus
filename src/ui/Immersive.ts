import { ui } from './actions';
import { canFullscreen } from './Orientation';

/**
 * 沉浸模式：把所有界面（头像、时钟、小地图、聊天、菜单按钮、右侧入口……）都藏起来（只有作者水印保留：截图、录屏要带署名），只剩游戏画面。
 *  - 手机：只留摇杆、右下角「互动」键和右上角一个很淡的「退出」按钮；NPC 对话、「按 E」提示、邀请条这类要操作的东西照常出现。
 *  - 电脑：只剩画面；键盘功能键（I 背包、M 地图……）照常能用，面板照常弹出；按 Enter 说话时聊天框临时冒出来（说完几秒后自己收起）。
 *  - 进入 / 退出：菜单里的「沉浸模式」、电脑按 Z、右上角的 ⤢ 按钮。选择记在本机，下次进游戏还是沉浸。
 *  - 进入时（由用户点击 / 按键触发）会顺带尝试全屏：Android Chrome、电脑浏览器都行；iPhone Safari 和微信等内置浏览器不支持网页全屏，就只是隐藏界面。
 * 具体隐藏哪些元素在 style.css 的 `body.immersive` 规则里；以后新增的常驻界面记得也加进去。
 */
const KEY = 'pc_immersive';
const root = () => document.body;
export const isImmersive = () => root().classList.contains('immersive');

const isFs = () => { const d = document as Document & { webkitFullscreenElement?: Element | null }; return !!(document.fullscreenElement || d.webkitFullscreenElement); };
let weEnteredFs = false;

function store(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 存储被禁用就算了 */ } }
function stored(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

/** gesture = 由用户点击 / 按键触发（只有这时才能请求全屏） */
export function setImmersive(on: boolean, gesture = false) {
  root().classList.toggle('immersive', on);
  store(on);
  if (on && gesture && canFullscreen() && !isFs()) {
    try { const r = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }; const p = r.requestFullscreen ? r.requestFullscreen({ navigationUI: 'hide' }) : (r.webkitRequestFullscreen?.(), undefined); weEnteredFs = true; void p?.catch?.(() => { weEnteredFs = false; }); } catch { weEnteredFs = false; }
  } else if (!on && weEnteredFs && isFs()) {
    try { void document.exitFullscreen?.(); } catch { /* 已经退出了 */ } weEnteredFs = false;
  }
  if (on && gesture) toast('沉浸模式：点右上角 ⤢ 或按 Z 退出');
}

let toastEl: HTMLElement | null = null, toastTimer = 0;
function toast(text: string) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'imm-toast'; (document.getElementById('hud') ?? document.body).append(toastEl); }
  toastEl.textContent = text; toastEl.classList.add('on');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toastEl?.classList.remove('on'), 3200);
}

const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };

let mounted = false;
export function mountImmersive() {
  if (mounted) return; mounted = true; // 场景重启时不重复挂
  const exit = document.createElement('button');
  exit.id = 'imm-exit'; exit.type = 'button'; exit.textContent = '⤢'; exit.title = '退出沉浸模式（Z）'; exit.setAttribute('aria-label', '退出沉浸模式');
  exit.addEventListener('click', () => setImmersive(false, true));
  (document.getElementById('hud') ?? document.body).append(exit);
  ui.add({ id: 'immersive', label: '沉浸模式', key: 'Z', run: () => setImmersive(!isImmersive(), true) });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !typing()) setImmersive(!isImmersive(), true);
  });
  // 用户自己按 Esc 退出了全屏：沉浸模式保留（只是界面藏着），不强行改
  document.addEventListener('fullscreenchange', () => { if (!isFs()) weEnteredFs = false; });
  if (stored()) setImmersive(true, false); // 上次是沉浸的：这次直接沉浸（不请求全屏，浏览器不允许没有手势的全屏）
}
