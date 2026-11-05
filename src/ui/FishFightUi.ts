import { FightSim, type FightParams } from '@/shared/fishfight';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 拉鱼小游戏的界面（规则和模拟在 shared/fishfight.ts）：屏幕右侧一根竖直水柱，鱼在里面游，
 * 电脑按住空格让绿条上浮（松开下沉）、手机按住/连点右下角的大按钮；鱼待在绿条里，右边的进度条就涨，涨满钓到，掉光鱼跑。
 * 结束时通过 onEnd 把结果告诉场景（场景再告诉服务器）；界面要等服务器回话（钓到/跑了）后由场景 close()。
 */
export class FishFightUi {
  private root = el('div', 'ff hidden');
  private track = el('div', 'ff-track');
  private bar = el('div', 'ff-bar');
  private fishEl = el('div', 'ff-fish', '🐟');
  private crownEl = el('div', 'ff-crown', '👑');
  private prog = el('div', 'ff-prog');
  private progFill = el('div', 'ff-prog-fill');
  private tip = el('div', 'ff-tip');
  private btn = el('button', 'ff-btn', '按住上浮');
  private sim: FightSim | null = null;
  private onEnd: ((win: boolean, perfect: boolean) => void) | null = null;
  private held = false; private boost = 0;

  constructor() {
    this.btn.type = 'button';
    this.fishEl.append(this.crownEl); this.track.append(this.bar, this.fishEl); this.prog.append(this.progFill);
    const row = el('div', 'ff-row'); row.append(this.track, this.prog);
    this.root.append(el('div', 'ff-title', '拉！'), row, this.tip, this.btn);
    const down = (e: Event) => { e.preventDefault(); this.held = true; this.boost = 0.09; };
    const up = () => { this.held = false; };
    this.btn.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.btn.addEventListener(ev, up);
    (document.getElementById('hud') ?? document.body).append(this.root);
  }

  get active() { return this.sim !== null && !this.root.classList.contains('hidden'); }
  /** 界面是不是还开着（结束后等服务器回话的那一小会儿也算） */
  get open() { return !this.root.classList.contains('hidden'); }

  /** crown = 传说 / 神话鱼：头顶戴皇冠（鱼是什么还不告诉你，皇冠是个暗示） */
  start(p: FightParams, onEnd: (win: boolean, perfect: boolean) => void, crown = false) {
    this.crownEl.style.display = crown ? '' : 'none'; this.root.classList.toggle('crowned', crown);
    this.sim = new FightSim(p); this.onEnd = onEnd; this.held = false; this.boost = 0;
    this.root.classList.remove('hidden', 'won', 'lost');
    this.tip.textContent = document.body.classList.contains('touch') ? '按住下面的按钮上浮，松开下沉；让鱼待在绿条里' : '按住 空格 上浮，松开下沉；让鱼待在绿条里（Esc 放弃）';
    this.render();
  }
  /** 场景的"点一下"（手机的互动键）：当作按了一下 */
  tap() { this.boost = 0.09; }
  close() { this.sim = null; this.onEnd = null; this.held = false; this.root.classList.add('hidden'); }

  /** 每帧：keyHold = 空格是否按着 */
  update(dt: number) { this.updateWith(dt, false); }
  updateWith(dt: number, keyHold: boolean) {
    const s = this.sim; if (!s) return;
    this.boost = Math.max(0, this.boost - dt);
    const r = s.step(dt, keyHold || this.held || this.boost > 0);
    this.render();
    if (r) { // 结束：把结果交给场景，界面留在原地等服务器回话
      const cb = this.onEnd; this.onEnd = null; this.sim = null;
      this.root.classList.add(r === 'win' ? 'won' : 'lost'); this.tip.textContent = r === 'win' ? '拉上来了！' : '鱼挣脱了……';
      cb?.(r === 'win', r === 'win' && s.ratio >= 0.85);
    }
  }
  private render() {
    const s = this.sim ?? null; if (!s) return;
    this.bar.style.height = `${s.half * 200}%`; this.bar.style.bottom = `${(s.bar - s.half) * 100}%`;
    this.bar.classList.toggle('hit', s.hit);
    this.fishEl.style.bottom = `${s.fish * 100}%`;
    this.progFill.style.height = `${s.progress * 100}%`;
    this.progFill.style.background = s.progress > 0.66 ? '#5bc45a' : s.progress > 0.33 ? '#e8c43a' : '#e0583c';
  }
}
