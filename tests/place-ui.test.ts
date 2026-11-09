import { describe, expect, it } from 'vitest';
import { placeBtnState } from '../src/ui/placebtn';

const base = { place: '图书馆', online: true, fishing: false, riding: false, entering: false, blocked: false };
describe('地点留言板入口按钮：什么时候显示', () => {
  it('站在地点附近、联机、空闲：显示，写地点名', () => {
    expect(placeBtnState(base)).toEqual({ show: true, label: '图书馆' });
  });
  it('不在任何地点 / 离线 / 钓鱼中 / 骑车 / 正在进门 / 有面板盖着：都不显示', () => {
    for (const patch of [{ place: null }, { online: false }, { fishing: true }, { riding: true }, { entering: true }, { blocked: true }]) expect(placeBtnState({ ...base, ...patch }).show, JSON.stringify(patch)).toBe(false);
  });
  it('地点名太长按字（不是按字节）截断，不拆开汉字', () => {
    expect(placeBtnState({ ...base, place: '河北工程大学新校区第一公共教学楼' }).label).toBe('河北工程大学新校区…');
    expect(placeBtnState({ ...base, place: '一二三四五六七八九十' }).label).toBe('一二三四五六七八九十');
  });
});
