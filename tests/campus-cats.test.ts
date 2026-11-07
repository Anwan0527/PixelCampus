import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEN } from '../tools/paths.ts';
import { WorldMap } from '../src/world/WorldMap';
import {
  BOND_LEVEL, CAT_COUNT, CAT_LEASH, CAT_REACH, CAT_SERVER_REACH, COAT_LABELS, COAT_NAMES, COAT_RARITY, GIFT_DAILY_CAP, HUG_LEVEL, LEVEL_AT, LEVEL_NAMES, LEVEL_PERKS,
  NEW_CAT_COUNT, REAL_CAT_COUNT, REAL_CAT_FIRST, TAME_AT, allCats, catLevel, cleanCatX, dailyBond, isRealCat,
} from '../src/shared/cats';
import { ALL_REAL_IDS, GIFT_CHANCE, GIFT_TABLE, LEVEL_UP_GIFTS, REAL_CATS, catProfile, groupIds, isLiked, likesKnown, metAll, metCount, pickGift, petLine, realCatOf, storiesUnlocked } from '../src/shared/cat-lore';
import { GROUP_NAMES } from '../src/shared/campus-cats';
import { ACHIEVEMENTS } from '../src/shared/achievements';
import { TITLES } from '../src/shared/titles';
import { isItemId, itemDef } from '../src/shared/items';

const pts: [number, number][] = Array.from({ length: 640 }, (_, i) => [10 + (i % 32) * 20, 10 + Math.floor(i / 32) * 25]);
const file = join(GEN, 'world.json');
const world = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

describe('校猫（真猫的像素分身）', () => {
  it('16 只、编号接在第二批毛色猫后面（46 起）；名字不重复、也不和随机猫重名', () => {
    expect(REAL_CAT_COUNT).toBe(16); expect(REAL_CAT_FIRST).toBe(CAT_COUNT + 4 + NEW_CAT_COUNT); expect(REAL_CAT_FIRST).toBe(46);
    const cats = allCats(pts);
    expect(cats.length).toBe(REAL_CAT_FIRST + REAL_CAT_COUNT);
    expect(cats.map((c) => c.id)).toEqual(cats.map((_, i) => i));
    expect(new Set(cats.map((c) => c.name)).size).toBe(cats.length);
    for (let i = 0; i < REAL_CAT_COUNT; i++) { const c = cats[REAL_CAT_FIRST + i]; expect(c.name).toBe(REAL_CATS[i].name); expect(isRealCat(c.id)).toBe(true); expect(realCatOf(c.id)).toBe(REAL_CATS[i]); }
    expect(isRealCat(REAL_CAT_FIRST - 1)).toBe(false); expect(isRealCat(REAL_CAT_FIRST + REAL_CAT_COUNT)).toBe(false);
    expect(allCats([])).toEqual([]);
  });
  it('老猫不受影响：前 46 只的编号、毛色、位置跟加校猫之前一样（只是后面多了 16 只）', () => {
    const cats = allCats(pts);
    expect(cats.slice(CAT_COUNT, CAT_COUNT + 4).map((c) => c.coat)).toEqual([2, 1, 3, 0]);
    expect(cats.slice(CAT_COUNT + 4, REAL_CAT_FIRST).map((c) => c.coat)).toEqual(Array.from({ length: NEW_CAT_COUNT }, (_, k) => 6 + k));
    expect(cats.slice(0, CAT_COUNT).every((c) => c.coat < 6)).toBe(true);
  });
  it('档案数据完整：毛色合法、4 段故事、2 句口头禅、爱吃的是真实存在的物品、分组有名字', () => {
    for (const c of REAL_CATS) {
      expect(c.coat, c.name).toBeGreaterThanOrEqual(0); expect(c.coat, c.name).toBeLessThan(COAT_NAMES.length);
      expect(c.stories.length).toBe(4); expect(c.quips.length).toBe(2);
      for (const t of [...c.stories, ...c.quips, c.look, c.place, c.trait]) expect(t.length, c.name).toBeGreaterThan(3);
      expect(c.likes.length).toBeGreaterThan(0); for (const l of c.likes) expect(isItemId(l), `${c.name} 的最爱 ${l}`).toBe(true);
      expect(GROUP_NAMES[c.group]).toBeTruthy();
    }
  });
  it('校猫的分组：一A 5 只、三B 3 只、一B / 一餐旁各 2 只、十字路口 / 四A·四B…；groupIds 与 metAll 对得上', () => {
    expect(groupIds('d1a').length).toBe(5); expect(groupIds('d3b').length).toBe(3); expect(groupIds('d1b').length).toBe(2); expect(groupIds('canteen').length).toBe(2);
    expect(ALL_REAL_IDS.length).toBe(16);
    const aff: Record<string, number> = {}; for (const i of groupIds('d1a')) aff[i] = 1;
    expect(metAll(groupIds('d1a'), aff)).toBe(true); expect(metAll(groupIds('d3b'), aff)).toBe(false); expect(metAll(ALL_REAL_IDS, aff)).toBe(false);
    expect(metCount(aff)).toBe(5);
  });
  it('毛色表：24 种；标签、稀有度、名字栏长度一致', () => {
    expect(COAT_NAMES.length).toBe(24); expect(COAT_LABELS.length).toBe(24); expect(COAT_RARITY.length).toBe(24);
  });
  it.skipIf(!world)('真实地图上：校猫的家都在可走的地方、彼此隔开、离随机猫远、在对应的楼附近', () => {
    const map = new WorldMap(world), cats = allCats(world.npcSpawns), real = cats.slice(REAL_CAT_FIRST), old = cats.slice(0, REAL_CAT_FIRST);
    expect(real.length).toBe(16);
    for (const c of real) expect(map.boxBlocked(c.hx, c.hy), `校猫 ${c.name} 的家被挡住了`).toBe(false);
    for (const c of real) for (const o of real) if (o.id < c.id) expect(Math.hypot(o.hx - c.hx, o.hy - c.hy), `${c.name} 和 ${o.name} 挤在一起`).toBeGreaterThan(2.5 * 16);
    for (const c of real) expect(old.filter((o) => Math.hypot(o.hx - c.hx, o.hy - c.hy) < 6 * 16).length, `校猫 ${c.name} 离别的猫太近`).toBe(0);
    const pub1 = world.buildings.find((x: { name: string }) => x.name === '第一公共教学楼').bbox; // 夜骑在"基础一西边的十字路口"：基础一的西侧、南北范围之内
    const yq = real[0]; expect(yq.hx / 16, '夜骑应在基础一西边').toBeLessThan(pub1.x); expect(yq.hx / 16).toBeGreaterThan(pub1.x - 12); expect(yq.hy / 16).toBeGreaterThan(pub1.y); expect(yq.hy / 16).toBeLessThan(pub1.y + pub1.h);
    // 其余的猫：离对应那栋楼（按名字匹配，编译后的楼 id 和源数据不一样）最近的门不超过若干格
    const near: Record<string, [string, number]> = { canteen: ['第一学生食堂', 16], d1a: ['一社区A楼', 16], d1b: ['一社区B楼', 12], d4a: ['四社区A楼', 20], d4b: ['四社区B楼', 14], d3b: ['三社区B楼', 16] };
    for (let i = 1; i < REAL_CATS.length; i++) {
      const [name, r] = near[REAL_CATS[i].group], doors = world.buildings.filter((x: { name: string }) => x.name === name).flatMap((x: { doors: { x: number; y: number; w: number }[] }) => x.doors);
      expect(doors.length, name).toBeGreaterThan(0);
      const best = Math.min(...doors.map((dd: { x: number; y: number; w: number }) => Math.hypot(real[i].hx / 16 - (dd.x + dd.w / 2), real[i].hy / 16 - dd.y)));
      expect(best, `${REAL_CATS[i].name} 离 ${name} 太远`).toBeLessThan(r);
    }
  });
});

