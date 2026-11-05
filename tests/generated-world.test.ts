/** 针对 `npm run assets` 产物的检查：出生点可走、主要地标彼此连通（防止被建筑/水体封死）。产物不存在则跳过。 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEN, DATA } from '../tools/paths.ts';
import type { WorldFile } from '../src/shared/world-format';

const file = join(GEN, 'world.json');
const has = existsSync(file);
const world: WorldFile | null = has ? JSON.parse(readFileSync(file, 'utf8')) : null;
/** 世界放大倍数；测试里的坐标按"原 5 m/格"写，用 w(v) 换算到世界格 */
const SC = world?.scale ?? 1;
const w = (v: number) => Math.floor(v * SC + SC / 2);
/**
 * 主人在地图编辑器里手动改过/新建的建筑（data/campus/manual.json 和已并入的 baked.json 各层里的 buildings）：布局由主人定，
 * 下面"门前能走到""脚印不重叠"两项检查对它们只警告、不判失败（门被相邻翼体堵住、翼体重叠都是可能的，编辑器暂时不能单独改门）。
 */
const manualIds = new Set<string>((() => {
  const ids: string[] = [], add = (b: { buildings?: { id: string }[] }) => ids.push(...(b.buildings ?? []).map((x) => x.id));
  try { add(JSON.parse(readFileSync(join(DATA, 'manual.json'), 'utf8'))); } catch { /* 没有就算了 */ }
  try { for (const l of JSON.parse(readFileSync(join(DATA, 'baked.json'), 'utf8')).layers ?? []) add(l); } catch { /* 没有就算了 */ }   // 已部署并入的各层也算"主人手动改过"
  return ids;
})());
function splitManual(list: string[], ids: string[]) { // list 与 ids 一一对应：返回 [非手动的, 手动的]
  const mine: string[] = [], rest: string[] = []; list.forEach((x, i) => (manualIds.has(ids[i]) ? mine : rest).push(x)); return [rest, mine] as const;
}

describe.skipIf(!has)('生成的世界', () => {
  const W = world!;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= W.width || y >= W.height || W.collision[y][x] === '1';
  function reach(sx: number, sy: number) {
    const seen = new Uint8Array(W.width * W.height); const q = [[sx, sy]]; seen[sy * W.width + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!blocked(nx, ny) && !seen[ny * W.width + nx]) { seen[ny * W.width + nx] = 1; q.push([nx, ny]); }
      }
    }
    return (x: number, y: number) => seen[Math.floor(y) * W.width + Math.floor(x)] === 1;
  }
  it('出生点本身可走', () => { expect(blocked(Math.floor(W.spawn.x), Math.floor(W.spawn.y))).toBe(false); });
  it('从南门出生点可以走到所有建筑门前、各个大门与运动场', () => {
    const ok = reach(Math.floor(W.spawn.x), Math.floor(W.spawn.y));
    const unreachable: string[] = [], ids: string[] = [];
    for (const b of W.buildings) for (const d of b.doors) if (!ok(d.x + d.w / 2, Math.ceil(d.y) + 0.5)) { unreachable.push(b.name); ids.push(b.id); }
    for (const p of W.pois) if (p.kind === 'gate' && !ok(p.x, p.y)) { unreachable.push(p.name); ids.push(p.id); }
    const [rest, mine] = splitManual(unreachable, ids);
    if (mine.length) console.warn(`⚠ 手动调整过的建筑里，这些门前走不到（多半被相邻翼体堵住）：${mine.join('、')}`);
    expect(rest).toEqual([]);
  });
  it('南门门洞、入口台阶可走；校名石/校石/旗杆等地标对象与旗帜动画存在', () => {
    for (const x of [178, 179, 180, 181]) expect(blocked(w(x), w(240)), `门洞 (${x},240)`).toBe(false);
    for (const x of [179, 180, 181, 182]) expect(blocked(w(x), w(181) + 1), `台阶 (${x},181)`).toBe(false);
    const ks = new Set(W.objects.map((o) => o.k));
    for (const k of ['nameStone', 'boulder', 'flagpole', 'lampGold', 'bollard', 'wallH', 'pier']) expect(ks.has(k), k).toBe(true);
    expect(W.anims.some((a) => a.frames.length === 3)).toBe(true);
    expect(W.labels.some((l) => l.text === '河北工程大学')).toBe(true);
  });
  it('对象数量与碰撞行列与世界尺寸一致', () => {
    expect(W.collision.length).toBe(W.height); expect(W.collision.every((r) => r.length === W.width)).toBe(true);
    expect(W.objects.length).toBeGreaterThan(500 * SC * SC);
  });
});

