/**
 * 音频引擎：全部声音都是 WebAudio 现场合成的（没有任何音频文件，也就没有版权和加载问题）。
 * 浏览器要求"用户操作之后"才能出声，所以 AudioContext 在第一次点击/按键时才创建。
 * 音量（背景音乐 / 音效）存在浏览器本地，界面见 ui/SoundPanel.ts。
 */
const KEY = 'pixelcampus.audio';
export interface Volumes { music: number; sfx: number }
const DEFAULTS: Volumes = { music: 0.35, sfx: 0.7 };

function loadVolumes(): Volumes {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Volumes> | null;
    const ok = (n: unknown, d: number) => (typeof n === 'number' && n >= 0 && n <= 1 ? n : d);
    return { music: ok(v?.music, DEFAULTS.music), sfx: ok(v?.sfx, DEFAULTS.sfx) };
  } catch { return { ...DEFAULTS }; }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  musicBus!: GainNode; sfxBus!: GainNode; reverb!: ConvolverNode;
  private vol = loadVolumes();
  private subs = new Set<() => void>();
  private hooks: ((ctx: AudioContext) => void)[] = [];

  get volumes(): Readonly<Volumes> { return this.vol; }
  /** 引擎可用（浏览器支持且已被用户操作唤醒）时才调用 f，否则静默跳过 */
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  /** 引擎首次创建好之后做点什么（背景音乐在这里启动） */
  onReady(f: (ctx: AudioContext) => void) { if (this.ctx) f(this.ctx); else this.hooks.push(f); }
  subscribe(f: () => void) { this.subs.add(f); return () => this.subs.delete(f); }

  setVolume(kind: keyof Volumes, v: number) {
    this.vol = { ...this.vol, [kind]: Math.max(0, Math.min(1, v)) };
    try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch { /* 存储不可用：仅本次有效 */ }
    this.apply(); for (const f of this.subs) f();
  }
  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  /** 在第一次用户操作时创建/唤醒（页面里到处调用都安全） */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        this.ctx = ctx;
        this.musicBus = ctx.createGain(); this.sfxBus = ctx.createGain();
        const master = ctx.createDynamicsCompressor(); // 轻微压限，防止叠音爆音
        this.musicBus.connect(master); this.sfxBus.connect(master); master.connect(ctx.destination);
        this.reverb = ctx.createConvolver(); this.reverb.buffer = impulse(ctx, 2.2, 2.6);
        const wet = ctx.createGain(); wet.gain.value = 0.28; this.reverb.connect(wet); wet.connect(this.musicBus);
        this.apply();
        for (const f of this.hooks.splice(0)) f(ctx);
        document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx.suspend(); else void ctx.resume(); });
      }
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
    } catch { /* 不支持/被拦截：游戏照常，只是没有声音 */ }
  }
}

/** 生成混响用的冲激响应：指数衰减的白噪声 */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return buf;
}

export const audio = new AudioEngine();
