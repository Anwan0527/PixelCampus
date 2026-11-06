/**
 * 宿舍的墙纸、地板和房间级别（客户端与服务器共用）。
 * 墙纸和地板各 6 种、各自独立选；第 0 种是默认（免费），其余买一次永久拥有、随时切换。房间扩建见 ROOM_PRICES。
 * 图在 tools/art/interior-bg.ts 里画（下标和这里一一对应，tests/dormskin.test.ts 核对），烘焙成 dormskin-<级别>-w<墙纸>.png / -f<地板>.png，
 * 客户端用到哪张才加载哪张。swatch = 预览色块（三个颜色：主色、浅色、深色）。
 */
export interface SkinDef { name: string; price: number; swatch: readonly [string, string, string] }
export const WALL_SKINS: readonly SkinDef[] = [
  { name: '奶油米墙', price: 0, swatch: ['#dcc89c', '#e9d8b4', '#6e4425'] },
  { name: '天空蓝墙', price: 120, swatch: ['#9cc4e4', '#c4dff2', '#4f6f94'] },
  { name: '薄荷绿墙', price: 120, swatch: ['#a8d8b4', '#cdeed4', '#4f8a64'] },
  { name: '樱花粉墙', price: 150, swatch: ['#f2bccb', '#fadde6', '#a8506a'] },
  { name: '素雅灰墙', price: 150, swatch: ['#c4c8d0', '#e2e5ea', '#6a7080'] },
  { name: '暖阳黄墙', price: 200, swatch: ['#f2d278', '#f8e6a8', '#a8782a'] },
];
export const FLOOR_SKINS: readonly SkinDef[] = [
  { name: '原木地板', price: 0, swatch: ['#b8844f', '#c8955a', '#a67447'] },
  { name: '浅灰地砖', price: 100, swatch: ['#d6d4cc', '#e4e2da', '#a8a69e'] },
  { name: '深色木地板', price: 150, swatch: ['#6e4a30', '#855a3a', '#4e3220'] },
  { name: '白橡木地板', price: 150, swatch: ['#e2c9a0', '#efdab8', '#c4a878'] },
  { name: '蓝灰格地砖', price: 200, swatch: ['#7f93ad', '#9bb0c8', '#5a6d86'] },
  { name: '红棕方砖', price: 250, swatch: ['#b3603f', '#c9774f', '#8a4328'] },
];
export const SKINS = { w: WALL_SKINS, f: FLOOR_SKINS } as const;
export type SkinKind = 'w' | 'f';
export const SKIN_KIND_NAMES: Record<SkinKind, string> = { w: '墙纸', f: '地板' };

/** 房间级别：名字、扩建到这一级要花的校园币（0 级是默认） */
export const ROOM_NAMES = ['小屋', '中屋', '大屋'] as const;
export const ROOM_PRICES = [0, 1500, 4000] as const;

/** 加载进浏览器的贴图名 / 文件名（不含扩展名）：dormskin-<房间级别>-w<墙纸> / -f<地板> */
export const skinFile = (level: number, kind: SkinKind, idx: number) => `dormskin-${level}-${kind}${idx}`;
