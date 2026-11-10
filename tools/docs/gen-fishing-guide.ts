import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGuide } from './fishing-guide';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'), file = join(root, 'docs', 'guide', 'FISHING_GUIDE.md');
writeFileSync(file, buildGuide(root), 'utf8');
console.log(`✓ 钓鱼攻略 → ${file}`);
