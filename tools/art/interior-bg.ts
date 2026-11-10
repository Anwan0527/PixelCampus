/** 室内背景烘焙：地板 / 墙 / 窗 / 黑板 / 地毯 / 门垫。尺寸 = w×h tile。 */
import { Img, hash2, vnoise, type RGBA } from './px.ts';
import { PAL } from './palette.ts';
import { hex } from './px.ts';
import { STAIR_H, stairW, type InteriorSpec, type InteriorStair } from '../../src/shared/interior.ts';

export type { InteriorSpec };

/** 楼梯口（俯视）：一级一级的踏步 + 两侧扶手 + 方向箭头；上行越往里越亮，下行越往里越暗（像是沉下去） */
function paintStair(img: Img, t: InteriorStair) {
  const x0 = t.x * 16, y0 = t.y * 16, w = stairW(t) * 16, h = STAIR_H * 16, up = t.dir === 'up';
  const lerp = (a: RGBA, b: RGBA, k: number): RGBA => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k), 255];
  const lo = up ? hex('#b9b1a0') : hex('#d2cab8'), hi = up ? hex('#ece6d6') : hex('#6e675a');
  const steps = 8, sh = h / steps;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1), base = lerp(lo, hi, up ? k : k); // 上行：近处暗、远处亮；下行：近处亮、远处暗
    const ya = Math.round(y0 + i * sh), yb = Math.round(y0 + (i + 1) * sh);
    img.rect(x0, ya, w, yb - ya, base);
    img.hline(x0, yb - 1, w, lerp(base, hex('#000000'), 0.28)); // 踏步前沿的阴影线
    if (up) img.hline(x0, ya, w, lerp(base, hex('#ffffff'), 0.35)); // 踏步面的高光
  }
  const dark = hex('#4a4438'), post = hex('#2f343c');
  img.rect(x0, y0, 2, h, dark); img.rect(x0 + w - 2, y0, 2, h, dark); img.hline(x0, y0, w, post); img.hline(x0, y0 + h - 1, w, post); // 扶手 + 上下沿
  const cx = x0 + Math.floor(w / 2), cy = y0 + Math.floor(h / 2), ac = up ? hex('#6a6254') : hex('#f2eedf'); // 方向箭头（人字形）
  for (let i = 0; i < 5; i++) for (const dx of [-i, i]) { img.set(cx + dx, cy + (up ? i - 2 : 2 - i), ac); img.set(cx + dx, cy + (up ? i - 1 : 1 - i), ac); }
}

const THEMES = {
  library: { floor: [hex('#a67447'), hex('#b8844f'), hex('#c8955a')], wall: [hex('#e9d8b4'), hex('#dcc89c'), hex('#c9b184')], wain: [hex('#6e4425'), hex('#8a5a33')], plank: true },
  classroom: { floor: [hex('#cfc7b4'), hex('#dcd5c2'), hex('#e8e2d0')], wall: [hex('#f1ead6'), hex('#e3dac0'), hex('#cfc4a4')], wain: [hex('#3f7a64'), hex('#4f917a')], plank: false },
  office: { floor: [hex('#bdb9ad'), hex('#d9d6cc'), hex('#e4e1d7')], wall: [hex('#f2f4f6'), hex('#e6e9ee'), hex('#cfd4dc')], wain: [hex('#9aa0ac'), hex('#b4bac5')], plank: false },
  canteen: { floor: [hex('#bfae94'), hex('#cdbfa8'), hex('#dbcfba')], wall: [hex('#f4e4c0'), hex('#e6d2a2'), hex('#d1b980')], wain: [hex('#a8402f'), hex('#c25a3f')], plank: false },
  // 第二、第三餐厅和超市、教学楼走廊：墙色 / 地面各不相同，一眼能分出是哪栋楼
  canteen2: { floor: [hex('#aab0a4'), hex('#c4c9bd'), hex('#d6dacd')], wall: [hex('#d6efdf'), hex('#bde0c9'), hex('#9cc4ad')], wain: [hex('#3f8a64'), hex('#56a47c')], plank: false },
  canteen3: { floor: [hex('#8a6a46'), hex('#a07c52'), hex('#b48e60')], wall: [hex('#d9e6f2'), hex('#bcd0e4'), hex('#9bb4cc')], wain: [hex('#3f5a80'), hex('#587aa6')], plank: true },
  mall: { floor: [hex('#c9ccd2'), hex('#e0e3e8'), hex('#eef0f3')], wall: [hex('#f7f7f4'), hex('#ebebe6'), hex('#d4d4cc')], wain: [hex('#d9822b'), hex('#ee9d42')], plank: false },
  hall: { floor: [hex('#bcb5a0'), hex('#d4cdb8'), hex('#e3dcc8')], wall: [hex('#e3eddc'), hex('#cddcc2'), hex('#aec29e')], wain: [hex('#6a8a58'), hex('#82a56e')], plank: false },
} as const;

