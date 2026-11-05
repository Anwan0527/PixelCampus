/**
 * 四季配色：地图编译器在生成每个季节的"地面块 + 道具图集"之前调用 applySeason(season)，
 * 它把统一色板（PAL）里和季节有关的几组颜色原地换掉，后面的绘制代码不用改。
 * 春天 = 色板原样（"春日校园"）；夏天更深更浓；秋天金黄橙红 + 落叶；冬天草地盖雪、树挂雪、花坛不开花。
 * 切回春天时把原色恢复。
 */
import { PAL } from '../art/palette.ts';
import { hex, mix, type RGBA } from '../art/px.ts';
import { MAPLE_RAMP, SEASON_FX } from '../art/nature.ts';
import { GROUND_FX } from './terrain.ts';
import type { Season } from '../../src/shared/season.ts';

const ramp = (...c: string[]): RGBA[] => c.map((s) => hex(s));
type Keys = 'leaf' | 'ginkgo' | 'blossom' | 'pine' | 'willow' | 'grass' | 'stone' | 'plaza' | 'plazaWarm' | 'steps' | 'paver' | 'dirt';
const MUT = PAL as unknown as Record<Keys | 'leafOutline', RGBA[] | RGBA>;
const KEYS: Keys[] = ['leaf', 'ginkgo', 'blossom', 'pine', 'willow', 'grass', 'stone', 'plaza', 'plazaWarm', 'steps', 'paver', 'dirt'];
const copy = (r: RGBA[]) => r.map((c) => [...c] as RGBA);
const BASE = { ...Object.fromEntries(KEYS.map((k) => [k, copy(MUT[k] as RGBA[])])), leafOutline: [...(MUT.leafOutline as RGBA)] as RGBA, maple: copy(MAPLE_RAMP) } as Record<Keys, RGBA[]> & { leafOutline: RGBA; maple: RGBA[] };

/** 把一组颜色向某个颜色拉近 t（冬天的霜） */
const frost = (r: RGBA[], to: RGBA, t: number) => r.map((c) => mix(c, to, t));
const SNOW: RGBA = hex('#f4f8ff');

interface Look { leaf: RGBA[]; ginkgo: RGBA[]; blossom: RGBA[]; pine: RGBA[]; willow: RGBA[]; maple: RGBA[]; grass: RGBA[]; outline: RGBA; holes: number; specks: RGBA[]; speckP: number; flowers: boolean }

