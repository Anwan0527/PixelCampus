import { RUN, LAP_M, fmtTime, progressOf, type RunMsg, type RunPlayerInfo, type RunPhase } from '@/shared/run';
import type { FriendInfo } from '@/shared/social';
import type { NetClient } from '@/net/client';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface RunHooks {
  /** 在线的好友（用来邀请） */
  friends(): FriendInfo[];
  /** 倒计时的 3/2/1 与发令（场景据此出声）；done = 跑完/比赛结束 */
  beep(kind: 'count' | 'go' | 'finish' | 'invite'): void;
  /** 提示：横幅 + 公屏 */
  note(title: string, text: string): void;
}

/**
 * 校园跑的全部界面：起跑线前的开始面板（单人 / 邀请好友）、候场、倒计时与比赛中的计时条、结果、收到邀请的小提示。
 * 比赛本身在服务器：这里只显示服务器发来的状态，倒计时用服务器时间校准。
 */
export class RunPanel {
  private root = el('div', 'screen hidden');
  private body = el('div');
  private hud = el('div', 'hidden');
  private big = el('div', 'run-big hidden');
  private toastBox = el('div');
  private room: Extract<RunMsg, { t: 'run_state' }> | null = null;
  private result: RunPlayerInfo[] | null = null;
  private offset = 0; // 服务器时间 - 本机时间
  private best?: number; private done = 0; private wins = 0;
  private lastBeep = 99;
  private msg = '';
  private mode: 'menu' | 'invite' = 'menu';

