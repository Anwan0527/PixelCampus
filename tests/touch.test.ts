import { describe, it, expect } from 'vitest';
import { JOY_DEAD, JOY_R, joyVec } from '../src/ui/joystick';

describe('虚拟摇杆', () => {
  it('死区内不动，包括刚按下（零偏移）', () => {
    expect(joyVec(0, 0)).toEqual({ x: 0, y: 0, run: false });
    expect(joyVec(JOY_R * JOY_DEAD * 0.9, 0)).toEqual({ x: 0, y: 0, run: false });
  });
  it('方向是单位向量，8 个方向都对', () => {
    const r = joyVec(30, 0); expect(r).toEqual({ x: 1, y: 0, run: false });
    const d = joyVec(-30, -30); expect(d.x).toBeCloseTo(-Math.SQRT1_2); expect(d.y).toBeCloseTo(-Math.SQRT1_2);
    expect(joyVec(0, 40)).toEqual({ x: 0, y: 1, run: false });
  });
  it('推到边缘（≥92% 半径）或更远 = 奔跑；中间距离是走路', () => {
    expect(joyVec(JOY_R * 0.5, 0).run).toBe(false);
    expect(joyVec(JOY_R * 0.95, 0).run).toBe(true);
    expect(joyVec(JOY_R * 3, 0)).toEqual({ x: 1, y: 0, run: true }); // 手指拖出很远，向量仍是单位长度
  });
});
