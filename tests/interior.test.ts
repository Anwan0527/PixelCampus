import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateInterior, rotFoot, furnitureLabel, type InteriorSpec } from '../src/shared/interior';
import { FURNITURE } from '../tools/art/furniture';
import { OFFICE_FURNITURE, FURN_INFO } from '../tools/art/furniture-office';
import { DORM_FURNITURE } from '../tools/art/furniture-dorm';
import { GEN } from '../tools/paths';

const DIR = join(__dirname, '..', 'data', 'interiors');
const specs: InteriorSpec[] = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
const ALL = { ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE };
const known = new Set(Object.keys(ALL));
const foot = (k: string, rot = 0) => { const f = ALL[k](); return rotFoot(f.fw, f.fh, rot); };

describe('室内数据（data/interiors）', () => {
  it('每间室内都合法，且 id 与文件名一致、不重复', () => {
    const ids = new Set<string>();
    for (const s of specs) { expect(validateInterior(s, known), s.id).toEqual([]); expect(ids.has(s.id)).toBe(false); ids.add(s.id); }
    for (const f of readdirSync(DIR)) expect(ids.has(f.replace('.json', '')), f).toBe(true);
  });
  it('家具目录：每件家具都有中文名和分类', () => {
    for (const k of known) { expect(FURN_INFO[k]?.name, k).toBeTruthy(); expect(FURN_INFO[k]?.cat, k).toBeTruthy(); }
  });
  it('坏数据被拒绝', () => {
    const base = (): InteriorSpec => ({ id: 'room-1', name: '房间', w: 20, h: 16, theme: 'office', exit: { x: 9, w: 3 }, furniture: [{ k: 'sdesk', x: 3, y: 5 }] });
    expect(validateInterior(base(), known)).toEqual([]);
    const bad = (f: (s: InteriorSpec) => void) => { const s = base(); f(s); return validateInterior(s, known).length > 0; };
    expect(bad((s) => { s.id = 'Bad ID'; })).toBe(true);
    expect(bad((s) => { s.w = 3; })).toBe(true);
    expect(bad((s) => { s.theme = 'castle' as any; })).toBe(true);
    expect(bad((s) => { s.exit = { x: 19, w: 3 }; })).toBe(true);        // 门洞出界
    expect(bad((s) => { s.furniture[0].k = 'dragon'; })).toBe(true);
    expect(bad((s) => { s.furniture[0].x = 99; })).toBe(true);
    expect(bad((s) => { s.furniture[0].x = 1.5; })).toBe(true);            // 家具只能在整格上
    expect(bad((s) => { (s.furniture[0] as any).rot = 45; })).toBe(true);   // 旋转只能是 90 的倍数
    expect(bad((s) => { s.furniture[0].text = '一二三四五六七八九十一二三四五六七'; })).toBe(true);
    expect(bad((s) => { s.furniture[0].interact = ''; })).toBe(true);
    expect(validateInterior({ ...base(), furniture: [{ k: 'banner', x: 3, y: 2, text: '数学建模协会', interact: '群号' }, { k: 'ltable4', x: 3, y: 6, rot: 90 }] }, known)).toEqual([]);
    expect(bad((s) => { s.windows = [{ x: 18, w: 5 }]; })).toBe(true);
    expect(bad((s) => { s.npcs = [{ look: 1, x: 3, y: 3, name: 'A', lines: [] }]; })).toBe(true);
    expect(bad((s) => { s.labels = [{ text: '', x: 1, y: 1 }]; })).toBe(true);
    expect(bad((s) => { s.partitions = [{ x: 1, y0: 3, y1: 10 }]; })).toBe(true);                    // 隔断不能贴着外墙
    expect(bad((s) => { s.partitions = [{ x: 10, y0: 3, y1: 10, gap: { y: 9, h: 3 } }]; })).toBe(true); // 门洞超出隔断
    expect(validateInterior({ ...base(), partitions: [{ x: 10, y0: 3, y1: 14, gap: { y: 11, h: 3 } }] }, known)).toEqual([]);
  });
});

