import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': r('./src'), '@data': r('./data') } },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } } }, // 联机：把 /ws 转给 npm run server
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