const LOOKS: Record<Exclude<Season, 'spring'>, Look> = {
  summer: {
    leaf: ramp('#1c4f2c', '#256a33', '#2f8638', '#3f9f40', '#5bb84b', '#86cf62'),
    ginkgo: ramp('#2f6a2e', '#3f8636', '#52a03e', '#6fb84d', '#92cf66'),
    blossom: ramp('#2a6a36', '#388341', '#479a48', '#5fb356', '#82c96c'),
    pine: ramp('#17422f', '#215a3c', '#2b7449', '#388d5c'),
    willow: ramp('#2f7a3a', '#3f9644', '#58ad4c', '#78c561'),
    maple: ramp('#4a6a2a', '#5a8a30', '#6aa038', '#7fb44a', '#9ac864', '#b6dc84'),
    grass: ramp('#2f6f33', '#3d8a3a', '#4ba041', '#5db44c', '#78c860'),
    outline: hex('#173a22'), holes: 0, specks: [], speckP: 0, flowers: true,
  },
  autumn: {
    leaf: ramp('#4a4a1c', '#66601f', '#86782a', '#a89438', '#c8b04a', '#e0c860'),
    ginkgo: ramp('#a8761a', '#cc9a1f', '#e8b92c', '#f6d550', '#fdea8a'),
    blossom: ramp('#6a3a22', '#8a5a2c', '#aa7a36', '#c89a48', '#e0b866'),
    pine: ramp('#1c4a35', '#256243', '#2f7c52', '#40986a'),
    willow: ramp('#6a6a30', '#86883a', '#a0a048', '#bcb860'),
    maple: ramp('#8a3a14', '#b8501c', '#d86a24', '#ec8a30', '#f8ae4a', '#fcd078'),
    grass: ramp('#586628', '#6c7a30', '#828e3a', '#98a048', '#b0b45a'),
    outline: hex('#3d3014'), holes: 0,
    specks: [hex('#d8782a'), hex('#c4501f'), hex('#e8b030'), hex('#a8581c')], speckP: 0.55, flowers: false,
  },
  winter: {
    leaf: ramp('#5e5052', '#8a8791', '#bfc7d4', '#e1e8f1', '#f6f9fd', '#ffffff'),
    ginkgo: ramp('#6a5a52', '#938f98', '#c4ccd9', '#e4ebf4', '#fbfdff'),
    blossom: ramp('#6a5a58', '#938f9c', '#c8cfdc', '#e6ecf5', '#fbfdff'),
    pine: ramp('#1f4f3a', '#2f7c52', '#a9c3c4', '#e9f1f4'),
    willow: ramp('#6a5a52', '#939098', '#c4cbd8', '#e6ecf5'),
    maple: ramp('#6a5a52', '#8a8791', '#bfc7d4', '#e1e8f1', '#f6f9fd', '#ffffff'),
    grass: ramp('#a9b6c9', '#c0cbdb', '#d5deea', '#e8eef6', '#f8fbff'),
    outline: hex('#4a424c'), holes: 0.34,
    specks: [hex('#ffffff'), hex('#dfe8f4'), hex('#b7c4d8')], speckP: 0.5, flowers: false,
  },
};

const setRamp = (key: Keys, r: RGBA[]) => { const dst = MUT[key] as RGBA[]; r.forEach((c, i) => { dst[i] = [...c] as RGBA; }); };

export function applySeason(season: Season): void {
  // 先全部还原成春天，再套季节
  for (const k of KEYS) setRamp(k, BASE[k]);
  MUT.leafOutline = [...BASE.leafOutline] as RGBA;
  MAPLE_RAMP.forEach((_, i) => { MAPLE_RAMP[i] = [...BASE.maple[i]] as RGBA; });
  SEASON_FX.holes = 0; GROUND_FX.specks = []; GROUND_FX.speckP = 0; GROUND_FX.flowers = true;
  if (season === 'spring') { // 春天：色板原样，只把银杏、红枫换成嫩叶色（它们的默认色是秋天的金黄/红）
    setRamp('ginkgo', ramp('#4f8a2a', '#6aa634', '#86c244', '#a2d65a', '#c2ea84'));
    ramp('#6a3a24', '#8a4a28', '#9a6a30', '#86ae44', '#a4c85a', '#c4e17e').forEach((c, i) => { MAPLE_RAMP[i] = c; });
    return;
  }
  const L = LOOKS[season];
  setRamp('leaf', L.leaf); setRamp('ginkgo', L.ginkgo); setRamp('blossom', L.blossom); setRamp('pine', L.pine); setRamp('willow', L.willow); setRamp('grass', L.grass);
  L.maple.forEach((c, i) => { MAPLE_RAMP[i] = [...c] as RGBA; });
  MUT.leafOutline = [...L.outline] as RGBA;
  SEASON_FX.holes = L.holes; GROUND_FX.specks = L.specks; GROUND_FX.speckP = L.speckP; GROUND_FX.flowers = L.flowers;
  if (season === 'winter') { // 铺装、土路也盖一层薄霜（沥青路面保持"已扫雪"的深色）
    setRamp('stone', frost(BASE.stone, SNOW, 0.28)); setRamp('plaza', frost(BASE.plaza, SNOW, 0.3)); setRamp('plazaWarm', frost(BASE.plazaWarm, SNOW, 0.3));
    setRamp('steps', frost(BASE.steps, SNOW, 0.25)); setRamp('paver', frost(BASE.paver, SNOW, 0.16)); setRamp('dirt', frost(BASE.dirt, SNOW, 0.34));
  }
}
