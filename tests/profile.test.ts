import { describe, it, expect, beforeEach } from 'vitest';
import { LOOK_CHOICES, LIMITS, cleanText, hueOf, makeCardNo, validateProfile } from '../src/shared/profile';
import { CHAT_MAX, cleanChatText } from '../src/shared/chat';
import { PRESET_LOOKS as LOOKS } from '../tools/art/char-rig';

const base = { gender: 'f' as const, look: 1, name: '小工', college: '机电学院', major: '机械设计', year: 2024, motto: '' };

describe('学生证校验', () => {
  it('合法档案通过，生成 10 位虚拟证号并保留年份前缀', () => {
    const r = validateProfile(base);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.profile.cardNo).toMatch(/^2024\d{6}$/); expect(r.profile.v).toBe(1); }
  });
  it('已有证号在修改资料时保持不变', () => {
    const r = validateProfile({ ...base, cardNo: '2022123456' });
    expect(r.ok && r.profile.cardNo).toBe('2022123456');
  });
  it('姓名/学院/专业为空、性别缺失都被拒绝', () => {
    expect(validateProfile({ ...base, name: '   ' }).ok).toBe(false);
    expect(validateProfile({ ...base, college: '' }).ok).toBe(false);
    expect(validateProfile({ ...base, major: '' }).ok).toBe(false);
    expect(validateProfile({ ...base, gender: undefined }).ok).toBe(false);
  });
  it('造型必须属于所选性别', () => {
    expect(validateProfile({ ...base, gender: 'm', look: 1 }).ok).toBe(false);
    expect(validateProfile({ ...base, gender: 'f', look: 0 }).ok).toBe(false);
    for (const g of ['m', 'f'] as const) for (const l of LOOK_CHOICES[g]) expect(validateProfile({ ...base, gender: g, look: l }).ok).toBe(true);
  });
  it('可选造型男女各 6 个、互不重叠、都有对应精灵', () => {
    expect(LOOK_CHOICES.m.length).toBe(6); expect(LOOK_CHOICES.f.length).toBe(6);
    expect(new Set([...LOOK_CHOICES.m, ...LOOK_CHOICES.f]).size).toBe(12);
    for (const l of [...LOOK_CHOICES.m, ...LOOK_CHOICES.f]) expect(LOOKS[l]).toBeTruthy();
  });
  it('超长按"字"截断（emoji 不会被劈成乱码）', () => {
    expect(Array.from(cleanText('一二三四五六七八九十', LIMITS.name)).length).toBe(8);
    expect(cleanText('😀😀😀😀', 2)).toBe('😀😀');
  });
  it('清掉控制字符、零宽字符与双向覆盖，防止伪造昵称；空白折叠', () => {
    expect(cleanText('a‮b​c\u0000d', 10)).toBe('a b c d');
    expect(cleanText('  小   工  ', 10)).toBe('小 工');
    expect(cleanText(123, 10)).toBe('');
  });
  it('名字含 HTML 也只是普通文本（界面一律 textContent，不会被执行）', () => {
    const r = validateProfile({ ...base, name: '<img onerror=x>' });
    expect(r.ok && r.profile.name).toBe('<img one');
  });
  it('证号与色相稳定', () => {
    expect(makeCardNo(2025, () => 0)).toBe('2025000000');
    expect(hueOf('机电学院')).toBe(hueOf('机电学院'));
    expect(hueOf('机电学院')).toBeGreaterThanOrEqual(0); expect(hueOf('机电学院')).toBeLessThan(360);
  });
});

describe('公屏消息清洗', () => {
  it('去首尾空白、限长、空消息返回空串', () => {
    expect(cleanChatText('  你好  ')).toBe('你好');
    expect(cleanChatText('   ')).toBe('');
    expect(Array.from(cleanChatText('啊'.repeat(500))).length).toBe(CHAT_MAX);
    expect(cleanChatText({})).toBe('');
  });
});

describe('本地存档（浏览器记住你）', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  });
  it('存了能读回；数据损坏当作没有档案', async () => {
    const { loadProfile, saveProfile, clearProfile } = await import('../src/core/profileStore');
    clearProfile();
    expect(loadProfile()).toBeNull();
    const r = validateProfile(base); if (!r.ok) throw new Error('x');
    saveProfile(r.profile);
    expect(loadProfile()).toEqual(r.profile);
    store.set('pixelcampus.profile.v1', '{坏的');
    // 内存里还留着本次会话的档案，所以读到的是它；清空后才是 null
    clearProfile();
    store.set('pixelcampus.profile.v1', '{坏的');
    expect(loadProfile()).toBeNull();
  });
  it('存储里被篡改成非法造型的档案会被拒绝', async () => {
    const { loadProfile, clearProfile } = await import('../src/core/profileStore');
    clearProfile();
    store.set('pixelcampus.profile.v1', JSON.stringify({ ...base, look: 0 })); // 女生 + 男生造型
    expect(loadProfile()).toBeNull();
  });
});

import { eggAdvance } from '../src/world/egg';
describe('校名石彩蛋状态机', () => {
  it('依次：宇达 → 美团 → 回到原名（final），再按重新开始', () => {
    let s = 0; const seq: { index: number; final: boolean }[] = [];
    for (let i = 0; i < 6; i++) { const a = eggAdvance(s, 2); s = a.step; seq.push({ index: a.index, final: a.final }); }
    expect(seq).toEqual([{ index: 0, final: false }, { index: 1, final: false }, { index: -1, final: true }, { index: 0, final: false }, { index: 1, final: false }, { index: -1, final: true }]);
  });
});
