/**
 * 地图编辑器的本地服务：`npm run editor` → http://127.0.0.1:5174
 *  - 只监听本机；读写 data/campus/manual.json（手动层，见 src/shared/manual.ts）；保存前备份到 .cache/manual-backups/；
 *  - 「生成预览」= 在后台跑 `npm run assets:world`（有缓存，约十几秒），完成后编辑器重新载入地图；
 *  - 界面代码 tools/editor/main.ts 由 esbuild 即时打包。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { ROOT, CACHE, DATA, GEN } from '../paths.ts';
import { emptyManual, validateManual } from '../../src/shared/manual.ts';
import { validateInterior } from '../../src/shared/interior.ts';

const BAKED = process.env.BAKED_FILE ? join(ROOT, process.env.BAKED_FILE) : join(DATA, 'baked.json');
const PORT = Number(process.env.EDITOR_PORT ?? 5174);
const MANUAL = process.env.MANUAL_FILE ? join(ROOT, process.env.MANUAL_FILE) : join(DATA, 'manual.json'); // MANUAL_FILE：测试时换一个文件，编译子进程继承同一个环境变量
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };

const etagCache = new Map<string, { m: number; s: number; e: string }>();
const send = (res: ServerResponse, code: number, body: string | Buffer, type = 'application/json; charset=utf-8', extra: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra }); res.end(body); };
const readBody = (req: IncomingMessage) => new Promise<string>((ok, bad) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 4e6) { bad(new Error('太大')); req.destroy(); } }); req.on('end', () => ok(s)); req.on('error', bad); });

let job: { proc: ChildProcess | null; running: boolean; ok: boolean | null; log: string; startedAt: number } = { proc: null, running: false, ok: null, log: '', startedAt: 0 };
function rebuild(script = 'tools/world/compile.ts') { // 默认重新生成整张地图；室内编辑器只重新生成室内（tools/world/interiors.ts，几秒）
  if (job.running) return;
  job = { proc: null, running: true, ok: null, log: '', startedAt: Date.now() };
  const p = spawn('npx', ['tsx', script], { cwd: ROOT, env: { ...process.env } });
  job.proc = p;
  const add = (d: Buffer) => { job.log = (job.log + d.toString()).slice(-4000); };
  p.stdout.on('data', add); p.stderr.on('data', add);
  p.on('error', (e) => { job.running = false; job.ok = false; job.log += String(e); });
  p.on('close', (code) => {
    if (code !== 0) { job.running = false; job.ok = false; return; }
    // 游戏和编辑器加载的是 WebP：生成完 PNG 要接着转一遍，否则图集还是旧的、新建筑会显示成一块块乱拼的碎片（2026-11-09 主人新建四栋楼时遇到）
    const w = spawn('npx', ['tsx', 'tools/assets/webp.ts'], { cwd: ROOT, env: { ...process.env } });
    w.stdout.on('data', add); w.stderr.on('data', add);
    w.on('close', (c2) => { job.running = false; job.ok = c2 === 0; });
    w.on('error', (e) => { job.running = false; job.ok = false; job.log += String(e); });
  });
}

async function bundle(entry = 'main') {
  const r = await build({ entryPoints: [join(ROOT, `tools/editor/${entry}.ts`)], bundle: true, write: false, format: 'esm', target: 'es2022', sourcemap: 'inline', logLevel: 'silent' });
  return r.outputFiles[0].text;
}

const server = createServer(async (req, res) => {
  try {
    // 只接受本机访问（防止被别的网页/别的机器借用来改文件）
    const host = (req.headers.host ?? '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 403, '{"error":"仅限本机"}');
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/') return send(res, 200, readFileSync(join(ROOT, 'tools/editor/index.html')), MIME['.html']);
    if (req.method === 'GET' && path === '/interior') return send(res, 200, readFileSync(join(ROOT, 'tools/editor/interior.html')), MIME['.html']);
    if (req.method === 'GET' && path === '/interior.js') { try { return send(res, 200, await bundle('interior'), MIME['.js']); } catch (e) { return send(res, 500, `console.error(${JSON.stringify(String(e))})`, MIME['.js']); } }
    if (req.method === 'GET' && path === '/api/interiors') { // 室内数据（data/interiors/*.json）+ 编译导出的家具目录
      const dir = join(ROOT, 'data', 'interiors'), meta = join(GEN, 'furniture-meta.json');
      const list = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : [];
      return send(res, 200, JSON.stringify({ interiors: list, furniture: existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : null }));
    }
    if (req.method === 'POST' && path === '/api/interior') { // 保存一间室内：校验 → 备份旧文件 → 写 data/interiors/<id>.json
      if (req.headers['x-editor'] !== '1') return send(res, 403, '{"error":"缺少标记"}');
      const j = JSON.parse(await readBody(req));
      const meta = join(GEN, 'furniture-meta.json'); if (!existsSync(meta)) return send(res, 400, '{"error":["没有家具目录，请先运行 npm run assets:interiors"]}');
      const errs = validateInterior(j, new Set(Object.keys(JSON.parse(readFileSync(meta, 'utf8')))));
      if (errs.length) return send(res, 400, JSON.stringify({ error: errs.slice(0, 8) }));
      const f = join(ROOT, 'data', 'interiors', `${j.id}.json`);
      const dir = join(CACHE, 'interior-backups'); mkdirSync(dir, { recursive: true });
      if (existsSync(f)) writeFileSync(join(dir, `${j.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), readFileSync(f));
      for (const b of readdirSync(dir).sort().slice(0, -40)) unlinkSync(join(dir, b)); // 只留最近 40 份
      writeFileSync(f, JSON.stringify(j, null, 1));
      return send(res, 200, '{"ok":true}');
    }
    if (req.method === 'GET' && path === '/main.js') { try { return send(res, 200, await bundle(), MIME['.js']); } catch (e) { return send(res, 500, `console.error(${JSON.stringify(String(e))})`, MIME['.js']); } }
    if (req.method === 'GET' && path.startsWith('/gen/')) {
      const f = normalize(join(GEN, path.slice(5)));
      if (!f.startsWith(GEN) || !existsSync(f) || !statSync(f).isFile()) return send(res, 404, '{}');
      // 生成的地图文件（几十 MB 的地面块）：用内容的 ETag + no-cache——浏览器每次问一声"变了吗"，没变就 304、不重新下载；
      // 重新生成地图后没变的地面块内容相同、ETag 相同，所以只会下载真正变了的那几块
      const st = statSync(f), c = etagCache.get(f);
      const etag = c && c.m === st.mtimeMs && c.s === st.size ? c.e : (() => { const e = `"${createHash('md5').update(readFileSync(f)).digest('hex')}"`; etagCache.set(f, { m: st.mtimeMs, s: st.size, e }); return e; })();
      if (req.headers['if-none-match'] === etag) return send(res, 304, '', MIME[extname(f)] ?? 'application/octet-stream', { 'cache-control': 'no-cache', etag });
      return send(res, 200, readFileSync(f), MIME[extname(f)] ?? 'application/octet-stream', { 'cache-control': 'no-cache', etag });
    }
    if (req.method === 'GET' && path === '/api/buildings') { // 编译时导出的建筑数据（脚印、层数、风格…）；没有就先 npm run assets:world
      const f = join(CACHE, 'editor-buildings.json');
      return existsSync(f) ? send(res, 200, readFileSync(f)) : send(res, 404, '{"error":"没有建筑数据，请先在项目里运行 npm run assets:world"}');
    }
    if (req.method === 'GET' && path === '/api/blueprint') { // 编译时导出的蓝图条目（运动场地面/白线、围栏围墙、道路、广场铺装、绿地），编辑器里可以去掉或原位修改
      const f = join(CACHE, 'editor-blueprint.json');
      return existsSync(f) ? send(res, 200, readFileSync(f)) : send(res, 404, '{"error":"没有蓝图数据，请先在项目里运行 npm run assets:world"}');
    }
    if (req.method === 'GET' && path === '/api/info') { // 手动层文件和当前生成的地图哪个更新：编辑器据此判断"这些改动已经体现在地图图上了吗"
      const m = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);
      return send(res, 200, JSON.stringify({ manualMtime: m(MANUAL), worldMtime: m(join(GEN, 'world.json')), bakedMtime: m(BAKED) }));
    }
    if (path === '/api/manual') {
      if (req.method === 'GET') return send(res, 200, existsSync(MANUAL) ? readFileSync(MANUAL) : JSON.stringify(emptyManual()));
      if (req.method === 'POST') {
        if (req.headers['x-editor'] !== '1') return send(res, 403, '{"error":"缺少标记"}');
        const j = JSON.parse(await readBody(req));
        const errs = validateManual(j);
        if (errs.length) return send(res, 400, JSON.stringify({ error: errs.slice(0, 8) }));
        const dir = join(CACHE, 'manual-backups'); mkdirSync(dir, { recursive: true });
        if (existsSync(MANUAL)) writeFileSync(join(dir, `manual-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), readFileSync(MANUAL));
        for (const f of readdirSync(dir).sort().slice(0, -30)) unlinkSync(join(dir, f)); // 只留最近 30 份
        writeFileSync(MANUAL, JSON.stringify(j, null, 1));
        return send(res, 200, '{"ok":true}');
      }
    }
    if (path === '/api/rebuild' && req.method === 'POST') { if (req.headers['x-editor'] !== '1') return send(res, 403, '{}'); rebuild(url.searchParams.get('what') === 'interiors' ? 'tools/world/interiors.ts' : 'tools/world/compile.ts'); return send(res, 200, '{"started":true}'); }
    if (path === '/api/rebuild/status') return send(res, 200, JSON.stringify({ running: job.running, ok: job.ok, log: job.log.split('\n').slice(-6).join('\n'), sec: job.startedAt ? Math.round((Date.now() - job.startedAt) / 1000) : 0 }));
    return send(res, 404, '{}');
  } catch (e) { return send(res, 500, JSON.stringify({ error: String(e) })); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`地图编辑器已启动：http://127.0.0.1:${PORT}   （保存的内容在 data/campus/manual.json，Ctrl+C 退出）`));
