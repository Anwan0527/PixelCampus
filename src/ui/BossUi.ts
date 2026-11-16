import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { BossEvent } from '@/shared/boss';
import { CONTENT, monArt, speciesOf } from '@/shared/mons-content';
import { elementName } from '@/shared/mons';
import { itemDef } from '@/shared/items';
import { moveView, stageLog, statusLog, hpText, learnLogText } from './monBattleHelpers';
import { sfx } from '@/audio/sfx';

type Inv = Extract<ServerMsg, { t: 'boss_invite' }>;
type St = Extract<ServerMsg, { t: 'boss_state' }>;
type End = Extract<ServerMsg, { t: 'boss_end' }>;
type P = St['players'][number];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const COLOR = new Map(CONTENT.elements.elements.map((e) => [e.id, e.color]));
const badge = (id: string) => { const b = el('span', 'mon-type', elementName(CONTENT.elements, id)); b.style.background = COLOR.get(id) ?? '#aaa'; return b; };
const monName = (sp: string) => speciesOf(sp)?.name ?? sp;
const bar = (frac: number, cls = 'hp') => {
  const b = el('div', `mon-bar ${cls}`), f = el('div', 'mon-bar-fill');
  f.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  f.style.background = frac < 0.25 ? '#c0392b' : frac < 0.5 ? '#e0a020' : '#6aa84f';
  b.append(f); return b;
};

/**
 * 世界 BOSS 界面：邀请条 + 战斗全屏（BOSS 卡片 + 队友列表）。
 * 所有结算在服务器：这里只发行动，按 `boss_state.ev` 播放。
 * 玩家可见文字一律 `textContent`。
 */
export class BossUi {
  private root = el('div', 'screen battle hidden');
  private prompt = el('div', 'mon-enc hidden');
  private bossCard = el('div', 'bt-card foe boss-card');
  private bossImg = el('img', 'bt-img foe');
  private log = el('div', 'bt-log');
  private team = el('div', 'boss-team');
  private menu = el('div', 'bt-menu');
  private st: St | null = null;
  private busy = false;
  private mode: 'main' | 'moves' | 'swap' = 'main';
  private promptTimer = 0;
  private wrap = el('div', 'boss-wrap');
  /** 本地记一下当前在场（boss_state 里没有自己 = 已退出） */
  onOpen: (() => void) | null = null;

