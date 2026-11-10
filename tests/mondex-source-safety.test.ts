import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(f(p), 'utf8');

describe('精灵图鉴 · 源码安全约定', () => {
  it('CodexPanel / mondexModel 不使用 innerHTML / outerHTML', () => {
    for (const p of ['../src/ui/CodexPanel.ts', '../src/ui/mondexModel.ts']) {
      expect(read(p), p).not.toMatch(/innerHTML|outerHTML/);
    }
  });

  it('不新增协议消息（没有 mon_dex / monDex）', () => {
    expect(read('../src/shared/protocol.ts')).not.toMatch(/mon_dex|monDex/);
  });
});