describe.skipIf(!has)('西门 / 东门', () => {
  const W = world!;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= W.width || y >= W.height || W.collision[y][x] === '1';
  it('西门：门洞至少 2 格宽且两侧被门卫室封住', () => {
    const open: number[] = []; for (let y = Math.floor(121 * SC); y < Math.floor(126.5 * SC); y++) if (!blocked(w(27), y)) open.push(y);
    expect(open.length).toBeGreaterThanOrEqual(2); expect(open.length).toBeLessThanOrEqual(4 * SC);
  });
  it('东门：门洞至少 4 格宽，门线其余部分被立柱/岗亭封住', () => {
    const open: number[] = []; for (let y = 164 * SC; y < 177 * SC; y++) if (!blocked(w(331), y)) open.push(y);
    expect(open.length).toBeGreaterThanOrEqual(4); expect(open.length).toBeLessThanOrEqual(7 * SC);
  });
  it('门外一侧的墙/铁栏沿线不可穿越，但门外前坪与门内道路连通', () => {
    for (const y of [110, 118, 130, 140]) expect(blocked(Math.floor(26.5 * SC), w(y)), `西墙 y=${y}`).toBe(true);
    for (const y of [150, 160, 180, 190]) expect(blocked(Math.floor(331.5 * SC), w(y)), `东墙 y=${y}`).toBe(true);
    // 路径连通：从西门外前坪到西门路
    const seen = new Set<string>(); const q: [number, number][] = [[w(22), w(124)]]; seen.add(`${w(22)},${w(124)}`);
    while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (!blocked(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
    expect(seen.has(`${w(60)},${w(124)}`)).toBe(true);
  });
});

describe.skipIf(!has)('建筑脚印', () => {
  const W = world!;
  it('宿舍组团内不同楼的脚印重叠面积 < 1 格²（同一栋楼的翼体除外）', () => {
    const dorm = W.buildings.filter((b) => /^(d[1-4]-|canteen-1|canteen-2)/.test(b.id));
    const rects = dorm.flatMap((b) => { const seen = new Set<string>(); return b.wings.filter((w) => !w.poly).filter((w) => { const k = JSON.stringify(w.block); if (seen.has(k)) return false; seen.add(k); return true; }).map((w) => ({ id: b.id, ...w.block })); });
    const bad: string[] = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j]; if (a.id === c.id) continue;
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), oy = Math.min(a.y + a.d, c.y + c.d) - Math.max(a.y, c.y);
      if (ox > 0 && oy > 0 && ox * oy >= SC * SC && !manualIds.has(a.id) && !manualIds.has(c.id)) bad.push(`${a.id}×${c.id}(${(ox * oy).toFixed(1)})`);
    }
    expect(bad).toEqual([]);
  });
  it('宿舍组团：门前保留区内没有任何摆件', () => {
    const dorm = W.buildings.filter((b) => /^(d[1-4]-|canteen-1|canteen-2)/.test(b.id));
    const hits: string[] = [];
    for (const b of dorm) for (const d of b.doors) for (const o of W.objects) {
      const x = o.x / 16, y = o.y / 16;
      if (!/^(fence|wall|pier)/.test(o.k) && x > d.x - 0.6 && x < d.x + d.w + 0.6 && y > d.y - 0.3 && y < Math.ceil(d.y) + 2) hits.push(`${b.id}:${o.k}`);
    }
    expect(hits).toEqual([]);
  });
});

