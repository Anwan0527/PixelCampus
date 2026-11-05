import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { BEvent } from '@/shared/battle';
import { CONTENT, monArt, speciesOf } from '@/shared/mons-content';
import { elementName, maxHp, type Mon } from '@/shared/mons';
import { isCatSpecies } from '@/shared/cat-mons';
import { sfx, type SfxName } from '@/audio/sfx';

type Bt = Extract<ServerMsg, { t: 'mon_bt' }>;
type Enc = Extract<ServerMsg, { t: 'mon_enc' }>;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const nameOf = (m: { sp: string; nick?: string }) => m.nick || speciesOf(m.sp)?.name || '未知精灵';
const COLOR = new Map(CONTENT.elements.elements.map((e) => [e.id, e.color]));
const badge = (id: string) => { const b = el('span', 'mon-type', elementName(CONTENT.elements, id)); b.style.background = COLOR.get(id) ?? '#aaa'; return b; };
const bar = (frac: number) => { const b = el('div', 'mon-bar hp'), f = el('div', 'mon-bar-fill'); f.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; if (frac < 0.25) f.style.background = '#c0392b'; else if (frac < 0.5) f.style.background = '#e0a020'; else f.style.background = '#6aa84f'; b.append(f); return b; };

/** 显示用的状态：事件播放时一点点更新，播完再和服务器的权威状态对齐 */
interface View { lead: number; hp: number[]; foeHp: number; foeMax: number }

/**
 * 战斗界面（全屏）：对手在右上、我方在左下；底下是文字和按钮（战斗 / 零食包 / 换精灵 / 逃跑）。
 * 所有结算都在服务器：这里只发"想做什么"，服务器回来的是结算后的状态 + 这一回合的事件，界面按事件播放动画和文字，
 * 播完再和权威状态对齐。播放期间按钮不可用。战斗没结束不能关（只能逃跑），结束后点「离开」。
 */
export class BattleUi {
  private root = el('div', 'screen battle hidden');
  private foeCard = el('div', 'bt-card foe');
  private meCard = el('div', 'bt-card me');
  private foeImg = el('img', 'bt-img foe');
  private meImg = el('img', 'bt-img me');
  private log = el('div', 'bt-log');
  private menu = el('div', 'bt-menu');
  private bt: Bt | null = null;
  private view: View = { lead: 0, hp: [], foeHp: 1, foeMax: 1 };
  private mode: 'main' | 'moves' | 'swap' = 'main';
  private busy = false;
  private prompt = el('div', 'mon-enc hidden');
  private banner = el('div', 'bt-banner hidden');
  /** 战斗开始时调用（场景用来收起和小猫互动的面板） */
  onOpen: (() => void) | null = null;
  private promptTimer = 0;

