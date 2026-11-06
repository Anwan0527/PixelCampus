/**
 * 室内编译：data/interiors/*.json -> public/assets/generated/{interior-<id>.png, atlas-furniture.*, interiors.json}
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, GEN, ROOT } from '../paths.ts';
import { FURNITURE } from '../art/furniture.ts';
import { OFFICE_FURNITURE, FURN_INFO, FURN_TEXT } from '../art/furniture-office.ts';
import { DORM_FURNITURE, DORM_INFO } from '../art/furniture-dorm.ts';
import { Img } from '../art/px.ts';
import { paintInterior, DORM_WALL_STYLES, DORM_FLOOR_STYLES, type InteriorSpec } from '../art/interior-bg.ts';
import { skinFile } from '../../src/shared/dormskin.ts';
import { dormInteriorLevel, isDormInterior } from '../../src/shared/dorm.ts';
import { pack, type PackItem } from '../art/pack.ts';
import { validateInterior, furnitureLabel, rotInfo } from '../../src/shared/interior.ts';
import { DECOR_FURNITURE, DECOR_INFO } from '../art/furniture-decor.ts';
import { TURN_VIEWS } from '../art/turn.ts';

const dir = join(ROOT, 'data', 'interiors');
const specs: InteriorSpec[] = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
void DATA;

const sprites: PackItem[] = [];
type RotInfo = { fw: number; fh: number; w: number; h: number; mx: number; my: number }; // mx,my = 占地左上角在（带 1px 描边的）精灵图里的位置
const foot: Record<string, { fw: number; fh: number; w: number; h: number; rots: Record<number, RotInfo> }> = {};
/** 顺时针转 90°：(x,y) → (H-1-y, x) */
function rotCW(img: Img): Img { const o = new Img(img.h, img.w); for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const si = (y * img.w + x) * 4, di = (x * o.w + (img.h - 1 - y)) * 4; for (let c = 0; c < 4; c++) o.data[di + c] = img.data[si + c]; } return o; }
for (const [k, mk] of Object.entries({ ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE })) {
  const views = TURN_VIEWS[k]; // 能转向的家具：每个朝向都是单独设计的贴图（tools/art/turn*.ts），脚印和精灵尺寸各自带着
  const f = views?.[0]?.() ?? mk();
  sprites.push({ key: k, img: f.img });
  // 占地矩形在精灵图里的位置（算法在 shared/interior.ts 的 rotInfo，宿舍里摆家具时客户端用同一个）：旋转时跟着转，所以任何朝向占地都对得上格子
  const rots: Record<number, RotInfo> = { 0: rotInfo(f.fw, f.fh, f.img.w, f.img.h, 0) };
  if (f.fh > 0) { // 墙面挂件（fh=0）不能旋转
    let img = f.img;
    for (const r of [90, 180, 270] as const) {
      const v = views?.[r]?.();
      if (v) { sprites.push({ key: `${k}@${r}`, img: v.img }); rots[r] = rotInfo(v.fw, v.fh, v.img.w, v.img.h, 0); continue; } // 设计好的朝向：占地已经是转向后的，精灵自带
      img = rotCW(img); // 没有专门设计的（地毯、门垫，室内数据里的老家具）：直接转图
      sprites.push({ key: `${k}@${r}`, img });
      rots[r] = rotInfo(f.fw, f.fh, f.img.w, f.img.h, r);
    }
  }
  foot[k] = { fw: f.fw, fh: f.fh, w: f.img.w, h: f.img.h, rots };
}
const atlas = pack(sprites, 512);
await atlas.img.save(join(GEN, 'atlas-furniture.png'));
writeFileSync(join(GEN, 'atlas-furniture.json'), JSON.stringify(atlas.json));
/** 给地图编辑器用的家具目录：脚印、精灵尺寸、各朝向的占地偏移、中文名、分类、能写字的版式（不进游戏） */
writeFileSync(join(GEN, 'furniture-meta.json'), JSON.stringify(Object.fromEntries(Object.entries(foot).map(([k, v]) => [k, { ...v, name: (FURN_INFO[k] ?? DORM_INFO[k] ?? DECOR_INFO[k])?.name ?? k, cat: (FURN_INFO[k] ?? DORM_INFO[k] ?? DECOR_INFO[k])?.cat ?? '其他', top: !!FURN_INFO[k]?.top, ...(FURN_TEXT[k] ? { text: FURN_TEXT[k] } : {}) }]))));

