/**
 * 玩家档案（学生证）。客户端与将来的联机服务器共用：同一套校验，服务器不信任客户端发来的内容。
 * 姓名/学院/专业都不要求真实，用户随意填写；这里只做长度与字符安全处理。
 */
import { parseAppearance, type Appearance } from './appearance';

export type Gender = 'm' | 'f';

export interface Profile {
  v: 1;
  name: string;
  gender: Gender;
  /** 人物图集中的造型编号，必须属于所选性别（LOOK_CHOICES） */
  look: number;
  college: string;
  major: string;
  year: number;
  motto: string;
  /** 虚拟证号，创建时生成，修改资料时保持不变 */
  cardNo: string;
  /**
   * 外观自定义（发型/发色/衣服…，17 个选项编号，见 shared/appearance）。没有就按 look 显示预置造型；
   * look 仍然必填并属于所选性别：它是预置底子，也是别人客户端还没生成好自定义外观时的临时造型。
   */
  app?: Appearance;
}

/** 可选造型（对应 tools/art/characters.ts 的 LOOKS 下标） */
export const LOOK_CHOICES: Record<Gender, number[]> = { m: [0, 2, 4, 6, 10, 11], f: [1, 3, 5, 7, 8, 9] };
export const LIMITS = { name: 8, college: 12, major: 14, motto: 24 } as const;
export const YEARS = [2022, 2023, 2024, 2025, 2026];
export const DEFAULT_YEAR = 2025;

/** 去掉控制字符、格式字符（含零宽/双向覆盖，防止伪造名字）、代理项，折叠空白，按"字"截断 */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, max).join('');
}

export type Validated = { ok: true; profile: Profile } | { ok: false; error: string };

export function validateProfile(input: Partial<Profile>, rnd: () => number = Math.random): Validated {
  const gender: Gender | null = input.gender === 'm' || input.gender === 'f' ? input.gender : null;
  if (!gender) return { ok: false, error: '请选择性别' };
  const look = Number(input.look);
  if (!LOOK_CHOICES[gender].includes(look)) return { ok: false, error: '请选择一个造型' };
  const name = cleanText(input.name, LIMITS.name);
  if (!name) return { ok: false, error: '请填写姓名（随便起一个就行）' };
  const college = cleanText(input.college, LIMITS.college);
  if (!college) return { ok: false, error: '请填写学院' };
  const major = cleanText(input.major, LIMITS.major);
  if (!major) return { ok: false, error: '请填写专业' };
  const year = YEARS.includes(Number(input.year)) ? Number(input.year) : DEFAULT_YEAR;
  const motto = cleanText(input.motto, LIMITS.motto);
  const cardNo = typeof input.cardNo === 'string' && /^\d{10}$/.test(input.cardNo) ? input.cardNo : makeCardNo(year, rnd);
  const app = parseAppearance(input.app);   // 不合法就丢掉（回退到预置造型），不拒绝整份档案
  return { ok: true, profile: { v: 1, name, gender, look, college, major, year, motto, cardNo, ...(app ? { app } : {}) } };
}

/** 10 位虚拟证号：入学年(4) + 随机(6)。不对应任何真实学号。 */
export function makeCardNo(year: number, rnd: () => number = Math.random): string {
  let s = String(year);
  for (let i = 0; i < 6; i++) s += Math.floor(rnd() * 10);
  return s;
}

/** 字符串 → 0–359 的色相：学院卡面颜色、昵称颜色保持稳定一致 */
export function hueOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}
