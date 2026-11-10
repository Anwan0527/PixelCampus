import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProtocolDoc } from '../tools/docs/gen-protocol';

const root = join(__dirname, '..');
describe('协议索引文档', () => {
  it('能从 protocol.ts 生成，且每种消息都出现', () => {
    const md = buildProtocolDoc(root), src = readFileSync(join(root, 'src/shared/protocol.ts'), 'utf8');
    const types = new Set([...src.matchAll(/^\s{2}\| \{ t: '([a-z_0-9]+)'/gm)].map((m) => m[1]));
    for (const t of types) expect(md, t).toContain(`\`${t}\``);
  });
  it.skipIf(!existsSync(join(root, 'docs', 'architecture', 'PROTOCOL.md')))('docs/architecture/PROTOCOL.md 是最新生成的（改了协议后运行 npm run protocol:doc）', () => {
    expect(readFileSync(join(root, 'docs', 'architecture', 'PROTOCOL.md'), 'utf8')).toBe(buildProtocolDoc(root));
  });
});