describe('好感度 7 档与新规则的常量', () => {
  it('7 档：数值、名字、说明一一对应；亲密可跟随、挚友可抱抱/收服；收服门槛仍是 80', () => {
    expect(LEVEL_AT).toEqual([0, 4, 12, 30, 80, 200, 500]);
    expect(LEVEL_NAMES).toEqual(['陌生', '眼熟', '熟悉', '亲密', '挚友', '知己', '家人']);
    expect(LEVEL_PERKS.length).toBe(7);
    expect(LEVEL_NAMES[BOND_LEVEL]).toBe('亲密'); expect(LEVEL_NAMES[HUG_LEVEL]).toBe('挚友'); expect(TAME_AT).toBe(80);
    expect([0, 3, 4, 11, 12, 29, 30, 79, 80, 199, 200, 499, 500, 9999].map(catLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it('每日探望加成：第 1 天 +2，之后每满 3 天多 +1，最多 +5', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10, 30].map(dailyBond)).toEqual([2, 2, 2, 3, 3, 3, 4, 5, 5]);
  });
  it('牵绳与够得着的距离：服务器的距离一定比"猫离家最远 + 玩家够得着"更宽，才不会出现面板开了却被说离得太远', () => {
    expect(CAT_SERVER_REACH).toBeGreaterThanOrEqual(CAT_LEASH + CAT_REACH);
    expect(CAT_LEASH).toBeGreaterThan(48); // 比游走半径大，被吓跑也不会立刻超出
  });
  it('回礼表：每一档的物品都存在、概率与档位对齐、一天上限 6；亲密以下不送', () => {
    expect(GIFT_CHANCE.length).toBe(LEVEL_AT.length); expect(GIFT_DAILY_CAP).toBe(6);
    for (const [lv, t] of Object.entries(GIFT_TABLE)) for (const e of t) { expect(itemDef(e.gain.id), `档位 ${lv} 的 ${e.gain.id}`).toBeTruthy(); expect(e.gain.n).toBeGreaterThan(0); expect(e.w).toBeGreaterThan(0); }
    for (const [lv, g] of Object.entries(LEVEL_UP_GIFTS)) for (const x of g) expect(itemDef(x.id), `升到 ${lv} 档的 ${x.id}`).toBeTruthy();
    for (let lv = 0; lv < 3; lv++) { expect(GIFT_CHANCE[lv]).toBe(0); expect(pickGift(lv, 0.5)).toBeNull(); }
    for (let lv = 3; lv <= 6; lv++) { expect(pickGift(lv, 0)).toBeTruthy(); expect(pickGift(lv, 0.999)).toBeTruthy(); expect(GIFT_CHANCE[lv]).toBeGreaterThan(0); }
    expect(GIFT_CHANCE[6]).toBe(1);
  });
  it('回礼随档位变好：挚友以上才有盲盒，家人档有龙鳞和神话饵（钓鱼联动）', () => {
    const ids = (lv: number) => new Set(GIFT_TABLE[lv].map((e) => e.gain.id));
    expect(ids(3).has('box_bottle')).toBe(false); expect(ids(4).has('box_bottle')).toBe(true); expect(ids(5).has('box_crate')).toBe(true);
    expect(ids(6).has('dragon_scale')).toBe(true); expect(ids(6).has('bait_myth')).toBe(true); expect(ids(5).has('bait_myth')).toBe(false);
  });
  it('pickGift 是确定的、按权重分：同一个随机数得到同一份礼物；返回的是拷贝', () => {
    const a = pickGift(6, 0.3)!, b = pickGift(6, 0.3)!;
    expect(a).toEqual(b); a.n = 99; expect(pickGift(6, 0.3)!.n).not.toBe(99);
  });
});

describe('档案与口味', () => {
  it('校猫用手写档案、其他猫有通用档案；故事按档位解锁；口味到「熟悉」或喂到过最爱才告诉你', () => {
    const real = allCats(pts)[REAL_CAT_FIRST], gen = allCats(pts)[3];
    const p = catProfile(real), g = catProfile(gen);
    expect(p.real).toBe(true); expect(p.group).toBe(REAL_CATS[0].group); expect(p.stories.length).toBe(4);
    expect(g.real).toBe(false); expect(g.stories.length).toBe(4); expect(g.likes.length).toBe(1); expect(g.group).toBeUndefined();
    expect(catProfile(gen)).toEqual(g); // 确定的
    expect([0, 1, 2, 3, 4, 5, 6].map(storiesUnlocked)).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(likesKnown(0, false)).toBe(false); expect(likesKnown(1, false)).toBe(false); expect(likesKnown(2, false)).toBe(true); expect(likesKnown(0, true)).toBe(true);
    expect(isLiked(real, 'cat_treat')).toBe(true); expect(isLiked(real, 'cat_food')).toBe(false);
  });
  it('摸的话：校猫偶尔说口头禅，随机数大时是通用句；口头禅来自档案', () => {
    const real = allCats(pts)[REAL_CAT_FIRST];
    expect(REAL_CATS[0].quips).toContain(petLine(real, 0.01)); expect(petLine(real, 0.9)).toBe(`${real.name}舒服地眯起了眼睛`);
    expect(petLine(allCats(pts)[0], 0.01)).toBe(`${allCats(pts)[0].name}舒服地眯起了眼睛`);
  });
});

describe('小账本清洗与新成就', () => {
  it('cleanCatX：只留合法编号与正整数，fv 只认 1；坏数据丢掉', () => {
    expect(cleanCatX({ '5': { d: 20000, st: 3, fv: 1, hg: 20000, gf: 19999 }, '999': { d: 1 }, x: { d: 1 }, '6': { d: -1, st: 'a', fv: 2 }, '7': null, '8': { d: 1.9 } })).toEqual({ '5': { d: 20000, st: 3, fv: 1, hg: 20000, gf: 19999 }, '999': { d: 1 }, '8': { d: 1 } });
    expect(cleanCatX(null)).toEqual({}); expect(cleanCatX('x')).toEqual({});
  });
  it('猫相关成就：id 不重复、有线索和说明、发称号的称号存在', () => {
    const cat = ACHIEVEMENTS.filter((a) => a.id.startsWith('cat_'));
    expect(cat.length).toBeGreaterThanOrEqual(16);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of cat) { expect(a.hint.length).toBeGreaterThan(4); expect(a.desc.length).toBeGreaterThan(4); if (a.title) expect(TITLES.some((t) => t.id === a.title), `${a.id} 的称号 ${a.title}`).toBe(true); }
    for (const id of ['cat_hello', 'cat_meet_10', 'cat_meet_30', 'cat_real_all', 'cat_1a', 'cat_3b', 'cat_fav', 'cat_hug', 'cat_night', 'cat_rain', 'cat_streak_7', 'cat_bestie_3', 'cat_bestie_10', 'cat_kin', 'cat_gift_10']) expect(cat.some((a) => a.id === id), id).toBe(true);
  });
});
