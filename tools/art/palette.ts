/**
 * 统一色板（"春日校园"）：整个项目所有程序化美术只从这里取色，
 * 保证草地/道路/建筑/树木/人物色调一致，是"像星露谷"的关键。
 * 规则：暗部偏冷紫、亮部偏暖黄；轮廓用材质的深色而不是纯黑；每种材质 4~5 阶。
 */
import { hex, type RGBA } from './px.ts';

const ramp = (...c: string[]): RGBA[] => c.map((s) => hex(s));

export const PAL = {
  // 草地：由暗到亮
  grass: ramp('#3f7f3a', '#52973f', '#66ad45', '#7cc152', '#97d566'),
  grassFlowerY: hex('#f6e05a'), grassFlowerW: hex('#f4f1e6'), grassFlowerP: hex('#e98fb6'),
  // 泥土小径
  dirt: ramp('#6b4d33', '#876340', '#a07a4b', '#b99359', '#d1ae73'),
  // 浅色石砖（广场/步道）
  stone: ramp('#8b8890', '#a29fa3', '#b9b5b3', '#cfcac0', '#e4dfd2'),
  stoneJoint: hex('#8f8b92'),
  // 图书馆广场石灰岩（略带暖绿的浅灰）、台阶、暖色铺装
  plaza: ramp('#aeac9a', '#c0beac', '#d0cebb', '#dedcc9', '#eae8d6'),
  plazaWarm: ramp('#b89e68', '#cdb17a', '#dec48c', '#ebd3a0', '#f5e2b8'),
  steps: ramp('#8e8a78', '#aaa691', '#c4c0aa', '#dcd8c2', '#f0ecd8'),
  // 沥青路
  asphalt: ramp('#383d4d', '#454b5c', '#535a6c', '#646c7e'),
  markY: hex('#e6c64a'), markW: hex('#e6e6e0'),
  // 红砖铺装（入口/小广场）
  paver: ramp('#8e4a38', '#a85d44', '#bf7050', '#d58a62'),
  // 水
  water: ramp('#27607f', '#2f7a96', '#3f94a8', '#66b4c0', '#a4dce0'),
  foam: hex('#e8f6ff'),
  // 运动场
  track: ramp('#a8402f', '#bd5238', '#d0663f', '#e0814f'),
  pitch: ramp('#3f8f3c', '#4aa043'),
  courtBlue: ramp('#2a4f9a', '#3a68b8'), courtGreen: ramp('#2f7d4a', '#3a9158'), courtRed: ramp('#b4452f', '#c9573a'),
  line: hex('#f2f0e6'),
  // 墙体
  brick: ramp('#6a2e26', '#97452f', '#b65a3b', '#cf7549', '#e4935d'),
  mortar: hex('#d8b79c'),
  sand: ramp('#a98458', '#c6a06a', '#dcb97f', '#ebcf9c', '#f5e3bb'),
  white: ramp('#8f96a8', '#b2b8c6', '#d1d5de', '#e9ebf0', '#f7f8fa'),
  // 屋顶
  roofGray: ramp('#4a5063', '#616980', '#7f88a0', '#a1a9bc', '#c4cbd8'),
  roofBlue: ramp('#45608a', '#5d7eae', '#7d9fc9', '#a2bfe0', '#c6dbf0'),
  roofRed: ramp('#7e2f2a', '#a24236', '#c05a42', '#d9755a', '#eb9478'),
  // 玻璃/窗
  glass: ramp('#2c5486', '#3f73ab', '#5f98cc', '#8fc3ea'),
  frame: hex('#ece5d3'), frameDark: hex('#8a7f70'),
  // 木头
  wood: ramp('#53341f', '#734a2b', '#94643a', '#b98350', '#d6a56c'),
  // 植物
  leaf: ramp('#255c32', '#2f7a3a', '#3f9644', '#58b24d', '#7fcb62', '#a8e07c'),
  leafOutline: hex('#1d4528'),
  trunk: ramp('#43291a', '#5d3a24', '#7a5233', '#97693f'),
  ginkgo: ramp('#a8761a', '#cc9a1f', '#e8b92c', '#f6d550', '#fdea8a'),
  blossom: ramp('#c75387', '#df719d', '#ee93b6', '#f8b9d0', '#fde0ea'),
  pine: ramp('#1c4a35', '#256243', '#2f7c52', '#40986a'),
  willow: ramp('#3a7a40', '#52973f', '#6fb24d', '#93cc66'),
  // 金属/灯
  metal: ramp('#3a3f4c', '#565c6c', '#7b8294', '#a6adbd'),
  lampGlow: hex('#ffe9a8'),
  // 影子（半透明）
  shadow: [28, 36, 66, 70] as RGBA,
  outline: hex('#2a1f2e'),
  outlineBrick: hex('#4a231d'),
  outlineStone: hex('#6a6670'),
} as const;

/** 皮肤、头发、衣服（人物生成用） */
export const SKIN: RGBA[][] = [
  ramp('#f3c9a0', '#e2a97c', '#c98a5e'),
  ramp('#f6d3b0', '#e8b88e', '#d09b70'),
  ramp('#e5b98f', '#cf9b6f', '#b57f55'),
  ramp('#c68863', '#a96d49', '#8c5636'),
];
export const HAIR: RGBA[][] = [
  ramp('#2a2024', '#1a1316', '#3d2e33'),
  ramp('#4a3020', '#332015', '#65422c'),
  ramp('#8a5a2b', '#6b4220', '#b27a3c'),
  ramp('#d4a54a', '#b3832f', '#ecc872'),
  ramp('#a8402f', '#843024', '#cc5a43'),
  ramp('#5a4d8a', '#443a6c', '#7a6cb0'),
];
export const CLOTH: RGBA[][] = [
  ramp('#3b6ea8', '#2b5688', '#5b8fc7'),
  ramp('#c4503c', '#9c3b2b', '#df7058'),
  ramp('#3f9a58', '#2d7842', '#62b878'),
  ramp('#e0a53a', '#b88226', '#f2c764'),
  ramp('#8a5aa8', '#6b4388', '#aa7cc6'),
  ramp('#e8e4da', '#bfbab0', '#f8f6ef'),
  ramp('#3a3f55', '#292d3d', '#565c78'),
];
