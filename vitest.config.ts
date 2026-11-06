import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: { alias: { '@': r('./src'), '@data': r('./data') } },
  test: { env: { PIXEL_NO_FESTIVAL: '1' }, /* 测试里关掉节日（真实时间可能刚好在节日里，会多发装扮/礼物影响计数）；节日测试自己打开 */ include: ['tests/**/*.test.ts'], exclude: ['archive/**', 'node_modules/**', 'dist/**'] },
});
