import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FILES = ['../src/ui/MonPanel.ts', '../src/ui/BattleUi.ts', '../src/ui/monBattleHelpers.ts'];

describe('界面安全约定', () => {
  it('新增 / 修改的界面代码不使用 innerHTML / outerHTML', () => {
    for (const p of FILES) {
      const s = readFileSync(f(p), 'utf8');
      expect(s, p).not.toMatch(/innerHTML|outerHTML/);
    }
  });
});
