import { encodeBackup } from '@/shared/backup';
import { restoreIdentity } from '@/net/restore';
import { getToken, saveProfile, setToken } from '@/core/profileStore';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type BackupMode = 'show' | 'restore';

/**
 * 身份备份 / 恢复。你的身份（校园号、好友、私聊、背包、小猫好感度）存在服务器上，浏览器里只有一把"钥匙"；
 * 备份码就是这把钥匙的可读形式：清了浏览器数据、换手机/电脑之后，在"恢复身份"里输入它就能找回来。
 * 纯 DOM，不依赖 Phaser 场景，所以新生报到界面（还没进游戏）也能用。
 */
export class BackupPanel {
  private root = el('div', 'screen hidden');
  private tabs: Record<BackupMode, HTMLButtonElement> = { show: el('button', 'seg', '我的备份码'), restore: el('button', 'seg', '恢复身份') };
  private body = el('div', 'backup-body');
  private mode: BackupMode = 'show';
  private busy = false;

  constructor() {
    const panel = el('div', 'box backup');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '身份备份'), close);
    const tabRow = el('div', 'seg-row');
    for (const m of ['show', 'restore'] as const) { this.tabs[m].type = 'button'; this.tabs[m].addEventListener('click', () => this.setMode(m)); tabRow.append(this.tabs[m]); }
    panel.append(head, tabRow, this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root && !this.busy) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen && !this.busy) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(mode: BackupMode = 'show') { this.root.classList.remove('hidden'); this.setMode(mode); }
  /** Esc：正在处理（busy）时不许关，和原来一致 */
  escape() { if (!this.busy) this.close(); }
  close() { this.root.classList.add('hidden'); }

  private setMode(m: BackupMode) {
    this.mode = m;
    for (const k of ['show', 'restore'] as const) this.tabs[k].classList.toggle('on', k === m);
    this.body.replaceChildren();
    if (m === 'show') this.renderShow(); else this.renderRestore();
  }

  private renderShow() {
    const code = encodeBackup(getToken());
    const b = this.body;
    b.append(el('div', 'create-sub', '把下面的备份码抄在备忘录里（或下载成文件）。以后清了浏览器数据、换了手机或电脑，在"恢复身份"里输入它，就能找回你的校园号、好友、私聊和背包。'));
    if (!code) { b.append(el('div', 'form-err', '现在没法生成备份码（身份标识不可用），请刷新页面后再试。')); return; }
    const box = el('textarea', 'backup-code'); box.readOnly = true; box.rows = 3; box.value = '点「显示备份码」查看'; box.spellcheck = false;
    const msg = el('div', 'board-msg');
    const show = el('button', 'btn primary', '显示备份码'); show.type = 'button';
    const copy = el('button', 'btn', '复制'); copy.type = 'button'; copy.disabled = true;
    const save = el('button', 'btn', '下载成文件'); save.type = 'button'; save.disabled = true;
    show.addEventListener('click', () => { box.value = code; box.classList.add('shown'); copy.disabled = save.disabled = false; show.disabled = true; });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); } catch { box.focus(); box.select(); try { document.execCommand('copy'); } catch { /* 手动复制 */ } }
      msg.textContent = '已复制，去备忘录粘贴保存吧。';
    });
    save.addEventListener('click', () => {
      const text = `像素校园 · 身份备份码\n\n${code}\n\n这串码相当于你身份的钥匙：任何人拿到它都能以你的身份进入游戏。请只自己保存，不要发给别人，也不要发到公屏或留言板。\n恢复方法：打开游戏 → 新生报到界面点「已有备份码？恢复身份」，或在学生证里点「身份备份」→「恢复身份」，粘贴这串码即可。\n`;
      const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = '像素校园-身份备份码.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg.textContent = '已下载。';
    });
    const row = el('div', 'create-btns'); row.append(show, copy, save);
    b.append(box, row, msg, el('div', 'backup-warn', '⚠ 备份码 = 身份钥匙：谁拿到谁就能用你的身份（能看到你的好友、私聊和背包）。别发给别人，别发到公屏或留言板。'));
  }

  private renderRestore() {
    const b = this.body;
    b.append(el('div', 'create-sub', '在这里输入之前保存的备份码，找回你的身份。大小写、空格、横线都不用管，直接粘贴就行。'));
    const input = el('textarea', 'backup-code shown'); input.rows = 3; input.placeholder = 'PX-XXXXX-XXXXX-XXXXX-…'; input.spellcheck = false; input.autocomplete = 'off';
    const msg = el('div', 'board-msg');
    const go = el('button', 'btn primary', '恢复身份'); go.type = 'button';
    const run = async () => {
      if (this.busy) return;
      const code = input.value.trim(); if (!code) { msg.textContent = '先粘贴备份码'; msg.classList.add('bad'); return; }
      this.busy = true; go.disabled = true; msg.classList.remove('bad'); msg.textContent = '正在连接服务器…';
      const r = await restoreIdentity(code);
      this.busy = false; go.disabled = false;
      if (!r.ok) { msg.textContent = r.msg; msg.classList.add('bad'); return; }
      setToken(r.token); saveProfile(r.profile);
      msg.textContent = `已恢复为「${r.profile.name}」，正在重新进入校园…`;
      go.disabled = true; input.disabled = true;
      window.setTimeout(() => location.reload(), 900);
    };
    go.addEventListener('click', () => void run());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(); } });
    const row = el('div', 'create-btns'); row.append(go);
    b.append(input, row, msg, el('div', 'backup-warn', '恢复后，这个浏览器会换成备份码对应的身份；当前这个浏览器里的身份如果没备份过，就找不回来了。'));
    setTimeout(() => input.focus(), 0);
  }
}