  constructor(private net: NetClient, private hooks: RunHooks) {
    const panel = el('div', 'box run');
    panel.append(this.body);
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    this.hud.id = 'run-hud'; this.big.id = 'run-big'; this.toastBox.id = 'run-toasts';
    const h = document.getElementById('hud') ?? document.body;
    h.append(this.root, this.hud, this.big, this.toastBox);
    net.handlers.run = (m) => this.onMsg(m);
    net.onStatus(() => { if (this.isOpen) this.render(); });
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 正在比赛（倒计时或比赛中）：场景据此限制别的互动 */
  get active() { return !!this.room && (this.room.phase === 'count' || this.room.phase === 'go'); }
  get inRoom() { return !!this.room && this.room.phase !== 'done'; }
  /** 我自己下一个要经过的检查点（场景画指示圈用）；不在比赛中返回 -1 */
  get nextGate() { const me = this.room?.players.find((p) => p.uid === this.room?.you); return this.room?.phase === 'go' && me && me.ms === undefined ? me.gate : -1; }

  open() { this.result = null; this.msg = ''; this.mode = this.inRoom ? 'invite' : 'menu'; this.root.classList.remove('hidden'); this.net.getRun(); this.render(); }
  close() { this.root.classList.add('hidden'); }

  private now() { return Date.now() + this.offset; }

  private onMsg(m: RunMsg) {
    if (m.t === 'run_invite') { this.toast(m); return; }
    if (m.t === 'run_best') { this.best = m.best; this.done = m.n; this.wins = m.wins; if (this.isOpen) this.render(); return; }
    if (m.t === 'run_gone') {
      this.room = null; this.mode = 'menu'; this.msg = m.msg;
      if (m.msg) this.hooks.note('🏃 校园跑', m.msg);
      this.syncHud(); if (this.isOpen) this.render();
      return;
    }
    if (m.t === 'run_end') {
      this.result = m.results; this.hooks.beep('finish');
      if (this.room) this.room = { ...this.room, phase: 'done' };
      this.syncHud(); this.root.classList.remove('hidden'); this.render();
      return;
    }
    // run_state
    this.offset = m.now - Date.now();
    const was = this.room?.phase;
    this.room = m; this.result = null;
    if (m.phase === 'count' && was !== 'count') { this.lastBeep = 99; this.close(); }
    if (m.phase === 'lobby') { this.mode = 'invite'; if (!this.isOpen && m.host === m.you) this.root.classList.remove('hidden'); }
    this.syncHud(); if (this.isOpen) this.render();
  }

  /** 每帧调用：倒计时的 3/2/1/GO 和比赛计时 */
  tick() {
    const r = this.room; if (!r) return;
    const left = r.startAt - this.now();
    if (r.phase === 'count') {
      const n = Math.ceil(left / 1000);
      if (n > 0 && n <= 3 && n !== this.lastBeep) { this.lastBeep = n; this.hooks.beep('count'); }
      this.big.textContent = n > 0 ? String(Math.min(3, n)) : 'GO!';
    } else if (r.phase === 'go') {
      if (this.lastBeep !== 0) { this.lastBeep = 0; this.hooks.beep('go'); this.big.textContent = 'GO!'; this.big.classList.remove('hidden'); setTimeout(() => this.big.classList.add('hidden'), 900); }
      this.updateHud();
    }
  }

  private syncHud() {
    const r = this.room, on = !!r && (r.phase === 'count' || r.phase === 'go');
    this.hud.classList.toggle('hidden', !on);
    this.big.classList.toggle('hidden', !(r && r.phase === 'count'));
    if (on) this.updateHud();
  }
  private updateHud() {
    const r = this.room; if (!r) return;
    const t = Math.max(0, this.now() - r.startAt), me = r.players.find((p) => p.uid === r.you);
    this.hud.replaceChildren();
    const lap = Math.min(RUN.LAPS, (me?.lap ?? 0) + 1);
    const top = el('div', 'run-top');
    top.append(el('span', 'run-lap', r.phase === 'count' ? '准备…' : `第 ${lap} / ${RUN.LAPS} 圈`), el('span', 'run-time', r.phase === 'count' ? '--' : (me?.ms !== undefined ? fmtTime(me.ms) : `${(t / 1000).toFixed(1)} s`)));
    const quit = el('button', 'btn', '放弃'); quit.type = 'button'; quit.addEventListener('click', () => this.net.runLeave()); top.append(quit);
    this.hud.append(top);
    if (r.players.length > 1) { // 多人：按进度排名
      const rank = [...r.players].sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || progressOf({ lap: b.lap, gate: b.gate }) - progressOf({ lap: a.lap, gate: a.gate }));
      rank.forEach((p, i) => { const line = el('div', 'run-rank' + (p.uid === r.you ? ' me' : ''), `${i + 1}. ${p.name}${p.ms !== undefined ? `　${fmtTime(p.ms)}` : `　${Math.min(RUN.LAPS, p.lap + 1)}/${RUN.LAPS} 圈`}`); this.hud.append(line); });
    }
  }

  // ------------------------------------------------------------ 面板
  private btn(label: string, fn: () => void, primary = false, disabled = false) { const b = el('button', 'btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.disabled = disabled; b.addEventListener('click', fn); return b; }

  private render() {
    this.body.replaceChildren();
    const head = el('div', 'board-head');
    const x = el('button', 'btn', '✕'); x.type = 'button'; x.setAttribute('aria-label', '关闭校园跑'); x.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '校园跑 · 东区田径场'), x);
    this.body.append(head);
    if (this.net.status !== 'online') { this.body.append(el('div', 'board-empty', '没连上服务器，连上后才能校园跑。')); return; }
    if (this.msg) this.body.append(el('div', 'board-msg bad', this.msg));
    if (this.result) { this.renderResult(); return; }
    if (this.room && this.room.phase === 'lobby') { this.renderLobby(this.room); return; }
    this.renderMenu();
  }

