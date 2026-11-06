/**
 * 构建后用 brotli（最高档）预压缩 dist/ 里的文本类文件，生成同名的 .br。deploy.sh 在 vite build 之后调用。
 * 游戏服务器（server/static.ts）看到浏览器支持 br 就直接发 .br；不支持的退回 gzip。比 gzip 再小 15%~30%，且服务器不占 CPU。
 * 用法：tsx tools/assets/precompress.ts [目录=dist]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../paths.ts';

const TEXTY = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (TEXTY.has(extname(e.name)) && statSync(p).size > 1024) yield p;
  }
}

export function precompress(dir: string) {
  let n = 0, raw = 0, br = 0;
  for (const f of walk(dir)) {
    const buf = readFileSync(f);
    const out = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    if (out.length >= buf.length) continue; // 压不小就不留
    writeFileSync(`${f}.br`, out); n++; raw += buf.length; br += out.length;
  }
  return { files: n, raw, br };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = precompress(resolve(ROOT, process.argv[2] ?? 'dist'));
  console.log(`brotli：${r.files} 个文件，${(r.raw / 1024).toFixed(0)} KB → ${(r.br / 1024).toFixed(0)} KB`);
}
