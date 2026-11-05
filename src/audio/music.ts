import { audio } from './engine';
import { barSeconds, composeBar, midiHz, type Mood, type Note } from './compose';

/**
 * 背景音乐：按"小节"往前排程（始终提前 ~0.8 秒把音符交给 WebAudio），心情（白天/夜晚）下一小节生效。
 * 三个声部：柔和的拨弦旋律、慢起慢落的铺底、低音；白天偶尔有几声鸟叫。全程现场合成。
 */
export class Music {
  private mood: Mood = 'day';
  private timer = 0; private birdTimer = 0;
  private nextAt = 0; private bar = 0; private lead = -1;
  private running = false;

  setMood(m: Mood) { this.mood = m; }

  start() {
    if (this.running) return;
    this.running = true;
    audio.onReady((ctx) => {
      if (!this.running) return;
      this.nextAt = ctx.currentTime + 0.4;
      this.timer = window.setInterval(() => this.pump(ctx), 200);
      this.scheduleBird(ctx);
    });
  }
  stop() { this.running = false; window.clearInterval(this.timer); window.clearTimeout(this.birdTimer); }

  private pump(ctx: AudioContext) {
    if (ctx.state !== 'running') { this.nextAt = Math.max(this.nextAt, ctx.currentTime + 0.2); return; }
    while (this.nextAt < ctx.currentTime + 0.8) {
      const { notes, lastLead } = composeBar(Math.random, this.mood, this.bar++, this.lead);
      this.lead = lastLead;
      const beat = barSeconds(this.mood) / 4;
      for (const n of notes) this.voice(ctx, n, this.nextAt + n.at * beat, n.dur * beat);
      this.nextAt += barSeconds(this.mood);
    }
  }

  private voice(ctx: AudioContext, n: Note, t: number, dur: number) {
    const g = ctx.createGain(), hz = midiHz(n.midi);
    const o = ctx.createOscillator();
    let stop = t + dur + 0.6;
    if (n.voice === 'lead') { // 拨弦：三角波 + 快速衰减 + 低通，送一点混响
      o.type = 'triangle'; o.frequency.value = hz;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const peak = 0.16 * n.vel;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur + 0.5, 1.8));
      o.connect(lp); lp.connect(g); g.connect(audio.musicBus); g.connect(audio.reverb);
      stop = t + Math.min(dur + 0.5, 1.8) + 0.05;
    } else if (n.voice === 'pad') { // 铺底：两个略微失谐的正弦，慢起慢落
      o.type = 'sine'; o.frequency.value = hz;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 1.0035; o2.connect(g);
      const peak = 0.05 * n.vel;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.7); g.gain.setValueAtTime(peak, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
      o.connect(g); g.connect(audio.musicBus); g.connect(audio.reverb);
      o2.start(t); o2.stop(t + dur + 1);
      stop = t + dur + 1;
    } else { // 低音
      o.type = 'sine'; o.frequency.value = hz;
      const peak = 0.13 * n.vel;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audio.musicBus);
      stop = t + dur + 0.05;
    }
    o.start(t); o.stop(stop);
  }

  /** 白天偶尔几声鸟叫（频率上扫的短促正弦） */
  private scheduleBird(ctx: AudioContext) {
    this.birdTimer = window.setTimeout(() => {
      if (!this.running) return;
      if (this.mood === 'day' && ctx.state === 'running') {
        const base = 2400 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3), t0 = ctx.currentTime + 0.05;
        for (let i = 0; i < n; i++) {
          const t = t0 + i * 0.13, o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          o.connect(g); g.connect(audio.musicBus); o.start(t); o.stop(t + 0.1);
        }
      }
      this.scheduleBird(ctx);
    }, 7000 + Math.random() * 14000);
  }
}
export const music = new Music();
