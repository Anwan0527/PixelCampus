import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 图集尺寸：任何一张图集都不能超过 4096（很多手机显卡的纹理上限）。
 * 超过的话，那台设备上整张图集会渲染成黑方块——小猫图集曾经是 1024×4142，在这样的手机上猫会变成黑色方块。
 * 要先 npm run assets 生成资源；没生成就跳过。
 */
const GEN = join(__dirname, '..', 'public', 'assets', 'generated');
describe.skipIf(!existsSync(GEN))('图集尺寸 ≤ 4096', () => {
  it('所有 atlas-*.json', () => {
    const files = readdirSync(GEN).filter((f) => /^atlas-.*\.json$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const j = JSON.parse(readFileSync(join(GEN, f), 'utf8')), s = j.meta?.size;
      if (!s) continue;
      expect(s.w, `${f} 宽`).toBeLessThanOrEqual(4096); expect(s.h, `${f} 高`).toBeLessThanOrEqual(4096);
    }
  });
});