  constructor(private net: NetClient) {
    const stage = el('div', 'bt-stage'); stage.append(this.foeCard, this.foeImg, this.meImg, this.meCard, this.banner);
    const panel = el('div', 'box bt'); panel.append(stage, this.log, this.menu);
    this.root.append(panel);
    (document.getElementById('hud') ?? document.body).append(this.root, this.prompt);
    for (const i of [this.foeImg, this.meImg]) { i.draggable = false; i.alt = ''; }
    net.handlers.monEnc = (m) => this.onEnc(m);
    net.handlers.monEncEnd = () => this.hidePrompt();
    net.handlers.monBt = (m) => void this.onBt(m);
    const prev = net.handlers.monResult;
    net.handlers.monResult = (ok, msg) => { prev?.(ok, msg); if (this.isOpen && !ok) { this.busy = false; this.say(msg); this.renderMenu(); } };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  /** 战斗中或有待答复的遭遇提示（场景用来决定是否还能互动） */
  get active() { return this.isOpen; }

  // ------------------------------------------------------------ 遭遇提示条（可以拒绝，不打断探索）
  private onEnc(m: Enc) {
    sfx('notify');
    this.prompt.replaceChildren();
    const sp = speciesOf(m.sp);
    const img = el('img', 'mon-img'); img.src = monArt(m.sp, 'front', !!m.sh); img.alt = '';
    const text = el('div', 'mon-enc-text'); text.append(el('div', 'mon-name', `草丛里有动静！`), el('div', 'mon-sub', `${m.zone}：野生的 ${sp?.name ?? m.sp} Lv.${m.lv}${m.sh ? ' ★异色' : ''}`));
    const go = el('button', 'btn primary', '迎战'); go.type = 'button'; go.addEventListener('click', () => { this.net.monGo(true); this.hidePrompt(); });
    const no = el('button', 'btn', '走开'); no.type = 'button'; no.addEventListener('click', () => { this.net.monGo(false); this.hidePrompt(); });
    const t = el('div', 'mon-enc-timer'); t.style.animationDuration = `${m.ms}ms`;
    const row = el('div', 'mon-enc-row'); row.append(img, text, go, no);
    this.prompt.append(row, t); this.prompt.classList.remove('hidden');
    window.clearTimeout(this.promptTimer); this.promptTimer = window.setTimeout(() => this.hidePrompt(), m.ms);
  }
  private hidePrompt() { window.clearTimeout(this.promptTimer); this.prompt.classList.add('hidden'); }

  // ------------------------------------------------------------ 战斗
  private async onBt(m: Bt) {
    const fresh = !this.bt || this.bt.bid !== m.bid;
    if (fresh) {
      this.hidePrompt(); this.bt = m; this.busy = false; this.mode = 'main';
      this.root.classList.remove('hidden'); this.onOpen?.();
      this.view = this.viewOf(m); this.log.replaceChildren();
      this.say(m.cat ? `${m.cat.name} 想和你切磋一下！（${m.zone}）` : `野生的 ${speciesOf(m.foe.sp)?.name ?? m.foe.sp} 出现了！`);
      this.renderStage(); this.renderMenu();
      // 两只猫对战：打出「老吴对战」的横幅
      if (m.cat && m.sq[m.lead] && isCatSpecies(m.sq[m.lead].sp) && isCatSpecies(m.foe.sp)) { sfx('achieve'); this.banner.textContent = '老吴对战'; this.banner.classList.remove('hidden'); this.banner.style.animation = 'none'; void this.banner.offsetWidth; this.banner.style.animation = ''; window.setTimeout(() => this.banner.classList.add('hidden'), 2200); }
      return;
    }
    this.busy = true; this.renderMenu();
    await this.play(m);
    this.bt = m; this.view = this.viewOf(m); this.busy = false; this.mode = 'main';
    this.renderStage();
    if (m.phase === 'over') this.say(m.result === 'win' ? '战斗胜利！' : m.result === 'caught' ? '收服成功！' : m.result === 'fled' ? '成功脱离了战斗。' : m.cat ? '你的精灵都倒下了……友谊赛到此为止，下次再来切磋！' : '你的精灵全部倒下了……眼前一黑，你回到了校门口。');
    this.renderMenu();
  }
  private viewOf(m: Bt): View { return { lead: m.lead, hp: m.sq.map((x) => x.hp), foeHp: m.foe.hp, foeMax: m.foe.max }; }
  private lead(m = this.bt): Mon | undefined { return m?.sq[this.view.lead]; }
  private say(text: string) { this.log.append(el('div', undefined, text)); this.log.scrollTop = this.log.scrollHeight; }

  /** 按事件播放：每个事件改一点显示状态 + 一句话 + 一小段动画 */
  private async play(m: Bt) {
    const bt0 = this.bt!; const mons = m.sq;
    const myName = () => nameOf(mons[this.view.lead] ?? bt0.sq[this.view.lead]);
    const foeName = () => m.cat?.name ?? speciesOf(m.foe.sp)?.name ?? m.foe.sp;
    const who = (s: 'me' | 'foe') => (s === 'me' ? myName() : m.cat ? foeName() : `野生的${foeName()}`);
    const anim = async (img: HTMLElement, cls: string, ms: number) => { img.classList.remove(cls); void img.offsetWidth; img.classList.add(cls); await sleep(ms); img.classList.remove(cls); };
    const snd = (n: SfxName) => sfx(n);
    for (const e of m.ev as BEvent[]) {
      switch (e.t) {
        case 'use': this.say(`${who(e.side)}使用了${CONTENT.moves.get(e.move)?.name ?? (e.move === 'struggle' ? '挣扎' : e.move)}！`); await anim(e.side === 'me' ? this.meImg : this.foeImg, e.side === 'me' ? 'lunge-me' : 'lunge-foe', 380); break;
        case 'miss': this.say('没有打中！'); snd('fail'); await sleep(450); break;
        case 'hit': {
          if (e.side === 'foe') this.view.foeHp = e.hp; else this.view.hp[this.view.lead] = e.hp;
          this.renderStage(); snd('click');
          const note = e.dmg === 0 ? '完全没有效果……' : `${e.mult >= 2 ? '效果拔群！' : ''}${e.mult > 0 && e.mult < 1 ? '效果不太好……' : ''}${e.crit ? '击中要害！' : ''}`;
          if (note) this.say(note);
          await anim(e.side === 'foe' ? this.foeImg : this.meImg, 'hit', 420); break;
        }
        case 'faint': this.say(`${e.side === 'me' ? myName() : who('foe')}倒下了！`); await anim(e.side === 'foe' ? this.foeImg : this.meImg, 'faint', 700); this.renderStage(); break;
        case 'swap': this.view.lead = e.i; this.say(`去吧，${nameOf(mons[e.i])}！`); this.renderStage(); await anim(this.meImg, 'slide-in', 450); break;
        case 'throw': this.say('扔出了一包零食！'); snd('cast'); await anim(this.foeImg, 'lunge-me', 420); break;
        case 'shake': this.say(e.n > 0 ? `零食包晃了 ${e.n} 下……` : '对方还在犹豫……'); for (let i = 0; i < Math.max(1, e.n); i++) await anim(this.foeImg, 'wobble', 420); break;
        case 'caught': this.say(`收服了 ${foeName()}！`); snd('catch'); await anim(this.foeImg, 'caught', 700); break;
        case 'break': this.say('它挣脱了！'); snd('fail'); await sleep(350); break;
        case 'escape': this.say('成功逃走了！'); await sleep(400); break;
        case 'stuck': this.say('没能逃掉！'); await sleep(400); break;
        case 'xp': this.say(`${nameOf(mons[e.i])} 获得了 ${e.gain} 点经验`); await sleep(450); break;
        case 'level': this.say(`${nameOf(mons[e.i])} 升到了 Lv.${e.lv}！`); snd('achieve'); await sleep(600); break;
        case 'evolve': { const from = nameOf(bt0.sq[e.i] ?? { sp: e.to }); this.say(`咦？${from} 的样子发生了变化！`); await anim(this.meImg, 'evolve', 1100); this.say(`${from} 进化成了 ${speciesOf(e.to)?.name ?? e.to}！`); snd('achieve'); if (e.i === this.view.lead) this.meImg.src = monArt(e.to, 'back', !!bt0.sq[e.i]?.sh); await sleep(700); break; }
        case 'learn': this.say(e.full ? `${nameOf(mons[e.i])} 想学会 ${CONTENT.moves.get(e.move)?.name}，但技能已经满了……` : `${nameOf(mons[e.i])} 学会了 ${CONTENT.moves.get(e.move)?.name}！`); await sleep(550); break;
      }
    }
  }

  private renderStage() {
    const m = this.bt; if (!m) return;
    const foeSp = speciesOf(m.foe.sp), me = this.lead(m);
    this.foeImg.src = monArt(m.foe.sp, 'front', !!m.foe.sh);
    this.foeCard.replaceChildren(el('div', 'mon-name', `${m.cat ? `${m.cat.name}（${foeSp?.name ?? m.foe.sp}）` : foeSp?.name ?? m.foe.sp}  Lv.${m.foe.lv}`), bar(this.view.foeHp / Math.max(1, this.view.foeMax)), el('div', 'mon-types'));
    this.foeCard.lastElementChild!.append(...(foeSp?.types ?? []).map(badge));
    if (me) {
      this.meImg.src = monArt(me.sp, 'back', !!me.sh);
      const max = maxHp(CONTENT, me), hp = this.view.hp[this.view.lead] ?? me.hp;
      this.meCard.replaceChildren(el('div', 'mon-name', `${nameOf(me)}  Lv.${me.lv}`), bar(hp / Math.max(1, max)), el('div', 'mon-sub', `${hp}/${max}`));
    }
  }

  private btn(label: string, run: () => void, cls = 'btn') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); b.disabled = this.busy; return b; }
  private act(a: Parameters<NetClient['monAct']>[2]) { if (!this.bt || this.busy) return; this.busy = true; this.renderMenu(); this.net.monAct(this.bt.bid, this.bt.turn, a); window.setTimeout(() => { if (this.busy && this.isOpen && this.bt?.phase !== 'over') { this.busy = false; this.renderMenu(); } }, 8000); }

  private renderMenu() {
    this.menu.replaceChildren();
    const m = this.bt; if (!m) return;
    if (m.phase === 'over') { this.menu.append(this.btn('离开', () => this.close(), 'btn primary')); return; }
    const forced = m.phase === 'swap';
    const mode = forced ? 'swap' : this.mode;
    if (mode === 'main') {
      this.menu.append(
        this.btn('战斗', () => { this.mode = 'moves'; this.renderMenu(); }, 'btn primary'),
        this.btn(`零食包 ×${m.ball}`, () => this.act({ t: 'ball' })), this.btn('换精灵', () => { this.mode = 'swap'; this.renderMenu(); }), this.btn('逃跑', () => this.act({ t: 'run' })),
      );
      (this.menu.children[1] as HTMLButtonElement).disabled = this.busy || m.ball <= 0;
      (this.menu.children[2] as HTMLButtonElement).disabled = this.busy || m.sq.filter((x, i) => i !== this.view.lead && x.hp > 0).length === 0;
    } else if (mode === 'moves') {
      const me = this.lead(m)!;
      me.mv.forEach((x, i) => {
        const d = CONTENT.moves.get(x.id); if (!d) return;
        const b = this.btn(`${d.name}  PP ${x.pp}/${d.pp}`, () => this.act({ t: 'move', i }), 'btn bt-move'); b.style.borderColor = COLOR.get(d.type) ?? '';
        b.disabled = this.busy || (x.pp <= 0 && me.mv.some((y) => y.pp > 0)); this.menu.append(b);
      });
      this.menu.append(this.btn('返回', () => { this.mode = 'main'; this.renderMenu(); }));
    } else {
      if (forced) this.menu.append(el('div', 'mon-sub', '你的精灵倒下了，换一只上场：'));
      m.sq.forEach((x, i) => {
        const hp = x.hp, max = maxHp(CONTENT, x);
        const b = this.btn(`${nameOf(x)} Lv.${x.lv}  ${hp}/${max}`, () => this.act({ t: 'swap', i }), 'btn bt-move');
        b.disabled = this.busy || hp <= 0 || i === m.lead; this.menu.append(b);
      });
      if (!forced) this.menu.append(this.btn('返回', () => { this.mode = 'main'; this.renderMenu(); }));
    }
  }

  close() { this.root.classList.add('hidden'); this.bt = null; this.busy = false; }
}
