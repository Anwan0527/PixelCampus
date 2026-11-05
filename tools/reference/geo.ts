import geo from '../../data/campus/geo.json' with { type: 'json' };

export const SAT = geo.satellite;
export const WORLD = geo.world;

/** 卫星拼图像素 / 世界 tile 互转（tile 以 5 米为 1 格） */
export const satPxPerTile = WORLD.tileMeters / SAT.metersPerPixel;

export function satToTile(px: number, py: number): [number, number] {
  return [(px - WORLD.originSatPx[0]) / satPxPerTile, (py - WORLD.originSatPx[1]) / satPxPerTile];
}
export function tileToSat(tx: number, ty: number): [number, number] {
  return [tx * satPxPerTile + WORLD.originSatPx[0], ty * satPxPerTile + WORLD.originSatPx[1]];
}

/** 经纬度 -> 卫星拼图像素 */
export function lonLatToSat(lon: number, lat: number): [number, number] {
  const n = 2 ** SAT.z;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return [(x - SAT.x0) * 256, (y - SAT.y0) * 256];
}
