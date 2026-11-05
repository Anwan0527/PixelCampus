/**
 * 外观自定义（客户端与服务器共用）：发型、发色、脸、衣服、鞋帽、配饰。
 * 外观在网络上和档案里只是一个 17 个小整数的数组（全部是"选项编号 / 色板编号"，不是任意颜色），
 * 服务器逐项检查范围，不信任客户端；渲染由 src/art/char-rig.ts 完成。
 * 档案里没有 app 的老玩家，仍按 look（0–11 的预置造型）显示——两者并存，不需要迁移。
 */

/** 色板：编号即线上存的值。前 4 档肤色、前 7 档发色、部分服装色沿用旧版预置造型里出现过的颜色 */
export const SKIN_COLORS = ['#f7d3b2', '#f0bf94', '#d9a073', '#a9714a', '#fde6d6', '#e6ae82', '#84563a', '#5a3826'] as const;
export const HAIR_COLORS = ['#2f2430', '#1c1620', '#3a2a1c', '#5a3a24', '#8a5a2b', '#a8402f', '#d8a84e', '#efd9a0', '#c9c2b8', '#f2efe8', '#6a4a3a', '#c06a3a',
  '#e87aa0', '#b88ae0', '#6aa0e8', '#4cc2b0', '#8ac85a', '#d83a4a', '#3a4fa0', '#7a3a9a', '#f0a8c0', '#f5e46a', '#2f6a58', '#e8e0f8'] as const;
export const DYE_COLORS = ['#f2eee4', '#e8dcc0', '#b8bcc6', '#5a5e6e', '#2a2a34', '#2f3f6a', '#c4503c', '#d96a58', '#e8923a', '#e8a83a', '#f0c898', '#8a5a3a',
  '#6aa860', '#3f7a58', '#58b0a0', '#5a88c8', '#3f78c0', '#3f6aa8', '#e89ab8', '#c8487a', '#8a5aa8', '#b8a0d8', '#7a9ad0', '#b89e66'] as const;
export const EYE_COLORS = ['#5a3a2a', '#3a2a22', '#3a6a9a', '#3a7a4a', '#7a4a8a', '#8a6a2a'] as const;
export const EYE_NAMES = ['深褐', '黑褐', '蓝', '绿', '紫', '琥珀'] as const;

/** 选项：英文名是渲染器用的，中文名给界面 */
export const HAIR_STYLES = ['buzz', 'short', 'bob', 'long', 'wavy', 'ponytail', 'twin', 'bun', 'twinbun', 'braid'] as const;
export const HAIR_NAMES = ['寸头', '短发', '波波头', '长直发', '长卷发', '马尾', '双马尾', '丸子头', '双丸子', '麻花辫'] as const;
export const FRINGES = ['none', 'blunt', 'side', 'part', 'airy'] as const;
export const FRINGE_NAMES = ['露额头', '齐刘海', '斜刘海', '中分', '空气刘海'] as const;
export const TOPS = ['tee', 'hoodie', 'sweater', 'shirt', 'jacket', 'cardigan', 'labcoat', 'jersey'] as const;
export const TOP_NAMES = ['T 恤', '连帽卫衣', '高领毛衣', '衬衫', '夹克', '开衫', '白大褂', '球衣'] as const;
export const BOTTOMS = ['jeans', 'wide', 'sport', 'shorts', 'skirt', 'longskirt'] as const;
export const BOTTOM_NAMES = ['牛仔裤', '阔腿裤', '运动裤', '短裤', '百褶裙', '长裙'] as const;
export const SHOES = ['sneaker', 'boots', 'canvas', 'loafer'] as const;
export const SHOE_NAMES = ['运动鞋', '靴子', '帆布鞋', '皮鞋'] as const;
export const HATS = [undefined, 'cap', 'beanie', 'bucket', 'beret'] as const;
export const HAT_NAMES = ['无', '棒球帽', '毛线帽', '渔夫帽', '贝雷帽'] as const;
export const GLASSES = [undefined, 'round', 'square', 'sun', 'aviator'] as const;
export const GLASSES_NAMES = ['无', '圆框', '粗框', '墨镜', '飞行员'] as const;

/** 开关位（app[15]） */
export const FLAG = { headphones: 1, bag: 2, lanyard: 4, mask: 8, freckles: 16, noBlush: 32, sock: 64 } as const;

/** 数组各项：下标 → [名称, 取值个数]；0 = 没有 的项（发尾色、帽子、眼镜、围巾）取 0 表示不要 */
export const APP_FIELDS = [
  ['skin', 8], ['eye', 6], ['hair', 10], ['fringe', 5], ['hairColor', 24], ['tip', 25], ['top', 8], ['topColor', 24], ['top2', 24],
  ['bottom', 6], ['bottomColor', 24], ['shoes', 4], ['hat', 5], ['hatColor', 24], ['glasses', 5], ['flags', 128], ['scarf', 25],
] as const;
export const APP_LEN = APP_FIELDS.length;
export const IDX = Object.fromEntries(APP_FIELDS.map(([n], i) => [n, i])) as Record<(typeof APP_FIELDS)[number][0], number>;

export type Appearance = number[];

/** 校验从网络/磁盘来的外观：长度、每项都是范围内的整数，否则返回 undefined（调用方回退到预置造型） */
export function parseAppearance(raw: unknown): Appearance | undefined {
  if (!Array.isArray(raw) || raw.length !== APP_LEN) return undefined;
  for (let i = 0; i < APP_LEN; i++) { const v = raw[i]; if (!Number.isInteger(v) || v < 0 || v >= APP_FIELDS[i][1]) return undefined; }
  return raw.slice() as Appearance;
}
export const sameApp = (a?: Appearance, b?: Appearance) => (!a && !b) || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));
/** 外观 → 短键（纹理名、缓存键）：FNV-1a 哈希后转 36 进制 */
export function appKey(a: Appearance): string {
  let h = 2166136261;
  for (const v of a) { h ^= v + 1; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** 随机外观（🎲 按钮）：自然发色居多，偶尔来点时尚色/渐变发尾；上衣下装颜色随机但不让上下同色 */
export function randomAppearance(rnd: () => number = Math.random): Appearance {
  const r = (n: number) => Math.floor(rnd() * n);
  const natural = rnd() < 0.7, topColor = r(24);
  let bottomColor = r(24); if (bottomColor === topColor) bottomColor = (bottomColor + 7) % 24;
  let flags = 0;
  if (rnd() < 0.12) flags |= FLAG.headphones; if (rnd() < 0.35) flags |= FLAG.bag; if (rnd() < 0.3) flags |= FLAG.lanyard; if (rnd() < 0.2) flags |= FLAG.freckles;
  const bottom = r(6);
  if ((bottom === 3 || bottom === 4) && rnd() < 0.5) flags |= FLAG.sock;
  return [
    r(8), r(6), r(10), r(5), natural ? r(12) : 12 + r(12), rnd() < 0.15 ? 13 + r(12) : 0, r(8), topColor, r(24),
    bottom, bottomColor, r(4), rnd() < 0.25 ? 1 + r(4) : 0, r(24), rnd() < 0.25 ? 1 + r(4) : 0, flags, rnd() < 0.1 ? 1 + r(24) : 0,
  ];
}