  private renderMenu() {
    const info = el('div', 'run-info');
    info.append(
      el('div', undefined, `沿着红色跑道按顺序跑 ${RUN.LAPS} 圈（约 ${LAP_M * RUN.LAPS} 米），成绩记在服务器上。`),
      el('div', 'run-stat', this.best ? `最好成绩 ${fmtTime(this.best)}　·　跑完 ${this.done} 次　·　和好友比赛拿过 ${this.wins} 次第一` : '你还没有跑完过，来一次吧。'),
      el('div', 'create-sub', '跑的时候不能骑车；中途离开田径场会放弃。和好友一起跑时，好友接受邀请后会被直接带到起跑线。'),
    );
    const row = el('div', 'create-btns');
    row.append(this.btn('单人计时跑', () => { this.msg = ''; this.net.runSolo(); }, true), this.btn('邀请好友一起跑', () => { this.msg = ''; this.net.runNew(); }), this.btn('关闭', () => this.close()));
    this.body.append(info, row);
  }

  private renderLobby(r: Extract<RunMsg, { t: 'run_state' }>) {
    const isHost = r.host === r.you;
    this.body.append(el('div', 'create-sub', `候场中：${r.players.length} / ${RUN.MAX_PLAYERS} 人。${isHost ? '邀请好友加入，大家到齐了点「开始比赛」。' : '等房主开始比赛。'}`));
    const list = el('div', 'friends-list');
    for (const p of r.players) { const row = el('div', 'friend-row static'); const mid = el('div', 'friend-mid'); mid.append(el('div', 'friend-name', `${p.name}${p.uid === r.host ? '（房主）' : ''}`)); row.append(mid); list.append(row); }
    this.body.append(list);
    if (isHost) {
      const online = this.hooks.friends().filter((f) => f.online && !r.players.some((p) => p.uid === f.uid));
      this.body.append(el('div', 'run-sub', '邀请在线的好友'));
      const fl = el('div', 'friends-list');
      if (!online.length) fl.append(el('div', 'board-empty', '现在没有在线的好友可以邀请。'));
      for (const f of online) { const row = el('div', 'friend-row static'); const mid = el('div', 'friend-mid'); mid.append(el('div', 'friend-name', f.name), el('div', 'friend-sub', `${f.college} · ${f.major}`)); const b = this.btn('邀请', () => { b.disabled = true; b.textContent = '已邀请'; this.net.runInvite(f.uid); }); row.append(mid, b); fl.append(row); }
      this.body.append(fl);
    }
    const row = el('div', 'create-btns');
    if (isHost) row.append(this.btn(r.players.length > 1 ? '开始比赛' : '一个人开跑', () => this.net.runStart(), true));
    row.append(this.btn('退出', () => { this.net.runLeave(); this.room = null; this.close(); }));
    this.body.append(row);
  }

  private renderResult() {
    const res = this.result!, me = this.room?.you;
    this.body.append(el('div', 'create-sub', res.length > 1 ? '比赛结束，成绩如下：' : '你跑完了！'));
    const list = el('div', 'friends-list');
    res.forEach((p, i) => { const row = el('div', 'friend-row static' + (p.uid === me ? ' run-me' : '')); const mid = el('div', 'friend-mid'); mid.append(el('div', 'friend-name', `${p.ms !== undefined ? i + 1 : '—'}. ${p.name}`), el('div', 'friend-sub', p.ms !== undefined ? fmtTime(p.ms) : '没有跑完')); row.append(mid); list.append(row); });
    this.body.append(list);
    if (this.best) this.body.append(el('div', 'run-stat', `你的最好成绩：${fmtTime(this.best)}`));
    const row = el('div', 'create-btns'); row.append(this.btn('关闭', () => this.close(), true)); this.body.append(row);
  }

  /** 收到好友邀请：屏幕上方一条小提示，60 秒内可以接受 */
  private toast(m: Extract<RunMsg, { t: 'run_invite' }>) {
    this.hooks.beep('invite');
    const t = el('div', 'box run-toast'); t.append(el('span', undefined, `🏃 ${m.name} 邀请你一起校园跑`));
    const gone = () => t.remove();
    t.append(this.btn('加入', () => { this.net.runAccept(m.rid); gone(); }, true), this.btn('拒绝', () => { this.net.runDecline(m.rid); gone(); }));
    this.toastBox.append(t);
    setTimeout(gone, RUN.INVITE_MS);
  }
}
export type { RunPhase };