  constructor(private net: NetClient) {
    const stage = el('div', 'boss-arena');
    stage.append(this.bossImg, this.bossCard);
    this.wrap.append(stage, this.team);
    const panel = el('div', 'box bt boss-box'); panel.append(this.wrap, this.log, this.menu);
    this.root.append(panel);
    (document.getElementById('hud') ?? document.body).append(this.root, this.prompt);
    this.bossImg.draggable = false; this.bossImg.alt = '';
    net.handlers.bossInvite = (m) => this.onInvite(m);
    net.handlers.bossState = (m) => void this.onState(m);
    net.handlers.bossEnd = (m) => this.onEnd(m);
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  // ------------------------------------------------------------ 邀请
  private onInvite(m: Inv) {
    sfx('notify');
    this.prompt.replaceChildren();
    const text = el('div', 'mon-enc-text');
    text.append(el('div', 'mon-name', '世界 BOSS'), el('div', 'mon-sub', `${m.name} 邀请你一起挑战精工湖·青鳞！`));
    const yes = el('button', 'btn primary', '一起去'); yes.type = 'button';
    yes.addEventListener('click', () => { this.net.bossReply(m.uid, true); this.hidePrompt(); });
    const no = el('button', 'btn', '不去'); no.type = 'button';
    no.addEventListener('click', () => { this.net.bossReply(m.uid, false); this.hidePrompt(); });
    const t = el('div', 'mon-enc-timer'); t.style.animationDuration = `${m.ms}ms`;
    const row = el('div', 'mon-enc-row'); row.append(text, yes, no);
    this.prompt.append(row, t); this.prompt.classList.remove('hidden');
    window.clearTimeout(this.promptTimer);
    this.promptTimer = window.setTimeout(() => this.hidePrompt(), m.ms);
  }
  private hidePrompt() { window.clearTimeout(this.promptTimer); this.prompt.classList.add('hidden'); }

  // ------------------------------------------------------------ 状态
  private async onState(m: St) {
    const mine = m.players.find((p) => p.uid === this.net.selfUid);
    if (!mine) { this.close(false); return; } // 我已经不在这一场里了（被踢 / 退出）
    const fresh = !this.st || this.st.bid !== m.bid;
    if (fresh) {
      this.st = m; this.busy = false; this.mode = 'main';
      this.root.classList.remove('hidden'); this.onOpen?.();
      this.log.replaceChildren();
      this.say(`挑战开始！${m.boss.name} 出现了！`);
      this.renderAll(); return;
    }
    // 有新回放：先按事件播放，再落到新状态
    if (m.ev.length) {
      this.busy = true; this.renderMenu();
      await this.play(m, m.ev);
      if (this.st?.bid !== m.bid) return; // 播放期间对方结束 / 换场
    }
    this.st = m; this.busy = false; this.mode = 'main';
    this.renderAll();
  }

  private onEnd(m: End) {
    sfx(m.result === 'win' ? 'achieve' : 'fail');
    this.say(m.result === 'win' ? `挑战成功！${m.msg}` : m.result === 'lose' ? `挑战失败……${m.msg}` : m.msg || '你离开了挑战。');
    if (m.reward) this.say(`获得 ${m.reward.coins} 校园币、${itemNames(m.reward.items)}`);
    if (this.st) { this.st = { ...this.st, phase: 'over' }; this.renderAll(); }
    this.busy = false;
  }

  private say(text: string) {
    if (!text) return;
    this.log.append(el('div', undefined, text));
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** 谁被打中 / 谁的精灵：靠事件里的 uid（服务器填） */
  private who(uid: number | undefined): { name: string; mon?: P['squad'][number] } {
    const p = this.st?.players.find((x) => x.uid === uid);
    if (!p) return { name: '队友' };
    return { name: p.name, mon: p.squad[p.lead] };
  }

  private async play(m: St, ev: BossEvent[]) {
    const bossName = m.boss.name;
    const foe = (uid?: number) => {
      const w = this.who(uid);
      return w.mon ? `${w.name} 的 ${monName(w.mon.sp)}` : w.name;
    };
    for (const e of ev) {
      switch (e.t) {
        case 'use':
          this.say(e.side === 'me' ? `${foe(e.uid)} 使出了${CONTENT.moves.get(e.move)?.name ?? e.move}！` : `${bossName} 使出了${CONTENT.moves.get(e.move)?.name ?? e.move}！`);
          await sleep(340); break;
        case 'miss': this.say(e.side === 'me' ? '没有打中！' : `${bossName} 的攻击落空了！`); await sleep(320); break;
        case 'hit': {
          this.renderAll();
          const note = e.dmg === 0 ? '完全没有效果……' : `${e.mult >= 2 ? '克制！' : ''}${e.mult > 0 && e.mult < 1 ? '削弱……' : ''}${e.crit ? '击中要害！' : ''}`;
          if (note) this.say(note);
          await sleep(340); break;
        }
        case 'faint': this.say(`${foe(e.uid)} 倒下了！`); this.renderAll(); await sleep(480); break;
        case 'swap': this.say(`${this.who(e.uid).name} 换上了 ${monName(this.who(e.uid).mon?.sp ?? '')}`); this.renderAll(); await sleep(340); break;
        case 'blocked': this.say(statusLog(foe(e.uid), e.k, 'blocked')); await sleep(360); break;
        case 'stage': this.say(stageLog(e.side === 'foe' ? bossName : foe(e.uid), e.k, e.d)); this.renderAll(); await sleep(320); break;
        case 'status': this.say(statusLog(e.side === 'foe' ? bossName : foe(e.uid), e.k, 'apply')); this.renderAll(); await sleep(320); break;
        case 'statusdmg': this.say(statusLog(e.side === 'foe' ? bossName : foe(e.uid), e.k, 'dmg')); this.renderAll(); await sleep(320); break;
        case 'statusend': this.say(statusLog(e.side === 'foe' ? bossName : foe(e.uid), e.k, 'end')); this.renderAll(); await sleep(320); break;
        case 'heal': this.say(`${foe(e.uid)} 回复了 ${e.gain} 点生命`); this.renderAll(); await sleep(320); break;
        case 'guard': this.say(`${foe(e.uid)} 守住了！`); await sleep(300); break;
        case 'guardfail': this.say(`${foe(e.uid)} 没能守住……`); await sleep(300); break;
        case 'escape': this.say(`${this.who(e.uid).name} 离开了战斗`); await sleep(320); break;
        case 'bossphase':
          this.say(`—— ${bossName} 进入了${e.label}！攻击提升了 ——`);
          sfx('achieve'); this.renderAll(); await sleep(900); break;
        case 'learn': this.say(learnLogText(bossName, CONTENT.moves.get(e.move)?.name ?? e.move, e.full)); await sleep(300); break;
        default: break;
      }
    }
  }

  private renderAll() { this.renderBoss(); this.renderTeam(); this.renderMenu(); }

  private renderBoss() {
    const m = this.st; if (!m) return;
    const sp = speciesOf(m.boss.sp);
    this.bossImg.src = monArt(m.boss.sp, 'front');
    const types = el('div', 'mon-types'); types.append(...(sp?.types ?? []).map(badge));
    const stage = m.boss.stage ? `第 ${m.boss.stage + 1} 阶段` : '第 1 阶段';
    const frac = m.boss.hp / Math.max(1, m.boss.max);
    this.bossCard.replaceChildren(
      el('div', 'mon-name', `${m.boss.name}  Lv.${m.boss.lv}`),
      bar(frac),
      el('div', 'mon-sub', `${hpText(m.boss.hp, m.boss.max)}　·　${stage}`),
      types,
    );
    this.bossCard.classList.toggle('phase2', m.boss.stage === 1);
    this.bossCard.classList.toggle('phase3', m.boss.stage >= 2);
  }

  private renderTeam() {
    const m = this.st; if (!m) return;
    this.team.replaceChildren();
    for (const p of m.players) {
      const card = el('div', 'boss-p' + (p.down ? ' down' : '') + (p.ready && !p.down ? ' ready' : '') + (p.uid === this.net.selfUid ? ' me' : ''));
      const head = el('div', 'boss-p-name', p.name + (p.uid === this.net.selfUid ? '（我）' : ''));
      if (p.down) head.append(el('span', 'boss-p-tag down-tag', ' 倒下'));
      else if (p.ready) head.append(el('span', 'boss-p-tag', ' 已出招'));
      const squad = el('div', 'boss-p-squad');
      p.squad.forEach((s, i) => {
        const row = el('div', 'boss-p-mon' + (i === p.lead && !p.down ? ' on' : '') + (s.hp <= 0 ? ' out' : ''));
        const types = speciesOf(s.sp)?.types ?? [];
        row.append(
          el('span', 'boss-p-n', monName(s.sp)),
          el('span', 'boss-p-hp', hpText(s.hp, s.max)),
          (() => { const ts = el('span', 'boss-p-t'); ts.append(...types.map(badge)); return ts; })(),
        );
        squad.append(row);
      });
      card.append(head, squad);
      this.team.append(card);
    }
  }

  private btn(label: string, run: () => void, cls = 'btn') {
    const b = el('button', cls, label); b.type = 'button';
    b.addEventListener('click', run); b.disabled = this.busy; return b;
  }

  private act(a: { t: 'move'; i: number } | { t: 'swap'; i: number }) {
    if (!this.st || this.busy) return;
    this.busy = true; this.renderMenu();
    this.net.bossAct(this.st.bid, this.st.turn, a);
    // 服务器迟迟不回（断线 / 超时）：8 秒后放开按钮，免得卡死
    window.setTimeout(() => { if (this.busy && this.isOpen) { this.busy = false; this.renderMenu(); } }, 8000);
  }

  private renderMenu() {
    this.menu.replaceChildren();
    const m = this.st; if (!m) return;
    const me = m.players.find((p) => p.uid === this.net.selfUid);
    if (!me) { this.menu.append(this.btn('关闭', () => this.close(), 'btn primary')); return; }
    if (m.phase === 'over') { this.menu.append(this.btn('离开', () => this.close(), 'btn primary')); return; }
    if (me.down) { this.menu.append(el('div', 'mon-sub', '你的精灵都倒下了，等队友打完吧')); return; }
    if (m.phase === 'choose' && me.ready && !this.busy) {
      this.menu.append(el('div', 'mon-sub', '这一回合已经出招，等队友……'));
      return;
    }
    if (this.mode === 'main') {
      const fight = this.btn('战斗', () => { this.mode = 'moves'; this.renderMenu(); }, 'btn primary');
      const swap = this.btn('换精灵', () => { this.mode = 'swap'; this.renderMenu(); });
      swap.disabled = this.busy || me.squad.filter((x, i) => i !== me.lead && x.hp > 0).length === 0;
      this.menu.append(fight, swap);
    } else if (this.mode === 'moves') {
      const mon = me.squad[me.lead];
      const bossTypes = speciesOf(m.boss.sp)?.types ?? [];
      const mvs = mon?.mv ?? [];
      if (!mon) { this.menu.append(this.btn('返回', () => { this.mode = 'main'; this.renderMenu(); })); return; }
      mvs.forEach((x, idx) => {
        const d = CONTENT.moves.get(x.id); if (!d) return;
        const v = moveView(CONTENT, d, x.pp, bossTypes);
        const b = el('button', 'btn bt-move'); b.type = 'button';
        b.append(badge(d.type), el('span', 'mon-mname', v.name), el('span', 'bt-mmeta', `${v.cat} 威力${v.power || '—'} 命中${v.acc}%  PP ${v.pp}/${v.maxPp}`));
        if (v.desc) b.append(el('span', 'bt-mmove-desc', v.desc));
        if (v.effect) b.append(el('span', 'bt-eff', v.effect));
        b.disabled = this.busy || (x.pp <= 0 && mvs.some((y) => y.pp > 0));
        b.addEventListener('click', () => this.act({ t: 'move', i: idx }));
        this.menu.append(b);
      });
      this.menu.append(this.btn('返回', () => { this.mode = 'main'; this.renderMenu(); }));
    } else {
      me.squad.forEach((x, i) => {
        const b = this.btn(`${monName(x.sp)} Lv.${x.lv}  ${hpText(x.hp, x.max)}`, () => this.act({ t: 'swap', i }), 'btn bt-move');
        b.disabled = this.busy || x.hp <= 0 || i === me.lead; this.menu.append(b);
      });
      this.menu.append(this.btn('返回', () => { this.mode = 'main'; this.renderMenu(); }));
    }
  }

  /** 关掉界面（默认告诉服务器我走了）；服务器已经判我出局时用 close(false) */
  close(tellServer = true) {
    this.root.classList.add('hidden');
    const had = !!this.st;
    this.st = null; this.busy = false; this.mode = 'main';
    if (tellServer && had) this.net.bossLeave();
  }
}

/** 奖励里的道具名（找不到定义就显示 id） */
function itemNames(items: { id: string; n: number }[] | undefined): string {
  if (!items?.length) return '';
  return items.map((it) => `${itemDef(it.id)?.name ?? it.id} ×${it.n}`).join('、');
}
