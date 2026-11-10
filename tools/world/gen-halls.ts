/**
 * 生成"大楼室内"的第一版数据：三个餐厅（各 3 层）、图书馆、第一/第二公共教学楼（各 5 层）、第二/第三超市。
 *   npx tsx tools/world/gen-halls.ts          → 写 data/interiors/<id>.json（直接覆盖；之后主人可以用室内编辑器 /interior 随便改）
 * 这只是"起稿工具"：版式借鉴常见的校园食堂 / 教学楼布局（北墙一排窗口、中间餐桌、角落楼梯），窗口名、台词都是占位，**没有核实**，
 * 清单见 docs/feature/20261110-dining-halls/SOURCES.md（本脚本一并生成）。改过的室内文件不要再跑本脚本，不然会被覆盖。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../paths.ts';
import type { InteriorSpec, InteriorFurn, InteriorNpc, InteriorStair, InteriorTheme } from '../../src/shared/interior.ts';

type Spec = InteriorSpec;
const F = (k: string, x: number, y: number, extra: Partial<InteriorFurn> = {}): InteriorFurn => ({ k, x, y, ...extra });
const sourceRows: string[] = []; // SOURCES.md 的表格行

// ------------------------------------------------------------------ 餐厅
interface CanteenFloor {
  id: string; building: string; floor: number; floors: number; name: string; theme: InteriorTheme;
  windows: string[]; tableW: 3 | 4 | 6; rows: 2 | 3; lounge?: boolean; desc: string; npcs: InteriorNpc[];
}
const W = 32, H = 22;
function canteenFloor(o: CanteenFloor): Spec {
  const furniture: InteriorFurn[] = [], n = o.windows.length;
  // 北墙一排取餐窗口：n 个打饭窗口，每个上方一块招牌
  const cw = n >= 5 ? 5 : n === 4 ? 5 : 7, gap = n >= 5 ? 1 : 2;
  const x0 = Math.round((W - (n * cw + (n - 1) * gap)) / 2);
  o.windows.forEach((name, i) => {
    const x = x0 + i * (cw + gap), pw = cw - 1;
    furniture.push(F(cw === 5 ? 'foodcounter5' : 'foodcounter7', x, 3));
    furniture.push(F(pw === 4 ? 'plaque4' : 'plaque5', x + Math.floor((cw - pw) / 2), 2, { text: name }));
    sourceRows.push(`| ${o.name} | ${name} | 占位（泛称） | 未核实 |`);
  });
  // 餐桌组：每组 = 北侧一排椅子（朝南）+ 长桌（2 格高）+ 南侧一排椅子（朝北）；右边留给楼梯
  const rowsY = o.rows === 3 ? [5, 10, 15] : [6, 12]; // 最后一排椅子之后留 2 行空地：出生点（门洞里面）和通向楼梯的路
  const step = o.tableW + (o.tableW === 3 ? 2 : o.tableW === 4 ? 2 : 2);
  for (const y of rowsY) for (let x = 2; x + o.tableW <= 25; x += step) {
    furniture.push(F(`ltable${o.tableW}`, x, y + 1));
    for (let i = 0; i < o.tableW; i++) { furniture.push(F('bchair_d', x + i, y)); furniture.push(F('bchair_u', x + i, y + 3)); }
  }
  if (o.lounge) { furniture.push(F('sofa', 3, 18), F('sofa', 6, 18), F('plant', 9, 18), F('sofa', 12, 18)); }
  // 角落小件
  furniture.push(F('plant', 1, 4), F('plant', 30, 4), F('waterdisp', 25, 4), F('bin', 30, 20), F('bin', 1, 20));
  if (o.floor === 1) furniture.push(F('notice3', 25, 2), F('vending', 28, 4));
  const stairs: InteriorStair[] = [];
  if (o.floor < o.floors) stairs.push({ dir: 'up', x: 27, y: 14, to: `${o.building}-f${o.floor + 1}` });
  if (o.floor > 1) stairs.push({ dir: 'down', x: 27, y: 18, to: `${o.building}-f${o.floor - 1}` });
  const s: Spec = {
    id: `${o.building}-f${o.floor}`, name: o.name, w: W, h: H, theme: o.theme, floor: o.floor, building: o.building, desc: o.desc,
    windows: [], posters: [{ x: 1 }, { x: 29 }], furniture, npcs: o.npcs,
  };
  if (o.floor === 1) { s.exit = { x: 14, w: 4 }; s.open = true; } // 一层是建筑的入口：open = 开放（二层以上没有入口，只能走楼梯 / 传送进去）
  if (stairs.length) s.stairs = stairs;
  return s;
}
const aunt = (look: number, x: number, lines: string[]): InteriorNpc => ({ look, x, y: 4.6, name: '打饭阿姨', facing: 'down', lines });
const guy = (look: number, x: number, y: number, name: string, lines: string[], facing: InteriorNpc['facing'] = 'down'): InteriorNpc => ({ look, x, y, name, facing, lines });

const canteens: { id: string; label: string; theme: InteriorTheme; tableW: 3 | 4 | 6; floors: { title: string; windows: string[]; rows?: 2 | 3; lounge?: boolean; npcs: InteriorNpc[] }[] }[] = [
  { id: 'canteen-1', label: '第一餐厅', theme: 'canteen', tableW: 4, floors: [
    { title: '一层 大众餐', windows: ['大众套餐', '面食', '米饭套餐', '小炒', '麻辣烫'], npcs: [aunt(9, 8.5, ['同学，今天想吃点什么？', '红烧肉今天限量，去晚就没啦。', '慢点吃，不够再来加！']), guy(6, 12.4, 9.4, '干饭的同学', ['这里的面条最好吃。', '吃完去图书馆占座。']), guy(8, 19.6, 14.4, '等朋友的同学', ['我在等室友一起吃饭。', '他每次都说马上到，每次都要二十分钟。'], 'up')] },
    { title: '二层 风味餐厅', windows: ['特色盖饭', '铁板炒饭', '煲仔饭', '炸鸡汉堡'], npcs: [aunt(12, 14, ['二楼的窗口人少一点，菜是现做的。', '想吃什么跟我说。']), guy(5, 8.4, 9.4, '同学', ['一楼人太多了，我每次都上二楼。'])] },
    { title: '三层 自选餐厅', windows: ['自选菜品', '小火锅', '轻食沙拉'], rows: 2, lounge: true, npcs: [aunt(10, 15, ['自选的按重量算，盛多少拿多少。']), guy(7, 5.5, 17.4, '看手机的同学', ['这里有沙发，吃完能歇一会儿。'], 'up')] },
  ] },
  { id: 'canteen-2', label: '第二餐厅', theme: 'canteen2', tableW: 6, floors: [
    { title: '一层 大众餐', windows: ['大众套餐', '面食', '米饭套餐', '饺子馄饨', '小吃'], npcs: [aunt(11, 9, ['同学要点什么？', '汤在那边，自己盛。']), guy(14, 12.6, 9.4, '干饭的同学', ['中午下课，这儿一到十二点就坐满。']), guy(3, 21.4, 14.4, '收盘子的叔叔', ['吃完把餐盘放回回收处，谢谢啦。'])] },
    { title: '二层 风味餐厅', windows: ['砂锅', '烤鱼饭', '特色面', '卤味'], npcs: [aunt(13, 14.4, ['二楼有砂锅，要等一会儿，坐着等就行。']), guy(2, 10.6, 14.4, '同学', ['我专门来二楼吃砂锅。'])] },
    { title: '三层 特色餐厅', windows: ['自选快餐', '烧烤', '饮品'], rows: 2, lounge: true, npcs: [aunt(9, 15, ['三楼的饮品窗口下午最忙。']), guy(15, 5.5, 17.4, '写作业的同学', ['这里安静，适合边吃边写作业。'], 'up')] },
  ] },
  { id: 'canteen-3', label: '第三餐厅', theme: 'canteen3', tableW: 3, floors: [
    { title: '一层 大众餐', windows: ['大众套餐', '面食', '米饭套餐', '麻辣烫', '小炒'], npcs: [aunt(8, 8, ['想吃点什么？今天有番茄鸡蛋面。']), guy(4, 9.4, 9.4, '同学', ['这里离宿舍近，早上我常来吃早餐。']), guy(16, 19.4, 14.4, '排队的同学', ['人多的时候队伍能排到门口。'], 'up')] },
    { title: '二层 风味餐厅', windows: ['盖浇饭', '煎饼果子', '冒菜', '烤冷面'], npcs: [aunt(10, 15, ['二楼的小吃种类多。']), guy(6, 12.4, 9.4, '同学', ['我最爱煎饼果子。'])] },
    { title: '三层 自选餐厅', windows: ['自选菜品', '麻辣香锅', '素食'], rows: 2, lounge: true, npcs: [aunt(11, 15, ['三楼窗口少，但东西新鲜。']), guy(18, 5.5, 17.4, '看书的同学', ['吃完饭坐一会儿再回宿舍。'], 'up')] },
  ] },
];
const out: Spec[] = [];
for (const c of canteens) c.floors.forEach((fl, i) => out.push(canteenFloor({
  id: c.id, building: c.id, floor: i + 1, floors: c.floors.length, name: `${c.label} · ${i + 1}F`, theme: c.theme,
  windows: fl.windows, tableW: c.tableW, rows: fl.rows ?? 3, lounge: fl.lounge, desc: i === 0 ? `${fl.title} · 走到南侧门口即可离开，右侧楼梯上二楼` : `${fl.title} · 走楼梯上下楼`, npcs: fl.npcs,
})));

// ------------------------------------------------------------------ 教学楼（每栋 5 层）
function teaching(b: 'edu-1' | 'edu-2', label: string, theme: InteriorTheme): Spec[] {
  const TW = 40, TH = 20, res: Spec[] = [];
  for (let fl = 1; fl <= 5; fl++) {
    const furniture: InteriorFurn[] = [], npcs: InteriorNpc[] = [], stairs: InteriorStair[] = [];
    const rooms = fl === 5 ? ['机房', '自习室'] : [`${fl}01`, `${fl}02`];
    // 左边门厅：楼梯、公告栏、饮水机、售货机、长椅
    if (fl < 5) stairs.push({ dir: 'up', x: 2, y: 4, to: `${b}-f${fl + 1}` });
    if (fl > 1) stairs.push({ dir: 'down', x: 6, y: 4, to: `${b}-f${fl - 1}` });
    furniture.push(F('notice3', 8, 2), F('waterdisp', 1, 4), F('vending', 9, 4), F('sofa', 3, 12), F('sofa', 7, 12), F('plant', 1, 16), F('plant', 9, 16), F('cab4', 2, 15));
    if (fl === 1) furniture.push(F('plant', 1, 12));
    // 两间教室：讲台 + 白板 + 四列课桌（每桌 2 个座位）
    const roomX = [12, 27];
    roomX.forEach((rx, ri) => {
      const pcLab = fl === 5 && ri === 0, name = rooms[ri];
      furniture.push(F('whiteboard', rx + 3, 2), F('whiteboard', rx + 8, 2), F('podium', rx + 6, 4));
      for (const dy of [7, 10, 13, 16]) for (let c = 0; c < 4; c++) {
        const dx = rx + 1 + c * 3;
        furniture.push(F(pcLab ? 'deskpc' : 'desk', dx, dy), F('chairup', dx, dy + 1), F('chairup', dx + 1, dy + 1));
      }
      npcs.push({ look: 3 + ((fl + ri) % 12), x: rx + 6.5, y: 5.4, name: ri === 0 ? '老师' : '值日的同学', facing: 'down', lines: pcLab ? ['机房的电脑都开着，别乱装软件。'] : ri === 0 ? ['这节课讲新的内容，大家坐前面一点。', '后排的同学听得清吗？'] : ['我在擦黑板，一会儿就上课了。'] });
      sourceRows.push(`| ${label} · ${fl}F | ${name}${pcLab ? '（机房）' : ''} | 占位 | 未核实 |`);
    });
    npcs.push({ look: 5 + fl, x: 5.5, y: 9.4, name: '路过的同学', facing: 'right', lines: ['我去教室占座。', '这层的饮水机在门厅里。'] });
    const spec: Spec = {
      id: `${b}-f${fl}`, name: `${label} · ${fl}F`, w: TW, h: TH, theme, floor: fl, building: b, windows: [],
      desc: fl === 1 ? '一层门厅 · 走到南侧门口即可离开，门厅里的楼梯可以上下楼' : '走楼梯上下楼，教室门在隔断上',
      partitions: [{ x: 11, y0: 3, y1: TH - 2, gap: { y: 14, h: 3 } }, { x: 26, y0: 3, y1: TH - 2, gap: { y: 14, h: 3 } }],
      labels: roomX.map((rx, ri) => ({ text: rooms[ri], x: rx + 6.5, y: 1.4, size: 10, color: '#3a3f4c' })),
      furniture, npcs, stairs, posters: [{ x: 2 }],
    };
    if (fl === 1) { spec.exit = { x: 4, w: 4 }; spec.open = true; }
    res.push(spec);
  }
  return res;
}
out.push(...teaching('edu-1', '第一教学楼', 'hall'), ...teaching('edu-2', '第二教学楼', 'classroom'));

// ------------------------------------------------------------------ 图书馆（一层）
{
  const furniture: InteriorFurn[] = [];
  const west = [2, 7, 12], east = [24, 29, 34];
  for (const x of [...west, ...east]) for (const y of [3, 8, 11]) furniture.push(F('shelf4', x, y));
  furniture.push(F('counter5', 17, 5));
  for (const y of [14, 20]) for (const x of [3, 11, 24, 31]) {
    furniture.push(F('ltable5', x, y + 1));
    for (let i = 0; i < 5; i++) { furniture.push(F('chair', x + i, y)); furniture.push(F('chairup', x + i, y + 3)); }
  }
  furniture.push(F('sofa', 16, 16), F('sofa', 21, 16), F('sofa', 16, 20), F('sofa', 21, 20), F('plant', 1, 4), F('plant', 38, 4), F('plant', 1, 24), F('plant', 38, 24), F('notice3', 17, 2), F('waterdisp', 23, 5), F('vending', 15, 5));
  out.push({
    id: 'library', name: '图书馆', w: 40, h: 26, theme: 'library', exit: { x: 18, w: 4 }, open: true, desc: '一层借阅大厅 · 走到南侧门口即可离开（更多楼层以后再做）',
    furniture, posters: [{ x: 16 }],
    npcs: [guy(12, 19.5, 6.6, '图书管理员', ['借书请出示学生证。', '书架上的书看完请放回原位。', '阅览区请保持安静。']), guy(7, 10, 18.8, '看书的同学', ['我在查论文资料。'], 'up'), guy(14, 27.5, 18.6, '占座的同学', ['这个座位有人了，书包在上面。'])],
  });
  sourceRows.push('| 图书馆 · 1F | 借阅大厅 | 占位 | 未核实 |');
}

// ------------------------------------------------------------------ 超市（第二、第三）
function market(id: string, label: string, w: number, h: number, shelfRows: number[]): Spec {
  const furniture: InteriorFurn[] = [F('freezer3', 2, 3), F('freezer3', 6, 3), F('freezer3', 10, 3), F('vending', w - 4, 4), F('waterdisp', w - 2, 4)];
  for (const y of shelfRows) for (let x = 3; x + 3 <= w - 9; x += 5) furniture.push(F('gshelf3', x, y));
  furniture.push(F('counter3', w - 8, h - 7), F('counter3', w - 5, h - 7), F('plant', 1, h - 3), F('bin', 1, 4), F('notice3', 15, 2));
  return {
    id, name: label, w, h, theme: 'mall', open: true, exit: { x: Math.floor(w / 2) - 2, w: 4 }, desc: `${label} · 走到南侧门口即可离开`, furniture, windows: [], posters: [{ x: w - 6 }],
    npcs: [guy(10, w - 6.5, h - 8.6, '收银员', ['需要购物袋吗？', '扫码或刷校园卡都可以。']), guy(6, 8.4, shelfRows[0] + 2.2, '挑零食的同学', ['这个新口味的薯片我还没试过。']), guy(17, 15, h - 4, '买水的同学', ['冰柜里的饮料在最里面。'], 'up')],
  };
}
out.push(market('market-2-f1', '第二超市', 30, 18, [7, 11]), market('market-3-f1', '第三超市', 32, 20, [7, 11, 15]));
sourceRows.push('| 第二超市 · 1F | 货架 / 冷柜 / 收银台 | 占位 | 未核实 |', '| 第三超市 · 1F | 货架 / 冷柜 / 收银台 | 占位 | 未核实 |');

// ------------------------------------------------------------------ 写文件
for (const s of out) writeFileSync(join(ROOT, 'data', 'interiors', `${s.id}.json`), JSON.stringify(s, null, 1) + '\n');
const md = `# 窗口 / 招牌来源与核实状态

> 由 \`tools/world/gen-halls.ts\` 随室内数据一起生成。**游戏里不显示「未核实」字样**；这里记录每个窗口 / 房间的来源。
> 版式借鉴了常见的校园食堂、教学楼布局（北墙一排窗口 + 中间餐桌 + 角落楼梯）；窗口名是**泛称占位**，不是真实窗口，主人以后会补特色窗口，补了就把对应行改成「已核实」并写来源。

| 位置 | 窗口 / 房间 | 来源 | 状态 |
|---|---|---|---|
${sourceRows.join('\n')}
`;
writeFileSync(join(ROOT, 'docs', 'feature', '20261110-dining-halls', 'SOURCES.md'), md);
console.log('已生成', out.length, '间室内:', out.map((s) => s.id).join(', '));
