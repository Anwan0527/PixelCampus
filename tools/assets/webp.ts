/**
 * 把生成的 PNG（图集、地面块、室内底图、小地图）无损转成 WebP，放在 PNG 旁边。npm run assets:webp
 * 客户端只加载 .webp（体积约为 PNG 的 55%~75%，像素逐点一致）；PNG 仍保留，给地图编辑器和 ?world= 对照版用。
 * 幂等：.webp 比 .png 新就跳过；npm run assets 与 npm run deploy 都会先跑一遍。
 * 不处理 mons/（精灵内容包，由 tools/mons 另管，客户端仍按 PNG 加载）。
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ROOT } from '../paths.ts';

const DIRS = ['public/assets/generated', 'public/assets/generated-s1'];

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'mons') yield* walk(join(dir, e.name)); }
    else if (e.name.endsWith('.png')) yield join(dir, e.name);
  }
}

export async function convertAll(verify = false) {
  const todo: string[] = [];
  for (const d of DIRS) for (const f of walk(join(ROOT, d))) {
    const out = f.replace(/\.png$/, '.webp');
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(f).mtimeMs) todo.push(f);
  }
  let before = 0, after = 0, i = 0;
  const worker = async () => {
    for (;;) {
      const f = todo[i++]; if (!f) return;
      const out = f.replace(/\.png$/, '.webp');
      const info = await sharp(f).webp({ lossless: true, effort: 5, exact: true }).toFile(out);
      before += statSync(f).size; after += info.size;
      if (verify) {
        const [a, b] = await Promise.all([sharp(f).ensureAlpha().raw().toBuffer(), sharp(out).ensureAlpha().raw().toBuffer()]);
        if (!a.equals(b)) throw new Error(`WebP 与 PNG 像素不一致：${f}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { converted: todo.length, before, after };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {   // 路径含中文，不能直接比 URL 字符串
  const t0 = Date.now();
  const r = await convertAll(process.argv.includes('--verify'));
  console.log(r.converted ? `WebP：转换 ${r.converted} 张，${(r.before / 1048576).toFixed(1)} MB → ${(r.after / 1048576).toFixed(1)} MB（${((Date.now() - t0) / 1000).toFixed(0)} 秒）` : 'WebP：没有需要转换的（都是最新的）');
}
