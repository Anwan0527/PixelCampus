import type Phaser from 'phaser';
import { G } from '@/core/paths';
import { skinFile, type SkinKind } from '@/shared/dormskin';

const pending = new Map<string, Promise<boolean>>();

/** 一张宿舍墙纸 / 地板图层：已经在贴图管理器里就直接用，没有就下载（同一张的请求合并，失败了下次再试） */
function load(textures: Phaser.Textures.TextureManager, level: number, kind: SkinKind, idx: number): Promise<boolean> {
  const key = skinFile(level, kind, idx);
  if (textures.exists(key)) return Promise.resolve(true);
  const hit = pending.get(key); if (hit) return hit;
  const p = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => { if (!textures.exists(key)) textures.addImage(key, img); pending.delete(key); resolve(true); };
    img.onerror = () => { pending.delete(key); resolve(false); };
    img.src = `${G}/${key}.webp`;
  });
  pending.set(key, p);
  return p;
}

/** 保证某级房间的墙纸 + 地板两层都已加载好（宿舍场景和资料卡缩略图用）；返回 false = 有一张没下载成功 */
export async function ensureSkin(textures: Phaser.Textures.TextureManager, level: number, wall: number, floor: number): Promise<boolean> {
  const r = await Promise.all([load(textures, level, 'f', floor), load(textures, level, 'w', wall)]);
  return r[0] && r[1];
}
export const skinTextureKey = (level: number, kind: SkinKind, idx: number) => skinFile(level, kind, idx);
