import { describe, expect, it } from 'vitest';
import { PLACE_IMG, PLACE_REACH_TILES, buildPlaces, inPlace, isPlaceImg, packPlaceImg, placeAt, placeByKey, placeThumbName, sniffImg, unpackPlaceImg } from '../src/shared/place';

const webp = (n: number) => { const b = new Uint8Array(n); b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); return b; };
const jpg = (n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };

describe('地点：建筑 + 地标', () => {
  const buildings = [
    { name: '图书馆', bbox: { x: 100, y: 100, w: 20, h: 10 } },
    { name: '四社区A楼', bbox: { x: 40, y: 40, w: 10, h: 10 } }, { name: '四社区A楼', bbox: { x: 50, y: 42, w: 5, h: 5 } }, // 同名楼翼合并
    { name: '', bbox: { x: 0, y: 0, w: 2, h: 2 } }, // 没名字：不算地点
  ];
  const pois = [{ id: 'spawn', name: '出生点', kind: 'spawn', x: 5, y: 5 }, { id: 'lake', name: '精工湖', kind: 'area', x: 200, y: 200, r: 10 }, { id: 'x', kind: 'area', x: 1, y: 1 }, { id: 'axis', name: '中轴花园', kind: 'area', x: 100, y: 100 }];
  const places = buildPlaces(buildings, pois);
  it('同名建筑合并成一个地点；没名字的、出生点不算', () => {
    expect(places.map((p) => p.key)).toEqual(['b:图书馆', 'b:四社区A楼', 'p:lake', 'p:axis']);
    expect(placeByKey(places, 'b:四社区A楼')!.rects).toHaveLength(2);
    expect(placeByKey(places, 'p:spawn')).toBeUndefined(); expect(placeByKey(places, 3)).toBeUndefined();
  });
  it('站在建筑外扩几格以内算在这个地点；再远就不算', () => {
    const lib = placeByKey(places, 'b:图书馆')!;
    expect(inPlace(lib, 99, 100)).toBe(true); expect(inPlace(lib, 100 - PLACE_REACH_TILES, 100 - PLACE_REACH_TILES)).toBe(true); expect(inPlace(lib, 95, 105)).toBe(false);
    expect(placeAt(places, 110, 105)?.key).toBe('b:图书馆');
    expect(placeAt(places, 300, 300)).toBeNull();
  });
  it('建筑优先于地标；地标按半径算', () => {
    expect(placeAt(places, 110, 105)?.key).toBe('b:图书馆'); // 同时在 中轴花园（默认半径 6 格，圆心 100,100）里，也取建筑
    expect(placeAt(places, 100, 94)?.key).toBe('p:axis'); // 图书馆外扩 3 格到 y=97；这里只在花园里
    expect(placeAt(places, 205, 205)?.key).toBe('p:lake'); expect(placeAt(places, 211, 200)).toBeNull();
  });
});

describe('地点留言：图片包', () => {
  it('sniff：WebP / JPEG 认得，别的不认', () => {
    expect(sniffImg(webp(20))).toBe('webp'); expect(sniffImg(jpg(20))).toBe('jpg'); expect(sniffImg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); expect(sniffImg(new Uint8Array(2))).toBeNull();
  });
  it('文件名：id.ext 合法；缩略图名 = id + t', () => {
    const id = 'a1b2c3d4e5f60718293a4b5c';
    expect(isPlaceImg(`${id}.webp`)).toBe(true); expect(isPlaceImg(`${id}.jpg`)).toBe(true); for (const bad of [`${id}.png`, `${id}`, '../x.webp', `${id}x.webp`, 5, undefined]) expect(isPlaceImg(bad), String(bad)).toBe(false);
    expect(placeThumbName(`${id}.webp`)).toBe(`${id}t.webp`);
  });
  it('打包 / 拆包往返；格式不一致、太大、缩略图长度不对都被拒', () => {
    const t = webp(500), f = webp(5000), r = unpackPlaceImg(packPlaceImg(t, f));
    expect(typeof r).toBe('object'); if (typeof r === 'string') return; expect(r.ext).toBe('webp'); expect(r.thumb.length).toBe(500); expect(r.full.length).toBe(5000); expect(Array.from(r.full.subarray(0, 12))).toEqual(Array.from(f.subarray(0, 12)));
    expect(typeof unpackPlaceImg(packPlaceImg(webp(500), jpg(5000)))).toBe('string'); // 缩略图和大图格式不同
    expect(typeof unpackPlaceImg(packPlaceImg(webp(500), webp(PLACE_IMG.FULL_MAX + 1)))).toBe('string');
    expect(typeof unpackPlaceImg(packPlaceImg(webp(PLACE_IMG.THUMB_MAX + 1), webp(5000)))).toBe('string');
    expect(typeof unpackPlaceImg(packPlaceImg(new Uint8Array([1, 2, 3]), webp(5000)))).toBe('string'); // 缩略图不是图
    expect(typeof unpackPlaceImg(new Uint8Array(10))).toBe('string');
    const lie = packPlaceImg(webp(500), webp(5000)); new DataView(lie.buffer).setUint32(0, 999999, false); expect(typeof unpackPlaceImg(lie)).toBe('string'); // 谎报缩略图长度
  });
});