/** 宿舍墙纸 / 地板样式（下标和 src/shared/dormskin.ts 的 WALL_SKINS / FLOOR_SKINS 一一对应；第 0 种 = library 主题原样） */
type WallStyle = { wall: readonly RGBA[]; wain: readonly RGBA[] };
type FloorStyle = { floor: readonly RGBA[]; plank: boolean };
const cl = (...c: string[]) => c.map((x) => hex(x));
export const DORM_WALL_STYLES: readonly WallStyle[] = [
  { wall: THEMES.library.wall, wain: THEMES.library.wain },
  { wall: cl('#c4dff2', '#9cc4e4', '#7fa8cc'), wain: cl('#4f6f94', '#6a8cb4') },
  { wall: cl('#cdeed4', '#a8d8b4', '#8cc09a'), wain: cl('#4f8a64', '#64a47c') },
  { wall: cl('#fadde6', '#f2bccb', '#dca0b2'), wain: cl('#a8506a', '#c26a84') },
  { wall: cl('#e2e5ea', '#c4c8d0', '#aab0ba'), wain: cl('#6a7080', '#868c9c') },
  { wall: cl('#f8e6a8', '#f2d278', '#dcba58'), wain: cl('#a8782a', '#c4923c') },
];
export const DORM_FLOOR_STYLES: readonly FloorStyle[] = [
  { floor: THEMES.library.floor, plank: true },
  { floor: cl('#a8a69e', '#d6d4cc', '#e4e2da'), plank: false },
  { floor: cl('#4e3220', '#6e4a30', '#855a3a'), plank: true },
  { floor: cl('#c4a878', '#e2c9a0', '#efdab8'), plank: true },
  { floor: cl('#5a6d86', '#7f93ad', '#9bb0c8'), plank: false },
  { floor: cl('#8a4328', '#b3603f', '#c9774f'), plank: false },
];

/**
 * 画室内底图。宿舍的皮肤：opts.wall / opts.floor 选墙纸 / 地板样式；opts.layer = 'wall' 只留墙（北墙、侧墙、南墙，窗和窗帘），
 * 'floor' 只留地板（含门洞、门垫、画在地上的地毯），另一层透明——客户端把两层叠起来，墙纸和地板就能各自独立地换。
 */
