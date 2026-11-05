/**
 * 部署之后把编辑器里的改动"并入"基础地图：`npm run bake`（deploy.sh 部署成功后会自动跑一次）。
 *  - 把 data/campus/manual.json 的内容作为新的一层追加到 data/campus/baked.json（层按顺序叠加，编译结果和并入前完全一样）；
 *  - 然后把 manual.json 清空——编辑器重新打开就是干净的：没有上一次部署的草图、改动列表和撤销痕迹，只加载真正在改的东西；
 *  - 原来的 manual.json 备份在 .cache/manual-backups/，git 历史里也都有。
 * 之后要提交 baked.json 和 manual.json 这两个文件的变化。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, DATA, ROOT } from '../paths.ts';
import { appendLayer, compactBaked, simplifyManual, emptyBaked, emptyManual, isManualEmpty, validateBaked, validateManual, type BakedFile, type ManualFile } from '../../src/shared/manual.ts';

const manualFile = process.env.MANUAL_FILE ? join(ROOT, process.env.MANUAL_FILE) : join(DATA, 'manual.json');
const bakedFile = process.env.BAKED_FILE ? join(ROOT, process.env.BAKED_FILE) : join(DATA, 'baked.json');
if (!existsSync(manualFile)) { console.log('没有 manual.json，不用并入。'); process.exit(0); }
const manual = JSON.parse(readFileSync(manualFile, 'utf8')) as ManualFile;
const errs = validateManual(manual);
if (errs.length) { console.error(`manual.json 不合法，没有并入：\n${errs.slice(0, 8).join('\n')}`); process.exit(1); }
if (isManualEmpty(manual)) { console.log('编辑器里没有未并入的改动。'); process.exit(0); }
const baked: BakedFile = existsSync(bakedFile) ? JSON.parse(readFileSync(bakedFile, 'utf8')) : emptyBaked();
const simp = simplifyManual(manual); // 先整理这一层，再整理各层之间（后面盖住前面的就去掉前面的）
const before = baked.layers.reduce((a, l) => a + l.shapes.length, 0) + simp.m.shapes.length;
const next = compactBaked(appendLayer(baked, simp.m, new Date().toISOString().slice(0, 16)));
const after = next.layers.reduce((a, l) => a + l.shapes.length, 0);
const e2 = validateBaked(next);
if (e2.length) { console.error(`并入后不合法，没有改动文件：\n${e2.slice(0, 8).join('\n')}`); process.exit(1); }
const dir = join(CACHE, 'manual-backups'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `manual-before-bake-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), readFileSync(manualFile));
writeFileSync(bakedFile, JSON.stringify(next, null, 1));
writeFileSync(manualFile, JSON.stringify(emptyManual(), null, 1));
if (before > after || simp.removed.objects || simp.removed.erase) console.log(`整理：去掉被盖住的旧地面 ${before - after + simp.removed.shapes} 块、重复物件 ${simp.removed.objects} 个、被包住的擦除 ${simp.removed.erase} 个。`);
console.log(`已并入第 ${next.layers.length} 层：地面 ${manual.shapes.length}、物件 ${manual.objects.length}、连排 ${manual.rows.length}、擦除 ${manual.erase.length}、建筑 ${manual.buildings?.length ?? 0}。manual.json 已清空。记得提交 baked.json 和 manual.json。`);
