import { describe, expect, it } from 'vitest';
import { CAT_LEASH, CAT_REACH, CAT_SERVER_REACH, clampToLeash } from '../src/shared/cats';

describe('猫牵绳', () => {
  it('圆内的点不变，圆外的点被夹到圆周上（方向不变）', () => {
    expect(clampToLeash(100, 100, 130, 100)).toEqual({ x: 130, y: 100 });
    const p = clampToLeash(100, 100, 100 + 300, 100);
    expect(p.x).toBeCloseTo(100 + CAT_LEASH); expect(p.y).toBeCloseTo(100);
    const q = clampToLeash(0, 0, 300, 400, 50);
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(50); expect(q.x / q.y).toBeCloseTo(0.75);
  });
  it('连续被吓跑 N 次，猫也永远在牵绳内；牵绳 + 够得着的距离 < 服务器判定距离', () => {
    let x = 0, y = 0;
    for (let i = 0; i < 50; i++) { const a = i * 0.7; const t = clampToLeash(0, 0, x + Math.cos(a) * 52, y + Math.sin(a) * 52); x = t.x; y = t.y; expect(Math.hypot(x, y)).toBeLessThanOrEqual(CAT_LEASH + 1e-9); }
    expect(CAT_LEASH + CAT_REACH).toBeLessThan(CAT_SERVER_REACH);
  });
});
