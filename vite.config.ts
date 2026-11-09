import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': r('./src'), '@data': r('./data') } },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true }, '/up': { target: 'http://127.0.0.1:8787', changeOrigin: false }, '/img': { target: 'http://127.0.0.1:8787', changeOrigin: false } } }, // 联机：把 /ws 转给 npm run server；地点留言板的图片上传（/up）和读取（/img）也转过去，和线上一样同源
  build: {
    target: 'es2022', chunkSizeWarningLimit: 2000,
    // Phaser 单独打成一个文件（约 1.2 MB 原始 / 330 KB 压缩）：它几乎不变，文件名里的哈希也就不变，
    // 玩家浏览器缓存后，之后每次部署只需重新下载我们自己的代码（约 1/3），不用每次都把引擎再下一遍
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/phaser/') ? 'phaser' : undefined) } },
  },
});
