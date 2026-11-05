import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** 工程根目录（路径含中文，统一用 fileURLToPath 解码） */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CACHE = join(ROOT, '.cache');
export const DATA = join(ROOT, 'data', 'campus');
export const GEN = join(ROOT, 'public', 'assets', 'generated');
