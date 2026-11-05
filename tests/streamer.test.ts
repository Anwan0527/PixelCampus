import { describe, it, expect } from 'vitest';
import { Streamer } from '../src/world/Streamer';

describe('Streamer（视野流式）', () => {
  const mk = () => { let made = 0, killed = 0; const s = new Streamer(100, 300); for (let i = 0; i < 1000; i++) s.add({ x: i * 50, y: 0, w: 40, h: 40, make: () => { made++; return { destroy: () => { killed++; } }; } }); return { s, stats: () => ({ made, killed }) }; };
  it('只创建视野+loadMargin 内的条目', () => {
    const { s, stats } = mk(); s.update(500, 20, 200, 100);
    expect(stats().made).toBeGreaterThan(5); expect(stats().made).toBeLessThan(25); expect(s.active).toBe(stats().made);
  });
  it('滞回：移动一小段不销毁，走远才销毁，且已存在的不重复创建', () => {
    const { s, stats } = mk(); s.update(500, 20, 200, 100); const m0 = stats().made;
    s.update(560, 20, 200, 100); expect(stats().killed).toBe(0);
    s.update(5000, 20, 200, 100); expect(stats().killed).toBeGreaterThan(0); expect(stats().made).toBeGreaterThan(m0);
    const m1 = stats().made; s.update(5000, 20, 200, 100); expect(stats().made).toBe(m1);
  });
  it('1 万条目的一次 update 在 20 ms 内完成（每 120 ms 调用一次的预算）', () => {
    const s = new Streamer(700, 1500); for (let i = 0; i < 20000; i++) s.add({ x: (i % 400) * 28, y: Math.floor(i / 400) * 28, w: 20, h: 20, make: () => ({ destroy() {} }) });
    s.update(5000, 600, 480, 300); const t = performance.now(); for (let k = 0; k < 10; k++) s.update(5000 + k * 7, 600, 480, 300); expect((performance.now() - t) / 10).toBeLessThan(20);
  });
});
