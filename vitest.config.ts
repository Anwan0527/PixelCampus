import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: { alias: { '@': r('./src'), '@data': r('./data') } },
  test: { include: ['tests/**/*.test.ts'], exclude: ['archive/**', 'node_modules/**', 'dist/**'] },
});
