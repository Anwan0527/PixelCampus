import type { NetClient } from '@/net/client';
import { TELEPORTS, TELEPORT_GROUPS, TP_COOLDOWN_MS } from '@/shared/teleport';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 传送面板：按分组列出预设地点（南门/东门/西门、图书馆门前、教学楼、餐厅、各社区、留学生公寓、42 号楼），点一下就传过去。
 * 服务器校验状态（骑车/坐着/钓鱼/战斗中不能传）和冷却；这里只显示一个"冷却中"的小提示，真正的判断都在服务器。
 * 电脑按 Y 或点菜单「传送」，手机点 ☰ → 传送。
 */
export class TeleportPanel {
  private root = el('div', 'screen hidden');
  private msg = el('div', 'tp-msg');
  private buttons: HTMLButtonElement[] = [];
  private lastGo = 0;

  constructor(private net: NetClient, private onGone: () => void = () => {}) {
    const panel = el('div', 'box tp');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭传送面板');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '传送'), close);
    panel.append(head, el('div', 'create-sub', '点一个地点，立刻传过去（骑车、坐着、钓鱼、战斗中不能传，传送后有几秒冷却）。'), this.msg);
    for (const g of TELEPORT_GROUPS) {
      panel.append(el('div', 'tp-group', g));
      const row = el('div', 'tp-row');
      for (const t of TELEPORTS.filter((x) => x.group === g)) {
        const b = el('button', 'btn tp-btn', t.name); b.type = 'button'; b.dataset.id = t.id;
        b.addEventListener('click', () => { if (this.net.status !== 'online') { this.say('没连上服务器，不能传送', false); return; } this.lastGo = Date.now(); this.net.tpGo(t.id); });
        this.buttons.push(b); row.append(b);
      }
      panel.append(row);
    }
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'teleport', label: '传送', key: 'Y', run: () => this.toggle() });
    net.handlers.tpResult = (ok, msg) => {
      this.say(msg, ok);
      if (ok) { this.lastGo = Date.now(); this.close(); this.onGone(); }
    };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.say('', true); this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private say(text: string, ok: boolean) { this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }
  /** 刚传送过的冷却（只用来灰掉按钮，服务器才是准的） */
  get cooling() { return Date.now() - this.lastGo < TP_COOLDOWN_MS; }
}
