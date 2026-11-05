/**
 * 背景音乐的"作曲"：纯函数，只产出音符（拍位、时长、音高、声部），不碰 WebAudio，所以可以直接测试。
 * 白天是明亮舒缓的 C 大调五声音阶，夜里换成更慢更稀疏的 A 小调五声音阶；每小节从和弦走向里取一个和弦，
 * 旋律在五声音阶上随机漫步（带休止），所以怎么拼都不会不和谐，也不会重复得太明显。
 */
export type Mood = 'day' | 'night';
export interface Note { at: number; dur: number; midi: number; voice: 'lead' | 'pad' | 'bass'; vel: number }
export interface MoodDef {
  bpm: number;
  /** 五声音阶（相对根音的半音数）、根音 midi */
  scale: number[]; root: number;
  /** 和弦走向：每个和弦是 [根音偏移, 三音偏移, 五音偏移]（半音，相对 root） */
  prog: number[][];
  /** 每个八分音符位置出旋律音的概率、旋律所在的最低 midi */
  leadProb: number; leadLow: number;
}

export const MOODS: Record<Mood, MoodDef> = {
  day: {
    bpm: 76, root: 60, scale: [0, 2, 4, 7, 9],
    prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], // C  Am  F  G
    leadProb: 0.42, leadLow: 72,
  },
  night: {
    bpm: 58, root: 57, scale: [0, 3, 5, 7, 10],
    prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], // Am  F  C  G
    leadProb: 0.2, leadLow: 64,
  },
};

/** 一小节 4 拍。bar = 小节序号（决定用哪个和弦）；rng 返回 [0,1) */
export function composeBar(rng: () => number, mood: Mood, bar: number, prevLead = -1): { notes: Note[]; lastLead: number } {
  const m = MOODS[mood], chord = m.prog[((bar % m.prog.length) + m.prog.length) % m.prog.length];
  const notes: Note[] = [];
  // 铺底：整小节的三个和弦音（八度下移一点，柔和）
  for (const off of chord) notes.push({ at: 0, dur: 4, midi: m.root + off - 12, voice: 'pad', vel: 0.5 });
  // 低音：第 1、3 拍的根音
  notes.push({ at: 0, dur: 1.6, midi: m.root + chord[0] - 24, voice: 'bass', vel: 0.7 });
  notes.push({ at: 2, dur: 1.4, midi: m.root + chord[0] - 24 + (rng() < 0.4 ? 7 : 0), voice: 'bass', vel: 0.5 });
  // 旋律：在五声音阶上随机漫步，每个八分音符位置按概率出音
  const pool: number[] = [];
  for (let oct = 0; oct < 2; oct++) for (const d of m.scale) pool.push(m.leadLow + ((m.root - m.leadLow) % 12 + 12) % 12 + d + oct * 12);
  pool.sort((a, b) => a - b);
  let idx = prevLead >= 0 && prevLead < pool.length ? prevLead : Math.floor(pool.length / 2);
  for (let step = 0; step < 8; step++) {
    if (rng() > m.leadProb * (step % 2 === 0 ? 1.4 : 0.8)) continue;
    idx = Math.max(0, Math.min(pool.length - 1, idx + Math.floor(rng() * 5) - 2));
    notes.push({ at: step * 0.5, dur: rng() < 0.3 ? 1.5 : 0.75, midi: pool[idx], voice: 'lead', vel: 0.35 + rng() * 0.3 });
  }
  return { notes, lastLead: idx };
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const barSeconds = (mood: Mood) => (60 / MOODS[mood].bpm) * 4;
