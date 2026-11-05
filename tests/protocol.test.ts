import { describe, it, expect } from 'vitest';
import { decodeReport, decodeSnapshot, encodeReport, encodeSnapshot, packFlags, unpackFlags, validToken } from '../src/shared/protocol';

describe('联机二进制协议', () => {
  it('位置上报往返，1/4 像素精度，覆盖整个世界尺寸', () => {
    const r = decodeReport(encodeReport({ x: 11263.75, y: 8703.5, flags: packFlags('left', true, true) }))!;
    expect(r.x).toBe(11263.75); expect(r.y).toBe(8703.5);
    expect(unpackFlags(r.flags)).toEqual({ facing: 'left', moving: true, run: true, ride: false, sit: false, fish: false, pax: false });
  });
  it('静止时不会带"奔跑"标志；朝向四向都能还原', () => {
    expect(unpackFlags(packFlags('up', false, true)).run).toBe(false);
    for (const f of ['down', 'up', 'left', 'right'] as const) expect(unpackFlags(packFlags(f, true, false)).facing).toBe(f);
  });
  it('骑行标志：独立的一位，骑车时不带"奔跑"，朝向/移动不受影响', () => {
    const f = packFlags('right', true, true, true);
    expect(unpackFlags(f)).toEqual({ facing: 'right', moving: true, run: false, ride: true, sit: false, fish: false, pax: false });
    expect(unpackFlags(packFlags('up', false, false, true)).ride).toBe(true);
    expect(unpackFlags(packFlags('up', true, false)).ride).toBe(false);
    const r = decodeReport(encodeReport({ x: 1, y: 2, flags: f }))!;
    expect(unpackFlags(r.flags).ride).toBe(true);
  });
  it('快照往返，每人 7 字节', () => {
    const es = [{ id: 1, x: 10.25, y: 20.5, flags: 5 }, { id: 65535, x: 11000, y: 8000, flags: 0 }];
    const b = encodeSnapshot(es);
    expect(b.byteLength).toBe(3 + 2 * 7);
    expect(decodeSnapshot(b)).toEqual(es);
    expect(decodeSnapshot(encodeSnapshot([]))).toEqual([]);
  });
  it('长度不符/类型不符的帧被拒绝', () => {
    expect(decodeReport(new Uint8Array(5))).toBeNull();
    expect(decodeReport(new Uint8Array([9, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodeSnapshot(new Uint8Array([2, 0, 5, 1, 2]))).toBeNull();
  });
  it('token 格式', () => {
    expect(validToken('abcdef0123456789')).toBe(true);
    expect(validToken('short')).toBe(false);
    expect(validToken('has space has space!!')).toBe(false);
    expect(validToken(123)).toBe(false);
  });
});