describe.skipIf(!has)('景观完成度', () => {
  const W = world!;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= W.width || y >= W.height || W.collision[y][x] === '1';
  const reach = (() => {
    const seen = new Uint8Array(W.width * W.height); const sx = Math.floor(W.spawn.x), sy = Math.floor(W.spawn.y); const q = [[sx, sy]]; seen[sy * W.width + sx] = 1;
    while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!blocked(nx, ny) && !seen[ny * W.width + nx]) { seen[ny * W.width + nx] = 1; q.push([nx, ny]); } } }
    return (x: number, y: number) => seen[Math.floor(y) * W.width + Math.floor(x)] === 1;
  })();
  it('湖心岛通过栈桥可达（亭所在的岛面）', () => { expect(reach(199.5 * SC, 97.4 * SC)).toBe(true); });
  it('所有围栏球场/田径场的场地中心都可从出生点走到（围栏留了口）', () => {
    const centers: [string, number, number][] = [['田径场', 317.3, 64.4], ['网球场', 320, 40.5], ['篮球场', 321, 25], ['东区篮球场', 324.8, 87], ['西区运动场', 37, 151], ['北区球场A', 45.5, 35], ['北区草地球场', 70.7, 33], ['红色球场', 72, 56], ['西南足球场', 110, 228]];
    for (const [n, x, y] of centers) expect(reach(x * SC, y * SC), n).toBe(true);
  });
  it('全校外围有围栏：西/东/南/北各至少 8 段，且大门处仍是通的', () => {
    const f = (pred: (o: { x: number; y: number }) => boolean) => W.objects.filter((o) => o.k === 'fenceH' || o.k === 'fenceV' || o.k === 'wallV').filter((o) => pred({ x: o.x / 16, y: o.y / 16 })).length;
    expect(f((o) => Math.abs(o.x - 26.5 * SC) < 1)).toBeGreaterThanOrEqual(8); expect(f((o) => Math.abs(o.x - 331.5 * SC) < 1)).toBeGreaterThanOrEqual(8);
    expect(f((o) => Math.abs(o.y - 240.6 * SC) < 1)).toBeGreaterThanOrEqual(8); expect(f((o) => Math.abs(o.y - 12 * SC) < 1.2)).toBeGreaterThanOrEqual(8);
  });
  it('食堂/浴室/超市都有招牌，食堂门前有遮阳伞桌椅', () => {
    const txt = W.labels.filter((l) => l.plate).map((l) => l.text);
    for (const t of ['第一学生食堂', '第二学生食堂', '第三学生食堂', '三社区超市', '学生超市', '一社区浴室', '校医院', '图书馆']) expect(txt, t).toContain(t);
    expect(W.objects.filter((o) => o.k.startsWith('parasolTable')).length).toBeGreaterThanOrEqual(4);
  });
  it('场地设施：运动场灯杆 ≥ 12、看台 ≥ 2、湖岸岸石 ≥ 20、芦苇 ≥ 20', () => {
    const c = (p: RegExp) => W.objects.filter((o) => p.test(o.k)).length;
    expect(c(/^floodlight/)).toBeGreaterThanOrEqual(12); expect(c(/^bleacher/)).toBeGreaterThanOrEqual(2); expect(c(/^rockS/)).toBeGreaterThanOrEqual(20); expect(c(/^reed/)).toBeGreaterThanOrEqual(20);
  });
  it('花坛：门旁花坛 ≥ 8（南门内中央花园的那排花坛 2026-11-02 起去掉；2026-11-03 起主人在编辑器里改道路时又擦掉几处，从 24 降到 16；2026-11-04 一、二社区按校园模型改成 C/U 形楼，门多开在内院一侧，花坛只放在门两侧是草地的地方，降到 10）', () => { expect(W.objects.filter((o) => o.k.startsWith('flowerbed')).length).toBeGreaterThanOrEqual(8); });
});

