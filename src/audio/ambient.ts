import { audio } from './engine';

/**
 * 天气环境音：雨声 / 风雪声，都是循环的噪声经过滤波得到，音量随天气强度渐变。
 * 走音效音量（SoundPanel 里的"音效"滑块）；浏览器没唤醒音频之前什么都不做。
 */
class Ambient {
  private rainG?: GainNode; private windG?: GainNode;
  private started = false;
  private level = { rain: 0, wind: 0 };

  private start(ctx: AudioContext) {
    if (this.started) return;
    this.started = true;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const loop = (filter: BiquadFilterNode, q: number, freq: number, type: BiquadFilterType) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filter); filter.connect(g); g.connect(audio.sfxBus); src.start();
      return g;
    };
    this.rainG = loop(ctx.createBiquadFilter(), 0.6, 3200, 'bandpass'); // 沙沙的雨声
    this.windG = loop(ctx.createBiquadFilter(), 0.9, 420, 'lowpass');   // 低沉的风声（雪天）
    this.apply();
  }
  private apply() {
    const ctx = audio.ctx; if (!ctx || !this.rainG || !this.windG) return;
    const t = ctx.currentTime;
    this.rainG.gain.setTargetAtTime(this.level.rain * 0.16, t, 0.8);
    this.windG.gain.setTargetAtTime(this.level.wind * 0.1, t, 1.2);
  }
  /** 每秒调用一次：雨量/雪量 0~1 */
  set(rain: number, snow: number) {
    this.level = { rain, wind: snow * 0.8 + rain * 0.25 };
    if (!audio.ready) return;
    if (!this.started && audio.ctx) this.start(audio.ctx);
    this.apply();
  }
}
export const ambient = new Ambient();