describe('开放的室内：能走进去、走得到每个 NPC、家具没叠在一起', () => {
  const open = specs.filter((s) => s.open);
  it('至少开放了试点：数学建模协会 214（外间 + 里间，中间有带内部门的玻璃隔断，里外各一台空调，NPC 邢巾巾）', () => {
    expect(open.map((s) => s.id)).toContain('mathmodel-214');
    const s = open.find((x) => x.id === 'mathmodel-214')!;
    expect(s.partitions?.length).toBeGreaterThanOrEqual(1); expect(s.partitions![0].gap).toBeTruthy();
    const ac = s.furniture.filter((f) => f.k === 'ac'); expect(ac.length).toBeGreaterThanOrEqual(2);
    const px = s.partitions![0].x; expect(ac.some((f) => f.x < px) && ac.some((f) => f.x > px), '里外间各要有空调').toBe(true);
    expect(s.furniture.some((f) => /^ltable/.test(f.k) && f.x < px), '里间要有长条大桌子').toBe(true);
    expect(s.furniture.find((f) => f.k === 'banner')?.interact, '横幅按 E 的互动').toBe('2026数学建模迎新群：784626521');
    const npc = s.npcs?.find((n) => n.name === '邢巾巾'); expect(npc?.lines).toEqual(['数学建模协会内有一位神秘人物']);
  });
  for (const s of open) {
    it(`${s.id}：占地不重叠（桌面小件、墙面挂件、塞进桌下的椅子除外）`, () => {
      const used = new Map<string, string>();
      s.furniture.forEach((f, i) => {
        const { fw, fh } = foot(f.k, f.rot); if (f.top || fh === 0) return;
        for (let j = 0; j < fh; j++) for (let k = 0; k < fw; k++) {
          const key = `${f.x + k},${f.y + j}`;
          const other = used.get(key), isChair = (n: string) => /^(bchair|chair|gchair|campchair|stool)/.test(n);
          // 椅子可以塞进桌子底下（占地允许重叠）；其他家具之间不能叠
          if (other && !(isChair(f.k) || isChair(other.replace(/#\d+$/, '')))) expect(other, `${f.k}#${i} 与 ${other} 重叠于 ${key}`).toBeUndefined();
          used.set(key, `${f.k}#${i}`);
          expect(f.x + k >= 1 && f.x + k <= s.w - 2 && f.y + j <= s.h - 2, `${f.k}#${i} 压到墙`).toBe(true); // 北墙那 3 行（y<3）本来就挡路，挂在墙上的（暖气片、空调）不算压墙
          for (const p of s.partitions ?? []) expect(f.x + k === p.x && f.y + j >= p.y0 && f.y + j <= p.y1, `${f.k}#${i} 压到玻璃隔断`).toBe(false);
        }
      });
    });
    it(`${s.id}：从门口出发能走到所有 NPC 身边，可走区域连通`, () => {
      const blocked = Array.from({ length: s.h }, (_, y) => Array.from({ length: s.w }, (_, x) => y < 3 || x === 0 || x === s.w - 1 || (y === s.h - 1 && !(x >= s.exit.x && x < s.exit.x + s.exit.w))));
      for (const p of s.partitions ?? []) for (let y = p.y0; y <= p.y1; y++) if (!(p.gap && y >= p.gap.y && y < p.gap.y + p.gap.h)) blocked[y][p.x] = true;
      for (const f of s.furniture) { const { fw, fh } = foot(f.k, f.rot); if (f.top) continue; for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (blocked[f.y + j]?.[f.x + i] !== undefined) blocked[f.y + j][f.x + i] = true; }
      const sx = Math.floor(s.exit.x + s.exit.w / 2), sy = s.h - 2;
      expect(blocked[sy][sx], '出生点被挡住').toBe(false);
      const seen = new Set<string>([`${sx},${sy}`]); const q: [number, number][] = [[sx, sy]];
      while (q.length) { const [x, y] = q.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h || blocked[ny][nx] || seen.has(`${nx},${ny}`)) continue; seen.add(`${nx},${ny}`); q.push([nx, ny]); } }
      for (const n of s.npcs ?? []) {
        const tx = Math.floor(n.x), ty = Math.floor(n.y);
        const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${tx + dx},${ty + dy}`));
        expect(near, `${n.name} 周围走不到`).toBe(true);
      }
      const free = blocked.flat().filter((b) => !b).length;
      expect(seen.size / free, '可走区域被家具分割成几块').toBeGreaterThan(0.9);
    });
  }
  it('生成物：interiors.json 里有开放的室内，家具目录齐全（已生成时检查）', () => {
    const f = join(GEN, 'interiors.json'); if (!existsSync(f)) return;
    const out = JSON.parse(readFileSync(f, 'utf8')) as { id: string; collision: string[] }[];
    for (const s of open) { const o = out.find((x) => x.id === s.id); expect(o, s.id).toBeTruthy(); expect(o!.collision.length).toBe(s.h); }
    const m = join(GEN, 'furniture-meta.json'); if (existsSync(m)) expect(Object.keys(JSON.parse(readFileSync(m, 'utf8'))).sort()).toEqual([...known].sort());
  });
});

describe('家具旋转与家具上的字', () => {
  it('旋转后占地宽高互换（90/270），0/180 不变', () => {
    expect(rotFoot(4, 2, 90)).toEqual({ fw: 2, fh: 4 }); expect(rotFoot(4, 2, 270)).toEqual({ fw: 2, fh: 4 });
    expect(rotFoot(4, 2, 0)).toEqual({ fw: 4, fh: 2 }); expect(rotFoot(4, 2, 180)).toEqual({ fw: 4, fh: 2 });
  });
  it('横幅文字：居中、字号随字数缩小；字画竖排每字一行；没有文字或不是能写字的家具返回 null', () => {
    const m = { fw: 4, fh: 0, w: 66, h: 16, mx: 1, my: 15, text: 'h' as const };
    const a = furnitureLabel({ k: 'banner', x: 2, y: 1, text: '数学建模协会' }, m)!;
    expect(a.x).toBeCloseTo(2 + (66 / 2 - 1) / 16); expect(a.size).toBeGreaterThanOrEqual(7); expect(a.text).toBe('数学建模协会');
    const b = furnitureLabel({ k: 'banner', x: 2, y: 1, text: '数学建模协会数学建模协会' }, m)!; expect(b.size).toBeLessThan(a.size!);
    const v = furnitureLabel({ k: 'scroll', x: 1, y: 3, text: '天道酬勤' }, { fw: 1, fh: 0, w: 16, h: 40, mx: 1, my: 39, text: 'v' })!; expect(v.text).toBe('天\n道\n酬\n勤');
    expect(furnitureLabel({ k: 'banner', x: 2, y: 1 }, m)).toBeNull(); expect(furnitureLabel({ k: 'sdesk', x: 2, y: 1, text: 'x' }, { ...m, text: undefined })).toBeNull();
  });
  it('生成物：每件有占地的家具都有 90/180/270 朝向，占地与旋转一致；横幅/字画的文字进了文字牌', () => {
    const m = join(GEN, 'furniture-meta.json'), o = join(GEN, 'interiors.json'); if (!existsSync(m) || !existsSync(o)) return;
    const meta = JSON.parse(readFileSync(m, 'utf8')) as Record<string, { fw: number; fh: number; rots: Record<string, { fw: number; fh: number }> }>;
    for (const [k, v] of Object.entries(meta)) {
      if (v.fh === 0) { expect(v.rots[90], k).toBeUndefined(); continue; }
      for (const r of [90, 180, 270]) expect(v.rots[r], `${k}@${r}`).toEqual(expect.objectContaining(rotFoot(v.fw, v.fh, r)));
    }
    const room = (JSON.parse(readFileSync(o, 'utf8')) as { id: string; labels: { text: string }[] }[]).find((x) => x.id === 'mathmodel-214');
    expect(room?.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['数学建模协会', '天\n道\n酬\n勤']));
    const ia = (JSON.parse(readFileSync(o, 'utf8')) as { id: string; interacts: { text: string; y0: number; y1: number }[] }[]).find((x) => x.id === 'mathmodel-214')!.interacts;
    expect(ia.some((a) => a.text === '2026数学建模迎新群：784626521' && a.y1 >= 64), '互动区要够到北墙下第一排能站的格子（y≥48）').toBe(true);
  });
});
