import { describe, expect, it } from 'vitest';
import { PLACE_IMG } from '../src/shared/place';
import { PLACE_TARGET, QUALITY_STEPS, SHRINK_STEPS, baseUrl, fitSize, pickQuality, placeImgSrc, placeThumbSrc, uploadUrl } from '../src/systems/placeimg';

describe('placeimg：尺寸与质量阶梯', () => {
  it('fitSize：最长边缩到上限、等比；小图不放大；退化输入至少 1×1', () => {
    expect(fitSize(4000, 3000, 960)).toEqual({ w: 960, h: 720 });
    expect(fitSize(3000, 4000, 960)).toEqual({ w: 720, h: 960 });
    expect(fitSize(500, 300, 960)).toEqual({ w: 500, h: 300 });
    expect(fitSize(10000, 1, 960)).toEqual({ w: 960, h: 1 });
    expect(fitSize(0, 0, 960)).toEqual({ w: 1, h: 1 });
  });
  it('质量阶梯从好到差、都在 (0,1]；客户端目标小于服务器硬上限；缩边比例递减', () => {
    for (let i = 1; i < QUALITY_STEPS.length; i++) expect(QUALITY_STEPS[i]).toBeLessThan(QUALITY_STEPS[i - 1]);
    expect(QUALITY_STEPS[0]).toBeLessThanOrEqual(1); expect(QUALITY_STEPS[QUALITY_STEPS.length - 1]).toBeGreaterThan(0);
    expect(PLACE_TARGET.full).toBeLessThan(PLACE_IMG.FULL_MAX); expect(PLACE_TARGET.thumb).toBeLessThan(PLACE_IMG.THUMB_MAX);
    expect(SHRINK_STEPS[0]).toBe(1); for (let i = 1; i < SHRINK_STEPS.length; i++) expect(SHRINK_STEPS[i]).toBeLessThan(SHRINK_STEPS[i - 1]);
  });
  it('pickQuality：第一个不超限的；都超限 = -1', () => {
    expect(pickQuality([150, 120, 90, 70, 50], 100)).toBe(2);
    expect(pickQuality([50, 40], 100)).toBe(0);
    expect(pickQuality([300, 200], 100)).toBe(-1);
    expect(pickQuality([], 100)).toBe(-1);
  });
  it('地址：图片 / 缩略图在 BASE_URL/img/ 下，缩略图名带 t；上传地址相对网页根解析', () => {
    const id = 'a1b2c3d4e5f60718293a4b5c';
    expect(baseUrl().endsWith('/')).toBe(true);
    expect(placeImgSrc(`${id}.webp`)).toBe(`${baseUrl()}img/${id}.webp`);
    expect(placeThumbSrc(`${id}.jpg`)).toBe(`${baseUrl()}img/${id}t.jpg`);
    expect(uploadUrl('up/abc', 'https://exist.qd.je/pixel/')).toMatch(/^https:\/\/exist\.qd\.je\/.*up\/abc$/);
  });
});
