import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ABOUT, CREDITS, THANKS, THANKS_LINE_MAX, THANKS_MAX_LINES, cleanThanks, copyrightLine } from '../src/shared/about';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('作者声明 / 许可 / 致谢', () => {
  it('作者链接合法：GitHub 指向 EXIST-D，主页留空或是 https', () => {
    expect(ABOUT.github).toBe('https://github.com/EXIST-D');
    expect(ABOUT.homepage === '' || /^https:\/\//.test(ABOUT.homepage)).toBe(true);
    expect(ABOUT.site).toMatch(/^https:\/\//);
    expect(ABOUT.repo).toBe('https://github.com/EXIST-D/PixelCampus');
    expect(copyrightLine()).toContain('EXIST-D');
  });
  it('致谢每一项都写明许可，外链只用 https', () => {
    expect(CREDITS.length).toBeGreaterThan(3);
    for (const c of CREDITS) { expect(c.license.length).toBeGreaterThan(0); expect(c.by.length).toBeGreaterThan(0); if (c.url) expect(c.url).toMatch(/^https:\/\//); }
    // 必须署名的两项不能丢：OSM（ODbL）、LDNOOBW（CC BY 4.0）
    expect(CREDITS.some((c) => c.license === 'ODbL')).toBe(true);
    expect(CREDITS.some((c) => c.license === 'CC BY 4.0')).toBe(true);
  });
  it('LICENSE 与线上发布的 LICENSE.txt 内容一致，并写着作者', () => {
    const a = read('LICENSE'); expect(a).toBe(read(`public/${ABOUT.licenseFile}`));
    expect(a).toContain('EXIST-D'); expect(a).toContain('保留所有权利');
  });
  it('页面带着作者与版权元信息', () => {
    const h = read('index.html'); expect(h).toContain('name="author" content="EXIST-D"'); expect(h).toContain('name="copyright"'); expect(h).toContain('loading-credit');
  });
  it('致谢可由站长编写：cleanThanks 收敛每一行、限行数和字数；不是数组 = 用默认；默认里有开屏图案的感谢', () => {
    expect(cleanThanks(undefined)).toBeNull(); expect(cleanThanks('x')).toBeNull();
    expect(cleanThanks(['  a\nb ', '', 5, 'c\u0000'])).toEqual(['a b', 'c']);
    expect(cleanThanks(['x'.repeat(THANKS_LINE_MAX + 50)])![0].length).toBe(THANKS_LINE_MAX);
    expect(cleanThanks(Array.from({ length: 50 }, (_, i) => `第${i}行`))!.length).toBe(THANKS_MAX_LINES);
    expect(THANKS.some((t) => t.includes('开屏页面动画图案'))).toBe(true);
  });
});
