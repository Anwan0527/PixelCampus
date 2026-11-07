import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEN } from '../tools/paths.ts';
import { WaterMask, lakeMask } from '../src/shared/water';
import {
  BIRDS, BIRD_COUNT, BIRD_DAILY_CAP, BIRD_KINDS, BIRD_RARE_DAILY_CAP, BIRD_ODDS, BLACK_SWAN_RARE, DUCK_COMMON, DUCK_RARE, SWAN_COMMON, SWAN_RARE,
  birdHomes, birdLeft, birdLine, birdsFed, cleanBirdLog, isBirdId, isBlackSwan, isSwan, rollBirdFeed, type BirdLog,
} from '../src/shared/waterfowl';
import { isItemId } from '../src/shared/items';
import { BIRD_ANIMS, BIRD_LOOKS } from '../tools/art/birds';
import { ACHIEVEMENTS } from '../src/shared/achievements';

describe('水禽（精工湖的鸭子和天鹅）', () => {
  it('9 只、编号 = 下标、名字不重复；外观种类与美术的 5 种一一对应；天鹅是 3 只（含 1 只黑天鹅）', () => {
    expect(BIRD_COUNT).toBe(9); expect(BIRDS.map((b) => b.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(BIRDS.map((b) => b.name)).size).toBe(9);
    expect(BIRD_KINDS.length).toBe(BIRD_LOOKS.length);
    BIRD_KINDS.forEach((k, i) => { expect(k.name).toBe(BIRD_LOOKS[i].name); expect(k.swan).toBe(BIRD_LOOKS[i].swan); });
    for (const b of BIRDS) expect(b.kind).toBeLessThan(BIRD_KINDS.length);
    expect(BIRDS.filter((b) => isSwan(b.id)).length).toBe(3); expect(BIRDS.filter((b) => isBlackSwan(b.id)).length).toBe(1);
    expect(isBirdId(0)).toBe(true); expect(isBirdId(9)).toBe(false); expect(isBirdId(-1)).toBe(false); expect(isBirdId(1.5)).toBe(false); expect(isBirdId('1')).toBe(false);
  });
  it('美术动作齐全：游 / 发呆 / 梳羽 / 扑翅 / 点头吃 / 睡 / 正面 / 背面，帧数与 meta 约定一致', () => {
    const ids = BIRD_ANIMS.map((a) => a.id);
    for (const id of ['swim', 'idle', 'preen', 'flap', 'dip', 'sleep', 'idle_down', 'swim_down', 'idle_up', 'swim_up']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BIRD_ANIMS) { expect(a.frames.length).toBeGreaterThan(0); expect(a.fps).toBeGreaterThan(0); }
  });
  it('回礼表：全部是存在的物品；鸭子 / 天鹅各有普通和稀有表；稀有回礼里有盲盒和珍珠（钓鱼联动）', () => {
    for (const t of [DUCK_COMMON, SWAN_COMMON, DUCK_RARE, SWAN_RARE, BLACK_SWAN_RARE]) for (const e of t) { expect(isItemId(e.gain.id), e.gain.id).toBe(true); expect(e.gain.n).toBeGreaterThan(0); expect(e.w).toBeGreaterThan(0); }
    const ids = (t: typeof DUCK_RARE) => new Set(t.map((e) => e.gain.id));
    expect(ids(DUCK_RARE).has('box_bottle')).toBe(true); expect(ids(SWAN_RARE).has('box_crate')).toBe(true); expect(ids(BLACK_SWAN_RARE).has('pearl')).toBe(true);
    expect(ids(DUCK_COMMON).has('box_bottle')).toBe(false);   // 盲盒只在稀有回礼里
    expect(BIRD_ODDS.swan.rare).toBeGreaterThan(BIRD_ODDS.duck.rare); expect(BIRD_ODDS.black.rare).toBeGreaterThan(BIRD_ODDS.swan.rare);
  });
  it('rollBirdFeed：随机数很小 = 没有；稀有区间 = 稀有回礼（有名额时）；名额用完降成普通回礼；确定的、返回拷贝', () => {
    const duck = 0, swan = 6, black = 8;
    expect(rollBirdFeed(duck, 0.01, 0.5, true)).toMatchObject({ nothing: true, rare: false, gifts: [] });
    const rare = rollBirdFeed(swan, 0.99, 0.1, true); expect(rare).toMatchObject({ rare: true, nothing: false }); expect(rare.gifts.length).toBe(1);
    const capped = rollBirdFeed(swan, 0.99, 0.1, false); expect(capped.rare).toBe(false); expect(capped.gifts.length).toBe(1);
    expect(SWAN_RARE.some((e) => e.gain.id === rare.gifts[0].id)).toBe(true); expect(SWAN_COMMON.some((e) => e.gain.id === capped.gifts[0].id)).toBe(true);
    const mid = rollBirdFeed(duck, 0.5, 0.2, true); expect(mid.rare).toBe(false); expect(DUCK_COMMON.some((e) => e.gain.id === mid.gifts[0].id)).toBe(true);
    expect(rollBirdFeed(black, 0.99, 0.5, true).gifts[0].id).toBeTruthy(); expect(BLACK_SWAN_RARE.some((e) => e.gain.id === rollBirdFeed(black, 0.99, 0.5, true).gifts[0].id)).toBe(true);
    expect(rollBirdFeed(duck, 0.5, 0.2, true)).toEqual(rollBirdFeed(duck, 0.5, 0.2, true));
    const g = rollBirdFeed(duck, 0.5, 0, true).gifts[0]; g.n = 99; expect(rollBirdFeed(duck, 0.5, 0, true).gifts[0].n).not.toBe(99);
  });
  it('大量抽样：天鹅的稀有回礼比鸭子多、黑天鹅最多；每只都有回礼的期望', () => {
    const rate = (id: number) => { let n = 0, N = 4000; for (let i = 0; i < N; i++) if (rollBirdFeed(id, (i * 0.618034) % 1, (i * 0.7548) % 1, true).rare) n++; return n / N; };
    const d = rate(0), s = rate(6), b = rate(8);
    expect(d).toBeGreaterThan(0.08); expect(d).toBeLessThan(0.16); expect(s).toBeGreaterThan(d); expect(b).toBeGreaterThan(s);
  });
  it('话：没有回礼 / 有回礼都点名这只水禽，回礼有名字', () => {
    expect(birdLine(0, { gifts: [], rare: false, nothing: true }, '', 0)).toContain('这次没有回礼');
    const t = birdLine(6, { gifts: [{ id: 'pearl', n: 1 }], rare: true, nothing: false }, '珍珠', 0.5);
    expect(t).toContain('雪衣'); expect(t).toContain('珍珠');
  });
  it('每天的账：换日清零 n / r，累计 t 和掩码保留；清洗读档数据；喂过几只', () => {
    const log: BirdLog = { day: 100, n: 12, r: 3, t: 50, m: 0b101 };
    expect(birdLeft(log, 100)).toEqual({ feeds: BIRD_DAILY_CAP - 12, rare: BIRD_RARE_DAILY_CAP - 3 });
    expect(birdLeft(log, 101)).toEqual({ feeds: BIRD_DAILY_CAP, rare: BIRD_RARE_DAILY_CAP }); expect(birdLeft(undefined, 1).feeds).toBe(BIRD_DAILY_CAP);
    expect(birdsFed(log)).toBe(2); expect(birdsFed({ ...log, m: (1 << BIRD_COUNT) - 1 })).toBe(BIRD_COUNT);
    expect(cleanBirdLog({ day: 5, n: 2, r: 1, t: 9, m: 3 })).toEqual({ day: 5, n: 2, r: 1, t: 9, m: 3 });
    expect(cleanBirdLog({ day: -1, n: 'x', t: 0, m: 1e12 })).toBeUndefined();
    expect(cleanBirdLog({ day: 5, n: 1.9, r: -2, t: 3, m: 1 << 20 })).toEqual({ day: 5, n: 1, r: 0, t: 3, m: 0 });   // 越界的位被去掉
    expect(cleanBirdLog(null)).toBeUndefined(); expect(cleanBirdLog('x')).toBeUndefined();
  });
  it('成就：id 以 bird_ 开头、有线索和说明', () => {
    for (const id of ['bird_hello', 'bird_swan', 'bird_all']) { const a = ACHIEVEMENTS.find((x) => x.id === id)!; expect(a, id).toBeTruthy(); expect(a.hint.length).toBeGreaterThan(4); expect(a.desc.length).toBeGreaterThan(4); }
  });
});

describe('湖里的家（固定种子，靠岸的水面）', () => {
  // 一个 60×40 的方形湖，岸边在四周
  const W = 80, H = 60;
  const runs = Array.from({ length: 40 }, (_, i) => [10 + i, 10, 70] as [number, number, number]);
  const mask = new WaterMask(runs, W, H);
  it('确定的；数量对；都在水里、四周 2 格内全是水、4 格内能找到岸；彼此隔开', () => {
    const a = birdHomes(mask), b = birdHomes(mask); expect(a).toEqual(b); expect(a.length).toBe(BIRD_COUNT);
    for (const [x, y] of a) {
      expect(mask.tileWater(Math.floor(x), Math.floor(y))).toBe(true);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(mask.tileWater(Math.floor(x) + dx, Math.floor(y) + dy)).toBe(true);
      let shore = false; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!mask.tileWater(Math.floor(x) + dx, Math.floor(y) + dy)) shore = true;
      expect(shore).toBe(true);
    }
    for (let i = 0; i < a.length; i++) for (let j = 0; j < i; j++) expect(Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1])).toBeGreaterThan(3);
  });
  it('没有水就没有家', () => { expect(birdHomes(new WaterMask([], 10, 10))).toEqual([]); });
  const file = join(GEN, 'world.json');
  const world = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  it.skipIf(!world)('真实地图上：9 个家都在精工湖里、彼此隔开 ≥ 10 格', () => {
    const lake = lakeMask(world.waterRuns, world.width, world.height, world.pois)!, h = birdHomes(lake);
    expect(h.length).toBe(BIRD_COUNT);
    for (const [x, y] of h) expect(lake.tileWater(Math.floor(x), Math.floor(y))).toBe(true);
    for (let i = 0; i < h.length; i++) for (let j = 0; j < i; j++) expect(Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1])).toBeGreaterThanOrEqual(10);
  });
});