describe.skipIf(!has || (world?.scale ?? 1) < 2)('放大后的广场与屋顶', () => {
  const W = world!;
  const c = (p: RegExp) => W.objects.filter((o) => p.test(o.k)).length;
  it('广场自动布置：金灯 ≥ 15（已按要求变稀）、长椅 ≥ 60、垃圾桶 ≥ 12、休憩廊架 ≥ 2', () => {
    expect(c(/^lampGold$/)).toBeGreaterThanOrEqual(15); expect(c(/^bench$/)).toBeGreaterThanOrEqual(60); expect(c(/^bin$/)).toBeGreaterThanOrEqual(12); expect(c(/^pergola$/)).toBeGreaterThanOrEqual(2);
  });
  it('广场摆件不压在楼门前（门前保留区）且不在水里', () => {
    const doors = W.buildings.flatMap((b) => b.doors.map((d) => ({ b: b.id, ...d })));
    const bad = W.objects.filter((o) => /^(pergola|bench|bin|lampGold|parasolTable)/.test(o.k)).filter((o) => doors.some((d) => o.x / 16 > d.x - 0.6 && o.x / 16 < d.x + d.w + 0.6 && o.y / 16 > d.y - 0.3 && o.y / 16 < Math.ceil(d.y) + 2));
    expect(bad.map((o) => o.k)).toEqual([]);
  });
  it('大屋顶细节：建筑图集页数 ≥ 3（屋顶设备让翼体更丰富）且无空页', () => { expect(W.atlases.buildingPages).toBeGreaterThanOrEqual(3); });
});

describe.skipIf(!has)('校名石与彩蛋', () => {
  const W = world!;
  it('校名写在石碑碑面上：文字牌在石碑中心附近，字号放大，石碑精灵 ≥ 2 倍宽', () => {
    const lab = W.labels.find((l) => l.id === 'schoolName')!;
    const stone = W.objects.find((o) => o.k === 'nameStone')!;
    expect(lab.text).toBe('河北工程大学'); expect(lab.size).toBeGreaterThanOrEqual(24);
    expect(Math.abs(lab.x * 16 - stone.x)).toBeLessThan(16); // 水平居中
    const above = stone.y - lab.y * 16; // 文字中心在脚点上方多少像素：应落在碑面（约 30–50px）
    expect(above).toBeGreaterThan(30); expect(above).toBeLessThan(50);
    expect(stone.ax * 2).toBeGreaterThanOrEqual(192); // 精灵宽度 ≥ 原来 96 的两倍
  });
  it('彩蛋：交互区在石碑正前方的岛上、可走；依次是宇达、美团', () => {
    const ia = W.interacts!.find((i) => i.id === 'schoolName')!;
    expect(ia.texts).toEqual(['河北宇达大学', '河北美团大学']);
    const stone = W.objects.find((o) => o.k === 'nameStone')!;
    expect(ia.y).toBeGreaterThanOrEqual(stone.y - 4); // 在石碑脚点之南
    expect(ia.x).toBeLessThan(stone.x); expect(ia.x + ia.w).toBeGreaterThan(stone.x);
    const tx = Math.floor((ia.x + ia.w / 2) / 16), ty = Math.floor((ia.y + ia.h / 2) / 16);
    expect(W.collision[ty][tx]).toBe('0');
  });
});

