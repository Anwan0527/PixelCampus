/**
 * 图书馆广场（客户端、服务器、地图编译共用）：用户把这块清空，用来放"校园商店"和"校园墙"两座大建筑。
 * 坐标都是世界格（tile）。PLAZA = 广场范围；PLAZA_BUILDINGS = 两座建筑的脚点（底边正中）和占地（w 宽，d = 连屋顶的视觉深度）。
 * 行人不进广场（客户端 Npc 躲开），地图编译会把广场里的路灯/座椅/垃圾桶/花坛/草丛清掉。
 */
export const PLAZA = { x0: 325, y0: 361, x1: 399, y1: 423 } as const;
export const PLAZA_BUILDINGS = [
  { id: 'shop', name: '校园商店', x: 337, y: 381, w: 16, d: 11 },
  { id: 'wall', name: '校园墙', x: 386, y: 381, w: 16, d: 8 },
] as const;
/** 点（格坐标）在不在广场里 */
export const inPlaza = (tx: number, ty: number, pad = 0) => tx >= PLAZA.x0 - pad && tx <= PLAZA.x1 + pad && ty >= PLAZA.y0 - pad && ty <= PLAZA.y1 + pad;