const isDorm = (id: string) => id === 'dorm' || id === 'dorm-2' || id === 'dorm-3';
export function paintInterior(s: InteriorSpec, opts: { wall?: number; floor?: number; layer?: 'wall' | 'floor' } = {}): Img {
  const base = THEMES[s.theme];
  const ws = DORM_WALL_STYLES[opts.wall ?? 0], fs = DORM_FLOOR_STYLES[opts.floor ?? 0];
  const T = opts.wall === undefined && opts.floor === undefined && !opts.layer ? base : { ...base, wall: ws.wall, wain: ws.wain, floor: fs.floor, plank: fs.plank };
  const img = new Img(s.w * 16, s.h * 16);
  const WALL_H = 3 * 16;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    let c: RGBA;
    if (y < WALL_H) {
      c = T.wall[1]; if (vnoise(x, y, 6, 3) > 0.7) c = T.wall[0];
      if (s.theme !== 'office' && y >= WALL_H - 20) c = y === WALL_H - 20 ? T.wain[1] : T.wain[0]; // 墙裙（办公室是白墙，只有踢脚线）
      if (y >= WALL_H - 4) c = y === WALL_H - 4 ? T.wain[1] : s.theme === 'office' ? T.wain[0] : [60, 40, 28, 255];
      if (y < 3) c = T.wall[2];
    } else {
      if (T.plank) {
        const row = Math.floor((y - WALL_H) / 6), off = (row % 2) * 24;
        const px = Math.floor((x + off) / 48);
        c = T.floor[Math.floor(hash2(px, row, 5) * 3)];
        if ((y - WALL_H) % 6 === 5) c = [Math.max(0, c[0] - 30), Math.max(0, c[1] - 26), Math.max(0, c[2] - 22), 255];
        if ((x + off) % 48 === 47) c = [Math.max(0, c[0] - 24), Math.max(0, c[1] - 20), Math.max(0, c[2] - 18), 255];
      } else {
        const big = s.theme === 'office', cs = big ? 32 : 16; // 办公室地砖是 2×2 格的大瓷砖
        const tile = ((Math.floor(x / cs) + Math.floor((y - WALL_H) / cs)) % 2) === 0;
        c = T.floor[tile ? 1 : 2];
        if (big && vnoise(x, y, 9, 11) > 0.78) c = T.floor[2];
        if (x % cs === 0 || (y - WALL_H) % cs === 0) c = T.floor[0];
      }
    }
    img.set(x, y, c);
  }
  // 侧墙（左右各 1 tile）
  for (let y = WALL_H; y < img.h; y++) for (const x0 of [0, img.w - 16]) for (let x = 0; x < 16; x++) img.set(x0 + x, y, x === (x0 === 0 ? 15 : 0) ? T.wain[0] : T.wall[1]);
  // 南墙（除门）
  const ex0 = s.exit ? s.exit.x * 16 : 0, ex1 = s.exit ? (s.exit.x + s.exit.w) * 16 : 0; // 二层以上没有门洞：整面南墙都是实墙
  for (let y = img.h - 16; y < img.h; y++) for (let x = 0; x < img.w; x++) if (x < ex0 || x >= ex1) img.set(x, y, y === img.h - 16 ? T.wain[1] : T.wall[0]);
  // 玻璃隔断列（深色框 + 灰色百叶帘）：西墙、房间里的隔断共用
  const glassCol = (x0: number, ya: number, yb: number) => { for (let y = ya; y < yb; y++) for (let x = 0; x < 16; x++) { const post = (y - ya) % 32 === 0 || x === 0 || x === 15; img.set(x0 + x, y, post ? hex('#2f343c') : (y % 3 === 0 ? hex('#7d8a92') : hex('#a9b4ba'))); } };
  if (s.wallW === 'glass') glassCol(0, WALL_H, img.h - 16);
  for (const p of s.partitions ?? []) { // 房间里的玻璃隔断，留一个内部门（门框 + 门槛）
    const gy0 = p.gap ? p.gap.y * 16 : -1, gy1 = p.gap ? (p.gap.y + p.gap.h) * 16 : -1;
    glassCol(p.x * 16, p.y0 * 16, (p.y1 + 1) * 16);
    if (p.gap) {
      for (let y = gy0; y < gy1; y++) for (let x = 0; x < 16; x++) { const fl = img.get(p.x * 16 + x - 16 * (p.x > 0 ? 1 : 0), y); img.set(p.x * 16 + x, y, fl); } // 先还原成地板
      img.rect(p.x * 16, gy0 - 2, 16, 4, hex('#2f343c')); img.rect(p.x * 16, gy1 - 2, 16, 4, hex('#2f343c')); // 门框（上下两根立柱）
      img.hline(p.x * 16 + 1, gy0 + 2, 14, hex('#b9a27a')); img.hline(p.x * 16 + 1, gy1 - 3, 14, hex('#b9a27a'));
      for (let y = gy0 + 3; y < gy1 - 3; y += 1) { img.set(p.x * 16 + 7, y, hex('#c9c3b0')); img.set(p.x * 16 + 8, y, hex('#c9c3b0')); } // 门槛
    }
  }
  // 窗（北墙）：自定义窗（玻璃 + 白色窗框 + 窗帘）
  for (const w of s.windows ?? []) {
    const wx = w.x * 16, ww = w.w * 16;
    img.rect(wx - 2, 5, ww + 4, 33, hex('#e8e4d8')); img.rect(wx, 7, ww, 29, hex('#cfe3f2'));
    for (let y = 0; y < 29; y++) for (let x = 0; x < ww; x++) if (y > 14 && vnoise(wx + x, y, 7, 2) > 0.55) img.set(wx + x, 7 + y, hex('#e6ecef')); // 远处楼房的影子
    const cols = Math.max(2, Math.round(w.w * 0.9));
    for (let i = 1; i < cols; i++) img.vline(wx + Math.round((ww * i) / cols), 7, 29, hex('#e8e4d8'));
    img.hline(wx, 21, ww, hex('#e8e4d8')); img.rect(wx - 3, 37, ww + 6, 3, hex('#d4cfc0'));
    if (w.curtain) for (const cx of [wx - 9, wx + ww + 1]) { img.rect(cx, 3, 8, 41, hex('#6f607c')); for (let x = cx + 1; x < cx + 8; x += 2) img.vline(x, 3, 41, hex('#85768f')); img.hline(cx, 3, 8, hex('#4f4360')); }
  }
  if (!s.windows) for (let wx = 3 * 16; wx + 28 < img.w - 40; wx += 7 * 16) {
    if (s.blackboard && wx + 28 > s.blackboard.x * 16 - 8 && wx < (s.blackboard.x + s.blackboard.w) * 16 + 8) continue;
    img.rect(wx - 1, 7, 30, 26, PAL.frame);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 28; x++) img.set(wx + x, 8 + y, y < 8 ? PAL.glass[3] : y < 17 ? PAL.glass[2] : PAL.glass[1]);
    img.vline(wx + 14, 8, 24, PAL.frame); img.hline(wx, 20, 28, PAL.frame);
    img.rect(wx - 3, 33, 34, 3, PAL.stone[3]);
  }
  // 黑板
  if (s.blackboard) {
    const bx = s.blackboard.x * 16, bw = s.blackboard.w * 16;
    img.rect(bx - 2, 6, bw + 4, 26, PAL.wood[3]); img.rect(bx, 8, bw, 22, hex('#2f5a48')); img.hline(bx, 8, bw, hex('#3f7a64'));
    for (let i = 0; i < 9; i++) img.hline(bx + 6 + i * 3, 14 + (i % 3) * 4, 2 + (i % 2), hex('#e8e4da'));
    img.rect(bx + 4, 29, bw - 8, 2, PAL.wood[1]);
  }
  for (const p of s.posters ?? []) { img.rect(p.x * 16, 10, 12, 16, hex('#e8e4da')); img.rect(p.x * 16 + 2, 12, 8, 7, hex('#3f6fae')); img.rect(p.x * 16 + 2, 21, 8, 2, hex('#c4503c')); }
  // 地毯
  for (const r of s.rugs ?? []) {
    const c = hex(r.color ?? '#8a3f3a');
    for (let y = r.y * 16; y < (r.y + r.h) * 16; y++) for (let x = r.x * 16; x < (r.x + r.w) * 16; x++) {
      const edge = x < r.x * 16 + 3 || y < r.y * 16 + 3 || x >= (r.x + r.w) * 16 - 3 || y >= (r.y + r.h) * 16 - 3;
      img.set(x, y, edge ? [Math.min(255, c[0] + 50), Math.min(255, c[1] + 40), Math.min(255, c[2] + 30), 255] : (x + y) % 8 < 1 ? [Math.min(255, c[0] + 18), Math.min(255, c[1] + 14), Math.min(255, c[2] + 12), 255] : c);
    }
  }
  for (const t of s.stairs ?? []) paintStair(img, t);
  // 门垫（宿舍的门垫是可以挪、可以换的家具，不画在底图里）
  if (!isDorm(s.id) && s.exit) { img.rect(ex0 + 2, img.h - 14, ex1 - ex0 - 4, 10, hex('#5a3a28')); img.rect(ex0 + 4, img.h - 12, ex1 - ex0 - 8, 6, hex('#7a5233')); }
  if (opts.layer) { // 只留一层：墙 = 北墙 + 左右侧墙 + 南墙（门洞除外）；其余是地板层
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const wall = y < WALL_H || x < 16 || x >= img.w - 16 || (y >= img.h - 16 && (x < ex0 || x >= ex1));
      if (wall !== (opts.layer === 'wall')) img.data[(y * img.w + x) * 4 + 3] = 0;
    }
  }
  return img;
}
