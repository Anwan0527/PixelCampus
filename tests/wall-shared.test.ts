import { describe, expect, it } from 'vitest';
import { WALL_HOT_GRAVITY, WALL_NOTE_PAPERS, cleanWallSort, noteTilt, notePaper, wallHotScore, wallRelTime } from '../src/shared/wall';

const H = 3600_000;

describe('校园墙：热度、便利贴、相对时间（纯函数）', () => {
  it('热度分 = (赞 + 评论×2 + 1) / (小时 + 2)^0.8：互动越多越高、越旧越低；负数当 0；未来时间不加分', () => {
    const now = 1_000_000 * H;
    expect(WALL_HOT_GRAVITY).toBe(0.8);
    expect(wallHotScore(0, 0, now, now)).toBeCloseTo(1 / Math.pow(2, 0.8), 6);
    expect(wallHotScore(3, 2, now, now)).toBeGreaterThan(wallHotScore(3, 1, now, now)); // 评论比赞更值钱
    expect(wallHotScore(0, 1, now, now)).toBeGreaterThan(wallHotScore(1, 0, now, now));
    expect(wallHotScore(5, 5, now - 24 * H, now)).toBeLessThan(wallHotScore(5, 5, now - H, now));
    expect(wallHotScore(-5, -5, now, now)).toBe(wallHotScore(0, 0, now, now));
    expect(wallHotScore(1, 1, now + 5 * H, now)).toBe(wallHotScore(1, 1, now, now));
  });
  it('热度的取舍：新帖 0 赞 vs 一天前的 10 赞，隔得久的热帖仍然能压过新帖，但两天前的 10 赞会被一小时前的 3 赞 2 评论超过', () => {
    const now = 5_000 * H;
    expect(wallHotScore(10, 0, now - 24 * H, now)).toBeGreaterThan(wallHotScore(0, 0, now, now));
    expect(wallHotScore(3, 2, now - H, now)).toBeGreaterThan(wallHotScore(10, 0, now - 48 * H, now));
  });
  it('排序参数只认 hot，其余一律当 new', () => {
    expect(cleanWallSort('hot')).toBe('hot'); expect(cleanWallSort('new')).toBe('new'); expect(cleanWallSort('x')).toBe('new'); expect(cleanWallSort(undefined)).toBe('new'); expect(cleanWallSort(1)).toBe('new');
  });
  it('便利贴纸色：按 hue 分成 粉 / 黄 / 蓝 / 绿 四档，360 度循环，负数也安全', () => {
    expect(WALL_NOTE_PAPERS.map((p) => p.name)).toEqual(['粉', '黄', '蓝', '绿']);
    expect([0, 89, 90, 179, 180, 270, 359, 360, 450, -10].map((h) => notePaper(h).name)).toEqual(['粉', '粉', '黄', '黄', '蓝', '绿', '绿', '粉', '黄', '绿']);
  });
  it('便利贴倾斜：固定（同 id 永远同一个角度）、在 -1.5°~1.5° 内、不同 id 有变化', () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1), ts = ids.map(noteTilt);
    expect(ids.map(noteTilt)).toEqual(ts);
    for (const t of ts) { expect(t).toBeGreaterThanOrEqual(-1.5); expect(t).toBeLessThanOrEqual(1.5); }
    expect(new Set(ts).size).toBeGreaterThan(15);
  });
  it('相对时间：刚刚 / 分钟 / 小时 / 天 / 超过 30 天显示月-日；时间在未来按刚刚', () => {
    const now = Date.UTC(2026, 10, 8, 12, 0, 0);
    expect(wallRelTime(now, now)).toBe('刚刚'); expect(wallRelTime(now - 59_000, now)).toBe('刚刚'); expect(wallRelTime(now + 5000, now)).toBe('刚刚');
    expect(wallRelTime(now - 60_000, now)).toBe('1 分钟前'); expect(wallRelTime(now - 59 * 60_000, now)).toBe('59 分钟前');
    expect(wallRelTime(now - 3 * H, now)).toBe('3 小时前'); expect(wallRelTime(now - 26 * H, now)).toBe('1 天前'); expect(wallRelTime(now - 29 * 24 * H, now)).toBe('29 天前');
    expect(wallRelTime(now - 40 * 24 * H, now)).toMatch(/^\d{1,2}-\d{1,2}$/);
  });
});
