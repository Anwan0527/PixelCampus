import type { NetClient } from '@/net/client';
import { ui } from './actions';
import { SoundSection } from './SoundPanel';
import { ChannelSection } from './ChannelPanel';
import { AboutSection } from './AboutPanel';
import type { ChatPanel } from './ChatPanel';
import { isImmersive, setImmersive } from './Immersive';
import { canFullscreen, isFullscreen, toggleFullscreen } from './Orientation';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type SettingsTab = 'sound' | 'chat' | 'display' | 'account' | 'about';
export interface SettingsHooks {
  /** 小地图开关（电脑和手机都有） */
  miniMap: { on(): boolean; set(on: boolean): void };
  /** 账号与备份页的按钮：学生证、修改资料、身份备份、成就 / 称号（图鉴里） */
  card(): void; editProfile(): void; backup(): void; achievements(): void; titles(): void;
}

/**
 * 设置：声音 / 聊天（频道开关与静音）/ 画面与沉浸（沉浸模式、全屏、小地图）/ 账号与备份 / 关于，一个入口（菜单「设置」），分页显示。
 * 以前这些是散在菜单里的 6 个入口（声音、聊天频道、沉浸模式、全屏、关于，另外小地图开关只有手机有）。
 * 沉浸模式仍然可以按 Z；聊天窗口右上角的 ⚙ 直接打开这里的「聊天」页。偏好存储键都没变（pc_immersive / pixelcampus.minimap / 音量键 / 档案里的频道偏好）。
 */
export class SettingsPanel {
  private root = el('div', 'screen hidden');
  private tabsBar = el('div', 'cx-tabs');
  private body = el('div', 'set-body');
  private tab: SettingsTab = 'sound';
  private sound = new SoundSection();
  private chans: ChannelSection;
  private about: AboutSection;
  private tabs: { id: SettingsTab; label: string; view: () => HTMLElement }[];

  constructor(private net: NetClient, chat: ChatPanel, private hooks: SettingsHooks) {
    this.about = new AboutSection(net);
    this.chans = new ChannelSection(net, chat);
    this.chans.visible = () => this.isOpen && this.tab === 'chat';
    this.tabs = [
      { id: 'sound', label: '声音', view: () => this.sound.view },
      { id: 'chat', label: '聊天', view: () => { this.chans.render(); return this.chans.view; } },
      { id: 'display', label: '画面', view: () => this.displayView() },
      { id: 'account', label: '账号', view: () => this.accountView() },
      { id: 'about', label: '关于', view: () => this.about.view },
    ];
    const panel = el('div', 'box settings');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭设置');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '设置'), close);
    panel.append(head, this.tabsBar, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'settings', label: '设置', run: () => this.toggle() });
    chat.onManage = () => this.open('chat');
    document.addEventListener('fullscreenchange', () => { if (this.isOpen && this.tab === 'display') this.render(); });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(tab?: SettingsTab) { if (tab) this.tab = tab; this.root.classList.remove('hidden'); this.render(); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  private render() {
    this.tabsBar.replaceChildren(...this.tabs.map((t) => {
      const b = el('button', 'cx-tab' + (t.id === this.tab ? ' on' : ''), t.label); b.type = 'button';
      b.addEventListener('click', () => { this.tab = t.id; this.render(); });
      return b;
    }));
    this.root.querySelector('.settings')?.classList.toggle('wide', this.tab === 'about');
    this.body.replaceChildren(this.tabs.find((t) => t.id === this.tab)!.view());
  }

  private btn(label: string, run: () => void, cls = 'btn') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); return b; }
  private row(title: string, desc: string, ...ctl: HTMLElement[]) {
    const r = el('div', 'set-row'), t = el('div', 'set-row-t');
    t.append(el('div', 'set-row-name', title), el('div', 'set-row-desc', desc));
    r.append(t, ...ctl); return r;
  }

  /** 画面与沉浸：沉浸模式、全屏（浏览器支持时）、小地图 */
  private displayView() {
    const v = el('div', 'set-sec');
    const imm = this.btn(isImmersive() ? '退出沉浸' : '进入沉浸', () => { const on = !isImmersive(); if (on) this.close(); setImmersive(on, true); this.render(); });
    v.append(this.row('沉浸模式（Z）', '藏起头像、时钟、小地图、聊天、菜单等所有界面，只剩游戏画面；键盘功能键照常能用，Enter 说话时聊天框临时冒出来。选择会记在本机。', imm));
    if (canFullscreen()) {
      const fs = this.btn(isFullscreen() ? '退出全屏' : '全屏', () => { void toggleFullscreen().then(() => this.render()); });
      v.append(this.row('全屏', '手机（Android Chrome 等）会同时锁定横屏；iPhone Safari 不支持网页全屏，手动横过来即可。', fs));
    }
    const mm = el('input'); mm.type = 'checkbox'; mm.checked = this.hooks.miniMap.on(); mm.setAttribute('aria-label', '显示小地图');
    mm.addEventListener('change', () => this.hooks.miniMap.set(mm.checked));
    const lab = el('label', 'set-check'); lab.append(mm, document.createTextNode(' 显示'));
    v.append(this.row('小地图', '左下角的小地图；点它可以放大成大地图（也可以按 M）。', lab));
    return v;
  }

  /** 账号与备份：学生证、修改资料、身份备份，成就 / 称号（在图鉴里） */
  private accountView() {
    const v = el('div', 'set-sec');
    const go = (fn: () => void) => () => { this.close(); fn(); };
    v.append(
      this.row('学生证（C）', '看你的学生证：姓名、学院、成就数、头衔。', this.btn('打开', go(this.hooks.card))),
      this.row('修改资料', '改昵称、学院、专业、外观。', this.btn('修改', go(this.hooks.editProfile))),
      this.row('身份备份', '清了浏览器数据或换设备前，抄下备份码就能找回好友和背包。', this.btn('备份 / 恢复', go(this.hooks.backup))),
      this.row('成就与称号', '在「图鉴」里：成就页看解锁进度，称号页佩戴称号。', this.btn('成就', go(this.hooks.achievements)), this.btn('称号', go(this.hooks.titles))),
    );
    if (this.net.status !== 'online') v.append(el('div', 'create-sub', '现在没连上服务器：备份和成就要连上之后才能用。'));
    return v;
  }
}
