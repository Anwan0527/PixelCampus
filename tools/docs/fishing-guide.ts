/**
 * 钓鱼攻略（玩家手册）生成器：手写的叙述在 docs/guide/FISHING_GUIDE.template.md，里面的 {{table:xxx}} / {{v:xxx}}
 * 占位符由这里根据 src/shared 里的真实规则（鱼表、概率、装备、配方、等级、价格……）生成——改了数值只要重新生成，手册不会过期。
 *   npm run guide        重新生成 docs/FISHING_GUIDE.md
 *   npm test             tests/fishing-guide.test.ts 会检查 docs/FISHING_GUIDE.md 是不是最新的
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FISH, FISHING, FISH_FEED_GAIN, LAKE_FISH, MOVE_NAMES, MYTHIC_FISH, TIER_TOTAL, BOX_FISH, RARITY_NAMES, diffStars, fishWeight, habitat, type FishDef, type Rarity } from '../../src/shared/fishing';
import { BAITS, RODS, TACKLES, BAR_MAX, LUCK_MAX, TREASURE_MAX, WAIT_MIN, MAX_TACKLE, type RodDef } from '../../src/shared/gear';
import { BOXES, boxOdds } from '../../src/shared/boxes';
import { RECIPES, type CraftNeed } from '../../src/shared/craft';
import { BUNDLES, MILESTONES } from '../../src/shared/fishdex';
import { LEVEL_ACH, MAX_LEVEL, RECIPE_LEVEL, ROUTE_NAMES, SELL_BONUS_MAX, XP_BASE, XP_OVER_RATE, XP_SOFT_CAP, barBonus, cumXp, levelReward, newSpeciesXp, routeSlots } from '../../src/shared/fishlevel';
import { FISH_BASE, fishPrice } from '../../src/shared/economy';
import { itemDef } from '../../src/shared/items';
import { mythicProgress } from '../../src/shared/mythic';
import { PROTECTED, releaseReward } from '../../src/shared/release';
import { FESTIVALS } from '../../src/shared/calendar';
import { SEASONS, SEASON_NAME, SEASON_DAYS, WEATHER_SLOT_MS } from '../../src/shared/season';
import { TRADE_BLOCKED_NOTE } from './trade-note';

const name = (id: string) => itemDef(id)?.name ?? id;
const pct = (p: number) => (p >= 0.1 ? `${(p * 100).toFixed(p >= 0.1 ? 1 : 2)}%` : p >= 0.001 ? `${(p * 100).toFixed(2)}%` : p > 0 ? `${(p * 100).toFixed(3)}%` : '—');
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const gainText = (g: { id: string; n: number }[]) => g.map((x) => `${name(x.id)} ×${x.n}`).join('、');
const needText = (n: CraftNeed) => ('id' in n ? `${name(n.id)} ×${n.n}` : `${{ junk: '杂物', small: '小鱼（麦穗鱼/鳑鲏/白条/河虾）', rare: '稀有鱼', same: '同种的鱼（常见/少见/稀有）' }[n.group]} ×${n.n}`);

// ---------------------------------------------------------------- 表格
function tierTable() {
  const sum = Object.values(TIER_TOTAL).reduce((a, b) => a + b, 0);
  return table(['稀有度', '每杆出这一档的概率*', '这一档共几种', '收购价（基础）', '钓到得经验', '喂猫好感', '难度'],
    (['common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[]).map((r) => [RARITY_NAMES[r], pct(TIER_TOTAL[r] / sum), LAKE_FISH.filter((f) => f.rarity === r).length, `${FISH_BASE[r]} 币`, `${XP_BASE[r]}`, `+${FISH_FEED_GAIN[r as Exclude<Rarity, 'junk'>]}`, stars({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[r as 'common'])])
      .concat([['杂物', pct(TIER_TOTAL.junk / sum), '4 种', '1 币', '0', '—', '—'], [RARITY_NAMES.mythic, '条件满足才会出现', MYTHIC_FISH.length, `${FISH_BASE.mythic} 币`, `${XP_BASE.mythic}`, `+${FISH_FEED_GAIN.mythic}`, stars(5)]]));
}
function envOf(season: (typeof SEASONS)[number]) { return { night: false, rain: false, season }; }
function fishRows(rar: Rarity) {
  const all = LAKE_FISH.filter((f) => f.rarity !== 'junk');
  const total = (env: ReturnType<typeof envOf>) => FISH.reduce((a, f) => a + fishWeight(f, env), 0);
  const tot = Object.fromEntries(SEASONS.map((s) => [s, total(envOf(s))]));
  return table(['鱼', '春', '夏', '秋', '冬', '夜里', '雨天', '个头', '最重', '收购价', '游法', '难度'],
    all.filter((f) => f.rarity === rar).map((f) => [f.name + (PROTECTED[f.id] ? '🛡' : ''), ...SEASONS.map((s) => pct(fishWeight(f, envOf(s)) / tot[s])), mulText(f.night), mulText(f.rain), `${f.minCm}–${f.maxCm} cm`, f.maxKg !== undefined ? `${f.maxKg} kg` : '', `${fishPrice(f)} 币`, f.move ? MOVE_NAMES[f.move] : '', stars(diffStars(f))]));
}
function mulText(m?: number) { return m === undefined || m === 1 ? '—' : m === 0 ? '不出现' : m > 1 ? `×${m}` : `×${m}（少）`; }
function mythicTable() {
  const ctx = { night: false, rain: false, season: 'spring' as const, rod: '', bait: '', log: {} };
  return table(['神话鱼', '出现条件（全部满足才会出现）', '满足条件时每杆概率*', '个头', '收购价', '特点'], MYTHIC_FISH.map((f) => {
    const n = f.needs!, env = { night: !!n.night, rain: !!n.rain, season: n.seasons?.[0] ?? ('spring' as const), mythic: (x: FishDef) => x.id === f.id };
    const p = fishWeight(f, env) / FISH.reduce((a, x) => a + fishWeight(x, env), 0);
    return [f.name, mythicProgress(f, ctx).map((c) => c.text.replace(/（已 \d+）/, '')).join('；'), pct(p), `${f.minCm}–${f.maxCm} cm`, `${fishPrice(f)} 币`, [f.burst ? '中途会发力猛窜' : '', f.barMul && f.barMul < 1 ? `绿条更短（×${f.barMul}）` : '', f.blurb ?? ''].filter(Boolean).join('；')];
  }));
}
function boxFishTable() { return table(['盲盒限定鱼', '稀有度', '个头', '收购价'], BOX_FISH.map((f) => [f.name, RARITY_NAMES[f.rarity], `${f.minCm}–${f.maxCm} cm`, `${fishPrice(f)} 币`])); }
function rodTable() {
  const perk = (r: RodDef) => r.eff;
  return table(['鱼竿', '咬钩时间', '稀有运气', '配件槽', '特点', '怎么得到'], RODS.map((r) => [r.name, `×${r.wait}`, `×${r.luck}`, r.slots, perk(r), r.how]));
}
function baitTable() { return table(['鱼饵', '特点', '怎么得到'], BAITS.map((b) => [b.name, b.eff, b.how])); }
function tackleTable() { return table(['配件', '效果', '怎么得到'], TACKLES.map((t) => [t.name, t.eff, t.how])); }
function recipeTable() { return table(['配方', '材料', '产物', '要多少币', '钓鱼等级'], RECIPES.map((r) => [r.name, r.needs.map(needText).join(' + '), `${name(r.out.id)} ×${r.out.n}`, r.coins ? `${r.coins}` : '—', `${r.minLevel} 级`])); }
function boxTable() {
  return BOXES.map((b) => `**${b.name}**（钓到鱼时额外钓到的基础概率约 ${(b.rate * 100).toFixed(2)}%${b.pity ? `；保底：连续 ${b.pity - 1} 个没开出珍品，下一个必出` : '；没有保底'}）\n\n` + table(['可能开出', '概率'], boxOdds(b.id).map((o) => [`${o.gem ? '★ ' : ''}${o.label}`, `${o.pct}%`]))).join('\n\n');
}
function levelTable() {
  const rows: (string | number)[][] = [];
  for (let lv = 1; lv <= MAX_LEVEL; lv++) {
    const r = levelReward(lv), unlock: string[] = [];
    if (lv === 5 || lv === 10) unlock.push(`解锁第 ${routeSlots(lv)} 个路线槽`);
    if ([4, 8, 14, 22].includes(lv)) unlock.push(`拉鱼绿条 +${Math.round(barBonus(lv) * 100)}%`);
    for (const [k, v] of Object.entries(RECIPE_LEVEL)) if (v === lv && lv > 1) unlock.push(`解锁配方「${RECIPES.find((x) => x.id === k)?.name ?? k}」`);
    if (LEVEL_ACH[lv]) unlock.push('成就 + 称号');
    rows.push([lv, lv === 1 ? 0 : cumXp(lv), lv === 1 ? '—' : `${r.coins} 币 + ${gainText(r.items)}`, unlock.join('；') || '']);
  }
  return table(['等级', '累计经验', '升到这一级的奖励', '解锁'], rows);
}
function bundleTable() { return table(['册页', '要集齐', '奖励'], BUNDLES.map((b) => [b.name, b.kind === 'big' ? b.desc : b.fish.map(name).join('、'), `${b.reward.coins} 币 + ${gainText(b.reward.items)}`])); }
function protectedTable() { return table(['保护动物', '放生奖励', '科普'], Object.entries(PROTECTED).map(([id, text]) => { const r = releaseReward(id)!; return [name(id), `${r.coins} 币 + ${r.xp} 经验`, text]; })); }
function festivalTable() { return table(['节日', '时间（游戏日历）', '福利', '限定装扮'], FESTIVALS.map((f) => [`${f.icon} ${f.name}`, `${SEASON_NAME[f.season]}季第 ${f.from}–${f.from + 1} 天`, f.buff.text, f.costume.name])); }
function xpTable() { return table(['稀有度', '基础经验', '第一次钓到这个种类的额外经验'], (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as Rarity[]).map((r) => [RARITY_NAMES[r], XP_BASE[r], r === 'mythic' ? 200 : Math.max(5, XP_BASE[r] * 2)])); }
void newSpeciesXp;

const TABLES: Record<string, () => string> = {
  tiers: tierTable,
  'fish:common': () => fishRows('common'), 'fish:uncommon': () => fishRows('uncommon'), 'fish:rare': () => fishRows('rare'), 'fish:epic': () => fishRows('epic'), 'fish:legendary': () => fishRows('legendary'),
  mythic: mythicTable, boxfish: boxFishTable, rods: rodTable, baits: baitTable, tackles: tackleTable, recipes: recipeTable, boxes: boxTable, levels: levelTable, bundles: bundleTable,
  milestones: () => table(['钓到的种类数', '成就'], MILESTONES.map((m) => [`${m.n} 种`, m.name])), protected: protectedTable, festivals: festivalTable, xp: xpTable,
};
const mins = (ms: number) => Math.round(ms / 60000);
const VALUES: Record<string, string | number> = {
  BITE_MIN: FISHING.BITE_MIN_MS / 1000, BITE_MAX: FISHING.BITE_MAX_MS / 1000, REEL_WINDOW: FISHING.REEL_WINDOW_MS / 1000, IDLE_MAX: FISHING.IDLE_MAX_MS / 1000,
  XP_CAP: XP_SOFT_CAP, XP_OVER: `${Math.round(XP_OVER_RATE * 100)}%`, MAX_LEVEL, LV10: cumXp(10), LV30: cumXp(30), SELL_MAX: `${Math.round(SELL_BONUS_MAX * 100)}%`,
  WAIT_MIN, LUCK_MAX, TREASURE_MAX, BAR_MAX, MAX_TACKLE, SEASON_DAYS, SEASON_HOURS: SEASON_DAYS * 20 / 60, WX_MIN: mins(WEATHER_SLOT_MS), FISH_COUNT: FISH.filter((f) => f.rarity !== 'junk').length, LAKE_COUNT: LAKE_FISH.filter((f) => f.rarity !== 'junk').length,
  BOX_FISH: BOX_FISH.length, MYTHIC_COUNT: MYTHIC_FISH.length, TRADE_BLOCKED: TRADE_BLOCKED_NOTE,
};

/** 读模板，替换占位符，返回最终的 Markdown */
export function buildGuide(root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')): string {
  const tpl = readFileSync(join(root, 'docs', 'guide', 'FISHING_GUIDE.template.md'), 'utf8');
  const out = tpl.replace(/\{\{table:([\w:]+)\}\}/g, (_m, k: string) => { const t = TABLES[k]; if (!t) throw new Error(`手册模板里有未知的表格占位符：${k}`); return t(); })
    .replace(/\{\{v:(\w+)\}\}/g, (_m, k: string) => { if (!(k in VALUES)) throw new Error(`手册模板里有未知的数值占位符：${k}`); return String(VALUES[k]); });
  return `<!-- 本文件由 npm run guide 根据 docs/guide/FISHING_GUIDE.template.md 和 src/shared 的真实规则生成，请不要直接改它；要改叙述改模板，要改数值改规则。 -->\n\n${out.trimEnd()}\n`;
}