const out: any[] = [];
for (const s of specs) {
  const errs = validateInterior(s, new Set(Object.keys(foot)));
  if (errs.length) throw new Error(`室内 ${s.id} 不合法：\n${errs.slice(0, 8).join('\n')}`);
  const bg = paintInterior(s);
  await bg.save(join(GEN, `interior-${s.id}.png`));
  if (isDormInterior(s.id)) { // 宿舍：墙纸、地板各烘焙成透明的一层，客户端按玩家选的样式叠起来（用到哪张才加载哪张）
    const lv = dormInteriorLevel(s.id);
    for (let i = 0; i < DORM_WALL_STYLES.length; i++) await paintInterior(s, { wall: i, floor: 0, layer: 'wall' }).save(join(GEN, `${skinFile(lv, 'w', i)}.png`));
    for (let i = 0; i < DORM_FLOOR_STYLES.length; i++) await paintInterior(s, { wall: 0, floor: i, layer: 'floor' }).save(join(GEN, `${skinFile(lv, 'f', i)}.png`));
  }
  const rows: Uint8Array[] = Array.from({ length: s.h }, () => new Uint8Array(s.w));
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let b = y < 3 || x === 0 || x === s.w - 1 || y === s.h - 1;
    if (y === s.h - 1 && x >= s.exit.x && x < s.exit.x + s.exit.w) b = false;
    rows[y][x] = b ? 1 : 0;
  }
  for (const p of s.partitions ?? []) for (let y = p.y0; y <= p.y1; y++) if (!(p.gap && y >= p.gap.y && y < p.gap.y + p.gap.h)) rows[y][p.x] = 1; // 隔断挡路，只有内部门洞能过
  const objects: any[] = []; const furnLabels: any[] = []; const interacts: any[] = [];
  for (const f of s.furniture) {
    const ft = foot[f.k]; if (!ft) throw new Error(`未知家具 ${f.k} (${s.id})`);
    const rot = f.rot ?? 0, ri = ft.rots[rot]; if (!ri) throw new Error(`${f.k} 不能旋转 (${s.id})`);
    if (!f.top) for (let j = 0; j < ri.fh; j++) for (let i = 0; i < ri.fw; i++) { const yy = f.y + j, xx = f.x + i; if (rows[yy]?.[xx] !== undefined) rows[yy][xx] = 1; }
    const bottom = (f.y + ri.fh) * 16;
    objects.push({ k: rot ? `${f.k}@${rot}` : f.k, x: f.x * 16 - ri.mx, y: f.y * 16 - ri.my, depth: f.top ? bottom + (f.dz ?? 24) + 0.1 : bottom }); // 桌面小件：层级抬高，盖在桌子上面
    if (f.interact || f.act) { // 互动区（像素，按脚点判断）：墙面挂件在它下面两格内；有占地的家具在占地外扩一格内
      const wall = ri.fh === 0, x0 = f.x * 16 - 8, x1 = (f.x + ri.fw) * 16 + 8;
      interacts.push({ x0, x1, y0: wall ? 0 : f.y * 16 - 8, y1: wall ? Math.max((f.y + 3) * 16, 80) : (f.y + ri.fh) * 16 + 16, title: f.text ?? (FURN_INFO[f.k] ?? DORM_INFO[f.k] ?? DECOR_INFO[f.k])?.name ?? f.k, text: f.interact ?? '', ...(f.act ? { act: f.act } : {}) });
    }
    const lb = furnitureLabel(f, { ...ri, text: FURN_TEXT[f.k]?.mode }); if (lb) furnLabels.push(lb);
  }
  const npcs = (s.npcs ?? []).map((n) => ({ ...n }));
  out.push({
    id: s.id, name: s.name, w: s.w, h: s.h, bg: `interior-${s.id}`, desc: s.desc, labels: [...(s.labels ?? []), ...furnLabels], interacts,
    collision: rows.map((r) => Array.from(r).join('')), objects, npcs,
    exit: s.exit, spawn: { x: s.exit.x + s.exit.w / 2, y: s.h - 2.2 },
  });
}
writeFileSync(join(GEN, 'interiors.json'), JSON.stringify(out));
console.log('室内完成：', out.map((o) => o.id).join(', '));