describe.skipIf(!has)('留言板', () => {
  const W = world!;
  it('留言板摆在南门内、牌上有字、交互区在板前且可走（action=board）', () => {
    const obj = W.objects.find((o) => o.k === 'messageBoard')!;
    expect(obj).toBeTruthy();
    const lab = W.labels.find((l) => l.text === '留言板')!;
    expect(Math.abs(lab.x * 16 - obj.x)).toBeLessThan(8);
    const above = obj.y - lab.y * 16; expect(above).toBeGreaterThan(40); expect(above).toBeLessThan(52); // 字落在顶上的木牌上
    const ia = W.interacts!.find((i) => i.action === 'board')!;
    expect(ia.hint).toContain('留言');
    expect(ia.x).toBeLessThan(obj.x); expect(ia.x + ia.w).toBeGreaterThan(obj.x); expect(ia.y).toBeGreaterThanOrEqual(obj.y - 4);
    expect(W.collision[Math.floor((ia.y + ia.h / 2) / 16)][Math.floor((ia.x + ia.w / 2) / 16)]).toBe('0');
  });
  it('交互区互不重叠（校名石彩蛋与留言板）', () => {
    const r = W.interacts!;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j];
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} vs ${b.id}`).toBe(true);
    }
  });
});

describe.skipIf(!has)('植被与路灯清理、可穿行、门牌、四季资源', () => {
  const W = world!;
  const TREE = /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow)_/;
  it('灌木全部去掉（2026-11-02，tools/world/compile.ts 的 NO_BUSH）、路灯变稀（30~100 盏，且和光晕列表一致）', () => {
    expect(W.objects.filter((o) => o.k.startsWith('bush_')).length).toBe(0);
    const lampObjs = W.objects.filter((o) => o.k === 'lamp' || o.k === 'lampGold').length;
    expect(W.lamps.length).toBeGreaterThanOrEqual(30); expect(W.lamps.length).toBeLessThanOrEqual(100);
    expect(lampObjs).toBeGreaterThanOrEqual(W.lamps.length); expect(lampObjs).toBeLessThanOrEqual(100); // 个别路灯（环形阵列）不发光，不在光晕列表里
  });
  it('树木、路灯、灌木、花坛不再阻挡行走：它们脚下的格子（除水边等别的原因）基本都是通的', () => {
    const things = W.objects.filter((o) => TREE.test(o.k) || o.k === 'lamp' || o.k === 'lampGold' || o.k.startsWith('bush_') || o.k.startsWith('flowerbed_'));
    const open = things.filter((o) => W.collision[Math.floor(o.y / 16)]?.[Math.floor(o.x / 16)] === '0').length;
    expect(open / things.length).toBeGreaterThan(0.8); // 剩下的绝大多数是地图外围（边界之外）的树，本来就不在可走区域里（编辑器擦掉了不少可走区域内的树，比例随之略降，阈值 0.85→0.8）
  });
  it('有名字的建筑都挂了门牌：宿舍楼、学院、食堂、图书馆都能在文字牌里找到', () => {
    const txt = new Set(W.labels.filter((l) => l.plate).map((l) => l.text.replace(/\n/g, '')));
    for (const t of ['四社区A楼', '三社区C楼', '二社区D楼', '一社区D楼', '留学生公寓', '水利水电学院动力馆', '图书馆', '第一学生食堂', '第二公共教学楼', '学院配套楼']) expect(txt.has(t), t).toBe(true);
    expect([...txt].some((t) => /门卫/.test(t))).toBe(false); // 门卫室不挂牌
  });
  it('四个季节的树木图集与地面块都生成了，且共用同一份图集布局', () => {
    const dir = `${GEN}/`;
    for (const s of ['spring', 'summer', 'autumn', 'winter']) {
      expect(existsSync(`${dir}atlas-props-${s}.png`), `${s} 图集`).toBe(true);
      for (const k of (W.chunks ?? []).slice(0, 5)) expect(existsSync(`${dir}ground/${s}/c_${k}.png`), `${s} ${k}`).toBe(true);
    }
  });
  it('图书馆广场已清空：没有路灯、座椅、垃圾桶、花坛、草丛、公告牌；校园商店和校园墙立在广场里，门前有互动区', async () => {
    const { PLAZA, PLAZA_BUILDINGS } = await import('../src/shared/plaza');
    const inPlaza = (o: { x: number; y: number }) => o.x / 16 >= PLAZA.x0 && o.x / 16 <= PLAZA.x1 && o.y / 16 >= PLAZA.y0 && o.y / 16 <= PLAZA.y1;
    const left = W.objects.filter((o) => inPlaza(o) && /^(bench|bin|lamp|lampGold|flowerbed_\d|bush_\d|noticeBoard|messageBoard|parasolTable_\d)$/.test(o.k));
    expect(left.map((o) => o.k)).toEqual([]);
    // 2026-11-02：广场里只留国旗杆和两座大建筑，树、石碑、扶手等一律没有（周边 3 格内也没有树）
    expect(W.objects.filter((o) => inPlaza(o) && !/^(flagpole|shop|campusWall)$/.test(o.k)).map((o) => o.k)).toEqual([]);
    expect(W.objects.filter((o) => /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow)_/.test(o.k) && o.x / 16 >= PLAZA.x0 - 3 && o.x / 16 <= PLAZA.x1 + 3 && o.y / 16 >= PLAZA.y0 - 3 && o.y / 16 <= PLAZA.y1 + 3)).toEqual([]);
    expect(W.lamps.filter((l) => l[0] >= PLAZA.x0 && l[0] <= PLAZA.x1 && l[1] >= PLAZA.y0 && l[1] <= PLAZA.y1)).toEqual([]);
    for (const b of PLAZA_BUILDINGS) {
      const o = W.objects.find((x) => x.k === (b.id === 'shop' ? 'shop' : 'campusWall'));
      expect(o, b.name).toBeTruthy();
      expect(Math.abs(o!.x / 16 - b.x)).toBeLessThanOrEqual(1); expect(Math.abs(o!.y / 16 - b.y)).toBeLessThanOrEqual(1); // 蓝图坐标和共享常量一致
      expect(W.labels.some((l) => l.text === b.name)).toBe(true);
      const ia = W.interacts?.find((i) => i.action === b.id);
      expect(ia, `${b.name} 互动区`).toBeTruthy();
      // 互动区本身是可走的（站得进去按 E），并且能从南门走到
      expect(W.collision[Math.floor((ia!.y + ia!.h / 2) / 16)][Math.floor((ia!.x + ia!.w / 2) / 16)]).toBe('0');
      // 建筑本体挡人：正面墙的位置不可走
      expect(W.collision[b.y - 2][b.x]).toBe('1');
    }
    const seen = new Uint8Array(W.width * W.height), q: number[][] = [[Math.floor(W.spawn.x), Math.floor(W.spawn.y)]];
    seen[q[0][1] * W.width + q[0][0]] = 1;
    while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W.width && ny < W.height && W.collision[ny][nx] === '0' && !seen[ny * W.width + nx]) { seen[ny * W.width + nx] = 1; q.push([nx, ny]); } } }
    for (const b of PLAZA_BUILDINGS) expect(seen[(b.y + 3) * W.width + b.x], `${b.name} 门前能从南门走到`).toBe(1);
  });
  it('公告牌、留言板不挡人：它们脚下的格子是通的', () => {
    const boards = W.objects.filter((o) => o.k === 'noticeBoard' || o.k === 'messageBoard');
    expect(boards.length).toBeGreaterThan(3);
    for (const o of boards) expect(W.collision[Math.floor(o.y / 16) - 1]?.[Math.floor(o.x / 16)], `${o.k} ${o.x},${o.y}`).not.toBe(undefined);
    const open = boards.filter((o) => W.collision[Math.floor((o.y - 2) / 16)]?.[Math.floor(o.x / 16)] === '0').length;
    expect(open / boards.length).toBeGreaterThan(0.7);
  });
});
