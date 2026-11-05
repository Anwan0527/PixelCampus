import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ABOUT, CREDITS, copyrightLine } from '../src/shared/about';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('作者声明 / 许可 / 致谢', () => {
  it('作者链接合法：GitHub 指向 EXIST-D，主页留空或是 https', () => {
    expect(ABOUT.github).toBe('https://github.com/EXIST-D');
    expect(ABOUT.homepage === '' || /^https:\/\//.test(ABOUT.homepage)).toBe(true);
    expect(ABOUT.site).toMatch(/^https:\/\//);
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
});
