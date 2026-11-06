/**
 * 室内房间的数据格式（data/interiors/<id>.json）与校验。地图编辑器的「室内编辑器」、室内编译（tools/world/interiors.ts）、测试共用。
 * 坐标单位 = 格（16 px）；北墙占上面 3 格，西/东/南各 1 格墙，南墙留一个门洞（exit）。
 */
export const INTERIOR_THEMES: { k: string; name: string }[] = [
  { k: 'office', name: '办公室/活动室（白墙、大地砖）' }, { k: 'classroom', name: '教室' }, { k: 'library', name: '图书馆（木地板）' }, { k: 'canteen', name: '食堂' },
];
export interface InteriorWindow { x: number; w: number; curtain?: boolean }
export interface InteriorLabel { text: string; x: number; y: number; size?: number; color?: string }
export type Rot = 0 | 90 | 180 | 270;
export interface InteriorFurn { k: string; x: number; y: number; /** 顺时针旋转角度（缺省 0）；90/270 时占地的宽高互换 */ rot?: Rot; /** 横幅/字画/白板上的字（由 Phaser 文字牌画在家具上） */ text?: string; /** 走近按 E 弹出的话（互动）；标题用家具上的字或家具名 */ interact?: string; /** 宿舍专用的动作：床（睡觉）、空调（开关/制冷/制热）、衣柜（换装）、宝箱（仓库）；走近按 E 触发，由宿舍场景处理 */ act?: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath'; /** 摆在桌面上的小件：不占地、画在桌子上面 */ top?: boolean; /** top 小件的层级抬高（像素），缺省 24 */ dz?: number }
/** 房间内的玻璃隔断（竖向，一格厚）：x 列、y0~y1 行（含两端），gap = 隔断上留的"内部门"（从第 y 行起、高 h 格） */
export interface InteriorPartition { x: number; y0: number; y1: number; gap?: { y: number; h: number } }
export interface InteriorNpc { look: number; x: number; y: number; name: string; facing?: 'down' | 'up' | 'left' | 'right'; lines: string[] }
export interface InteriorSpec {
  id: string; name: string; w: number; h: number; theme: 'library' | 'classroom' | 'canteen' | 'office';
  exit: { x: number; w: number };
  rugs?: { x: number; y: number; w: number; h: number; color?: string }[];
  blackboard?: { x: number; w: number };
  posters?: { x: number }[];
  windows?: InteriorWindow[];
  wallW?: 'glass';
  partitions?: InteriorPartition[];
  labels?: InteriorLabel[];
  open?: boolean;
  furniture: InteriorFurn[];
  npcs?: InteriorNpc[];
  desc?: string;
}

/** 旋转后的占地（格）：90/270 宽高互换 */
export const rotFoot = (fw: number, fh: number, rot: number = 0) => (rot === 90 || rot === 270 ? { fw: fh, fh: fw } : { fw, fh });
/**
 * 一件家具按某个朝向摆放时，占地矩形在精灵图里的位置：mx/my = 占地左上角在精灵图里的像素位置，fw/fh = 旋转后的占地格数，w/h = 旋转后的精灵图尺寸。
 * 精灵图（带 1px 描边）的约定：占地左缘 = 图左缘 +1，占地底缘 = 图底 −1，精灵可以向上超出；顺时针转 90° 一次：(x,y) → (H−1−y, x)。
 * 室内编译（tools/world/interiors.ts）和宿舍里摆家具（InteriorScene）共用这一个算法，两边不会对不上。
 */
export function rotInfo(fw: number, fh: number, w: number, h: number, rot: number = 0): { fw: number; fh: number; w: number; h: number; mx: number; my: number } {
  let rect = { x: 1, y: h - 1 - fh * 16, w: fw * 16, h: fh * 16 }, iw = w, ih = h;
  for (let r = 90; r <= rot && fh > 0; r += 90) { rect = { x: ih - (rect.y + rect.h), y: rect.x, w: rect.h, h: rect.w }; [iw, ih] = [ih, iw]; }
  return { fw: rect.w / 16, fh: rect.h / 16, w: iw, h: ih, mx: rect.x, my: rect.y };
}
/** 家具上写字的版式：h = 横排（横幅、白板），v = 竖排（字画） */
export type TextMode = 'h' | 'v';
/**
 * 家具上的字（横幅「数学建模协会」、字画「天道酬勤」）→ 文字牌：位置在精灵正中，字号按精灵宽度自适应，竖排时每个字一行。
 * m = 家具目录里这件家具的数据（img = 精灵图宽高，mx/my = 占地左上角在精灵图里的位置，见 tools/world/interiors.ts）。
 */
export function furnitureLabel(f: InteriorFurn, m: { fw: number; fh: number; w: number; h: number; mx: number; my: number; text?: TextMode }): InteriorLabel | null {
  if (!f.text || !m.text) return null;
  const chars = [...f.text], n = Math.max(1, chars.length);
  const cx = f.x + (m.w / 2 - m.mx) / 16, cy = f.y + (m.h / 2 - m.my) / 16; // 精灵图中心相对占地左上角的位置
  if (m.text === 'v') return { text: chars.join('\n'), x: cx, y: cy - 0.1, size: Math.max(7, Math.min(10, Math.floor((m.h - 10) / n))), color: '#2a2a33' };
  return { text: f.text, x: cx, y: cy, size: Math.max(7, Math.min(12, Math.floor((m.w - 6) / n))), color: '#2a2a33' };
}

/** 校验一份室内数据，返回错误列表（空 = 合法）。known = 已知的家具 key（编译时从家具表来） */
export function validateInterior(j: unknown, known: ReadonlySet<string>): string[] {
  const err: string[] = [];
  if (!j || typeof j !== 'object') return ['不是对象'];
  const s = j as Partial<InteriorSpec>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const int = (v: unknown) => Number.isInteger(v);
  if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(s.id)) err.push('id 只能是小写字母/数字/短横线（2~40 位）');
  if (typeof s.name !== 'string' || !s.name || s.name.length > 30) err.push('名字 1~30 字');
  if (!int(s.w) || !int(s.h) || s.w! < 8 || s.w! > 48 || s.h! < 8 || s.h! > 40) err.push('房间大小：宽 8~48、高 8~40 格');
  if (!INTERIOR_THEMES.some((t) => t.k === s.theme)) err.push('未知主题');
  if (err.length) return err;
  const W = s.w!, H = s.h!;
  if (!s.exit || !int(s.exit.x) || !int(s.exit.w) || s.exit.w < 2 || s.exit.w > 6 || s.exit.x < 1 || s.exit.x + s.exit.w > W - 1) err.push('门洞 exit：宽 2~6，且在南墙内');
  if (!Array.isArray(s.furniture) || s.furniture.length > 500) { err.push('furniture 不是数组或太多'); return err; }
  s.furniture.forEach((f, i) => {
    if (!f || !known.has(f.k)) err.push(`furniture[${i}]: 未知家具 ${f?.k}`);
    else if (!int(f.x) || !int(f.y) || f.x < 0 || f.y < 0 || f.x >= W || f.y >= H) err.push(`furniture[${i}]: 位置出界`);
    else if (f.dz !== undefined && (!num(f.dz) || f.dz < 0 || f.dz > 200)) err.push(`furniture[${i}]: dz 不合法`);
    else if (f.rot !== undefined && ![0, 90, 180, 270].includes(f.rot)) err.push(`furniture[${i}]: 旋转只能是 0/90/180/270`);
    else if (f.interact !== undefined && (typeof f.interact !== 'string' || !f.interact || f.interact.length > 120)) err.push(`furniture[${i}]: 互动文字 1~120 字`);
    else if (f.act !== undefined && !['bed', 'ac', 'wardrobe', 'chest', 'sign', 'bath'].includes(f.act)) err.push(`furniture[${i}]: act 只能是 bed/ac/wardrobe/chest/sign/bath`);
    else if (f.text !== undefined && (typeof f.text !== 'string' || f.text.length > 16)) err.push(`furniture[${i}]: 文字最多 16 字`);
  });
  if (s.windows !== undefined) {
    if (!Array.isArray(s.windows) || s.windows.length > 8) err.push('windows 不合法');
    else s.windows.forEach((w, i) => { if (!num(w.x) || !num(w.w) || w.w < 1 || w.w > 12 || w.x < 1 || w.x + w.w > W - 1) err.push(`windows[${i}]: 位置/宽度不合法`); });
  }
  if (s.labels !== undefined) {
    if (!Array.isArray(s.labels) || s.labels.length > 20) err.push('labels 不合法');
    else s.labels.forEach((l, i) => { if (typeof l.text !== 'string' || !l.text || l.text.length > 30 || !num(l.x) || !num(l.y) || (l.size !== undefined && (!num(l.size) || l.size < 6 || l.size > 24))) err.push(`labels[${i}]: 不合法`); });
  }
  if (s.npcs !== undefined) {
    if (!Array.isArray(s.npcs) || s.npcs.length > 12) err.push('npcs 不合法');
    else s.npcs.forEach((n, i) => {
      if (!int(n.look) || n.look < 0 || n.look > 20 || !num(n.x) || !num(n.y) || typeof n.name !== 'string' || !n.name || n.name.length > 12 || !Array.isArray(n.lines) || !n.lines.length || n.lines.length > 8 || n.lines.some((l) => typeof l !== 'string' || !l || l.length > 120)) err.push(`npcs[${i}]: 不合法（名字 ≤12 字，台词 1~8 句、每句 ≤120 字）`);
    });
  }
  if (s.partitions !== undefined) {
    if (!Array.isArray(s.partitions) || s.partitions.length > 6) err.push('partitions 不合法');
    else s.partitions.forEach((p, i) => {
      const ok = int(p.x) && int(p.y0) && int(p.y1) && p.x >= 2 && p.x <= W - 3 && p.y0 >= 3 && p.y1 <= H - 2 && p.y0 <= p.y1;
      const gapOk = !p.gap || (int(p.gap.y) && int(p.gap.h) && p.gap.h >= 2 && p.gap.h <= 4 && p.gap.y >= p.y0 && p.gap.y + p.gap.h - 1 <= p.y1);
      if (!ok || !gapOk) err.push(`partitions[${i}]: 位置不合法（隔断要在房间里，门洞高 2~4 格且在隔断范围内）`);
    });
  }
  if (s.wallW !== undefined && s.wallW !== 'glass') err.push('wallW 只能是 glass');
  if (s.open !== undefined && typeof s.open !== 'boolean') err.push('open 要是 true/false');
  if (s.desc !== undefined && (typeof s.desc !== 'string' || s.desc.length > 80)) err.push('desc ≤80 字');
  return err;
}
