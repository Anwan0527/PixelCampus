import { audio } from './engine';

/** 音效名：场景里按名字播放，具体怎么合成都在这个文件里 */
export type SfxName =
  | 'click' | 'step' | 'pet' | 'feed' | 'pickup' | 'achieve' | 'title' | 'sit' | 'stand' | 'emote' | 'shutter'
  | 'bell' | 'lock' | 'cast' | 'splash' | 'bite' | 'reel' | 'catch' | 'fail' | 'count' | 'go' | 'finish' | 'notify';

type Wave = OscillatorType;
/** 一个带音量包络的音：freq→slideTo 滑音，at 秒后开始 */
function tone(freq: number, dur: number, type: Wave, vol: number, at = 0, slideTo?: number) {
  const ctx = audio.ctx; if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
/** 一小段滤波噪声（脚步、水花、咀嚼、快门） */
function noise(dur: number, vol: number, at = 0, filter: BiquadFilterType = 'bandpass', f0 = 1500, f1?: number) {
  const ctx = audio.ctx; if (!ctx) return;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = filter; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(audio.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

const SFX: Record<SfxName, () => void> = {
  click: () => tone(1040, 0.05, 'square', 0.05),
  step: () => noise(0.05, 0.035, 0, 'lowpass', 500 + Math.random() * 250),
  pet: () => { tone(620, 0.12, 'sine', 0.16); tone(830, 0.16, 'sine', 0.14, 0.08); },
  feed: () => { for (let i = 0; i < 3; i++) noise(0.05, 0.12, i * 0.09, 'bandpass', 2800 + i * 300); tone(520, 0.1, 'sine', 0.1, 0.3); },
  pickup: () => { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, i * 0.06)); },
  achieve: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.1)); tone(1047, 0.6, 'sine', 0.1, 0.4); },
  title: () => { tone(784, 0.2, 'triangle', 0.14); tone(1175, 0.4, 'triangle', 0.14, 0.12); },
  sit: () => tone(190, 0.12, 'sine', 0.18, 0, 95),
  stand: () => tone(110, 0.12, 'sine', 0.14, 0, 200),
  emote: () => tone(480, 0.09, 'sine', 0.15, 0, 900),
  shutter: () => { noise(0.025, 0.2, 0, 'highpass', 3000); noise(0.04, 0.16, 0.05, 'highpass', 2200); tone(150, 0.08, 'sine', 0.14, 0.01, 80); },
  bell: () => { tone(1568, 0.35, 'triangle', 0.13); tone(1319, 0.4, 'triangle', 0.13, 0.12); },
  lock: () => { tone(880, 0.04, 'square', 0.06); tone(660, 0.06, 'square', 0.06, 0.06); },
  cast: () => { noise(0.28, 0.1, 0, 'bandpass', 400, 3000); tone(300, 0.1, 'sine', 0.1, 0.3, 150); },
  splash: () => { noise(0.3, 0.16, 0, 'bandpass', 900, 500); tone(260, 0.12, 'sine', 0.08, 0, 140); },
  bite: () => { tone(1250, 0.07, 'square', 0.1); tone(1250, 0.07, 'square', 0.1, 0.12); },
  reel: () => { noise(0.2, 0.08, 0, 'bandpass', 1200, 2600); tone(500, 0.18, 'sine', 0.08, 0, 800); },
  catch: () => { [523, 659, 784, 988, 1175].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, i * 0.07)); },
  fail: () => { tone(440, 0.2, 'sine', 0.13); tone(330, 0.32, 'sine', 0.13, 0.15); },
  count: () => tone(880, 0.14, 'sine', 0.16),
  go: () => { tone(1320, 0.3, 'sine', 0.18); tone(1760, 0.3, 'triangle', 0.08, 0.02); },
  finish: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.15, i * 0.09)); tone(1319, 0.5, 'sine', 0.1, 0.4); },
  notify: () => { tone(988, 0.14, 'sine', 0.13); tone(1319, 0.24, 'sine', 0.13, 0.13); },
};

const last = new Map<SfxName, number>();
/** 播放音效；引擎还没被用户操作唤醒、音量为 0、或同一音效 60ms 内重复触发时直接跳过 */
export function sfx(name: SfxName) {
  if (!audio.ready || audio.volumes.sfx <= 0) return;
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < (name === 'step' ? 150 : 60)) return;
  last.set(name, now);
  try { SFX[name](); } catch { /* 合成失败不影响游戏 */ }
}
