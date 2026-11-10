import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGuide } from '../tools/docs/fishing-guide';

const root = join(__dirname, '..');
describe('钓鱼攻略（玩家手册）', () => {
  it('能从模板和真实规则生成：没有残留的占位符、表格行数对', () => {
    const md = buildGuide(root);
    expect(md).not.toMatch(/\{\{/); expect(md).toContain('# 精工湖钓鱼攻略');
    for (const h of ['常见', '少见', '稀有', '史诗', '传说', '神话']) expect(md).toContain(h);
    expect(md.match(/^\| \d+ \| \d+ \|/gm)!.length).toBeGreaterThanOrEqual(30); // 30 级的等级表
  });
  it.skipIf(!existsSync(join(root, 'docs', 'guide', 'FISHING_GUIDE.md')))('docs/guide/FISHING_GUIDE.md 是最新生成的（改了鱼表 / 装备 / 等级 / 价格后运行 npm run guide 重新生成）', () => {
    expect(readFileSync(join(root, 'docs', 'guide', 'FISHING_GUIDE.md'), 'utf8')).toBe(buildGuide(root));
  });
});
